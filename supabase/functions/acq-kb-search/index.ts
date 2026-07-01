// acq-kb-search — search the firm knowledge base (org-level reference material).
// POST { q } -> matches with a snippet. Auth: member JWT OR x-acq-secret.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const q = String(body.q || '').trim();
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret')`).map((r: any) => [r.key, r.value]));
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

    const like = `%${q}%`;
    const rows = q
      ? await sql`select file_name, summary, extracted_text from acq.knowledge_docs where org_id=${orgId} and status='done' and (extracted_text ilike ${like} or summary ilike ${like} or file_name ilike ${like}) order by updated_at desc limit 20`
      : await sql`select file_name, summary, extracted_text from acq.knowledge_docs where org_id=${orgId} and status='done' order by updated_at desc limit 20`;
    const matches = rows.map((r: any) => {
      const text = String(r.extracted_text || '');
      let snippet = String(r.summary || '').slice(0, 240);
      if (q) { const i = text.toLowerCase().indexOf(q.toLowerCase()); if (i >= 0) snippet = (i > 60 ? '…' : '') + text.slice(Math.max(0, i - 60), i + 180).replace(/\s+/g, ' ').trim() + '…'; }
      return { file_name: r.file_name, summary: r.summary, snippet };
    });
    await sql.end({ timeout: 5 });
    return json({ ok: true, matches });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
});
