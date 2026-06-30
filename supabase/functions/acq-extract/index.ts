// =============================================================================
// acq-extract — Document Intelligence
// Reads an uploaded financial document (PDF natively via Claude, or text/CSV),
// extracts concrete figures WITH PROVENANCE into acq.financial_facts, and flags
// any figure that contradicts the seller's self-reported number (>12%).
//
// Auth: x-acq-secret (server/test) OR a signed-in member with write access.
// acq.* is reached by a direct Postgres connection (the schema is not exposed
// to the REST API).
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64, decodeBase64 } from 'jsr:@std/encoding@1/base64';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Controlled metric vocabulary — aligned with the financial engine's inputs.
const METRICS = new Set([
  'revenue', 'gross_profit', 'operating_profit', 'ebitda', 'depreciation', 'amortisation',
  'owner_salary', 'owner_dividends', 'one_off_costs', 'one_off_income', 'net_debt', 'cash',
  'debtors', 'creditors', 'debtor_days', 'largest_customer_pct', 'recurring_revenue_pct',
  'employees', 'gross_rent', 'net_income', 'portfolio_value', 'outstanding_debt',
]);

const SYSTEM =
  'You are a financial-document extraction engine for UK acquisition due diligence. You read statutory accounts, ' +
  'management accounts, P&Ls, VAT returns, bank statements and rent rolls, and extract concrete figures with EXACT ' +
  'provenance. You never estimate, infer, or normalise figures that are not explicitly present in the document. ' +
  'All values in GBP as plain numbers (no symbols, no commas, no thousands). Output STRICT JSON only.';

const PROMPT =
  'Extract every concrete financial figure relevant to valuing or financing this business/asset. ' +
  'Use ONLY these metric keys (ignore anything that does not map cleanly): ' +
  'revenue, gross_profit, operating_profit, ebitda, depreciation, amortisation, owner_salary, owner_dividends, ' +
  'one_off_costs, one_off_income, net_debt, cash, debtors, creditors, debtor_days, largest_customer_pct, ' +
  'recurring_revenue_pct, employees, gross_rent, net_income, portfolio_value, outstanding_debt. ' +
  'For each figure return: metric (one of the keys), period (e.g. "FY2024" or null), value (number, GBP; percentages as the number e.g. 18 for 18%), ' +
  'source_quote (the verbatim line/label the figure came from), source_page (the page number it appears on, integer, or null), ' +
  'confidence (0-1). If the same metric appears for several years, return one row per year. ' +
  'Return ONLY: {"facts":[{"metric":...,"period":...,"value":...,"source_quote":...,"source_page":...,"confidence":...}]}';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  let documentId: string | null = null;
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries(
      (await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret')`).map((r: any) => [r.key, r.value]),
    );
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    if (!ANTHROPIC) return json({ error: 'no anthropic key configured' }, 500);

    // ---- auth ----
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) return json({ error: 'unauthorised' }, 401);
      userId = data.user.id;
    }

    // ---- resolve the document bytes (storage doc OR inline base64) ----
    let orgId: string, dealId: string, bytes: Uint8Array, mediaType: string;
    if (body.document_id) {
      const rows = await sql`select id, org_id, deal_id, storage_path, file_type from acq.documents where id=${body.document_id}`;
      if (!rows.length) return json({ error: 'document not found' }, 404);
      const doc = rows[0];
      documentId = doc.id; orgId = doc.org_id; dealId = doc.deal_id; mediaType = doc.file_type || 'application/pdf';
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${doc.storage_path}`, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
      if (!r.ok) { await sql`update acq.documents set extraction_status='failed', extraction_error=${'download ' + r.status} where id=${documentId}`; return json({ error: 'storage download failed' }, 502); }
      bytes = new Uint8Array(await r.arrayBuffer());
    } else if (body.inline?.base64 && body.deal_id) {
      dealId = body.deal_id; mediaType = body.inline.media_type || 'application/pdf';
      const d = await sql`select org_id from acq.deals where id=${dealId}`;
      if (!d.length) return json({ error: 'deal not found' }, 404);
      orgId = d[0].org_id;
      bytes = decodeBase64(body.inline.base64);
    } else {
      return json({ error: 'document_id, or inline.base64 + deal_id, required' }, 400);
    }

    // ---- membership (user path) ----
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${orgId} and user_id=${userId} and role in ('owner','admin','analyst')`;
      if (!m.length) return json({ error: 'forbidden' }, 403);
    }

    if (documentId) await sql`update acq.documents set extraction_status='processing', extraction_error=null where id=${documentId}`;

    // ---- build the Claude request ----
    let contentBlock: any;
    if (mediaType === 'application/pdf') contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } };
    else if (mediaType.startsWith('text/')) contentBlock = { type: 'text', text: new TextDecoder().decode(bytes) };
    else { if (documentId) await sql`update acq.documents set extraction_status='failed', extraction_error=${'unsupported type ' + mediaType} where id=${documentId}`; return json({ error: 'unsupported media type ' + mediaType }, 415); }

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: PROMPT }] }] }),
    });
    if (!ar.ok) { const t = await ar.text(); if (documentId) await sql`update acq.documents set extraction_status='failed', extraction_error=${('anthropic ' + ar.status + ' ' + t).slice(0, 500)} where id=${documentId}`; return json({ error: 'anthropic ' + ar.status, detail: t.slice(0, 300) }, 502); }
    const aj = await ar.json();
    let text = (aj.content ?? []).map((b: any) => b.text ?? '').join('').replace(/```json|```/g, '');
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    let parsed: any = { facts: [] };
    try { parsed = JSON.parse(text.slice(a, b + 1)); } catch (_) { /* leave empty */ }
    const facts = Array.isArray(parsed.facts) ? parsed.facts : [];

    // ---- write facts + contradiction check (the automated bank-statement test) ----
    let inserted = 0, contradictions = 0;
    for (const f of facts) {
      if (!f || !METRICS.has(f.metric) || f.value == null || isNaN(Number(f.value))) continue;
      const val = Number(f.value);
      const sr = await sql`select value from acq.financial_facts where deal_id=${dealId} and metric=${f.metric} and is_self_reported=true and period is not distinct from ${f.period ?? null} order by created_at desc limit 1`;
      let contradicts: boolean | null = null;
      if (sr.length && Number(sr[0].value) !== 0) { const diff = Math.abs(val - Number(sr[0].value)) / Math.abs(Number(sr[0].value)); contradicts = diff > 0.12; if (contradicts) contradictions++; }
      await sql`insert into acq.financial_facts (org_id, deal_id, document_id, metric, period, value, unit, confidence, source_quote, source_page, is_self_reported, contradicts_self_reported, model)
        values (${orgId}, ${dealId}, ${documentId}, ${f.metric}, ${f.period ?? null}, ${val}, 'GBP', ${f.confidence ?? null}, ${String(f.source_quote ?? '').slice(0, 500)}, ${f.source_page ?? null}, false, ${contradicts}, ${aj.model ?? 'claude-sonnet-4-6'})`;
      inserted++;
    }
    if (documentId) await sql`update acq.documents set extraction_status='done' where id=${documentId}`;

    return json({ ok: true, deal_id: dealId, facts_extracted: inserted, contradictions, model: aj.model });
  } catch (e) {
    if (documentId) { try { await sql`update acq.documents set extraction_status='failed', extraction_error=${String(e).slice(0, 500)} where id=${documentId}`; } catch (_) { /**/ } }
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
