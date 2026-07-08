// =============================================================================
// acq-index v4 — bulk ingestion + geocoding for the local Companies House index.
// Guarded by oi_config.acq_index_token (narrow scope: public registry data only).
// v3: rows carry `status` (active | administration | receivership | liquidation |
// voluntary_arrangement) so distressed-deal searches work locally.
// v4: rows carry `sic_primary` (first code of SICCode.SicText_1 — the company's
// primary classification) so acq-source can offer "primary industry only" matching.
// Monthly refresh: download BasicCompanyDataAsOneFile-YYYY-MM-01.zip, filter,
// ingest_rows in chunks, geocode_outcodes until remaining=0, apply_geo, wipe_month.
// Actions: ingest_rows | stats | wipe_month | geocode_outcodes | apply_geo
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-index-token', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const token = (await sql`select value from public.oi_config where key='acq_index_token'`)[0]?.value;
    if (!token || req.headers.get('x-index-token') !== token) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }

    if (body.action === 'stats') {
      const r = (await sql`select count(*)::int as rows, count(*) filter (where status <> 'active')::int as distressed, count(lat)::int as geocoded, count(sic_primary)::int as sic_primary_n, max(snapshot_month) as snapshot, pg_size_pretty(pg_total_relation_size('acq.companies_index')) as size from acq.companies_index`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, ...r });
    }

    if (body.action === 'ingest_rows') {
      const rows = body.rows;
      if (!Array.isArray(rows) || !rows.length) { await sql.end({ timeout: 5 }); return json({ error: 'rows required' }, 400); }
      const month = body.snapshot_month ?? null;
      const r = await sql`
        insert into acq.companies_index (company_number, name, sic, sic_primary, incorporated, accounts_category, address1, town, postcode, outcode, lat, lon, status, snapshot_month)
        select x.company_number, x.name, x.sic, x.sic_primary, x.incorporated::date, x.accounts_category, x.address1, x.town, x.postcode, x.outcode, x.lat, x.lon, coalesce(x.status, 'active'), ${month}::date
        from jsonb_to_recordset(${rows}) as x(company_number text, name text, sic text[], sic_primary text, incorporated text, accounts_category text, address1 text, town text, postcode text, outcode text, lat double precision, lon double precision, status text)
        on conflict (company_number) do update set name=excluded.name, sic=excluded.sic, sic_primary=excluded.sic_primary, incorporated=excluded.incorporated,
          accounts_category=excluded.accounts_category, address1=excluded.address1, town=excluded.town, postcode=excluded.postcode,
          outcode=excluded.outcode, status=excluded.status, snapshot_month=excluded.snapshot_month
        returning company_number`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, upserted: r.length });
    }

    if (body.action === 'geocode_outcodes') {
      const missing = await sql`select distinct ci.outcode from acq.companies_index ci left join acq.outcode_geo g on g.outcode = ci.outcode where g.outcode is null and ci.outcode <> '' limit 500`;
      let done = 0;
      for (let i = 0; i < missing.length; i += 25) {
        const batch = missing.slice(i, i + 25);
        const results = await Promise.all(batch.map(async (m: any) => {
          try {
            const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(m.outcode)}`);
            if (!r.ok) return { outcode: m.outcode, lat: null, lon: null };
            const j = await r.json();
            return { outcode: m.outcode, lat: j?.result?.latitude ?? null, lon: j?.result?.longitude ?? null };
          } catch (_) { return { outcode: m.outcode, lat: null, lon: null }; }
        }));
        for (const g of results) { await sql`insert into acq.outcode_geo (outcode, lat, lon) values (${g.outcode}, ${g.lat}, ${g.lon}) on conflict (outcode) do update set lat=excluded.lat, lon=excluded.lon`; done++; }
      }
      const left = (await sql`select count(distinct ci.outcode)::int as n from acq.companies_index ci left join acq.outcode_geo g on g.outcode = ci.outcode where g.outcode is null and ci.outcode <> ''`)[0].n;
      await sql.end({ timeout: 5 });
      return json({ ok: true, geocoded: done, remaining: left });
    }

    if (body.action === 'apply_geo') {
      const r = await sql`update acq.companies_index ci set lat = g.lat, lon = g.lon from acq.outcode_geo g where g.outcode = ci.outcode and ci.lat is null and g.lat is not null returning ci.company_number`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, updated: r.length });
    }

    if (body.action === 'wipe_month') {
      const r = await sql`delete from acq.companies_index where snapshot_month < ${body.keep_month}::date returning company_number`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, deleted: r.length });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
