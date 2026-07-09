// acq-crm — contacts + follow-up tasks + per-deal people (the system's memory).
// v8: the proper CRM. Adds contact_update (edit fields and notes), meetings
// (meeting_create/meeting_update/meeting_cancel/meetings_list on acq.meetings,
// with a communication logged when a meeting is marked held so it lands in
// deal and contact timelines), a merged timeline on contact_detail
// (communications + meetings + done tasks) and a q search filter on the
// directory. v7: working items parity with the admin drawer. Tasks carry
// meta.kind (next_step/red_flag/clarification/funding/vendor_outstanding/note),
// can be toggled open/done, annotated and deleted. v6: actionable meta.action
// keys + background ai_tasks_cron with branded email nudges.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (x: string) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

const ACTIONS = ['topup_letters', 'topup_ai', 'approve_letters', 'enrol_prospects', 'start_sourcing', 'move_replied_to_pipeline', 'review_dealflow', 'upgrade_plan', 'call_or_manual', 'none'];

// The AI chief of staff: reads the live workspace, writes prioritised tasks
// with an action key the product can execute or route. Shared by the
// user-triggered path and the background cron.
async function generateTasks(sql: any, orgId: string, userId: string | null, ANTHROPIC: string) {
  const campaigns = await sql`select c.name, c.status,
      (select count(*)::int from acq.campaign_members m where m.campaign_id=c.id) as enrolled,
      (select count(*)::int from acq.campaign_members m where m.campaign_id=c.id and m.status='replied') as replied,
      (select count(*)::int from acq.outreach_touches t where t.campaign_id=c.id and t.status='needs_approval') as awaiting_approval,
      (select count(*)::int from acq.outreach_touches t where t.campaign_id=c.id and t.status='sent') as sent
    from acq.campaigns c where c.org_id=${orgId} order by c.created_at desc limit 10`;
  const credits = (await sql`select * from acq.credits where org_id=${orgId}`)[0] ?? null;
  const org = (await sql`select settings->>'plan' as plan from acq.organizations where id=${orgId}`)[0];
  const stages = await sql`select stage, count(*)::int as n from acq.prospects where org_id=${orgId} group by stage`;
  const deals = await sql`select status, count(*)::int as n from acq.deals where org_id=${orgId} group by status`;
  const openTasks = await sql`select title from acq.tasks where org_id=${orgId} and status='open' limit 50`;
  const runs = await sql`select status, count(*)::int as n from acq.sourcing_runs where org_id=${orgId} group by status`;
  const now = new Date(); const reset = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const snapshot = {
    plan: org?.plan ?? 'free',
    credits: credits ? { ai: credits.ai_monthly + credits.ai_topup, letter: credits.letter_monthly + credits.letter_topup } : { ai: 0, letter: 0 },
    monthly_allowance_resets: reset.toISOString().slice(0, 10),
    campaigns, prospect_stages: Object.fromEntries(stages.map((x: any) => [x.stage, x.n])),
    pipeline_deals: Object.fromEntries(deals.map((x: any) => [x.status, x.n])),
    sourcing_runs: Object.fromEntries(runs.map((x: any) => [x.status, x.n])),
    existing_open_tasks: openTasks.map((t: any) => t.title),
  };
  const ar = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 900,
      system: 'You are the operations chief of staff for a UK acquisition entrepreneur using the Officially Invested Investor OS. From the workspace snapshot, write the 2-5 highest-leverage tasks for the next two weeks. Rules: concrete and imperative, one action each, plain UK English, no em dashes, no AI tells. Never duplicate or paraphrase an existing open task. Think about: approvals sitting unactioned (letters cannot post without approval and each uses a letter credit); credits running low versus the reset date (top up or upgrade BEFORE a live campaign stalls); replied prospects who should be moved into the pipeline as deals; qualified prospects not yet enrolled in any campaign; paused campaigns with enrolled prospects; no sourcing activity when the pipeline is thin. If credits are zero and a campaign is live, that is the top task. Due dates: urgent 0-2 days, normal 3-7, housekeeping 8-14. For each task pick the single best action key: topup_letters or topup_ai (buy credits), approve_letters (open the approval queue), enrol_prospects (put prospects into a campaign), start_sourcing (run a new sourcing batch), move_replied_to_pipeline (turn replied prospects into pipeline deals), review_dealflow (look at member deals), upgrade_plan (plan-level blocker), call_or_manual (a human phone call or offline step), none.',
      tools: [{ name: 'set_tasks', description: 'The task list', input_schema: { type: 'object', properties: { tasks: { type: 'array', items: { type: 'object', properties: { title: { type: 'string', description: 'max 80 chars, imperative' }, due_in_days: { type: 'number' }, why: { type: 'string', description: 'one short sentence' }, action: { type: 'string', enum: ACTIONS } }, required: ['title', 'due_in_days', 'action'] } } }, required: ['tasks'] } }],
      tool_choice: { type: 'tool', name: 'set_tasks' },
      messages: [{ role: 'user', content: 'Workspace snapshot: ' + JSON.stringify(snapshot) }],
    }),
  });
  if (!ar.ok) { const t = await ar.text(); throw new Error('Suggestions are briefly unavailable, try again. (' + ar.status + ' ' + t.slice(0, 120) + ')'); }
  const out: any = ((await ar.json()).content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? { tasks: [] };
  const existing = new Set(openTasks.map((t: any) => String(t.title).toLowerCase().replace(/[^a-z0-9]/g, '')));
  const created: any[] = [];
  for (const t of (out.tasks ?? []).slice(0, 5)) {
    const key = String(t.title ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!t.title || key.length < 5 || existing.has(key)) continue;
    const due = new Date(Date.now() + Math.max(0, Math.min(14, Number(t.due_in_days ?? 3))) * 86400000).toISOString().slice(0, 10);
    const title = t.why ? `${String(t.title).slice(0, 90)} (${String(t.why).slice(0, 90)})` : String(t.title).slice(0, 120);
    const meta = { auto: true, action: ACTIONS.includes(t.action) ? t.action : 'none', why: String(t.why ?? '').slice(0, 200) };
    const row = (await sql`insert into acq.tasks (org_id, title, due_date, created_by, meta) values (${orgId}, ${title}, ${due}, ${userId}, ${meta}) returning *`)[0];
    created.push(row); existing.add(key);
  }
  return created;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','from_email','anthropic_api_key','resend_api_key','email_template')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }

    const action = body.action ?? 'list';

    // ---- trusted background pass: generate tasks where the workspace needs them ----
    if (action === 'ai_tasks_cron') {
      if (!trusted) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ ok: true, note: 'no anthropic key' }); }
      const host = (await sql`select id from acq.organizations order by created_at limit 1`)[0];
      const orgs = await sql`select o.id, o.settings, u.email, coalesce(o.settings->'profile'->>'founder_name','') as fname
        from acq.organizations o join acq.org_members m on m.org_id=o.id and m.role='owner' join auth.users u on u.id=m.user_id
        where o.id <> ${host.id}`;
      let generated = 0; const report: string[] = [];
      for (const o of orgs.slice(0, 40)) {
        try {
          const st = o.settings ?? {};
          const last = st.ai_tasks?.last_run ? new Date(st.ai_tasks.last_run).getTime() : 0;
          if (Date.now() - last < 3 * 86400000) continue; // at most every 3 days per org
          // only workspaces with something happening
          const activity = (await sql`select
            (select count(*)::int from acq.prospects where org_id=${o.id}) +
            (select count(*)::int from acq.deals where org_id=${o.id}) +
            (select count(*)::int from acq.campaigns where org_id=${o.id}) as n`)[0];
          if (Number(activity.n) === 0) continue;
          // don't pile on: skip if 4+ auto tasks already open
          const openAuto = (await sql`select count(*)::int as n from acq.tasks where org_id=${o.id} and status='open' and (meta->>'auto')='true'`)[0];
          if (Number(openAuto.n) >= 4) continue;
          const created = await generateTasks(sql, o.id, null, ANTHROPIC);
          await sql`update acq.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{ai_tasks}', ${{ last_run: new Date().toISOString(), last_created: created.length }}) where id=${o.id}`;
          if (created.length > 0) {
            generated += created.length; report.push(`${o.email}:${created.length}`);
            // branded notification email
            if (cfg.resend_api_key && o.email) {
              const first = esc((o.fname || o.email.split('@')[0]).split(' ')[0]);
              const items = created.map((t: any) => `<tr><td style="padding:9px 0;border-bottom:1px solid #E8ECF1;font-size:14px;color:#25384C;">${esc(String(t.title).replace(/\s*\(.*\)\s*$/, ''))}<div style="font-size:12px;color:#8A97A6;margin-top:2px;">${esc(t.meta?.why ?? '')}${t.due_date ? ' · due ' + String(t.due_date).slice(0, 10) : ''}</div></td></tr>`).join('');
              const inner = `
<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;color:#0A2540;margin:0 0 16px;">${first}, your workspace needs ${created.length === 1 ? 'one thing' : created.length + ' things'} from you.</h1>
<p style="margin:0 0 14px;">Your AI chief of staff read your campaigns, credits, prospects and pipeline this morning. Here is what will move things forward:</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 14px;">${items}</table>
<p style="margin:0 0 14px;">Each task in the app has a button that takes you straight to the fix, or does it for you where the system can.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td bgcolor="#F5C518" style="background:#F5C518;border-radius:12px;"><a href="https://www.officiallyinvested.com/admin/origination?view=contacts" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#0A2540;text-decoration:none;padding:13px 26px;">Open my tasks</a></td></tr></table>
<p style="margin:14px 0 0;font-size:12.5px;color:#6B7A89;">These arrive at most twice a week, and only when something genuinely needs you.</p>`;
              const tpl = cfg.email_template ?? '<html><body>{{CONTENT}}</body></html>';
              const html = tpl.replaceAll('{{BRAND}}', 'Officially Invested').replaceAll('{{PREHEADER}}', 'Your AI chief of staff found the next moves in your workspace.').replaceAll('{{CONTENT}}', inner);
              try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: `Officially Invested <${cfg.from_email ?? 'deals@officiallyinvested.com'}>`, to: [o.email], subject: created.length === 1 ? 'One thing needs you today' : `${created.length} things need you today`, html }) }); } catch (_) { /* best effort */ }
            }
          }
        } catch (_) { /* next org */ }
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, generated, report });
    }

    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    if (action === 'add_contact') {
      const c = (await sql`insert into acq.contacts (org_id, name, role, company, email, phone, notes) values (${orgId}, ${body.name}, ${body.role ?? null}, ${body.company ?? null}, ${body.email ?? null}, ${body.phone ?? null}, ${body.notes ?? null}) returning *`)[0];
      return json({ ok: true, contact: c });
    }
    if (action === 'contact_update') {
      const cur = (await sql`select * from acq.contacts where id=${body.contact_id} and org_id=${orgId}`)[0];
      if (!cur) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      const p = body.patch ?? {};
      const next = {
        name: p.name !== undefined ? String(p.name).slice(0, 160) : cur.name,
        role: p.role !== undefined ? (p.role ? String(p.role).slice(0, 40) : null) : cur.role,
        company: p.company !== undefined ? (p.company ? String(p.company).slice(0, 200) : null) : cur.company,
        email: p.email !== undefined ? (p.email ? String(p.email).slice(0, 200) : null) : cur.email,
        phone: p.phone !== undefined ? (p.phone ? String(p.phone).slice(0, 60) : null) : cur.phone,
        notes: p.notes !== undefined ? (p.notes ? String(p.notes).slice(0, 4000) : null) : cur.notes,
      };
      if (!next.name || !String(next.name).trim()) { await sql.end({ timeout: 5 }); return json({ error: 'name required' }, 400); }
      const c = (await sql`update acq.contacts set name=${next.name}, role=${next.role}, company=${next.company}, email=${next.email}, phone=${next.phone}, notes=${next.notes} where id=${body.contact_id} and org_id=${orgId} returning *`)[0];
      return json({ ok: true, contact: c });
    }
    if (action === 'add_task') {
      const meta = body.kind ? { kind: String(body.kind).slice(0, 30) } : null;
      const t = (await sql`insert into acq.tasks (org_id, deal_id, contact_id, title, due_date, created_by, meta) values (${orgId}, ${body.deal_id ?? null}, ${body.contact_id ?? null}, ${body.title}, ${body.due_date ?? null}, ${userId}, ${meta}) returning *`)[0];
      return json({ ok: true, task: t });
    }
    if (action === 'update_task') {
      if (body.toggle) await sql`update acq.tasks set status = case when status='open' then 'done' else 'open' end, done_at = case when status='open' then now() else null end where id=${body.task_id} and org_id=${orgId}`;
      if (body.note !== undefined) await sql`update acq.tasks set meta = coalesce(meta,'{}'::jsonb) || ${{ note: String(body.note).slice(0, 500) }} where id=${body.task_id} and org_id=${orgId}`;
      const t = (await sql`select * from acq.tasks where id=${body.task_id} and org_id=${orgId}`)[0];
      return json({ ok: true, task: t });
    }
    if (action === 'delete_task') {
      await sql`delete from acq.tasks where id=${body.task_id} and org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'complete_task') {
      await sql`update acq.tasks set status='done', done_at=now() where id=${body.task_id} and org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'add_deal_contact') {
      if (!body.deal_id) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id required' }, 400); }
      // link an existing contact by id
      if (body.contact_id) {
        await sql`insert into acq.deal_contacts (deal_id, contact_id, role) values (${body.deal_id}, ${body.contact_id}, ${body.role ?? null}) on conflict (deal_id, contact_id) do update set role=excluded.role`;
        const c = (await sql`select * from acq.contacts where id=${body.contact_id} and org_id=${orgId}`)[0];
        return json({ ok: true, contact: c });
      }
      if (!body.name) { await sql.end({ timeout: 5 }); return json({ error: 'name or contact_id required' }, 400); }
      let contact: any = null;
      if (body.email) contact = (await sql`select * from acq.contacts where org_id=${orgId} and lower(email)=${String(body.email).toLowerCase()} limit 1`)[0] ?? null;
      if (!contact) contact = (await sql`insert into acq.contacts (org_id, name, role, company, email, phone) values (${orgId}, ${body.name}, ${body.role ?? null}, ${body.company ?? null}, ${body.email ?? null}, ${body.phone ?? null}) returning *`)[0];
      await sql`insert into acq.deal_contacts (deal_id, contact_id, role) values (${body.deal_id}, ${contact.id}, ${body.role ?? null}) on conflict (deal_id, contact_id) do update set role=excluded.role`;
      return json({ ok: true, contact });
    }
    if (action === 'deal_contacts') {
      const rows = await sql`select c.id, c.name, c.company, c.email, c.phone, dc.role from acq.deal_contacts dc join acq.contacts c on c.id=dc.contact_id where dc.deal_id=${body.deal_id} order by dc.role`;
      return json({ ok: true, deal_contacts: rows });
    }
    // suggest existing contacts for a deal (optionally by role), not already on the deal
    if (action === 'suggest') {
      const roles: string[] | null = Array.isArray(body.roles) && body.roles.length ? body.roles : null;
      const rows = await sql`
        select c.id, c.name, c.company, c.email, c.phone, c.role,
          (select max(cm.happened_at) from acq.communications cm where cm.contact_id=c.id) as last_interaction,
          (select count(*)::int from acq.deal_contacts dc where dc.contact_id=c.id) as deal_count
        from acq.contacts c
        where c.org_id=${orgId}
          ${roles ? sql`and c.role = any(${roles})` : sql``}
          ${body.deal_id ? sql`and not exists (select 1 from acq.deal_contacts dc where dc.contact_id=c.id and dc.deal_id=${body.deal_id})` : sql``}
          and (c.email is not null or ${body.allow_no_email ?? false})
        order by last_interaction desc nulls last, deal_count desc, c.created_at desc limit 50`;
      return json({ ok: true, suggestions: rows });
    }

    // ---- meetings (acq.meetings): schedule, amend, mark held, cancel, list ----
    if (action === 'meeting_create') {
      if (!body.title || !String(body.title).trim() || !body.starts_at) { await sql.end({ timeout: 5 }); return json({ error: 'title and starts_at required' }, 400); }
      const m = (await sql`insert into acq.meetings (org_id, contact_id, deal_id, title, starts_at, duration_mins, location, notes, created_by)
        values (${orgId}, ${body.contact_id ?? null}, ${body.deal_id ?? null}, ${String(body.title).slice(0, 200)}, ${body.starts_at}, ${Number(body.duration_mins ?? 30) || 30}, ${body.location ? String(body.location).slice(0, 200) : null}, ${body.notes ? String(body.notes).slice(0, 2000) : null}, ${userId}) returning *`)[0];
      return json({ ok: true, meeting: m });
    }
    if (action === 'meeting_update') {
      const cur = (await sql`select * from acq.meetings where id=${body.meeting_id} and org_id=${orgId}`)[0];
      if (!cur) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      const p = body.patch ?? {};
      const next = {
        title: p.title !== undefined ? String(p.title).slice(0, 200) : cur.title,
        starts_at: p.starts_at !== undefined ? p.starts_at : cur.starts_at,
        duration_mins: p.duration_mins !== undefined ? (Number(p.duration_mins) || 30) : cur.duration_mins,
        location: p.location !== undefined ? (p.location ? String(p.location).slice(0, 200) : null) : cur.location,
        notes: p.notes !== undefined ? (p.notes ? String(p.notes).slice(0, 2000) : null) : cur.notes,
        outcome: p.outcome !== undefined ? (p.outcome ? String(p.outcome).slice(0, 2000) : null) : cur.outcome,
        status: p.status !== undefined && ['scheduled', 'held', 'cancelled'].includes(p.status) ? p.status : cur.status,
        contact_id: p.contact_id !== undefined ? (p.contact_id || null) : cur.contact_id,
        deal_id: p.deal_id !== undefined ? (p.deal_id || null) : cur.deal_id,
      };
      const m = (await sql`update acq.meetings set title=${next.title}, starts_at=${next.starts_at}, duration_mins=${next.duration_mins}, location=${next.location}, notes=${next.notes}, outcome=${next.outcome}, status=${next.status}, contact_id=${next.contact_id}, deal_id=${next.deal_id}, updated_at=now() where id=${body.meeting_id} and org_id=${orgId} returning *`)[0];
      // A meeting marked held becomes part of the record: log a communication so
      // it shows up in the deal history and the contact timeline. The
      // communications table requires a deal; meetings without one still appear
      // in the contact timeline via the meetings merge.
      if (m.status === 'held' && cur.status !== 'held' && m.deal_id) {
        try {
          await sql`insert into acq.communications (org_id, deal_id, contact_id, direction, kind, subject, body, happened_at, created_by, external_id)
            values (${orgId}, ${m.deal_id}, ${m.contact_id}, 'out', 'meeting', ${m.title}, ${m.outcome ?? m.notes ?? 'Meeting held'}, ${m.starts_at}, ${userId}, ${'meeting:' + m.id})`;
        } catch (_) { /* best effort; the meeting row itself is the source of truth */ }
      }
      return json({ ok: true, meeting: m });
    }
    if (action === 'meeting_cancel') {
      await sql`update acq.meetings set status='cancelled', updated_at=now() where id=${body.meeting_id} and org_id=${orgId}`;
      return json({ ok: true });
    }
    if (action === 'meetings_list') {
      const rows = await sql`
        select m.*, c.name as contact_name, c.role as contact_role, d.name as deal_name
        from acq.meetings m
        left join acq.contacts c on c.id = m.contact_id
        left join acq.deals d on d.id = m.deal_id
        where m.org_id=${orgId} and m.starts_at > now() - interval '30 days'
          ${body.contact_id ? sql`and m.contact_id=${body.contact_id}` : sql``}
        order by m.starts_at asc limit 200`;
      return json({ ok: true, meetings: rows });
    }

    // AI chief of staff, user-triggered
    if (action === 'ai_tasks') {
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }); }
      try {
        const created = await generateTasks(sql, orgId, userId, ANTHROPIC);
        await sql`update acq.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{ai_tasks}', ${{ last_run: new Date().toISOString(), last_created: created.length }}) where id=${orgId}`;
        return json({ ok: true, created: created.length, tasks: created });
      } catch (e: any) { return json({ error: String(e.message ?? e).slice(0, 200) }); }
    }

    if (action === 'contact_detail') {
      const c = (await sql`select * from acq.contacts where id=${body.contact_id} and org_id=${orgId}`)[0];
      if (!c) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      const deals = await sql`
        select d.id, d.name, d.submission_id, dc.role, s.status, s.reference
        from acq.deal_contacts dc join acq.deals d on d.id = dc.deal_id
        left join public.submissions s on s.id = d.submission_id
        where dc.contact_id = ${c.id} order by d.created_at desc`;
      const comms = await sql`
        select cm.id, cm.deal_id, cm.direction, cm.kind, cm.subject, left(cm.body, 400) as body, cm.happened_at, cm.external_id, d.name as deal_name
        from acq.communications cm left join acq.deals d on d.id = cm.deal_id
        where cm.contact_id = ${c.id} and cm.org_id = ${orgId}
        order by cm.happened_at desc limit 100`;
      let docs: any[] = [];
      try { if (deals.length) docs = await sql`select id, deal_id, file_name, created_at from acq.documents where deal_id = any(${deals.map((d: any) => d.id)}) order by created_at desc limit 30`; } catch (_) { docs = []; }
      const tasks = await sql`select id, title, due_date, status from acq.tasks where contact_id=${c.id} and org_id=${orgId} order by status, due_date nulls last limit 20`;
      const meetings = await sql`
        select m.*, d.name as deal_name from acq.meetings m left join acq.deals d on d.id = m.deal_id
        where m.contact_id=${c.id} and m.org_id=${orgId} order by m.starts_at desc limit 100`;
      const doneTasks = await sql`select id, title, done_at, meta from acq.tasks where contact_id=${c.id} and org_id=${orgId} and status='done' and done_at is not null order by done_at desc limit 50`;
      // one merged story: everything that ever happened with this person, newest first.
      // Held meetings that already produced a communication are deduped via external_id.
      const loggedMeetingIds = new Set(comms.map((x: any) => String(x.external_id ?? '')).filter((x: string) => x.startsWith('meeting:')).map((x: string) => x.slice(8)));
      const timeline = [
        ...comms.map((x: any) => ({ at: x.happened_at, icon_kind: String(x.kind), title: x.subject || (x.direction === 'in' ? 'Heard from them (' + x.kind + ')' : String(x.kind)[0].toUpperCase() + String(x.kind).slice(1)), body: x.body ?? '', deal_name: x.deal_name ?? null })),
        ...meetings.filter((m: any) => !loggedMeetingIds.has(String(m.id))).map((m: any) => ({ at: m.starts_at, icon_kind: 'meeting', title: m.title + (m.status === 'cancelled' ? ' (cancelled)' : m.status === 'scheduled' ? ' (scheduled)' : ''), body: m.outcome ?? m.notes ?? '', deal_name: m.deal_name ?? null })),
        ...doneTasks.map((t: any) => ({ at: t.done_at, icon_kind: 'task', title: t.title, body: t.meta?.note ?? '', deal_name: null })),
      ].sort((a, b) => +new Date(b.at) - +new Date(a.at));
      return json({ ok: true, contact: c, deals, communications: comms, documents: docs, tasks, meetings, timeline });
    }

    // backfill contacts from submitters (so the directory is never empty)
    const fromEmail = (cfg.from_email || '').toString();
    await sql`
      insert into acq.contacts (org_id, name, role, company, email)
      select ${orgId}, s.submitter_name, 'vendor', coalesce(s.business_name, s.spv_name), s.email
      from public.submissions s
      where s.email is not null and s.email <> ${fromEmail}
        and coalesce(s.submitter_name,'') not ilike 'Officially Invested%'
        and not exists (select 1 from acq.contacts c where c.org_id=${orgId} and c.email = s.email)
      group by s.submitter_name, s.business_name, s.spv_name, s.email`;

    // enriched directory: deals, last interaction, open tasks. Optional q search
    // across name, company, email, phone and notes.
    const q = body.q && String(body.q).trim() ? '%' + String(body.q).trim() + '%' : null;
    const contacts = await sql`
      select c.*,
        (select count(*)::int from acq.deal_contacts dc where dc.contact_id=c.id) as deal_count,
        (select json_agg(json_build_object('name', d.name, 'role', dc.role) order by d.created_at desc) from acq.deal_contacts dc join acq.deals d on d.id=dc.deal_id where dc.contact_id=c.id) as deals,
        (select max(cm.happened_at) from acq.communications cm where cm.contact_id=c.id) as last_interaction,
        (select cm.kind from acq.communications cm where cm.contact_id=c.id order by cm.happened_at desc limit 1) as last_kind,
        (select cm.direction from acq.communications cm where cm.contact_id=c.id order by cm.happened_at desc limit 1) as last_direction,
        (select count(*)::int from acq.communications cm where cm.contact_id=c.id) as interaction_count,
        (select count(*)::int from acq.tasks t where t.contact_id=c.id and t.status='open') as open_tasks,
        (select t.title from acq.tasks t where t.contact_id=c.id and t.status='open' order by t.due_date nulls last, t.created_at limit 1) as next_task
      from acq.contacts c where c.org_id=${orgId}
      ${q ? sql`and (c.name ilike ${q} or c.company ilike ${q} or c.email ilike ${q} or c.phone ilike ${q} or c.notes ilike ${q})` : sql``}
      order by last_interaction desc nulls last, c.created_at desc limit 300`;
    const tasks = await sql`
      select t.*, d.name as deal_name, c.name as contact_name, c.role as contact_role
      from acq.tasks t left join acq.deals d on d.id=t.deal_id left join acq.contacts c on c.id=t.contact_id
      where t.org_id=${orgId} and (t.status='open' or (t.deal_id is not null and t.done_at > now() - interval '30 days')) order by t.status, t.due_date nulls last, t.created_at limit 150`;
    return json({ ok: true, contacts, tasks });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
