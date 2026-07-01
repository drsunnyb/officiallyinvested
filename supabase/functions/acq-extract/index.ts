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
import JSZip from 'npm:jszip@3.10.1';
import * as XLSX from 'npm:xlsx@0.18.5';

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

// Claude reads PDFs natively; Word/Excel we convert to text first so any common
// document a seller or broker sends (accounts, appraisals, proposals) can be ingested.
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)));
}
async function docxToText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  const ordered = names.sort((a, b) => (a.includes('document') ? -1 : 1) - (b.includes('document') ? -1 : 1));
  const chunks: string[] = [];
  for (const n of (names.length ? ordered : ['word/document.xml'])) {
    const f = zip.file(n); if (!f) continue;
    let xml = await f.async('string');
    xml = xml.replace(/<w:tab\/?>/g, '\t').replace(/<w:br\/?>/g, '\n').replace(/<\/w:p>/g, '\n');
    chunks.push(decodeEntities(xml.replace(/<[^>]+>/g, '')));
  }
  return chunks.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function xlsxToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array' });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name], { blankrows: false });
    if (csv.trim()) out.push(`Sheet: ${name}\n${csv}`);
  }
  return out.join('\n\n').trim();
}

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
  'ALSO classify the document: doc_type (a short human label, e.g. "Statutory accounts", "Funding application", "Land or development appraisal", "Lease", "Heads of Terms", "Information memorandum") and summary (one plain sentence). ' +
  'ALSO identify required_inputs: the things this document still needs FROM THE USER to be acted on or completed, given this is an acquisition of a business, property or land. ' +
  'Examples: a funding application missing the requested amount, purpose of funds, security offered, or repayment/exit plan; a land or development appraisal missing GDV, build cost, planning status, programme/timeline, or exit route; a lease missing term or rent review; accounts missing recent management figures or bank statements to verify. ' +
  'You are ALSO given KNOWN DEAL CONTEXT (figures, prior documents and notes already on this deal). Use it: do NOT list a gap that the known context already answers, and for each remaining gap add a "suggested" value taken from the known context when one is implied (otherwise set "suggested" to ""). ' +
  'Only list genuine gaps a person must supply, each as {"field": short label, "why": one line, "suggested": best value from the known context or ""}. Maximum 6. If nothing is needed, return an empty array. ' +
  'Return ONLY: {"facts":[{"metric":...,"period":...,"value":...,"source_quote":...,"source_page":...,"confidence":...}], "doc_type":"...", "summary":"...", "required_inputs":[{"field":"...","why":"...","suggested":"..."}]}';

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
    let orgId: string, dealId: string, bytes: Uint8Array, mediaType: string, fname = '';
    if (body.document_id) {
      const rows = await sql`select id, org_id, deal_id, storage_path, file_name, file_type from acq.documents where id=${body.document_id}`;
      if (!rows.length) return json({ error: 'document not found' }, 404);
      const doc = rows[0];
      documentId = doc.id; orgId = doc.org_id; dealId = doc.deal_id; mediaType = doc.file_type || 'application/pdf'; fname = String(doc.file_name || '');
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${doc.storage_path}`, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
      if (!r.ok) { await sql`update acq.documents set extraction_status='failed', extraction_error=${'download ' + r.status} where id=${documentId}`; return json({ error: 'storage download failed' }, 502); }
      bytes = new Uint8Array(await r.arrayBuffer());
    } else if (body.inline?.base64 && body.deal_id) {
      dealId = body.deal_id; mediaType = body.inline.media_type || 'application/pdf';
      const d = await sql`select org_id from acq.deals where id=${dealId}`;
      if (!d.length) return json({ error: 'deal not found' }, 404);
      orgId = d[0].org_id;
      bytes = decodeBase64(body.inline.base64);
      const fn = String(body.inline.file_name || 'document').slice(0, 200);
      fname = fn;
      // persist the bytes to storage so the file can be opened/downloaded later
      const safe = fn.replace(/[^a-zA-Z0-9._-]/g, '_');
      let storagePath = `${dealId}/${Date.now()}-${safe}`;
      const up = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${storagePath}`, {
        method: 'POST', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'content-type': mediaType, 'x-upsert': 'true' }, body: bytes,
      });
      if (!up.ok) storagePath = 'inline/' + fn;
      const drow = (await sql`insert into acq.documents (org_id, deal_id, storage_path, file_name, file_type, doc_kind, extraction_status, uploaded_by)
        values (${orgId}, ${dealId}, ${storagePath}, ${fn}, ${mediaType}, 'other', 'processing', ${userId}) returning id`)[0];
      documentId = drow.id;
    } else {
      return json({ error: 'document_id, or inline.base64 + deal_id, required' }, 400);
    }
    const ext = (fname.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

    // ---- membership (user path) ----
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${orgId} and user_id=${userId} and role in ('owner','admin','analyst')`;
      if (!m.length) return json({ error: 'forbidden' }, 403);
    }

    if (documentId) await sql`update acq.documents set extraction_status='processing', extraction_error=null where id=${documentId}`;

    // ---- build the Claude request ----
    // PDFs go to Claude natively; Word/Excel/CSV/text we convert to text first.
    let contentBlock: any;
    try {
      if (mediaType === 'application/pdf' || ext === 'pdf') {
        contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } };
      } else if (mediaType === DOCX_MIME || ext === 'docx') {
        const txt = await docxToText(bytes);
        if (!txt.trim()) throw new Error('no readable text in the Word document');
        contentBlock = { type: 'text', text: txt.slice(0, 200000) };
      } else if (mediaType === XLSX_MIME || mediaType === XLS_MIME || ext === 'xlsx' || ext === 'xls') {
        const txt = xlsxToText(bytes);
        if (!txt.trim()) throw new Error('no readable data in the spreadsheet');
        contentBlock = { type: 'text', text: txt.slice(0, 200000) };
      } else if (mediaType.startsWith('text/') || ext === 'csv' || ext === 'txt') {
        contentBlock = { type: 'text', text: new TextDecoder().decode(bytes).slice(0, 200000) };
      } else {
        if (documentId) await sql`update acq.documents set extraction_status='failed', extraction_error=${'unsupported type ' + mediaType + (ext ? ' (.' + ext + ')' : '')} where id=${documentId}`;
        return json({ error: 'unsupported media type ' + mediaType, hint: 'Supported: PDF, Word (.docx), Excel (.xlsx/.xls), CSV, text. For a .doc or scanned image, save as PDF and re-upload.' }, 415);
      }
    } catch (conv: any) {
      if (documentId) await sql`update acq.documents set extraction_status='failed', extraction_error=${('could not read file: ' + String(conv?.message || conv)).slice(0, 500)} where id=${documentId}`;
      return json({ error: 'could not read file', detail: String(conv?.message || conv) }, 422);
    }

    // what the deal already knows, so we skip gaps already answered and pre-fill the rest
    const kFacts = await sql`select metric, period, value, is_self_reported from acq.financial_facts where deal_id=${dealId} order by is_self_reported, period desc nulls last limit 40`;
    const kDocs = await sql`select file_name, doc_kind, doc_summary from acq.documents where deal_id=${dealId} and id <> ${documentId} order by uploaded_at desc limit 20`;
    const kComms = (await sql`select kind, subject, body from acq.communications where deal_id=${dealId} order by happened_at desc limit 25`).map((c: any) => ({ kind: c.kind, subject: c.subject, note: String(c.body || '').slice(0, 600) }));
    const kDeal = (await sql`select name, asset_type, sector, asking_price from acq.deals where id=${dealId}`)[0] ?? null;
    const knownContext = JSON.stringify({ deal: kDeal, verified_and_reported_figures: kFacts, other_documents: kDocs, notes_and_correspondence: kComms });

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system: SYSTEM, messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: 'KNOWN DEAL CONTEXT (already on this deal, use it to pre-fill and to skip gaps that are already answered):\n' + knownContext.slice(0, 60000) }, { type: 'text', text: PROMPT }] }] }),
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
    const requiredInputs = Array.isArray(parsed.required_inputs) ? parsed.required_inputs.filter((x: any) => x && x.field).slice(0, 6) : [];
    const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : null;
    if (documentId) await sql`update acq.documents set extraction_status='done', doc_summary=${summary}, required_inputs=${sql.json(requiredInputs)} where id=${documentId}`;

    return json({ ok: true, deal_id: dealId, document_id: documentId, facts_extracted: inserted, contradictions, doc_type: parsed.doc_type ?? null, required_inputs: requiredInputs, model: aj.model });
  } catch (e) {
    if (documentId) { try { await sql`update acq.documents set extraction_status='failed', extraction_error=${String(e).slice(0, 500)} where id=${documentId}`; } catch (_) { /**/ } }
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
