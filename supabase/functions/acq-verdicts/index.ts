// acq-verdicts — bulk verdict + score per submission for the org, for the board cards.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = null;
    if (userId) { const m = await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`; orgId = m[0]?.org_id ?? null; }
    else { const o = await sql`select id from acq.organizations order by created_at limit 1`; orgId = o[0]?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ ok: true, verdicts: [] }); }

    const rows = await sql`
      select d.submission_id,
        (select v.verdict from acq.committee_verdicts v where v.deal_id=d.id order by v.created_at desc limit 1) as verdict,
        (select a.score from acq.analyses a where a.deal_id=d.id order by a.created_at desc limit 1) as score
      from acq.deals d
      where d.org_id=${orgId} and d.submission_id is not null`;
    const verdicts = rows.filter((r: any) => r.verdict || r.score != null);
    return json({ ok: true, verdicts });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
