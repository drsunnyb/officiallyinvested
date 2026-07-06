// =============================================================================
// acq-source v5 — buy-box prospect sourcing from Companies House.
//  - interactive `search` (up to 50 results, nearest-first, transparent counts)
//  - BACKGROUND RUNS: `start_run` queues an ENTIRE match set (thousands);
//    the cron calls `process_runs` every 10 minutes and works through it in
//    rate-limit-friendly chunks, resuming from a cursor until done
//  - shared 30-day public-data cache (acq.company_enrichment) across tenants
//  - CH 429 retry/backoff; user-facing errors as 200+{error}
// Actions: taxonomy | search | start_run | runs | cancel_run | process_runs
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

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

function sizeClass(t: string | null): 'micro' | 'small' | 'medium_plus' | 'unknown' {
  if (!t) return 'unknown';
  if (['micro-entity'].includes(t)) return 'micro';
  if (['small', 'total-exemption-small', 'total-exemption-full', 'unaudited-abridged', 'abridged'].includes(t)) return 'small';
  if (['medium', 'full', 'group', 'audited-abridged', 'audit-exemption-subsidiary'].includes(t)) return 'medium_plus';
  return 'unknown';
}
function bulkSize(cat: string | null): 'micro' | 'small' | 'medium_plus' | 'unknown' {
  if (!cat) return 'unknown';
  if (cat === 'MICRO ENTITY') return 'micro';
  if (['TOTAL EXEMPTION FULL','UNAUDITED ABRIDGED','SMALL','TOTAL EXEMPTION SMALL'].includes(cat)) return 'small';
  if (['FULL','GROUP','MEDIUM','AUDITED ABRIDGED','AUDIT EXEMPTION SUBSIDIARY','FILING EXEMPTION SUBSIDIARY'].includes(cat)) return 'medium_plus';
  return 'unknown';
}
// taxonomy + indexed-SIC sets are loaded from the DB and cached for 10 minutes
let TAXCACHE: { at: number; map: Record<string, { label: string; group: string; sic: string[] }> } | null = null;
async function getTaxonomy(sql: any) {
  if (TAXCACHE && Date.now() - TAXCACHE.at < 600000) return TAXCACHE.map;
  const rows = await sql`select key, label, grp, sic from acq.sic_taxonomy order by grp, label`;
  const map: Record<string, any> = {};
  for (const r of rows) map[r.key] = { label: r.label, group: r.grp, sic: r.sic };
  TAXCACHE = { at: Date.now(), map };
  return map;
}
let IDXCACHE: { at: number; set: Set<string> } | null = null;
async function getIndexedSics(sql: any) {
  if (IDXCACHE && Date.now() - IDXCACHE.at < 600000) return IDXCACHE.set;
  const rows = await sql`select distinct s as sic from acq.companies_index, unnest(sic) s`;
  IDXCACHE = { at: Date.now(), set: new Set(rows.map((r: any) => r.sic)) };
  return IDXCACHE.set;
}
const STATUS_LABEL: Record<string, string> = { administration: 'In administration', receivership: 'In receivership', liquidation: 'In liquidation', voluntary_arrangement: 'Company voluntary arrangement' };
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
  else if (p.company_status && STATUS_LABEL[p.company_status]) reasons.push(`${STATUS_LABEL[p.company_status]} — distressed opportunity`);
  return { score: Math.min(100, s), reasons: reasons.join('; ') };
}

async function chFetch(url: string, auth: string, state: { rateLimited: boolean }): Promise<any | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(url, { headers: { Authorization: auth } });
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 700 * (attempt + 1))); continue; }
    if (!r.ok) return null;
    return await r.json();
  }
  state.rateLimited = true;
  return null;
}

