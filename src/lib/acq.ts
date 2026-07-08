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
  if (error) {
    // supabase-js hides the response body behind error.context; surface the
    // real server message (insufficient_credits, needs_upgrade, ...) so the
    // UI can react properly instead of showing a generic non-2xx line.
    try {
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) { const err: any = new Error(j.error); err.needs_upgrade = !!j.needs_upgrade; err.needs_topup = !!j.needs_topup; throw err; }
      }
    } catch (inner: any) { if (inner instanceof Error && inner.message && !/body stream|json/i.test(inner.message)) throw inner; }
    throw error;
  }
  if (data && data.error) throw new Error(data.message ?? data.error);
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
export const crmAiTasks = () => invoke<{ ok: boolean; created: number; tasks: any[] }>('acq-crm', { action: 'ai_tasks' });
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
export const sourceTaxonomy = () => invoke<{ ok: boolean; taxonomy: { key: string; label: string; group: string; sic: string[] }[] }>('acq-source', { action: 'taxonomy' });
export const sourceSearch = (p: Record<string, unknown>) => invoke<{ ok: boolean; total_hits: number; created: number; updated: number; prospects: any[] }>('acq-source', { action: 'search', ...p });
export const ingestPropose = (csv: string, file_name: string) => invoke<{ ok: boolean; job_id: string; mapping: Record<string, string | null>; headers: string[]; rows_total: number; preview: string[][] }>('acq-ingest', { action: 'propose', csv, file_name });
export const ingestCommit = (csv: string, mapping: Record<string, string | null>, job_id: string | null, file_name: string, gdpr_confirmed = false) => invoke<{ ok: boolean; created: number; merged: number; skipped: number; enriched?: number; excluded_pipeline?: number; excluded_platform?: number; errors: string[] }>('acq-ingest', { action: 'commit', csv, mapping, job_id, file_name, gdpr_confirmed });
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
export const buyboxList = () => invoke<{ ok: boolean; boxes: any[] }>('acq-buybox', { action: 'list' });
export const buyboxChat = (messages: { role: string; content: string }[]) => invoke<{ ok: boolean; message: string; complete: boolean; buy_box: any | null }>('acq-buybox', { action: 'chat', messages });
export const buyboxCreate = (criteria: Record<string, unknown>, opts: Record<string, unknown> = {}) => invoke<{ ok: boolean; box: any }>('acq-buybox', { action: 'create', criteria, ...opts });
export const buyboxActivate = (box_id: string) => invoke('acq-buybox', { action: 'activate', box_id });
export const buyboxDelete = (box_id: string) => invoke('acq-buybox', { action: 'delete', box_id });
export const sourceStartRun = (p: Record<string, unknown>) => invoke<{ ok: boolean; run: any; note: string }>('acq-source', { action: 'start_run', ...p });
export const sourceRuns = () => invoke<{ ok: boolean; runs: any[] }>('acq-source', { action: 'runs' });
export const sourceCancelRun = (run_id: string) => invoke('acq-source', { action: 'cancel_run', run_id });
export const crmContactDetail = (contact_id: string) => invoke<{ ok: boolean; contact: any; deals: any[]; communications: any[]; documents: any[]; tasks: any[] }>('acq-crm', { action: 'contact_detail', contact_id });

