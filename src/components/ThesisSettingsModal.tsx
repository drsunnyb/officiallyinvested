import { useEffect, useState } from 'react';
import { Loader2, X, Plus, Trash2 } from 'lucide-react';
import { getOrgSettings, setOrgSettings } from '../lib/acq';

// The firm's thesis / buy box. The analyst scores fit against this; deals outside
// it aren't auto-killed - they're flagged with how far out, and Explore relaxes it.
export default function ThesisSettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => { (async () => {
    try { const r = await getOrgSettings(); setS(r.settings || {}); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  })(); }, []);

  const input = 'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 focus:border-[#FFD700]/60 outline-none';
  const lbl = 'text-white/55 text-[11px] uppercase tracking-wide mb-1 block';
  const bb = s?.buy_box ?? {}; const biz = bb.business ?? {}; const prop = bb.property ?? {}; const tg = s?.targets ?? {};
  const setPath = (fn: (d: any) => void) => { const d = JSON.parse(JSON.stringify(s ?? {})); fn(d); setS(d); setSaved(false); };
  const mandates: any[] = s?.mandates ?? [];

  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings(s); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-bold text-[#FFD700]">Investment thesis &amp; buy box</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {loading ? <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : (
          <div className="flex flex-col gap-4">
            <div>
              <span className={lbl}>Trading business - minimums</span>
              <div className="grid grid-cols-2 gap-2.5">
                <input className={input} placeholder="Min revenue £" inputMode="numeric" value={biz.min_revenue ?? ''} onChange={(e) => setPath((d) => { d.buy_box = d.buy_box || {}; d.buy_box.business = { ...(d.buy_box.business || {}), min_revenue: Number(e.target.value) || null }; })} />
                <input className={input} placeholder="Min net profit £" inputMode="numeric" value={biz.min_net_profit ?? ''} onChange={(e) => setPath((d) => { d.buy_box = d.buy_box || {}; d.buy_box.business = { ...(d.buy_box.business || {}), min_net_profit: Number(e.target.value) || null }; })} />
              </div>
            </div>
            <div>
              <span className={lbl}>Property - minimums</span>
              <div className="grid grid-cols-2 gap-2.5 items-center">
                <input className={input} placeholder="Min value £" inputMode="numeric" value={prop.min_value ?? ''} onChange={(e) => setPath((d) => { d.buy_box = d.buy_box || {}; d.buy_box.property = { ...(d.buy_box.property || {}), min_value: Number(e.target.value) || null }; })} />
                <label className="flex items-center gap-2 text-xs text-white/80"><input type="checkbox" className="h-4 w-4 accent-[#FFD700]" checked={!!prop.require_spv} onChange={(e) => setPath((d) => { d.buy_box = d.buy_box || {}; d.buy_box.property = { ...(d.buy_box.property || {}), require_spv: e.target.checked }; })} /> Require SPV / share purchase</label>
              </div>
            </div>
            <div><span className={lbl}>Target sectors</span><input className={input} placeholder="e.g. care, dental, trade, self-storage" value={s.sectors ?? ''} onChange={(e) => setPath((d) => { d.sectors = e.target.value; })} /></div>
            <div><span className={lbl}>Geography</span><input className={input} placeholder="e.g. within 2 hours of London; UK-wide" value={s.geography ?? ''} onChange={(e) => setPath((d) => { d.geography = e.target.value; })} /></div>
            <div>
              <span className={lbl}>Return targets</span>
              <div className="grid grid-cols-2 gap-2.5">
                <input className={input} placeholder="Min DSCR ×" inputMode="decimal" value={tg.min_dscr ?? ''} onChange={(e) => setPath((d) => { d.targets = { ...(d.targets || {}), min_dscr: Number(e.target.value) || null }; })} />
                <input className={input} placeholder="Target cash-on-cash %" inputMode="numeric" value={tg.target_coc ?? ''} onChange={(e) => setPath((d) => { d.targets = { ...(d.targets || {}), target_coc: Number(e.target.value) || null }; })} />
              </div>
            </div>
            <div><span className={lbl}>Thesis / what you're looking for</span><textarea className={input} rows={3} placeholder="Boring, essential, recession-resistant businesses with succession gaps…" value={s.thesis ?? ''} onChange={(e) => setPath((d) => { d.thesis = e.target.value; })} /></div>
            <div><span className={lbl}>Exclusions / walk-away rules</span><textarea className={input} rows={2} placeholder="No single customer >30%; no owner unwilling to hand over…" value={s.exclusions ?? ''} onChange={(e) => setPath((d) => { d.exclusions = e.target.value; })} /></div>
            <label className="flex items-center gap-2 text-xs text-white/80"><input type="checkbox" className="h-4 w-4 accent-[#FFD700]" checked={!!s.explore_default} onChange={(e) => setPath((d) => { d.explore_default = e.target.checked; })} /> Explore mode by default (surface deals outside the box)</label>

            <div>
              <div className="flex items-center justify-between mb-1"><span className={lbl}>Additional mandates</span>
                <button onClick={() => setPath((d) => { d.mandates = [...(d.mandates || []), { name: '', criteria: '' }]; })} className="text-[#FFD700] text-[11px] inline-flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
              </div>
              {mandates.map((m, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <input className={input + ' flex-[0_0_38%]'} placeholder="Name" value={m.name ?? ''} onChange={(e) => setPath((d) => { d.mandates[i].name = e.target.value; })} />
                  <input className={input} placeholder="Criteria" value={m.criteria ?? ''} onChange={(e) => setPath((d) => { d.mandates[i].criteria = e.target.value; })} />
                  <button onClick={() => setPath((d) => { d.mandates.splice(i, 1); })} className="text-white/40 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>

            {err && <p className="text-red-300 text-xs">{err}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} {saved ? 'Saved ✓' : 'Save thesis'}
              </button>
              <button onClick={onClose} className="px-4 py-2.5 rounded-full text-sm font-semibold text-white/75 border border-white/25">Close</button>
            </div>
            <p className="text-white/35 text-[11px]">The analyst scores each deal's fit against this. Deals outside the box aren't auto-rejected - they're flagged with how far out, so you can still pursue opportunistically.</p>
          </div>
        )}
      </div>
    </div>
  );
}
