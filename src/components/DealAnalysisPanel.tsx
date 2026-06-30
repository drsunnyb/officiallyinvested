import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, AlertTriangle, Gavel, FileText, RefreshCw, ChevronDown, ChevronRight, Sparkles, Mail, TrendingUp, Copy, Check, Video, Inbox, Send, StickyNote, Phone, Folder, FileSignature, Download } from 'lucide-react';
import ScheduleCallModal from './ScheduleCallModal';
import { supabase } from '../lib/supabase';
import { getDealBySubmission, getDealById, runAnalyze, runCommittee, runMemo, extractFile, draftAction, addDealContact, commsAdd, legalList, legalGenerate, legalFillBroker, legalRenderDoc, pollBundle, type AcqBundle } from '../lib/acq';
import { STAGES } from '../lib/stages';

function gbp(v: unknown): string {
  const n = Number(v);
  if (!isFinite(n) || v == null || v === '') return '—';
  if (Math.abs(n) >= 1e6) return '£' + (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2) + 'M';
  if (Math.abs(n) >= 1e3) return '£' + Math.round(n / 1e3) + 'k';
  return '£' + n.toLocaleString('en-GB');
}

// strip em/en dashes so nothing the agent wrote reads as AI
const human = (t: string) => (t || '').replace(/\s*[—–]\s*/g, ', ');
// also strip markdown remnants so drafts read clean (no **, ##, * bullets, backticks)
const clean = (t: string) => human(t)
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
  .replace(/(^|[^*])\*(?!\*)([^*\n]+?)\*(?!\*)/g, '$1$2')
  .replace(/`+/g, '').replace(/^\s*[-*]\s+/gm, '• ');
const since = (ts: string) => { const s = (Date.now() - new Date(ts).getTime()) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; };
const tierCls = (t: string) => t === 'A' ? 'bg-emerald-600 text-white' : t === 'B' ? 'bg-[#FFD700] text-[#0A2540]' : t === 'C' ? 'bg-amber-500 text-amber-950' : 'bg-white/20 text-white';

const VERDICT_STYLE: Record<string, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
  WATCH: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
  PASS: 'bg-white/15 text-white/70 border-white/30',
};
const CHIP: Record<string, string> = { pass: 'bg-emerald-500/15 text-emerald-300', monitor: 'bg-amber-500/15 text-amber-200', fail: 'bg-red-500/20 text-red-300' };

// stage (submission status) -> the agent's suggested action keys
const STAGE_ACTIONS: Record<string, string[]> = {
  new: ['request_docs', 'comparables'],
  reviewing: ['request_docs', 'comparables'],
  shortlisted: ['approach_vendor', 'discovery_pack', 'comparables'],
  discovery_call: ['discovery_pack', 'request_docs'],
  structuring: ['structure_proposal', 'offer_letter', 'comparables'],
  hots: ['hots_draft', 'email_solicitor'],
  dd_financial: ['email_accountant', 'chase_vendor'],
  dd_commercial: ['commercial_dd_plan', 'comparables'],
  dd_legal: ['email_solicitor'],
  funding: ['lender_pack', 'email_broker', 'structure_proposal'],
  pre_completion: ['completion_checklist', 'email_solicitor'],
  takeover: ['takeover_plan'],
  completed: ['hundred_day_plan'],
};
const ACTION_META: Record<string, { label: string; sub: string; icon: any }> = {
  request_docs: { label: 'Request documents', sub: 'Email the vendor', icon: Mail },
  approach_vendor: { label: 'Approach the owner', sub: 'Email the vendor', icon: Mail },
  chase_vendor: { label: 'Chase the vendor', sub: 'Outstanding docs', icon: Mail },
  email_accountant: { label: 'Brief the accountant', sub: 'Financial DD', icon: Mail },
  email_solicitor: { label: 'Brief the solicitor', sub: 'Legal DD', icon: Gavel },
  email_broker: { label: 'Approach a funder', sub: 'Lender / broker', icon: Mail },
  offer_letter: { label: 'Draft offer', sub: 'Indicative terms', icon: FileText },
  discovery_pack: { label: 'Discovery-call pack', sub: 'Agenda + questions', icon: FileText },
  structure_proposal: { label: 'Deal structure', sub: 'Funding + offer', icon: FileText },
  hots_draft: { label: 'Heads of Terms', sub: 'Draft + cover', icon: FileText },
  commercial_dd_plan: { label: 'Commercial DD plan', sub: 'Risks + upside', icon: FileText },
  lender_pack: { label: 'Lender pack', sub: 'Funding summary', icon: FileText },
  completion_checklist: { label: 'Completion checklist', sub: 'Pre-completion', icon: FileText },
  takeover_plan: { label: 'Takeover plan', sub: 'Week one', icon: FileText },
  hundred_day_plan: { label: '100-day plan', sub: 'Value creation', icon: FileText },
  comparables: { label: 'Find comparables', sub: 'Indicative market', icon: TrendingUp },
};

export default function DealAnalysisPanel({ submissionId, status, score, scoresCount, onRescore }: { submissionId: string; status?: string; score?: any; scoresCount?: number; onRescore?: () => void }) {
  const [b, setB] = useState<AcqBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [showFull, setShowFull] = useState(false);
  const [openDraft, setOpenDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [editBody, setEditBody] = useState<Record<string, string>>({});
  const [docBusy, setDocBusy] = useState('');
  const [pf, setPf] = useState<Record<string, string>>({});
  const [pBusy, setPBusy] = useState(false);
  const [showCall, setShowCall] = useState(false);
  const [cf, setCf] = useState<Record<string, string>>({});
  const [cBusy, setCBusy] = useState(false);
  const [copiedAlias, setCopiedAlias] = useState(false);
  const [legalDocs, setLegalDocs] = useState<any[]>([]);
  const [legalBusy, setLegalBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const ndaRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setB(await getDealBySubmission(submissionId)); }
    catch (e: any) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  }, [submissionId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = b?.deal?.id; if (id) legalList(id).then((r) => setLegalDocs(r.documents || [])).catch(() => {}); }, [b?.deal?.id]);

  const dealId = b?.deal?.id as string | undefined;
  const stageLabel = STAGES.find((s) => s.key === status)?.label ?? 'this stage';
  const actionKeys = (status && STAGE_ACTIONS[status]) || ['request_docs', 'comparables'];

  const onUpload = async (files: FileList | null) => {
    if (!files?.length || !dealId) return;
    setBusy('extract'); setErr('');
    try { for (const f of Array.from(files)) await extractFile(dealId, f); setB(await getDealById(dealId)); onRescore?.(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const runStep = async (step: 'analyze' | 'committee' | 'memo') => {
    if (!dealId) return;
    setBusy(step); setErr('');
    const prev = step === 'analyze' ? b?.analysis?.id : step === 'committee' ? b?.verdict?.id : b?.memo?.id;
    try {
      if (step === 'analyze') await runAnalyze(dealId); if (step === 'committee') await runCommittee(dealId); if (step === 'memo') await runMemo(dealId);
      setB(await pollBundle(dealId, (x) => step === 'analyze' ? !!x.analysis && x.analysis.id !== prev : step === 'committee' ? !!x.verdict && x.verdict.id !== prev : !!x.memo && x.memo.id !== prev));
    } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const onAction = async (key: string) => {
    if (!dealId) return;
    setBusy(key); setErr('');
    try { const r = await draftAction(dealId, key); await load(); if (r?.draft?.id) setOpenDraft(r.draft.id); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const copy = async (id: string, text: string) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(null), 1500); } catch { /**/ } };
  const addPerson = async () => {
    if (!pf.name?.trim() || !dealId) return;
    setPBusy(true); setErr('');
    try { await addDealContact(dealId, { name: pf.name, role: pf.role || 'vendor', email: pf.email }); setPf({}); await load(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setPBusy(false); }
  };
  const addComm = async () => {
    if (!cf.body?.trim() || !dealId) return;
    setCBusy(true); setErr('');
    try {
      await commsAdd(dealId, { kind: cf.kind || 'note', subject: cf.subject || null, body: cf.body, direction: cf.kind === 'email' ? 'out' : 'internal' });
      // a note or update feeds the Officially Invested assessment and re-runs the score
      if ((cf.kind || 'note') === 'note' && submissionId && supabase) {
        try { await supabase.from('deal_items').insert({ submission_id: submissionId, kind: 'note', content: cf.body.trim() }); } catch { /**/ }
        onRescore?.();
      }
      setCf({}); await load();
    } catch (e: any) { setErr(e.message || String(e)); } finally { setCBusy(false); }
  };
  const loadLegal = async (id: string) => { try { const r = await legalList(id); setLegalDocs(r.documents || []); } catch { /**/ } };
  const downloadPdf = (b64: string, name: string) => { const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); const url = URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url); };
  const genLegal = async (type: string) => { if (!dealId) return; setLegalBusy(type); setErr(''); try { const r = await legalGenerate(dealId, type, b?.deal?.name); downloadPdf(r.pdf_base64, (r.document?.title || 'document') + '.pdf'); await loadLegal(dealId); } catch (e: any) { setErr(e.message || String(e)); } finally { setLegalBusy(''); } };
  const fillBroker = async (file: File | null) => { if (!file || !dealId) return; setLegalBusy('broker'); setErr(''); try { const r = await legalFillBroker(dealId, file, b?.deal?.name); downloadPdf(r.pdf_base64, (r.document?.title || 'signed-nda') + '.pdf'); await loadLegal(dealId); } catch (e: any) { setErr(e.message || String(e)); } finally { setLegalBusy(''); } };
  const draftText = (d: any) => editBody[d.id] ?? clean(d.body);
  const emailDraft = (d: any) => {
    const dc = (b?.deal_contacts ?? []);
    const c = dc.find((x: any) => x.role === d.recipient_role && x.email) || dc.find((x: any) => x.email);
    const url = `mailto:${encodeURIComponent(c?.email || '')}?subject=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(draftText(d))}`;
    window.location.href = url;
  };
  const createDoc = async (d: any) => {
    setDocBusy(d.id); setErr('');
    try { const r = await legalRenderDoc(d.subject || ACTION_META[d.action_key]?.label || 'Document', draftText(d)); downloadPdf(r.pdf_base64, (d.subject || 'document').replace(/[^\w.-]+/g, '-') + '.pdf'); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setDocBusy(''); }
  };

  if (loading) return <Wrap><div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading the agent…</div></Wrap>;

  const res = b?.valuation?.result;
  const rep = b?.analysis?.report;
  const det = b?.verdict?.detail;
  const verdict = b?.verdict?.verdict as string | undefined;
  const seven = res?.sevenNumber;
  const verified = (b?.facts ?? []).filter((f) => !f.is_self_reported);
  const contradiction = verified.find((f) => f.contradicts_self_reported);
  const headline = det?.headline || b?.analysis?.summary || '';
  const risks: string[] = Array.from(new Set([...(det?.key_risks ?? []), ...(rep?.key_risks ?? [])])).slice(0, 4) as string[];

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[#FFD700] font-serif text-lg font-bold"><Sparkles className="h-4 w-4" /> Deal Agent</div>
        <button onClick={load} className="text-white/50 hover:text-white" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>
      {err && <p className="text-red-300 text-xs mb-2">{err}</p>}

      {/* the single Officially Invested framework assessment */}
      {score && (
        <div className="mb-4 bg-white/5 border border-white/10 rounded-xl p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[#FFD700] text-[11px] uppercase tracking-wide font-semibold">Officially Invested assessment</span>
            {onRescore && <button onClick={onRescore} className="text-[10px] text-[#FFD700] inline-flex items-center gap-1"><RefreshCw className="h-3 w-3" /> Re-run</button>}
          </div>
          {score.tier && <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + tierCls(score.tier)}>{score.tier} · {score.fit_score}</span>}
          {score.summary && <p className="text-white/85 text-[13px] mt-1.5">{human(score.summary)}</p>}
          {score.rationale && <p className="text-white/65 text-[12px] leading-relaxed whitespace-pre-wrap mt-1.5">{human(score.rationale)}</p>}
          {score.suggested_action && <p className="text-[#FFD700] text-[12px] mt-2"><b>Suggested action:</b> {human(score.suggested_action)}</p>}
          {scoresCount && scoresCount > 1 ? <p className="text-white/40 text-[10px] mt-2">{scoresCount} assessments on record.</p> : null}
        </div>
      )}

      {/* one decision, no duplication */}
      {b?.valuation ? (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className={'text-sm font-semibold px-3 py-1 rounded-full border ' + (verdict ? (VERDICT_STYLE[verdict] ?? VERDICT_STYLE.PASS) : 'bg-white/10 text-white/70 border-white/25')}>{verdict ?? 'Analysed'}</span>
            {b?.analysis?.score != null && <span className="text-white/55 text-xs">score {b.analysis.score}</span>}
            {res?.red?.overall && <span className="text-white/45 text-xs">· RED {res.red.overall}</span>}
          </div>
          {headline && <p className="text-white/80 text-[13px] leading-relaxed mb-2">{human(headline)}</p>}
          {contradiction && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-400/40 rounded-lg p-2.5 mb-3 text-xs text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>Seller figure contradicted by documents — {contradiction.metric.replace(/_/g, ' ')} {gbp(contradiction.value)} filed. Run the bank-statement test.</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Kpi label="Adj EBITDA" value={gbp(b.valuation.adjusted_ebitda)} gold />
            <Kpi label="Opening offer" value={gbp(res?.valuation?.openingOffer)} />
            <Kpi label="DSCR" value={seven?.results?.[0]?.value != null ? seven.results[0].value + '×' : '—'} good />
            <Kpi label="7-Number" value={seven ? `${seven.passes}/7` : '—'} good />
          </div>
        </>
      ) : (
        <p className="text-white/60 text-sm mb-3">Not analysed yet. Upload the accounts for verified figures, or run analysis on the submitted numbers.</p>
      )}

      {/* analysis controls */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Btn onClick={() => fileRef.current?.click()} busy={busy === 'extract'} icon={Upload} label="Upload accounts" />
        <input ref={fileRef} type="file" accept="application/pdf,text/csv,text/plain" multiple className="hidden" onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }} />
        <Btn onClick={() => runStep('analyze')} busy={busy === 'analyze'} icon={Sparkles} label={b?.analysis ? 'Re-run analysis' : 'Run analysis'} primary />
        <Btn onClick={() => runStep('committee')} busy={busy === 'committee'} icon={Gavel} label="Committee" disabled={!b?.analysis} />
        <Btn onClick={() => runStep('memo')} busy={busy === 'memo'} icon={FileText} label="Memo" disabled={!b?.analysis} />
        <Btn onClick={() => setShowCall(true)} icon={Video} label="Schedule call" />
      </div>
      {busy === 'analyze' && <p className="text-white/45 text-xs mb-3">Running the engine and analyst… about a minute.</p>}

      {/* stage-aware agent actions */}
      <div className="text-white/50 text-[11px] uppercase tracking-wide mb-2">Suggested next steps · {stageLabel}</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {actionKeys.map((k) => {
          const m = ACTION_META[k]; if (!m) return null; const Icon = m.icon;
          return (
            <button key={k} onClick={() => onAction(k)} disabled={!!busy} className="text-left bg-[#0E2A47] border border-white/10 hover:border-[#FFD700]/40 rounded-xl p-2.5 flex gap-2.5 disabled:opacity-50">
              {busy === k ? <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-[#FFD700]" /> : <Icon className="h-4 w-4 mt-0.5 text-[#FFD700]" />}
              <span><span className="block text-[12px] font-semibold text-white">{m.label}</span><span className="block text-[11px] text-white/50">{m.sub}</span></span>
            </button>
          );
        })}
      </div>

      {/* drafts the agent has produced (draft-only) */}
      {(b?.drafts ?? []).length > 0 && (
        <Block title={`Drafts (${b!.drafts.length})`}>
          <div className="flex flex-col gap-2">
            {b!.drafts.map((d: any) => (
              <div key={d.id} className="bg-white/5 rounded-lg p-2.5">
                <button onClick={() => setOpenDraft(openDraft === d.id ? null : d.id)} className="w-full flex items-center gap-2 text-left">
                  {openDraft === d.id ? <ChevronDown className="h-3.5 w-3.5 text-white/50" /> : <ChevronRight className="h-3.5 w-3.5 text-white/50" />}
                  <span className="flex-1 text-[12px] text-white">{d.subject || ACTION_META[d.action_key]?.label || d.action_key}</span>
                  {d.recipient_role && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#FFD700]/15 text-[#FFD700]">{d.recipient_role}</span>}
                  <span className="text-[9px] text-white/40">{d.kind}</span>
                </button>
                {openDraft === d.id && (
                  <div className="mt-2">
                    <textarea value={draftText(d)} onChange={(e) => setEditBody((p) => ({ ...p, [d.id]: e.target.value }))} className="w-full h-56 bg-black/20 rounded-lg p-3 text-white/85 text-[12px] leading-relaxed font-sans outline-none focus:ring-1 focus:ring-[#FFD700]/50 resize-y" />
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <button onClick={() => copy(d.id, (d.subject ? d.subject + '\n\n' : '') + draftText(d))} className="inline-flex items-center gap-1 text-[11px] bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-lg">{copied === d.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied === d.id ? 'Copied' : 'Copy'}</button>
                      {d.kind === 'email' && <button onClick={() => emailDraft(d)} className="inline-flex items-center gap-1 text-[11px] bg-[#FFD700] text-[#0A2540] font-semibold px-2.5 py-1.5 rounded-lg"><Mail className="h-3.5 w-3.5" /> Email</button>}
                      <button onClick={() => createDoc(d)} disabled={docBusy === d.id} className="inline-flex items-center gap-1 text-[11px] bg-white/10 hover:bg-white/20 text-white px-2.5 py-1.5 rounded-lg disabled:opacity-50">{docBusy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Create document</button>
                      <span className="text-[10px] text-white/35">Edit above, then send or download. Branded from Settings.</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* people on this deal */}
      <Block title="People on this deal">
        {(b?.deal_contacts ?? []).length > 0 ? (
          <div className="flex flex-col gap-1.5 mb-2">
            {b!.deal_contacts.map((p: any) => (
              <div key={p.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                <span className="text-[12px] text-white flex-1 truncate">{p.name}{p.company ? ' · ' + p.company : ''}</span>
                {p.role && <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#FFD700]/15 text-[#FFD700]">{p.role}</span>}
                {p.email && <span className="text-[10px] text-white/45 truncate max-w-[38%]">{p.email}</span>}
              </div>
            ))}
          </div>
        ) : <p className="text-white/40 text-[12px] mb-2">No people yet — add the vendor, agent, accountant or solicitor so the agent emails the right person.</p>}
        <div className="flex gap-1.5">
          <input value={pf.name ?? ''} onChange={(e) => setPf((p) => ({ ...p, name: e.target.value }))} placeholder="Name" className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60" />
          <select value={pf.role ?? 'vendor'} onChange={(e) => setPf((p) => ({ ...p, role: e.target.value }))} className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            {['vendor', 'agent', 'accountant', 'solicitor', 'lender', 'investor', 'other'].map((r) => <option key={r} value={r} className="bg-[#0E3257]">{r}</option>)}
          </select>
          <input value={pf.email ?? ''} onChange={(e) => setPf((p) => ({ ...p, email: e.target.value }))} placeholder="Email" className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60" />
          <button onClick={addPerson} disabled={pBusy} className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/20 disabled:opacity-50">{pBusy ? '…' : 'Add'}</button>
        </div>
      </Block>

      {/* broker onboarding & NDA — generated, filled and e-signed for you */}
      <Block title="Broker onboarding & NDA">
        <p className="text-white/45 text-[12px] mb-2">Brokers gate the data room behind an NDA and a buyer background. The agent fills and signs these for you from your <a href="/admin/settings" className="text-[#FFD700]">Settings</a> profile.</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <LegalBtn onClick={() => genLegal('nda_mutual')} busy={legalBusy === 'nda_mutual'} label="Mutual NDA" sub="Both parties" />
          <LegalBtn onClick={() => genLegal('nda_oneway')} busy={legalBusy === 'nda_oneway'} label="One-way NDA" sub="You as recipient" />
          <LegalBtn onClick={() => genLegal('buyer_background')} busy={legalBusy === 'buyer_background'} label="Buyer background" sub="Intro one-pager" />
          <LegalBtn onClick={() => genLegal('proof_of_funds')} busy={legalBusy === 'proof_of_funds'} label="Proof of funds" sub="Funding statement" />
        </div>
        <button onClick={() => ndaRef.current?.click()} disabled={!!legalBusy} className="w-full text-left bg-[#0E2A47] border border-dashed border-white/20 hover:border-[#FFD700]/40 rounded-xl p-2.5 flex gap-2.5 items-center disabled:opacity-50 mb-2">
          {legalBusy === 'broker' ? <Loader2 className="h-4 w-4 animate-spin text-[#FFD700]" /> : <Upload className="h-4 w-4 text-[#FFD700]" />}
          <span><span className="block text-[12px] font-semibold text-white">Upload the broker's NDA to fill &amp; sign</span><span className="block text-[11px] text-white/50">PDF, completed and executed for you</span></span>
        </button>
        <input ref={ndaRef} type="file" accept="application/pdf" className="hidden" onChange={(e) => { fillBroker(e.target.files?.[0] ?? null); e.target.value = ''; }} />
        {legalDocs.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {legalDocs.map((d: any) => (
              <div key={d.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2">
                <FileSignature className="h-3.5 w-3.5 text-[#FFD700] shrink-0" />
                <span className="flex-1 truncate text-[12px] text-white">{d.title}</span>
                <span className={'text-[9px] px-2 py-0.5 rounded-full shrink-0 ' + (d.status === 'signed' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/55')}>{d.status}</span>
                <span className="text-[9px] text-white/35 shrink-0">{since(d.created_at)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-white/40 text-[12px]">Nothing yet. Generate an NDA or upload the broker's, and it's signed with your e-signature from Settings.</p>}
        <p className="text-white/30 text-[10px] mt-2">Generated documents are standard templates, not legal advice. Review before sending.</p>
      </Block>

      {/* correspondence — every email, note and call on this deal, captured automatically */}
      <Block title={`Correspondence (${(b?.communications ?? []).length})`}>
        {b?.email_alias && (
          <div className="flex items-center gap-2 bg-[#FFD700]/8 border border-[#FFD700]/25 rounded-lg p-2 mb-2.5">
            <Inbox className="h-3.5 w-3.5 text-[#FFD700] shrink-0" />
            <span className="text-[11px] text-white/70 flex-1 truncate">BCC or forward deal emails to <span className="text-white">{b.email_alias}</span></span>
            <button onClick={() => { navigator.clipboard?.writeText(b.email_alias!); setCopiedAlias(true); setTimeout(() => setCopiedAlias(false), 1500); }} className="text-[10px] text-[#FFD700] inline-flex items-center gap-1 shrink-0">{copiedAlias ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}{copiedAlias ? 'Copied' : 'Copy'}</button>
          </div>
        )}
        <div className="flex gap-1.5 mb-2.5">
          <select value={cf.kind ?? 'note'} onChange={(e) => setCf((p) => ({ ...p, kind: e.target.value }))} className="bg-white/5 border border-white/15 rounded-lg px-2 py-1.5 text-xs text-white outline-none">
            {['note', 'email', 'call', 'meeting'].map((k) => <option key={k} value={k} className="bg-[#0E3257]">{k}</option>)}
          </select>
          <input value={cf.body ?? ''} onChange={(e) => setCf((p) => ({ ...p, body: e.target.value }))} placeholder="Add a note, call or email… (notes re-run the assessment)" className="flex-1 min-w-0 bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60" />
          <button onClick={addComm} disabled={cBusy} className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/20 disabled:opacity-50">{cBusy ? '…' : 'Log'}</button>
        </div>
        {(b?.communications ?? []).length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {b!.communications.map((cm: any) => {
              const Icon = cm.direction === 'in' ? Inbox : cm.kind === 'call' ? Phone : cm.kind === 'note' ? StickyNote : Send;
              return (
                <div key={cm.id} className="bg-white/5 rounded-lg p-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[#FFD700] shrink-0" />
                    <span className="text-[12px] text-white flex-1 truncate">{human(cm.subject || (cm.kind === 'note' ? 'Note' : cm.kind))}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white/55 shrink-0">{cm.direction === 'in' ? 'received' : cm.direction === 'out' ? 'sent' : cm.kind}</span>
                    <span className="text-[9px] text-white/35 shrink-0">{since(cm.happened_at)}</span>
                  </div>
                  {(cm.from_addr || cm.to_addr || cm.contact_name) && <div className="text-[10.5px] text-white/45 mt-0.5">{cm.from_addr ? 'from ' + cm.from_addr : cm.to_addr ? 'to ' + cm.to_addr : cm.contact_name}</div>}
                  {cm.body && <div className="text-[11.5px] text-white/70 mt-1">{human(cm.body).slice(0, 180)}{human(cm.body).length > 180 ? '…' : ''}</div>}
                </div>
              );
            })}
          </div>
        ) : <p className="text-white/40 text-[12px]">No correspondence yet. BCC or forward the deal's address above, or log a note. Emails the agent drafts are saved here automatically.</p>}
      </Block>

      {/* data room — structured by category */}
      <Block title="Data room">
        {(() => {
          const docs = b?.documents ?? [];
          const cats: [string, RegExp][] = [
            ['Accounts', /account|statutory|annual|companies house/i],
            ['Financials', /financ|management|vat|bank|p&l|\bpl\b|tax|payroll|debtor|creditor/i],
            ['Legal', /legal|contract|lease|hots|heads|title|spa|nda/i],
            ['Property', /propert|valuation|survey|rent|epc|planning/i],
          ];
          const bucket = (d: any) => { const s = `${d.doc_kind ?? ''} ${d.file_name ?? ''}`; for (const [name, re] of cats) if (re.test(s)) return name; return 'Other'; };
          const groups: Record<string, any[]> = { Accounts: [], Financials: [], Legal: [], Property: [], Other: [] };
          docs.forEach((d: any) => groups[bucket(d)].push(d));
          return (
            <div className="flex flex-col gap-2">
              {Object.entries(groups).map(([name, items]) => (
                <div key={name} className="bg-white/5 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Folder className="h-3.5 w-3.5 text-[#FFD700]" />
                    <span className="text-[12px] font-semibold text-white">{name}</span>
                    <span className="text-[10px] text-white/40">{items.length}</span>
                  </div>
                  {items.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {items.map((doc: any) => (
                        <div key={doc.id} className="bg-white/5 rounded-md p-2 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-white/45 shrink-0" />
                          <span className="flex-1 truncate text-[11px] text-white/75">{doc.file_name}</span>
                          <span className={'text-[9px] shrink-0 ' + (doc.extraction_status === 'done' ? 'text-emerald-300' : 'text-white/40')}>{doc.extraction_status === 'done' ? '✓' : doc.extraction_status}</span>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-white/30 text-[11px]">No files yet</p>}
                </div>
              ))}
            </div>
          );
        })()}
        {verified.length > 0 && (
          <div className="mt-3">
            <div className="text-white/45 text-[10px] uppercase tracking-wide mb-1.5">Verified figures</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {verified.slice(0, 9).map((f) => (
                <div key={f.id} className={'rounded-lg p-2 ' + (f.contradicts_self_reported ? 'bg-red-500/10 border border-red-400/40' : 'bg-white/5')}>
                  <div className="text-white/45 text-[10px] capitalize">{f.metric.replace(/_/g, ' ')}{f.period ? ' · ' + f.period : ''}</div>
                  <div className={'text-[13px] font-semibold ' + (f.contradicts_self_reported ? 'text-red-200' : 'text-white')}>{f.metric.endsWith('_pct') ? f.value + '%' : gbp(f.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Block>

      {/* full analysis — verbose detail lives here once, not duplicated above */}
      {(rep || det || b?.memo) && (
        <div className="border-t border-white/8 pt-3 mt-3">
          <button onClick={() => setShowFull((s) => !s)} className="inline-flex items-center gap-1 text-[#FFD700] text-xs font-semibold">
            {showFull ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {showFull ? 'Hide' : 'View'} full analysis
          </button>
          {showFull && (
            <div className="mt-3 flex flex-col gap-3 text-[12px] text-white/75 leading-relaxed">
              {rep?.financial_analysis && <Detail t="Financial analysis" v={rep.financial_analysis} />}
              {rep?.valuation_view && <Detail t="Valuation view" v={rep.valuation_view} />}
              {rep?.recommended_structure && <Detail t="Recommended structure" v={rep.recommended_structure} />}
              {Array.isArray(rep?.opportunities) && rep.opportunities.length > 0 && <DetailList t="Opportunities" items={rep.opportunities} />}
              {Array.isArray(risks) && risks.length > 0 && <DetailList t="Key risks" items={risks} />}
              {Array.isArray(det?.conditions) && det.conditions.length > 0 && <DetailList t="Committee conditions" items={det.conditions} />}
              {rep?.suggested_offer && <p className="text-[#FFD700]">Suggested: open {gbp(rep.suggested_offer.opening)} · walk {gbp(rep.suggested_offer.walk_away)}</p>}
              {b?.memo && <Detail t={human(b.memo.title) || 'Investment memo'} v={human(b.memo.content)} mono />}
            </div>
          )}
        </div>
      )}
      {showCall && <ScheduleCallModal dealId={dealId!} dealName={b?.deal?.name || 'Deal'} status={status} dealContacts={b?.deal_contacts ?? []} onClose={() => setShowCall(false)} onChanged={load} />}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) { return <div className="mb-6 bg-white/5 rounded-2xl p-4 border border-white/10">{children}</div>; }
function Kpi({ label, value, gold, good }: { label: string; value: string; gold?: boolean; good?: boolean }) {
  return <div className="bg-white/5 rounded-lg p-2.5"><div className="text-white/45 text-[10px]">{label}</div><div className={'text-base font-semibold ' + (gold ? 'text-[#FFD700]' : good ? 'text-emerald-300' : 'text-white')}>{value}</div></div>;
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-t border-white/8 pt-3 mt-3"><div className="text-white/50 text-[11px] uppercase tracking-wide mb-2">{title}</div>{children}</div>;
}
function Btn({ onClick, busy, icon: Icon, label, primary, disabled }: { onClick: () => void; busy?: boolean; icon: any; label: string; primary?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy || disabled} className={'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold disabled:opacity-40 ' + (primary ? 'bg-[#FFD700] text-[#0A2540] hover:bg-opacity-90' : 'bg-white/10 text-white hover:bg-white/20')}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />} {label}
    </button>
  );
}
function LegalBtn({ onClick, busy, label, sub }: { onClick: () => void; busy?: boolean; label: string; sub: string }) {
  return (
    <button onClick={onClick} disabled={busy} className="text-left bg-[#0E2A47] border border-white/10 hover:border-[#FFD700]/40 rounded-xl p-2.5 flex gap-2.5 disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 mt-0.5 animate-spin text-[#FFD700]" /> : <FileSignature className="h-4 w-4 mt-0.5 text-[#FFD700]" />}
      <span><span className="block text-[12px] font-semibold text-white">{label}</span><span className="block text-[11px] text-white/50">{sub}</span></span>
    </button>
  );
}
function Detail({ t, v, mono }: { t: string; v: string; mono?: boolean }) {
  return <div><div className="text-white/45 text-[10px] uppercase tracking-wide mb-1">{t}</div>{mono ? <pre className="whitespace-pre-wrap font-sans bg-black/20 rounded-lg p-3 max-h-96 overflow-y-auto">{human(v)}</pre> : <p>{human(v)}</p>}</div>;
}
function DetailList({ t, items }: { t: string; items: string[] }) {
  return <div><div className="text-white/45 text-[10px] uppercase tracking-wide mb-1">{t}</div><ul className="list-disc pl-4 space-y-1">{items.slice(0, 6).map((x, i) => <li key={i}>{human(x)}</li>)}</ul></div>;
}
