// =============================================================================
// acq-legal — broker onboarding (NDAs, buyer background, proof of funds) + the
// branded document renderer used to turn any draft into a polished PDF.
//   get_profile / set_profile  -> buyer profile + e-signature + consent
//   get_brand / set_brand      -> brand (name, logo, colour, footer) in org.settings.brand
//   generate {deal_id,type}    -> original legal doc, pre-filled, signed -> branded PDF
//   render_doc {title,body}     -> any text -> clean, branded PDF (for editing drafts)
//   fill_broker {deal_id,inline}-> read broker NDA, fill it + append a signed page
//   list {deal_id}             -> legal documents for a deal
// Dual auth: x-acq-secret header OR signed-in member JWT. Generated docs are
// originals (not copied templates) and carry a 'not legal advice' note.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function hexRgb(hex: string, def: any) { const h = String(hex || '').replace('#', ''); if (/^[0-9a-fA-F]{6}$/.test(h)) return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255); return def; }
// strip AI/markdown remnants but keep heading lines (#) and blank lines
function cleanInline(t: string) {
  return String(t || '').replace(/\r/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1$2')
    .replace(/`+/g, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/^.*\b(internal working document|internal note|do not issue|working document)\b.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const DOC_LABEL: Record<string, string> = {
  nda_mutual: 'Mutual Non-Disclosure Agreement', nda_oneway: 'Non-Disclosure Agreement',
  buyer_background: 'Buyer Background', proof_of_funds: 'Proof of Funds Statement',
};
const DOC_BRIEF: Record<string, string> = {
  nda_mutual: 'Draft an original, professional UK-style MUTUAL non-disclosure agreement between the buyer and the counterparty, covering confidential information shared in connection with the possible acquisition of the target. Standard clauses: definitions, permitted use, exclusions, term (e.g. 2 years), return/destruction, no-solicitation during discussions, no warranty, governing law (England & Wales). Pre-fill the parties from the profile and counterparty. Leave the counterparty signature block blank.',
  nda_oneway: 'Draft an original, professional UK-style ONE-WAY non-disclosure agreement where the buyer is the receiving party of confidential information about the target. Pre-fill the buyer party from the profile and the disclosing party from the counterparty.',
  buyer_background: 'Draft a concise one-page BUYER BACKGROUND the broker can rely on: who the buyer is, relevant experience and track record, what they acquire, funding readiness, and confirmation of seriousness and confidentiality. Warm, credible, factual, no hype. Use the profile.',
  proof_of_funds: 'Draft a short PROOF OF FUNDS / financial standing statement for a broker, stating in general terms the buyer\'s capacity to fund a transaction of the relevant size and the structure typically used, referencing the proof-of-funds detail from the profile. Make clear formal evidence can be provided on request. Do not invent figures not in the profile.',
};
const WRITE_RULE = '\nWrite in clean plain text only. Do NOT use markdown: no asterisks, no hash headings, no backticks, no bullet stars. Use plain section headings in Title Case on their own line and full sentences. Never use the em-dash; use commas or full stops. Never include working-document or internal-note framing. The reader is the counterparty or the principal; it must be client-ready.';

async function header(pdf: any, page: any, y: number, margin: number, W: number, brand: any, bold: any) {
  const accent = hexRgb(brand.color, rgb(0.83, 0.68, 0));
  if (brand.logo) { try { const m = String(brand.logo).match(/^data:(image\/(png|jpe?g));base64,(.*)$/); if (m) { const img = /jpe?g/.test(m[1]) ? await pdf.embedJpg(m[3]) : await pdf.embedPng(m[3]); const s = img.scale(1); const w = Math.min(120, s.width), h = Math.min(40, w * (s.height / s.width)); page.drawImage(img, { x: margin, y: y - h, width: w, height: h }); } } catch (_) { /**/ } }
  if (brand.name) page.drawText(String(brand.name), { x: brand.logo ? margin + 132 : margin, y: y - 16, size: 13, font: bold, color: rgb(0.04, 0.15, 0.25) });
  y -= 46; page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 1, color: accent }); y -= 20;
  return y;
}

function makeRenderer(pdf: any, fonts: any, brand: any) {
  const { font, bold, ital } = fonts;
  const W = 595, H = 842, margin = 56, size = 10.5, lh = 15, maxW = W - margin * 2, topY = H - margin;
  let page = pdf.addPage([W, H]); let y = topY;
  const ensure = (need = lh) => { if (y - need < margin + 40) { page = pdf.addPage([W, H]); y = topY; } };
  const wrap = (text: string, f: any, s: number) => { const out: string[] = []; for (const raw of text.split('\n')) { if (raw.trim() === '') { out.push(''); continue; } const words = raw.split(/\s+/); let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (f.widthOfTextAtSize(t, s) > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); } return out; };
  const para = (text: string, f = font, s = size, gap = 0) => { for (const l of wrap(text, f, s)) { if (l === '') { y -= lh * 0.5; continue; } ensure(); page.drawText(l, { x: margin, y, size: s, font: f, color: rgb(0.09, 0.13, 0.2) }); y -= lh; } if (gap) y -= gap; };
  return { get page() { return page; }, get y() { return y; }, set y(v: number) { y = v; }, W, H, margin, size, lh, topY, ensure, para, wrap };
}

async function buildPdf(opts: { title: string; body: string; sig: any | null; brand?: any; signBlock?: boolean; legal?: boolean }) {
  const pdf = await PDFDocument.create();
  const fonts = { font: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), ital: await pdf.embedFont(StandardFonts.HelveticaOblique) };
  const r = makeRenderer(pdf, fonts, opts.brand || {});
  const brand = opts.brand || {};
  if (brand.logo || brand.name) r.y = await header(pdf, r.page, r.y, r.margin, r.W, brand, fonts.bold);
  r.para(opts.title, fonts.bold, 16, 8);
  for (const block of cleanInline(opts.body).split('\n')) {
    const isH = /^#{1,6}\s/.test(block);
    const clean = block.replace(/^#{1,6}\s/, '');
    if (isH) { r.y -= 4; r.para(clean, fonts.bold, 12, 2); } else r.para(clean, fonts.font, r.size);
  }
  if (opts.signBlock !== false) {
    r.y -= r.lh; r.ensure(110);
    r.page.drawText('Signed for and on behalf of the buyer:', { x: r.margin, y: r.y, size: r.size, font: fonts.bold }); r.y -= r.lh * 1.4;
    if (opts.sig?.image_b64) { try { const img = opts.sig.image_is_jpg ? await pdf.embedJpg(opts.sig.image_b64) : await pdf.embedPng(opts.sig.image_b64); const s = img.scale(1); const w = Math.min(180, s.width); r.page.drawImage(img, { x: r.margin, y: r.y - 50, width: w, height: Math.min(60, w * (s.height / s.width)) }); r.y -= 64; } catch (_) { /**/ } }
    else if (opts.sig?.typed) { r.page.drawText(opts.sig.typed, { x: r.margin, y: r.y - 22, size: 22, font: fonts.ital, color: rgb(0.05, 0.1, 0.25) }); r.y -= 40; }
    else { r.page.drawLine({ start: { x: r.margin, y: r.y - 18 }, end: { x: r.margin + 200, y: r.y - 18 }, thickness: 0.7, color: rgb(0.6, 0.6, 0.6) }); r.y -= 30; }
    r.page.drawText(opts.sig?.name || '________________________', { x: r.margin, y: r.y, size: r.size, font: fonts.font }); r.y -= r.lh;
    if (opts.sig?.company) { r.page.drawText(opts.sig.company, { x: r.margin, y: r.y, size: r.size, font: fonts.font, color: rgb(0.3, 0.35, 0.42) }); r.y -= r.lh; }
    r.page.drawText('Date: ' + (opts.sig?.when || today()), { x: r.margin, y: r.y, size: r.size, font: fonts.font }); r.y -= r.lh;
    if (opts.sig?.electronic) { r.y -= 4; r.para('Signed electronically by ' + (opts.sig.name || '') + ' on ' + (opts.sig.when || today()) + ', with the signatory’s consent.', fonts.ital, 8.5); }
  }
  r.y -= 8;
  if (brand.footer) r.para(String(brand.footer), fonts.ital, 8.5, 2);
  if (opts.legal !== false) r.para('This document was generated as a standard template for convenience only. It is not legal advice. Have it reviewed before relying on it.', fonts.ital, 8, 0);
  return await pdf.saveAsBase64();
}

async function draftBody(ANTHROPIC: string, type: string, profile: any, counterparty: string, deal: any) {
  const system = `You are a legal drafting assistant for an acquisition firm. ${DOC_BRIEF[type] || 'Draft the requested document.'}\nWrite an ORIGINAL document from scratch. Do NOT copy any existing template. Pre-fill every blank you can from the supplied data; where a value is genuinely unknown leave a clearly marked blank like [____]. UK English. Do not include a signature block (it is added separately).${WRITE_RULE}`;
  const tools = [{ name: 'submit', description: 'Return the document.', input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title', 'body'] } }];
  const user = JSON.stringify({ document_type: type, buyer_profile: profile, counterparty: counterparty || null, target: { name: deal?.name, asset_type: deal?.asset_type, sector: deal?.sector }, date: today() }) + '\n\nDraft it now and call submit.';
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 3000, system, tools, tool_choice: { type: 'tool', name: 'submit' }, messages: [{ role: 'user', content: user }] }) });
  if (!r.ok) throw new Error('anthropic ' + r.status + ' ' + (await r.text()).slice(0, 200));
  const j = await r.json();
  const out: any = (j.content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? {};
  return { title: out.title || DOC_LABEL[type] || 'Document', body: cleanInline(out.body || '') };
}

function sigFromProfile(p: any) {
  if (!p) return null;
  const consent = !!p.esign_consent;
  if (!consent) return { name: p.signatory_name || p.buyer_name || '', company: p.company || '', when: today(), electronic: false };
  const s: any = { name: p.signatory_name || p.buyer_name || '', company: p.company || '', when: today(), electronic: true };
  if (p.signature_image) { const m = String(p.signature_image).match(/^data:(image\/(png|jpeg|jpg));base64,(.*)$/); if (m) { s.image_b64 = m[3]; s.image_is_jpg = /jpe?g/.test(m[1]); } }
  else if (p.signature_typed) s.typed = p.signature_typed;
  return s;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = body.org_id ?? null;
    if (!orgId && userId) orgId = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]?.org_id ?? null;
    if (!orgId && trusted) orgId = (await sql`select id from acq.organizations order by created_at limit 1`)[0]?.id ?? null;
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'list';
    const org = (await sql`select settings from acq.organizations where id=${orgId}`)[0];
    const settings = org?.settings || {};
    const profile = settings.legal_profile || {};
    const brand = settings.brand || {};

    if (action === 'get_profile') { await sql.end({ timeout: 5 }); return json({ ok: true, profile, brand }); }
    if (action === 'get_brand') { await sql.end({ timeout: 5 }); return json({ ok: true, brand }); }
    if (action === 'set_profile') {
      const next = { ...profile, ...(body.profile || {}) };
      if (next.esign_consent && !next.consent_at) next.consent_at = new Date().toISOString();
      if (!next.esign_consent) next.consent_at = null;
      await sql`update acq.organizations set settings = coalesce(settings,'{}'::jsonb) || ${sql.json({ legal_profile: next })} where id=${orgId}`;
      return json({ ok: true, profile: next });
    }
    if (action === 'set_brand') {
      const next = { ...brand, ...(body.brand || {}) };
      await sql`update acq.organizations set settings = coalesce(settings,'{}'::jsonb) || ${sql.json({ brand: next })} where id=${orgId}`;
      return json({ ok: true, brand: next });
    }

    if (action === 'render_doc') {
      const title = body.title || 'Document';
      const pdf_base64 = await buildPdf({ title, body: body.body || '', sig: null, brand, signBlock: false, legal: false });
      return json({ ok: true, pdf_base64, title });
    }

    if (action === 'list') {
      const rows = await sql`select id, deal_id, type, title, counterparty, status, signed_by, signed_at, signature_method, created_at from acq.legal_documents where org_id=${orgId} ${body.deal_id ? sql`and deal_id=${body.deal_id}` : sql``} order by created_at desc limit 100`;
      return json({ ok: true, documents: rows });
    }

    if (action === 'generate') {
      if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }, 500); }
      const type = body.type; if (!DOC_BRIEF[type]) { await sql.end({ timeout: 5 }); return json({ error: 'unknown type', valid: Object.keys(DOC_BRIEF) }, 400); }
      const deal = body.deal_id ? (await sql`select id, name, asset_type, sector from acq.deals where id=${body.deal_id} and org_id=${orgId}`)[0] : null;
      const counterparty = body.counterparty || deal?.name || '';
      const { title, body: docBody } = await draftBody(ANTHROPIC, type, profile, counterparty, deal);
      const sig = sigFromProfile(profile);
      const signed = !!(sig && sig.electronic);
      const pdf_base64 = await buildPdf({ title, body: docBody, sig, brand, legal: true });
      const row = (await sql`insert into acq.legal_documents (org_id, deal_id, type, title, body, counterparty, status, signed_by, signed_at, signature_method, created_by)
        values (${orgId}, ${body.deal_id ?? null}, ${type}, ${title}, ${docBody}, ${counterparty || null}, ${signed ? 'signed' : 'draft'}, ${signed ? sig!.name : null}, ${signed ? new Date() : null}, ${signed ? (sig!.image_b64 ? 'image' : 'typed') : null}, ${userId})
        returning id, deal_id, type, title, counterparty, status, signed_by, signed_at, created_at`)[0];
      return json({ ok: true, document: row, pdf_base64, signed });
    }

    if (action === 'fill_broker') {
      if (!body.inline?.base64) { await sql.end({ timeout: 5 }); return json({ error: 'inline pdf required' }, 400); }
      const deal = body.deal_id ? (await sql`select id, name, asset_type, sector from acq.deals where id=${body.deal_id} and org_id=${orgId}`)[0] : null;
      const sig = sigFromProfile(profile);
      const src = await PDFDocument.load(Uint8Array.from(atob(body.inline.base64), (c) => c.charCodeAt(0)));
      try {
        const form = src.getForm(); const fields = form.getFields();
        const set = (re: RegExp, val: string) => { for (const f of fields) { try { if (re.test(f.getName()) && (f as any).setText) (f as any).setText(val); } catch (_) { /**/ } } };
        if (fields.length) { set(/name|signatory|recipient|buyer|print/i, profile.signatory_name || profile.buyer_name || ''); set(/company|firm|entity|organis/i, profile.company || ''); set(/address/i, profile.address || ''); set(/date/i, today()); set(/email/i, profile.email || ''); try { form.flatten(); } catch (_) { /**/ } }
      } catch (_) { /**/ }
      const page = src.addPage([595, 842]);
      const font = await src.embedFont(StandardFonts.Helvetica); const bold = await src.embedFont(StandardFonts.HelveticaBold); const ital = await src.embedFont(StandardFonts.HelveticaOblique);
      let y = 786; const x = 56;
      page.drawText('Execution', { x, y, size: 16, font: bold }); y -= 26;
      const lines = [`Agreement: ${body.title || 'Non-Disclosure Agreement'}${body.counterparty || deal?.name ? ' with ' + (body.counterparty || deal?.name) : ''}.`, `Buyer: ${profile.buyer_name || profile.signatory_name || ''}${profile.company ? ', ' + profile.company : ''}.`, profile.address ? `Address: ${profile.address}.` : '', 'The buyer agrees to the terms of the attached agreement and executes it as follows:'].filter(Boolean);
      for (const l of lines) { page.drawText(l, { x, y, size: 10.5, font, color: rgb(0.1, 0.14, 0.2) }); y -= 16; }
      y -= 16; page.drawText('Signed for and on behalf of the buyer:', { x, y, size: 10.5, font: bold }); y -= 24;
      if (sig?.image_b64) { try { const img = sig.image_is_jpg ? await src.embedJpg(sig.image_b64) : await src.embedPng(sig.image_b64); const s = img.scale(1); const w = Math.min(180, s.width); page.drawImage(img, { x, y: y - 50, width: w, height: Math.min(60, w * (s.height / s.width)) }); y -= 60; } catch (_) { /**/ } }
      else if (sig?.typed) { page.drawText(sig.typed, { x, y: y - 22, size: 22, font: ital, color: rgb(0.05, 0.1, 0.25) }); y -= 40; }
      else { page.drawLine({ start: { x, y: y - 18 }, end: { x: x + 200, y: y - 18 }, thickness: 0.7, color: rgb(0.6, 0.6, 0.6) }); y -= 30; }
      page.drawText(sig?.name || '', { x, y, size: 10.5, font }); y -= 15;
      page.drawText('Date: ' + today(), { x, y, size: 10.5, font }); y -= 15;
      if (sig?.electronic) page.drawText('Signed electronically with the signatory’s consent.', { x, y, size: 8.5, font: ital, color: rgb(0.35, 0.4, 0.46) });
      const pdf_base64 = await src.saveAsBase64();
      const title = body.title || ('Signed ' + (deal?.name ? deal.name + ' ' : '') + 'NDA');
      const signed = !!(sig && sig.electronic);
      const row = (await sql`insert into acq.legal_documents (org_id, deal_id, type, title, body, counterparty, status, signed_by, signed_at, signature_method, created_by)
        values (${orgId}, ${body.deal_id ?? null}, 'broker_nda', ${title}, ${'Broker-supplied NDA, completed and executed.'}, ${body.counterparty || deal?.name || null}, ${signed ? 'signed' : 'draft'}, ${signed ? sig!.name : null}, ${signed ? new Date() : null}, ${signed ? (sig!.image_b64 ? 'image' : 'typed') : null}, ${userId})
        returning id, deal_id, type, title, counterparty, status, signed_by, signed_at, created_at`)[0];
      return json({ ok: true, document: row, pdf_base64, signed });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
