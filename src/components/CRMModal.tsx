import { useEffect, useState } from 'react';
import { Loader2, X, Plus, Check } from 'lucide-react';
import { crmList, crmAddContact, crmAddTask, crmCompleteTask } from '../lib/acq';

const ROLE_TINT: Record<string, string> = {
  vendor: 'bg-blue-400/18 text-blue-200', owner: 'bg-blue-400/18 text-blue-200',
  agent: 'bg-purple-400/18 text-purple-200', broker: 'bg-pink-400/18 text-pink-200', lender: 'bg-pink-400/18 text-pink-200',
  accountant: 'bg-emerald-400/18 text-emerald-200', solicitor: 'bg-amber-400/18 text-amber-100', investor: 'bg-white/15 text-white/70',
};
function due(d: string | null): { t: string; c: string } {
  if (!d) return { t: 'no date', c: 'bg-white/10 text-white/55' };
  const days = Math.floor((new Date(d).getTime() - Date.now()) / 864e5);
  if (days < 0) return { t: `${-days}d overdue`, c: 'bg-red-500/25 text-red-200' };
  if (days === 0) return { t: 'due today', c: 'bg-amber-500/25 text-amber-100' };
  return { t: `in ${days}d`, c: 'bg-white/10 text-white/65' };
}
function initials(n: string) { return (n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join(''); }
function fmtSince(ts: string) { const s = (Date.now() - new Date(ts).getTime()) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + 'm'; if (s < 86400) return Math.round(s / 3600) + 'h'; return Math.round(s / 86400) + 'd'; }

export default function CRMModal({ onClose }: { onClose: () => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [tf, setTf] = useState<Record<string, string>>({});
  const [cf, setCf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [cat, setCat] = useState('all');

  const load = async () => {
    setLoading(true); setErr('');
    try { const r = await crmList(); setContacts(r.contacts || []); setTasks(r.tasks || []); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const input = 'bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60';
  const addTask = async () => { if (!tf.title?.trim()) return; setBusy('task'); try { await crmAddTask({ title: tf.title, due_date: tf.due || null }); setTf({}); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const addContact = async () => { if (!cf.name?.trim()) return; setBusy('contact'); try { await crmAddContact({ name: cf.name, role: cf.role || 'other', company: cf.company, email: cf.email }); setCf({}); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const done = async (id: string) => { await crmCompleteTask(id); setTasks((t) => t.filter((x) => x.id !== id)); };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-2xl bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-serif font-bold text-[#FFD700]">CRM — contacts &amp; follow-ups</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {loading ? <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : (
          <>
            {err && <p className="text-red-300 text-xs mb-2">{err}</p>}

            <div className="text-white/50 text-[11px] uppercase tracking-wide mb-2">Needs you · {tasks.length} open</div>
            <div className="flex flex-col gap-1.5 mb-3">
              {tasks.map((t) => { const d = due(t.due_date); return (
                <div key={t.id} className="flex items-center gap-2.5 bg-white/5 rounded-lg p-2.5">
                  <button onClick={() => done(t.id)} className="text-white/40 hover:text-emerald-300" title="Mark done"><Check className="h-4 w-4" /></button>
                  <div className="flex-1 min-w-0"><div className="text-[13px] text-white truncate">{t.title}</div><div className="text-[11px] text-white/50 truncate">{[t.deal_name, t.contact_name].filter(Boolean).join(' · ') || '—'}</div></div>
                  <span className={'text-[10px] font-semibold px-2 py-0.5 rounded-full ' + d.c}>{d.t}</span>
                </div>
              ); })}
              {tasks.length === 0 && <p className="text-white/40 text-[12px]">Nothing outstanding.</p>}
            </div>
            <div className="flex gap-1.5 mb-5">
              <input className={input + ' flex-1 min-w-0'} placeholder="New follow-up…" value={tf.title ?? ''} onChange={(e) => setTf((p) => ({ ...p, title: e.target.value }))} />
              <input className={input} type="date" value={tf.due ?? ''} onChange={(e) => setTf((p) => ({ ...p, due: e.target.value }))} />
              <button onClick={addTask} disabled={busy === 'task'} className="bg-[#FFD700] text-[#0A2540] px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-50">Add</button>
            </div>

            {(() => {
              const counts: Record<string, number> = {};
              contacts.forEach((c) => { const k = c.role || 'other'; counts[k] = (counts[k] || 0) + 1; });
              const cats = Object.entries(counts).sort((a, b) => b[1] - a[1]);
              const shown = cat === 'all' ? contacts : contacts.filter((c) => (c.role || 'other') === cat);
              return (
                <>
                  <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                    <span className="text-white/50 text-[11px] uppercase tracking-wide mr-1">Contacts · {contacts.length}</span>
                    <button onClick={() => setCat('all')} className={'text-[10px] px-2.5 py-1 rounded-full ' + (cat === 'all' ? 'bg-[#FFD700] text-[#0A2540] font-semibold' : 'bg-white/8 text-white/60')}>all {contacts.length}</button>
                    {cats.map(([k, n]) => <button key={k} onClick={() => setCat(k)} className={'text-[10px] px-2.5 py-1 rounded-full capitalize ' + (cat === k ? 'bg-[#FFD700] text-[#0A2540] font-semibold' : 'bg-white/8 text-white/60')}>{k} {n}</button>)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {shown.map((c) => (
                      <div key={c.id} className="bg-[#0A2540] border border-white/10 rounded-xl p-2.5">
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <div className="w-8 h-8 rounded-full bg-[#FFD700]/15 text-[#FFD700] flex items-center justify-center text-[11px] font-semibold shrink-0">{initials(c.name)}</div>
                          <div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-white truncate">{c.name}</div><div className="text-[10px] text-white/50 truncate">{c.company || c.email || ''}</div></div>
                          {c.role && <span className={'text-[9px] font-semibold px-2 py-0.5 rounded-full shrink-0 ' + (ROLE_TINT[c.role] || 'bg-white/12 text-white/70')}>{c.role}</span>}
                        </div>
                        <div className="text-[11px] text-white/55 border-t border-white/8 pt-1.5 space-y-0.5">
                          <div className="truncate">{Number(c.deal_count) > 0 ? `On ${c.deal_count} deal${Number(c.deal_count) > 1 ? 's' : ''}` : 'Directory'}{Array.isArray(c.deals) && c.deals.length ? ': ' + c.deals.slice(0, 2).map((d: any) => d.name).join(', ') : ''}</div>
                          <div className="text-white/45">{c.last_interaction ? `Last ${c.last_direction === 'in' ? 'heard from them' : (c.last_kind || 'contact')} ${fmtSince(c.last_interaction)} ago` : 'No contact logged yet'}{Number(c.interaction_count) > 0 ? ` · ${c.interaction_count} touch${Number(c.interaction_count) > 1 ? 'es' : ''}` : ''}</div>
                          {c.next_task && <div className="text-[#FCD34D] truncate">Next: {c.next_task}</div>}
                        </div>
                      </div>
                    ))}
                    {shown.length === 0 && <p className="text-white/40 text-[12px] col-span-2">No contacts in this category.</p>}
                  </div>
                </>
              );
            })()}
            <div className="flex gap-1.5">
              <input className={input + ' flex-1 min-w-0'} placeholder="Name" value={cf.name ?? ''} onChange={(e) => setCf((p) => ({ ...p, name: e.target.value }))} />
              <select className={input} value={cf.role ?? 'broker'} onChange={(e) => setCf((p) => ({ ...p, role: e.target.value }))}>{['vendor', 'agent', 'broker', 'accountant', 'solicitor', 'lender', 'investor', 'other'].map((r) => <option key={r} value={r} className="bg-[#0E3257]">{r}</option>)}</select>
              <input className={input + ' flex-1 min-w-0'} placeholder="Email" value={cf.email ?? ''} onChange={(e) => setCf((p) => ({ ...p, email: e.target.value }))} />
              <button onClick={addContact} disabled={busy === 'contact'} className="bg-white/10 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-white/20 disabled:opacity-50 inline-flex items-center gap-1"><Plus className="h-3 w-3" />Add</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
