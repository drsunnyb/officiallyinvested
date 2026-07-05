import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Search, Upload, Send, Globe, Users, ShieldCheck, Check, ArrowUpRight } from 'lucide-react';
import {
  prospectsList, prospectGet, prospectSuppress, prospectPromote,
  sourceTaxonomy, sourceSearch, ingestPropose, ingestCommit,
  outreachList, outreachCreate, outreachUpdate, outreachDraftTemplates, outreachEnrol,
  outreachQueue, outreachApprove, outreachApproveAll, outreachRun, outreachMarkReplied,
  getOrgSettings, setOrgSettings,
} from '../lib/acq';

const input = 'bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60';
const btn = 'px-3 py-1.5 rounded-full text-xs font-semibold';
const gold = btn + ' bg-[#FFD700] text-[#0A2540] hover:bg-opacity-90 disabled:opacity-40';
const ghost = btn + ' border border-white/20 text-white/70 hover:text-white';

const STAGE_TINT: Record<string, string> = {
  new: 'bg-white/10 text-white/60', enriched: 'bg-blue-400/18 text-blue-200', in_campaign: 'bg-purple-400/18 text-purple-200',
  replied: 'bg-amber-500/25 text-amber-100', qualified: 'bg-emerald-400/18 text-emerald-200', promoted: 'bg-[#FFD700]/20 text-[#FFD700]',
  suppressed: 'bg-red-500/20 text-red-200', disqualified: 'bg-red-500/20 text-red-200',
};
const PROV_LABEL: Record<string, string> = { platform: 'Sourced', uploaded: 'Your upload', funnel: 'Funnel lead', meta_ads: 'Meta lead' };
const fitTint = (n: number | null) => n == null ? 'bg-white/10 text-white/50' : n >= 80 ? 'bg-emerald-400/20 text-emerald-200' : n >= 60 ? 'bg-amber-500/20 text-amber-100' : 'bg-white/10 text-white/60';

export default function OriginationModal({ onClose, onPromoted }: { onClose: () => void; onPromoted?: () => void }) {
  const [tab, setTab] = useState<'prospects' | 'find' | 'upload' | 'campaigns' | 'funnel'>('prospects');
  const [err, setErr] = useState('');
  const tabs: { key: typeof tab; label: string; icon: any }[] = [
    { key: 'prospects', label: 'Prospects', icon: Users }, { key: 'find', label: 'Find companies', icon: Search },
    { key: 'upload', label: 'Upload list', icon: Upload }, { key: 'campaigns', label: 'Campaigns', icon: Send },
    { key: 'funnel', label: 'Funnel & Meta ads', icon: Globe },
  ];
  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-5xl bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-serif font-bold text-[#FFD700]">Origination — find, reach, and win off-market deals</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-white/45 mb-4"><ShieldCheck className="h-3.5 w-3.5" /> Sourced data lives in your CRM only — it cannot be exported. Lists you upload remain yours.</div>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setErr(''); }} className={btn + ' flex items-center gap-1.5 ' + (tab === t.key ? 'bg-[#FFD700] text-[#0A2540]' : 'border border-white/20 text-white/70 hover:text-white')}>
              <t.icon className="h-3.5 w-3.5" />{t.label}
            </button>
          ))}
        </div>
        {err && <p className="text-red-300 text-xs mb-3">{err}</p>}
        {tab === 'prospects' && <ProspectsTab setErr={setErr} onPromoted={onPromoted} />}
        {tab === 'find' && <FindTab setErr={setErr} done={() => setTab('prospects')} />}
        {tab === 'upload' && <UploadTab setErr={setErr} done={() => setTab('prospects')} />}
        {tab === 'campaigns' && <CampaignsTab setErr={setErr} />}
        {tab === 'funnel' && <FunnelTab setErr={setErr} />}
      </div>
    </div>
  );
}

