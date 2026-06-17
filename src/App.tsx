import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ConsentBanner from './components/ConsentBanner';
import { loadMetaPixel, trackMetaPageView, hasConsent } from './lib/tracking';
import Home from './pages/Home';
import SubmitOpportunity from './pages/SubmitOpportunity';
import Pipeline from './pages/admin/Pipeline';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    (window as any).dataLayer?.push({ event: 'page_view', page_path: pathname + (hash || '') });
    trackMetaPageView();
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  useEffect(() => { if (hasConsent()) loadMetaPixel(); }, []);
  return (
    <div className="min-h-screen bg-[#0A2540]">
      <ScrollToTop />
      {!isAdmin && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/submit-opportunity" element={<SubmitOpportunity />} />
        <Route path="/sell" element={<SubmitOpportunity />} />
        <Route path="/admin" element={<Pipeline />} />
        <Route path="/admin/pipeline" element={<Pipeline />} />
      </Routes>
      {!isAdmin && <Footer />}
      {!isAdmin && <ConsentBanner />}
    </div>
  );
}

export default App;
