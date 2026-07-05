// =============================================================================
// acq-source v2 — buy-box prospect sourcing from Companies House.
// - ~110 grouped "boring business" categories (+ property/land/CRE + tech)
// - radius-from-town filtering (postcodes.io geocoding, haversine)
// - size filtering via the honest CH signal: last filed accounts type
//   (micro-entity < £632k turnover; small < £10.2m; medium/full/group above)
// - min director age filter (succession), richer fit scoring with reasons
// Actions: taxonomy | search
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { TAXONOMY } from './taxonomy.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const CH = 'https://api.company-information.service.gov.uk';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const toRad = (d: number) => (d * Math.PI) / 180;
const milesBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
};

// last_accounts.type -> size class
function sizeClass(t: string | null): 'micro' | 'small' | 'medium_plus' | 'unknown' {
  if (!t) return 'unknown';
  if (['micro-entity'].includes(t)) return 'micro';
  if (['small', 'total-exemption-small', 'total-exemption-full', 'unaudited-abridged', 'abridged'].includes(t)) return 'small';
  if (['medium', 'full', 'group', 'audited-abridged', 'audit-exemption-subsidiary'].includes(t)) return 'medium_plus';
  if (['dormant', 'no-accounts-type-available', 'initial'].includes(t)) return 'unknown';
  return 'unknown';
}
const SIZE_LABEL: Record<string, string> = { micro: 'micro-entity accounts (< £632k t/o)', small: 'small-company accounts (£632k–£10.2m t/o)', medium_plus: 'medium/full accounts (£10.2m+ t/o)', unknown: 'accounts size unknown' };

