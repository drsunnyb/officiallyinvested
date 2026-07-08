// =============================================================================
// /signup — the front door of the Investor OS.
// 1 Account → 2 About you → 3 Buy Box coach (conversational) → 4 Workspace
// build (live lead preview from the buy box) → Origination with guided tour.
// The buy box is the engine: it drives sourcing, outreach and deal matching.
// =============================================================================
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, Check, ArrowRight, Building2, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { onboardStatus, onboardProvision, buyboxChat, buyboxCreate, sourceSearch } from '../lib/acq';

const NAVY = '#0A2540';
const GOLD = '#FFD700';
const input = 'w-full border border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540]/30 bg-white';
const btnGold = 'inline-flex items-center justify-center gap-2 bg-[#FFD700] text-[#0A2540] px-6 py-3.5 rounded-xl text-sm font-bold hover:brightness-95 disabled:opacity-40 transition w-full';

const STEPS = ['Account', 'About you', 'Your buy box', 'Your workspace'];

export default function Signup() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  // step 0
  const [email, setEmail] = useState(''); const [pw, setPw] = useState('');
  const [mode, setMode] = useState<'up' | 'in'>('up');
  const [busy, setBusy] = useState(false);
  // step 1
  const [fullName, setFullName] = useState(''); const [orgName, setOrgName] = useState('');
  const [website, setWebsite] = useState(''); const [bio, setBio] = useState('');
  // step 2 (coach)
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [proposal, setProposal] = useState<any | null>(null);
  const [thinking, setThinking] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  // step 3
  const [buildState, setBuildState] = useState<string[]>([]);
  const [preview, setPreview] = useState<any | null>(null);

  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, thinking]);

  // resume: signed-in users (incl. returning from OAuth) skip ahead
  const resume = async () => {
    try {
      const st = await onboardStatus();
      if (st.has_org && (st.buyboxes ?? 0) > 0) nav('/admin/origination');
      else if (st.has_org) { setStep(2); startCoach(); }
      else setStep(1);
    } catch (_) { setStep(1); }
  };
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => { if (data.session) resume(); });
    const { data: sub } = supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_IN') resume(); });
    return () => sub.subscription.unsubscribe();
  }, []);

  const oauth = async (provider: 'google') => {
    if (!supabase) return;
    setErr('');
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + '/signup' } });
    if (error) setErr(error.message);
  };

  const account = async () => {
    if (!supabase) return;
    setBusy(true); setErr('');
    try {
      if (mode === 'up') {
        const { data, error } = await supabase.auth.signUp({ email, password: pw });
        if (error) throw error;
        if (!data.session) { setErr('Check your inbox to confirm your email, then sign in here.'); setMode('in'); setBusy(false); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        const st = await onboardStatus().catch(() => null);
        if (st?.has_org) { if ((st.buyboxes ?? 0) > 0) { nav('/admin/origination'); return; } setStep(2); startCoach(); setBusy(false); return; }
      }
      setStep(1);
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const provision = async () => {
    setBusy(true); setErr('');
    try {
      await onboardProvision({ org_name: orgName, full_name: fullName, website, bio });
      setStep(2); startCoach();
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const startCoach = async () => {
    setThinking(true);
    try {
      const r = await buyboxChat([{ role: 'user', content: 'Hi — I have just signed up. Please introduce yourself briefly and start building my buy box.' }]);
      setMsgs([{ role: 'assistant', content: r.message }]);
    } catch (e: any) { setErr(e.message || String(e)); }
    setThinking(false);
  };

  const send = async () => {
    if (!draft.trim() || thinking) return;
    const next = [...msgs, { role: 'user', content: draft.trim() }];
    setMsgs(next); setDraft(''); setThinking(true); setErr('');
    try {
      const r = await buyboxChat(next);
      setMsgs([...next, { role: 'assistant', content: r.message }]);
      if (r.complete && r.buy_box) setProposal(r.buy_box);
    } catch (e: any) { setErr(e.message || String(e)); }
    setThinking(false);
  };

  const buildWorkspace = async () => {
    setStep(3); setErr('');
    const log = (m: string) => setBuildState((s) => [...s, m]);
    try {
      await buyboxCreate(proposal, { make_active: true, name: proposal.industries?.[0]?.label ?? 'My buy box' });
      log('Buy box saved and activated');
      log('Scanning 1.1 million UK companies against your criteria…');
      try {
        const geo = proposal.location ? { location: proposal.location, radius_miles: proposal.radius_miles ?? 25 } : {};
        const r = await sourceSearch({ categories: (proposal.industries ?? []).map((i: any) => i.key ?? i).slice(0, 5), ...geo, max_results: 25 });
        setPreview(r);
        log(`${r.total_hits ?? r.prospects?.length ?? 0} matching companies found — first ${r.prospects?.length ?? 0} added to your Prospects`);
      } catch (_) { log('Lead scan queued — your Prospects view will fill shortly'); }
      log('Outreach engine ready (letters-first, compliant by design)');
      log('Community deal flow unlocked in your sidebar');
    } catch (e: any) { setErr(e.message || String(e)); }
  };

  return (
    <div className="min-h-screen pt-20 pb-16" style={{ background: NAVY }}>
      <div className="max-w-xl mx-auto px-4">
        {/* progress */}
        <div className="flex items-center justify-center gap-2 pt-8 pb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={'h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold ' + (i < step ? 'bg-emerald-400 text-[#0A2540]' : i === step ? 'bg-[#FFD700] text-[#0A2540]' : 'bg-white/10 text-white/40')}>
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={'text-[11px] hidden sm:inline ' + (i === step ? 'text-white font-semibold' : 'text-white/40')}>{s}</span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-white/15" />}
            </div>
          ))}
        </div>

        {err && <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[13px] rounded-xl px-4 py-2.5 mb-4">{err}</div>}

        {step === 0 && (
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <div className="text-center">
              <div className="inline-flex h-12 w-12 rounded-2xl items-center justify-center mb-4" style={{ background: GOLD }}><Sparkles className="h-6 w-6" style={{ color: NAVY }} /></div>
              <h1 className="font-serif text-2xl font-bold text-gray-900">Your Investor OS starts here</h1>
              <p className="text-[13px] text-gray-500 mt-2">Buy a business, not a job. We'll build your buy box, find matching owners, and run the approach — you make the decisions.</p>
            </div>
            <div className="mt-6 space-y-2.5">
              <button onClick={() => oauth('google')} className="w-full flex items-center justify-center gap-2.5 border border-gray-300 rounded-xl py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition">
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 40.4 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
                Continue with Google
              </button>              <div className="flex items-center gap-3 py-1"><div className="flex-1 h-px bg-gray-200" /><span className="text-[11px] text-gray-400 uppercase tracking-wider">or with email</span><div className="flex-1 h-px bg-gray-200" /></div>
            </div>
            <input className={input} type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <input className={input + ' mt-2.5'} type="password" placeholder="Password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && account()} />
            <button className={btnGold + ' mt-5'} disabled={busy || !email.includes('@') || pw.length < 8} onClick={account}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'up' ? <>Create my workspace <ArrowRight className="h-4 w-4" /></> : 'Sign in'}
            </button>
            <button className="text-[12px] text-gray-500 hover:text-gray-800 mt-4 w-full" onClick={() => setMode(mode === 'up' ? 'in' : 'up')}>
              {mode === 'up' ? 'Already have an account? Sign in' : 'New here? Create an account'}
            </button>
            <div className="text-[11px] text-gray-400 text-center mt-4">Free to start. No card required. Your pipeline and CRM are free forever.</div>
          </div>
        )}

        {step === 1 && (
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <h1 className="font-serif text-2xl font-bold text-gray-900">About you</h1>
            <p className="text-[13px] text-gray-500 mt-1.5">This shapes everything — your buy box, and the credibility woven into every letter we send for you.</p>
            <input className={input + ' mt-5'} placeholder="Your full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            <input className={input + ' mt-2.5'} placeholder="Company / workspace name (e.g. Bansal Acquisitions)" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            <input className={input + ' mt-2.5'} placeholder="Website or LinkedIn (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} />
            <textarea className={input + ' mt-2.5'} rows={3} placeholder="One or two lines on your background (optional — the coach will dig deeper next)" value={bio} onChange={(e) => setBio(e.target.value)} />
            <button className={btnGold + ' mt-5'} disabled={busy || !fullName.trim()} onClick={provision}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Continue to your Buy Box coach <ArrowRight className="h-4 w-4" /></>}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
            <div className="px-6 py-4" style={{ background: NAVY }}>
              <div className="text-[#FFD700] font-serif font-bold">Buy Box coach</div>
              <div className="text-white/50 text-[11px] mt-0.5">Your expertise + your capital → the businesses you should own. 5 minutes, conversational.</div>
            </div>
            <div className="h-[380px] overflow-y-auto p-5 space-y-3 bg-gray-50">
              {msgs.map((m, i) => (
                <div key={i} className={'max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap ' + (m.role === 'user' ? 'ml-auto bg-[#0A2540] text-white' : 'bg-white border border-gray-200 text-gray-800')}>{m.content}</div>
              ))}
              {thinking && <div className="bg-white border border-gray-200 rounded-2xl px-4 py-2.5 w-16 text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /></div>}
              <div ref={chatEnd} />
            </div>
            {proposal ? (
              <div className="p-5 border-t border-gray-100">
                <div className="bg-[#FFFDF2] border-2 border-[#FFD700] rounded-2xl p-4">
                  <div className="font-bold text-gray-900 text-[14px] flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-[#0A2540]" /> Your buy box is ready</div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(proposal.industries ?? []).slice(0, 6).map((x: any, i: number) => <span key={i} className="bg-[#0A2540] text-white text-[11px] px-2.5 py-1 rounded-full">{x.label ?? x}</span>)}
                  </div>
                  {proposal.rationale && <p className="text-[12px] text-gray-600 mt-2 italic">{String(proposal.rationale).slice(0, 220)}</p>}
                </div>
                <button className={btnGold + ' mt-4'} onClick={buildWorkspace}>Build my workspace <ArrowRight className="h-4 w-4" /></button>
                <button className="text-[12px] text-gray-500 hover:text-gray-800 mt-2.5 w-full" onClick={() => setProposal(null)}>Keep refining instead</button>
              </div>
            ) : (
              <div className="p-4 border-t border-gray-100 flex gap-2">
                <textarea className={input + ' resize-none'} rows={2} placeholder="Type here… (Enter to send)" value={draft} onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button className="bg-[#0A2540] text-white rounded-xl px-4 disabled:opacity-40" disabled={thinking || !draft.trim()} onClick={send}><Send className="h-4 w-4" /></button>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="bg-white rounded-3xl shadow-2xl p-8">
            <h1 className="font-serif text-2xl font-bold text-gray-900">Building your workspace</h1>
            <div className="mt-5 space-y-3">
              {buildState.map((m, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[13px] text-gray-700">
                  <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />{m}
                </div>
              ))}
              {buildState.length < 4 && <div className="flex items-center gap-2.5 text-[13px] text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Working…</div>}
            </div>
            {preview?.prospects?.length > 0 && (
              <div className="mt-5 bg-gray-50 rounded-2xl p-4">
                <div className="text-[12px] font-bold text-gray-900 mb-2 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> A taste of what's waiting in your Prospects</div>
                {preview.prospects.slice(0, 4).map((p: any) => (
                  <div key={p.id ?? p.company_number} className="flex items-center justify-between text-[12px] py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-gray-800 font-medium truncate">{p.company_name}</span>
                    <span className="text-gray-400 shrink-0 ml-3">{p.region ?? p.postcode ?? ''}{p.fit_score ? ` · fit ${p.fit_score}` : ''}</span>
                  </div>
                ))}
              </div>
            )}
            {buildState.length >= 4 && (
              <button className={btnGold + ' mt-6'} onClick={() => nav('/admin/origination?tour=1')}>Enter your Investor OS <ArrowRight className="h-4 w-4" /></button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
