// =============================================================================
// acq-refresh v4 — FULLY SERVERLESS monthly Companies House index refresh.
// pg_cron advances a state machine; each part is processed in ROW SLICES
// (row_offset cursor) with BOTH a row cap and a wall-time guard (with a
// minimum-progress floor so deep slices can never stall) so each invocation
// stays inside edge compute limits.
// Phases: parts(1..7 x slices) -> geocode -> finalize -> done.
// Trusted only (x-acq-secret). action: run | status | reset
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const iso = (d: any) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);

function csvLine(line: string): string[] {
  const out: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}
function mapStatus(s: string): string | null {
  const l = s.toLowerCase();
  if (l.includes('administration')) return 'administration';
  if (l.includes('receiver')) return 'receivership';
  if (l.includes('liquidation')) return 'liquidation';
  if (l.includes('voluntary arrangement')) return 'voluntary_arrangement';
  if (s === 'Active') return 'active';
  return null;
}

async function* zipCsvLines(resp: Response): AsyncGenerator<string> {
  const raw = resp.body!.getReader();
  let head = new Uint8Array(0);
  while (head.length < 30) {
    const { value, done } = await raw.read();
    if (done) throw new Error('zip too short');
    const merged = new Uint8Array(head.length + value.length); merged.set(head); merged.set(value, head.length); head = merged;
  }
  const dv = new DataView(head.buffer);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error('not a zip');
  const nameLen = dv.getUint16(26, true), extraLen = dv.getUint16(28, true);
  const skip = 30 + nameLen + extraLen;
  while (head.length < skip) {
    const { value, done } = await raw.read();
    if (done) throw new Error('zip header truncated');
    const merged = new Uint8Array(head.length + value.length); merged.set(head); merged.set(value, head.length); head = merged;
  }
  const rest = head.slice(skip);
  const deflated = new ReadableStream({
    start(c) { if (rest.length) c.enqueue(rest); },
    async pull(c) { const { value, done } = await raw.read(); if (done) c.close(); else c.enqueue(value); },
    cancel() { raw.cancel(); },
  });
  const textStream = deflated.pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(new TextDecoderStream());
  const tr = textStream.getReader();
  try {
    let buf = '';
    while (true) {
      const { value, done } = await tr.read();
      if (done) break;
      buf += value;
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) { yield buf.slice(0, nl); buf = buf.slice(nl + 1); }
    }
    if (buf.trim()) yield buf;
  } finally { try { tr.cancel(); } catch (_) { /* noop */ } }
}

