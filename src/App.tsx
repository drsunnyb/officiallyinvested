import { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import SubmitOpportunity from './pages/SubmitOpportunity';
import SellerFunnel from './pages/SellerFunnel';
import Deals, { DealPage } from './pages/deals/Deals';
import Signup from './pages/Signup';
import Pipeline from './pages/admin/Pipeline';
import Origination from './pages/admin/Origination';
import Settings from './pages/admin/Settings';
import CRMPage from './pages/admin/CRMPage';

const AUTH_HASH = /access_token=|error_code=|error=|type=recovery/;
// Snapshot before the Supabase client consumes (and strips) the token hash.
const ARRIVED_VIA_AUTH = typeof window !== 'undefined' && AUTH_HASH.test(window.location.hash);
let authRouted = false;

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    // Supabase auth callbacks land on the site root with tokens/errors in the
    // hash. Send them to the signup wizard, which resumes the journey.
    if ((hash && AUTH_HASH.test(hash)) || (ARRIVED_VIA_AUTH && !authRouted)) {
      authRouted = true;
      if (pathname === '/' || pathname === '') nav('/signup' + (hash && AUTH_HASH.test(hash) ? hash : ''), { replace: true });
      return;
    }
    if (hash) {
      try {
        const el = document.querySelector(hash);
        if (el) { el.scrollIntoView({ behavior: 'smooth' }); return; }
      } catch (_) { /* not a valid anchor - ignore */ }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function App() {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith('/admin');
  // Product surfaces carry their own chrome - no marketing nav/footer there.
  const bare = isAdmin || pathname.startsWith('/signup') || pathname.startsWith('/start') || pathname.startsWith('/deals');
  return (
    <div className="min-h-screen bg-[#0A2540]">
      <ScrollToTop />
      {!bare && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/submit-opportunity" element={<SubmitOpportunity />} />
        <Route path="/sell" element={<SubmitOpportunity />} />
        <Route path="/f/:slug" element={<SellerFunnel />} />
        <Route path="/f" element={<SellerFunnel />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/start" element={<Signup />} />
        <Route path="/deals" element={<Deals />} />
        <Route path="/deals/:id" element={<DealPage />} />
        <Route path="/admin" element={<Pipeline />} />
        <Route path="/admin/pipeline" element={<Pipeline />} />
        <Route path="/admin/origination" element={<Origination />} />
        <Route path="/admin/settings" element={<Settings />} />
        <Route path="/admin/crm" element={<CRMPage />} />
      </Routes>
      {!bare && <Footer />}
    </div>
  );
}

export default App;
