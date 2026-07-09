// =============================================================================
// PipelineLite - the per-workspace pipeline for self-serve users.
// Free forever: add deals, move them through stages, get the deterministic
// Acquisition Score. The AI analyst layer (full analysis, committee, memo,
// drafts) is where the paywall sits.
// =============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, X, Sparkles, ArrowLeft, Lock, Check, LogOut } from 'lucide-react';
import { liteDeals, liteDealCreate, liteDealUpdate, onboardScore, onboardStatus, crmList, crmAddTask, crmCompleteTask } from '../../lib/acq';
import Paywall, { CreditsTopUp } from '../../components/Paywall';
import { supabase } from '../../lib/supabase';
import DealAnalysisPanel from '../../components/DealAnalysisPanel';

const NAVY = '#0A2540';
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] bg-white';
const btnGold = 'inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-lg text-sm font-bold hover:brightness-95 disabled:opacity-40';
const btnGhost = 'inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-40';

const STAGE_LABEL: Record<string, string> = { sourced: 'New & screening', contacted: 'In conversation', analysing: 'Analysis', offer: 'Offer made', heads_of_terms: 'Heads of terms', diligence: 'Due diligence', completed: 'Completed', passed: 'Passed' };
const BOARD_STAGES = ['sourced', 'contacted', 'analysing', 'offer', 'heads_of_terms', 'diligence'];

