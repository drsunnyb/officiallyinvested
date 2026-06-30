// acq-gmail-sync — pull recent Gmail for connected accounts, match each message
// to a deal by its participants (a deal contact's email), and log it onto the
// deal's correspondence. Run by pg_cron (x-acq-secret, all accounts) or per-org.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailsOf = (s: string) => Array.from(String(s || '').matchAll(/[\w.+-]+@[\w.-]+\.[\w.-]+/g)).map((m) => m[0].toLowerCase());

async function freshToken(sql: any, acc: any, cfg: any) {
  if (acc.access_token && acc.token_expires_at && new Date(acc.token_expires_at).getTime() > Date.now() + 60000) return acc.access_token;
  if (!acc.refresh_token) throw new Error('no refresh token');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, refresh_token: acc.refresh_token, grant_type: 'refresh_token' }) });
  const t = await r.json();
  if (!r.ok || !t.access_token) throw new Error('refresh failed');
  const exp = new Date(Date.now() + (t.expires_in ?? 3500) * 1000);
  await sql`update acq.email_accounts set access_token=${t.access_token}, token_expires_at=${exp} where id=${acc.id}`;
  return t.access_token;
}

async function syncAccount(sql: any, acc: any, cfg: any) {
  let token: string;
  try { token = await freshToken(sql, acc, cfg); } catch (e) { await sql`update acq.email_accounts set status='error', last_error=${String(e)} where id=${acc.id}`; return { account: acc.email, logged: 0, error: String(e) }; }
  const auth = { Authorization: 'Bearer ' + token };
  const days = acc.last_synced_at ? 2 : 14;
  const list = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=30&q=' + encodeURIComponent('newer_than:' + days + 'd -in:spam -category:promotions'), { headers: auth });
  const lj = await list.json();
  const ids = (lj.messages ?? []).map((m: any) => m.id);
  let logged = 0;
  for (const id of ids) {
    try {
      const mr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/' + id + '?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID', { headers: auth });
      const mj = await mr.json();
      const H: Record<string, string> = {};
      for (const h of (mj.payload?.headers ?? [])) H[h.name.toLowerCase()] = h.value;
      const participants = Array.from(new Set([...emailsOf(H['from']), ...emailsOf(H['to']), ...emailsOf(H['cc'])])).filter((e) => e !== (acc.email || '').toLowerCase());
      if (!participants.length) continue;
      const deal = (await sql`select dc.deal_id, c.id as contact_id from acq.deal_contacts dc join acq.contacts c on c.id=dc.contact_id join acq.deals d on d.id=dc.deal_id where d.org_id=${acc.org_id} and lower(c.email) = any(${participants}) order by d.created_at desc limit 1`)[0];
      if (!deal) continue;
      const fromAddr = emailsOf(H['from'])[0] || '';
      const direction = fromAddr && fromAddr === (acc.email || '').toLowerCase() ? 'out' : 'in';
      const when = H['date'] ? new Date(H['date']) : new Date();
      const ext = H['message-id'] || ('gmail-' + id);
      const row = (await sql`insert into acq.communications (org_id, deal_id, contact_id, kind, direction, subject, body, from_addr, to_addr, external_id, happened_at)
        values (${acc.org_id}, ${deal.deal_id}, ${deal.contact_id}, 'email', ${direction}, ${H['subject'] || '(no subject)'}, ${mj.snippet || ''}, ${fromAddr}, ${H['to'] || ''}, ${ext}, ${isNaN(when.getTime()) ? new Date() : when})
        on conflict (org_id, external_id) where external_id is not null do nothing returning id`)[0];
      if (row) logged++;
    } catch (_) { /* skip message */ }
  }
  await sql`update acq.email_accounts set last_synced_at=now(), status='connected', last_error=null where id=${acc.id}`;
  return { account: acc.email, scanned: ids.length, logged };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('google_client_id','google_client_secret','acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    if (!cfg.google_client_id) { await sql.end({ timeout: 5 }); return json({ ok: false, error: 'not configured' }); }
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let orgId: string | null = body.org_id ?? null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      orgId = (await sql`select org_id from acq.org_members where user_id=${data.user.id} order by created_at limit 1`)[0]?.org_id ?? null;
    }
    const accounts = await sql`select * from acq.email_accounts where status <> 'disabled' ${orgId ? sql`and org_id=${orgId}` : sql``} order by last_synced_at nulls first limit ${trusted && !orgId ? 50 : 5}`;
    const results = [];
    for (const acc of accounts) results.push(await syncAccount(sql, acc, cfg));
    return json({ ok: true, accounts: accounts.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
