import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createDeal } from '../lib/acq';

// Manual / paste-a-link intake. Creates an email-safe origination deal that
// lands on the kanban and flows through screening + the Deal Agent.
export default function AddDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: (submissionId: string) => void }) {
  const [type, setType] = useState<'business' | 'property'>('business');
  const [f, setF] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string) => (e: any) => setF((p) => ({ ...p, [k]: e.target.value }));
  const input = 'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 focus:border-[#FFD700]/60 outline-none';

  const submit = async () => {
    if (!f.name?.trim()) { setErr('Give the deal a name.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await createDeal({
        type, name: f.name, sector: f.sector, asking_price: f.asking_price,
        revenue: f.revenue, net_profit: f.net_profit, portfolio_value: f.portfolio_value,
        url: f.url, notes: f.notes,
      });
      onCreated(r.submission_id);
    } catch (e: any) { setErr(e.message || String(e)); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[#0E3257] rounded-2xl p-6 border border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-bold text-[#FFD700]">Add a deal</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          {(['business', 'property'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={'px-4 py-1.5 rounded-full text-xs font-semibold capitalize border ' + (type === t ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/70 border-white/25')}>{t}</button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          <input className={input} placeholder={type === 'business' ? 'Business name' : 'Asset / SPV name'} value={f.name ?? ''} onChange={set('name')} />
          <input className={input} placeholder="Sector (e.g. domiciliary care, plumbing)" value={f.sector ?? ''} onChange={set('sector')} />
          {type === 'business' ? (
            <div className="grid grid-cols-2 gap-2.5">
              <input className={input} placeholder="Revenue £" inputMode="numeric" value={f.revenue ?? ''} onChange={set('revenue')} />
              <input className={input} placeholder="Net profit £" inputMode="numeric" value={f.net_profit ?? ''} onChange={set('net_profit')} />
            </div>
          ) : (
            <input className={input} placeholder="Portfolio / GDV value £" inputMode="numeric" value={f.portfolio_value ?? ''} onChange={set('portfolio_value')} />
          )}
          <input className={input} placeholder="Asking price £" inputMode="numeric" value={f.asking_price ?? ''} onChange={set('asking_price')} />
          <input className={input} placeholder="Listing / source link (optional)" value={f.url ?? ''} onChange={set('url')} />
          <textarea className={input} placeholder="Notes (optional)" rows={2} value={f.notes ?? ''} onChange={set('notes')} />
        </div>

        {err && <p className="text-red-300 text-xs mt-3">{err}</p>}

        <div className="flex gap-2 mt-5">
          <button onClick={submit} disabled={busy} className="flex-1 inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Add deal
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-full text-sm font-semibold text-white/75 border border-white/25">Cancel</button>
        </div>
        <p className="text-white/35 text-[11px] mt-3">Added as an internal origination — no email is sent to any seller. Upload accounts in the deal to get verified figures.</p>
      </div>
    </div>
  );
}
