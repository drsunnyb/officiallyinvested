// =============================================================================
// acq-analyze — Investment Analyst (non-blocking)
// Synchronously: consolidates verified facts, runs the DETERMINISTIC engine,
// stores the valuation, returns immediately. In the background: Claude writes
// the analyst narrative OVER the computed numbers and stores the analysis.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as E from './engine.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const ENGINE_VERSION = 'acq-engine-1';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SECTOR_CATEGORY: Record<string, 'services' | 'trade' | 'waste'> = { waste: 'waste', trade: 'trade' };

const SYSTEM_BASE =
  'You are the senior Investment Analyst for {ORG}, applying the methodology below. You receive (a) the deal, ' +
  '(b) VERIFIED financial facts with provenance and contradiction flags, and (c) DETERMINISTIC ENGINE OUTPUT that ' +
  'has ALREADY been computed (adjusted EBITDA build, valuation range, 4-Multiple, funding stack, 7-Number Test, RED). ' +
  'STRICT RULES: (1) Use the engine numbers VERBATIM - never recompute, round differently, or invent any figure. ' +
  '(2) If a fact contradicts the seller (contradicts_self_reported=true), lead with it and treat self-reported numbers ' +
  'with scepticism. (3) Cite the framework\'s named tools where relevant. (4) Be concrete and decision-useful for an ' +
  'acquisition entrepreneur. Output STRICT JSON only.\n\n=== METHODOLOGY ===\n';

const ANALYSIS_TOOL = {
  name: 'submit_analysis',
  description: 'Return the structured investment analysis for this deal.',
  input_schema: {
    type: 'object',
    properties: {
      executive_summary: { type: 'string', description: '3-5 sentences' },
      financial_analysis: { type: 'string', description: 'references the verified figures and the adjusted EBITDA build' },
      valuation_view: { type: 'string', description: 'the valuation range, sector multiple and where to pitch the deal multiple' },
      recommended_structure: { type: 'string', description: 'the funding stack (senior/vendor/equity) and why' },
      key_risks: { type: 'array', items: { type: 'string' }, description: 'most critical first; include any seller-contradiction and 7-Number failures' },
      opportunities: { type: 'array', items: { type: 'string' }, description: 'EBITDA levers / hidden value' },
      data_gaps: { type: 'array', items: { type: 'string' } },
      suggested_offer: { type: 'object', properties: { opening: { type: 'number' }, walk_away: { type: 'number' }, rationale: { type: 'string' } }, required: ['opening', 'walk_away', 'rationale'] },
      score: { type: 'number', description: '0-100 overall fit/quality score' },
    },
    required: ['executive_summary', 'financial_analysis', 'valuation_view', 'recommended_structure', 'key_risks', 'opportunities', 'data_gaps', 'suggested_offer', 'score'],
  },
};

interface Fact { metric: string; period: string | null; value: number; confidence: number | null; is_self_reported: boolean; contradicts_self_reported: boolean | null; source_quote: string | null; }