function fitScore(p: { incorporated_on?: string | null; oldest_director_age?: number | null; company_status?: string | null; distance_miles?: number | null; size_class?: string; location?: string }) {
  let s = 25; const reasons: string[] = ['Matches target industry'];
  if (p.incorporated_on) {
    const yrs = (Date.now() - new Date(p.incorporated_on).getTime()) / 31557600000;
    if (yrs >= 15) { s += 20; reasons.push(`Established ${Math.floor(yrs)} years`); }
    else if (yrs >= 8) { s += 12; reasons.push(`Trading ${Math.floor(yrs)} years`); }
  }
  if (p.oldest_director_age != null) {
    if (p.oldest_director_age >= 60) { s += 25; reasons.push(`Oldest director ${p.oldest_director_age} — strong succession signal`); }
    else if (p.oldest_director_age >= 55) { s += 15; reasons.push(`Oldest director ${p.oldest_director_age} — likely retirement horizon`); }
  }
  if (p.size_class === 'medium_plus') { s += 15; reasons.push('Files medium/full accounts (£10.2m+ turnover)'); }
  else if (p.size_class === 'small') { s += 8; reasons.push('Files small-company accounts (£632k–£10.2m turnover)'); }
  if (p.distance_miles != null) {
    if (p.distance_miles <= 10) { s += 10; reasons.push(`${Math.round(p.distance_miles)} miles from ${p.location}`); }
    else if (p.distance_miles <= 25) { s += 6; reasons.push(`${Math.round(p.distance_miles)} miles from ${p.location}`); }
    else reasons.push(`${Math.round(p.distance_miles)} miles from ${p.location}`);
  }
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
      return json({ ok: true, taxonomy: Object.entries(TAXONOMY).map(([key, v]) => ({ key, label: v.label, group: v.group, sic: v.sic })) });
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

    // ---- params ----
    const categories: string[] = Array.isArray(body.categories) ? body.categories.filter((c: string) => TAXONOMY[c]) : [];
    const extraSic: string[] = Array.isArray(body.sic_codes) ? body.sic_codes : [];
    const sic = [...new Set([...categories.flatMap((c) => TAXONOMY[c].sic), ...extraSic])];
    if (!sic.length) { await sql.end({ timeout: 5 }); return json({ error: 'pick at least one industry' }, 400); }
    const location: string = (body.location ?? '').toString().trim();
    const radius: number = Math.max(0, Number(body.radius_miles ?? 0)); // 0 = exact town text match
    const minAgeYears: number = Number(body.min_age_years ?? 8);
    const maxResults: number = Math.min(Number(body.max_results ?? 25), 50);
    const sizeBand: string = ['any','small_plus','medium_plus'].includes(body.size_band) ? body.size_band : 'any';
    const minDirectorAge: number = [0, 55, 60].includes(Number(body.min_director_age)) ? Number(body.min_director_age) : 0;
    const incorporatedTo = new Date(Date.now() - minAgeYears * 31557600000).toISOString().slice(0, 10);

    // ---- 1) candidate pull from Companies House ----
    const useRadius = radius > 0 && !!location;
    const pullSize = useRadius ? 500 : Math.min(200, maxResults * 4);
    const params = new URLSearchParams({ company_status: 'active', sic_codes: sic.slice(0, 50).join(','), incorporated_to: incorporatedTo, size: String(pullSize) });
    if (location && !useRadius) params.set('location', location);
    const sr = await fetch(`${CH}/advanced-search/companies?${params}`, { headers: { Authorization: auth } });
    if (!sr.ok) { const t = await sr.text(); await sql.end({ timeout: 5 }); return json({ error: `Companies House ${sr.status}`, detail: t.slice(0, 200) }, 502); }
    const sj = await sr.json();
    let candidates: any[] = (sj.items ?? []).filter((it: any) => it.company_number);

    // ---- 2) radius filter via postcodes.io ----
    if (useRadius && candidates.length) {
      const pr = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(location)}&limit=1`);
      const pj = pr.ok ? await pr.json() : null;
      const centre = pj?.result?.[0] ? { lat: pj.result[0].latitude, lon: pj.result[0].longitude } : null;
      if (!centre) { await sql.end({ timeout: 5 }); return json({ error: `Couldn't locate "${location}" — try a bigger town or city name` }, 400); }
      const withPc = candidates.filter((c) => c.registered_office_address?.postal_code);
      const dist: Record<string, number> = {};
      for (let i = 0; i < withPc.length; i += 100) {
        const chunk = withPc.slice(i, i + 100);
        const br = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postcodes: chunk.map((c) => c.registered_office_address.postal_code) }) });
        if (!br.ok) continue;
        const bj = await br.json();
        for (const r of bj.result ?? []) {
          if (r.result?.latitude != null) dist[r.query.toUpperCase().replace(/\s/g, '')] = milesBetween({ lat: r.result.latitude, lon: r.result.longitude }, centre);
        }
      }
      candidates = withPc
        .map((c) => ({ ...c, _distance: dist[c.registered_office_address.postal_code.toUpperCase().replace(/\s/g, '')] ?? null }))
        .filter((c) => c._distance != null && c._distance <= radius)
        .sort((a, b) => a._distance - b._distance);
    }

    // ---- 3) enrich + filter (profile accounts type, officers) until maxResults ----
    const results: any[] = []; let created = 0, updated = 0;
    let scanned = 0; const maxScan = 120;
    for (const it of candidates) {
      if (results.length >= maxResults || scanned >= maxScan) break;
      scanned++;
      const number = it.company_number;

      // size (accounts type from profile)
      let accountsType: string | null = null;
      try {
        const prf = await fetch(`${CH}/company/${number}`, { headers: { Authorization: auth } });
        if (prf.ok) { const pjj = await prf.json(); accountsType = pjj?.accounts?.last_accounts?.type ?? null; }
      } catch (_) { /* best-effort */ }
      const size = sizeClass(accountsType);
      if (sizeBand === 'small_plus' && (size === 'micro')) continue;
      if (sizeBand === 'medium_plus' && size !== 'medium_plus') continue;

      // officers (director ages)
      let directors: any[] = []; let oldest: number | null = null;
      try {
        const or_ = await fetch(`${CH}/company/${number}/officers?items_per_page=25`, { headers: { Authorization: auth } });
        if (or_.ok) {
          const oj = await or_.json();
          directors = (oj.items ?? []).filter((o: any) => (o.officer_role ?? '').includes('director') && !o.resigned_on)
            .map((o: any) => ({ name: o.name, dob_year: o.date_of_birth?.year ?? null, role: o.officer_role }));
          const yrs = directors.map((d: any) => d.dob_year).filter(Boolean).map((y: number) => new Date().getFullYear() - y);
          oldest = yrs.length ? Math.max(...yrs) : null;
        }
      } catch (_) { /* best-effort */ }
      if (minDirectorAge > 0 && (oldest == null || oldest < minDirectorAge)) continue;

      const addr = it.registered_office_address ?? {};
      const address = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region].filter(Boolean).join(', ');
      const distMiles: number | null = typeof it._distance === 'number' ? Math.round(it._distance * 10) / 10 : null;
      const { score, reasons } = fitScore({ incorporated_on: it.date_of_creation, oldest_director_age: oldest, company_status: it.company_status, distance_miles: distMiles, size_class: size, location });
      const cat = categories.find((c) => TAXONOMY[c].sic.some((s) => (it.sic_codes ?? []).includes(s))) ?? categories[0] ?? null;

      const row = (await sql`
        insert into acq.prospects (org_id, company_name, company_number, sic_codes, address, postcode, region, incorporated_on, company_status,
          directors, oldest_director_age, provenance, exportable, source, fit_score, fit_reasons, stage, ch_snapshot, ch_last_checked)
        values (${orgId}, ${it.company_name}, ${number}, ${it.sic_codes ?? []}, ${address || null}, ${addr.postal_code ?? null}, ${addr.region ?? addr.locality ?? null},
          ${it.date_of_creation ?? null}, ${it.company_status ?? null}, ${JSON.stringify(directors)}, ${oldest}, 'platform', false,
          ${JSON.stringify({ kind: 'companies_house', category: cat, distance_miles: distMiles, accounts_type: accountsType, size_class: size, query: { sic, location, radius, minAgeYears, sizeBand, minDirectorAge } })},
          ${score}, ${reasons}, 'enriched', ${JSON.stringify(it)}, now())
        on conflict (org_id, company_number) where company_number is not null
        do update set directors=excluded.directors, oldest_director_age=excluded.oldest_director_age, fit_score=excluded.fit_score,
          fit_reasons=excluded.fit_reasons, source=excluded.source, ch_snapshot=excluded.ch_snapshot, ch_last_checked=now(), updated_at=now()
        returning id, (xmax = 0) as inserted`)[0];
      if (row.inserted) created++; else updated++;
      results.push({ id: row.id, company_name: it.company_name, company_number: number, fit_score: score, oldest_director_age: oldest, incorporated_on: it.date_of_creation, address, distance_miles: distMiles, size: SIZE_LABEL[size] });
    }
    results.sort((a, b) => b.fit_score - a.fit_score);

    await sql.end({ timeout: 5 });
    return json({ ok: true, total_hits: sj.hits ?? candidates.length, scanned, created, updated, prospects: results });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
