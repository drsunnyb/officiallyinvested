// =============================================================================
// acq-ingest — customer list ingestion (CSV) into acq.prospects.
// propose: AI maps arbitrary column headers -> prospect fields, returns preview.
// commit:  validates, dedupes (company_number > domain > email > fuzzy name+postcode),
//          merges without overwriting existing data, provenance='uploaded',
//          exportable=true (the customer's own data stays theirs).
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const FIELDS = ['company_name','company_number','website','owner_name','owner_email','owner_phone','address','postcode','region','sic_code','revenue','staff','notes'] as const;

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const norm = (s: unknown) => (s == null ? '' : String(s)).trim();
const nameKey = (s: string) => s.toLowerCase().replace(/\b(ltd|limited|llp|plc|co|company|the)\b/g, '').replace(/[^a-z0-9]/g, '');
const domainOf = (website: string, email: string) => {
  let d = '';
  if (website) { try { d = new URL(website.startsWith('http') ? website : 'https://' + website).hostname; } catch (_) { d = website; } }
  else if (email && email.includes('@')) d = email.split('@')[1];
  d = d.toLowerCase().replace(/^www\./, '');
  return ['gmail.com','hotmail.com','yahoo.com','outlook.com','icloud.com','btinternet.com','aol.com','hotmail.co.uk','yahoo.co.uk','live.co.uk'].includes(d) ? '' : d;
};
const numOf = (v: string) => { const s = v.toLowerCase().replace(/[£$,\s]/g, ''); const m = s.match(/^([0-9]*\.?[0-9]+)(k|m)?$/); if (!m) return null; const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1); return isFinite(n) && n > 0 ? n : null; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','anthropic_api_key')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} and role in ('owner','admin','analyst') order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else if (!orgId) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'propose';
    const csvText: string = body.csv_base64 ? atob(body.csv_base64) : (body.csv ?? '');
    if (!csvText.trim()) { await sql.end({ timeout: 5 }); return json({ error: 'csv required' }, 400); }
    const rows = parseCsv(csvText);
    if (rows.length < 2) { await sql.end({ timeout: 5 }); return json({ error: 'need a header row and at least one data row' }, 400); }
    const headers = rows[0].map(norm);

    if (action === 'propose') {
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      let mapping: Record<string, string | null> = {};
      if (ANTHROPIC) {
        const sample = rows.slice(1, 9).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
        const ar = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6', max_tokens: 1000,
            tools: [{ name: 'set_mapping', description: 'Map CSV headers to prospect fields', input_schema: { type: 'object', properties: { mapping: { type: 'object', description: 'keys = CSV header names, values = one of: ' + FIELDS.join(', ') + ' or null if no match', additionalProperties: { type: ['string','null'] } } }, required: ['mapping'] } }],
            tool_choice: { type: 'tool', name: 'set_mapping' },
            messages: [{ role: 'user', content: `Map these CSV columns from a UK business prospect list to our schema fields (${FIELDS.join(', ')}). Headers: ${headers}. Sample rows: ${sample}. Map each header to the best field or null. company_number is a UK Companies House number.` }],
          }),
        });
        if (ar.ok) { const aj = await ar.json(); mapping = ((aj.content ?? []).find((b: any) => b.type === 'tool_use')?.input?.mapping) ?? {}; }
      }
      // fallback heuristics for anything the model missed
      for (const h of headers) {
        if (mapping[h] !== undefined && mapping[h] !== null) continue;
        const l = h.toLowerCase();
        mapping[h] = /company\s*(number|no|reg)/.test(l) ? 'company_number'
          : /(company|business|trading)\s*name|^name$|^company$/.test(l) ? 'company_name'
          : /web|url|site/.test(l) ? 'website'
          : /e-?mail/.test(l) ? 'owner_email'
          : /phone|tel|mobile/.test(l) ? 'owner_phone'
          : /owner|director|contact\s*name|first|surname/.test(l) ? 'owner_name'
          : /post\s*code|zip/.test(l) ? 'postcode'
          : /address|street/.test(l) ? 'address'
          : /region|county|city|town|location/.test(l) ? 'region'
          : /sic/.test(l) ? 'sic_code'
          : /revenue|turnover|sales/.test(l) ? 'revenue'
          : /staff|employee|headcount/.test(l) ? 'staff'
          : /note|comment|desc/.test(l) ? 'notes' : null;
      }
      const job = (await sql`insert into acq.ingest_jobs (org_id, file_name, mapping, status, rows_total, created_by)
        values (${orgId}, ${body.file_name ?? 'upload.csv'}, ${mapping}, 'proposed', ${rows.length - 1}, ${userId}) returning id`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, job_id: job.id, mapping, headers, rows_total: rows.length - 1, preview: rows.slice(1, 6) });
    }

    if (action === 'commit') {
      if (body.gdpr_confirmed !== true) { await sql.end({ timeout: 5 }); return json({ error: 'Please confirm the list was obtained from a GDPR-compliant source before importing.', gdpr_required: true }, 400); }
      const mapping: Record<string, string | null> = body.mapping ?? {};
      const idx: Record<string, number> = {};
      headers.forEach((h, i) => { const f = mapping[h]; if (f && (FIELDS as readonly string[]).includes(f) && idx[f] === undefined) idx[f] = i; });
      if (idx.company_name === undefined) { await sql.end({ timeout: 5 }); return json({ error: 'mapping must include company_name' }, 400); }
      let created = 0, merged = 0, skipped = 0, excluded_pipeline = 0, excluded_platform = 0; const errors: string[] = [];

      // Cross-check sets: the uploader's own pipeline deals, and platform-known
      // companies (host pipeline + everything in the member deal flow). Uploads
      // matching these are eliminated, not imported.
      const ownDeals = await sql`select name, ch_snapshot->>'company_number' as company_number from acq.deals where org_id=${orgId} and status not in ('passed','archived')`;
      const platformRows = await sql`select business_name as name, companies_house_number as company_number from public.submissions where coalesce(status,'') not in ('rejected','archived','declined','withdrawn')`;
      const ownNum = new Set<string>(); const ownName = new Set<string>();
      for (const d of ownDeals) { if (d.company_number) ownNum.add(String(d.company_number).replace(/\s/g, '').toUpperCase()); const k = nameKey(String(d.name ?? '')); if (k.length > 3) ownName.add(k); }
      const platNum = new Set<string>(); const platName = new Set<string>();
      for (const d of platformRows) { if (d.company_number) platNum.add(String(d.company_number).replace(/\s/g, '').toUpperCase()); const k = nameKey(String(d.name ?? '')); if (k.length > 3) platName.add(k); }

      // Auto-enrichment: match each row against the Companies House index and
      // fill registry facts the upload is missing (number, SIC, address, age, status).
      let enriched = 0;
      const chMatch = async (company_number: string | null, name: string, postcode: string | null) => {
        if (company_number) {
          const hit = (await sql`select * from acq.companies_index where company_number=${company_number} limit 1`)[0];
          if (hit) return hit;
        }
        if (postcode) {
          const key = nameKey(name);
          const cands = await sql`select * from acq.companies_index where postcode=${postcode} limit 50`;
          const hit = cands.find((c: any) => nameKey(c.name) === key);
          if (hit) return hit;
        }
        return null;
      };

      for (const r of rows.slice(1)) {
        try {
          const g = (f: string) => (idx[f] !== undefined ? norm(r[idx[f]]) : '');
          const company_name = g('company_name');
          if (!company_name) { skipped++; continue; }
          const company_number = g('company_number').replace(/\s/g, '').toUpperCase() || null;
          const website = g('website') || null;
          const owner_email = g('owner_email').toLowerCase() || null;
          const domain = domainOf(website ?? '', owner_email ?? '') || null;
          const postcode = g('postcode').toUpperCase() || null;
          const revenue = idx.revenue !== undefined ? numOf(norm(r[idx.revenue])) : null;

          // eliminate anything already in the buyer's pipeline or known to the platform
          const nk = nameKey(company_name);
          if ((company_number && ownNum.has(company_number)) || (nk.length > 3 && ownName.has(nk))) { excluded_pipeline++; continue; }
          if ((company_number && platNum.has(company_number)) || (nk.length > 3 && platName.has(nk))) { excluded_platform++; continue; }

          const ch = await chMatch(company_number, company_name, postcode);
          if (ch) enriched++;
          const chNumber = company_number ?? (ch ? String(ch.company_number) : null);
          const chSics: string[] = ch && ch.sic ? (Array.isArray(ch.sic) ? ch.sic : String(ch.sic).split(/[,;\s]+/).filter(Boolean)) : [];
          const chAddress = ch ? [ch.address1, ch.town].filter(Boolean).join(', ') : null;
          const chRegion = ch?.town ?? null;
          const chPostcode = ch?.postcode ?? null;

          // dedupe: company_number > domain > email > fuzzy name+postcode
          let existing: any = null;
          if (company_number) existing = (await sql`select id from acq.prospects where org_id=${orgId} and company_number=${company_number} limit 1`)[0];
          if (!existing && domain) existing = (await sql`select id from acq.prospects where org_id=${orgId} and domain=${domain} limit 1`)[0];
          if (!existing && owner_email) existing = (await sql`select id from acq.prospects where org_id=${orgId} and lower(owner_email)=${owner_email} limit 1`)[0];
          if (!existing && postcode) {
            const key = nameKey(company_name);
            const cands = await sql`select id, company_name from acq.prospects where org_id=${orgId} and postcode=${postcode}`;
            existing = cands.find((c: any) => nameKey(c.company_name) === key) ?? null;
          }

          if (existing) {
            await sql`update acq.prospects set
              company_number = coalesce(company_number, ${chNumber}),
              website = coalesce(website, ${website}), domain = coalesce(domain, ${domain}),
              owner_name = coalesce(owner_name, ${g('owner_name') || null}),
              owner_email = coalesce(owner_email, ${owner_email}),
              owner_phone = coalesce(owner_phone, ${g('owner_phone') || null}),
              address = coalesce(address, ${g('address') || null}, ${chAddress}), postcode = coalesce(postcode, ${postcode}, ${chPostcode}),
              region = coalesce(region, ${g('region') || null}, ${chRegion}),
              sic_codes = case when coalesce(array_length(sic_codes, 1), 0) = 0 and ${chSics.length > 0} then ${chSics} else sic_codes end,
              incorporated_on = coalesce(incorporated_on, ${ch?.incorporated ?? null}),
              revenue_estimate = coalesce(revenue_estimate, ${revenue}), revenue_basis = case when revenue_estimate is null and ${revenue}::numeric is not null then 'uploaded' else revenue_basis end,
              staff_band = coalesce(staff_band, ${g('staff') || null}),
              notes = case when ${g('notes') || null}::text is not null then coalesce(notes || E'\n', '') || ${g('notes')} else notes end,
              updated_at = now()
              where id=${existing.id}`;
            merged++;
          } else {
            await sql`insert into acq.prospects (org_id, company_name, company_number, website, domain, owner_name, owner_email, owner_phone,
                address, postcode, region, sic_codes, incorporated_on, revenue_estimate, revenue_basis, staff_band, notes, provenance, exportable, source, stage)
              values (${orgId}, ${company_name}, ${chNumber}, ${website}, ${domain}, ${g('owner_name') || null}, ${owner_email}, ${g('owner_phone') || null},
                ${g('address') || chAddress}, ${postcode ?? chPostcode}, ${g('region') || chRegion}, ${g('sic_code') ? [g('sic_code')] : chSics}, ${ch?.incorporated ?? null}, ${revenue}, ${revenue ? 'uploaded' : null}, ${g('staff') || null}, ${g('notes') || null},
                'uploaded', true, ${{ kind: 'upload', file: body.file_name ?? 'upload.csv', job_id: body.job_id ?? null, ch_matched: !!ch, ch_status: ch?.status ?? null }}, ${ch ? 'enriched' : 'new'})`;
            created++;
          }
        } catch (e) { skipped++; if (errors.length < 10) errors.push(String(e).slice(0, 200)); }
      }

      if (body.job_id) await sql`update acq.ingest_jobs set status='committed', gdpr_confirmed=true, mapping=${mapping}, rows_created=${created}, rows_merged=${merged}, rows_skipped=${skipped + excluded_pipeline + excluded_platform}, errors=${errors} where id=${body.job_id} and org_id=${orgId}`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, created, merged, skipped, enriched, excluded_pipeline, excluded_platform, errors });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
