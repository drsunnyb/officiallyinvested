// Client for the acquisition analysis core (acq.* edge functions).
// supabase.functions.invoke automatically attaches the signed-in user's JWT,
// which each function validates and checks org membership against.
import { supabase } from './supabase';

export interface AcqBundle {
  ok: boolean;
  deal: any;
  facts: any[];
  documents: any[];
  valuation: any | null;
  analysis: any | null;
  verdict: any | null;
  memo: any | null;
  drafts: any[];
  deal_contacts: any[];
  communications: any[];
  email_alias: string | null;
}

async function invoke<T = any>(fn: string, body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase not configured');
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error);
  return data as T;
}

export const getDealBySubmission = (submission_id: string) => invoke<AcqBundle>('acq-deal-get', { submission_id });
export const getDealById = (deal_id: string) => invoke<AcqBundle>('acq-deal-get', { deal_id });
export const getVerdicts = () => invoke<{ ok: boolean; verdicts: { submission_id: string; verdict?: string; score?: number }[] }>('acq-verdicts', {});
export const runAnalyze = (deal_id: string) => invoke('acq-analyze', { deal_id });
export const runCommittee = (deal_id: string) => invoke('acq-committee', { deal_id });
export const runMemo = (deal_id: string) => invoke('acq-memo', { deal_id });
export const draftAction = (deal_id: string, action_key: string) => invoke<{ ok: boolean; draft: any; recipient_email: string | null }>('acq-draft', { deal_id, action_key });
export const createDeal = (payload: Record<string, unknown>) => invoke<{ ok: boolean; submission_id: string; reference: string }>('acq-create-deal', payload);
export const addDealContact = (deal_id: string, c: Record<string, unknown>) => invoke('acq-crm', { action: 'add_deal_contact', deal_id, ...c });
export const commsList = (deal_id: string) => invoke<{ ok: boolean; communications: any[] }>('acq-comms', { action: 'list', deal_id });
export const commsAdd = (deal_id: string, c: Record<string, unknown>) => invoke<{ ok: boolean; communication: any }>('acq-comms', { action: 'add', deal_id, ...c });
export const commsClearDocInputs = (document_id: string) => invoke<{ ok: boolean }>('acq-comms', { action: 'clear_doc_inputs', document_id });
export const docUrl = (document_id: string) => invoke<{ ok: boolean; url: string; file_name: string }>('acq-doc', { document_id });
export const completeDoc = (document_id: string, answers: string) => invoke<{ ok: boolean; draft: any; docx_base64: string }>('acq-complete-doc', { document_id, answers });
export const legalGetProfile = () => invoke<{ ok: boolean; profile: any }>('acq-legal', { action: 'get_profile' });
export const legalSetProfile = (profile: Record<string, unknown>) => invoke<{ ok: boolean; profile: any }>('acq-legal', { action: 'set_profile', profile });
export const legalList = (deal_id?: string) => invoke<{ ok: boolean; documents: any[] }>('acq-legal', { action: 'list', ...(deal_id ? { deal_id } : {}) });
export const legalGenerate = (deal_id: string, type: string, counterparty?: string) => invoke<{ ok: boolean; document: any; pdf_base64: string; signed: boolean }>('acq-legal', { action: 'generate', deal_id, type, ...(counterparty ? { counterparty } : {}) });
export const legalRenderDoc = (title: string, body: string) => invoke<{ ok: boolean; pdf_base64: string; title: string }>('acq-legal', { action: 'render_doc', title, body });
export const legalSetBrand = (brand: Record<string, unknown>) => invoke<{ ok: boolean; brand: any }>('acq-legal', { action: 'set_brand', brand });
export const brandExtract = (url: string) => invoke<{ ok: boolean; brand: any; source: string }>('acq-brand-extract', { url });
export const gmailStatus = () => invoke<{ ok: boolean; configured: boolean; accounts: any[] }>('acq-gmail-auth', { action: 'status' });
export const gmailStart = () => invoke<{ ok: boolean; configured: boolean; url?: string; error?: string }>('acq-gmail-auth', { action: 'start' });
export const gmailDisconnect = (email?: string) => invoke('acq-gmail-auth', { action: 'disconnect', ...(email ? { email } : {}) });
export const gmailSync = () => invoke<{ ok: boolean; accounts: number; results: any[] }>('acq-gmail-sync', {});
export const driveStatus = () => invoke<{ ok: boolean; configured: boolean; account: any }>('acq-drive-auth', { action: 'status' });
export const driveStart = () => invoke<{ ok: boolean; configured: boolean; url?: string; error?: string }>('acq-drive-auth', { action: 'start' });
export const driveDisconnect = () => invoke('acq-drive-auth', { action: 'disconnect' });
export const driveSetRoot = (root_folder_id: string, root_folder_name?: string) => invoke('acq-drive-auth', { action: 'set_root', root_folder_id, ...(root_folder_name ? { root_folder_name } : {}) });
export const driveSync = () => invoke<{ ok: boolean; created_folders: number; ingested_docs: number; new_deals: number; kb_ingested?: number; results?: any[] }>('acq-drive-sync', {});
export const driveSetKb = (kb_folder_id: string, kb_folder_name?: string) => invoke('acq-drive-auth', { action: 'set_kb', kb_folder_id, ...(kb_folder_name ? { kb_folder_name } : {}) });
export const kbSearch = (q: string) => invoke<{ ok: boolean; matches: any[] }>('acq-kb-search', { q });
export async function legalFillBroker(deal_id: string, file: File, counterparty?: string) {
  const base64 = await fileToBase64(file);
  return invoke<{ ok: boolean; document: any; pdf_base64: string; signed: boolean }>('acq-legal', { action: 'fill_broker', deal_id, counterparty, title: file.name.replace(/\.[^.]+$/, ''), inline: { base64, media_type: file.type || 'application/pdf', file_name: file.name } });
}
export const crmList = () => invoke<{ ok: boolean; contacts: any[]; tasks: any[] }>('acq-crm', { action: 'list' });
export const crmAddContact = (c: Record<string, unknown>) => invoke('acq-crm', { action: 'add_contact', ...c });
export const crmAddTask = (t: Record<string, unknown>) => invoke('acq-crm', { action: 'add_task', ...t });
export const crmCompleteTask = (task_id: string) => invoke('acq-crm', { action: 'complete_task', task_id });
export const crmSuggest = (deal_id: string, roles?: string[]) => invoke<{ ok: boolean; suggestions: any[] }>('acq-crm', { action: 'suggest', deal_id, ...(roles ? { roles } : {}) });
export const monitorList = () => invoke<{ ok: boolean; alerts: any[] }>('acq-monitor', { action: 'list' });
export const monitorRun = () => invoke<{ ok: boolean; deals: number; checked: number; alerts_created: number }>('acq-monitor', { action: 'run' });
export const monitorDismiss = (alert_id: string) => invoke('acq-monitor', { action: 'dismiss', alert_id });
export const getOrgSettings = () => invoke<{ ok: boolean; org_name: string; role: string; settings: any }>('acq-org-settings', { action: 'get' });
export const setOrgSettings = (settings: Record<string, unknown>) => invoke<{ ok: boolean; settings: any }>('acq-org-settings', { action: 'set', settings });