function consolidate(facts: Fact[]) {
  const periods = [...new Set(facts.filter((f) => f.period).map((f) => f.period as string))].sort().reverse();
  const target = periods[0] ?? null;
  const pick = (metric: string): number | null => {
    const c = facts.filter((f) => f.metric === metric && (f.period === target || f.period == null));
    if (!c.length) return null;
    c.sort((a, b) => (Number(a.is_self_reported) - Number(b.is_self_reported)) || ((b.confidence ?? 0) - (a.confidence ?? 0)));
    return Number(c[0].value);
  };
  const revByPeriod = new Map<string, number>();
  for (const p of [...periods].reverse()) {
    const c = facts.filter((f) => f.metric === 'revenue' && f.period === p);
    if (c.length) { c.sort((a, b) => Number(a.is_self_reported) - Number(b.is_self_reported)); revByPeriod.set(p, Number(c[0].value)); }
  }
  return { target, pick, revenueTrend: [...revByPeriod.values()] };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  let bgTask: Promise<unknown> | null = null;
  let respPayload: unknown;
  try {
    const body = await req.json().catch(() => ({} as any));
    if (!body.deal_id) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret','acq_analyst_brief','assessment_framework')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key configured' }, 500); }
    const methodology = cfg.acq_analyst_brief || (cfg.assessment_framework ?? '').slice(0, 6000);

    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }

    const deals = await sql`select d.*, o.name as org_name from acq.deals d join acq.organizations o on o.id=d.org_id where d.id=${body.deal_id}`;
    if (!deals.length) { await sql.end({ timeout: 5 }); return json({ error: 'deal not found' }, 404); }
    const deal = deals[0];
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${deal.org_id} and user_id=${userId} and role in ('owner','admin','analyst')`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }

    const facts = (await sql`select metric, period, value, confidence, is_self_reported, contradicts_self_reported, source_quote from acq.financial_facts where deal_id=${body.deal_id}`) as unknown as Fact[];
    if (!facts.length) { await sql.end({ timeout: 5 }); return json({ error: 'no financial facts for this deal - extract documents first' }, 422); }
    const { target, pick, revenueTrend } = consolidate(facts);
    const sector = (deal.sector ?? 'other') as E.SectorKey;

    let engine: any;
    if (deal.asset_type === 'property' || deal.asset_type === 'development') {
      const value = Number(deal.asking_price) || pick('portfolio_value') || 0;
      engine = { kind: 'property', property: E.propertyMetrics({ value, grossRent: pick('gross_rent') ?? undefined, netIncome: pick('net_income') ?? undefined, outstandingDebt: pick('outstanding_debt') ?? undefined, newDebtRate: 0.06, newDebtTermYears: 20, targetNetYield: 0.06 }), price: value };
    } else {
      const eb = E.computeAdjustedEbitda({ operatingProfit: pick('operating_profit') ?? 0, depreciation: pick('depreciation') ?? undefined, amortisation: pick('amortisation') ?? undefined, ownerSalary: pick('owner_salary') ?? undefined, ownerDividends: pick('owner_dividends') ?? undefined, oneOffCosts: pick('one_off_costs') ?? undefined, oneOffIncome: pick('one_off_income') ?? undefined });
      const adjustedEbitda = eb.adjustedEbitda;
      const val = E.valuation({ adjustedEbitda, sector, netDebt: pick('net_debt') ?? undefined, cash: pick('cash') ?? undefined, askingPrice: Number(deal.asking_price) || undefined });
      const four = E.fourMultipleMethod({ askingPrice: Number(deal.asking_price) || 0, adjustedEbitda, sector });
      const price = Number(deal.asking_price) || val.equityValue.mid;
      const stack = E.recommendedFundingStack(price, adjustedEbitda);
      const seven = E.sevenNumberTest({ adjustedEbitda, totalAnnualDebtService: stack.totalAnnualDebtService, vendorAnnualDebtService: stack.vendor.annualDebtService ?? 0, buyerMarketSalary: 60000, equityIn: stack.equity.amount, purchaseMultiple: adjustedEbitda > 0 ? price / adjustedEbitda : 0, sectorRange: { low: val.multipleRange.low, high: val.multipleRange.high }, revenue: pick('revenue') ?? 0, fteCount: pick('employees') ?? 0, sectorCategory: SECTOR_CATEGORY[sector] ?? 'services' });
      const lc = pick('largest_customer_pct'); const rr = pick('recurring_revenue_pct');
      const red = E.redFramework({ revenueTrend, recurringPct: rr != null ? rr / 100 : undefined, largestCustomerPct: lc != null ? lc / 100 : undefined });
      engine = { kind: 'business', period: target, adjustedEbitda: eb, valuation: val, fourMultiple: four, fundingStack: stack, sevenNumber: seven, red, price };
    }

    const valRow = (await sql`insert into acq.valuations (org_id, deal_id, engine_version, inputs, adjusted_ebitda, result) values (${deal.org_id}, ${deal.id}, ${ENGINE_VERSION}, ${sql.json({ period: target, sector })}, ${engine.adjustedEbitda?.adjustedEbitda ?? null}, ${sql.json(engine)}) returning id`)[0];

    // ---- background: analyst narrative + persist (keeps the response fast) ----
    bgTask = (async () => {
      try {
        const verified = facts.filter((f) => !f.is_self_reported).map((f) => ({ metric: f.metric, period: f.period, value: f.value, contradicts_self_reported: f.contradicts_self_reported, source: f.source_quote }));
        const contradictions = verified.filter((f) => f.contradicts_self_reported);
        const system = SYSTEM_BASE.replace('{ORG}', deal.org_name) + methodology;
        const user = JSON.stringify({ deal: { name: deal.name, asset_type: deal.asset_type, sector, asking_price: deal.asking_price }, verified_facts: verified, contradictions, engine }) + '\n\nCall submit_analysis with your full analysis.';
        const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4096, system, tools: [ANALYSIS_TOOL], tool_choice: { type: 'tool', name: 'submit_analysis' }, messages: [{ role: 'user', content: user }] }) });
        if (!ar.ok) { console.error('analyze anthropic', ar.status, (await ar.text()).slice(0, 300)); return; }
        const aj = await ar.json();
        const tu = (aj.content ?? []).find((b: any) => b.type === 'tool_use');
        const report: any = tu?.input ?? {};
        const score = Math.max(0, Math.min(100, Number(report.score) || 0));
        await sql`insert into acq.analyses (org_id, deal_id, valuation_id, summary, report, score, model) values (${deal.org_id}, ${deal.id}, ${valRow.id}, ${report.executive_summary ?? null}, ${sql.json(report)}, ${score}, ${aj.model ?? 'claude-sonnet-4-6'})`;
        await sql`update acq.deals set status='committee', updated_at=now() where id=${deal.id} and status in ('sourced','screening','analysing')`;
      } catch (e) { console.error('analyze-bg', e); } finally { await sql.end({ timeout: 5 }); }
    })();

    respPayload = { ok: true, valuation_id: valRow.id, status: 'analyzing', period: target, adjusted_ebitda: engine.adjustedEbitda?.adjustedEbitda ?? null, valuation_mid: engine.valuation?.equityValue?.mid ?? engine.property?.equityValue ?? null, opening_offer: engine.valuation?.openingOffer ?? null, seven_number_verdict: engine.sevenNumber?.verdict ?? null, red: engine.red?.overall ?? null };
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
  if (bgTask) { try { EdgeRuntime.waitUntil(bgTask); } catch (_) { /* not available locally */ } }
  return json(respPayload);
});
