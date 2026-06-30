// =============================================================================
// acq-committee — AI Investment Committee (non-blocking)
// Challenges the analyst's case and issues a BUY / WATCH / PASS verdict with
// conditions. Reads the latest analysis + valuation; uses Anthropic tool-use for
// reliable structured output. Stores acq.committee_verdicts.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM_BASE =
  'You are the Investment Committee for {ORG} — an experienced, sceptical panel applying the methodology below. ' +
  'You are given the deal, the deterministic engine output, and the analyst report. Your job is to CHALLENGE the ' +
  'case and reach a disciplined verdict. RULES: (1) Respect hard gates — if the RED filter is "Park" or the ' +
  '7-Number Test is "Walk away", you cannot return BUY (use WATCH with conditions, or PASS). (2) A verified ' +
  'seller contradiction must be resolved before any BUY. (3) Be specific; conditions must be concrete and checkable. ' +
  '(4) Use the engine numbers verbatim.\n\n=== METHODOLOGY ===\n';

const VERDICT_TOOL = {
  name: 'submit_verdict',
  description: 'Return the investment committee verdict.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['BUY', 'WATCH', 'PASS'] },
      headline: { type: 'string', description: 'one-sentence committee position' },
      why_buy: { type: 'array', items: { type: 'string' } },
      why_avoid: { type: 'array', items: { type: 'string' } },
      best_case: { type: 'string' },
      worst_case: { type: 'string' },
      key_risks: { type: 'array', items: { type: 'string' } },
      conditions: { type: 'array', items: { type: 'string' }, description: 'conditions that must be met before proceeding' },
      return_profile: { type: 'string', description: 'the expected return story, referencing cash-on-cash / payback / the multiplier effect' },
    },
    required: ['verdict', 'headline', 'why_buy', 'why_avoid', 'best_case', 'worst_case', 'key_risks', 'conditions', 'return_profile'],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  let bgTask: Promise<unknown> | null = null;
  let respPayload: unknown;
  try {
    const body = await req.json().catch(() => ({} as any));
    if (!body.deal_id) { await sql.end({ timeout: 5 }); return json({ error: 'deal_id required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret','acq_analyst_brief')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key configured' }, 500); }

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

    const ana = (await sql`select id, report, score from acq.analyses where deal_id=${body.deal_id} order by created_at desc limit 1`)[0];
    if (!ana) { await sql.end({ timeout: 5 }); return json({ error: 'no analysis yet - run acq-analyze first' }, 422); }
    const val = (await sql`select result from acq.valuations where deal_id=${body.deal_id} order by created_at desc limit 1`)[0];

    bgTask = (async () => {
      try {
        const system = SYSTEM_BASE.replace('{ORG}', deal.org_name) + (cfg.acq_analyst_brief ?? '');
        const user = JSON.stringify({ deal: { name: deal.name, asset_type: deal.asset_type, sector: deal.sector, asking_price: deal.asking_price }, engine: val?.result ?? null, analyst_report: ana.report, analyst_score: ana.score }) + '\n\nDeliberate, then call submit_verdict.';
        const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system, tools: [VERDICT_TOOL], tool_choice: { type: 'tool', name: 'submit_verdict' }, messages: [{ role: 'user', content: user }] }) });
        if (!ar.ok) { console.error('committee anthropic', ar.status, (await ar.text()).slice(0, 300)); return; }
        const aj = await ar.json();
        const tu = (aj.content ?? []).find((b: any) => b.type === 'tool_use');
        const detail: any = tu?.input ?? {};
        const verdict = ['BUY', 'WATCH', 'PASS'].includes(detail.verdict) ? detail.verdict : 'WATCH';
        await sql`insert into acq.committee_verdicts (org_id, deal_id, analysis_id, verdict, detail, model) values (${deal.org_id}, ${deal.id}, ${ana.id}, ${verdict}, ${sql.json(detail)}, ${aj.model ?? 'claude-sonnet-4-6'})`;
      } catch (e) { console.error('committee-bg', e); } finally { await sql.end({ timeout: 5 }); }
    })();

    respPayload = { ok: true, status: 'deliberating', analysis_id: ana.id };
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
  if (bgTask) { try { EdgeRuntime.waitUntil(bgTask); } catch (_) { /**/ } }
  return json(respPayload);
});
