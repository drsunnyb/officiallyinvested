// =============================================================================
// acq-kb-extract — read one knowledge-base file (already stored) and produce its
// full text + a short summary, saved on acq.knowledge_docs. Org-level reference
// material, not tied to a deal. Auth: x-acq-secret OR member JWT.
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
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSXM = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLS = 'application/vnd.ms-excel';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
function dents(s: string) { return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-fA-F]+);/g, (_m, n) => String.fromCharCode(parseInt(n, 16))); }
async function docxToText(bytes: Uint8Array) { const zip = await JSZip.loadAsync(bytes); const names = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n)); const out: string[] = []; for (const n of (names.length ? names : ['word/document.xml'])) { const f = zip.file(n); if (!f) continue; let x = await f.async('string'); x = x.replace(/<w:tab\/?>/g, '\t').replace(/<w:br\/?>/g, '\n').replace(/<\/w:p>/g, '\n'); out.push(dents(x.replace(/<[^>]+>/g, ''))); } return out.join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function xlsxToText(bytes: Uint8Array) { const wb = XLSX.read(bytes, { type: 'array' }); return wb.SheetNames.map((n) => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n], { blankrows: false })}`).join('\n\n').trim(); }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  let kbId: string | null = null;
  try {
    const body = await req.json().catch(() => ({} as any));
    kbId = body.knowledge_doc_id ?? null;
    if (!kbId) { await sql.end({ timeout: 5 }); return json({ error: 'knowledge_doc_id required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      const kdOrg = (await sql`select org_id from acq.knowledge_docs where id=${kbId}`)[0]?.org_id;
      const m = await sql`select 1 from acq.org_members where org_id=${kdOrg} and user_id=${data.user.id}`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }
    const kd = (await sql`select id, storage_path, file_name, file_type from acq.knowledge_docs where id=${kbId}`)[0];
    if (!kd) { await sql.end({ timeout: 5 }); return json({ error: 'not found' }, 404); }

    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${kd.storage_path}`, { headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}` } });
    if (!r.ok) { await sql`update acq.knowledge_docs set status='failed', error=${'download ' + r.status} where id=${kbId}`; await sql.end({ timeout: 5 }); return json({ error: 'download failed' }, 502); }
    const bytes = new Uint8Array(await r.arrayBuffer());
    const mt = kd.file_type || ''; const ext = (String(kd.file_name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

    let text = '', pdfBlock: any = null;
    try {
      if (mt === 'application/pdf' || ext === 'pdf') pdfBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: encodeBase64(bytes) } };
      else if (mt === DOCX || ext === 'docx') text = await docxToText(bytes);
      else if (mt === XLSXM || mt === XLS || ext === 'xlsx' || ext === 'xls') text = xlsxToText(bytes);
      else if (mt.startsWith('text/') || ext === 'csv' || ext === 'txt' || ext === 'md') text = new TextDecoder().decode(bytes);
      else { await sql`update acq.knowledge_docs set status='skipped', error=${'unsupported ' + mt} where id=${kbId}`; await sql.end({ timeout: 5 }); return json({ ok: true, skipped: true }); }
    } catch (e: any) { await sql`update acq.knowledge_docs set status='failed', error=${String(e).slice(0, 300)} where id=${kbId}`; await sql.end({ timeout: 5 }); return json({ error: 'convert failed' }, 422); }

    let summary = '';
    let fullText = text;
    if (ANTHROPIC) {
      const content: any[] = [];
      if (pdfBlock) { content.push(pdfBlock); content.push({ type: 'text', text: 'This is firm reference material. Return STRICT JSON {"summary": a 2-3 sentence summary of what this document is and covers, "text": a clean readable transcription of its full text}. JSON only.' }); }
      else { content.push({ type: 'text', text: (text || '').slice(0, 150000) }); content.push({ type: 'text', text: 'This is firm reference material. Return STRICT JSON {"summary": a 2-3 sentence summary of what this document is and covers}. JSON only.' }); }
      try {
        const ar = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content }] }) });
        if (ar.ok) { const aj = await ar.json(); let t = (aj.content ?? []).map((b: any) => b.text ?? '').join('').replace(/```json|```/g, ''); const a = t.indexOf('{'), b = t.lastIndexOf('}'); const p = JSON.parse(t.slice(a, b + 1)); summary = String(p.summary || '').slice(0, 800); if (pdfBlock && p.text) fullText = String(p.text); }
      } catch (_) { /* summary best-effort */ }
    }
    if (!summary) summary = (fullText || kd.file_name || '').slice(0, 300);
    await sql`update acq.knowledge_docs set status='done', summary=${summary}, extracted_text=${(fullText || '').slice(0, 200000)}, error=null, updated_at=now() where id=${kbId}`;
    await sql.end({ timeout: 5 });
    return json({ ok: true, id: kbId, chars: (fullText || '').length });
  } catch (e) {
    if (kbId) { try { await sql`update acq.knowledge_docs set status='failed', error=${String(e).slice(0, 300)} where id=${kbId}`; } catch (_) { /**/ } }
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
});