export default function PipelineLite() {
  const [deals, setDeals] = useState<any[] | null>(null);
  const [plan, setPlan] = useState('free');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [paywall, setPaywall] = useState<string | null>(null);
  const [topup, setTopup] = useState<'ai' | 'letter' | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const f = (e: any) => setTopup(e.detail?.kind ?? 'ai');
    const g = () => setPaywall('The cockpit is yours. The AI analyst inside it joins on any paid plan');
    window.addEventListener('oi:topup', f);
    window.addEventListener('oi:paywall', g);
    return () => { window.removeEventListener('oi:topup', f); window.removeEventListener('oi:paywall', g); };
  }, []);
  const load = () => Promise.all([liteDeals(), onboardStatus()]).then(([d, st]) => { setDeals(d.deals); setPlan(st.plan ?? 'free'); }).catch((e) => setErr(e.message || String(e)));
  useEffect(() => { load(); }, []);
  const open = (deals ?? []).find((d) => d.id === openId) ?? null;
  const paid = plan !== 'free';

  return (
    <div className="min-h-screen" style={{ background: NAVY }}>
      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="font-serif text-2xl font-bold text-[#FFD700]">Your pipeline</h1>
            <p className="text-white/50 text-[13px] mt-0.5">{paid ? 'Click any deal to open your cockpit: AI analysis, committee, memo, documents, people and history.' : 'Free forever. The Acquisition Score is on us - the AI analyst joins on a paid plan.'}</p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/origination" className={btnGhost + ' !text-white !border-white/30 hover:!bg-white/10'}><ArrowLeft className="h-4 w-4" /> Origination</Link>
            <Link to="/deals" className={btnGhost + ' !text-white !border-white/30 hover:!bg-white/10'}>Community deals</Link>
            <button className={btnGold} onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add deal</button>
            <button className="text-white/50 hover:text-white p-2" title="Sign out" onClick={async () => { await supabase?.auth.signOut(); window.location.href = '/signup'; }}><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{err}</div>}
        {deals && deals.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 mb-5">
            {([['Live deals', deals.filter((d) => !['completed', 'passed'].includes(d.status)).length],
              ['In conversation', deals.filter((d) => d.status === 'contacted').length],
              ['Offers out', deals.filter((d) => ['offer', 'heads_of_terms'].includes(d.status)).length],
              ['In diligence', deals.filter((d) => d.status === 'diligence').length],
              ['Completed', deals.filter((d) => d.status === 'completed').length]] as [string, number][]).map(([label, value]) => (
              <div key={label} className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                <div className="text-white/50 text-[11px] mb-0.5">{label}</div>
                <div className="text-[#FFD700] text-lg font-bold">{value}</div>
              </div>
            ))}
          </div>
        )}
        {!deals ? <div className="text-white/50 py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {BOARD_STAGES.map((st) => (
              <div key={st} className="bg-white/[0.05] border border-white/10 rounded-xl p-2.5 min-h-[180px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'); if (id) { await liteDealUpdate(id, { status: st }).catch((x: any) => setErr(x.message)); load(); } }}>
                <div className="text-white/60 text-[10px] font-bold uppercase tracking-wider px-1 mb-2">{STAGE_LABEL[st]} · {deals.filter((d) => d.status === st).length}</div>
                {deals.filter((d) => d.status === st).map((d) => (
                  <button key={d.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', d.id)} onClick={() => setOpenId(d.id)} className="w-full text-left bg-white rounded-lg p-3 mb-2 hover:-translate-y-0.5 transition-transform cursor-grab active:cursor-grabbing">
                    <div className="text-[13px] font-semibold text-gray-900 leading-snug">{d.name}</div>
                    <div className="flex flex-wrap gap-x-2 mt-1.5 text-[10px] font-semibold text-[#B8860B]">
                      {d.ch_snapshot?.score_inputs?.revenue > 0 && <span>Rev £{Number(d.ch_snapshot.score_inputs.revenue).toLocaleString()}</span>}
                      {d.ch_snapshot?.score_inputs?.ebitda > 0 && <span>Profit £{Number(d.ch_snapshot.score_inputs.ebitda).toLocaleString()}</span>}
                      {d.asking_price && <span>Ask £{Number(d.asking_price).toLocaleString()}</span>}
                      {!d.asking_price && !(d.ch_snapshot?.score_inputs?.revenue > 0) && <span className="text-gray-400 font-normal">{d.sector ?? ''}</span>}
                    </div>
                    {Date.now() - new Date(d.updated_at ?? d.created_at).getTime() > 7 * 86400000 && !['completed', 'passed'].includes(d.status) && (
                      <div className="mt-1.5 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 inline-block">No movement · {Math.floor((Date.now() - new Date(d.updated_at ?? d.created_at).getTime()) / 86400000)}d · nudge it</div>
                    )}
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px] text-gray-300">{d.updated_at ? new Date(d.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                      {d.ch_snapshot?.acquisition_score != null ? <span className={'text-[10px] font-bold px-1.5 py-0.5 rounded-full ' + (d.ch_snapshot.acquisition_score >= 65 ? 'bg-emerald-600 text-white' : 'bg-[#0A2540] text-white')}>✦ {d.ch_snapshot.acquisition_score} · {d.ch_snapshot.score_band}</span> : <span className="text-[9px] text-gray-300">not scored</span>}
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        {(deals ?? []).some((d) => ['completed', 'passed'].includes(d.status)) && (
          <div className="text-white/40 text-[12px] mt-4">Completed: {(deals ?? []).filter((d) => d.status === 'completed').length} · Passed: {(deals ?? []).filter((d) => d.status === 'passed').length}</div>
        )}
      </div>

      {adding && <AddDeal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} setErr={setErr} />}
      {open && <DealDrawer deal={open} paid={paid} onClose={() => setOpenId(null)} onChanged={load} onPaywall={(c) => setPaywall(c)} setErr={setErr} />}
      {paywall && <Paywall context={paywall} onClose={() => setPaywall(null)} />}
      {topup && <CreditsTopUp focus={topup} onClose={() => setTopup(null)} />}
    </div>
  );
}

function AddDeal({ onClose, onSaved, setErr }: { onClose: () => void; onSaved: () => void; setErr: (m: string) => void }) {
  const [f, setF] = useState<any>({ name: '', sector: '', asking_price: '' });
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await liteDealCreate({ name: f.name, sector: f.sector || null, asking_price: f.asking_price ? Number(String(f.asking_price).replace(/[^0-9.]/g, '')) : null }); onSaved(); }
    catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="font-serif font-bold text-lg text-gray-900 mb-4">Add a deal</div>
        <input className={input + ' w-full'} placeholder="Business name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <input className={input + ' w-full mt-2.5'} placeholder="Sector (optional)" value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} />
        <input className={input + ' w-full mt-2.5'} placeholder="Asking price £ (optional)" value={f.asking_price} onChange={(e) => setF({ ...f, asking_price: e.target.value })} />
        <button className={btnGold + ' w-full mt-4 justify-center'} disabled={busy || !f.name.trim()} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add to pipeline'}</button>
      </div>
    </div>
  );
}