export async function extractFile(deal_id: string, file: File) {
  const base64 = await fileToBase64(file);
  return invoke('acq-extract', { deal_id, inline: { base64, media_type: file.type || 'application/pdf', file_name: file.name } });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll the bundle until `predicate` is satisfied (for the non-blocking LLM functions). */
export async function pollBundle(deal_id: string, predicate: (b: AcqBundle) => boolean, tries = 24, gapMs = 4000): Promise<AcqBundle> {
  let last = await getDealById(deal_id);
  for (let i = 0; i < tries; i++) {
    if (predicate(last)) return last;
    await sleep(gapMs);
    last = await getDealById(deal_id);
  }
  return last;
}

// ---------------- Origination / CRM (prospects, sourcing, ingest, outreach, funnel) ----------------
export const prospectsList = (f: Record<string, unknown> = {}) => invoke<{ ok: boolean; prospects: any[]; total: number; page: number; per: number; stage_counts: Record<string, number> }>('acq-prospects', { action: 'list', ...f });
export const prospectGet = (prospect_id: string) => invoke<{ ok: boolean; prospect: any; touches: any[]; memberships: any[] }>('acq-prospects', { action: 'get', prospect_id });
export const prospectUpdate = (prospect_id: string, patch: Record<string, unknown>) => invoke('acq-prospects', { action: 'update', prospect_id, ...patch });
export const prospectSuppress = (prospect_id: string, reason?: string) => invoke('acq-prospects', { action: 'suppress', prospect_id, ...(reason ? { reason } : {}) });
export const prospectPromote = (prospect_id: string, notes?: string) => invoke<{ ok: boolean; submission_id: string; reference: string; deal_id: string | null }>('acq-prospects', { action: 'promote', prospect_id, ...(notes ? { notes } : {}) });
export const sourceTaxonomy = () => invoke<{ ok: boolean; taxonomy: { key: string; label: string; sic: string[] }[] }>('acq-source', { action: 'taxonomy' });
export const sourceSearch = (p: Record<string, unknown>) => invoke<{ ok: boolean; total_hits: number; created: number; updated: number; prospects: any[] }>('acq-source', { action: 'search', ...p });
export const ingestPropose = (csv: string, file_name: string) => invoke<{ ok: boolean; job_id: string; mapping: Record<string, string | null>; headers: string[]; rows_total: number; preview: string[][] }>('acq-ingest', { action: 'propose', csv, file_name });
export const ingestCommit = (csv: string, mapping: Record<string, string | null>, job_id: string | null, file_name: string) => invoke<{ ok: boolean; created: number; merged: number; skipped: number; errors: string[] }>('acq-ingest', { action: 'commit', csv, mapping, job_id, file_name });
export const outreachList = () => invoke<{ ok: boolean; campaigns: any[]; steps: any[] }>('acq-outreach', { action: 'list' });
export const outreachCreate = (payload: Record<string, unknown>) => invoke<{ ok: boolean; campaign: any; steps: any[] }>('acq-outreach', { action: 'create', ...payload });
export const outreachUpdate = (campaign_id: string, patch: Record<string, unknown>) => invoke('acq-outreach', { action: 'update', campaign_id, ...patch });
export const outreachDraftTemplates = (profile?: Record<string, unknown>) => invoke<{ ok: boolean; steps: { channel: string; wait_days: number; subject: string | null; body: string }[] }>('acq-outreach', { action: 'draft_templates', ...(profile ? { profile } : {}) });
export const outreachEnrol = (campaign_id: string, filter: Record<string, unknown>) => invoke<{ ok: boolean; enrolled: number; suppressed: number; candidates: number }>('acq-outreach', { action: 'enrol', campaign_id, filter });
export const outreachQueue = (status?: string) => invoke<{ ok: boolean; touches: any[] }>('acq-outreach', { action: 'queue', ...(status ? { status } : {}) });
export const outreachApprove = (touch_ids: string[]) => invoke('acq-outreach', { action: 'approve', touch_ids });
export const outreachCancel = (touch_ids: string[]) => invoke('acq-outreach', { action: 'cancel', touch_ids });
export const outreachApproveAll = (campaign_id?: string) => invoke<{ ok: boolean; approved: number }>('acq-outreach', { action: 'approve_all', ...(campaign_id ? { campaign_id } : {}) });
export const outreachRun = () => invoke<{ ok: boolean; orgs: any[] }>('acq-outreach', { action: 'run' });
export const outreachMarkReplied = (prospect_id: string) => invoke('acq-outreach', { action: 'mark_replied', prospect_id });
