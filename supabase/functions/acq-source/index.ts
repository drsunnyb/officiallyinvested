// =============================================================================
// acq-source — buy-box prospect sourcing from Companies House.
// Maps "boring business" categories -> UK SIC codes, runs CH advanced search,
// enriches top results with officers (director age = succession signal),
// scores thesis fit deterministically, and upserts acq.prospects
// (provenance='platform', exportable=false — the licensed data moat).
// Actions: taxonomy | search
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const CH = 'https://api.company-information.service.gov.uk';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Curated "200 boring businesses" taxonomy -> UK SIC codes.
const TAXONOMY: Record<string, { label: string; sic: string[] }> = {
  cleaning:            { label: 'Commercial & domestic cleaning', sic: ['81210','81220','81221','81222','81229','81299'] },
  landscaping:         { label: 'Landscaping & grounds maintenance', sic: ['81300'] },
  plumbing_hvac:       { label: 'Plumbing, heating & HVAC', sic: ['43220'] },
  electrical:          { label: 'Electrical contractors', sic: ['43210'] },
  waste:               { label: 'Waste collection & skip hire', sic: ['38110','38210','38320'] },
  self_storage:        { label: 'Self storage & warehousing', sic: ['52103','52102'] },
  laundry:             { label: 'Laundry & dry cleaning', sic: ['96010'] },
  car_wash_valeting:   { label: 'Car wash & valeting', sic: ['45200'] },
  vehicle_repair:      { label: 'MOT & vehicle repair garages', sic: ['45200'] },
  pest_control:        { label: 'Pest control & disinfecting', sic: ['81291'] },
  roofing:             { label: 'Roofing contractors', sic: ['43910'] },
  scaffolding:         { label: 'Scaffolding & access', sic: ['43991'] },
  security:            { label: 'Security services & guarding', sic: ['80100','80200'] },
  care_home:           { label: 'Care homes & domiciliary care', sic: ['87100','87300','88100'] },
  childcare:           { label: 'Nurseries & childcare', sic: ['85100','88910'] },
  funeral:             { label: 'Funeral services', sic: ['96030'] },
  haulage:             { label: 'Haulage & freight', sic: ['49410','52290'] },
  couriers:            { label: 'Couriers & last-mile delivery', sic: ['53201','53202'] },
  plant_hire:          { label: 'Plant & tool hire', sic: ['77320','77390'] },
  groundworks:         { label: 'Groundworks & drainage', sic: ['43120','42990'] },
  glazing:             { label: 'Glazing & windows', sic: ['43342'] },
  joinery:             { label: 'Joinery & carpentry', sic: ['43320','16230'] },
  signage_printing:    { label: 'Signage & print', sic: ['18110','18121','18129','73110'] },
  catering:            { label: 'Contract catering & events', sic: ['56210','56290'] },
  facilities_mgmt:     { label: 'Facilities management', sic: ['81100'] },
  recruitment:         { label: 'Recruitment agencies', sic: ['78100','78200','78300'] },
  driving_school:      { label: 'Driving schools & training', sic: ['85530','85590'] },
  kennels_vets:        { label: 'Kennels, catteries & pet care', sic: ['96090','01620'] },
  fire_protection:     { label: 'Fire protection & alarms', sic: ['43210','80200'] },
  builders_merchant:   { label: 'Builders & trade merchants', sic: ['46730','46740'] },
  accountancy:         { label: 'Accountancy practices', sic: ['69201','69202','69203'] },
  property_mgmt:       { label: 'Property & block management', sic: ['68320','68209'] },
  vending:             { label: 'Vending & micro markets', sic: ['47990'] },
  agri_contracting:    { label: 'Agricultural contracting', sic: ['01610'] },
  fencing:             { label: 'Fencing & gates', sic: ['43290','43999'] },
  flooring:            { label: 'Flooring contractors', sic: ['43330'] },
  removals:            { label: 'Removals & relocation', sic: ['49420'] },
  water_hygiene:       { label: 'Water hygiene & legionella', sic: ['71200','81299'] },
  lift_maintenance:    { label: 'Lift installation & maintenance', sic: ['43290'] },
  air_conditioning:    { label: 'Air conditioning & refrigeration', sic: ['43220'] },
};

// Rough UK revenue-per-head by category for staff-proxy estimates (GBP).
const REV_PER_HEAD: Record<string, number> = {
  haulage: 120000, builders_merchant: 250000, plant_hire: 150000, care_home: 45000,
  cleaning: 35000, security: 40000, recruitment: 130000, accountancy: 90000,
  facilities_mgmt: 60000, catering: 55000, default: 80000,
};