function parseParams(body: any, TAX: Record<string, any>) {
  const src = typeof body === 'string' ? JSON.parse(body) : body; // tolerate legacy double-encoded rows
  const categories: string[] = Array.isArray(src.categories) ? src.categories.filter((c: string) => TAX[c]) : [];
  const extraSic: string[] = Array.isArray(src.sic_codes) ? src.sic_codes : [];
  const sic = [...new Set([...categories.flatMap((c) => TAX[c].sic), ...extraSic])];
  return {
    categories, sic,
    location: (src.location ?? '').toString().trim(),
    radius: Math.max(0, Number(src.radius_miles ?? 0)),
    minAgeYears: Number(src.min_age_years ?? 8),
    sizeBand: ['any','small_plus','medium_plus'].includes(src.size_band) ? src.size_band : 'any',
    minDirectorAge: [0, 55, 60].includes(Number(src.min_director_age)) ? Number(src.min_director_age) : 0,
    statuses: Array.isArray(src.statuses) && src.statuses.length ? src.statuses.filter((x: string) => ['active','administration','receivership','liquidation','voluntary_arrangement'].includes(x)) : ['active'],
    qName: (src.q_name ?? '').toString().trim().slice(0, 60),
    excludeExisting: !!src.exclude_existing,
    catSic: Object.fromEntries(categories.map((c) => [c, TAX[c].sic])) as Record<string, string[]>,
  };
}

