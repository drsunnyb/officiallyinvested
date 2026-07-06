// =============================================================================
// acq-prospects — the CRM surface for sourced prospects.
// list (paginated, filtered, audit-logged — deliberately NO export action),
// get, update, suppress, promote (prospect -> live deal on the kanban,
// carrying contact + outreach history via the email-safe origination pattern).
// =============================================================================
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
    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else if (!orgId) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'list';

    if (action === 'list') {
      const page = Math.max(1, Number(body.page ?? 1));
      const per = Math.min(50, Math.max(5, Number(body.per ?? 25)));
      const stage = body.stage ?? null; const minFit = body.min_fit != null ? Number(body.min_fit) : null;
      const q = (body.q ?? '').toString().trim(); const provenance = body.provenance ?? null;
      const rows = await sql`
        select id, company_name, company_number, region, postcode, website, owner_name, owner_email, owner_phone,
               provenance, exportable, fit_score, fit_reasons, stage, oldest_director_age, incorporated_on,
               revenue_estimate, revenue_basis, staff_band, submission_id, deal_id, created_at,
               count(*) over() as total
        from acq.prospects
        where org_id=${orgId}
          ${stage ? sql`and stage=${stage}` : sql`and stage not in ('suppressed','disqualified')`}
          ${minFit != null ? sql`and fit_score >= ${minFit}` : sql``}
          ${provenance ? sql`and provenance=${provenance}` : sql``}
          ${q ? sql`and (company_name ilike ${'%' + q + '%'} or company_number = ${q.toUpperCase()} or region ilike ${'%' + q + '%'})` : sql``}
        order by fit_score desc nulls last, created_at desc
        limit ${per} offset ${(page - 1) * per}`;
      const total = rows.length ? Number(rows[0].total) : 0;
      await sql`insert into acq.access_log (org_id, user_id, action, detail) values (${orgId}, ${userId}, 'prospects_list', ${{ page, per, stage, q, returned: rows.length }})`;
      const counts = await sql`select stage, count(*)::int as n from acq.prospects where org_id=${orgId} group by stage`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, prospects: rows.map(({ total: _t, ...r }: any) => r), total, page, per, stage_counts: Object.fromEntries(counts.map((c: any) => [c.stage, c.n])) });
    }

    if (action === 'get') {
      const p = (await sql`select * from acq.prospects where id=${body.prospect_id} and org_id=${orgId}`)[0];
      if (!p) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      const touches = await sql`select id, channel, status, subject, body, scheduled_at, sent_at, error, created_at from acq.outreach_touches where prospect_id=${p.id} order by created_at desc limit 50`;
      const memberships = await sql`select m.id, m.status, m.current_step, m.next_action_at, c.name as campaign_name, c.id as campaign_id from acq.campaign_members m join acq.campaigns c on c.id=m.campaign_id where m.prospect_id=${p.id}`;
      await sql`insert into acq.access_log (org_id, user_id, action, detail) values (${orgId}, ${userId}, 'prospect_view', ${{ prospect_id: p.id }})`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, prospect: p, touches, memberships });
    }

    if (action === 'update') {
      const allowed = ['owner_name','owner_email','owner_phone','website','notes','stage','region'];
      const patch: Record<string, unknown> = {};
      for (const k of allowed) if (body[k] !== undefined) patch[k] = body[k];
      if (patch.stage && !['new','enriched','qualified','disqualified'].includes(String(patch.stage))) delete patch.stage;
      if (!Object.keys(patch).length) { await sql.end({ timeout: 5 }); return json({ error: 'nothing to update' }, 400); }
      const p = (await sql`update acq.prospects set ${sql(patch)}, updated_at=now() where id=${body.prospect_id} and org_id=${orgId} returning *`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, prospect: p });
    }

    if (action === 'suppress') {
      const p = (await sql`select * from acq.prospects where id=${body.prospect_id} and org_id=${orgId}`)[0];
      if (!p) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      const reason = body.reason ?? 'manual';
      if (p.owner_email) await sql`insert into acq.suppressions (org_id, kind, value, reason) values (${orgId}, 'email', ${p.owner_email.toLowerCase()}, ${reason}) on conflict do nothing`;
      if (p.company_number) await sql`insert into acq.suppressions (org_id, kind, value, reason) values (${orgId}, 'company_number', ${p.company_number}, ${reason}) on conflict do nothing`;
      await sql`update acq.prospects set stage='suppressed', updated_at=now() where id=${p.id}`;
      await sql`update acq.outreach_touches set status='cancelled' where prospect_id=${p.id} and status in ('queued','needs_approval','approved')`;
      await sql`update acq.campaign_members set status='suppressed' where prospect_id=${p.id}`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    if (action === 'promote') {
      const p = (await sql`select * from acq.prospects where id=${body.prospect_id} and org_id=${orgId}`)[0];
      if (!p) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }
      if (p.submission_id) { await sql.end({ timeout: 5 }); return json({ error: 'already promoted' }, 400); }
      // EMAIL-SAFE origination insert (same pattern as acq-create-deal).
      const safeEmail = cfg.from_email || 'deals@officiallyinvested.com';
      const notes = ['Originated from CRM prospect.', p.fit_reasons ? `Fit: ${p.fit_reasons}` : null, p.owner_name ? `Owner: ${p.owner_name}` : null, p.company_number ? `Company number: ${p.company_number}` : null, body.notes ?? null].filter(Boolean).join('\n');
      const sub = (await sql`
        insert into public.submissions (type, submitter_name, email, phone, submitter_role, heard_via, business_name, sector, revenue, website, notes, consent, marketing_optin, status)
        values ('business', 'Officially Invested (origination)', ${safeEmail}, '', 'other', 'origination', ${p.company_name}, ${(p.sic_codes ?? [])[0] ?? null}, ${p.revenue_estimate}, ${p.website}, ${notes}, true, false, 'reviewing')
        returning id, reference`)[0];

      // Let the existing find-or-create build the acq deal, then attach people + history.
      let dealId: string | null = null;
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/acq-deal-get`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acq-secret': cfg.acq_internal_secret }, body: JSON.stringify({ submission_id: sub.id }) });
        if (r.ok) dealId = (await r.json())?.deal?.id ?? null;
      } catch (_) { /* deal will be created on first open instead */ }

      let contactId: string | null = p.contact_id;
      if (!contactId && (p.owner_name || p.owner_email)) {
        const existing = p.owner_email ? (await sql`select id from acq.contacts where org_id=${orgId} and lower(email)=${p.owner_email.toLowerCase()} limit 1`)[0] : null;
        contactId = existing?.id ?? (await sql`insert into acq.contacts (org_id, name, role, company, email, phone, notes) values (${orgId}, ${p.owner_name ?? p.company_name}, 'vendor', ${p.company_name}, ${p.owner_email}, ${p.owner_phone}, 'From origination CRM') returning id`)[0].id;
      }
      if (dealId && contactId) await sql`insert into acq.deal_contacts (deal_id, contact_id, role) values (${dealId}, ${contactId}, 'vendor') on conflict (deal_id, contact_id) do nothing`;
      if (dealId) {
        const touches = await sql`select channel, subject, body, sent_at from acq.outreach_touches where prospect_id=${p.id} and status='sent' order by sent_at`;
        for (const t of touches) {
          await sql`insert into acq.communications (org_id, deal_id, contact_id, direction, kind, subject, body, happened_at)
            values (${orgId}, ${dealId}, ${contactId}, 'out', ${t.channel === 'letter' ? 'note' : 'email'}, ${t.subject ?? (t.channel === 'letter' ? 'Letter sent' : null)}, ${t.body}, ${t.sent_at ?? new Date()})`;
        }
      }
      await sql`update acq.prospects set stage='promoted', submission_id=${sub.id}, deal_id=${dealId}, contact_id=${contactId}, updated_at=now() where id=${p.id}`;
      await sql`update acq.campaign_members set status='finished' where prospect_id=${p.id} and status='active'`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, submission_id: sub.id, reference: sub.reference, deal_id: dealId });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
