// =============================================================================
// Member deal journey — /deals (listing + member dashboard) and /deals/:id
// (detail → application → NDA e-sign → data room → interest).
// Public teasers double as lead gen; identity unlocks after NDA. Every open is
// logged; the data room carries a per-member watermark.
// =============================================================================
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Loader2, Lock, ShieldCheck, CheckCircle2, Clock, MapPin, FileText, MessageSquareText,
  ChevronLeft, Sparkles, Building2, HelpCircle, X, CalendarClock, ThumbsDown, LogOut, User,
  Wrench, Home as HomeIcon, Truck, Factory, HeartPulse, UtensilsCrossed, Store, Laptop, Leaf, Briefcase,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  dfListings, dfDetail, dfMe, dfApply, dfSignNda, dfDataRoom, dfLogOpen, dfAsk, dfInterest, dfBookConfirm, dfPass,
} from '../../lib/acq';

const NAVY = '#0A2540';
const GOLD = '#FFD700';
const card = 'bg-white rounded-2xl shadow-xl';
const input = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540]/30 bg-white';
const btnGold = 'inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-5 py-3 rounded-xl text-sm font-bold hover:brightness-95 disabled:opacity-40 transition';
const btnGhost = 'inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 disabled:opacity-40';

const BAND_LABEL: Record<string, string> = {
  applied: 'Application in review', nda_pending: 'Approved — sign the NDA', data_room: 'Data room open',
  interest_expressed: 'Interest expressed', intro_call_booked: 'Intro call booked', offer_submitted: 'Offer submitted',
  heads_of_terms: 'Heads of terms', diligence: 'In diligence', completed: 'Completed', declined: 'Not approved',
  passed: 'You passed', waitlisted: 'On the waitlist', revoked: 'Access revoked', expired: 'Access expired', nda_signed: 'Awaiting countersignature',
};

const NDA_TEXT = `MUTUAL NON-DISCLOSURE AGREEMENT (v1)

Between: the Disclosing Party (the business owner, represented by Officially Invested Ltd) and you, the Receiving Party.

1. Purpose. Confidential information is shared solely to evaluate a potential acquisition of the business referenced by the deal identifier shown on this page.
2. Confidential information. The business's identity, location, financial records, customer and supplier details, the information memorandum, deal notes, Q&A answers, and anything else made available in the data room.
3. Obligations. You will keep confidential information strictly confidential; use it only for evaluating this acquisition; not contact the business, its staff, customers or suppliers directly without written consent; and not share it with anyone except professional advisers bound by equivalent duties.
4. No circumvention. You will not approach the seller outside this platform, or use the information to compete with or solicit from the business, for 24 months.
5. Documents. Data room documents are watermarked to you personally. Access is logged. Access lapses after 30 days of inactivity; your obligations survive for 3 years from signature.
6. Return / destruction. On request, or if you pass on the deal, you will destroy all copies within 14 days.
7. No obligation. Nothing here obliges either party to proceed with any transaction.
8. Law. England and Wales; the courts of England and Wales have exclusive jurisdiction.

By typing your full legal name and clicking Sign, you agree these terms form a binding agreement, executed electronically.`;

// ------------------------------ sector artwork ------------------------------
function sectorArt(sector: string | null): { Icon: any; hue: string } {
  const s = (sector ?? '').toLowerCase();
  if (/trade|plumb|electric|hvac|roof|build|construct|clean|landscap|maint/.test(s)) return { Icon: Wrench, hue: '#1B4B7A' };
  if (/propert|land|real estate|cre|lettings|estate/.test(s)) return { Icon: HomeIcon, hue: '#14456E' };
  if (/transport|logistic|haulage|courier|freight|storage/.test(s)) return { Icon: Truck, hue: '#0F3E63' };
  if (/manufactur|engineer|metal|machin|chemic|fabricat|quarry/.test(s)) return { Icon: Factory, hue: '#173F66' };
  if (/health|care|dental|pharma|gp|clinic|vet/.test(s)) return { Icon: HeartPulse, hue: '#1A4C72' };
  if (/food|hospitality|restaurant|pub|brewer|catering|takeaway/.test(s)) return { Icon: UtensilsCrossed, hue: '#153F69' };
  if (/retail|shop|store|convenience|salon|personal/.test(s)) return { Icon: Store, hue: '#12456B' };
  if (/tech|digital|software|it |saas|data|media|game/.test(s)) return { Icon: Laptop, hue: '#0E3C60' };
  if (/agri|farm|forest|fish|renewab|energy/.test(s)) return { Icon: Leaf, hue: '#174A6B' };
  return { Icon: Briefcase, hue: '#123F66' };
}

