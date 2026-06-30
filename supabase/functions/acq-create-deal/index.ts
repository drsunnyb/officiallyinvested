// =============================================================================
// acq-create-deal — multi-channel intake endpoint
// Creates an internally-originated deal (manual entry, paste-a-link, or a
// folder/desktop watcher feeding it). Inserts an origination row into
// public.submissions so it appears on the kanban — EMAIL-SAFE: the seller-email
// automation is neutralised by self-addressing the row, so no vendor is ever
// contacted automatically. Optionally seeds figures + a source link.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const num = (v: unknown) => { const n = Number(v); return isFinite(n) && v !== '' && v != null ? n : null; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const name = (body.name ?? '').toString().trim();
    const type = body.type === 'property' ? 'property' : 'business';
    if (!name) { await sql.end({ timeout: 5 }); return json({ error: 'name required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','from_email')`).map((r: any) => [r.key, r.value]));

    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
      const m = await sql`select 1 from acq.org_members where user_id=${userId} and role in ('owner','admin','analyst') limit 1`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }

    // EMAIL-SAFE: self-address the origination row so the auto seller-email never reaches a vendor.
    const safeEmail = cfg.from_email || 'deals@officiallyinvested.com';
    const row = (await sql`
      insert into public.submissions
        (type, submitter_name, email, phone, submitter_role, heard_via, business_name, spv_name, sector,
         revenue, net_profit, portfolio_value, asking_price, website, notes, consent, marketing_optin, status)
      values
        (${type}, 'Officially Invested (origination)', ${safeEmail}, '', 'other', 'origination',
         ${type === 'business' ? name : null}, ${type === 'property' ? name : null}, ${body.sector ?? null},
         ${num(body.revenue)}, ${num(body.net_profit)}, ${num(body.portfolio_value)}, ${num(body.asking_price)},
         ${body.url ?? null}, ${body.notes ?? null}, true, false, 'reviewing')
      returning id, reference`)[0];

    return json({ ok: true, submission_id: row.id, reference: row.reference });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
