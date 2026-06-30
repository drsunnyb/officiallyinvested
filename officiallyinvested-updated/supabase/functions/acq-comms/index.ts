// =============================================================================
// acq-comms — per-deal correspondence (emails / notes / calls) for each tenant.
//   action "list"   -> communications for a deal (newest first)
//   action "add"    -> manually log a note / email / call (member, has_write)
//   INBOUND webhook -> ?ingest=1&secret=<acq_inbound_secret>  (from a mail
//                      provider's inbound parse). Provider-tolerant: Postmark
//                      JSON, SendGrid/Mailgun form, or generic JSON. Resolves
//                      the deal by its alias token (deal-<token>@inbox-domain)
//                      or by matching the sender to a deal contact, files the
//                      email against the deal and upserts the CRM contact.
// Dual auth for list/add: x-acq-secret header OR signed-in member JWT.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOf = (s: string) => (String(s || '').match(/[\w.+-]+@[\w.-]+\.[\w.-]+/) || [''])[0].toLowerCase();

async function parseInbound(req: Request) {
  const ct = req.headers.get('content-type') || '';
  let f: any = {};
  if (ct.includes('application/json')) { f = await req.json().catch(() => ({})); }
  else { const fd = await req.formData().catch(() => null); if (fd) for (const [k, v] of fd.entries()) f[k] = typeof v === 'string' ? v : ''; }
  const get = (...keys: string[]) => { for (const k of keys) if (f[k] != null && f[k] !== '') return f[k]; return ''; };
  const subject = String(get('Subject', 'subject'));
  const text = String(get('TextBody', 'text', 'stripped-text', 'body-plain', 'body'));
  const html = String(get('HtmlBody', 'html', 'body-html'));
  let from: any = get('From', 'from', 'sender', 'FromFull');
  const to = String(get('To', 'to', 'recipient', 'ToFull'));
  const cc = String(get('Cc', 'cc'));
  const messageId = String(get('MessageID', 'Message-Id', 'message-id', 'message_id'));
  const date = String(get('Date', 'date'));
  let env: any = f['envelope']; try { if (typeof env === 'string') env = JSON.parse(env); } catch (_) { env = null; }
  let recips = [to, cc].join(' ');
  if (env?.to) recips += ' ' + (Array.isArray(env.to) ? env.to.join(' ') : env.to);
  if (Array.isArray(f['ToFull'])) recips += ' ' + f['ToFull'].map((x: any) => x.Email).join(' ');
  if (Array.isArray(f['CcFull'])) recips += ' ' + f['CcFull'].map((x: any) => x.Email).join(' ');
  const fromAddr = emailOf(typeof from === 'object' ? (from?.Email || '') : from);
  return { subject, body: text || html || '', fromAddr, recips, to, messageId, date };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','acq_inbound_secret','acq_inbox_domain')`).map((r: any) => [r.key, r.value]));

    // ---------- INBOUND WEBHOOK ----------
    const wantsIngest = url.searchParams.has('ingest') || url.pathname.endsWith('/ingest');
    if (wantsIngest) {
      const secret = url.searchParams.get('secret') || req.headers.get('x-acq-secret') || '';
      if (!cfg.acq_inbound_secret || secret !== cfg.acq_inbound_secret) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      const m = await parseInbound(req);
      // resolve deal: alias token first, then sender match
      const tok = (m.recips.match(/deal-([a-z0-9]{6,})@/i) || [])[1] || null;
      let deal: any = null;
      if (tok) deal = (await sql`select id, org_id from acq.deals where email_token=${tok.toLowerCase()}`)[0] ?? null;
      if (!deal && m.fromAddr) {
        deal = (await sql`select d.id, d.org_id from acq.deals d
          join acq.deal_contacts dc on dc.deal_id=d.id
          join acq.contacts c on c.id=dc.contact_id
          where lower(c.email)=${m.fromAddr} order by d.created_at desc limit 1`)[0] ?? null;
      }
      if (!deal) { await sql.end({ timeout: 5 }); return json({ ok: true, matched: false, reason: 'no deal matched' }); }
      // upsert contact from sender, link to deal
      let contactId: string | null = null;
      if (m.fromAddr) {
        let c = (await sql`select id from acq.contacts where org_id=${deal.org_id} and lower(email)=${m.fromAddr} limit 1`)[0];
        if (!c) c = (await sql`insert into acq.contacts (org_id, name, email, role) values (${deal.org_id}, ${m.fromAddr.split('@')[0]}, ${m.fromAddr}, 'other') returning id`)[0];
        contactId = c.id;
        await sql`insert into acq.deal_contacts (deal_id, contact_id, role) values (${deal.id}, ${contactId}, 'other') on conflict (deal_id, contact_id) do nothing`;
      }
      const happened = m.date ? new Date(m.date) : new Date();
      const row = (await sql`insert into acq.communications (org_id, deal_id, contact_id, kind, direction, subject, body, from_addr, to_addr, external_id, happened_at)
        values (${deal.org_id}, ${deal.id}, ${contactId}, 'email', 'in', ${m.subject || '(no subject)'}, ${m.body}, ${m.fromAddr}, ${m.to}, ${m.messageId || null}, ${isNaN(happened.getTime()) ? new Date() : happened})
        on conflict (org_id, external_id) where external_id is not null do nothing returning id`)[0] ?? null;
      await sql.end({ timeout: 5 });
      return json({ ok: true, matched: true, deal_id: deal.id, logged: !!row });
    }

    // ---------- AUTHED ACTIONS (list / add) ----------
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

    const action = body.action ?? 'list';

    if (action === 'add') {
      if (!body.deal_id) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id required' }, 400); }
      let contactId: string | null = body.contact_id ?? null;
      if (!contactId && body.email) contactId = (await sql`select id from acq.contacts where org_id=${orgId} and lower(email)=${emailOf(body.email)} limit 1`)[0]?.id ?? null;
      const row = (await sql`insert into acq.communications (org_id, deal_id, contact_id, kind, direction, subject, body, from_addr, to_addr, happened_at, created_by)
        values (${orgId}, ${body.deal_id}, ${contactId}, ${body.kind ?? 'note'}, ${body.direction ?? 'internal'}, ${body.subject ?? null}, ${body.body ?? ''}, ${body.from_addr ?? null}, ${body.to_addr ?? null}, ${body.happened_at ?? new Date()}, ${userId})
        returning *`)[0];
      return json({ ok: true, communication: row });
    }

    // list for a deal
    if (!body.deal_id) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id required' }, 400); }
    const rows = await sql`select cm.id, cm.kind, cm.direction, cm.subject, cm.body, cm.from_addr, cm.to_addr, cm.happened_at, c.name as contact_name, c.role as contact_role
      from acq.communications cm left join acq.contacts c on c.id=cm.contact_id
      where cm.deal_id=${body.deal_id} and cm.org_id=${orgId} order by cm.happened_at desc limit 100`;
    return json({ ok: true, communications: rows });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