function fitScore(p: { incorporated_on?: string | null; oldest_director_age?: number | null; company_status?: string | null; regionMatch: boolean }) {
  let s = 30; const reasons: string[] = ['Matches target industry'];
  if (p.incorporated_on) {
    const yrs = (Date.now() - new Date(p.incorporated_on).getTime()) / 31557600000;
    if (yrs >= 15) { s += 25; reasons.push(`Established ${Math.floor(yrs)} years`); }
    else if (yrs >= 8) { s += 15; reasons.push(`Trading ${Math.floor(yrs)} years`); }
  }
  if (p.oldest_director_age != null) {
    if (p.oldest_director_age >= 60) { s += 30; reasons.push(`Oldest director ${p.oldest_director_age} — strong succession signal`); }
    else if (p.oldest_director_age >= 55) { s += 20; reasons.push(`Oldest director ${p.oldest_director_age} — likely retirement horizon`); }
  }
  if (p.regionMatch) { s += 10; reasons.push('In target region'); }
  if (p.company_status === 'active') s += 5;
  return { score: Math.min(100, s), reasons: reasons.join('; ') };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'search';
    if (action === 'taxonomy') {
      await sql.end({ timeout: 5 });
      return json({ ok: true, taxonomy: Object.entries(TAXONOMY).map(([key, v]) => ({ key, label: v.label, sic: v.sic })) });
    }

    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','ch_api_key')`).map((r: any) => [r.key, r.value]));
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
    if (!cfg.ch_api_key) { await sql.end({ timeout: 5 }); return json({ error: 'Companies House API key not configured' }, 500); }
    const auth = 'Basic ' + btoa(cfg.ch_api_key + ':');

    // ---- search ----
    const categories: string[] = Array.isArray(body.categories) ? body.categories.filter((c: string) => TAXONOMY[c]) : [];
    const extraSic: string[] = Array.isArray(body.sic_codes) ? body.sic_codes : [];
    const sic = [...new Set([...categories.flatMap((c) => TAXONOMY[c].sic), ...extraSic])];
    if (!sic.length) { await sql.end({ timeout: 5 }); return json({ error: 'pick at least one industry' }, 400); }
    const location: string = (body.location ?? '').toString().trim();
    const minAgeYears: number = Number(body.min_age_years ?? 8);
    const maxResults: number = Math.min(Number(body.max_results ?? 25), 50);
    const incorporatedTo = new Date(Date.now() - minAgeYears * 31557600000).toISOString().slice(0, 10);

    const params = new URLSearchParams({ company_status: 'active', sic_codes: sic.slice(0, 40).join(','), incorporated_to: incorporatedTo, size: String(maxResults) });
    if (location) params.set('location', location);
    const sr = await fetch(`${CH}/advanced-search/companies?${params}`, { headers: { Authorization: auth } });
    if (!sr.ok) { const t = await sr.text(); await sql.end({ timeout: 5 }); return json({ error: `Companies House ${sr.status}`, detail: t.slice(0, 200) }, 502); }
    const sj = await sr.json();
    const items: any[] = sj.items ?? [];

    const results: any[] = []; let created = 0, updated = 0;
    for (const it of items.slice(0, maxResults)) {
      const number = it.company_number;
      if (!number) continue;
      // officers (director ages)
      let directors: any[] = []; let oldest: number | null = null;
      try {
        const or_ = await fetch(`${CH}/company/${number}/officers?items_per_page=20`, { headers: { Authorization: auth } });
        if (or_.ok) {
          const oj = await or_.json();
          directors = (oj.items ?? []).filter((o: any) => (o.officer_role ?? '').includes('director') && !o.resigned_on)
            .map((o: any) => ({ name: o.name, dob_year: o.date_of_birth?.year ?? null, role: o.officer_role }));
          const yrs = directors.map((d: any) => d.dob_year).filter(Boolean).map((y: number) => new Date().getFullYear() - y);
          oldest = yrs.length ? Math.max(...yrs) : null;
        }
      } catch (_) { /* officers are best-effort */ }

      const addr = it.registered_office_address ?? {};
      const address = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region].filter(Boolean).join(', ');
      const regionMatch = !!location && [addr.locality, addr.region, addr.postal_code].filter(Boolean).some((x: string) => x.toLowerCase().includes(location.toLowerCase()));
      const { score, reasons } = fitScore({ incorporated_on: it.date_of_creation, oldest_director_age: oldest, company_status: it.company_status, regionMatch });
      const cat = categories.find((c) => TAXONOMY[c].sic.some((s) => (it.sic_codes ?? []).includes(s))) ?? categories[0] ?? null;

      const row = (await sql`
        insert into acq.prospects (org_id, company_name, company_number, sic_codes, address, postcode, region, incorporated_on, company_status,
          directors, oldest_director_age, provenance, exportable, source, fit_score, fit_reasons, stage, ch_snapshot, ch_last_checked)
        values (${orgId}, ${it.company_name}, ${number}, ${it.sic_codes ?? []}, ${address || null}, ${addr.postal_code ?? null}, ${addr.region ?? addr.locality ?? null},
          ${it.date_of_creation ?? null}, ${it.company_status ?? null}, ${JSON.stringify(directors)}, ${oldest}, 'platform', false,
          ${JSON.stringify({ kind: 'companies_house', category: cat, query: { sic, location, minAgeYears } })}, ${score}, ${reasons}, 'enriched', ${JSON.stringify(it)}, now())
        on conflict (org_id, company_number) where company_number is not null
        do update set directors=excluded.directors, oldest_director_age=excluded.oldest_director_age, fit_score=excluded.fit_score,
          fit_reasons=excluded.fit_reasons, ch_snapshot=excluded.ch_snapshot, ch_last_checked=now(), updated_at=now()
        returning id, (xmax = 0) as inserted`)[0];
      if (row.inserted) created++; else updated++;
      results.push({ id: row.id, company_name: it.company_name, company_number: number, fit_score: score, oldest_director_age: oldest, incorporated_on: it.date_of_creation, address });
    }

    await sql.end({ timeout: 5 });
    return json({ ok: true, total_hits: sj.hits ?? items.length, created, updated, prospects: results });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
