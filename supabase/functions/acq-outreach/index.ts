// =============================================================================
// acq-outreach v2 — multi-channel campaign engine (opt-outs honoured platform-wide) (email via Resend, letters via
// Stannp, human call tasks). Sequences with wait states, suppression checks,
// per-campaign daily caps + send windows, approval gates (nothing sends
// without approval unless approval_mode='auto'), AI-drafted human-voice
// templates, and a cron-driven `run` action.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const clean = (s: string) => s.replace(/—/g, ', ').replace(/\*\*|##+|```/g, '').replace(/^ +| +$/gm, (m) => m).trim();
const render = (tpl: string, p: any, org: any) => tpl
  .replace(/{{\s*company_name\s*}}/g, p.company_name ?? 'your business')
  .replace(/{{\s*owner_name\s*}}/g, p.owner_name ?? 'there')
  .replace(/{{\s*first_name\s*}}/g, (p.owner_name ?? '').split(' ')[0] || 'there')
  .replace(/{{\s*region\s*}}/g, p.region ?? 'your area')
  .replace(/{{\s*sender_name\s*}}/g, org.sender_name ?? org.name ?? '')
  .replace(/{{\s*sender_company\s*}}/g, org.name ?? '');

async function isSuppressed(sql: any, orgId: string, p: any): Promise<string | null> {
  const vals: { kind: string; value: string }[] = [];
  if (p.owner_email) { vals.push({ kind: 'email', value: p.owner_email.toLowerCase() }); if (p.owner_email.includes('@')) vals.push({ kind: 'domain', value: p.owner_email.split('@')[1].toLowerCase() }); }
  if (p.company_number) vals.push({ kind: 'company_number', value: p.company_number });
  for (const v of vals) {
    const hit = (await sql`select reason from acq.suppressions where (org_id=${orgId} or reason='opt_out') and kind=${v.kind} and value=${v.value} limit 1`)[0];
    if (hit) return hit.reason ?? 'suppressed';
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','anthropic_api_key','resend_api_key','stannp_api_key','from_email','drafting_rules')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    const action = body.action ?? 'list';

    // ---------- cron: run for ALL orgs ----------
    if (action === 'run' && trusted) {
      const orgs = await sql`select id, name, settings from acq.organizations`;
      const report: any[] = [];
      for (const org of orgs) report.push(await runOrg(sql, cfg, org));
      await sql.end({ timeout: 5 });
      return json({ ok: true, orgs: report });
    }

    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} and role in ('owner','admin','analyst') order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else if (!orgId) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }
    const org = (await sql`select id, name, settings from acq.organizations where id=${orgId}`)[0];

    if (action === 'run') { const r = await runOrg(sql, cfg, org); await sql.end({ timeout: 5 }); return json({ ok: true, orgs: [r] }); }

    if (action === 'list') {
      const camps = await sql`
        select c.*, 
          (select count(*)::int from acq.campaign_members m where m.campaign_id=c.id) as members,
          (select count(*)::int from acq.campaign_members m where m.campaign_id=c.id and m.status='replied') as replied,
          (select count(*)::int from acq.outreach_touches t where t.campaign_id=c.id and t.status='sent') as sent,
          (select count(*)::int from acq.outreach_touches t where t.campaign_id=c.id and t.status='needs_approval') as needs_approval
        from acq.campaigns c where c.org_id=${orgId} and c.status != 'archived' order by c.created_at desc`;
      const steps = await sql`select s.* from acq.campaign_steps s join acq.campaigns c on c.id=s.campaign_id where c.org_id=${orgId} order by s.position`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, campaigns: camps, steps });
    }

    if (action === 'create') {
      const c = (await sql`insert into acq.campaigns (org_id, name, target_filter, approval_mode, daily_cap) values (${orgId}, ${body.name ?? 'New campaign'}, ${body.target_filter ?? {}}, ${body.approval_mode === 'auto' ? 'auto' : 'manual'}, ${Number(body.daily_cap ?? 25)}) returning *`)[0];
      const steps = Array.isArray(body.steps) ? body.steps : [];
      const out: any[] = [];
      for (let i = 0; i < steps.length; i++) {
        out.push((await sql`insert into acq.campaign_steps (campaign_id, position, channel, wait_days, subject, body) values (${c.id}, ${i}, ${steps[i].channel}, ${Number(steps[i].wait_days ?? 0)}, ${steps[i].subject ?? null}, ${steps[i].body ?? null}) returning *`)[0]);
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, campaign: c, steps: out });
    }

    if (action === 'update') {
      const patch: Record<string, unknown> = {};
      if (body.status && ['draft','active','paused','archived'].includes(body.status)) patch.status = body.status;
      if (body.daily_cap != null) patch.daily_cap = Number(body.daily_cap);
      if (body.approval_mode && ['manual','auto'].includes(body.approval_mode)) patch.approval_mode = body.approval_mode;
      if (body.name) patch.name = body.name;
      const c = (await sql`update acq.campaigns set ${sql(patch)} where id=${body.campaign_id} and org_id=${orgId} returning *`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, campaign: c });
    }

    if (action === 'draft_templates') {
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }, 500); }
      const thesis = org?.settings?.thesis ?? org?.settings?.buy_box ?? {};
      const profile = org?.settings?.profile ?? null;
      const system = `You write direct-to-owner acquisition outreach for ${org.name}, a buyer of established UK businesses. Voice: plain, warm, human, credible; short sentences; no hype, no jargon, no em-dashes, no markdown, no AI tells. Never pressure. The reader is a busy owner of a boring-but-good business, probably thinking about retirement. Merge fields available: {{owner_name}}, {{first_name}}, {{company_name}}, {{region}}, {{sender_name}}, {{sender_company}}. ${profile ? 'ABOUT THE BUYER (weave one or two specifics in naturally for credibility, never brag, never list): ' + JSON.stringify(profile).slice(0, 900) + ' ' : ''}${cfg.drafting_rules ? 'House rules: ' + String(cfg.drafting_rules).slice(0, 1500) : ''}`;
      const user = `Write a 3-step outreach sequence for this target profile: ${JSON.stringify(body.profile ?? thesis).slice(0, 800)}.\nStep 1: a physical LETTER (200-260 words, letter layout, no subject).\nStep 2: a short follow-up EMAIL (subject + 90-130 words).\nStep 3: a phone CALL brief for the caller (bullet-free, 80-120 words: who we are, why calling, the one question to ask, what NOT to say).\nTone: neighbourly, confidential, zero pressure. Mention we buy businesses like theirs and keep staff and legacy intact. Include a soft opt-out line in letter and email.`;
      const ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2500, system,
          tools: [{ name: 'set_sequence', description: 'Return the outreach sequence', input_schema: { type: 'object', properties: { letter_body: { type: 'string' }, email_subject: { type: 'string' }, email_body: { type: 'string' }, call_brief: { type: 'string' } }, required: ['letter_body','email_subject','email_body','call_brief'] } }],
          tool_choice: { type: 'tool', name: 'set_sequence' }, messages: [{ role: 'user', content: user }] }),
      });
      if (!ar.ok) { const t = await ar.text(); await sql.end({ timeout: 5 }); return json({ error: 'anthropic ' + ar.status, detail: t.slice(0, 200) }, 502); }
      const out: any = ((await ar.json()).content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? {};
      await sql.end({ timeout: 5 });
      return json({ ok: true, steps: [
        { channel: 'letter', wait_days: 0, subject: null, body: clean(out.letter_body ?? '') },
        { channel: 'email', wait_days: 10, subject: clean(out.email_subject ?? 'A note about {{company_name}}'), body: clean(out.email_body ?? '') },
        { channel: 'call_task', wait_days: 7, subject: 'Call {{company_name}}', body: clean(out.call_brief ?? '') },
      ] });
    }

    if (action === 'enrol') {
      const camp = (await sql`select * from acq.campaigns where id=${body.campaign_id} and org_id=${orgId}`)[0];
      if (!camp) { await sql.end({ timeout: 5 }); return json({ error: 'campaign not found' }, 404); }
      const f = body.filter ?? {};
      const limit = Math.min(500, Number(f.limit ?? 100));
      const cands = await sql`
        select * from acq.prospects where org_id=${orgId}
          and stage in ('new','enriched','qualified')
          ${f.min_fit != null ? sql`and fit_score >= ${Number(f.min_fit)}` : sql``}
          ${f.region ? sql`and (region ilike ${'%' + f.region + '%'} or postcode ilike ${f.region + '%'})` : sql``}
          ${f.provenance ? sql`and provenance=${f.provenance}` : sql``}
          ${Array.isArray(f.prospect_ids) && f.prospect_ids.length ? sql`and id = any(${f.prospect_ids})` : sql``}
          and not exists (select 1 from acq.campaign_members m where m.prospect_id=acq.prospects.id and m.campaign_id=${camp.id})
        order by fit_score desc nulls last limit ${limit}`;
      const firstWait = Number((await sql`select wait_days from acq.campaign_steps where campaign_id=${camp.id} order by position limit 1`)[0]?.wait_days ?? 0);
      let enrolled = 0, suppressed = 0;
      for (const p of cands) {
        if (await isSuppressed(sql, orgId, p)) { suppressed++; continue; }
        await sql`insert into acq.campaign_members (campaign_id, prospect_id, org_id, current_step, next_action_at) values (${camp.id}, ${p.id}, ${orgId}, 0, now() + make_interval(days => ${firstWait})) on conflict do nothing`;
        await sql`update acq.prospects set stage='in_campaign', updated_at=now() where id=${p.id} and stage in ('new','enriched','qualified')`;
        enrolled++;
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, enrolled, suppressed, candidates: cands.length });
    }

    if (action === 'queue') {
      const rows = await sql`select t.*, p.company_name, p.owner_name, p.owner_email, p.address, p.postcode from acq.outreach_touches t join acq.prospects p on p.id=t.prospect_id where t.org_id=${orgId} ${body.status ? sql`and t.status=${body.status}` : sql`and t.status in ('needs_approval','approved','queued')`} order by t.created_at desc limit 200`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, touches: rows });
    }

    if (action === 'approve' || action === 'cancel') {
      const st = action === 'approve' ? 'approved' : 'cancelled';
      await sql`update acq.outreach_touches set status=${st} where org_id=${orgId} and id = any(${body.touch_ids ?? []}) and status in ('needs_approval','queued','approved')`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }
    if (action === 'approve_all') {
      const r = await sql`update acq.outreach_touches set status='approved' where org_id=${orgId} and status='needs_approval' ${body.campaign_id ? sql`and campaign_id=${body.campaign_id}` : sql``} returning id`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, approved: r.length });
    }
    if (action === 'mark_replied') {
      const p = (await sql`select * from acq.prospects where id=${body.prospect_id} and org_id=${orgId}`)[0];
      if (!p) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      await sql`update acq.campaign_members set status='replied' where prospect_id=${p.id} and status='active'`;
      await sql`update acq.prospects set stage='replied', updated_at=now() where id=${p.id}`;
      await sql`update acq.outreach_touches set status='cancelled' where prospect_id=${p.id} and status in ('queued','needs_approval','approved')`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});

