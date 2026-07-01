// =============================================================================
// acq-doc — return a short-lived signed URL to open/download a deal document.
// Dual auth: x-acq-secret OR a signed-in member of the document's org.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    if (!body.document_id) { await sql.end({ timeout: 5 }); return json({ error: 'document_id required' }, 400); }
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    const doc = (await sql`select org_id, storage_path, file_name from acq.documents where id=${body.document_id}`)[0];
    if (!doc) { await sql.end({ timeout: 5 }); return json({ error: 'document not found' }, 404); }
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${doc.org_id} and user_id=${userId}`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }
    await sql.end({ timeout: 5 });
    if (!doc.storage_path || doc.storage_path.startsWith('inline/')) {
      return json({ error: 'not_stored', message: 'This file was uploaded before file storage was enabled. Re-upload it to open it.' }, 409);
    }
    const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/acq-documents/${doc.storage_path}`, {
      method: 'POST', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'content-type': 'application/json' },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    if (!r.ok) return json({ error: 'could not sign', detail: (await r.text()).slice(0, 200) }, 502);
    const j = await r.json();
    const signed = j.signedURL || j.signedUrl;
    if (!signed) return json({ error: 'no url returned' }, 502);
    return json({ ok: true, url: `${SUPABASE_URL}/storage/v1${signed}`, file_name: doc.file_name });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
});