function DealDrawer({ deal, paid, onClose, onChanged, onPaywall, setErr }: { deal: any; paid: boolean; onClose: () => void; onChanged: () => void; onPaywall: (c: string) => void; setErr: (m: string) => void }) {
  const snap = deal.ch_snapshot ?? {};
  const [si, setSi] = useState<any>(snap.score_inputs ?? { oldest_director_age: '', revenue: '', ebitda: '', incorporated_on: '', accounts_current: true, seller_engaged: false, asset_backing: 'none' });
  const [busy, setBusy] = useState(false);
  const [showScore, setShowScore] = useState(snap.acquisition_score == null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskDraft, setTaskDraft] = useState('');
  const loadTasks = () => crmList().then((r) => setTasks((r.tasks || []).filter((t: any) => t.deal_id === deal.id))).catch(() => {});
  useEffect(() => { loadTasks(); }, [deal.id]);
  const addTask = async () => { if (!taskDraft.trim()) return; await crmAddTask({ deal_id: deal.id, title: taskDraft.trim() }).catch((e: any) => setErr(e.message)); setTaskDraft(''); loadTasks(); };
  const doneTask = async (id: string) => { await crmCompleteTask(id); setTasks((t) => t.filter((x) => x.id !== id)); };
  const score = async () => {
    setBusy(true);
    try {
      await onboardScore({ oldest_director_age: Number(si.oldest_director_age) || 0, revenue: Number(si.revenue) || 0, ebitda: Number(si.ebitda) || 0, incorporated_on: si.incorporated_on || null, accounts_current: si.accounts_current, seller_engaged: si.seller_engaged, asset_backing: si.asset_backing }, deal.id);
      setShowScore(false); onChanged();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const chipCls = (active: boolean) => 'text-[12px] px-3.5 py-1.5 rounded-full border font-semibold transition ' + (active ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'border-white/25 text-white/75 hover:border-white/50 hover:text-white');
  const STAGE_ASSIST: Record<string, string> = { sourced: 'Initial screening brief', contacted: 'Conversation prep brief', analysing: 'Full analysis', offer: 'Deal committee', heads_of_terms: 'Deal committee', diligence: 'Investment memo', completed: 'Investment memo', passed: 'Full analysis' };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-4xl h-full overflow-y-auto p-8" style={{ background: 'linear-gradient(160deg,#0A2540,#0C2B4A)' }} onClick={(e) => e.stopPropagation()}>
        {/* header - the same anatomy as the host pipeline */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-serif font-bold text-[26px] text-[#FFD700] leading-tight">{deal.name}</h2>
            <div className="text-white/40 text-[12px] mt-1">{new Date(deal.created_at).toLocaleDateString('en-GB')}{deal.sector ? ' · ' + deal.sector : ''}{deal.asking_price ? ' · Ask £' + Number(deal.asking_price).toLocaleString() : ''}</div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1"><X className="h-5 w-5" /></button>
        </div>

        {/* deal stage */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">Deal stage</div>
          <div className="flex flex-wrap gap-2">
            {['sourced', 'contacted', 'analysing', 'offer', 'heads_of_terms', 'diligence', 'completed', 'passed'].map((st) => (
              <button key={st} onClick={async () => { await liteDealUpdate(deal.id, { status: st }).catch((e: any) => setErr(e.message)); onChanged(); }}
                className={chipCls(deal.status === st)}>{STAGE_LABEL[st]}</button>
            ))}
          </div>
        </div>

        {/* AI assistance for this stage */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">AI assistance for this stage</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { if (!paid) { onPaywall('The AI analyst reads the accounts, stress-tests the deal and writes your documents'); return; } document.getElementById('lite-cockpit')?.scrollIntoView({ behavior: 'smooth' }); }}
              className="bg-[#FFD700] text-[#0A2540] text-[13px] font-bold px-5 py-2.5 rounded-full hover:brightness-95 transition">{STAGE_ASSIST[deal.status] ?? 'Full analysis'}</button>
            {!paid && <span className="inline-flex items-center gap-1.5 text-[11px] text-white/50 self-center"><Lock className="h-3 w-3" /> unlocks with any paid plan</span>}
          </div>
        </div>

        {/* acquisition score - free, styled into the dark chrome */}
        <div className="mt-7 bg-white/[0.05] border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-white flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#FFD700]" /> Acquisition Score <span className="text-[9px] font-bold text-emerald-300 bg-emerald-400/15 border border-emerald-400/30 px-1.5 py-0.5 rounded-full uppercase">Free</span></div>
            <div className="flex items-center gap-3">
              {snap.acquisition_score != null && <span className="font-serif font-bold text-2xl text-[#FFD700]">{snap.acquisition_score}<span className="text-[12px] text-white/40 font-sans"> · {snap.score_band}</span></span>}
              <button className="text-[11px] text-white/50 underline underline-offset-2 hover:text-white" onClick={() => setShowScore((v) => !v)}>{showScore ? 'hide inputs' : snap.acquisition_score != null ? 're-score' : 'score it'}</button>
            </div>
          </div>
          {snap.score_breakdown && !showScore && (
            <div className="mt-2.5">{snap.score_breakdown.map((b: any, i: number) => (
              <div key={i} className="flex justify-between text-[12px] text-white/60 py-0.5"><span>{b.part}</span><span className="font-semibold text-white/80">{b.pts}/{b.max}</span></div>
            ))}</div>
          )}
          {showScore && (
            <>
              <div className="grid grid-cols-2 gap-2 mt-4">
                {[['oldest_director_age', 'Oldest director age'], ['incorporated_on', 'Incorporated YYYY-MM-DD'], ['revenue', 'Revenue £'], ['ebitda', 'Adj EBITDA £']].map(([k, ph]) => (
                  <input key={k} className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#FFD700]/60" placeholder={ph} value={si[k]} onChange={(e) => setSi({ ...si, [k]: e.target.value })} />
                ))}
                <select className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white outline-none [&>option]:text-gray-900" value={si.asset_backing} onChange={(e) => setSi({ ...si, asset_backing: e.target.value })}>
                  <option value="none">No asset backing</option><option value="partial">Some property/plant</option><option value="full">Freehold / asset-rich</option>
                </select>
                <div className="flex flex-col gap-1 text-[12px] text-white/60 justify-center">
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.accounts_current} onChange={(e) => setSi({ ...si, accounts_current: e.target.checked })} /> Accounts current</label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.seller_engaged} onChange={(e) => setSi({ ...si, seller_engaged: e.target.checked })} /> Seller engaged</label>
                </div>
              </div>
              <button className={btnGold + ' w-full mt-3 justify-center'} disabled={busy} onClick={score}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : snap.acquisition_score != null ? 'Re-score' : 'Get my Acquisition Score'}</button>
            </>
          )}
        </div>

        {/* working items - next steps on this deal */}
        <div className="mt-7">
          <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif mb-2.5">Working items - next steps on this deal</div>
          {tasks.length === 0 && <div className="text-white/35 text-[12.5px] mb-2">Nothing outstanding. Add the next move so it never slips.</div>}
          {tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.07]">
              <button onClick={() => doneTask(t.id)} className="mt-0.5 text-white/25 hover:text-emerald-400" title="Mark done"><Check className="h-4 w-4" /></button>
              <span className="inline-flex text-[9px] font-bold bg-[#FFD700]/15 text-[#FFD700] border border-[#FFD700]/30 rounded-full px-2 py-0.5 uppercase mt-0.5 shrink-0">Next step</span>
              <div className="text-[13px] text-white/85 leading-relaxed">{t.title}{t.due_date && <span className="text-white/35 text-[11px] ml-2">due {String(t.due_date).slice(0, 10)}</span>}</div>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <input className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-white/30 outline-none focus:border-[#FFD700]/60" placeholder="e.g. Chase 2023 accounts · Confirm SDLT position" value={taskDraft} onChange={(e) => setTaskDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
            <button className={btnGold} onClick={addTask}>Add</button>
          </div>
        </div>

        {/* the full cockpit - identical instrument, AI gated on free */}
        <div className="mt-7" id="lite-cockpit">
          <div className="flex items-center justify-between mb-2.5">
            <div className="text-white/40 text-[11px] font-bold uppercase tracking-[0.15em] font-serif">Deal cockpit - documents, analysis, people, history</div>
            {!paid && <button onClick={() => onPaywall('The cockpit is yours. The AI analyst inside it joins on any paid plan')} className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#FFD700] text-[#0A2540] px-2 py-0.5 rounded-full uppercase tracking-wide"><Lock className="h-2.5 w-2.5" /> AI unlocks with a plan</button>}
          </div>
          <div className="bg-white rounded-2xl p-4">
            <DealAnalysisPanel dealId={deal.id} locked={!paid} />
          </div>
        </div>

        {/* deal detail footer */}
        <div className="mt-7 pt-5 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-4 pb-4">
          {[['Sector', deal.sector ?? '-'], ['Asking price', deal.asking_price ? '£' + Number(deal.asking_price).toLocaleString() : '-'], ['Source', deal.source === 'deal_flow' ? 'Member deal flow' : deal.source ?? 'manual'], ['Added', new Date(deal.created_at).toLocaleDateString('en-GB')]].map(([k, v]) => (
            <div key={k as string}><div className="text-white/35 text-[10px] font-bold uppercase tracking-wide">{k}</div><div className="text-[#FFD700] text-[14px] font-semibold mt-0.5">{v}</div></div>
          ))}
        </div>
      </div>
    </div>
  );
}
