// =============================================================================
// acq-drive-sync — two-way Google Drive sync for a tenant's deals.
//  (A) every deal gets a Drive folder `Ref — Name` with standard subfolders
//  (B) documents dropped into a deal folder are pulled into the data room
//  (C) a NEW folder dropped under the Deals root becomes a new deal
// Auth: member JWT OR x-acq-secret. Runs on demand ("Sync now") and on schedule.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUBFOLDERS = ['Accounts', 'Financials', 'Legal', 'Property', 'Correspondence', 'Outputs'];
const dq = (s: string) => encodeURIComponent(s);
const EXPORT: Record<string, { mime: string; ext: string }> = {
  'application/vnd.google-apps.document': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: '.docx' },
  'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: '.xlsx' },
  'application/vnd.google-apps.presentation': { mime: 'application/pdf', ext: '.pdf' },
};

async function getToken(sql: any, acc: any, cfg: any): Promise<string> {
  const now = Date.now();
  if (acc.access_token && acc.token_expires_at && new Date(acc.token_expires_at).getTime() > now + 60000) return acc.access_token;
  if (!acc.refresh_token) throw new Error('no refresh token, reconnect Drive');
  const rr = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ refresh_token: acc.refresh_token, client_id: cfg.google_client_id, client_secret: cfg.google_client_secret, grant_type: 'refresh_token' }) });
  const t = await rr.json();
  if (!rr.ok || !t.access_token) throw new Error('drive token refresh failed');
  const exp = new Date(now + (t.expires_in ?? 3500) * 1000);
  await sql`update acq.drive_accounts set access_token=${t.access_token}, token_expires_at=${exp}, updated_at=now() where org_id=${acc.org_id}`;
  acc.access_token = t.access_token; acc.token_expires_at = exp;
  return t.access_token;
}
async function listChildren(token: string, parentId: string, foldersOnly = false): Promise<any[]> {
  let q = `'${parentId}' in parents and trashed=false`;
  if (foldersOnly) q += ` and mimeType='application/vnd.google-apps.folder'`;
  const url = `https://www.googleapis.com/drive/v3/files?q=${dq(q)}&fields=${dq('files(id,name,mimeType,size)')}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('drive list ' + r.status + ' ' + (await r.text()).slice(0, 120));
  return (await r.json()).files || [];
}
async function createFolder(token: string, name: string, parentId: string): Promise<string> {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }) });
  if (!r.ok) throw new Error('drive create folder ' + r.status);
  return (await r.json()).id;
}
async function ensureSubfolders(token: string, parentId: string) {
  const have = new Set((await listChildren(token, parentId, true)).map((f: any) => f.name));
  for (const name of SUBFOLDERS) if (!have.has(name)) { try { await createFolder(token, name, parentId); } catch (_) { /**/ } }
}
async function downloadDrive(token: string, file: any): Promise<{ bytes: Uint8Array; mediaType: string; fileName: string } | null> {
  const gapps = String(file.mimeType || '').startsWith('application/vnd.google-apps.');
  let url: string, mediaType: string, fileName = String(file.name || 'document');
  if (gapps) {
    const ex = EXPORT[file.mimeType]; if (!ex) return null; // skip forms, shortcuts etc
    url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${dq(ex.mime)}`;
    mediaType = ex.mime; if (!fileName.toLowerCase().endsWith(ex.ext)) fileName += ex.ext;
  } else {
    if (file.size && Number(file.size) > 25 * 1024 * 1024) return null; // skip very large binaries
    url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&supportsAllDrives=true`;
    mediaType = file.mimeType || 'application/octet-stream';
  }
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) return null;
  return { bytes: new Uint8Array(await r.arrayBuffer()), mediaType, fileName };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('google_client_id','google_client_secret','acq_internal_secret','from_email')`).map((r: any) => [r.key, r.value]));
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

    const acc = (await sql`select * from acq.drive_accounts where org_id=${orgId}`)[0];
    if (!acc) { await sql.end({ timeout: 5 }); return json({ error: 'Google Drive is not connected. Connect it in Settings first.' }, 400); }

    let token: string;
    try { token = await getToken(sql, acc, cfg); }
    catch (e: any) { await sql`update acq.drive_accounts set status='error', last_error=${String(e).slice(0, 300)} where org_id=${orgId}`; await sql.end({ timeout: 5 }); return json({ error: String(e) }, 502); }

    let created_folders = 0, ingested_docs = 0, new_deals = 0, kb_ingested = 0;
    const results: any[] = [];

    // auto-provision the Deals root folder if the user hasn't chosen one
    let root = acc.root_folder_id;
    if (!root) {
      try { root = await createFolder(token, 'Officially Invested — Deals', 'root'); await sql`update acq.drive_accounts set root_folder_id=${root}, root_folder_name='Officially Invested — Deals', updated_at=now() where org_id=${orgId}`; }
      catch (e: any) { await sql.end({ timeout: 5 }); return json({ error: 'could not create the Deals folder: ' + String(e).slice(0, 120) }, 502); }
    }

    // ---- (A) ensure every existing deal has a Drive folder ----
    const deals = await sql`select id, name, submission_id, drive_folder_id from acq.deals where org_id=${orgId} order by created_at desc limit 100`;
    for (const d of deals) {
      if (d.drive_folder_id) continue;
      try {
        const ref = d.submission_id ? (await sql`select reference from public.submissions where id=${d.submission_id}`)[0]?.reference : null;
        const folderName = (ref ? ref + ' — ' : '') + (d.name || 'Untitled deal');
        const fid = await createFolder(token, folderName, root);
        await ensureSubfolders(token, fid);
        await sql`update acq.deals set drive_folder_id=${fid} where id=${d.id}`;
        d.drive_folder_id = fid; created_folders++;
      } catch (e: any) { results.push({ deal: d.name, error: String(e).slice(0, 120) }); }
    }

    // ---- (B)+(C) walk the root folder ----
    const byFolder = new Map<string, any>();
    for (const d of deals) if (d.drive_folder_id) byFolder.set(d.drive_folder_id, d);
    let children: any[] = [];
    try { children = await listChildren(token, root, true); } catch (e: any) { await sql.end({ timeout: 5 }); return json({ error: String(e) }, 502); }

    for (const folder of children.slice(0, 60)) {
      let deal = byFolder.get(folder.id);
      // (C) a folder we don't recognise = a dropped deal
      if (!deal) {
        try {
          const safeEmail = cfg.from_email || 'deals@officiallyinvested.com';
          const sub = (await sql`insert into public.submissions (type, submitter_name, email, phone, submitter_role, heard_via, business_name, consent, marketing_optin, status)
            values ('business', 'Officially Invested (origination)', ${safeEmail}, '', 'other', 'drive', ${folder.name}, true, false, 'reviewing') returning id`)[0];
          deal = (await sql`insert into acq.deals (org_id, name, asset_type, sector, status, source, submission_id, drive_folder_id, created_by)
            values (${orgId}, ${folder.name}, 'business', 'other', 'screening', 'drive', ${sub.id}, ${folder.id}, ${userId}) returning id, name, drive_folder_id`)[0];
          await ensureSubfolders(token, folder.id);
          byFolder.set(folder.id, deal); new_deals++;
        } catch (e: any) { results.push({ folder: folder.name, error: 'create deal: ' + String(e).slice(0, 120) }); continue; }
      }

      // ingest files in the deal folder + its subfolders (one level down)
      try {
        const existing = new Set((await sql`select storage_path from acq.documents where deal_id=${deal.id}`).map((r: any) => String(r.storage_path || '')));
        const buckets = [folder, ...(await listChildren(token, folder.id, true))];
        for (const bkt of buckets) {
          const files = (await listChildren(token, bkt.id, false)).filter((f: any) => !String(f.mimeType || '').startsWith('application/vnd.google-apps.folder'));
          for (const file of files) {
            if ([...existing].some((s) => s.startsWith(`drive/${file.id}-`))) continue;
            const dloaded = await downloadDrive(token, file);
            if (!dloaded) continue;
            const safe = dloaded.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
            const path = `drive/${file.id}-${safe}`;
            const up = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${path}`, { method: 'POST', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'content-type': dloaded.mediaType, 'x-upsert': 'true' }, body: dloaded.bytes });
            if (!up.ok) continue;
            const drow = (await sql`insert into acq.documents (org_id, deal_id, storage_path, file_name, file_type, doc_kind, extraction_status, uploaded_by)
              values (${orgId}, ${deal.id}, ${path}, ${dloaded.fileName}, ${dloaded.mediaType}, 'other', 'processing', ${userId}) returning id`)[0];
            existing.add(path); ingested_docs++;
            const kick = fetch(`${SUPABASE_URL}/functions/v1/acq-extract`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acq-secret': cfg.acq_internal_secret }, body: JSON.stringify({ document_id: drow.id }) }).catch(() => {});
            try { (globalThis as any).EdgeRuntime?.waitUntil?.(kick); } catch (_) { /**/ }
          }
        }
      } catch (e: any) { results.push({ folder: folder.name, error: 'ingest: ' + String(e).slice(0, 120) }); }
    }

    // ---- Knowledge base: ingest firm reference material (org-wide context) ----
    if (acc.kb_folder_id) {
      try {
        const existingKb = new Set((await sql`select drive_file_id from acq.knowledge_docs where org_id=${orgId}`).map((r: any) => String(r.drive_file_id || '')));
        const kbFolders = [{ id: acc.kb_folder_id }, ...(await listChildren(token, acc.kb_folder_id, true))];
        for (const kf of kbFolders.slice(0, 25)) {
          const files = (await listChildren(token, kf.id, false)).filter((f: any) => !String(f.mimeType || '').startsWith('application/vnd.google-apps.folder'));
          for (const file of files) {
            if (existingKb.has(file.id)) continue;
            const dloaded = await downloadDrive(token, file);
            if (!dloaded) continue;
            const safe = dloaded.fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
            const path = `kb/${orgId}/${file.id}-${safe}`;
            const up = await fetch(`${SUPABASE_URL}/storage/v1/object/acq-documents/${path}`, { method: 'POST', headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'content-type': dloaded.mediaType, 'x-upsert': 'true' }, body: dloaded.bytes });
            if (!up.ok) continue;
            const krow = (await sql`insert into acq.knowledge_docs (org_id, drive_file_id, storage_path, file_name, file_type, status)
              values (${orgId}, ${file.id}, ${path}, ${dloaded.fileName}, ${dloaded.mediaType}, 'processing')
              on conflict (org_id, drive_file_id) do update set storage_path=excluded.storage_path, file_name=excluded.file_name, status='processing', updated_at=now() returning id`)[0];
            existingKb.add(file.id); kb_ingested++;
            const kick = fetch(`${SUPABASE_URL}/functions/v1/acq-kb-extract`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acq-secret': cfg.acq_internal_secret }, body: JSON.stringify({ knowledge_doc_id: krow.id }) }).catch(() => {});
            try { (globalThis as any).EdgeRuntime?.waitUntil?.(kick); } catch (_) { /**/ }
          }
        }
      } catch (e: any) { results.push({ kb: 'ingest: ' + String(e).slice(0, 120) }); }
    }

    await sql`update acq.drive_accounts set last_synced_at=now(), status='connected', last_error=null where org_id=${orgId}`;
    await sql.end({ timeout: 5 });
    return json({ ok: true, created_folders, ingested_docs, new_deals, kb_ingested, results });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /**/ }
    return json({ error: String(e) }, 500);
  }
});
