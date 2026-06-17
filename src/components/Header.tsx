import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About', to: '/#about' },
  { label: 'Book', to: '/#book' },
  { label: 'Blog', to: '/#blog' },
  { label: 'Courses', to: '/#courses' },
  { label: 'Podcast', to: '/#podcast' },
  { label: 'Speaking', to: '/#speaking' },
];

export default function Header() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed w-full z-50 bg-[#0A2540]/90 backdrop-blur-sm">
      <div className="container mx-auto px-6 py-4">
        <nav className="flex items-center justify-between">
          <div className="hidden md:flex items-center space-x-10">
            {NAV_LINKS.map((link) => (
              <Link key={link.label} to={link.to} className="text-white hover:text-[#FFD700] transition-colors">
                {link.label}
              </Link>
            ))}
            <Link
              to="/submit-opportunity"
              className="border-2 border-[#FFD700] text-[#FFD700] px-5 py-2 rounded-full font-semibold hover:bg-[#FFD700] hover:text-[#0A2540] transition-all"
            >
              Sell to Us
            </Link>
          </div>
          <button className="md:hidden text-white" onClick={() => setOpen(!open)} aria-label="Menu">
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="hidden md:block">
            <div className="w-12 h-12 bg-[#FFD700] rounded-diamond rotate-45"></div>
          </div>
        </nav>

        {open && (
          <div className="md:hidden mt-4 pb-4 flex flex-col space-y-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                to={link.to}
                className="text-white hover:text-[#FFD700] transition-colors"
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/submit-opportunity"
              className="inline-flex w-fit border-2 border-[#FFD700] text-[#FFD700] px-5 py-2 rounded-full font-semibold"
              onClick={() => setOpen(false)}
            >
              Sell to Us
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
