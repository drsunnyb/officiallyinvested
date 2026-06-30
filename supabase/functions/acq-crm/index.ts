// acq-crm — contacts + follow-up tasks + per-deal people (the system's memory).
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
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','from_email')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'list';

    if (action === 'add_contact') {
      const c = (await sql`insert into acq.contacts (org_id, name, role, company, email, phone, notes) values (${orgId}, ${body.name}, ${body.role ?? null}, ${body.company ?? null}, ${body.email ?? null}, ${body.phone ?? null}, ${body.notes ?? null}) returning *`)[0];
      return json({ ok: true, contact: c });
    }
    if (action === 'add_task') {
      const t = (await sql`insert into acq.tasks (org_id, deal_id, contact_id, title, due_date, created_by) values (${orgId}, ${body.deal_id ?? null}, ${body.contact_id ?? null}, ${body.title}, ${body.due_date ?? null}, ${userId}) returning *`)[0];
      return json({ ok: true, task: t });
    }
    if (action === 'complete_task') {
      await sql`update acq.tasks set status='done', done_at=now() where id=${body.task_id} and org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'add_deal_contact') {
      if (!body.deal_id || !body.name) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id and name required' }, 400); }
      let contact: any = null;
      if (body.email) contact = (await sql`select * from acq.contacts where org_id=${orgId} and email=${body.email} limit 1`)[0] ?? null;
      if (!contact) contact = (await sql`insert into acq.contacts (org_id, name, role, company, email, phone) values (${orgId}, ${body.name}, ${body.role ?? null}, ${body.company ?? null}, ${body.email ?? null}, ${body.phone ?? null}) returning *`)[0];
      await sql`insert into acq.deal_contacts (deal_id, contact_id, role) values (${body.deal_id}, ${contact.id}, ${body.role ?? null}) on conflict (deal_id, contact_id) do update set role=excluded.role`;
      return json({ ok: true, contact });
    }
    if (action === 'deal_contacts') {
      const rows = await sql`select c.id, c.name, c.company, c.email, c.phone, dc.role from acq.deal_contacts dc join acq.contacts c on c.id=dc.contact_id where dc.deal_id=${body.deal_id} order by dc.role`;
      return json({ ok: true, deal_contacts: rows });
    }

    const fromEmail = (cfg.from_email || '').toString();
    await sql`
      insert into acq.contacts (org_id, name, role, company, email)
      select ${orgId}, s.submitter_name, 'vendor', coalesce(s.business_name, s.spv_name), s.email
      from public.submissions s
      where s.email is not null and s.email <> ${fromEmail}
        and coalesce(s.submitter_name,'') not ilike 'Officially Invested%'
        and not exists (select 1 from acq.contacts c where c.org_id=${orgId} and c.email = s.email)
      group by s.submitter_name, s.business_name, s.spv_name, s.email`;

    const contacts = await sql`
      select c.*, (select count(*) from acq.deal_contacts dc where dc.contact_id=c.id) as deal_count,
        (select t.title from acq.tasks t where t.contact_id=c.id and t.status='open' order by t.due_date nulls last, t.created_at limit 1) as next_task
      from acq.contacts c where c.org_id=${orgId} order by c.created_at desc limit 200`;
    const tasks = await sql`
      select t.*, d.name as deal_name, c.name as contact_name, c.role as contact_role
      from acq.tasks t left join acq.deals d on d.id=t.deal_id left join acq.contacts c on c.id=t.contact_id
      where t.org_id=${orgId} and t.status='open' order by t.due_date nulls last, t.created_at limit 100`;
    return json({ ok: true, contacts, tasks });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
