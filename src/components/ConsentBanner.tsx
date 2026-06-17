import { useState, useEffect } from 'react';

function applyConsent(v: 'granted' | 'denied') {
  try { localStorage.setItem('oi_consent', v); } catch (e) { /* ignore */ }
  const g = (window as any).gtag;
  if (typeof g === 'function') {
    g('consent', 'update', {
      ad_storage: v,
      analytics_storage: v,
      ad_user_data: v,
      ad_personalization: v,
    });
  }
  (window as any).dataLayer?.push({ event: v === 'granted' ? 'consent_accepted' : 'consent_declined' });
}

export default function ConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem('oi_consent')) setShow(true); } catch (e) { setShow(true); }
  }, []);
  if (!show) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#0A2540]/95 backdrop-blur border-t border-white/15 px-4 py-4 sm:px-6">
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <p className="text-white/80 text-sm flex-1">
          We use cookies to understand how the site is used and to improve it. You can accept or decline analytics and marketing cookies.
        </p>
        <div className="flex gap-3 shrink-0">
          <button onClick={() => { applyConsent('denied'); setShow(false); }} className="px-5 py-2 rounded-full text-sm font-semibold text-white/80 border border-white/20 hover:bg-white/10">Decline</button>
          <button onClick={() => { applyConsent('granted'); setShow(false); }} className="px-5 py-2 rounded-full text-sm font-semibold bg-[#FFD700] text-[#0A2540] hover:brightness-95">Accept</button>
        </div>
      </div>
    </div>
  );
}
