import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

// White-label seller intake for tenants: /f/:slug — branded from acq-funnel-meta,
// submits to acq-funnel (public POST). Hosted on our domain because the
// Supabase functions gateway serves HTML as text/plain.
const BASE = ((import.meta as any).env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1';

export default function SellerFunnel() {
  const { slug } = useParams();
  const [meta, setMeta] = useState<any>(null);
  const [state, setState] = useState<'form' | 'sending' | 'done' | 'error'>('form');
  useEffect(() => {
    fetch(`${BASE}/acq-funnel-meta?org=${encodeURIComponent(slug ?? '')}`).then((r) => r.json()).then(setMeta).catch(() => setMeta({}));
  }, [slug]);
  if (!meta) return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  const color = meta.color || '#0A2540'; const accent = meta.accent || '#FFD700';
  const headline = meta.headline || 'Thinking of selling your business?';
  const sub = meta.subheadline || `${meta.name || 'We'} buy established businesses directly from their owners. Confidential, fair, and on your timetable. Tell us a little about your business and we will come back to you personally within two working days.`;

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d: any = Object.fromEntries(new FormData(e.currentTarget).entries());
    if (d.website_url) return; // honeypot
    d.org = meta.slug ?? slug ?? '';
    setState('sending');
    try {
      const r = await fetch(`${BASE}/acq-funnel`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) });
      setState(r.ok ? 'done' : 'error');
    } catch { setState('error'); }
  };

  const input = 'w-full box-border p-3 border border-gray-300 rounded-lg text-[15px]';
  const label = 'block text-[13px] font-semibold mt-3.5 mb-1';
  return (
    <div className="min-h-screen" style={{ background: '#f6f7f9', color: '#16232f', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: color }} className="text-white px-5 py-12 text-center">
        {meta.logo && <img src={meta.logo} alt="" className="max-h-[52px] mx-auto mb-3.5" />}
        <h1 className="text-[clamp(26px,4vw,40px)] font-bold mb-2.5">{headline}</h1>
        <p className="max-w-[640px] mx-auto opacity-85 leading-relaxed">{sub}</p>
      </div>
      {state === 'done' ? (
        <div className="max-w-[640px] mx-auto mt-10 bg-white rounded-2xl p-9 text-center shadow-lg">
          <h2 className="text-xl font-bold mb-2">Thank you</h2>
          <p>Your details are with us. A real person will come back to you within two working days.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="max-w-[640px] mx-auto -mt-6 mb-16 bg-white rounded-2xl shadow-lg p-7">
          <input name="website_url" tabIndex={-1} autoComplete="off" className="absolute -left-[9999px]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div><label className={label}>Your name</label><input name="name" required className={input} /></div>
            <div><label className={label}>Business name</label><input name="company" required className={input} /></div>
            <div><label className={label}>Email</label><input name="email" type="email" required className={input} /></div>
            <div><label className={label}>Phone (optional)</label><input name="phone" className={input} /></div>
            <div><label className={label}>What does the business do?</label><input name="sector" className={input} /></div>
            <div><label className={label}>Where is it based?</label><input name="region" className={input} /></div>
            <div><label className={label}>Approx. annual revenue</label><input name="revenue" placeholder="e.g. £1.5m" className={input} /></div>
            <div><label className={label}>Approx. annual profit</label><input name="profit" placeholder="e.g. £300k" className={input} /></div>
          </div>
          <label className={label}>Anything you'd like us to know?</label>
          <textarea name="message" className={input + ' min-h-[90px]'} />
          <button type="submit" disabled={state === 'sending'} className="mt-5 w-full p-3.5 font-bold text-base rounded-lg disabled:opacity-60" style={{ background: accent, color }}>
            {state === 'sending' ? 'Sending…' : 'Start a confidential conversation'}
          </button>
          {state === 'error' && <p className="text-red-600 text-sm mt-2">Sorry, something went wrong. Please try again.</p>}
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">Everything you share is treated in strict confidence and used only to assess your enquiry. We never share your details. Submitting this form does not commit you to anything.</p>
        </form>
      )}
    </div>
  );
}