function ProspectsTab({ setErr, onPromoted }: { setErr: (s: string) => void; onPromoted?: () => void }) {
  const [rows, setRows] = useState<any[]>([]); const [total, setTotal] = useState(0); const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [stage, setStage] = useState(''); const [minFit, setMinFit] = useState('');
  const [loading, setLoading] = useState(true); const [open, setOpen] = useState<string | null>(null); const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const per = 25;

  const load = async (p = page) => {
    setLoading(true); setErr('');
    try { const r = await prospectsList({ page: p, per, ...(q ? { q } : {}), ...(stage ? { stage } : {}), ...(minFit ? { min_fit: Number(minFit) } : {}) }); setRows(r.prospects); setTotal(r.total); setCounts(r.stage_counts || {}); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); setPage(1); /* eslint-disable-next-line */ }, [q, stage, minFit]);

  const openRow = async (id: string) => {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id); setDetail(null);
    try { setDetail(await prospectGet(id)); } catch (e: any) { setErr(e.message || String(e)); }
  };
  const promote = async (id: string) => {
    setBusy('promote'); setErr('');
    try { const r = await prospectPromote(id); await load(); setOpen(null); onPromoted?.(); alert('Now on your pipeline as ' + r.reference); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const suppress = async (id: string) => { setBusy('suppress'); try { await prospectSuppress(id); await load(); setOpen(null); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const replied = async (id: string) => { setBusy('replied'); try { await outreachMarkReplied(id); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input className={input + ' w-56'} placeholder="Search name, number, region…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={input} value={stage} onChange={(e) => setStage(e.target.value)}>
          <option value="">All active stages</option>
          {['new','enriched','in_campaign','replied','qualified','promoted','suppressed','disqualified'].map((s) => <option key={s} value={s}>{s.replace('_',' ')} {counts[s] ? `(${counts[s]})` : ''}</option>)}
        </select>
        <select className={input} value={minFit} onChange={(e) => setMinFit(e.target.value)}>
          <option value="">Any fit</option><option value="80">Fit 80+</option><option value="60">Fit 60+</option>
        </select>
        <span className="text-white/40 text-[11px] ml-auto">{total} prospects</span>
      </div>
      {loading ? <div className="flex items-center gap-2 text-white/60 text-sm py-8 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : rows.length === 0 ? (
        <p className="text-white/45 text-sm py-10 text-center">No prospects yet. Use <b>Find companies</b> to source from Companies House, or <b>Upload list</b> to bring in your own data.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((p) => (
            <div key={p.id}>
              <button onClick={() => openRow(p.id)} className="w-full text-left flex items-center gap-2.5 bg-white/5 hover:bg-white/10 rounded-lg p-2.5">
                <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score ?? '—'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-white truncate">{p.company_name}</div>
                  <div className="text-[11px] text-white/50 truncate">{[p.company_number, p.region, p.oldest_director_age ? `oldest director ${p.oldest_director_age}` : null].filter(Boolean).join(' · ')}</div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/55">{PROV_LABEL[p.provenance] ?? p.provenance}</span>
                <span className={'text-[10px] font-semibold px-2 py-0.5 rounded-full ' + (STAGE_TINT[p.stage] ?? 'bg-white/10 text-white/60')}>{p.stage.replace('_',' ')}</span>
              </button>
              {open === p.id && (
                <div className="bg-white/5 rounded-lg mt-0.5 mb-1 p-3 text-xs text-white/75">
                  {!detail ? <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div> : (
                    <>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-2">
                        {detail.prospect.fit_reasons && <div className="col-span-2 text-white/85">{detail.prospect.fit_reasons}</div>}
                        {detail.prospect.address && <div>Address: {detail.prospect.address} {detail.prospect.postcode ?? ''}</div>}
                        {detail.prospect.incorporated_on && <div>Incorporated: {String(detail.prospect.incorporated_on).slice(0, 10)}</div>}
                        {detail.prospect.owner_name && <div>Owner: {detail.prospect.owner_name}</div>}
                        {detail.prospect.owner_email && <div>Email: {detail.prospect.owner_email}</div>}
                        {detail.prospect.owner_phone && <div>Phone: {detail.prospect.owner_phone}</div>}
                        {detail.prospect.revenue_estimate && <div>Revenue: £{Number(detail.prospect.revenue_estimate).toLocaleString()} ({detail.prospect.revenue_basis})</div>}
                        {(detail.prospect.directors ?? []).length > 0 && <div className="col-span-2">Directors: {(detail.prospect.directors as any[]).map((d) => d.name + (d.dob_year ? ` (${new Date().getFullYear() - d.dob_year})` : '')).join(', ')}</div>}
                        {detail.memberships.length > 0 && <div className="col-span-2">Campaigns: {detail.memberships.map((m: any) => `${m.campaign_name} (${m.status}, step ${m.current_step + 1})`).join(' · ')}</div>}
                        {detail.prospect.notes && <div className="col-span-2 whitespace-pre-wrap text-white/60">{detail.prospect.notes}</div>}
                      </div>
                      {detail.touches.length > 0 && (
                        <div className="mb-2">
                          <div className="text-white/45 text-[10px] uppercase tracking-wide mb-1">Outreach history</div>
                          {detail.touches.slice(0, 6).map((t: any) => <div key={t.id} className="text-[11px] text-white/60">{t.channel} · {t.status}{t.sent_at ? ' · ' + String(t.sent_at).slice(0, 10) : ''}{t.subject ? ' · ' + t.subject : ''}</div>)}
                        </div>
                      )}
                      {p.stage !== 'promoted' && p.stage !== 'suppressed' && (
                        <div className="flex gap-2 flex-wrap">
                          <button disabled={!!busy} onClick={() => promote(p.id)} className={gold + ' flex items-center gap-1'}><ArrowUpRight className="h-3.5 w-3.5" />Promote to deal</button>
                          <button disabled={!!busy} onClick={() => replied(p.id)} className={ghost}>Mark replied</button>
                          <button disabled={!!busy} onClick={() => suppress(p.id)} className={ghost + ' hover:text-red-300'}>Suppress (do not contact)</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between mt-2">
            <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }} className={ghost + ' disabled:opacity-30'}>Previous</button>
            <span className="text-white/40 text-[11px]">Page {page} of {Math.max(1, Math.ceil(total / per))}</span>
            <button disabled={page >= Math.ceil(total / per)} onClick={() => { const p = page + 1; setPage(p); load(p); }} className={ghost + ' disabled:opacity-30'}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function FindTab({ setErr, done }: { setErr: (s: string) => void; done: () => void }) {
  const [tax, setTax] = useState<{ key: string; label: string }[]>([]);
  const [sel, setSel] = useState<string[]>([]); const [location, setLocation] = useState(''); const [minAge, setMinAge] = useState('8'); const [maxN, setMaxN] = useState('25');
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<any>(null);
  useEffect(() => { sourceTaxonomy().then((r) => setTax(r.taxonomy)).catch((e) => setErr(e.message || String(e))); }, []);
  const toggle = (k: string) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : s.length < 6 ? [...s, k] : s);
  const run = async () => {
    if (!sel.length) { setErr('Pick at least one industry'); return; }
    setBusy(true); setErr(''); setResult(null);
    try { setResult(await sourceSearch({ categories: sel, location: location || undefined, min_age_years: Number(minAge), max_results: Number(maxN) })); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div>
      <p className="text-white/55 text-xs mb-3">Pick the boring-but-good industries in your buy box. We search Companies House for established businesses, read director ages for succession signals, and score each one against your thesis.</p>
      <div className="flex flex-wrap gap-1.5 mb-3 max-h-44 overflow-y-auto">
        {tax.map((t) => (
          <button key={t.key} onClick={() => toggle(t.key)} className={'text-[11px] px-2.5 py-1 rounded-full border ' + (sel.includes(t.key) ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700] font-semibold' : 'border-white/20 text-white/65 hover:text-white')}>{t.label}</button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap items-center mb-3">
        <input className={input + ' w-44'} placeholder="Town / region (optional)" value={location} onChange={(e) => setLocation(e.target.value)} />
        <select className={input} value={minAge} onChange={(e) => setMinAge(e.target.value)}><option value="5">Trading 5+ yrs</option><option value="8">Trading 8+ yrs</option><option value="15">Trading 15+ yrs</option></select>
        <select className={input} value={maxN} onChange={(e) => setMaxN(e.target.value)}><option value="10">10 results</option><option value="25">25 results</option><option value="50">50 results</option></select>
        <button onClick={run} disabled={busy} className={gold + ' flex items-center gap-1.5'}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Find companies</button>
      </div>
      {result && (
        <div className="bg-white/5 rounded-lg p-3 text-xs text-white/75">
          <p className="mb-2"><b className="text-white">{result.created}</b> new prospects added{result.updated ? `, ${result.updated} refreshed` : ''} (of {result.total_hits} matches). Top finds:</p>
          {result.prospects.slice(0, 8).map((p: any) => (
            <div key={p.id} className="flex items-center gap-2 py-0.5"><span className={'text-[10px] font-bold px-1.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score}</span><span className="text-white/85">{p.company_name}</span><span className="text-white/45">{p.address}</span></div>
          ))}
          <button onClick={done} className={gold + ' mt-2'}>View in Prospects</button>
        </div>
      )}
    </div>
  );
}

function UploadTab({ setErr, done }: { setErr: (s: string) => void; done: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [proposal, setProposal] = useState<any>(null); const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(''); const [report, setReport] = useState<any>(null);
  const FIELDS = ['company_name','company_number','website','owner_name','owner_email','owner_phone','address','postcode','region','sic_code','revenue','staff','notes'];

  const pick = async (f: File) => {
    setErr(''); setReport(null); setProposal(null);
    const text = await f.text(); setCsv(text); setFileName(f.name); setBusy('propose');
    try { const r = await ingestPropose(text, f.name); setProposal(r); setMapping(r.mapping); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const commit = async () => {
    setBusy('commit'); setErr('');
    try { setReport(await ingestCommit(csv, mapping, proposal?.job_id ?? null, fileName)); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  return (
    <div>
      <p className="text-white/55 text-xs mb-3">Bring in lists you already have — broker sheets, data-provider exports, your own research. We map the columns, de-duplicate against what's already here, and merge without overwriting good data. <b className="text-white/75">Uploaded records stay yours.</b></p>
      {!proposal && (
        <button onClick={() => fileRef.current?.click()} disabled={busy === 'propose'} className="w-full border-2 border-dashed border-white/20 rounded-xl p-8 text-white/50 hover:text-white hover:border-[#FFD700]/50 text-sm flex items-center justify-center gap-2">
          {busy === 'propose' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading your file…</> : <><Upload className="h-4 w-4" /> Drop or choose a CSV file</>}
        </button>
      )}
      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      {proposal && !report && (
        <div className="bg-white/5 rounded-lg p-3">
          <p className="text-xs text-white/70 mb-2">{fileName} · {proposal.rows_total} rows. Check the column mapping:</p>
          <div className="flex flex-col gap-1 mb-3 max-h-56 overflow-y-auto">
            {proposal.headers.map((h: string) => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-xs text-white/80 w-48 truncate">{h}</span>
                <select className={input} value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}>
                  <option value="">— ignore —</option>
                  {FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button onClick={commit} disabled={busy === 'commit'} className={gold + ' flex items-center gap-1.5'}>{busy === 'commit' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Import {proposal.rows_total} rows</button>
        </div>
      )}
      {report && (
        <div className="bg-white/5 rounded-lg p-3 text-xs text-white/75">
          <p><b className="text-white">{report.created}</b> new prospects created · <b className="text-white">{report.merged}</b> merged into existing records · {report.skipped} skipped.</p>
          {report.errors?.length > 0 && <p className="text-amber-200 mt-1">{report.errors.length} rows had issues.</p>}
          <button onClick={done} className={gold + ' mt-2'}>View in Prospects</button>
        </div>
      )}
    </div>
  );
}

function CampaignsTab({ setErr }: { setErr: (s: string) => void }) {
  const [camps, setCamps] = useState<any[]>([]); const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const [draftSteps, setDraftSteps] = useState<any[]>([]); const [queue, setQueue] = useState<any[] | null>(null);
  const [enrolFor, setEnrolFor] = useState<string | null>(null); const [ef, setEf] = useState<Record<string, string>>({ min_fit: '60', limit: '50' });

  const load = async () => {
    setLoading(true);
    try { const r = await outreachList(); setCamps(r.campaigns); setSteps(r.steps); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const aiDraft = async () => {
    setBusy('draft'); setErr('');
    try { const r = await outreachDraftTemplates(); setDraftSteps(r.steps); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const create = async () => {
    if (!name.trim() || !draftSteps.length) { setErr('Give the campaign a name and draft the steps first'); return; }
    setBusy('create'); setErr('');
    try { await outreachCreate({ name, steps: draftSteps }); setCreating(false); setName(''); setDraftSteps([]); await load(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const setStatus = async (id: string, status: string) => { setBusy(id); try { await outreachUpdate(id, { status }); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const enrol = async (id: string) => {
    setBusy('enrol'); setErr('');
    try { const r = await outreachEnrol(id, { min_fit: ef.min_fit ? Number(ef.min_fit) : undefined, region: ef.region || undefined, limit: Number(ef.limit || 50) }); alert(`${r.enrolled} prospects enrolled (${r.suppressed} suppressed).`); setEnrolFor(null); await load(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const showQueue = async () => { setBusy('queue'); try { const r = await outreachQueue('needs_approval'); setQueue(r.touches); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const approveAll = async () => { setBusy('approve'); try { const r = await outreachApproveAll(); alert(`${r.approved} messages approved — they go out inside each campaign's send window and daily cap.`); setQueue(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const runNow = async () => { setBusy('run'); try { await outreachRun(); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  const CHANNEL_LABEL: Record<string, string> = { letter: 'Letter (posted)', email: 'Email', call_task: 'Call task (human)' };
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => setCreating((c) => !c)} className={gold}>+ New campaign</button>
        <button onClick={showQueue} disabled={!!busy} className={ghost}>Approval queue</button>
        <button onClick={runNow} disabled={!!busy} className={ghost + ' flex items-center gap-1'}>{busy === 'run' && <Loader2 className="h-3 w-3 animate-spin" />}Run engine now</button>
        <span className="text-[11px] text-white/40 ml-auto">Letters → Stannp · Emails → Resend · Calls → your task list. Nothing sends without approval.</span>
      </div>

      {creating && (
        <div className="bg-white/5 rounded-lg p-3 mb-3">
          <div className="flex gap-2 mb-2">
            <input className={input + ' flex-1'} placeholder="Campaign name, e.g. Laundries North West Q3" value={name} onChange={(e) => setName(e.target.value)} />
            <button onClick={aiDraft} disabled={busy === 'draft'} className={gold + ' flex items-center gap-1.5'}>{busy === 'draft' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Draft sequence with AI</button>
          </div>
          {draftSteps.map((s, i) => (
            <div key={i} className="mb-2">
              <div className="text-[11px] text-white/50 mb-1">Step {i + 1} · {CHANNEL_LABEL[s.channel]} {s.wait_days ? `· ${s.wait_days} days after previous` : '· immediately'}</div>
              {s.subject != null && <input className={input + ' w-full mb-1'} value={s.subject} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />}
              <textarea className={input + ' w-full min-h-[90px]'} value={s.body} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
            </div>
          ))}
          {draftSteps.length > 0 && <button onClick={create} disabled={busy === 'create'} className={gold}>Create campaign (starts paused)</button>}
        </div>
      )}

      {queue && (
        <div className="bg-white/5 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between mb-2"><span className="text-xs text-white/70 font-semibold">{queue.length} messages waiting for your approval</span>
            <div className="flex gap-2"><button onClick={approveAll} disabled={!queue.length || !!busy} className={gold + ' flex items-center gap-1'}><Check className="h-3.5 w-3.5" />Approve all</button><button onClick={() => setQueue(null)} className={ghost}>Close</button></div></div>
          <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
            {queue.map((t) => (
              <div key={t.id} className="bg-white/5 rounded p-2 text-[11px] text-white/70">
                <div className="flex items-center gap-2 mb-0.5"><b className="text-white/90">{t.company_name}</b><span className="px-1.5 rounded-full bg-white/10">{t.channel}</span>
                  <button onClick={async () => { await outreachApprove([t.id]); setQueue((q) => q!.filter((x) => x.id !== t.id)); }} className="ml-auto text-emerald-300 hover:text-emerald-200 font-semibold">Approve</button></div>
                {t.subject && <div className="text-white/60">{t.subject}</div>}
                <div className="text-white/50 line-clamp-2 whitespace-pre-wrap">{t.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : camps.length === 0 && !creating ? (
        <p className="text-white/45 text-sm py-6 text-center">No campaigns yet. Create one, draft the sequence with AI, then enrol your best-fit prospects.</p>
      ) : camps.map((c) => (
        <div key={c.id} className="bg-white/5 rounded-lg p-3 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <b className="text-[13px] text-white">{c.name}</b>
            <span className={'text-[10px] font-semibold px-2 py-0.5 rounded-full ' + (c.status === 'active' ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-white/55')}>{c.status}</span>
            <span className="text-[11px] text-white/50">{c.members} enrolled · {c.sent} sent · {c.replied} replied{c.needs_approval ? ` · ${c.needs_approval} awaiting approval` : ''}</span>
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => setEnrolFor(enrolFor === c.id ? null : c.id)} className={ghost}>Enrol prospects</button>
              {c.status !== 'active' ? <button onClick={() => setStatus(c.id, 'active')} disabled={busy === c.id} className={gold}>Activate</button>
                : <button onClick={() => setStatus(c.id, 'paused')} disabled={busy === c.id} className={ghost}>Pause</button>}
            </div>
          </div>
          <div className="text-[11px] text-white/45 mt-1">{steps.filter((s) => s.campaign_id === c.id).map((s) => CHANNEL_LABEL[s.channel] + (s.wait_days ? ` (+${s.wait_days}d)` : '')).join(' → ') || 'No steps'}</div>
          {enrolFor === c.id && (
            <div className="flex gap-2 items-center mt-2 flex-wrap">
              <select className={input} value={ef.min_fit} onChange={(e) => setEf((f) => ({ ...f, min_fit: e.target.value }))}><option value="">Any fit</option><option value="60">Fit 60+</option><option value="80">Fit 80+</option></select>
              <input className={input + ' w-36'} placeholder="Region (optional)" value={ef.region ?? ''} onChange={(e) => setEf((f) => ({ ...f, region: e.target.value }))} />
              <select className={input} value={ef.limit} onChange={(e) => setEf((f) => ({ ...f, limit: e.target.value }))}><option value="25">Up to 25</option><option value="50">Up to 50</option><option value="100">Up to 100</option></select>
              <button onClick={() => enrol(c.id)} disabled={busy === 'enrol'} className={gold + ' flex items-center gap-1.5'}>{busy === 'enrol' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Enrol</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function FunnelTab({ setErr }: { setErr: (s: string) => void }) {
  const [settings, setSettings] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(''); const [headline, setHeadline] = useState(''); const [verifyTok, setVerifyTok] = useState('');
  const base = ((import.meta as any).env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1/acq-funnel';
  const pageBase = window.location.origin + '/f';
  useEffect(() => {
    getOrgSettings().then((r) => {
      setSettings(r.settings ?? {});
      setSlug(r.settings?.funnel?.slug ?? ''); setHeadline(r.settings?.funnel?.headline ?? ''); setVerifyTok(r.settings?.funnel?.meta_verify_token ?? '');
    }).catch((e) => setErr(e.message || String(e)));
  }, []);
  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings({ ...(settings ?? {}), funnel: { ...(settings?.funnel ?? {}), slug: slug || undefined, headline: headline || undefined, meta_verify_token: verifyTok || undefined } }); alert('Saved.'); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  const url = pageBase + (slug ? `/${encodeURIComponent(slug)}` : '');
  if (!settings) return <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  return (
    <div className="text-xs text-white/70 flex flex-col gap-4">
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-white font-semibold text-[13px] mb-1">Your seller funnel</div>
        <p className="mb-2 text-white/55">A branded "Thinking of selling?" page, wired straight into your CRM. Every enquiry arrives as a qualified lead with an automatic confidential reply. Use it as the destination for ads, your email signature, letters and QR codes.</p>
        <div className="flex gap-2 items-center flex-wrap mb-2">
          <input className={input + ' w-44'} placeholder="Link slug, e.g. officially-invested" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
          <input className={input + ' flex-1 min-w-[200px]'} placeholder="Headline (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          <button onClick={save} disabled={busy} className={gold}>Save</button>
        </div>
        <div className="flex items-center gap-2 bg-white/5 rounded p-2">
          <span className="text-white/85 break-all flex-1">{url}</span>
          <button onClick={() => navigator.clipboard.writeText(url)} className={ghost}>Copy</button>
          <a href={url} target="_blank" rel="noreferrer" className={ghost}>Preview</a>
        </div>
      </div>
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-white font-semibold text-[13px] mb-1">Meta lead ads → straight into your CRM</div>
        <p className="text-white/55 mb-2">Run "Thinking of selling your business?" lead ads on Facebook and Instagram. Leads flow into Prospects automatically via webhook — no landing page needed.</p>
        <ol className="list-decimal list-inside flex flex-col gap-1 text-white/65 mb-2">
          <li>In Meta Business Suite create a <b>Lead Ads</b> campaign with an instant form: business name, your name, email, phone, area, and "roughly what does it turn over?".</li>
          <li>Target: your buy-box regions, ages 45–65, interests in business ownership; keep the creative plain and personal (a letter-style image outperforms stock photos).</li>
          <li>In the Meta App Dashboard add a <b>Webhooks</b> product → Page → subscribe to <b>leadgen</b>, callback URL below, verify token as set here.</li>
          <li>Paste your Page ID and a Page access token into org settings (<code>funnel.meta_page_id</code>, <code>funnel.meta_page_token</code>) so we can pull full lead details.</li>
        </ol>
        <div className="flex gap-2 items-center flex-wrap">
          <span className="bg-white/5 rounded p-2 break-all flex-1">{base}</span>
          <input className={input + ' w-44'} placeholder="Verify token" value={verifyTok} onChange={(e) => setVerifyTok(e.target.value)} />
          <button onClick={save} disabled={busy} className={gold}>Save</button>
        </div>
      </div>
      <p className="text-white/40 text-[11px]">Compliance is built in: suppression list enforced on every send, unsubscribe honoured automatically, letters are the default first touch, and calls are always made by a human after TPS screening.</p>
    </div>
  );
}
