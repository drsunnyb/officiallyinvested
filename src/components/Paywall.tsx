// Paywall - shown whenever a free workspace touches a paid capability.
// Goes straight to Stripe Checkout; falls back to email if payments are off.
import { useState } from 'react';
import { X, Sparkles, Check, Loader2 } from 'lucide-react';
import { billingCheckout } from '../lib/acq';

const TIERS: { key: 'analyst' | 'originator' | 'team'; name: string; price: string; blurb: string; feats: string[]; featured?: boolean }[] = [
  { key: 'analyst', name: 'Analyst', price: '£99', blurb: 'Screen 30 businesses, take 2 to offer. Every month.', feats: ['100 AI credits + 10 letters included monthly', 'Full AI analysis, committee, memos & drafts in your voice', 'Unlimited pipeline deals & CRM', 'Member deals open to you on day 7'] },
  { key: 'originator', name: 'Originator', price: '£299', blurb: '100 letters to owners a month = 3-8 seller conversations', featured: true, feats: ['300 AI credits + 100 letter credits included monthly', 'Screen 100 businesses, run 5 live offers at once', 'Automated sourcing across 1.1m companies + seller funnel', 'Member deals on day 3 · 3 NDA slots'] },
  { key: 'team', name: 'Team', price: '£749', blurb: 'A full buy-side operation', feats: ['1,000 AI credits + 400 letters included monthly', '5 users · 10+ concurrent deals', 'Member deals on day one · unlimited NDA slots · first look, always', 'Priority support'] },
];

