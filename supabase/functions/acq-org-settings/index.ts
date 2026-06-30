// acq-org-settings — read/update the firm's thesis & buy-box profile (org.settings jsonb).
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
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }

    let orgId: string | null = null; let role: string | null = null;
    if (userId) { const m = (await sql`select org_id, role from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; role = m?.role ?? null; }
    else { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; role = 'owner'; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    if (body.action === 'set') {
      if (!(role === 'owner' || role === 'admin')) { await sql.end({ timeout: 5 }); return json({ error: 'admin only' }, 403); }
      const incoming = body.settings && typeof body.settings === 'object' ? body.settings : {};
      const cur = (await sql`select settings from acq.organizations where id=${orgId}`)[0]?.settings ?? {};
      const merged = { ...cur, ...incoming };
      await sql`update acq.organizations set settings=${sql.json(merged)} where id=${orgId}`;
      return json({ ok: true, settings: merged });
    }

    const org = (await sql`select name, settings from acq.organizations where id=${orgId}`)[0];
    return json({ ok: true, org_name: org?.name, role, settings: org?.settings ?? {} });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
