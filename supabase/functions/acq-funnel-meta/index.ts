// acq-funnel-meta — public, whitelisted brand info for rendering a tenant's
// seller funnel on the app domain (supabase.co gateway forces text/plain on
// HTML, so the page itself is a React route; this feeds it brand + copy).
import postgres from 'npm:postgres@3.4.5';
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const slug = new URL(req.url).searchParams.get('org');
    let org: any = null;
    if (slug) org = (await sql`select name, settings from acq.organizations where settings->'funnel'->>'slug' = ${slug} or id::text = ${slug} limit 1`)[0];
    if (!org) org = (await sql`select name, settings from acq.organizations order by created_at limit 1`)[0];
    await sql.end({ timeout: 5 });
    if (!org) return json({ error: 'not found' }, 404);
    const b = org.settings?.brand ?? {}; const f = org.settings?.funnel ?? {};
    // whitelist only — settings can hold tokens that must never leak
    return json({ ok: true, name: b.name || org.name, color: b.color || '#0A2540', accent: b.accent || '#FFD700', logo: b.logo ?? null, headline: f.headline ?? null, subheadline: f.subheadline ?? null, slug: f.slug ?? null });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