// ---------------- the engine ----------------
async function runOrg(sql: any, cfg: any, org: any) {
  const orgId = org.id;
  const outreach = org?.settings?.outreach ?? {};
  const report = { org: org.name, advanced: 0, queued: 0, sent_email: 0, sent_letter: 0, call_tasks: 0, suppressed: 0, failed: 0, replies: 0 };

  // 1) reply detection (best-effort): inbound comms whose contact email matches a prospect in an active campaign
  const replies = await sql`
    select distinct p.id as prospect_id from acq.communications cm
    join acq.contacts c on c.id = cm.contact_id
    join acq.prospects p on p.org_id = cm.org_id and lower(p.owner_email) = lower(c.email)
    join acq.campaign_members m on m.prospect_id = p.id and m.status = 'active'
    where cm.org_id = ${orgId} and cm.direction = 'in' and cm.happened_at > now() - interval '3 days'`;
  for (const r of replies) {
    await sql`update acq.campaign_members set status='replied' where prospect_id=${r.prospect_id} and status='active'`;
    await sql`update acq.prospects set stage='replied', updated_at=now() where id=${r.prospect_id}`;
    await sql`update acq.outreach_touches set status='cancelled' where prospect_id=${r.prospect_id} and status in ('queued','needs_approval','approved')`;
    report.replies++;
  }

  // 2) advance due members -> create touches
  const due = await sql`
    select m.*, c.approval_mode, c.status as camp_status, c.id as cid
    from acq.campaign_members m join acq.campaigns c on c.id=m.campaign_id
    where m.org_id=${orgId} and m.status='active' and c.status='active' and m.next_action_at <= now() limit 200`;
  for (const m of due) {
    const steps = await sql`select * from acq.campaign_steps where campaign_id=${m.cid} order by position`;
    if (m.current_step >= steps.length) { await sql`update acq.campaign_members set status='finished' where id=${m.id}`; continue; }
    const step = steps[m.current_step];
    const p = (await sql`select * from acq.prospects where id=${m.prospect_id}`)[0];
    if (!p) continue;
    const supp = await isSuppressed(sql, orgId, p);
    if (supp) { await sql`update acq.campaign_members set status='suppressed' where id=${m.id}`; report.suppressed++; continue; }
    const feasible = step.channel === 'email' ? !!p.owner_email : step.channel === 'letter' ? !!(p.address && p.postcode) : true;
    if (feasible) {
      const subject = step.subject ? render(step.subject, p, { ...org, sender_name: outreach.sender_name }) : null;
      const bodyTxt = render(step.body ?? '', p, { ...org, sender_name: outreach.sender_name });
      const status = m.approval_mode === 'auto' ? 'approved' : 'needs_approval';
      await sql`insert into acq.outreach_touches (org_id, prospect_id, campaign_id, step_id, channel, status, subject, body) values (${orgId}, ${p.id}, ${m.cid}, ${step.id}, ${step.channel}, ${status}, ${subject}, ${bodyTxt})`;
      report.queued++;
    }
    const next = steps[m.current_step + 1];
    if (next) await sql`update acq.campaign_members set current_step=${m.current_step + 1}, next_action_at=now() + make_interval(days => ${Number(next.wait_days ?? 0)}) where id=${m.id}`;
    else await sql`update acq.campaign_members set current_step=${m.current_step + 1}, status='finished' where id=${m.id}`;
    report.advanced++;
  }

  // 3) send approved touches (send window + per-campaign daily cap)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Europe/London' }).format(new Date()));
  const camps = await sql`select * from acq.campaigns where org_id=${orgId} and status='active'`;
  for (const c of camps) {
    const [h1, h2] = (c.send_window ?? '09:00-17:00').split('-').map((x: string) => Number(x.split(':')[0]));
    if (hour < h1 || hour >= h2) continue;
    const sentToday = Number((await sql`select count(*)::int as n from acq.outreach_touches where campaign_id=${c.id} and status='sent' and sent_at::date = (now() at time zone 'Europe/London')::date`)[0].n);
    const budget = Math.max(0, c.daily_cap - sentToday);
    if (!budget) continue;
    const toSend = await sql`select t.*, p.company_name, p.owner_name, p.owner_email, p.address, p.postcode, p.region from acq.outreach_touches t join acq.prospects p on p.id=t.prospect_id where t.campaign_id=${c.id} and t.status='approved' order by t.created_at limit ${Math.min(budget, 25)}`;
    for (const t of toSend) {
      try {
        if (t.channel === 'email') {
          if (!cfg.resend_api_key) throw new Error('resend_api_key not configured');
          const from = (org?.settings?.outreach?.from) || cfg.from_email;
          const footer = `\n\n${org.name}\nIf you would rather not hear from us again, just reply with the word unsubscribe and we will remove you.`;
          const rr = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [t.owner_email], subject: t.subject ?? `A note about ${t.company_name}`, text: t.body + footer }) });
          if (!rr.ok) throw new Error('resend ' + rr.status + ' ' + (await rr.text()).slice(0, 150));
          const rid = (await rr.json())?.id ?? null;
          await sql`update acq.outreach_touches set status='sent', sent_at=now(), provider='resend', provider_id=${rid} where id=${t.id}`;
          report.sent_email++;
        } else if (t.channel === 'letter') {
          if (!cfg.stannp_api_key) { continue; /* stays approved until the key exists */ }
          const fd = new FormData();
          fd.set('test', org?.settings?.outreach?.letters_live ? 'false' : 'true');
          fd.set('recipient[title]', ''); fd.set('recipient[firstname]', (t.owner_name ?? 'The').split(' ')[0]); fd.set('recipient[lastname]', (t.owner_name ?? 'Business Owner').split(' ').slice(1).join(' ') || 'Owner');
          fd.set('recipient[company]', t.company_name ?? ''); fd.set('recipient[address1]', (t.address ?? '').split(',')[0]); fd.set('recipient[address2]', (t.address ?? '').split(',').slice(1).join(',').trim()); fd.set('recipient[postcode]', t.postcode ?? ''); fd.set('recipient[country]', 'GB');
          fd.set('background', ''); fd.set('pages', t.body);
          const sr = await fetch('https://dash.stannp.com/api/v1/letters/create', { method: 'POST', headers: { Authorization: 'Basic ' + btoa(cfg.stannp_api_key + ':') }, body: fd });
          if (!sr.ok) throw new Error('stannp ' + sr.status + ' ' + (await sr.text()).slice(0, 150));
          const sid = (await sr.json())?.data?.id ?? null;
          await sql`update acq.outreach_touches set status='sent', sent_at=now(), provider='stannp', provider_id=${String(sid)} where id=${t.id}`;
          report.sent_letter++;
        } else if (t.channel === 'call_task') {
          await sql`insert into acq.tasks (org_id, title, due_date) values (${t.org_id}, ${'Call ' + t.company_name + (t.owner_name ? ' (' + t.owner_name + ')' : '') + ' — screen against TPS before dialling. Brief: ' + (t.body ?? '').slice(0, 400)}, ${new Date().toISOString().slice(0, 10)})`;
          await sql`update acq.outreach_touches set status='sent', sent_at=now(), provider='task' where id=${t.id}`;
          report.call_tasks++;
        }
      } catch (e) {
        await sql`update acq.outreach_touches set status='failed', error=${String(e).slice(0, 300)} where id=${t.id}`;
        report.failed++;
      }
    }
  }
  return report;
}
