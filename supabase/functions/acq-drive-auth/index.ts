// acq-drive-auth — Google Drive OAuth for a tenant: connect a Drive so the app
// can create the per-deal folder structure and ingest documents dropped into it.
// POST actions: start / status / disconnect / set_root (member JWT or x-acq-secret).
// GET with ?code&state = Google's redirect (callback). Own redirect URI so it can
// live alongside the Gmail connection on the same OAuth client.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const SCOPE = 'https://www.googleapis.com/auth/drive';
const REDIRECT = `${SUPABASE_URL}/functions/v1/acq-drive-auth`;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const htmlPage = (msg: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#0A2540;color:#fff;font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><div><div style="font-size:42px">✓</div><h2 style="color:#FFD700;font-weight:600">${msg}</h2><p style="opacity:.7">You can close this tab and return to Officially Invested.</p><a href="/admin/settings" style="color:#FFD700">Back to settings</a></div></body>`, { headers: { 'Content-Type': 'text/html' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('google_client_id','google_client_secret','acq_internal_secret')`).map((r: any) => [r.key, r.value]));

    // ---------- GOOGLE CALLBACK (GET ?code&state) ----------
    if (req.method === 'GET' && url.searchParams.get('code')) {
      const code = url.searchParams.get('code')!;
      const state = url.searchParams.get('state') || '';
      const st = (await sql`select org_id, user_id from acq.oauth_states where state=${state}`)[0];
      await sql`delete from acq.oauth_states where state=${state} or created_at < now() - interval '1 hour'`;
      if (!st) { await sql.end({ timeout: 5 }); return htmlPage('Link expired, please try again'); }
      const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
      const tok = await tr.json();
      if (!tr.ok || !tok.access_token) { await sql.end({ timeout: 5 }); return htmlPage('Could not connect Google Drive'); }
      let email = '';
      try { const pr = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: { Authorization: 'Bearer ' + tok.access_token } }); email = (await pr.json())?.user?.emailAddress || ''; } catch (_) { /**/ }
      const expires = new Date(Date.now() + (tok.expires_in ?? 3500) * 1000);
      await sql`insert into acq.drive_accounts (org_id, user_id, google_email, refresh_token, access_token, token_expires_at, scope, status, updated_at)
        values (${st.org_id}, ${st.user_id}, ${email}, ${tok.refresh_token ?? null}, ${tok.access_token}, ${expires}, ${tok.scope ?? SCOPE}, 'connected', now())
        on conflict (org_id) do update set google_email=excluded.google_email, refresh_token=coalesce(excluded.refresh_token, acq.drive_accounts.refresh_token), access_token=excluded.access_token, token_expires_at=excluded.token_expires_at, scope=excluded.scope, status='connected', last_error=null, updated_at=now()`;
      await sql.end({ timeout: 5 });
      return htmlPage('Google Drive connected');
    }

    // ---------- AUTHED ACTIONS ----------
    const body = await req.json().catch(() => ({} as any));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = body.org_id ?? null;
    if (!orgId && userId) orgId = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]?.org_id ?? null;
    if (!orgId && trusted) orgId = (await sql`select id from acq.organizations order by created_at limit 1`)[0]?.id ?? null;
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'status';
    const configured = !!(cfg.google_client_id && cfg.google_client_secret);

    if (action === 'start') {
      if (!configured) { await sql.end({ timeout: 5 }); return json({ ok: false, configured: false, error: 'Google connection is not configured yet. An admin needs to add the Google OAuth credentials.' }); }
      const state = crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 8);
      await sql`insert into acq.oauth_states (state, org_id, user_id) values (${state}, ${orgId}, ${userId})`;
      const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: cfg.google_client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
      return json({ ok: true, configured: true, url: auth });
    }
    if (action === 'set_root') {
      await sql`update acq.drive_accounts set root_folder_id=${body.root_folder_id ?? null}, root_folder_name=${body.root_folder_name ?? null}, updated_at=now() where org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'set_kb') {
      await sql`update acq.drive_accounts set kb_folder_id=${body.kb_folder_id ?? null}, kb_folder_name=${body.kb_folder_name ?? null}, updated_at=now() where org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'disconnect') {
      await sql`delete from acq.drive_accounts where org_id=${orgId}`;
      return json({ ok: true });
    }
    // status
    const acc = (await sql`select google_email, status, root_folder_id, root_folder_name, kb_folder_id, kb_folder_name, last_synced_at, last_error, created_at from acq.drive_accounts where org_id=${orgId}`)[0] ?? null;
    const kb_docs = acc ? Number((await sql`select count(*)::int as n from acq.knowledge_docs where org_id=${orgId} and status='done'`)[0]?.n ?? 0) : 0;
    return json({ ok: true, configured, account: acc, kb_docs });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
