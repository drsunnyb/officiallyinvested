// acq-gmail-auth — Gmail OAuth for a tenant: connect an inbox so deal emails
// are pulled in automatically (read-only). POST actions: start / status /
// disconnect (member JWT). GET with ?code&state = Google's redirect (callback).
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const htmlPage = (msg: string) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><body style="background:#0A2540;color:#fff;font-family:system-ui;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center"><div><div style="font-size:42px">✓</div><h2 style="color:#FFD700;font-weight:600">${msg}</h2><p style="opacity:.7">You can close this tab and return to Officially Invested.</p><a href="/admin/settings" style="color:#FFD700">Back to settings</a></div></body>`, { headers: { 'Content-Type': 'text/html' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('google_client_id','google_client_secret','google_redirect_uri','acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const REDIRECT = cfg.google_redirect_uri || (url.origin + url.pathname);

    // ---------- GOOGLE CALLBACK (GET ?code&state) ----------
    if (req.method === 'GET' && url.searchParams.get('code')) {
      const code = url.searchParams.get('code')!;
      const state = url.searchParams.get('state') || '';
      const st = (await sql`select org_id, user_id from acq.oauth_states where state=${state}`)[0];
      await sql`delete from acq.oauth_states where state=${state} or created_at < now() - interval '1 hour'`;
      if (!st) { await sql.end({ timeout: 5 }); return htmlPage('Link expired, please try again'); }
      const tr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
      const tok = await tr.json();
      if (!tr.ok || !tok.access_token) { await sql.end({ timeout: 5 }); return htmlPage('Could not connect Gmail'); }
      let email = '';
      try { const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: 'Bearer ' + tok.access_token } }); email = (await pr.json()).emailAddress || ''; } catch (_) { /**/ }
      const expires = new Date(Date.now() + (tok.expires_in ?? 3500) * 1000);
      await sql`insert into acq.email_accounts (org_id, user_id, provider, email, refresh_token, access_token, token_expires_at, scope, status)
        values (${st.org_id}, ${st.user_id}, 'gmail', ${email}, ${tok.refresh_token ?? null}, ${tok.access_token}, ${expires}, ${tok.scope ?? SCOPE}, 'connected')
        on conflict (org_id, email) do update set refresh_token=coalesce(excluded.refresh_token, acq.email_accounts.refresh_token), access_token=excluded.access_token, token_expires_at=excluded.token_expires_at, status='connected', last_error=null`;
      await sql.end({ timeout: 5 });
      return htmlPage('Gmail connected');
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

    if (action === 'start') {
      if (!cfg.google_client_id || !cfg.google_client_secret) { await sql.end({ timeout: 5 }); return json({ ok: false, configured: false, error: 'Gmail connection is not configured yet. An admin needs to add the Google OAuth credentials.' }); }
      const state = crypto.randomUUID().replace(/-/g, '') + Math.random().toString(36).slice(2, 8);
      await sql`insert into acq.oauth_states (state, org_id, user_id) values (${state}, ${orgId}, ${userId})`;
      const auth = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: cfg.google_client_id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
      return json({ ok: true, configured: true, url: auth });
    }
    if (action === 'disconnect') {
      await sql`delete from acq.email_accounts where org_id=${orgId} ${body.email ? sql`and email=${body.email}` : sql``}`;
      return json({ ok: true });
    }
    // status
    const accounts = await sql`select email, status, last_synced_at, last_error, created_at from acq.email_accounts where org_id=${orgId} order by created_at`;
    return json({ ok: true, configured: !!(cfg.google_client_id && cfg.google_client_secret), accounts });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
