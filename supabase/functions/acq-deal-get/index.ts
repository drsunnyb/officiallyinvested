// =============================================================================
// acq-deal-get — read/linkage endpoint for the admin UI
// Given a submission_id (a kanban deal) it find-or-creates the linked acq.deal
// (seeding self-reported facts from the submission), then returns the full
// analysis bundle the drawer renders. Also accepts deal_id directly.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

function sectorKey(sub: any): string {
  const s = `${sub.sector ?? ''} ${sub.property_type ?? ''}`.toLowerCase();
  if (/domiciliary|home care/.test(s)) return 'care_domiciliary';
  if (/care|nursing|residential/.test(s)) return 'care_residential';
  if (/dental/.test(s)) return 'dental';
  if (/nursery|childcare|child care/.test(s)) return 'childcare';
  if (/funeral/.test(s)) return 'funeral';
  if (/storage/.test(s)) return 'self_storage';
  if (/garage|vehicle|mot/.test(s)) return 'vehicle_services';
  if (/plumb|electric|hvac|heating|trade/.test(s)) return 'trade';
  if (/waste|recycl|skip/.test(s)) return 'waste';
  if (/clean|facilities|fm\b/.test(s)) return 'fm_cleaning';
  if (/pest/.test(s)) return 'pest_control';
  if (/pharmac/.test(s)) return 'pharmacy';
  if (/transport|logistic|haulage/.test(s)) return 'transport_logistics';
  return 'other';
}

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

    // resolve the user's org (single-org assumption for now)
    let orgId: string | null = body.org_id ?? null;
    if (!orgId && userId) { const m = await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`; orgId = m[0]?.org_id ?? null; }
    if (!orgId && trusted) { const o = await sql`select id from acq.organizations order by created_at limit 1`; orgId = o[0]?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org for user' }, 403); }
    if (userId) { const mm = await sql`select 1 from acq.org_members where org_id=${orgId} and user_id=${userId}`; if (!mm.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); } }

    // find-or-create the acq.deal
    let deal: any;
    if (body.deal_id) {
      deal = (await sql`select * from acq.deals where id=${body.deal_id} and org_id=${orgId}`)[0];
    } else if (body.submission_id) {
      deal = (await sql`select * from acq.deals where submission_id=${body.submission_id} and org_id=${orgId}`)[0];
      if (!deal) {
        const sub = (await sql`select * from public.submissions where id=${body.submission_id}`)[0];
        if (!sub) { await sql.end({ timeout: 5 }); return json({ error: 'submission not found' }, 404); }
        const assetType = sub.type === 'property' ? (sub.deal_kind === 'development' ? 'development' : 'property') : 'business';
        const name = sub.business_name || sub.spv_name || sub.submitter_name || 'Untitled deal';
        const asking = sub.asking_price ?? null;
        deal = (await sql`insert into acq.deals (org_id, name, asset_type, sector, status, source, asking_price, submission_id, created_by)
          values (${orgId}, ${name}, ${assetType}, ${sectorKey(sub)}, 'screening', 'pipeline', ${asking}, ${sub.id}, ${userId})
          returning *`)[0];
        // seed self-reported facts from the submission (overridden later by verified extraction)
        const seed: [string, any][] = [
          ['revenue', sub.revenue], ['operating_profit', sub.net_profit], ['portfolio_value', sub.portfolio_value],
          ['net_income', sub.net_income], ['gross_rent', sub.gross_rent], ['outstanding_debt', sub.outstanding_debt],
        ];
        for (const [metric, value] of seed) {
          if (value != null && value !== '') {
            await sql`insert into acq.financial_facts (org_id, deal_id, metric, period, value, unit, confidence, is_self_reported, source_quote)
              values (${orgId}, ${deal.id}, ${metric}, 'self-reported', ${Number(value)}, 'GBP', 1.0, true, 'Submitted on the intake form')`;
          }
        }
      }
    } else { await sql.end({ timeout: 5 }); return json({ error: 'submission_id or deal_id required' }, 400); }
    if (!deal) { await sql.end({ timeout: 5 }); return json({ error: 'deal not found' }, 404); }

    // bundle
    const facts = await sql`select id, document_id, metric, period, value, unit, confidence, source_quote, source_page, is_self_reported, contradicts_self_reported from acq.financial_facts where deal_id=${deal.id} order by is_self_reported, period desc nulls last, metric`;
    const documents = await sql`select id, file_name, doc_kind, extraction_status, uploaded_at from acq.documents where deal_id=${deal.id} order by uploaded_at desc`;
    const valuation = (await sql`select id, adjusted_ebitda, result, created_at from acq.valuations where deal_id=${deal.id} order by created_at desc limit 1`)[0] ?? null;
    const analysis = (await sql`select id, summary, report, score, created_at from acq.analyses where deal_id=${deal.id} order by created_at desc limit 1`)[0] ?? null;
    const verdict = (await sql`select id, verdict, detail, created_at from acq.committee_verdicts where deal_id=${deal.id} order by created_at desc limit 1`)[0] ?? null;
    const memo = (await sql`select id, title, content, created_at from acq.memos where deal_id=${deal.id} order by created_at desc limit 1`)[0] ?? null;
    const drafts = await sql`select id, action_key, kind, recipient_role, subject, body, created_at from acq.drafts where deal_id=${deal.id} order by created_at desc limit 30`;

    return json({ ok: true, deal, facts, documents, valuation, analysis, verdict, memo, drafts });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
