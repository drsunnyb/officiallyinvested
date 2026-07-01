// =============================================================================
// acq-complete-doc — take an uploaded document + the deal's known context + the
// details the user just supplied, and produce a COMPLETED, filled-in version of
// that document. Saved as an editable acq.drafts row (kind 'doc') and also
// returned as a .docx so the user can carry on in Word.
// Dual auth: x-acq-secret OR a signed-in member with write access.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import JSZip from 'npm:jszip@3.10.1';
import * as XLSX from 'npm:xlsx@0.18.5';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS_MIME = 'application/vnd.ms-excel';

function clean(t: string) {
  return String(t || '').replace(/\r/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/`+/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\n{3,}/g, '\n\n').trim();
}
function xmlEsc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function decodeEntities(s: string) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16)));
}
async function docxToText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  const chunks: string[] = [];
  for (const n of (names.length ? names : ['word/document.xml'])) {
    const f = zip.file(n); if (!f) continue;
    let xml = await f.async('string');
    xml = xml.replace(/<w:tab\/?>/g, '\t').replace(/<w:br\/?>/g, '\n').replace(/<\/w:p>/g, '\n');
    chunks.push(decodeEntities(xml.replace(/<[^>]+>/g, '')));
  }
  return chunks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
function xlsxToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: 'array' });
  return wb.SheetNames.map((n) => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join('\n\n').trim();
}
// build a minimal but valid .docx from plain text (one paragraph per line)
async function textToDocx(title: string, bodyText: string): Promise<string> {
  const lines = (title + '\n\n' + bodyText).split('\n');
  const paras = lines.map((ln, i) => {
    const bold = i === 0 ? '<w:pPr><w:rPr><w:b/><w:sz w:val="30"/></w:rPr></w:pPr>' : '';
    const rpr = i === 0 ? '<w:rPr><w:b/><w:sz w:val="30"/></w:rPr>' : '';
    return `<w:p>${bold}<w:r>${rpr}<w:t xml:space="preserve">${xmlEsc(ln)}</w:t></w:r></w:p>`;
  }).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`);
  const out = await zip.generateAsync({ type: 'uint8array' });
  return encodeBase64(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    if (!body.document_id) { await sql.end({ timeout: 5 }); return json({ error: 'document_id required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret','acq_analyst_brief','drafting_rules')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }, 500); }

    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }

    const doc = (await sql`select id, org_id, deal_id, storage_path, file_name, file_type, doc_summary from acq.documents where id=${body.document_id}`)[0];
    if (!doc) { await sql.end({ timeout: 5 }); return json({ error: 'document not found' }, 404); }
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${doc.org_id} and user_id=${userId} and role in ('owner','admin','analyst')`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }

    // original document content (best effort)
    let original = '';
    let pdfBlock: any = null;
    if (doc.storage_path && !doc.storage_path.startsWith('inline/')) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${doc.storage_path}`, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
      if (r.ok) {
        const bytes = new Uint8Array(await r.arrayBuffer());
        const mt = doc.file_type || '';
        const ext = (String(doc.file_name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
        try {
          if (mt === 'application/pdf' || ext === 'pdf') pdfBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } };
          else if (mt === DOCX_MIME || ext === 'docx') original = await docxToText(bytes);
          else if (mt === XLSX_MIME || mt === XLS_MIME || ext === 'xlsx' || ext === 'xls') original = xlsxToText(bytes);
          else if (mt.startsWith('text/') || ext === 'csv' || ext === 'txt') original = new TextDecoder().decode(bytes);
        } catch (_) { /* fall back to summary */ }
      }
    }

    const deal = (await sql`select d.*, o.name as org_name from acq.deals d join acq.organizations o on o.id=d.org_id where d.id=${doc.deal_id}`)[0];
    const facts = await sql`select metric, period, value, is_self_reported, contradicts_self_reported from acq.financial_facts where deal_id=${doc.deal_id}`;
    const val = (await sql`select result from acq.valuations where deal_id=${doc.deal_id} order by created_at desc limit 1`)[0];
    const comms = (await sql`select kind, subject, body, happened_at from acq.communications where deal_id=${doc.deal_id} order by happened_at desc limit 30`).map((c: any) => ({ kind: c.kind, subject: c.subject, note: String(c.body || '').slice(0, 700) }));

    const system =
      `You are the Acquisition Manager for ${deal?.org_name || 'the firm'}, completing a document on the principal's behalf in their professional voice. ` +
      (cfg.drafting_rules ? `\n\nVOICE & DRAFTING RULES:\n${cfg.drafting_rules}\n` : '') +
      (cfg.acq_analyst_brief ? `\n\nMETHODOLOGY (for grounding, not to quote verbatim):\n${cfg.acq_analyst_brief}\n` : '') +
      `\n\nTASK: Produce a COMPLETED, filled-in version of the document below. Keep its structure and headings, fill every blank or placeholder using the KNOWN DEAL CONTEXT and the DETAILS THE USER JUST SUPPLIED. Where a value genuinely is not known, write a clear bracketed placeholder like [to be confirmed] rather than inventing it. Never invent figures. ` +
      `Write as a human, never as AI: no em-dash character, no clichés, no corporate filler, no meta-commentary or notes-to-self, output only the finished document the user would actually use. Plain text only: no markdown, no asterisks, no hash headings, use plain Title Case headings on their own line.`;

    const contextText = 'KNOWN DEAL CONTEXT:\n' + JSON.stringify({ deal: deal ? { name: deal.name, asset_type: deal.asset_type, sector: deal.sector, asking_price: deal.asking_price } : null, verified_and_reported_figures: facts, engine: val?.result ?? null, notes_and_correspondence: comms }).slice(0, 60000);
    const suppliedText = 'DETAILS THE USER JUST SUPPLIED:\n' + String(body.answers || '(none)').slice(0, 8000);
    const originalText = original ? ('ORIGINAL DOCUMENT (' + (doc.file_name || 'document') + '):\n' + original.slice(0, 120000)) : (doc.doc_summary ? ('ORIGINAL DOCUMENT SUMMARY:\n' + doc.doc_summary) : 'ORIGINAL DOCUMENT: (content not readable, base it on the file name and context)');

    const content: any[] = [];
    if (pdfBlock) content.push(pdfBlock);
    content.push({ type: 'text', text: [originalText, contextText, suppliedText, 'Complete the document now and call submit_doc.'].join('\n\n') });

    const tools = [{ name: 'submit_doc', description: 'Return the completed document.', input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string', description: 'the finished document as clean plain text' } }, required: ['title', 'body'] } }];
    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system, tools, tool_choice: { type: 'tool', name: 'submit_doc' }, messages: [{ role: 'user', content }] }),
    });
    if (!ar.ok) { const t = await ar.text(); await sql.end({ timeout: 5 }); return json({ error: 'anthropic ' + ar.status, detail: t.slice(0, 300) }, 502); }
    const aj = await ar.json();
    const out: any = (aj.content ?? []).find((x: any) => x.type === 'tool_use')?.input ?? {};
    const title = clean(out.title || ('Completed, ' + (doc.file_name || 'document')));
    const bodyText = clean(out.body || '');
    if (!bodyText) { await sql.end({ timeout: 5 }); return json({ error: 'no document produced' }, 502); }

    const row = (await sql`insert into acq.drafts (org_id, deal_id, action_key, kind, recipient_role, subject, body, model, created_by)
      values (${doc.org_id}, ${doc.deal_id}, 'complete_doc', 'doc', null, ${title}, ${bodyText}, ${aj.model ?? 'claude-sonnet-4-6'}, ${userId})
      returning id, action_key, kind, recipient_role, subject, body, created_at`)[0];
    await sql.end({ timeout: 5 });

    const docx_base64 = await textToDocx(title, bodyText);
    return json({ ok: true, draft: row, docx_base64 });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
});
