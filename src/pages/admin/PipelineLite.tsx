// =============================================================================
// PipelineLite - the per-workspace pipeline for self-serve users.
// Free forever: add deals, move them through stages, get the deterministic
// Acquisition Score. The AI analyst layer (full analysis, committee, memo,
// drafts) is where the paywall sits.
// =============================================================================
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Plus, X, Sparkles, ArrowLeft, Lock, HelpCircle } from 'lucide-react';
import { liteDeals, liteDealCreate, liteDealUpdate, onboardScore, onboardStatus, runAnalyze, runCommittee, runMemo } from '../../lib/acq';
import Paywall, { CreditsTopUp, ensureCredits } from '../../components/Paywall';
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
          </div>
        </div>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{err}</div>}
        {!deals ? <div className="text-white/50 py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {BOARD_STAGES.map((st) => (
              <div key={st} className="bg-white/[0.05] border border-white/10 rounded-xl p-2.5 min-h-[180px]">
                <div className="text-white/60 text-[10px] font-bold uppercase tracking-wider px-1 mb-2">{STAGE_LABEL[st]} · {deals.filter((d) => d.status === st).length}</div>
                {deals.filter((d) => d.status === st).map((d) => (
                  <button key={d.id} onClick={() => setOpenId(d.id)} className="w-full text-left bg-white rounded-lg p-3 mb-2 hover:-translate-y-0.5 transition-transform">
                    <div className="text-[13px] font-semibold text-gray-900 leading-snug">{d.name}</div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                      <span className="truncate">{d.sector ?? ''}</span>
                      {d.asking_price && <span className="font-semibold text-gray-600">£{Number(d.asking_price).toLocaleString()}</span>}
                    </div>
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
  const [aiBusy, setAiBusy] = useState('');
  const score = async () => {
    setBusy(true);
    try {
      await onboardScore({ oldest_director_age: Number(si.oldest_director_age) || 0, revenue: Number(si.revenue) || 0, ebitda: Number(si.ebitda) || 0, incorporated_on: si.incorporated_on || null, accounts_current: si.accounts_current, seller_engaged: si.seller_engaged, asset_backing: si.asset_backing }, deal.id);
      onChanged();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const ai = async (kind: string) => {
    if (!paid) { onPaywall('The AI analyst reads the accounts, stress-tests the deal and writes your documents'); return; }
    if (!(await ensureCredits('ai', 1, kind + ' ' + deal.id.slice(0, 8)))) return;
    setAiBusy(kind);
    try {
      if (kind === 'analysis') await runAnalyze(deal.id);
      if (kind === 'committee') await runCommittee(deal.id);
      if (kind === 'memo') await runMemo(deal.id);
      setErr('');
      alert('Running - results appear on the deal shortly.');
    } catch (e: any) { setErr(e.message || String(e)); }
    setAiBusy('');
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose}>
      <div className="w-full bg-white h-full overflow-y-auto p-6 max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-serif font-bold text-xl text-gray-900">{deal.name}</div>
            <div className="text-[12px] text-gray-500">{deal.sector ?? '-'}{deal.asking_price ? ` · asking £${Number(deal.asking_price).toLocaleString()}` : ''}</div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1.5">Stage</div>
          <div className="flex flex-wrap gap-1.5">
            {['sourced', 'contacted', 'analysing', 'offer', 'heads_of_terms', 'diligence', 'completed', 'passed'].map((st) => (
              <button key={st} onClick={async () => { await liteDealUpdate(deal.id, { status: st }).catch((e: any) => setErr(e.message)); onChanged(); }}
                className={'text-[11px] px-2.5 py-1 rounded-full border ' + (deal.status === st ? 'bg-[#0A2540] text-white border-[#0A2540] font-bold' : 'border-gray-300 text-gray-600 hover:border-[#0A2540]/50')}>{STAGE_LABEL[st]}</button>
            ))}
          </div>
        </div>

        {/* free acquisition score */}
        <div className="mt-6 bg-gray-50 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#0A2540]" /> Acquisition Score <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-full">FREE</span></div>
            {snap.acquisition_score != null && <span className="font-serif font-bold text-2xl text-gray-900">{snap.acquisition_score}<span className="text-[12px] text-gray-400 font-sans"> · {snap.score_band}</span></span>}
          </div>
          {snap.score_breakdown && (
            <div className="mt-2">{snap.score_breakdown.map((b: any, i: number) => (
              <div key={i} className="flex justify-between text-[12px] text-gray-600 py-0.5"><span>{b.part}</span><span className="font-semibold">{b.pts}/{b.max}</span></div>
            ))}</div>
          )}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <input className={input} placeholder="Oldest director age" value={si.oldest_director_age} onChange={(e) => setSi({ ...si, oldest_director_age: e.target.value })} />
            <input className={input} placeholder="Incorporated YYYY-MM-DD" value={si.incorporated_on} onChange={(e) => setSi({ ...si, incorporated_on: e.target.value })} />
            <input className={input} placeholder="Revenue £" value={si.revenue} onChange={(e) => setSi({ ...si, revenue: e.target.value })} />
            <input className={input} placeholder="Adj EBITDA £" value={si.ebitda} onChange={(e) => setSi({ ...si, ebitda: e.target.value })} />
            <select className={input} value={si.asset_backing} onChange={(e) => setSi({ ...si, asset_backing: e.target.value })}>
              <option value="none">No asset backing</option><option value="partial">Some property/plant</option><option value="full">Freehold / asset-rich</option>
            </select>
            <div className="flex flex-col gap-1 text-[12px] text-gray-600 justify-center">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.accounts_current} onChange={(e) => setSi({ ...si, accounts_current: e.target.checked })} /> Accounts current</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={si.seller_engaged} onChange={(e) => setSi({ ...si, seller_engaged: e.target.checked })} /> Seller engaged</label>
            </div>
          </div>
          <button className={btnGold + ' w-full mt-3 justify-center'} disabled={busy} onClick={score}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : snap.acquisition_score != null ? 'Re-score' : 'Get my Acquisition Score'}</button>
        </div>

        {/* the full deal cockpit for everyone - AI triggers gate on free */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Deal cockpit</div>
            {!paid && <button onClick={() => onPaywall('The cockpit is yours. The AI analyst inside it joins on any paid plan')} className="inline-flex items-center gap-1 text-[10px] font-bold bg-[#FFD700] text-[#0A2540] px-2 py-0.5 rounded-full uppercase tracking-wide"><Lock className="h-2.5 w-2.5" /> AI unlocks with a plan</button>}
          </div>
          <DealAnalysisPanel dealId={deal.id} locked={!paid} />
        </div>

        {false && (
        <div className="mt-5 rounded-2xl border-2 p-4" style={{ borderColor: paid ? '#e5e7eb' : '#FFD700' }}>
          <div className="text-[13px] font-bold text-gray-900 flex items-center gap-1.5">
            {!paid && <Lock className="h-4 w-4 text-[#0A2540]" />} AI Analyst {!paid && <span className="text-[10px] font-bold text-[#0A2540] bg-[#FFD700] px-1.5 py-0.5 rounded-full">UPGRADE</span>}
          </div>
          <p className="text-[12px] text-gray-500 mt-1">Reads accounts, models the funding stack, stress-tests price, runs a deal committee, and writes the memo and every letter - in your voice.</p>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[['analysis', 'Full analysis'], ['committee', 'Deal committee'], ['memo', 'Investment memo']].map(([k, l]) => (
              <button key={k} onClick={() => ai(k)} disabled={!!aiBusy}
                className={'rounded-xl py-2.5 text-[12px] font-bold transition ' + (paid ? 'bg-[#0A2540] text-white hover:bg-[#0E3257]' : 'bg-[#FFD700] text-[#0A2540] hover:brightness-95')}>
                {aiBusy === k ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : l}
              </button>
            ))}
          </div>
          {!paid && <div className="text-[11px] text-gray-400 mt-2 flex items-center gap-1"><HelpCircle className="h-3 w-3" /> Your score above stays free. These unlock with any paid plan.</div>}
        </div>
        )}
      </div>
    </div>
  );
}
