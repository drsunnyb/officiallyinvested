import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import SubmitOpportunity from './pages/SubmitOpportunity';
import SellerFunnel from './pages/SellerFunnel';
import Pipeline from './pages/admin/Pipeline';
import Settings from './pages/admin/Settings';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
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
  return (
    <div className="min-h-screen bg-[#0A2540]">
      <ScrollToTop />
      {!isAdmin && <Header />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/submit-opportunity" element={<SubmitOpportunity />} />
        <Route path="/sell" element={<SubmitOpportunity />} />
        <Route path="/f/:slug" element={<SellerFunnel />} />
        <Route path="/f" element={<SellerFunnel />} />
        <Route path="/admin" element={<Pipeline />} />
        <Route path="/admin/pipeline" element={<Pipeline />} />
        <Route path="/admin/settings" element={<Settings />} />
      </Routes>
      {!isAdmin && <Footer />}
    </div>
  );
}

export default App;