// ---------------- Deal flow (member deal journey: releases, NDA, data room) ----------------
export const dfListings = () => invoke<{ listings: any[]; tier: string | null }>('acq-dealflow', { action: 'listings' });
export const dfDetail = (release_id: string) => invoke<{ release: any; ndas_active: number; access: string; my: any | null; qa_published: number; tier: string | null }>('acq-dealflow', { action: 'detail', release_id });
export const dfMe = () => invoke<{ member: any | null; deals?: any[]; slots_used?: number; slots_cap?: number | null; is_admin?: boolean }>('acq-dealflow', { action: 'me' });
export const dfApply = (release_id: string, application: Record<string, unknown>, ack: boolean) => invoke<{ ok: boolean; member_deal: any; next: string }>('acq-dealflow', { action: 'apply', release_id, application, ack });
export const dfSignNda = (release_id: string, typed_name: string, agree: boolean) => invoke<{ ok: boolean; state: string }>('acq-dealflow', { action: 'sign_nda', release_id, typed_name, agree });
export const dfDataRoom = (release_id: string) => invoke<any>('acq-dealflow', { action: 'data_room', release_id });
export const dfLogOpen = (release_id: string, document_id?: string, name?: string) => invoke('acq-dealflow', { action: 'log_open', release_id, document_id, name });
export const dfAsk = (release_id: string, question: string) => invoke('acq-dealflow', { action: 'ask', release_id, question });
export const dfInterest = (release_id: string) => invoke<{ ok: boolean; calendly: string | null }>('acq-dealflow', { action: 'express_interest', release_id });
export const dfBookConfirm = (release_id: string) => invoke('acq-dealflow', { action: 'book_confirm', release_id });
export const dfPass = (release_id: string, reason: string, feedback?: string) => invoke('acq-dealflow', { action: 'pass', release_id, reason, feedback });
// admin
export const dfAdminReleases = () => invoke<{ ok: boolean; releases: any[] }>('acq-dealflow', { action: 'admin_releases' });
export const dfAdminReleaseUpsert = (release: Record<string, unknown>, score_inputs?: Record<string, unknown>) => invoke<{ ok: boolean; release: any }>('acq-dealflow', { action: 'admin_release_upsert', release, ...(score_inputs ? { score_inputs } : {}) });
export const dfAdminPublish = (release_id: string) => invoke<{ ok: boolean; release: any; notified: number }>('acq-dealflow', { action: 'admin_release_publish', release_id });
export const dfAdminBoard = (release_id: string, member_deal_id?: string) => invoke<{ ok: boolean; opportunities: any[]; events: any[]; qa: any[] }>('acq-dealflow', { action: 'admin_board', release_id, ...(member_deal_id ? { member_deal_id } : {}) });
export const dfAdminDecide = (member_deal_id: string, decision: 'approve' | 'decline', reason?: string) => invoke('acq-dealflow', { action: 'admin_decide', member_deal_id, decision, ...(reason ? { reason } : {}) });
export const dfAdminAdvance = (member_deal_id: string, state: string, reason?: string) => invoke('acq-dealflow', { action: 'admin_advance', member_deal_id, state, ...(reason ? { reason } : {}) });
export const dfAdminExclusivity = (member_deal_id: string) => invoke<{ ok: boolean; waitlisted: number }>('acq-dealflow', { action: 'admin_exclusivity', member_deal_id });
export const dfAdminAnswer = (qa_id: string, answer: string, published: boolean) => invoke('acq-dealflow', { action: 'admin_answer', qa_id, answer, published });
export const dfAdminCountersign = (member_deal_id: string) => invoke('acq-dealflow', { action: 'admin_countersign', member_deal_id });
export const dfAdminMembers = () => invoke<{ ok: boolean; members: any[] }>('acq-dealflow', { action: 'admin_members' });
export const dfAdminMemberUpsert = (member: Record<string, unknown>) => invoke<{ ok: boolean; member: any }>('acq-dealflow', { action: 'admin_member_upsert', member });

// ---------------- Self-serve onboarding + billing ----------------
export const onboardStatus = () => invoke<{ ok: boolean; has_org: boolean; org_id?: string; org_name?: string; role?: string; plan?: string; is_host_org?: boolean; profile?: any; tour_done?: boolean; buyboxes?: number; prospects?: number; deals?: number; email?: string }>('acq-onboard', { action: 'status' });
export const onboardProvision = (p: { org_name?: string; full_name?: string; website?: string; bio?: string }) => invoke<{ ok: boolean; org_id: string; existing: boolean }>('acq-onboard', { action: 'provision', ...p });
export const onboardScore = (inputs: Record<string, unknown>, deal_id?: string) => invoke<{ ok: boolean; score: number; band: string; breakdown: { part: string; pts: number; max: number }[] }>('acq-onboard', { action: 'score', inputs, ...(deal_id ? { deal_id } : {}) });
export const onboardCompleteTour = () => invoke('acq-onboard', { action: 'complete_tour' });
export const billingCheckout = (plan: 'analyst' | 'originator' | 'team', interval: 'monthly' | 'annual' = 'monthly') => invoke<{ ok?: boolean; url?: string; error?: string; message?: string }>('acq-billing', { action: 'checkout', plan, interval });
export const billingPortal = () => invoke<{ ok?: boolean; url?: string; error?: string }>('acq-billing', { action: 'portal' });
export const liteDeals = () => invoke<{ ok: boolean; deals: any[]; stages: string[] }>('acq-onboard', { action: 'deals_list' });
export const liteDealCreate = (deal: Record<string, unknown>) => invoke<{ ok: boolean; deal: any }>('acq-onboard', { action: 'deal_create', deal });
export const liteDealUpdate = (deal_id: string, patch: Record<string, unknown>) => invoke<{ ok: boolean; deal: any }>('acq-onboard', { action: 'deal_update', deal_id, ...patch });
// ---------------- Metered credits ----------------
export const creditsBalance = () => invoke<{ ok: boolean; ai: number; letter: number; detail: any; packs: Record<string, { kind: string; qty: number; amount: number; label: string }>; events: any[] }>('acq-credits', { action: 'balance' });
export const creditsConsume = (kind: 'ai' | 'letter', amount = 1, reason?: string) => invoke<{ ok: boolean; balance?: { ai: number; letter: number }; needs_topup?: boolean; ai?: number; letter?: number }>('acq-credits', { action: 'consume', kind, amount, ...(reason ? { reason } : {}) });
export const creditsTopup = (packs: string | string[]) => invoke<{ ok?: boolean; url?: string; error?: string; message?: string }>('acq-credits', { action: 'topup_checkout', packs: Array.isArray(packs) ? packs : [packs] });
