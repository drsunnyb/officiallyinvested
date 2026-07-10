// =============================================================================
// CRM - the full-page relationship system. One directory for everyone around
// your deals: search it, open a contact, read the whole story (letters, calls,
// emails, meetings, completed tasks) on one timeline, set meetings and log
// outcomes. Served by acq-crm (org-scoped), so every workspace sees only its
// own people. Identical for the host admin and every user (feature parity).
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { Loader2, X, Check, LogOut, RefreshCw, Search, Calendar, Phone, Mail, FileText, Users, Pencil, Paperclip, Sparkles } from 'lucide-react';
import { crmList, crmAddContact, crmContactDetail, crmUpdateContact, crmAddTask, crmCompleteTask, meetingCreate, meetingUpdate, meetingCancel, meetingsList, crmCommThread, crmReply, crmAiDraftReply, crmApproveReply, crmAiTasks, gmailStatus, gmailStart } from '../../lib/acq';
import { supabase } from '../../lib/supabase';

const NAVY = '#0A2540';
const ROLE_TINT: Record<string, string> = {
  vendor: 'bg-blue-400/20 text-blue-200', owner: 'bg-blue-400/20 text-blue-200',
  agent: 'bg-purple-400/20 text-purple-200', broker: 'bg-pink-400/20 text-pink-200', lender: 'bg-pink-400/20 text-pink-200',
  accountant: 'bg-emerald-400/20 text-emerald-200', solicitor: 'bg-amber-400/20 text-amber-100', investor: 'bg-white/15 text-white/70',
};
const ROLES = ['all', 'vendor', 'broker', 'agent', 'accountant', 'solicitor', 'lender', 'other'];
const initials = (n: string) => (n || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
const since = (ts: string | null) => { if (!ts) return 'never'; const d = Math.floor((Date.now() - new Date(ts).getTime()) / 864e5); return d === 0 ? 'today' : d + 'd ago'; };
const fmtDT = (ts: string) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const TL_ICON: Record<string, any> = { letter: Mail, email: Mail, call: Phone, meeting: Calendar, task: Check, note: FileText };
const input = 'bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-[#FFD700]/60';
const pill = (on: boolean) => 'px-3 py-1 rounded-full text-[12px] font-semibold border ' + (on ? 'bg-white text-[#0A2540] border-white' : 'bg-white/5 text-white/70 border-white/15');

export default function CRMPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [upcoming, setUpcoming] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [google, setGoogle] = useState<{ configured: boolean; accounts: any[] } | null>(null);
  const [aiBusy, setAiBusy] = useState('');
  const [cf, setCf] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const timer = useRef<any>(null);

  const load = async (query?: string) => {
    setLoading(true);
    try { const r = await crmList(query ?? q); setContacts(r.contacts || []); setTasks((r.tasks || []).filter((t: any) => t.status === 'open')); } catch (e: any) { setErr(e.message || String(e)); }
    setLoading(false);
  };
  useEffect(() => { load(''); meetingsList().then((r) => setUpcoming((r.meetings || []).filter((m: any) => m.status === 'scheduled' && new Date(m.starts_at) > new Date()))).catch(() => {}); gmailStatus().then((r: any) => setGoogle({ configured: !!r.configured, accounts: r.accounts || [] })).catch(() => {}); }, []);
  const connectGoogle = async () => { try { const r = await gmailStart(); if (r.url) window.open(r.url, '_blank'); else if (r.error) setErr(r.error); } catch (e: any) { setErr(e.message || String(e)); } };
  const aiPlan = async () => { setAiBusy('plan'); try { const r = await crmAiTasks(); if (r.created === 0) setErr('Nothing new to suggest. Your open tasks already cover the priorities.'); await load(); } catch (e: any) { setErr(e.message || String(e)); } setAiBusy(''); };
  const approveTask = async (t: any) => { setAiBusy(t.id); try { await crmApproveReply(t.id); await load(); } catch (e: any) { setErr(e.message || String(e)); } setAiBusy(''); };
  const onSearch = (v: string) => { setQ(v); clearTimeout(timer.current); timer.current = setTimeout(() => load(v), 350); };

  const addContact = async () => {
    if (!cf.name?.trim()) return;
    setAdding(true);
    try { const r = await crmAddContact({ name: cf.name, role: cf.role || 'other', email: cf.email || null, phone: cf.phone || null, company: cf.company || null }); setCf({}); await load(); setSel(r.contact?.id ?? null); }
    catch (e: any) { setErr(e.message || String(e)); }
    setAdding(false);
  };

  const shown = contacts.filter((c) => role === 'all' || (c.role ?? 'other') === role);

  return (
    <div className="min-h-screen" style={{ background: NAVY }}>
      <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#FFD700] rotate-45" style={{ clipPath: 'polygon(50% 0%,100% 50%,50% 100%,0% 50%)' }}></div>
          <div>
            <h1 className="text-xl font-serif font-bold text-[#FFD700]">CRM</h1>
            <p className="text-white/40 text-xs">Everyone around your deals, with the whole story on one timeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {google && (google.accounts.length > 0
            ? <span className="text-emerald-300 border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">✓ Google connected</span>
            : <button onClick={connectGoogle} className="text-[#FFD700] border border-[#FFD700]/40 px-3 py-1.5 rounded-full text-sm font-semibold mr-1 hover:bg-[#FFD700]/10">Connect Google</button>)}
          <a href="/admin/pipeline" className="bg-white/10 text-[#FFD700] border border-[#FFD700]/40 px-3 py-1.5 rounded-full text-sm font-semibold mr-1 hover:bg-white/15">Pipeline</a>
          <a href="/admin/origination" className="text-white/70 hover:text-white border border-white/20 px-3 py-1.5 rounded-full text-sm font-semibold mr-1">Origination</a>
          <button onClick={() => load()} className="text-white/60 hover:text-white p-2" title="Refresh"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={async () => { await supabase?.auth.signOut(); window.location.href = '/signup'; }} className="text-white/60 hover:text-white p-2" title="Sign out"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4 items-start">
        {/* directory */}
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
          {err && <div className="bg-red-500/15 border border-red-400/30 text-red-200 text-[12px] rounded-lg px-3 py-2 mb-3">{err}</div>}
          <div className="relative mb-3">
            <Search className="h-4 w-4 text-white/30 absolute left-3 top-2.5" />
            <input className={input + ' w-full !pl-9'} placeholder="Search name, company, email, phone, notes" value={q} onChange={(e) => onSearch(e.target.value)} />
          </div>
          <div className="flex gap-1.5 flex-wrap mb-3">
            {ROLES.map((r) => <button key={r} onClick={() => setRole(r)} className={pill(role === r)}>{r === 'all' ? `All ${contacts.length}` : r}</button>)}
          </div>
          {upcoming.length > 0 && (
            <div className="bg-[#FFD700]/10 border border-[#FFD700]/30 rounded-lg px-3 py-2 mb-3 text-[12px] text-[#FFD700]">
              <Calendar className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />{upcoming.length} meeting{upcoming.length > 1 ? 's' : ''} coming up · next: {upcoming[0].title} · {fmtDT(upcoming[0].starts_at)}
            </div>
          )}
          {/* needs you: every open task, AI-suggested and agent-executable where it can be */}
          <div className="bg-white/[0.05] border border-white/10 rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-white text-[13px] font-bold">Needs you <span className="text-white/40 font-normal">· {tasks.length} open</span></div>
              <button onClick={aiPlan} disabled={aiBusy === 'plan'} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#FFD700] border border-[#FFD700]/40 rounded-full px-2.5 py-1 hover:bg-[#FFD700]/10 disabled:opacity-40"><Sparkles className="h-3 w-3" />{aiBusy === 'plan' ? 'Reading…' : 'AI: plan my moves'}</button>
            </div>
            {tasks.length === 0 && <div className="text-white/35 text-[12px]">Nothing outstanding. The AI watches your workspace and adds tasks here when something needs you.</div>}
            <div className="max-h-[26vh] overflow-y-auto">
              {tasks.slice(0, 12).map((t) => {
                const draft = t.meta?.action === 'approve_reply' ? t.meta?.draft : null;
                const openIt = openTask === t.id;
                return (
                  <div key={t.id} className="py-1.5 border-b border-white/[0.06] last:border-0">
                    <div className="flex items-start gap-2">
                      <button onClick={async () => { await crmCompleteTask(t.id); load(); }} className="mt-0.5 text-white/25 hover:text-emerald-400 shrink-0" title="Mark done"><Check className="h-3.5 w-3.5" /></button>
                      <div className="min-w-0 flex-1">
                        <div className="text-white/80 text-[12px] leading-snug">{t.title}{t.meta?.auto && <span className="ml-1 text-[8px] font-bold bg-[#FFD700]/20 text-[#FFD700] rounded-full px-1.5 py-px uppercase align-middle">AI</span>}</div>
                        <div className="text-white/30 text-[10.5px]">{[t.contact_name, t.due_date ? 'due ' + String(t.due_date).slice(0, 10) : null].filter(Boolean).join(' · ')}</div>
                        {draft && !openIt && <button onClick={() => setOpenTask(t.id)} className="mt-1 text-[10.5px] font-bold text-[#FFD700] border border-[#FFD700]/40 rounded-full px-2 py-0.5 hover:bg-[#FFD700]/10">The agent can send this. Review it →</button>}
                        {draft && openIt && (
                          <div className="mt-1.5 bg-white/[0.05] border border-[#FFD700]/30 rounded-lg p-2.5">
                            <div className="text-[10px] text-white/45 mb-1">To {draft.to} · {draft.subject}</div>
                            <div className="text-[11.5px] text-white/70 whitespace-pre-wrap max-h-32 overflow-y-auto">{draft.body}</div>
                            <div className="flex gap-1.5 mt-2">
                              <button onClick={() => approveTask(t)} disabled={aiBusy === t.id} className="bg-[#FFD700] text-[#0A2540] rounded-full text-[11px] font-bold px-3 py-1 disabled:opacity-40">{aiBusy === t.id ? 'Sending…' : 'Approve and send'}</button>
                              <button onClick={() => setOpenTask(null)} className="text-white/50 text-[11px] border border-white/20 rounded-full px-3 py-1">Not yet</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="max-h-[52vh] overflow-y-auto -mx-1 px-1">
            {loading ? <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin text-[#FFD700] mx-auto" /></div> :
              shown.length === 0 ? <div className="text-white/35 text-[13px] py-8 text-center">No one here yet. Add your first contact below, or they arrive automatically from replies and deals.</div> :
              shown.map((c) => (
                <button key={c.id} onClick={() => setSel(c.id)} className={'w-full text-left rounded-xl p-3 mb-1.5 border transition ' + (sel === c.id ? 'bg-[#0E3257] border-[#FFD700]/50' : 'bg-white/[0.03] border-white/10 hover:border-white/25')}>
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-full bg-white/10 text-white/80 text-[11px] font-bold flex items-center justify-center shrink-0">{initials(c.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white text-[13px] font-semibold truncate">{c.name}</div>
                      <div className="text-white/40 text-[11px] truncate">{c.company || c.email || 'no company logged'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={'text-[9px] font-bold px-1.5 py-0.5 rounded-full ' + (ROLE_TINT[c.role] ?? 'bg-white/10 text-white/55')}>{c.role ?? 'other'}</span>
                      <div className="text-white/30 text-[10px] mt-1">{since(c.last_interaction)}{Number(c.open_tasks) > 0 ? ` · ${c.open_tasks} open` : ''}</div>
                    </div>
                  </div>
                </button>
              ))}
          </div>
          <div className="border-t border-white/10 mt-3 pt-3 grid grid-cols-2 gap-2">
            <input className={input} placeholder="Name" value={cf.name ?? ''} onChange={(e) => setCf({ ...cf, name: e.target.value })} />
            <select className={input + ' [&>option]:text-gray-900'} value={cf.role ?? 'vendor'} onChange={(e) => setCf({ ...cf, role: e.target.value })}>
              {ROLES.filter((r) => r !== 'all').map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <input className={input} placeholder="Company" value={cf.company ?? ''} onChange={(e) => setCf({ ...cf, company: e.target.value })} />
            <input className={input} placeholder="Email" value={cf.email ?? ''} onChange={(e) => setCf({ ...cf, email: e.target.value })} />
            <input className={input} placeholder="Phone" value={cf.phone ?? ''} onChange={(e) => setCf({ ...cf, phone: e.target.value })} />
            <button onClick={addContact} disabled={adding || !cf.name?.trim()} className="bg-[#FFD700] text-[#0A2540] rounded-lg text-sm font-bold disabled:opacity-40">{adding ? '…' : '+ Add contact'}</button>
          </div>
        </div>

        {/* detail */}
        {sel ? <ContactDetail key={sel} contactId={sel} onChanged={() => load()} setErr={setErr} /> : (
          <div className="bg-white/[0.04] border border-white/10 rounded-xl p-14 text-center text-white/35">
            <Users className="h-8 w-8 mx-auto mb-3 text-white/20" />
            <div className="text-[14px]">Pick a contact to see their full story: every letter, call, email, meeting and task in one timeline.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactDetail({ contactId, onChanged, setErr }: { contactId: string; onChanged: () => void; setErr: (m: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [tab, setTab] = useState<'timeline' | 'comms' | 'meetings' | 'deals' | 'files' | 'tasks'>('timeline');
  const [editing, setEditing] = useState(false);
  const [ef, setEf] = useState<Record<string, string>>({});
  const [mf, setMf] = useState<Record<string, string>>({ duration: '30' });
  const [inviteSelf, setInviteSelf] = useState(true);
  const [inviteContact, setInviteContact] = useState(false);
  const [tf, setTf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [thread, setThread] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rf, setRf] = useState<Record<string, string>>({});
  const [rFiles, setRFiles] = useState<File[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const rFileRef = useRef<HTMLInputElement>(null);
  const load = () => crmContactDetail(contactId).then(setD).catch((e: any) => setErr(e.message || String(e)));
  useEffect(() => { load(); }, [contactId]);
  if (!d?.contact) return <div className="bg-white/[0.04] border border-white/10 rounded-xl p-14 text-center"><Loader2 className="h-5 w-5 animate-spin text-[#FFD700] mx-auto" /></div>;
  const c = d.contact;

  const saveEdit = async () => {
    setBusy('edit');
    try { await crmUpdateContact(c.id, { name: ef.name ?? c.name, role: ef.role ?? c.role, company: ef.company ?? c.company, email: ef.email ?? c.email, phone: ef.phone ?? c.phone, notes: ef.notes ?? c.notes }); setEditing(false); await load(); onChanged(); }
    catch (e: any) { setErr(e.message || String(e)); }
    setBusy('');
  };
  const schedule = async () => {
    if (!mf.title?.trim() || !mf.date || !mf.time) return;
    setBusy('meet');
    try { await meetingCreate({ title: mf.title.trim(), starts_at: new Date(mf.date + 'T' + mf.time).toISOString(), duration_mins: Number(mf.duration) || 30, location: mf.location || undefined, contact_id: c.id, invite_self: inviteSelf, invite_contact: inviteContact }); setMf({ duration: '30' }); await load(); }
    catch (e: any) { setErr(e.message || String(e)); }
    setBusy('');
  };
  const gcalUrl = (m: any) => {
    const f = (x: Date) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const s = new Date(m.starts_at); const e = new Date(s.getTime() + (Number(m.duration_mins) || 30) * 60000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(m.title) + '&dates=' + f(s) + '/' + f(e) + (m.location ? '&location=' + encodeURIComponent(m.location) : '') + '&details=' + encodeURIComponent('From your Officially Invested CRM');
  };
  const loadThread = () => crmCommThread(c.id).then((r) => setThread(r.thread || [])).catch((e: any) => setErr(e.message || String(e)));
  const toB64 = (file: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(file); });
  const sendReply = async () => {
    if (!rf.body?.trim()) return;
    setBusy('send');
    try {
      const attachments = [] as any[];
      for (const f of rFiles) attachments.push({ file_name: f.name, base64: await toB64(f) });
      await crmReply({ to: rf.to || c.email, subject: rf.subject || 'Re: our conversation', body: rf.body, contact_id: c.id, attachments });
      setRf({}); setRFiles([]); setReviewNote(''); await Promise.all([load(), loadThread()]);
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy('');
  };
  const aiDraft = async (forApproval: boolean) => {
    setBusy(forApproval ? 'park' : 'draft');
    try {
      const r = await crmAiDraftReply(c.id, rf.body?.trim() || undefined, forApproval);
      if (forApproval) { setReviewNote('Parked as a task: review and send it from Tasks with one click.'); await load(); }
      else if (r.draft) { setRf({ ...rf, subject: r.draft.subject, body: r.draft.body }); setReviewNote(r.draft.needs_review_because ? 'Check before sending: ' + r.draft.needs_review_because : 'Draft ready. Read it, tweak it, send it.'); }
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy('');
  };
  const markHeld = async (m: any) => {
    const outcome = window.prompt('How did it go? This goes on the record.', m.outcome ?? '');
    if (outcome === null) return;
    await meetingUpdate(m.id, { status: 'held', outcome }).catch((e: any) => setErr(e.message)); load();
  };
  const addTask = async () => { if (!tf.title?.trim()) return; setBusy('task'); try { await crmAddTask({ contact_id: c.id, title: tf.title.trim(), due_date: tf.due || null }); setTf({}); await load(); } finally { setBusy(''); } };

  const scheduled = (d.meetings || []).filter((m: any) => m.status === 'scheduled');
  const TabBtn = ({ k, label, n }: { k: any; label: string; n?: number }) => (
    <button onClick={() => setTab(k)} className={'px-4 py-1.5 rounded-full text-[13px] font-semibold border ' + (tab === k ? 'bg-[#FFD700] text-[#0A2540] border-[#FFD700]' : 'text-white/70 border-white/20 hover:border-white/40')}>{label}{n != null && n > 0 ? ` · ${n}` : ''}</button>
  );

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-xl p-6">
      {/* header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-12 w-12 rounded-full bg-white/10 text-white text-[15px] font-bold flex items-center justify-center shrink-0">{initials(c.name)}</div>
          <div className="min-w-0">
            {!editing ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="font-serif font-bold text-[22px] text-[#FFD700] leading-tight truncate">{c.name}</h2>
                  <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (ROLE_TINT[c.role] ?? 'bg-white/10 text-white/55')}>{c.role ?? 'other'}</span>
                  <button onClick={() => { setEf({}); setEditing(true); }} className="text-white/35 hover:text-[#FFD700]" title="Edit"><Pencil className="h-3.5 w-3.5" /></button>
                </div>
                <div className="text-white/50 text-[12.5px] mt-0.5">{[c.company, c.email, c.phone].filter(Boolean).join(' · ') || 'No details logged yet. Add them with the pencil.'}</div>
                {c.notes && <div className="text-white/40 text-[12px] italic mt-1">{c.notes}</div>}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 min-w-[420px]">
                {[['name', 'Name'], ['company', 'Company'], ['email', 'Email'], ['phone', 'Phone']].map(([k, ph]) => (
                  <input key={k} className={input} placeholder={ph} defaultValue={c[k] ?? ''} onChange={(e) => setEf((f) => ({ ...f, [k]: e.target.value }))} />
                ))}
                <select className={input + ' [&>option]:text-gray-900'} defaultValue={c.role ?? 'other'} onChange={(e) => setEf((f) => ({ ...f, role: e.target.value }))}>
                  {ROLES.filter((r) => r !== 'all').map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <input className={input} placeholder="Notes" defaultValue={c.notes ?? ''} onChange={(e) => setEf((f) => ({ ...f, notes: e.target.value }))} />
                <button onClick={saveEdit} disabled={busy === 'edit'} className="bg-[#FFD700] text-[#0A2540] rounded-lg text-sm font-bold py-2">{busy === 'edit' ? 'Saving…' : 'Save'}</button>
                <button onClick={() => setEditing(false)} className="border border-white/25 text-white/70 rounded-lg text-sm font-semibold py-2">Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div className="text-right text-[11px] text-white/40 shrink-0">
          {d.deals?.length ?? 0} deal{(d.deals?.length ?? 0) === 1 ? '' : 's'} · {d.communications?.length ?? 0} touches<br />
          {scheduled.length > 0 && <span className="text-[#FFD700]">next meeting {fmtDT(scheduled[0].starts_at)}</span>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap mt-5 mb-4">
        <TabBtn k="timeline" label="Timeline" n={d.timeline?.length} />
        <TabBtn k="comms" label="Comms" n={d.communications?.length} />
        <TabBtn k="meetings" label="Meetings" n={scheduled.length} />
        <TabBtn k="deals" label="Deals" n={d.deals?.length} />
        <TabBtn k="files" label="Files" n={d.documents?.length} />
        <TabBtn k="tasks" label="Tasks" n={(d.tasks || []).filter((t: any) => t.status === 'open').length} />
      </div>

      {tab === 'comms' && (
        <div>
          {/* reply from here: yours to write, or the agent drafts it */}
          <div className="bg-white/[0.05] border border-white/10 rounded-xl p-4 mb-4">
            <div className="text-white/40 text-[11px] font-bold uppercase tracking-wide mb-2.5">Reply from here</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
              <input className={input} placeholder={'To (' + (c.email ?? 'add their email first') + ')'} value={rf.to ?? ''} onChange={(e) => setRf({ ...rf, to: e.target.value })} />
              <input className={input} placeholder="Subject" value={rf.subject ?? ''} onChange={(e) => setRf({ ...rf, subject: e.target.value })} />
            </div>
            <textarea className={input + ' w-full h-32 resize-none'} placeholder="Write the reply, or type what you want to say in rough notes and let the agent draft it properly." value={rf.body ?? ''} onChange={(e) => setRf({ ...rf, body: e.target.value })} />
            {reviewNote && <div className="text-[12px] text-[#FFD700] mt-2">{reviewNote}</div>}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <button onClick={() => rFileRef.current?.click()} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-white/70 border border-white/25 rounded-full px-3 py-1.5 hover:border-white/50"><Paperclip className="h-3.5 w-3.5" /> Attach</button>
              <input ref={rFileRef} type="file" multiple className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []).filter((f) => f.size < 3 * 1024 * 1024); setRFiles((p) => [...p, ...fs].slice(0, 3)); e.target.value = ''; }} />
              {rFiles.map((f, i) => <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-white/10 text-white/80 rounded-full px-2.5 py-1">{f.name.slice(0, 22)}<button onClick={() => setRFiles(rFiles.filter((_, j) => j !== i))} className="text-white/40 hover:text-white"><X className="h-3 w-3" /></button></span>)}
              <div className="flex-1" />
              <button onClick={() => aiDraft(false)} disabled={busy !== ''} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#FFD700] border border-[#FFD700]/40 rounded-full px-3.5 py-1.5 hover:bg-[#FFD700]/10 disabled:opacity-40"><Sparkles className="h-3.5 w-3.5" /> {busy === 'draft' ? 'Drafting…' : 'AI: draft it'}</button>
              <button onClick={() => aiDraft(true)} disabled={busy !== ''} className="text-[12px] font-semibold text-white/70 border border-white/25 rounded-full px-3.5 py-1.5 hover:border-white/50 disabled:opacity-40">{busy === 'park' ? 'Parking…' : 'Draft as approval task'}</button>
              <button onClick={sendReply} disabled={busy !== '' || !rf.body?.trim() || !(rf.to || c.email)} className="bg-[#FFD700] text-[#0A2540] rounded-full text-[13px] font-bold px-4 py-1.5 disabled:opacity-40">{busy === 'send' ? 'Sending…' : 'Send'}</button>
            </div>
            <div className="text-white/30 text-[11px] mt-2">Sends from Officially Invested with replies coming straight back to your inbox, and it is logged on the timeline.</div>
          </div>
          {/* the full correspondence, summarised rows that open out */}
          {thread === null ? <button onClick={loadThread} className="text-[12.5px] text-[#FFD700] underline underline-offset-2">Load the full correspondence</button> :
            thread.length === 0 ? <div className="text-white/35 text-[13px] py-4">No written correspondence yet.</div> :
            thread.map((x: any) => (
              <div key={x.id} className="py-2.5 border-b border-white/[0.06] cursor-pointer" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })}>
                <div className="flex items-center gap-2">
                  <span className={'text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ' + (x.direction === 'in' ? 'bg-emerald-400/25 text-emerald-200' : 'bg-white/10 text-white/60')}>{x.direction === 'in' ? 'THEM' : 'YOU'}</span>
                  <div className="text-white/85 text-[13px] font-semibold truncate flex-1">{x.subject || x.kind}{x.deal_name && <span className="text-white/35 font-normal"> · {x.deal_name}</span>}</div>
                  <div className="text-white/30 text-[11px] shrink-0">{fmtDT(x.happened_at)}</div>
                </div>
                <div className={'text-white/55 text-[12.5px] mt-1 whitespace-pre-wrap ' + (expanded.has(x.id) ? '' : 'line-clamp-2')}>{x.body}</div>
                {!expanded.has(x.id) && String(x.body ?? '').length > 160 && <div className="text-[#FFD700]/70 text-[11px] mt-0.5">click to read in full</div>}
              </div>
            ))}
        </div>
      )}

      {tab === 'files' && (
        <div>
          {(d.documents ?? []).length === 0 && <div className="text-white/35 text-[13px] py-6">No files yet. Documents uploaded on their deals appear here automatically.</div>}
          {(d.documents ?? []).map((f: any) => (
            <div key={f.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06]">
              <FileText className="h-4 w-4 text-[#FFD700] shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-white/85 text-[13px] font-semibold truncate">{f.file_name}</div>
                <div className="text-white/40 text-[11.5px]">{(d.deals ?? []).find((x: any) => x.id === f.deal_id)?.name ?? 'deal document'} · {fmtDT(f.created_at)}</div>
              </div>
            </div>
          ))}
          <div className="text-white/30 text-[11px] mt-3">Open the deal in your pipeline to read or add documents; the analyst reads everything filed there.</div>
        </div>
      )}

      {tab === 'timeline' && (
        <div>
          {(d.timeline ?? []).length === 0 && <div className="text-white/35 text-[13px] py-6">Nothing on record yet. The first letter, call or meeting starts the story.</div>}
          {(d.timeline ?? []).map((t: any, i: number) => {
            const Icon = TL_ICON[t.icon_kind] ?? FileText;
            const key = 'tl' + i;
            const open = expanded.has(key);
            return (
              <div key={i} className="flex gap-3 py-2.5 border-b border-white/[0.06] cursor-pointer hover:bg-white/[0.02] rounded-lg px-1 -mx-1" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; })}>
                <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center shrink-0 mt-0.5"><Icon className="h-3.5 w-3.5 text-[#FFD700]" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-white/85 text-[13px] font-semibold">{t.title}{t.deal_name && <span className="text-white/35 font-normal"> · {t.deal_name}</span>}</div>
                  {t.body && <div className={'text-white/50 text-[12px] mt-0.5 whitespace-pre-wrap ' + (open ? '' : 'line-clamp-2')}>{t.body}</div>}
                  {t.icon_kind !== 'task' && open && <button onClick={(e) => { e.stopPropagation(); setTab('comms'); if (thread === null) loadThread(); }} className="text-[#FFD700]/80 text-[11px] mt-1 underline underline-offset-2">open in Comms to reply</button>}
                  {!open && String(t.body ?? '').length > 120 && <div className="text-[#FFD700]/60 text-[10.5px] mt-0.5">click to expand</div>}
                </div>
                <div className="text-white/30 text-[11px] shrink-0">{fmtDT(t.at)}</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'meetings' && (
        <div>
          <div className="bg-white/[0.05] border border-white/10 rounded-xl p-4 mb-4">
            <div className="text-white/40 text-[11px] font-bold uppercase tracking-wide mb-2.5">Set a meeting</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <input className={input + ' md:col-span-3'} placeholder="What is it about, e.g. First call about the sale" value={mf.title ?? ''} onChange={(e) => setMf({ ...mf, title: e.target.value })} />
              <input type="date" className={input} value={mf.date ?? ''} onChange={(e) => setMf({ ...mf, date: e.target.value })} />
              <input type="time" className={input} value={mf.time ?? ''} onChange={(e) => setMf({ ...mf, time: e.target.value })} />
              <select className={input + ' [&>option]:text-gray-900'} value={mf.duration} onChange={(e) => setMf({ ...mf, duration: e.target.value })}>
                {[15, 30, 45, 60, 90].map((n) => <option key={n} value={n}>{n} mins</option>)}
              </select>
              <input className={input + ' md:col-span-2'} placeholder="Where (phone, video link, their office)" value={mf.location ?? ''} onChange={(e) => setMf({ ...mf, location: e.target.value })} />
              <button onClick={schedule} disabled={busy === 'meet' || !mf.title?.trim() || !mf.date || !mf.time} className="bg-[#FFD700] text-[#0A2540] rounded-lg text-sm font-bold py-2 disabled:opacity-40">{busy === 'meet' ? 'Saving…' : 'Schedule'}</button>
            </div>
            <div className="flex gap-4 mt-2.5 text-[12px] text-white/60">
              <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={inviteSelf} onChange={(e) => setInviteSelf(e.target.checked)} /> Put it in my calendar (invite by email)</label>
              {c.email && <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={inviteContact} onChange={(e) => setInviteContact(e.target.checked)} /> Send {c.name.split(' ')[0]} an invite too</label>}
            </div>
          </div>
          {(d.meetings ?? []).length === 0 && <div className="text-white/35 text-[13px]">No meetings with {c.name.split(' ')[0]} yet.</div>}
          {(d.meetings ?? []).map((m: any) => (
            <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06]">
              <Calendar className={'h-4 w-4 shrink-0 ' + (m.status === 'held' ? 'text-emerald-400' : m.status === 'cancelled' ? 'text-white/25' : 'text-[#FFD700]')} />
              <div className="min-w-0 flex-1">
                <div className={'text-[13px] font-semibold ' + (m.status === 'cancelled' ? 'text-white/35 line-through' : 'text-white/85')}>{m.title}{m.deal_name && <span className="text-white/35 font-normal"> · {m.deal_name}</span>}</div>
                <div className="text-white/40 text-[11.5px]">{fmtDT(m.starts_at)} · {m.duration_mins} mins{m.location ? ' · ' + m.location : ''}{m.outcome ? ' · ' + m.outcome : ''}{m.meta?.meet_link && <a href={m.meta.meet_link} target="_blank" rel="noreferrer" className="ml-1.5 text-[#FFD700] font-bold hover:underline" onClick={(e) => e.stopPropagation()}>Join Meet</a>}{m.meta?.google_event_id && <span className="ml-1.5 text-emerald-300/80">in Google Calendar</span>}</div>
              </div>
              {m.status === 'scheduled' && (
                <div className="flex gap-1.5 shrink-0 items-center">
                  <a href={gcalUrl(m)} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-[#FFD700] border border-[#FFD700]/40 rounded-full px-2.5 py-1 hover:bg-[#FFD700]/10">Google Calendar</a>
                  <button onClick={() => markHeld(m)} className="text-[11px] font-bold text-emerald-300 border border-emerald-400/40 rounded-full px-2.5 py-1 hover:bg-emerald-400/10">Mark held</button>
                  <button onClick={async () => { await meetingCancel(m.id); load(); }} className="text-white/30 hover:text-red-400" title="Cancel"><X className="h-3.5 w-3.5" /></button>
                </div>
              )}
              {m.status === 'held' && <span className="text-[10px] font-bold text-emerald-300 shrink-0">held</span>}
            </div>
          ))}
        </div>
      )}

      {tab === 'deals' && (
        <div>
          {(d.deals ?? []).length === 0 && <div className="text-white/35 text-[13px] py-6">Not linked to any deal yet. Link them from a deal's People section.</div>}
          {(d.deals ?? []).map((x: any) => (
            <div key={x.id} className="flex items-center gap-3 py-2.5 border-b border-white/[0.06]">
              <div className="min-w-0 flex-1">
                <div className="text-white/85 text-[13px] font-semibold">{x.name}</div>
                <div className="text-white/40 text-[11.5px]">{[x.reference, x.role, x.status].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tasks' && (
        <div>
          {(d.tasks ?? []).filter((t: any) => t.status === 'open').map((t: any) => (
            <div key={t.id} className="flex items-start gap-2.5 py-2 border-b border-white/[0.06]">
              <button onClick={async () => { await crmCompleteTask(t.id); load(); }} className="mt-0.5 text-white/25 hover:text-emerald-400" title="Mark done"><Check className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-white/85">{t.title}{t.due_date && <span className="text-white/35 text-[11px] ml-2">due {String(t.due_date).slice(0, 10)}</span>}</div>
                {t.meta?.action === 'approve_reply' && t.meta?.draft && (
                  <div className="mt-1.5 bg-white/[0.05] border border-[#FFD700]/30 rounded-lg p-3">
                    <div className="text-[11px] text-white/45 mb-1">To {t.meta.draft.to} · {t.meta.draft.subject}</div>
                    <div className="text-[12.5px] text-white/70 whitespace-pre-wrap">{t.meta.draft.body}</div>
                    <button onClick={async () => { setBusy('appr'); try { await crmApproveReply(t.id); await Promise.all([load(), loadThread()]); } catch (e: any) { setErr(e.message || String(e)); } setBusy(''); }} disabled={busy === 'appr'} className="mt-2 bg-[#FFD700] text-[#0A2540] rounded-full text-[12px] font-bold px-4 py-1.5 disabled:opacity-40">{busy === 'appr' ? 'Sending…' : 'Approve and send'}</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(d.tasks ?? []).filter((t: any) => t.status === 'open').length === 0 && <div className="text-white/35 text-[13px] py-4">Nothing outstanding for {c.name.split(' ')[0]}.</div>}
          <div className="flex gap-2 mt-3">
            <input className={input + ' flex-1'} placeholder={'e.g. Call ' + c.name.split(' ')[0] + ' about the accounts'} value={tf.title ?? ''} onChange={(e) => setTf({ ...tf, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
            <input type="date" className={input} value={tf.due ?? ''} onChange={(e) => setTf({ ...tf, due: e.target.value })} />
            <button onClick={addTask} disabled={busy === 'task'} className="bg-[#FFD700] text-[#0A2540] rounded-lg text-sm font-bold px-4 disabled:opacity-40">Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