export default function Paywall({ onClose, context }: { onClose: () => void; context?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const go = async (plan: 'analyst' | 'originator' | 'team') => {
    setBusy(plan); setErr('');
    try {
      const r = await billingCheckout(plan);
      if (r.url) { window.location.href = r.url; return; }
      setErr(r.message || r.error || 'Checkout unavailable - email sandeep@officiallyinvested.com');
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy(null);
  };
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0A2540] bg-[#FFD700] px-2.5 py-1 rounded-full"><Sparkles className="h-3 w-3" /> Upgrade to unlock</div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mt-3">{context ?? 'This is where the AI takes over'}</h2>
            <p className="text-[13px] text-gray-500 mt-1 max-w-lg">Your pipeline and CRM stay free forever. The AI analyst, automated outreach and full deal access are what paying members get.</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="grid sm:grid-cols-3 gap-4 mt-6">
          {TIERS.map((t) => (
            <div key={t.key} className={'rounded-2xl border p-5 flex flex-col ' + (t.featured ? 'border-[#FFD700] shadow-xl relative bg-gradient-to-b from-[#FFFDF2] to-white' : 'border-gray-200 bg-white')}>
              {t.featured && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-[#FFD700] text-[#0A2540] text-[10px] font-bold px-3 py-0.5 rounded-full">MOST POPULAR</span>}
              <div className="font-bold text-gray-900">{t.name}</div>
              <div className="mt-1"><span className="font-serif text-3xl font-bold text-gray-900">{t.price}</span><span className="text-gray-400 text-[12px]">/month</span></div>
              <div className="text-[12px] text-gray-500 mt-0.5">{t.blurb}</div>
              <ul className="mt-3 space-y-1.5 flex-1">
                {t.feats.map((f) => <li key={f} className="flex items-start gap-1.5 text-[12px] text-gray-600"><Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-px" />{f}</li>)}
              </ul>
              <button onClick={() => go(t.key)} disabled={!!busy}
                className={'mt-4 w-full rounded-xl py-2.5 text-sm font-bold transition ' + (t.featured ? 'bg-[#FFD700] text-[#0A2540] hover:brightness-95' : 'bg-[#0A2540] text-white hover:bg-[#0E3257]')}>
                {busy === t.key ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `Choose ${t.name}`}
              </button>
            </div>
          ))}
        </div>
        {err && (
          <div className="flex items-start gap-2.5 text-[12.5px] text-[#0A2540] bg-[#FFFDF2] border border-[#FFD700]/60 rounded-xl px-4 py-3 mt-4">
            <Sparkles className="h-4 w-4 text-[#C9A227] shrink-0 mt-0.5" />
            <span>{/not_configured/i.test(err) ? 'Card payments switch on this week. Email sandeep@officiallyinvested.com and we will set your plan up personally today, same price.' : err}</span>
          </div>
        )}
        <div className="text-[11px] text-gray-400 text-center mt-4">Monthly credits reset on the 1st; purchased top-ups roll over. Cancel any time. Annual (2 months free) available - ask us.</div>
      </div>
    </div>
  );
}

// ============ Credits: balances + tiered top-up packs ============
import { useEffect } from 'react';
import { Zap, Mail } from 'lucide-react';
import { creditsBalance, creditsConsume, creditsTopup } from '../lib/acq';

/** Consume credits before a metered action. Returns true when allowed;
 *  dispatches oi:topup (handled by the page) when the tank is empty. */
export async function ensureCredits(kind: 'ai' | 'letter', amount = 1, reason?: string): Promise<boolean> {
  try {
    const r = await creditsConsume(kind, amount, reason);
    if (r.ok) return true;
    window.dispatchEvent(new CustomEvent('oi:topup', { detail: { kind } }));
    return false;
  } catch {
    return true; // never hard-block on a metering outage
  }
}

export function CreditsTopUp({ onClose, focus }: { onClose: () => void; focus?: 'ai' | 'letter' }) {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [plans, setPlans] = useState(false);
  useEffect(() => { creditsBalance().then(setData).catch((e) => setErr(e.message || String(e))); }, []);
  const buy = async (pack: string) => {
    setBusy(pack); setErr('');
    try {
      const r = await creditsTopup(pack);
      if (r.url) { window.location.href = r.url; return; }
      setErr(r.message || r.error || 'Checkout unavailable');
    } catch (e: any) { setErr(e.message || String(e)); }
    setBusy('');
  };
  if (plans) return <Paywall context="Upgrading beats topping up if you use this monthly" onClose={onClose} />;
  const packs = data?.packs ?? {};
  const group = (k: string) => Object.entries(packs).filter(([, p]: any) => p.kind === k) as [string, any][];
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 my-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0A2540] bg-[#FFD700] px-2.5 py-1 rounded-full"><Zap className="h-3 w-3" /> Credits</div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mt-3">{focus === 'letter' ? 'You need more letter credits' : focus === 'ai' ? 'You need more AI credits' : 'Your credits'}</h2>
            {data && <p className="text-[13px] text-gray-500 mt-1">Balance: <b>{data.ai}</b> AI credits · <b>{data.letter}</b> letter credits. Monthly allowance resets on the 1st; purchased packs roll over.</p>}
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-5 mt-6">
          {[['ai', 'AI credits', Zap, 'One credit = one AI run (analysis, committee, memo, drafting)'], ['letter', 'Letter credits', Mail, 'One credit = one physical letter printed and posted']].map(([k, label, Icon, sub]: any) => (
            <div key={k} className={'rounded-2xl border p-4 ' + (focus === k ? 'border-[#FFD700] shadow-lg' : 'border-gray-200')}>
              <div className="font-bold text-gray-900 flex items-center gap-1.5"><Icon className="h-4 w-4 text-[#0A2540]" /> {label}</div>
              <div className="text-[11px] text-gray-400 mt-0.5 mb-3">{sub}</div>
              {group(k).map(([key, p]) => (
                <button key={key} onClick={() => buy(key)} disabled={!!busy}
                  className="w-full flex items-center justify-between border border-gray-200 hover:border-[#0A2540] rounded-xl px-3.5 py-2.5 mb-2 text-left transition">
                  <span className="text-[13px] font-semibold text-gray-800">{p.label}</span>
                  <span className="text-[13px] font-bold text-[#0A2540]">{busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : `£${(p.amount / 100).toLocaleString()}`}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
        {err && <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-4">{err}</div>}
        <button className="w-full mt-5 text-[13px] font-bold text-[#0A2540] underline underline-offset-4" onClick={() => setPlans(true)}>Using these every month? Upgrading your plan is better value →</button>
      </div>
    </div>
  );
}

// ============ Unlock chooser: subscribe or pay as you go ============
export function UnlockChoice({ onClose, context }: { onClose: () => void; context?: string }) {
  const [path, setPath] = useState<'plans' | 'credits' | null>(null);
  if (path === 'plans') return <Paywall context={context} onClose={onClose} />;
  if (path === 'credits') return <CreditsTopUp focus="letter" onClose={onClose} />;
  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#0A2540] bg-[#FFD700] px-2.5 py-1 rounded-full"><Sparkles className="h-3 w-3" /> Ready to reach owners</div>
            <h2 className="font-serif text-2xl font-bold text-gray-900 mt-3">{context ?? 'Two ways to power your outreach'}</h2>
            <p className="text-[13px] text-gray-500 mt-1">Letters cost one credit each. Pick whichever suits how you buy.</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-6">
          <button onClick={() => setPath('plans')} className="text-left rounded-2xl border-2 border-[#FFD700] p-5 hover:shadow-lg transition relative">
            <span className="absolute -top-2.5 left-5 bg-[#FFD700] text-[#0A2540] text-[10px] font-bold px-2.5 py-0.5 rounded-full">BEST VALUE</span>
            <div className="font-bold text-gray-900 text-[15px]">Subscribe</div>
            <div className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">Monthly letter and AI credits included, plus automated sourcing across 1.1m companies, the AI analyst and member deal access. From £99 a month.</div>
            <div className="text-[13px] font-bold text-[#0A2540] mt-3">See plans →</div>
          </button>
          <button onClick={() => setPath('credits')} className="text-left rounded-2xl border border-gray-200 p-5 hover:shadow-lg hover:border-gray-300 transition">
            <div className="font-bold text-gray-900 text-[15px]">Buy credits as you go</div>
            <div className="text-[12.5px] text-gray-500 mt-1 leading-relaxed">No subscription. Buy a pack of letter credits, they never expire, and your campaign posts letters until the pack runs out. From £70 for 50 letters.</div>
            <div className="text-[13px] font-bold text-[#0A2540] mt-3">See credit packs →</div>
          </button>
        </div>
        <div className="text-[11px] text-gray-400 text-center mt-5">Either way, nothing sends without your approval and every letter is drafted in your voice.</div>
      </div>
    </div>
  );
}

