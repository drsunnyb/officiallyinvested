import React from 'react';
import { Menu, ArrowRight, Building2, TrendingUp, Users, BookOpen, Target, Rocket, ArrowUpRight, Mail, Twitter, Linkedin, Youtube, Instagram } from 'lucide-react';

function App() {
  return (
    <div className="min-h-screen bg-[#0A2540]">
      {/* Header */}
      <header className="fixed w-full z-50 bg-[#0A2540]/90 backdrop-blur-sm">
        <div className="container mx-auto px-6 py-4">
          <nav className="flex items-center justify-between">
            <div className="hidden md:flex items-center space-x-12">
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Home</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">About</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Book</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Blog</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Courses</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Podcast</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Speaking</a>
              <a href="#" className="text-white hover:text-[#FFD700] transition-colors">Freebies</a>
            </div>
            <button className="md:hidden text-white">
              <Menu className="h-6 w-6" />
            </button>
            <div className="hidden md:block">
              <div className="w-12 h-12 bg-[#FFD700] rounded-diamond rotate-45"></div>
            </div>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/99C8F9E7-1CBC-48EC-9C16-AA2D485CF5EF_1_105_c.jpeg"
            alt="Dr. Sandeep Bansal"
            className="w-full h-full object-cover object-center md:object-[center_top]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A2540]/95 via-[#0A2540]/60 to-transparent"></div>
        </div>

        <div className="relative z-10 container mx-auto px-6">
          <div className="flex flex-col min-h-screen justify-center pt-20 md:pt-0">
            <div className="max-w-4xl relative">
              <h1 className="text-6xl md:text-7xl lg:text-8xl font-serif font-bold leading-tight text-[#FFD700] mb-6">
                I'm Dr. Sandeep Bansal, and I'm Officially Invested...
                <span className="block mt-2 text-white">(In You!)</span>
              </h1>

              <p className="text-xl md:text-2xl text-white/90 max-w-3xl mb-12 leading-relaxed">
                Wealth-building shouldn't be a secret. I built £60M+ in wealth through smart investing, business acquisitions, and exclusive deal flow—without shortcuts. Now, I'm helping investors like you do the same, while reinvesting every pound from this community back into its people.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="flex items-center space-x-4">
                  <div className="text-4xl font-bold text-[#FFD700]">£60M+</div>
                  <div className="text-white/80">in assets under management</div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-4xl font-bold text-[#FFD700]">100+</div>
                  <div className="text-white/80">HNWIs & PE firms trust us</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <a
                  href="#investments"
                  className="group inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all"
                >
                  View Full Track Record
                  <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                </a>
                <a
                  href="#community"
                  className="group inline-flex items-center border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all"
                >
                  Join the Community
                  <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
                </a>
              </div>

              <div className="mt-12">
                <div className="text-white text-sm font-medium uppercase tracking-wider mb-4">
                  FEATURED IN
                </div>
                <div className="flex items-center space-x-8">
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/0/0c/Forbes_logo.svg"
                    alt="Forbes"
                    className="h-8 opacity-80 invert"
                  />
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/2/2e/Financial_Times_corporate_logo.svg"
                    alt="Financial Times"
                    className="h-8 opacity-80 invert"
                  />
                  <img 
                    src="https://upload.wikimedia.org/wikipedia/commons/5/5d/Bloomberg_Business_logo.svg"
                    alt="Bloomberg"
                    className="h-8 opacity-80 invert"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Journey Section */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">
              From £50K to £60M+ – The Strategies the Ultra-Wealthy Use
              <span className="block text-2xl mt-4 text-gray-600">(That No One Taught Us)</span>
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              I didn't grow up in a world where wealth-building was taught. I had to learn the hard way—through failures, wins, and uncovering the investment strategies of the ultra-wealthy. Now, I'm giving others access to this knowledge and the opportunities that were once kept behind closed doors.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: Target,
                title: "Where It Started",
                description: "£50K starting capital, no inside knowledge, learning through trial and error."
              },
              {
                icon: TrendingUp,
                title: "Breaking Into High-Level Investing",
                description: "Understanding capital allocation, strategic acquisitions, and private deal flow."
              },
              {
                icon: Users,
                title: "Why I'm Sharing This Now",
                description: "Wealth shouldn't be built in isolation. I'm reinvesting everything back into this community."
              }
            ].map((step, index) => (
              <div key={index} className="bg-gray-50 p-8 rounded-2xl hover:shadow-xl transition-shadow">
                <step.icon className="h-12 w-12 text-[#FFD700] mb-6" />
                <h3 className="text-xl font-bold text-[#0A2540] mb-4">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Podcast Section */}
      <section className="py-24 bg-[#0A2540] text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Inside the Minds of the World's Top Investors & Entrepreneurs
            </h2>
            <p className="text-xl text-white/80 leading-relaxed">
              Join me as I sit down with the best minds in property, business, and finance to uncover the real strategies behind wealth creation. No hype, just insights you won't hear anywhere else.
            </p>
          </div>

          {/* Latest Episode - YouTube Video */}
          <div className="max-w-4xl mx-auto mb-16">
            <div className="relative pt-[56.25%] rounded-2xl overflow-hidden bg-white/5">
              <iframe
                src="https://www.youtube.com/embed/your-video-id"
                title="Latest Episode"
                className="absolute top-0 left-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
            <div className="mt-6 text-center">
              <h3 className="text-2xl font-bold mb-2">Latest Episode</h3>
              <p className="text-white/80">Building a £100M Property Portfolio: The Ultimate Guide</p>
            </div>
          </div>

          {/* Past Guests Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {[
              {
                name: "Sarah Johnson",
                role: "CEO, Global Investments Ltd",
                image: "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&q=80&w=300&h=300"
              },
              {
                name: "Michael Chang",
                role: "Founder, Tech Ventures Capital",
                image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=300&h=300"
              },
              {
                name: "Emma Williams",
                role: "Real Estate Mogul",
                image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=300&h=300"
              }
            ].map((guest, index) => (
              <div key={index} className="bg-white/5 rounded-xl p-6 hover:bg-white/10 transition-all">
                <img 
                  src={guest.image} 
                  alt={guest.name}
                  className="w-24 h-24 rounded-full mx-auto mb-4 object-cover"
                />
                <h4 className="text-xl font-bold text-center mb-2">{guest.name}</h4>
                <p className="text-white/60 text-center">{guest.role}</p>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="flex flex-col md:flex-row gap-6 justify-center">
            <a 
              href="https://www.youtube.com/channel/your-channel-id" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="group inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all"
            >
              Watch on YouTube
              <Youtube className="ml-2 h-5 w-5" />
            </a>
            <a href="#" className="group inline-flex items-center bg-white/10 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all">
              Join for Exclusive Episodes
              <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section id="community" className="py-24 bg-[#0A2540] text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              A Community Built for Growth
              <span className="block text-[#FFD700] mt-2">Where Every Pound Is Reinvested in You</span>
            </h2>
            <p className="text-xl text-white/80 leading-relaxed">
              This isn't just another education platform. Every single pound from our community and education programs is reinvested back into creating better content, bringing in world-class experts, and even funding the businesses of our most promising graduates.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: BookOpen,
                title: "Premium Content & Masterclasses",
                description: "We constantly upgrade our educational material, ensuring our members get the best insights from real-world experts."
              },
              {
                icon: Users,
                title: "Exclusive Access to Top Investors",
                description: "We bring in speakers and mentors that most people would never have access to."
              },
              {
                icon: Rocket,
                title: "Investment in Graduates",
                description: "The most promising community members get direct investment, mentorship, and access to capital."
              }
            ].map((feature, index) => (
              <div key={index} className="bg-white/5 p-8 rounded-2xl hover:bg-white/10 transition-colors">
                <feature.icon className="h-12 w-12 text-[#FFD700] mb-6" />
                <h3 className="text-xl font-bold mb-4">{feature.title}</h3>
                <p className="text-white/80">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <a href="#" className="group inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all">
              Join the Community & Start Learning
              <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Investment Opportunities Section */}
      <section id="investments" className="py-24 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">
              For the First Time Ever—Invest Alongside Me
              <span className="block text-[#FFD700] mt-2">in High-Growth Opportunities</span>
            </h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              For years, the best investment opportunities were available only to those with insider knowledge. Now, I'm giving serious investors access to these exclusive, high-growth opportunities while reinvesting every penny from our education and community programs.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: Building2,
                title: "Luxury Resorts & Hospitality",
                description: "LQ Resorts & short-term lets with proven track records."
              },
              {
                icon: Users,
                title: "Senior Living & Healthcare",
                description: "Old-age homes and wellness retreats in prime locations."
              },
              {
                icon: TrendingUp,
                title: "Fintech & Proptech Startups",
                description: "Technology disrupting finance & property sectors."
              }
            ].map((opportunity, index) => (
              <div key={index} className="group cursor-pointer">
                <div className="bg-white p-8 rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow">
                  <opportunity.icon className="h-12 w-12 text-[#FFD700] mb-6" />
                  <h3 className="text-xl font-bold text-[#0A2540] mb-4">{opportunity.title}</h3>
                  <p className="text-gray-600 mb-6">{opportunity.description}</p>
                  <a href="#" className="inline-flex items-center text-[#0A2540] font-semibold group-hover:text-[#FFD700] transition-colors">
                    Learn More
                    <ArrowUpRight className="ml-2 h-5 w-5" />
                  </a>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <a href="#" className="group inline-flex items-center bg-[#0A2540] text-white px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all">
              Apply to Invest
              <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-24 bg-[#0A2540] text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=2000&h=1200')] bg-cover bg-center opacity-10"></div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">
              Build Wealth. Change Lives.
              <span className="block text-[#FFD700] mt-2">Join a Movement That Gives Back</span>
            </h2>
            <p className="text-xl text-white/80 leading-relaxed mb-12">
              Every investment in knowledge fuels something bigger. By joining Officially Invested, you're not just learning—you're contributing to a growing ecosystem that reinvests in the next generation of investors and business leaders.
            </p>
            <div className="flex flex-col md:flex-row gap-6 justify-center">
              <a href="#" className="group inline-flex items-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all">
                Invest with Me
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#" className="group inline-flex items-center bg-white/10 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/20 transition-all">
                Join the Community
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </a>
              <a href="#" className="group inline-flex items-center border-2 border-white/20 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all">
                Book a Consultation
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0A2540] text-white py-16 border-t border-white/10">
        <div className="container mx-auto px-6">
          {/* Main Footer Content */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
            {/* Brand Column */}
            <div className="col-span-1 md:col-span-2">
              <h3 className="text-4xl font-serif font-bold text-[#FFD700] mb-6">Dr. Sandeep Bansal</h3>
              <p className="text-white/80 max-w-md font-sans">
                Join me in building wealth through smart investing, business acquisitions, and exclusive deal flow—while giving back to our community.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-lg font-serif font-bold mb-6">Quick Links</h4>
              <ul className="space-y-4">
                <li><a href="#" className="text-white/80 hover:text-[#FFD700] transition-colors">About</a></li>
                <li><a href="#" className="text-white/80 hover:text-[#FFD700] transition-colors">Podcast</a></li>
                <li><a href="#" className="text-white/80 hover:text-[#FFD700] transition-colors">Investments</a></li>
                <li><a href="#" className="text-white/80 hover:text-[#FFD700] transition-colors">Community</a></li>
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
    </div>
  );
}

export default App;