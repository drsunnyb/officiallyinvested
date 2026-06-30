// =============================================================================
// acq-memo — Investment Memo generator (non-blocking)
// Composes a polished investment memo (markdown) from the engine numbers, the
// analyst report and the committee verdict. Stores acq.memos.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM =
  'You are writing a formal Investment Committee memo for {ORG}. Use the deterministic engine numbers, the analyst ' +
  'report and the committee verdict provided. Write in clean, professional markdown with these sections: ' +
  '# Investment Memo - <deal name>; Recommendation (the committee verdict + headline); Executive Summary; ' +
  'Deal Overview; Verified Financials (a markdown table of the key figures, noting any seller contradiction); ' +
  'Valuation (range, sector multiple, opening offer, walk-away); Proposed Funding Structure (senior/vendor/equity ' +
  'with the debt-service and DSCR); The 7-Number Test (a table of the seven results with pass/monitor/fail); ' +
  'Key Risks; Opportunities (value-creation levers); Conditions to Proceed; Recommendation & Next Steps. ' +
  'CRITICAL: use the provided numbers verbatim - never invent figures. Lead the risks with any verified seller ' +
  'contradiction. Be concise and decision-useful.';

const MEMO_TOOL = {
  name: 'submit_memo',
  description: 'Return the finished investment memo.',
  input_schema: {
    type: 'object',
    properties: { title: { type: 'string' }, markdown: { type: 'string', description: 'the full memo in markdown' } },
    required: ['title', 'markdown'],
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
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret')`).map((r: any) => [r.key, r.value]));
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

    const ana = (await sql`select id, report from acq.analyses where deal_id=${body.deal_id} order by created_at desc limit 1`)[0];
    if (!ana) { await sql.end({ timeout: 5 }); return json({ error: 'no analysis yet - run acq-analyze first' }, 422); }
    const val = (await sql`select id, result from acq.valuations where deal_id=${body.deal_id} order by created_at desc limit 1`)[0];
    const ver = (await sql`select id, verdict, detail from acq.committee_verdicts where deal_id=${body.deal_id} order by created_at desc limit 1`)[0];
    const facts = await sql`select metric, period, value, is_self_reported, contradicts_self_reported, source_quote from acq.financial_facts where deal_id=${body.deal_id} and is_self_reported=false`;

    bgTask = (async () => {
      try {
        const system = SYSTEM.replace('{ORG}', deal.org_name);
        const user = JSON.stringify({ deal: { name: deal.name, asset_type: deal.asset_type, sector: deal.sector, asking_price: deal.asking_price }, engine: val?.result ?? null, verified_facts: facts, analyst_report: ana.report, committee: ver ? { verdict: ver.verdict, detail: ver.detail } : null }) + '\n\nWrite the memo and call submit_memo.';
        const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 8000, system, tools: [MEMO_TOOL], tool_choice: { type: 'tool', name: 'submit_memo' }, messages: [{ role: 'user', content: user }] }) });
        if (!ar.ok) { console.error('memo anthropic', ar.status, (await ar.text()).slice(0, 300)); return; }
        const aj = await ar.json();
        const tu = (aj.content ?? []).find((b: any) => b.type === 'tool_use');
        const out: any = tu?.input ?? {};
        if (!out.markdown) return;
        await sql`insert into acq.memos (org_id, deal_id, analysis_id, verdict_id, title, content) values (${deal.org_id}, ${deal.id}, ${ana.id}, ${ver?.id ?? null}, ${out.title ?? ('Investment Memo - ' + deal.name)}, ${out.markdown})`;
      } catch (e) { console.error('memo-bg', e); } finally { await sql.end({ timeout: 5 }); }
    })();

    respPayload = { ok: true, status: 'drafting', analysis_id: ana.id };
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
  if (bgTask) { try { EdgeRuntime.waitUntil(bgTask); } catch (_) { /**/ } }
  return json(respPayload);
});