Deno.serve(async (req: Request) => {
  const sql = postgres(DB_URL, { prepare: false });
  const startedAt = Date.now();
  try {
    const body = await req.json().catch(() => ({} as any));
    const MAXROWS = Number(body.maxrows ?? 60000);       // rows parsed per invocation
    const TIME_BUDGET_MS = Number(body.budget_ms ?? 15000); // wall guard per invocation
    const MIN_PROGRESS = 10000;                           // never stop before this many rows
    const secret = (await sql`select value from public.oi_config where key='acq_internal_secret'`)[0]?.value;
    if (!secret || req.headers.get('x-acq-secret') !== secret) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
    const action = body.action ?? 'run';

    if (action === 'status') {
      const st = (await sql`select * from acq.index_refresh where id=1`)[0];
      await sql.end({ timeout: 5 });
      return json({ ok: true, state: st });
    }
    if (action === 'reset') {
      await sql`update acq.index_refresh set month=null, part=0, phase='idle', totals='{}', last_error=null, updated_at=now() where id=1`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    let st = (await sql`select * from acq.index_refresh where id=1`)[0];
    const target = new Date(); const targetMonth = `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-01`;
    if (!st.month || iso(st.month) < targetMonth || st.phase === 'idle') {
      await sql`update acq.index_refresh set month=${targetMonth}, part=${iso(st.month ?? '') === targetMonth && st.phase !== 'idle' ? st.part : 0}, phase='parts', totals=${iso(st.month ?? '') === targetMonth ? st.totals : {}}, last_error=null, updated_at=now() where id=1`;
      st = (await sql`select * from acq.index_refresh where id=1`)[0];
    }
    const month = iso(st.month);
    if (st.phase === 'done') { await sql.end({ timeout: 5 }); return json({ ok: true, phase: 'done', note: 'nothing to do' }); }

    if (st.phase === 'parts') {
      const t0 = typeof st.totals === 'string' ? JSON.parse(st.totals) : (st.totals ?? {});
      const startRow = Number(t0.row_offset ?? 0);
      const part = startRow > 0 ? Math.max(st.part, 1) : st.part + 1; // resume same part mid-slice
      const url = `https://download.companieshouse.gov.uk/BasicCompanyData-${month}-part${part}_7.zip`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'OfficiallyInvested-IndexRefresh/1.0' } });
      if (!resp.ok) {
        await sql`update acq.index_refresh set last_error=${'part ' + part + ' HTTP ' + resp.status}, updated_at=now() where id=1`;
        await sql.end({ timeout: 5 });
        return json({ ok: true, deferred: 'download ' + resp.status, url });
      }
      const tax = await sql`select sic from acq.sic_taxonomy`;
      const SICS = new Set<string>(tax.flatMap((t: any) => t.sic));
      const cutoff = new Date(Date.now() - 3 * 31557600000).toISOString().slice(0, 10);
      let cols: Record<string, number> | null = null;
      let row_no = 0, kept = 0, lastProcessed = startRow; let exhausted = true; let batch: any[] = [];
      const flush = async () => {
        if (!batch.length) return;
        await sql`
          insert into acq.companies_index (company_number, name, sic, sic_primary, incorporated, accounts_category, address1, town, postcode, outcode, status, snapshot_month)
          select x.company_number, x.name, x.sic, x.sic_primary, x.incorporated::date, x.accounts_category, x.address1, x.town, x.postcode, x.outcode, x.status, ${month}::date
          from jsonb_to_recordset(${batch}) as x(company_number text, name text, sic text[], sic_primary text, incorporated text, accounts_category text, address1 text, town text, postcode text, outcode text, status text)
          on conflict (company_number) do update set name=excluded.name, sic=excluded.sic, sic_primary=excluded.sic_primary, incorporated=excluded.incorporated,
            accounts_category=excluded.accounts_category, address1=excluded.address1, town=excluded.town, postcode=excluded.postcode,
            outcode=excluded.outcode, status=excluded.status, snapshot_month=excluded.snapshot_month`;
        batch = [];
      };
      for await (const line of zipCsvLines(resp)) {
        if (!cols) { const header = csvLine(line); cols = {}; header.forEach((h, i) => { cols![h.trim()] = i; }); continue; }
        row_no++;
        if (row_no <= startRow) continue;
        const progressed = lastProcessed - startRow;
        if (row_no > startRow + MAXROWS || ((Date.now() - startedAt) > TIME_BUDGET_MS && progressed >= MIN_PROGRESS)) { exhausted = false; break; }
        lastProcessed = row_no;
        try {
          const row = csvLine(line);
          const status = mapStatus(row[cols['CompanyStatus']] ?? '');
          if (!status) continue;
          const acc = row[cols['Accounts.AccountCategory']] ?? '';
          if (acc === 'DORMANT' || acc === 'MICRO ENTITY') continue;
          if (status === 'active' && acc === 'NO ACCOUNTS FILED') continue;
          const sicsRow: string[] = [];
          for (const f of ['SICCode.SicText_1','SICCode.SicText_2','SICCode.SicText_3','SICCode.SicText_4']) { const v = row[cols[f]]; if (v) sicsRow.push(v.slice(0, 5)); }
          const hit = sicsRow.filter((x) => SICS.has(x));
          if (!hit.length) continue;
          const inc = row[cols['IncorporationDate']];
          if (!inc) continue;
          const [d, m, y] = inc.split('/');
          const isoDate = `${y}-${m}-${d}`;
          if (isoDate > cutoff) continue;
          const pc = (row[cols['RegAddress.PostCode']] ?? '').trim().toUpperCase();
          batch.push({ company_number: row[cols['CompanyNumber']], name: (row[cols['CompanyName']] ?? '').slice(0, 120), sic: hit,
            sic_primary: sicsRow[0] ?? null, incorporated: isoDate, accounts_category: acc.slice(0, 40),
            address1: (row[cols['RegAddress.AddressLine1']] ?? '').slice(0, 80), town: (row[cols['RegAddress.PostTown']] ?? '').slice(0, 40),
            postcode: pc.slice(0, 10), outcode: pc.split(' ')[0] ?? '', status });
          kept++;
          if (batch.length >= 2000) await flush();
        } catch (_) { /* row best-effort */ }
      }
      await flush();
      const totals = { ...t0, kept: (t0.kept ?? 0) + kept, row_offset: exhausted ? 0 : lastProcessed };
      const nextPhase = exhausted && part >= 7 ? 'geocode' : 'parts';
      await sql`update acq.index_refresh set part=${part}, phase=${nextPhase}, totals=${totals}, last_error=null, updated_at=now() where id=1`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, part, slice_from: startRow, processed: lastProcessed - startRow, kept, exhausted, next: nextPhase });
    }

    if (st.phase === 'geocode') {
      const missing = await sql`select distinct ci.outcode from acq.companies_index ci left join acq.outcode_geo g on g.outcode = ci.outcode where g.outcode is null and ci.outcode <> '' limit 500`;
      for (let i = 0; i < missing.length; i += 25) {
        const b = missing.slice(i, i + 25);
        const results = await Promise.all(b.map(async (m: any) => {
          try { const r = await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(m.outcode)}`); const j = r.ok ? await r.json() : null; return { outcode: m.outcode, lat: j?.result?.latitude ?? null, lon: j?.result?.longitude ?? null }; }
          catch (_) { return { outcode: m.outcode, lat: null, lon: null }; }
        }));
        for (const g of results) await sql`insert into acq.outcode_geo (outcode, lat, lon) values (${g.outcode}, ${g.lat}, ${g.lon}) on conflict (outcode) do update set lat=excluded.lat, lon=excluded.lon`;
      }
      if (missing.length < 500) {
        await sql`update acq.companies_index ci set lat = g.lat, lon = g.lon from acq.outcode_geo g where g.outcode = ci.outcode and ci.lat is null and g.lat is not null`;
        await sql`update acq.index_refresh set phase='finalize', updated_at=now() where id=1`;
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, phase: 'geocode', geocoded: missing.length });
    }

    if (st.phase === 'finalize') {
      const del = await sql`delete from acq.companies_index where snapshot_month < ${month}::date or snapshot_month is null returning company_number`;
      try { await sql.unsafe('vacuum acq.companies_index'); } catch (_) { /* best-effort */ }
      const stats = (await sql`select count(*)::int as rows, count(*) filter (where status <> 'active')::int as distressed, count(sic_primary)::int as with_primary, pg_size_pretty(pg_total_relation_size('acq.companies_index')) as size from acq.companies_index`)[0];
      const t = typeof st.totals === 'string' ? JSON.parse(st.totals) : (st.totals ?? {});
      await sql`update acq.index_refresh set phase='done', totals=${{ ...t, deleted_old: del.length, ...stats }}, updated_at=now() where id=1`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, phase: 'done', deleted_old: del.length, ...stats });
    }

    await sql.end({ timeout: 5 });
    return json({ ok: true, phase: st.phase });
  } catch (e) {
    try {
      await sql`update acq.index_refresh set last_error=${String(e).slice(0, 300)}, updated_at=now() where id=1`;
      await sql.end({ timeout: 5 });
    } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