// Candidate pull: LOCAL companies index first (instant, no rate limit; excludes
// micro-entities by design), Companies House API as fallback. Deterministic.
async function pullCandidates(sql: any, auth: string, state: { rateLimited: boolean }, p: any, maxCandidates: number, orgId: string | null) {
  const useRadiusL = p.radius > 0 && !!p.location;
  // SIC codes not yet in the local index (custom codes or newly added categories) -> live Companies House
  const indexedSics = await getIndexedSics(sql);
  if (p.sic.some((x: string) => !indexedSics.has(x))) return await pullCandidatesCH(auth, state, p, maxCandidates);
  try {
    let centre: { lat: number; lon: number } | null = null;
    if (useRadiusL) {
      const pr = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(p.location)}&limit=1`);
      const pj = pr.ok ? await pr.json() : null;
      centre = pj?.result?.[0] ? { lat: pj.result[0].latitude, lon: pj.result[0].longitude } : null;
      if (!centre) return { candidates: [], totalHits: 0, badLocation: true };
    }
    const cutoff = new Date(Date.now() - p.minAgeYears * 31557600000).toISOString().slice(0, 10);
    const latPad = useRadiusL ? p.radius / 69 : 0;
    const lonPad = useRadiusL && centre ? p.radius / (69 * Math.cos((centre.lat * Math.PI) / 180)) : 0;
    const sizeCats = p.sizeBand === 'medium_plus' ? ['FULL','GROUP','MEDIUM','AUDITED ABRIDGED','AUDIT EXEMPTION SUBSIDIARY','FILING EXEMPTION SUBSIDIARY'] : null;
    const rows = await sql`
      select company_number, name, sic, incorporated, accounts_category, address1, town, postcode, lat, lon, status, count(*) over() as _total
      from acq.companies_index ci
      where sic && ${p.sic} and incorporated <= ${cutoff}
        and status = any(${p.statuses})
        ${p.qName ? sql`and name ilike ${'%' + p.qName + '%'}` : sql``}
        ${p.excludeExisting && orgId ? sql`and not exists (select 1 from acq.prospects pr where pr.org_id = ${orgId} and pr.company_number = ci.company_number)` : sql``}
        ${sizeCats ? sql`and accounts_category = any(${sizeCats})` : sql``}
        ${useRadiusL && centre ? sql`and lat between ${centre.lat - latPad} and ${centre.lat + latPad} and lon between ${centre.lon - lonPad} and ${centre.lon + lonPad}` : p.location ? sql`and (town ilike ${'%' + p.location + '%'})` : sql``}
      limit 20000`;
    if (rows.length) {
      let cands = rows.map((r: any) => ({
        company_number: r.company_number, company_name: r.name, sic_codes: r.sic,
        date_of_creation: r.incorporated ? new Date(r.incorporated).toISOString().slice(0, 10) : null, company_status: r.status ?? 'active',
        registered_office_address: { address_line_1: r.address1, locality: r.town, postal_code: r.postcode },
        _size: bulkSize(r.accounts_category),
        _distance: useRadiusL && centre && r.lat != null ? milesBetween({ lat: r.lat, lon: r.lon }, centre) : null,
      }));
      if (useRadiusL) cands = cands.filter((c: any) => c._distance != null && c._distance <= p.radius).sort((a: any, b: any) => a._distance - b._distance);
      return { candidates: cands, totalHits: Number(rows[0]._total), badLocation: false, fromIndex: true };
    }
  } catch (_) { /* fall through to Companies House */ }
  return await pullCandidatesCH(auth, state, p, maxCandidates);
}

async function pullCandidatesCH(auth: string, state: { rateLimited: boolean }, p: any, maxCandidates: number) {
  const useRadius = p.radius > 0 && !!p.location;
  const incorporatedTo = new Date(Date.now() - p.minAgeYears * 31557600000).toISOString().slice(0, 10);
  const pageSize = 500;
  let candidates: any[] = []; let totalHits = 0;
  for (let start = 0; start < maxCandidates; start += pageSize) {
    const chStatuses = (p.statuses ?? ['active']).map((x: string) => x === 'voluntary_arrangement' ? 'voluntary-arrangement' : x).join(',');
    const params = new URLSearchParams({ company_status: chStatuses, sic_codes: p.sic.slice(0, 50).join(','), incorporated_to: incorporatedTo, size: String(Math.min(pageSize, maxCandidates - start)), start_index: String(start) });
    if (p.location && !useRadius) params.set('location', p.location);
    if (p.qName) params.set('company_name_includes', p.qName);
    const sj = await chFetch(`${CH}/advanced-search/companies?${params}`, auth, state);
    if (!sj) break;
    totalHits = sj.hits ?? totalHits;
    const items = (sj.items ?? []).filter((it: any) => it.company_number);
    candidates.push(...items);
    if (items.length < pageSize || candidates.length >= Math.min(totalHits, maxCandidates)) break;
  }
  if (useRadius && candidates.length) {
    const pr = await fetch(`https://api.postcodes.io/places?q=${encodeURIComponent(p.location)}&limit=1`);
    const pj = pr.ok ? await pr.json() : null;
    const centre = pj?.result?.[0] ? { lat: pj.result[0].latitude, lon: pj.result[0].longitude } : null;
    if (!centre) return { candidates: [], totalHits, badLocation: true };
    const withPc = candidates.filter((c) => c.registered_office_address?.postal_code);
    const dist: Record<string, number> = {};
    for (let i = 0; i < withPc.length; i += 100) {
      const chunk = withPc.slice(i, i + 100);
      try {
        const br = await fetch('https://api.postcodes.io/postcodes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ postcodes: chunk.map((c) => c.registered_office_address.postal_code) }) });
        if (!br.ok) continue;
        const bj = await br.json();
        for (const r of bj.result ?? []) {
          if (r.result?.latitude != null) dist[r.query.toUpperCase().replace(/\s/g, '')] = milesBetween({ lat: r.result.latitude, lon: r.result.longitude }, centre);
        }
      } catch (_) { /* best-effort */ }
    }
    candidates = withPc
      .map((c) => ({ ...c, _distance: dist[c.registered_office_address.postal_code.toUpperCase().replace(/\s/g, '')] ?? null }))
      .filter((c) => c._distance != null && c._distance <= p.radius)
      .sort((a, b) => a._distance - b._distance);
  }
  return { candidates, totalHits, badLocation: false };
}

// Enrich a slice of candidates (shared cache first), filter, upsert prospects.
async function enrichSlice(sql: any, auth: string, state: { rateLimited: boolean }, orgId: string, p: any, slice: any[], maxResults: number | null) {
  const nums = slice.map((c) => c.company_number);
  const cachedRows = nums.length ? await sql`select company_number, directors, oldest_director_age, accounts_type from acq.company_enrichment where company_number = any(${nums}) and checked_at > now() - interval '30 days'` : [];
  const cache = new Map(cachedRows.map((r: any) => [r.company_number, r]));
  const results: any[] = []; let created = 0, updated = 0, scanned = 0, excludedSize = 0, excludedAge = 0;
  const batchSize = 8;
  for (let i = 0; i < slice.length && (maxResults == null || results.length < maxResults) && !state.rateLimited; i += batchSize) {
    const batch = slice.slice(i, i + batchSize);
    const enriched = await Promise.all(batch.map(async (it) => {
      const hit = cache.get(it.company_number);
      if (hit) return { it, accountsType: hit.accounts_type ?? null, directors: Array.isArray(hit.directors) ? hit.directors : [], oldest: hit.oldest_director_age ?? null };
      const pjj = it._size ? null : await chFetch(`${CH}/company/${it.company_number}`, auth, state);
      const accountsType = pjj?.accounts?.last_accounts?.type ?? null;
      const oj = await chFetch(`${CH}/company/${it.company_number}/officers?items_per_page=25`, auth, state);
      const directors = (oj?.items ?? []).filter((o: any) => (o.officer_role ?? '').includes('director') && !o.resigned_on)
        .map((o: any) => ({ name: o.name, dob_year: o.date_of_birth?.year ?? null, role: o.officer_role }));
      const yrs = directors.map((d: any) => d.dob_year).filter(Boolean).map((y: number) => new Date().getFullYear() - y);
      const oldest = yrs.length ? Math.max(...yrs) : null;
      if (oj) try { await sql`insert into acq.company_enrichment (company_number, directors, oldest_director_age, accounts_type, checked_at) values (${it.company_number}, ${directors}, ${oldest}, ${accountsType ?? it._size ?? null}, now()) on conflict (company_number) do update set directors=excluded.directors, oldest_director_age=excluded.oldest_director_age, accounts_type=excluded.accounts_type, checked_at=now()`; } catch (_) { /* best-effort */ }
      return { it, accountsType, directors, oldest };
    }));
    for (const e of enriched) {
      if (maxResults != null && results.length >= maxResults) break;
      scanned++;
      const size = e.it._size && e.it._size !== 'unknown' ? e.it._size : sizeClass(e.accountsType);
      if (p.sizeBand === 'small_plus' && size === 'micro') { excludedSize++; continue; }
      if (p.sizeBand === 'medium_plus' && size !== 'medium_plus') { excludedSize++; continue; }
      if (p.minDirectorAge > 0 && (e.oldest == null || e.oldest < p.minDirectorAge)) { excludedAge++; continue; }
      const it = e.it; const addr = it.registered_office_address ?? {};
      const address = [addr.address_line_1, addr.address_line_2, addr.locality, addr.region].filter(Boolean).join(', ');
      const distMiles: number | null = typeof it._distance === 'number' ? Math.round(it._distance * 10) / 10 : null;
      const { score, reasons } = fitScore({ incorporated_on: it.date_of_creation, oldest_director_age: e.oldest, company_status: it.company_status, distance_miles: distMiles, size_class: size, location: p.location });
      const cat = p.categories.find((c: string) => (p.catSic?.[c] ?? []).some((x: string) => (it.sic_codes ?? []).includes(x))) ?? p.categories[0] ?? null;
      const row = (await sql`
        insert into acq.prospects (org_id, company_name, company_number, sic_codes, address, postcode, region, incorporated_on, company_status,
          directors, oldest_director_age, provenance, exportable, source, fit_score, fit_reasons, stage, ch_snapshot, ch_last_checked)
        values (${orgId}, ${it.company_name}, ${it.company_number}, ${it.sic_codes ?? []}, ${address || null}, ${addr.postal_code ?? null}, ${addr.region ?? addr.locality ?? null},
          ${it.date_of_creation ?? null}, ${it.company_status ?? null}, ${e.directors}, ${e.oldest}, 'platform', false,
          ${{ kind: 'companies_house', category: cat, distance_miles: distMiles, accounts_type: e.accountsType, size_class: size, query: p }},
          ${score}, ${reasons}, 'enriched', ${it}, now())
        on conflict (org_id, company_number) where company_number is not null
        do update set directors=excluded.directors, oldest_director_age=excluded.oldest_director_age, fit_score=excluded.fit_score,
          fit_reasons=excluded.fit_reasons, source=excluded.source, ch_snapshot=excluded.ch_snapshot, ch_last_checked=now(), updated_at=now()
        returning id, (xmax = 0) as inserted`)[0];
      if (row.inserted) created++; else updated++;
      results.push({ id: row.id, company_name: it.company_name, company_number: it.company_number, fit_score: score, oldest_director_age: e.oldest, incorporated_on: it.date_of_creation, address, distance_miles: distMiles, size: SIZE_LABEL[size], status: it.company_status ?? 'active' });
    }
  }
  return { results, created, updated, scanned, excludedSize, excludedAge };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'search';
    if (action === 'taxonomy') {
      const TAX = await getTaxonomy(sql);
      await sql.end({ timeout: 5 });
      return json({ ok: true, taxonomy: Object.entries(TAX).map(([key, v]: [string, any]) => ({ key, label: v.label, group: v.group, sic: v.sic })) });
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
    if (!cfg.ch_api_key) { await sql.end({ timeout: 5 }); return json({ error: 'Companies House API key not configured' }); }
    const auth = 'Basic ' + btoa(cfg.ch_api_key + ':');
    const state = { rateLimited: false };

    // ---------- cron: process background runs across ALL orgs ----------
    if (action === 'process_runs' && trusted) {
      const runs = await sql`select * from acq.sourcing_runs where status in ('queued','running') order by created_at limit 3`;
      const CHUNK = 120; const report: any[] = [];
      for (const run of runs) {
        try {
          const p = parseParams(run.params, await getTaxonomy(sql));
          const runTotals = typeof run.totals === 'string' ? JSON.parse(run.totals) : (run.totals ?? {});
          const { candidates, badLocation } = await pullCandidates(sql, auth, state, p, 20000, run.org_id);
          if (badLocation) { await sql`update acq.sourcing_runs set status='error', error='location not found', updated_at=now() where id=${run.id}`; continue; }
          if (candidates.length === 0) {
            // empty pull: usually a rate limit or a transient geocode failure — defer, don't falsely complete
            const attempts = (runTotals.pull_attempts ?? 0) + 1;
            if (state.rateLimited || attempts < 3) {
              await sql`update acq.sourcing_runs set status='running', totals=${{ ...runTotals, pull_attempts: attempts }}, updated_at=now() where id=${run.id}`;
              report.push({ run: run.id, deferred: state.rateLimited ? 'rate_limited' : 'empty_pull_retry' });
              if (state.rateLimited) break;
              continue;
            }
            await sql`update acq.sourcing_runs set status='done', candidates_total=0, updated_at=now() where id=${run.id}`;
            report.push({ run: run.id, done: true, empty: true });
            continue;
          }
          if (run.cursor_pos >= candidates.length) { await sql`update acq.sourcing_runs set status='done', candidates_total=${candidates.length}, updated_at=now() where id=${run.id}`; report.push({ run: run.id, done: true }); continue; }
          const slice = candidates.slice(run.cursor_pos, run.cursor_pos + CHUNK);
          const r = await enrichSlice(sql, auth, state, run.org_id, p, slice, null);
          const totals = { scanned: (runTotals.scanned ?? 0) + r.scanned, created: (runTotals.created ?? 0) + r.created, updated: (runTotals.updated ?? 0) + r.updated, excluded_size: (runTotals.excluded_size ?? 0) + r.excludedSize, excluded_age: (runTotals.excluded_age ?? 0) + r.excludedAge };
          const newCursor = run.cursor_pos + r.scanned;
          const done = newCursor >= candidates.length && !state.rateLimited;
          await sql`update acq.sourcing_runs set cursor_pos=${newCursor}, candidates_total=${candidates.length}, totals=${totals}, status=${done ? 'done' : 'running'}, updated_at=now() where id=${run.id}`;
          report.push({ run: run.id, processed: r.scanned, done });
          if (state.rateLimited) break; // resume next tick
        } catch (e) {
          await sql`update acq.sourcing_runs set status='error', error=${String(e).slice(0, 300)}, updated_at=now() where id=${run.id}`;
        }
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, runs: report, rate_limited: state.rateLimited });
    }

    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} and role in ('owner','admin','analyst') order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else if (!orgId) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    if (action === 'runs') {
      const runs = await sql`select id, params, status, cursor_pos, candidates_total, totals, error, created_at, updated_at from acq.sourcing_runs where org_id=${orgId} order by created_at desc limit 10`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, runs });
    }

    if (action === 'cancel_run') {
      await sql`update acq.sourcing_runs set status='cancelled', updated_at=now() where id=${body.run_id} and org_id=${orgId} and status in ('queued','running')`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    if (action === 'start_run') {
      const p = parseParams(body, await getTaxonomy(sql));
      if (!p.sic.length) { await sql.end({ timeout: 5 }); return json({ error: 'Pick at least one industry' }); }
      const active = Number((await sql`select count(*)::int as n from acq.sourcing_runs where org_id=${orgId} and status in ('queued','running')`)[0].n);
      if (active >= 2) { await sql.end({ timeout: 5 }); return json({ error: 'You already have 2 sourcing runs in progress — let one finish first.' }); }
      const run = (await sql`insert into acq.sourcing_runs (org_id, params) values (${orgId}, ${{ categories: p.categories, sic_codes: p.sic, location: p.location, radius_miles: p.radius, min_age_years: p.minAgeYears, size_band: p.sizeBand, min_director_age: p.minDirectorAge, statuses: p.statuses, q_name: p.qName, exclude_existing: p.excludeExisting }}) returning id, status, created_at`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, run, note: 'Queued. The engine works through the whole match set in the background — roughly 700 companies an hour — and results appear in Prospects as they are analysed.' });
    }

    if (action === 'search') {
      const p = parseParams(body, await getTaxonomy(sql));
      if (!p.sic.length) { await sql.end({ timeout: 5 }); return json({ error: 'Pick at least one industry' }); }
      const maxResults = Math.min(Number(body.max_results ?? 25), 50);
      const useRadius = p.radius > 0 && !!p.location;
      const { candidates, totalHits, badLocation } = await pullCandidates(sql, auth, state, p, useRadius ? 3000 : Math.min(400, maxResults * 8), orgId);
      if (badLocation) { await sql.end({ timeout: 5 }); return json({ error: `Couldn't locate "${p.location}" — try a bigger town or city name` }); }
      if (state.rateLimited && candidates.length === 0) { await sql.end({ timeout: 5 }); return json({ error: 'Companies House is rate-limiting us after several searches in a row. Wait a minute and run it again.' }); }
      const considered = candidates.length;
      const r = await enrichSlice(sql, auth, state, orgId, p, candidates.slice(0, 150), maxResults);
      r.results.sort((a: any, b: any) => b.fit_score - a.fit_score);
      await sql.end({ timeout: 5 });
      return json({ ok: true, total_hits: totalHits, considered, scanned: r.scanned, excluded_size: r.excludedSize, excluded_age: r.excludedAge, rate_limited: state.rateLimited, created: r.created, updated: r.updated, prospects: r.results });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
