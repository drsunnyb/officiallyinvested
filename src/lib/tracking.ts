const META_PIXEL_ID = '1548291360077935';
let metaLoaded = false;

export function hasConsent(): boolean {
  try { return localStorage.getItem('oi_consent') === 'granted'; } catch (e) { return false; }
}

export function loadMetaPixel(): void {
  if (metaLoaded) return;
  const w = window as any;
  if (w.fbq) { metaLoaded = true; return; }
  metaLoaded = true;
  const n: any = (w.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  });
  if (!w._fbq) w._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const t = document.createElement('script');
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s.parentNode!.insertBefore(t, s);
  w.fbq('init', META_PIXEL_ID);
  w.fbq('track', 'PageView');
}

export function trackMetaPageView(): void {
  const w = window as any;
  if (w.fbq) w.fbq('track', 'PageView');
}