function SectorHero({ sector, status, big }: { sector: string | null; status: string; big?: boolean }) {
  const { Icon, hue } = sectorArt(sector);
  return (
    <div className={'relative overflow-hidden flex items-end ' + (big ? 'h-52 sm:h-64' : 'h-44')}
      style={{ background: `radial-gradient(120% 160% at 85% -20%, ${hue} 0%, ${NAVY} 55%, #081D33 100%)` }}>
      {/* faint icon lattice */}
      <div className="absolute inset-0 opacity-[0.05]" style={{
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='72' height='72'><circle cx='36' cy='36' r='1.6' fill='white'/></svg>`)}")`,
      }} />
      {/* gold arc */}
      <svg className="absolute -right-10 -top-14" width={big ? 300 : 230} height={big ? 300 : 230} viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="86" stroke={GOLD} strokeOpacity="0.16" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="62" stroke={GOLD} strokeOpacity="0.10" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="40" fill="white" fillOpacity="0.045" />
      </svg>
      <Icon className={'absolute text-[#FFD700]/80 ' + (big ? 'right-12 top-12 h-20 w-20' : 'right-10 top-9 h-16 w-16')} strokeWidth={1.25} />
      <div className="relative p-5 flex items-center gap-2">
        <span className="bg-[#FFD700] text-[#0A2540] text-[11px] font-bold px-2.5 py-1 rounded-full">{sector ?? 'Private business'}</span>
        {status === 'under_offer' && <span className="bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">Under offer</span>}
        {status === 'completed' && <span className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-full">Completed</span>}
        {status === 'released' && <span className="bg-white/15 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full backdrop-blur">Live</span>}
        <span className="text-white/40 text-[10px] font-semibold tracking-wide uppercase ml-1">Identity revealed after NDA</span>
      </div>
    </div>
  );
}

function ScoreBadge({ score, breakdown }: { score: number | null; breakdown?: any[] }) {
  const [open, setOpen] = useState(false);
  if (score == null) return null;
  const band = score >= 80 ? 'Exceptional' : score >= 65 ? 'Strong' : score >= 50 ? 'Solid' : 'Speculative';
  return (
    <span className="relative inline-flex items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 bg-[#0A2540] text-white text-xs font-bold px-2.5 py-1 rounded-full">
        <Sparkles className="h-3 w-3 text-[#FFD700]" /> Ownership Score {score} · {band}
      </span>
      {breakdown && (
        <button onClick={() => setOpen(!open)} className="text-gray-400 hover:text-gray-600" title="How this is scored"><HelpCircle className="h-4 w-4" /></button>
      )}
      {open && breakdown && (
        <span className="absolute z-30 top-8 left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-xl p-3 text-left">
          <span className="block text-[11px] font-bold text-gray-900 mb-1.5">How this is scored</span>
          {breakdown.map((b: any, i: number) => (
            <span key={i} className="flex justify-between text-[11px] text-gray-600 py-0.5"><span>{b.part}</span><span className="font-semibold text-gray-900">{b.pts}/{b.max}</span></span>
          ))}
        </span>
      )}
    </span>
  );
}

// ------------------------------ auth ------------------------------
function useMember() {
  const [session, setSession] = useState<any>(undefined);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  return session;
}

function AuthModal({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('');
  const go = async () => {
    if (!supabase) return;
    setBusy(true); setMsg('');
    try {
      if (mode === 'up') {
        const { error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        setMsg('Account created. If email confirmation is required, check your inbox, then sign in.');
        setMode('in');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        onDone();
      }
    } catch (e: any) { setMsg(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className={card + ' p-6 max-w-sm w-full'} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-serif font-bold text-lg text-gray-900">{mode === 'in' ? 'Member sign in' : 'Create your account'}</div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <p className="text-[13px] text-gray-500 mt-1">Deal access is for Officially Invested members. Your tier is assigned by the OI team.</p>
        <input className={input + ' mt-4'} placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input + ' mt-2'} placeholder="Password" type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {msg && <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">{msg}</div>}
        <button className={btnGold + ' w-full mt-4'} disabled={busy || !email || !pw} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === 'in' ? 'Sign in' : 'Create account')}</button>
        <button className="text-[12px] text-gray-500 hover:text-gray-800 mt-3 w-full text-center" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'First time here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------ deal flow top bar ------------------------------
function TopBar({ me, onSignIn, onChanged }: { me: any; onSignIn: () => void; onChanged: () => void }) {
  return (
    <div className="border-b border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/deals" className="flex items-center gap-2.5">
          <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: GOLD }}><Sparkles className="h-4 w-4" style={{ color: NAVY }} /></span>
          <span className="text-white font-serif font-bold">Deal Flow</span>
          <span className="text-white/35 text-[11px] font-semibold uppercase tracking-wider hidden sm:inline">Officially Invested</span>
        </Link>
        {me?.member ? (
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-2 text-white/70 text-[12px]">
              <User className="h-3.5 w-3.5" /> {me.member.full_name || me.member.email}
              <span className="bg-[#FFD700] text-[#0A2540] text-[10px] font-bold px-2 py-0.5 rounded-full capitalize">{me.member.tier}</span>
              <span className="text-white/40">NDA slots {me.slots_used}{me.slots_cap != null ? `/${me.slots_cap}` : ' · unlimited'}</span>
            </span>
            <button className="text-white/50 hover:text-white text-[12px] inline-flex items-center gap-1" onClick={async () => { await supabase?.auth.signOut(); onChanged(); }}><LogOut className="h-3.5 w-3.5" /> Sign out</button>
          </div>
        ) : me?.is_admin ? (
          <Link to="/admin/origination" className="text-[#FFD700] text-[12px] font-bold">You're the admin → Deal flow console</Link>
        ) : (
          <button className="bg-[#FFD700] text-[#0A2540] text-[12px] font-bold px-4 py-2 rounded-lg hover:brightness-95" onClick={onSignIn}>Member sign in</button>
        )}
      </div>
    </div>
  );
}

// ------------------------------ LISTING PAGE ------------------------------
export default function Deals() {
  const session = useMember();
  const [data, setData] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [auth, setAuth] = useState(false);
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      const [l, m] = await Promise.all([dfListings(), session ? dfMe() : Promise.resolve(null)]);
      setData(l); setMe(m);
    } catch (e: any) { setErr(e.message || String(e)); }
  };
  useEffect(() => { if (session !== undefined) load(); }, [session]);
  const active = (me?.deals ?? []).filter((x: any) => !['passed', 'declined', 'expired', 'revoked', 'completed'].includes(x.state));

  return (
    <div className="min-h-screen pb-24 pt-20" style={{ background: NAVY }}>
      <TopBar me={me ?? (session ? undefined : { member: null })} onSignIn={() => setAuth(true)} onChanged={load} />
      <div className="max-w-6xl mx-auto px-4">
        {/* hero */}
        <div className="text-center pt-12 pb-10">
          <div className="text-[#FFD700] text-[12px] font-bold tracking-[0.2em] uppercase">Member deal flow</div>
          <h1 className="font-serif text-white text-3xl sm:text-5xl font-bold mt-3">Off-market deals,<br className="sm:hidden" /> sourced for members</h1>
          <p className="text-white/55 text-[15px] mt-4 max-w-xl mx-auto leading-relaxed">Businesses approached directly, before any broker or listing site. Anonymised until you sign an NDA. One buyer gets exclusivity.</p>
          <div className="flex justify-center gap-8 mt-7 text-center">
            {[['900k+', 'UK companies scanned'], ['Direct', 'to owners, no brokers'], ['NDA-gated', 'confidential data rooms']].map(([a, b]) => (
              <div key={a as string}><div className="text-[#FFD700] font-serif font-bold text-xl">{a}</div><div className="text-white/40 text-[11px] mt-0.5">{b}</div></div>
            ))}
          </div>
        </div>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-6 max-w-lg mx-auto">{err}</div>}

        {/* member dashboard */}
        {me?.member && (
          <div className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-serif font-bold text-lg">My deals</h2>
              <span className="text-white/40 text-[12px]">NDA slots used: {me.slots_used}{me.slots_cap != null ? ` of ${me.slots_cap}` : ' (unlimited)'}</span>
            </div>
            {active.length ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {active.map((x: any) => (
                  <Link key={x.id} to={`/deals/${x.release_id}`} className="bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 rounded-xl p-4 transition">
                    <div className="text-white text-[13px] font-semibold leading-snug">{x.headline}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (['data_room', 'interest_expressed', 'intro_call_booked'].includes(x.state) ? 'bg-emerald-400/20 text-emerald-300' : x.state === 'nda_pending' ? 'bg-[#FFD700]/20 text-[#FFD700]' : 'bg-white/10 text-white/60')}>{BAND_LABEL[x.state] ?? x.state}</span>
                      <span className="text-white/30 text-[11px]">Open →</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <div className="text-white/40 text-[13px] bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3">Nothing live yet — pick a deal below to start.</div>}
          </div>
        )}

        {/* listings */}
        {!data ? <div className="text-white/50 text-center py-20"><Loader2 className="h-6 w-6 animate-spin inline" /></div> : (
          <>
            <h2 className="text-white font-serif font-bold text-lg mb-4">{me?.member ? 'Live deals' : 'Current deals'}</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {data.listings.map((l: any) => (
                <Link key={l.id} to={`/deals/${l.id}`} className={card + ' overflow-hidden hover:-translate-y-1 transition-transform block rounded-2xl'}>
                  <SectorHero sector={l.sector_group} status={l.status} />
                  <div className="p-5">
                    <div className="font-serif font-bold text-gray-900 leading-snug min-h-[44px]">{l.headline}</div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-gray-500 mt-2">
                      {l.region && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{l.region}</span>}
                      {l.turnover_band && <span>Turnover {l.turnover_band}</span>}
                      {l.ebitda_band && <span>Adj EBITDA {l.ebitda_band}</span>}
                    </div>
                    <div className="mt-3.5 pt-3.5 border-t border-gray-100 flex items-center justify-between">
                      <ScoreBadge score={l.ownership_score} />
                      <span className="text-[12px] font-bold" style={{ color: NAVY }}>
                        {l.my_state ? (BAND_LABEL[l.my_state] ?? l.my_state) : l.access === 'open' ? 'Open to you →' : l.access?.startsWith('opens:') ? `Opens ${l.access.slice(6)}` : l.access === 'waitlist' ? 'Waitlist' : l.access === 'join' ? 'Sign in to view →' : ''}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
              {!data.listings.length && <div className="text-white/50 text-sm col-span-3 text-center py-16">No live deals right now. New releases go to members by email first.</div>}
            </div>

            {/* lead gen join panel for guests */}
            {!me?.member && !me?.is_admin && (
              <div className="mt-14 rounded-3xl overflow-hidden border border-white/10" style={{ background: 'linear-gradient(120deg, rgba(255,215,0,0.08), rgba(255,255,255,0.03))' }}>
                <div className="p-8 sm:p-10 grid sm:grid-cols-2 gap-8 items-center">
                  <div>
                    <h3 className="font-serif text-white text-2xl font-bold">Want access to these deals?</h3>
                    <p className="text-white/60 text-[14px] mt-3 leading-relaxed">Membership gets you the full journey: apply in two minutes, sign the NDA in-app, open the data room, and speak to the owner through us. Circle members see every deal on day one.</p>
                    <ul className="mt-4 space-y-2">
                      {['Off-market businesses approached directly', 'Anonymised teasers, full data room after NDA', 'One buyer gets exclusivity — no bidding wars', 'Deals matched to your buy box'].map((x) => (
                        <li key={x} className="flex items-center gap-2 text-white/75 text-[13px]"><CheckCircle2 className="h-4 w-4 text-[#FFD700] shrink-0" />{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-center sm:text-right">
                    <a href="mailto:sandeep@officiallyinvested.com?subject=Deal%20Flow%20membership" className={btnGold + ' w-full sm:w-auto'}>Request membership</a>
                    <div className="mt-3"><button className="text-white/50 hover:text-white text-[13px] underline underline-offset-4" onClick={() => setAuth(true)}>Already a member? Sign in</button></div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {auth && <AuthModal onClose={() => setAuth(false)} onDone={() => { setAuth(false); load(); }} />}
    </div>
  );
}

// ------------------------------ DETAIL / JOURNEY ------------------------------
export function DealPage() {
  const { id } = useParams();
  const session = useMember();
  const [d, setD] = useState<any>(null);
  const [me, setMe] = useState<any>(null);
  const [room, setRoom] = useState<any>(null);
  const [auth, setAuth] = useState(false);
  const [err, setErr] = useState('');
  const [applying, setApplying] = useState(false);
  const [passing, setPassing] = useState(false);
  const load = async () => {
    try {
      const [r, m] = await Promise.all([dfDetail(id!), session ? dfMe() : Promise.resolve(null)]);
      setD(r); setMe(m);
      if (r.my && ['data_room', 'interest_expressed', 'intro_call_booked', 'offer_submitted', 'heads_of_terms', 'diligence'].includes(r.my.state)) {
        try { setRoom(await dfDataRoom(id!)); } catch (_) { /* locked */ }
      } else setRoom(null);
    } catch (e: any) { setErr(e.message || String(e)); }
  };
  useEffect(() => { if (session !== undefined) load(); }, [session, id]);

  if (!d) return <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>{err ? <div className="text-red-300 text-sm">{err}</div> : <Loader2 className="h-6 w-6 animate-spin text-white/50" />}</div>;
  const r = d.release; const my = d.my; const state = my?.state ?? null;

  return (
    <div className="min-h-screen pb-24 pt-20" style={{ background: NAVY }}>
      <TopBar me={me ?? (session ? undefined : { member: null })} onSignIn={() => setAuth(true)} onChanged={load} />
      <div className="max-w-3xl mx-auto px-4 pt-8">
        <Link to="/deals" className="inline-flex items-center gap-1 text-white/60 hover:text-white text-[13px] mb-4"><ChevronLeft className="h-4 w-4" /> All deals</Link>
        {err && <div className="bg-red-50 text-red-700 text-sm rounded-lg px-4 py-2.5 mb-4">{err}</div>}
        <div className={card + ' overflow-hidden'}>
          <SectorHero sector={r.sector_group} status={r.status} big />
          <div className="p-6 sm:p-8">
            <h1 className="font-serif text-2xl font-bold text-gray-900 leading-snug">{r.headline}</h1>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {[['Turnover', r.turnover_band], ['Adj EBITDA', r.ebitda_band], ['Guide', r.guide_multiple], ['Region', r.region]].map(([k, v]) => (
                <div key={k as string} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">{k}</div>
                  <div className="text-[13px] font-semibold text-gray-900 mt-0.5">{v ?? '—'}</div>
                </div>
              ))}
            </div>
            <div className="mt-4"><ScoreBadge score={r.ownership_score} breakdown={r.score_breakdown} /></div>

            {r.why_sourced && (
              <div className="mt-6 border-l-4 pl-4 py-1" style={{ borderColor: GOLD }}>
                <div className="text-[11px] uppercase tracking-wide text-gray-400 font-bold mb-1">Why I sourced this</div>
                <p className="text-[14px] text-gray-700 leading-relaxed italic">"{r.why_sourced}"</p>
                <div className="text-[12px] text-gray-500 mt-1.5 font-semibold">— Sandeep, Officially Invested</div>
              </div>
            )}

            {!room && (
              <div className="mt-6 bg-gray-50 rounded-xl p-4">
                <div className="text-[12px] font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> What unlocks after NDA</div>
                <div className="grid sm:grid-cols-2 gap-1.5">
                  {(r.unlocks ?? []).map((u: string) => <div key={u} className="flex items-center gap-2 text-[13px] text-gray-600"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{u}</div>)}
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-400 mt-4">
              <span>NDAs active: {d.ndas_active}/{r.nda_max}</span>
              {r.released_at && <span>Released {String(r.released_at).slice(0, 10)}</span>}
              {d.tier && <span>Your tier: <span className="font-semibold text-gray-600 capitalize">{d.tier}</span></span>}
            </div>

            <div className="mt-7">
              {session === null && (
                <div className="flex flex-col sm:flex-row gap-3">
                  <button className={btnGold + ' flex-1'} onClick={() => setAuth(true)}>Member sign in to request access</button>
                  <a href="mailto:sandeep@officiallyinvested.com?subject=Deal%20Flow%20membership" className={btnGhost + ' !text-white !border-white/30 hover:!bg-white/10'}>Not a member? Request membership</a>
                </div>
              )}
              {session && me && !me.member && !me.is_admin && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[13px] text-amber-800">
                  Your account isn't linked to a membership yet. Deal access is for Officially Invested members — email <a className="underline font-semibold" href="mailto:sandeep@officiallyinvested.com">sandeep@officiallyinvested.com</a> to join.
                </div>
              )}
              {session && d.tier && !state && d.access === 'open' && !applying && (
                <div className="flex gap-3">
                  <button className={btnGold + ' flex-1'} onClick={() => setApplying(true)}>{d.tier === 'academy' ? 'Apply for access' : 'Request access'}</button>
                  <button className={btnGhost} onClick={() => setPassing(true)}><ThumbsDown className="h-4 w-4" /> Pass</button>
                </div>
              )}
              {session && d.tier && !state && d.access?.startsWith('opens:') && (
                <div className="bg-gray-50 rounded-xl p-4 text-[13px] text-gray-600 flex items-center gap-2"><Clock className="h-4 w-4" /> Opens for your tier on <b>{d.access.slice(6)}</b>. Higher tiers see deals first — ask about upgrading.</div>
              )}
              {session && d.tier && !state && d.access === 'waitlist' && !applying && (
                <button className={btnGold + ' w-full'} onClick={() => setApplying(true)}>Join the waitlist</button>
              )}
              {applying && <ApplicationForm releaseId={r.id} onDone={() => { setApplying(false); load(); }} onCancel={() => setApplying(false)} />}
              {state === 'applied' && <Banner icon={Clock} text="Your application is in review — you'll hear back within 24 hours, with a reason either way." />}
              {state === 'declined' && <Banner icon={X} text={`Not approved this time${my.state_reason ? `: ${my.state_reason}` : ''}. This doesn't affect future applications.`} tone="red" />}
              {state === 'nda_pending' && <NdaSign releaseId={r.id} onDone={load} />}
              {state === 'nda_signed' && <Banner icon={Clock} text="NDA signed — awaiting countersignature. The data room opens the moment it's countersigned." />}
              {state === 'waitlisted' && <Banner icon={Clock} text="You're on the waitlist. If this deal reopens you'll be notified in join order." />}
              {state === 'expired' && <Banner icon={Clock} text="Your access expired after 30 days of inactivity. Re-apply any time — your NDA obligations continue." tone="red" />}
              {state === 'passed' && <Banner icon={ThumbsDown} text="You passed on this deal. Changed your mind? You can re-apply while it's live." />}
              {room && <DataRoom releaseId={r.id} room={room} myState={state!} onChanged={load} onPass={() => setPassing(true)} />}
              {passing && <PassModal releaseId={r.id} onDone={() => { setPassing(false); setRoom(null); load(); }} onCancel={() => setPassing(false)} />}
            </div>
          </div>
        </div>
      </div>
      {auth && <AuthModal onClose={() => setAuth(false)} onDone={() => { setAuth(false); load(); }} />}
    </div>
  );
}

function Banner({ icon: Icon, text, tone }: { icon: any; text: string; tone?: 'red' }) {
  return <div className={'rounded-xl p-4 text-[13px] flex items-start gap-2.5 ' + (tone === 'red' ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700')}><Icon className="h-4 w-4 mt-0.5 shrink-0" />{text}</div>;
}

// -------- application (one screen, <2 min) --------
function ApplicationForm({ releaseId, onDone, onCancel }: { releaseId: string; onDone: () => void; onCancel: () => void }) {
  const [confirm, setConfirm] = useState(true);
  const [mismatch, setMismatch] = useState('');
  const [readiness, setReadiness] = useState('exploring');
  const [motivation, setMotivation] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try {
      await dfApply(releaseId, { buybox_confirm: confirm, mismatch_reason: confirm ? null : mismatch, funding_readiness: readiness, motivation }, true);
      onDone();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50">
      <div className="font-bold text-gray-900 text-[15px]">Apply for access</div>
      <p className="text-[12px] text-gray-500 mt-0.5 mb-4">Under two minutes. Honest answers get faster approvals.</p>
      <label className="flex items-start gap-2.5 text-[13px] text-gray-700 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        This deal fits my buy box
      </label>
      {!confirm && <input className={input + ' mt-2'} placeholder="It differs from your buy box — tell us why this one" value={mismatch} onChange={(e) => setMismatch(e.target.value)} />}
      <div className="mt-4">
        <div className="text-[12px] font-semibold text-gray-700 mb-1">Funding readiness</div>
        <select className={input} value={readiness} onChange={(e) => setReadiness(e.target.value)}>
          <option value="cash_ready">Cash ready</option>
          <option value="finance_agreed">Finance agreed in principle</option>
          <option value="finance_not_arranged">Finance not yet arranged</option>
          <option value="exploring">Exploring</option>
        </select>
        <div className="text-[11px] text-gray-400 mt-1">Shown to the OI team — it never auto-blocks you.</div>
      </div>
      <div className="mt-4">
        <div className="text-[12px] font-semibold text-gray-700 mb-1">Why this deal? (2–3 lines)</div>
        <textarea className={input} rows={3} value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Your relevant experience and intent" />
      </div>
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-3 max-h-32 overflow-y-auto text-[11px] text-gray-500 whitespace-pre-wrap">{NDA_TEXT.slice(0, 700)}…</div>
      <label className="flex items-start gap-2.5 text-[13px] text-gray-700 cursor-pointer mt-3">
        <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        I've read the NDA terms and will be asked to sign before any identity is revealed
      </label>
      {err && <div className="text-[12px] text-red-600 mt-3">{err}</div>}
      <div className="flex gap-2.5 mt-4">
        <button className={btnGold + ' flex-1'} disabled={busy || !ack || !motivation.trim()} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit application'}</button>
        <button className={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// -------- NDA e-sign --------
function NdaSign({ releaseId, onDone }: { releaseId: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await dfSignNda(releaseId, name, true); onDone(); } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="border-2 rounded-2xl p-5" style={{ borderColor: GOLD, background: '#FFFDF2' }}>
      <div className="font-bold text-gray-900 text-[15px] flex items-center gap-2"><ShieldCheck className="h-4 w-4" style={{ color: NAVY }} /> You're approved — sign the NDA to open the data room</div>
      <div className="mt-3 bg-white border border-gray-200 rounded-xl p-4 h-56 overflow-y-auto text-[12px] text-gray-600 whitespace-pre-wrap"
        onScroll={(e) => { const t = e.currentTarget; if (t.scrollTop + t.clientHeight >= t.scrollHeight - 30) setScrolled(true); }}>
        {NDA_TEXT}
      </div>
      {!scrolled && <div className="text-[11px] text-gray-400 mt-1.5">Scroll to the end to sign.</div>}
      <input className={input + ' mt-3'} placeholder="Type your full legal name" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="flex items-start gap-2.5 text-[13px] text-gray-700 cursor-pointer mt-3">
        <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        I agree to be bound by this NDA, executed electronically
      </label>
      {err && <div className="text-[12px] text-red-600 mt-3">{err}</div>}
      <button className={btnGold + ' w-full mt-4'} disabled={busy || !agree || !scrolled || name.trim().length < 4} onClick={go}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign & open the data room'}
      </button>
      <div className="text-[11px] text-gray-400 mt-2 text-center">Signature is logged with your name, the NDA version, timestamp and IP. Signing uses one of your tier's NDA slots.</div>
    </div>
  );
}

// -------- data room --------
function DataRoom({ releaseId, room, myState, onChanged, onPass }: { releaseId: string; room: any; myState: string; onChanged: () => void; onPass: () => void }) {
  const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const wm = useMemo(() => encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='420' height='240'><text x='0' y='140' font-size='15' fill='rgba(10,37,64,0.06)' transform='rotate(-22 210 120)'>${(room.watermark ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text></svg>`), [room.watermark]);
  const ask = async () => {
    setBusy(true); setErr('');
    try { await dfAsk(releaseId, q); setQ(''); onChanged(); } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  const interest = async () => {
    setBusy(true); setErr('');
    try {
      const r = await dfInterest(releaseId);
      if (r.calendly) window.open(r.calendly, '_blank');
      onChanged();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="relative rounded-2xl border border-gray-200 overflow-hidden" style={{ backgroundImage: `url("data:image/svg+xml,${wm}")` }}>
      <div className="bg-emerald-50/95 border-b border-emerald-100 px-5 py-3 flex items-center gap-2 text-[13px] text-emerald-800 font-semibold">
        <ShieldCheck className="h-4 w-4" /> Data room — NDA signed. Everything here is confidential and watermarked to you.
      </div>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">The business</div>
            <div className="font-serif text-xl font-bold text-gray-900">{room.identity?.business_name ?? '—'}</div>
            <div className="text-[13px] text-gray-500 flex items-center gap-1.5 mt-0.5">
              {room.identity?.location && <><MapPin className="h-3.5 w-3.5" />{room.identity.location} · </>}Ref {room.identity?.reference}
            </div>
          </div>
          {room.financials && (
            <div className="text-[12px] text-gray-600 bg-gray-50 rounded-xl p-3">
              {room.financials.revenue && <div>Revenue: <b>£{Number(room.financials.revenue).toLocaleString()}</b></div>}
              {room.financials.profit && <div>Net profit: <b>£{Number(room.financials.profit).toLocaleString()}</b></div>}
              {room.financials.asking_price && <div>Asking: <b>£{Number(room.financials.asking_price).toLocaleString()}</b></div>}
            </div>
          )}
        </div>
        {room.description && <p className="text-[13px] text-gray-600 mt-4 leading-relaxed">{room.description}</p>}

        <div className="mt-5">
          <div className="text-[12px] font-bold text-gray-900 mb-2 flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Documents</div>
          {room.documents?.length ? room.documents.map((doc: any) => (
            <button key={doc.id} onClick={() => dfLogOpen(releaseId, doc.id, doc.name)} className="flex items-center gap-2 text-[13px] text-gray-700 hover:text-[#0A2540] py-1 w-full text-left">
              <FileText className="h-3.5 w-3.5 text-gray-400" /> {doc.name} <span className="text-[10px] text-gray-400 ml-1">{doc.doc_kind ?? ''}</span>
            </button>
          )) : <div className="text-[12px] text-gray-400">Documents are being prepared — ask below and the team will load them for you.</div>}
        </div>

        <div className="mt-6">
          <div className="text-[12px] font-bold text-gray-900 mb-2 flex items-center gap-1.5"><MessageSquareText className="h-3.5 w-3.5" /> Q&A with the seller</div>
          {(room.qa ?? []).map((x: any) => (
            <div key={x.id} className="bg-gray-50 rounded-xl p-3 mb-2">
              <div className="text-[13px] text-gray-800"><b>Q:</b> {x.question} {x.mine && <span className="text-[10px] text-gray-400">(you)</span>}</div>
              {x.answer ? <div className="text-[13px] text-gray-600 mt-1"><b>A:</b> {x.answer}</div> : <div className="text-[11px] text-gray-400 mt-1">Awaiting answer</div>}
            </div>
          ))}
          <div className="flex gap-2 mt-2">
            <input className={input} placeholder="Ask a question — answers may be shared with all NDA'd members" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && q.trim() && ask()} />
            <button className={btnGhost} disabled={busy || !q.trim()} onClick={ask}>Ask</button>
          </div>
        </div>

        {err && <div className="text-[12px] text-red-600 mt-3">{err}</div>}
        <div className="flex gap-3 mt-6">
          {myState === 'data_room' && <button className={btnGold + ' flex-1'} disabled={busy} onClick={interest}><CalendarClock className="h-4 w-4" /> Express interest & book intro call</button>}
          {myState === 'interest_expressed' && <button className={btnGold + ' flex-1'} disabled={busy} onClick={async () => { await dfBookConfirm(releaseId); onChanged(); }}><CheckCircle2 className="h-4 w-4" /> I've booked my intro call</button>}
          {['intro_call_booked', 'offer_submitted', 'heads_of_terms', 'diligence'].includes(myState) && <div className="flex-1 text-center text-[13px] font-semibold text-gray-700 py-3 bg-gray-50 rounded-xl">{BAND_LABEL[myState]} — the OI team will progress things with you directly.</div>}
          {myState === 'data_room' && <button className={btnGhost} onClick={onPass}><ThumbsDown className="h-4 w-4" /> Pass</button>}
        </div>
      </div>
    </div>
  );
}

// -------- pass modal --------
function PassModal({ releaseId, onDone, onCancel }: { releaseId: string; onDone: () => void; onCancel: () => void }) {
  const [reason, setReason] = useState('price'); const [fb, setFb] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await dfPass(releaseId, reason, fb); onDone(); } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className={card + ' p-6 max-w-sm w-full'} onClick={(e) => e.stopPropagation()}>
        <div className="font-bold text-gray-900">Pass on this deal</div>
        <p className="text-[12px] text-gray-500 mt-1">Frees your NDA slot instantly. Your feedback goes to the seller report (anonymised).</p>
        <div className="flex flex-wrap gap-2 mt-4">
          {['price', 'sector', 'location', 'timing', 'other'].map((x) => (
            <button key={x} onClick={() => setReason(x)} className={'text-[12px] px-3 py-1.5 rounded-full border capitalize ' + (reason === x ? 'bg-[#0A2540] text-white border-[#0A2540] font-semibold' : 'border-gray-300 text-gray-600')}>{x}</button>
          ))}
        </div>
        <textarea className={input + ' mt-3'} rows={2} placeholder="Optional feedback" value={fb} onChange={(e) => setFb(e.target.value)} />
        {err && <div className="text-[12px] text-red-600 mt-2">{err}</div>}
        <div className="flex gap-2.5 mt-4">
          <button className={btnGold + ' flex-1'} disabled={busy} onClick={go}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm pass'}</button>
          <button className={btnGhost} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
