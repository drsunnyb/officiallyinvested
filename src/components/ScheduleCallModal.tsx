import { useState } from 'react';
import { Loader2, X, Video, Plus, Check } from 'lucide-react';
import { addDealContact } from '../lib/acq';

// Who belongs on a call at each stage. The agent suggests these from the deal's
// people and lets you add anyone missing while setting the call up.
const STAGE_CALL_ROLES: Record<string, string[]> = {
  new: ['vendor', 'agent'], reviewing: ['vendor', 'agent'], shortlisted: ['vendor', 'agent'],
  discovery_call: ['vendor', 'agent'], structuring: ['vendor', 'agent'], hots: ['vendor', 'solicitor'],
  dd_financial: ['accountant', 'vendor'], dd_commercial: ['vendor'], dd_legal: ['solicitor'],
  funding: ['lender'], pre_completion: ['solicitor', 'lender'], takeover: ['vendor'], completed: ['vendor'],
};
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
function defaultWhen() { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); const tz = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - tz).toISOString().slice(0, 16); }

export default function ScheduleCallModal({ dealId, dealName, status, dealContacts, onClose, onChanged }: { dealId: string; dealName: string; status?: string; dealContacts: any[]; onClose: () => void; onChanged: () => void }) {
  const roles = (status && STAGE_CALL_ROLES[status]) || ['vendor'];
  const [people, setPeople] = useState<any[]>(dealContacts || []);
  const [selected, setSelected] = useState<Set<string>>(new Set((dealContacts || []).filter((c) => roles.includes(c.role) && c.email).map((c) => c.email)));
  const [when, setWhen] = useState(defaultWhen());
  const [mins, setMins] = useState(45);
  const [addingRole, setAddingRole] = useState<string | null>(null);
  const [nf, setNf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const input = 'bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60';
  const toggle = (email: string) => setSelected((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });

  const addMissing = async (role: string) => {
    if (!nf.name?.trim()) return; setBusy(true); setErr('');
    try {
      const r: any = await addDealContact(dealId, { name: nf.name, role, email: nf.email });
      const c = r.contact || { id: Math.random(), name: nf.name, role, email: nf.email };
      setPeople((p) => [...p, c]); if (c.email) setSelected((s) => new Set(s).add(c.email));
      setNf({}); setAddingRole(null); onChanged();
    } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };

  const createInvite = () => {
    const start = new Date(when); const end = new Date(start.getTime() + mins * 60000);
    const emails = [...selected].filter(Boolean);
    const title = `${dealName} call`;
    const details = `Call regarding the potential acquisition of ${dealName}. Add Google Meet video conferencing before saving.`;
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(details)}&add=${encodeURIComponent(emails.join(','))}`;
    try { (window as any).openLink ? (window as any).openLink(url) : window.open(url, '_blank'); } catch { window.open(url, '_blank'); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-serif font-bold text-[#FFD700] flex items-center gap-2"><Video className="h-4 w-4" /> Schedule a call</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-white/45 text-[12px] mb-4">For this stage you'll usually want: <span className="text-white/75">{roles.join(', ')}</span>. Pick who joins; add anyone missing.</p>

        <div className="flex flex-col gap-2 mb-4">
          {roles.map((role) => {
            const matches = people.filter((c) => c.role === role);
            return (
              <div key={role}>
                {matches.length > 0 ? matches.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 bg-white/5 rounded-lg p-2 mb-1 cursor-pointer">
                    <input type="checkbox" className="h-3.5 w-3.5 accent-[#FFD700]" checked={c.email ? selected.has(c.email) : false} disabled={!c.email} onChange={() => c.email && toggle(c.email)} />
                    <span className="text-[12px] text-white flex-1 truncate">{c.name}{c.email ? '' : ' (no email)'}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#FFD700]/15 text-[#FFD700]">{role}</span>
                  </label>
                )) : (
                  addingRole === role ? (
                    <div className="flex gap-1.5 mb-1">
                      <input autoFocus className={input + ' flex-1 min-w-0'} placeholder={`${role} name`} value={nf.name ?? ''} onChange={(e) => setNf((p) => ({ ...p, name: e.target.value }))} />
                      <input className={input + ' flex-1 min-w-0'} placeholder="Email" value={nf.email ?? ''} onChange={(e) => setNf((p) => ({ ...p, email: e.target.value }))} />
                      <button onClick={() => addMissing(role)} disabled={busy} className="bg-[#FFD700] text-[#0A2540] px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">{busy ? '…' : 'Add'}</button>
                    </div>
                  ) : (
                    <button onClick={() => { setAddingRole(role); setNf({}); }} className="w-full text-left flex items-center gap-2 border border-dashed border-white/20 rounded-lg p-2 mb-1 text-[12px] text-white/55 hover:text-white hover:border-white/40">
                      <Plus className="h-3.5 w-3.5" /> Add the {role} for this deal
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div><span className="text-white/55 text-[11px] block mb-1">When</span><input type="datetime-local" className={input + ' w-full'} value={when} onChange={(e) => setWhen(e.target.value)} /></div>
          <div><span className="text-white/55 text-[11px] block mb-1">Length</span><select className={input + ' w-full'} value={mins} onChange={(e) => setMins(Number(e.target.value))}>{[30, 45, 60].map((m) => <option key={m} value={m} className="bg-[#0E3257]">{m} min</option>)}</select></div>
        </div>

        {err && <p className="text-red-300 text-xs mb-2">{err}</p>}
        <button onClick={createInvite} disabled={selected.size === 0} className="w-full inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-4 py-2.5 rounded-full text-sm font-semibold hover:bg-opacity-90 disabled:opacity-50">
          <Video className="h-4 w-4" /> Create Google Meet invite ({selected.size})
        </button>
        <p className="text-white/35 text-[11px] mt-2">Opens Google Calendar with the right guests pre-added. Toggle Google Meet and save to send the invite.</p>
      </div>
    </div>
  );
}
