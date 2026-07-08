import { Link } from 'react-router-dom';
import { Mail, Twitter, Linkedin, Youtube, Instagram, ArrowRight } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#0A2540] text-white py-16 border-t border-white/10">
      <div className="container mx-auto px-6">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-4xl font-serif font-bold text-[#FFD700] mb-6">Dr. Sandeep Bansal</h3>
            <p className="text-white/80 max-w-md font-sans">
              Join me in building wealth through smart investing, business acquisitions, and exclusive deal flow-while giving back to our community.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-serif font-bold mb-6">Quick Links</h4>
            <ul className="space-y-4">
              <li><a href="/#about" className="text-white/80 hover:text-[#FFD700] transition-colors">About</a></li>
              <li><a href="/#podcast" className="text-white/80 hover:text-[#FFD700] transition-colors">Podcast</a></li>
              <li><a href="/#investments" className="text-white/80 hover:text-[#FFD700] transition-colors">Investments</a></li>
              <li><a href="/#community" className="text-white/80 hover:text-[#FFD700] transition-colors">Community</a></li>
              <li>
                <Link to="/submit-opportunity" className="text-white/80 hover:text-[#FFD700] transition-colors">
                  Sell Your Business or Portfolio
                </Link>
              </li>
            </ul>
          </div>

          {/* Connect */}
          <div>
            <h4 className="text-lg font-serif font-bold mb-6">Connect</h4>
            <div className="flex flex-col space-y-4">
              <a href="#" className="inline-flex items-center text-white/80 hover:text-[#FFD700] transition-colors">
                <Mail className="h-5 w-5 mr-3" />
                Email Me
              </a>
              <a href="#" className="inline-flex items-center text-white/80 hover:text-[#FFD700] transition-colors">
                <Twitter className="h-5 w-5 mr-3" />
                Twitter
              </a>
              <a href="#" className="inline-flex items-center text-white/80 hover:text-[#FFD700] transition-colors">
                <Linkedin className="h-5 w-5 mr-3" />
                LinkedIn
              </a>
              <a href="#" className="inline-flex items-center text-white/80 hover:text-[#FFD700] transition-colors">
                <Youtube className="h-5 w-5 mr-3" />
                YouTube
              </a>
            </div>
          </div>
        </div>

        {/* Instagram Gallery */}
        <div className="border-t border-white/10 pt-16">
          <div className="text-center mb-12">
            <a
              href="https://instagram.com/officially.invested"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 text-white hover:text-[#FFD700] transition-colors"
            >
              <Instagram className="h-6 w-6" />
              <span className="text-xl font-serif">@officially.invested</span>
            </a>
            <p className="text-white/80 mt-4 max-w-2xl mx-auto">
              Join over 100,000 followers for daily insights on wealth building, property investment, and business growth
            </p>
          </div>

          {/* Instagram Feed Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto mb-12">
            {[
              "/images/instagram/Screenshot 2025-08-19 at 12.00.40.png",
              "/images/instagram/Screenshot 2025-08-19 at 12.00.59.png",
              "/images/instagram/Screenshot 2025-08-19 at 12.01.41.png",
              "/images/instagram/Screenshot 2025-08-19 at 12.02.02.png"
            ].map((image, index) => (
              <a
                key={index}
                href="https://instagram.com/officially.invested"
                target="_blank"
                rel="noopener noreferrer"
                className="aspect-[9/16] bg-white/5 rounded-lg overflow-hidden hover:scale-105 transition-transform cursor-pointer relative group block"
              >
                <img
                  src={image}
                  alt={`Instagram reel ${index + 1} from @officially.invested`}
                  className="w-full h-full object-cover"
                />
                {/* Reel indicator */}
                <div className="absolute top-3 right-3 bg-black/50 rounded-full p-1">
                  <div className="w-4 h-4 border-2 border-white rounded-sm flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[4px] border-l-white border-t-[2px] border-t-transparent border-b-[2px] border-b-transparent ml-0.5"></div>
                  </div>
                </div>
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              </a>
            ))}
          </div>

          {/* View More Link */}
          <div className="text-center">
            <a
              href="https://instagram.com/officially.invested"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center bg-white/10 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all"
            >
              View More on Instagram
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </div>
        </div>

        {/* Newsletter Section */}
        <div className="border-t border-white/10 pt-16 pb-8">
          <div className="max-w-2xl mx-auto text-center">
            <h4 className="text-2xl font-serif font-bold mb-6">Join the Community</h4>
            <p className="text-white/80 mb-8">
              Get exclusive insights, investment opportunities, and community updates delivered straight to your inbox.
            </p>
            <form className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-6 py-3 bg-white/5 rounded-full focus:outline-none focus:ring-2 focus:ring-[#FFD700] text-white placeholder-white/50"
              />
              <button className="px-8 py-3 bg-[#FFD700] text-[#0A2540] rounded-full font-semibold hover:bg-opacity-90 transition-colors whitespace-nowrap">
                Subscribe
              </button>
            </form>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-white/10 mt-16 pt-8 text-center">
          <p className="text-white/60 text-sm">
            &copy; {new Date().getFullYear()} Dr. Sandeep Bansal. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
