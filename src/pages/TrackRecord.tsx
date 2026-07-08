import { Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Building2, HeartPulse, Home as HomeIcon, Target, TrendingUp, Recycle, LogOut } from 'lucide-react';

const IMG = '/portfolio/assets/img';

const HERO_STATS = [
  { num: '£65M', label: 'AUM built' },
  { num: '22 yrs', label: 'Operating' },
  { num: '700+', label: 'Beds & keys' },
];

const TRACK_STATS = [
  { pre: '£', num: '65', post: 'M', label: 'AUM Built' },
  { pre: '', num: '300', post: '+', label: 'Care Beds Operated' },
  { pre: '', num: '400', post: '+', label: 'Hotel Keys' },
  { pre: '£', num: '24', post: 'M', label: 'Hospitality Revenue' },
  { pre: '£', num: '16', post: 'M', label: 'Healthcare Revenue' },
  { pre: '', num: '240', post: 'K', label: 'Guests / Year' },
];

const SECTORS = [
  { no: '01', name: 'Hospitality', status: 'Proven', detail: '400+ keys · £24M revenue · 240,000 guests / year' },
  { no: '02', name: 'Healthcare', status: 'Proven', detail: '300+ care beds · £16M revenue · £4M EBITDA' },
  { no: '03', name: 'Value-add Property', status: 'Selectively extending', detail: 'BRRRR-style residential and mixed-use · same playbook, smaller ticket, faster recycle' },
];
const SECTOR_ICONS = [Building2, HeartPulse, HomeIcon];

const STEPS = [
  { icon: Target, title: 'Acquire', description: 'Source under-monetised assets - distressed, succession-driven, mispriced. Our network and reputation surface deals before they reach the open market.' },
  { icon: TrendingUp, title: 'Improve', description: 'Apply our operating playbook - margin discipline, brand repositioning, regulatory stewardship. The lift comes from execution, not financial engineering.' },
  { icon: Recycle, title: 'Reinvest', description: 'Capital recycled into the asset to unlock revenue-mix expansion, EBITDA growth, and asset-value re-rating.' },
  { icon: LogOut, title: 'Exit', description: 'Exit to strategic buyers at strength, or roll into a larger platform for compounding multiple expansion.' },
];

const CASES = [
  {
    no: 'i', name: 'Nursing Home Platform Roll-Up', meta: 'Healthcare · 12 years · Single asset → £16M revenue platform',
    narrative: 'Grew from a single site to a multi-home operating platform through disciplined acquisition and shared services. Reached £16M revenue and £4M EBITDA at a 25% margin.',
    stats: [['300+', 'Care Beds'], ['£16M', 'Revenue'], ['25%', 'EBITDA Margin']],
    img: `${IMG}/glan-yr-afon.jpg`, alt: 'Glan-Yr-Afon Residential Care & Nursing Home, Wales',
  },
  {
    no: 'ii', name: 'First Exit - Avenue Road Nursing Home', meta: 'Healthcare · 14 years · 2.1× capital return',
    narrative: 'Acquired in 2003 for £850K with £180K EBITDA. Grew EBITDA to £270K (+50%) through operational discipline before a clean exit to a strategic buyer 14 years later at £1.8M.',
    stats: [['£850K → £1.8M', 'Asset Value'], ['+50%', 'EBITDA Growth'], ['2.1×', 'Capital Return']],
    img: `${IMG}/avenue-road-lounge.jpg`, alt: 'Avenue Road Nursing Home communal lounge',
  },
  {
    no: 'iii', name: 'Lion Quays Resort', meta: 'Hospitality · 4 years · Acquired from PE',
    narrative: 'Acquired from a PE firm at £10.5M with £1.05M EBITDA. £2.1M reinvested over 4 years to expand revenue mix across spa, accommodation, events, and F&B - EBITDA up 50%, asset value up 52%.',
    stats: [['£10.5M → £16M', 'Asset Value'], ['+50%', 'EBITDA Lift'], ['£2.1M', 'Reinvested']],
    img: `${IMG}/lion-quays-suite-exterior.jpg`, alt: 'Lion Quays exclusive suite with private sauna',
  },
  {
    no: 'iv', name: 'Langstone Quays Resort', meta: 'Hospitality · 30 months · Acquired from PE',
    narrative: 'Acquired from a PE firm at £13M with £1.3M EBITDA. £2M reinvested over 30 months to broaden the guest offering - bedrooms, F&B, events. £3M asset-value uplift in two and a half years.',
    stats: [['£13M → £16M', 'Asset Value'], ['+£200K', 'EBITDA Lift'], ['£2M', 'Reinvested']],
    img: `${IMG}/langstone-restaurant.jpg`, alt: 'Langstone Quays waterside restaurant',
  },
  {
    no: 'v', name: 'Ufford Park', meta: 'Hospitality · 18 months · 2022 acquisition',
    narrative: 'Acquired in 2022 for £7.5M with £700K EBITDA. £1M operational investment delivered a 40% EBITDA uplift and a 33% valuation gain in 18 months.',
    stats: [['+33%', 'Valuation Uplift'], ['+40%', 'EBITDA Lift'], ['£1M', 'Reinvested']],
    img: `${IMG}/ufford-hero.jpg`, alt: 'Ufford Park resort at twilight',
  },
  {
    no: 'vi', name: 'Mentee Program - Principal Investor Development', meta: 'Healthcare · Forward-looking · Platform mentorship',
    narrative: 'Mentored James from PE analyst to principal investor. On track to acquire 5 nursing homes over 4–5 years while re-rating the portfolio multiple from 6× to 8× EBITDA - using our acquisition and roll-up playbook.',
    stats: [['5 Homes', 'Pipeline'], ['6× → 8×', 'EBITDA Re-Rating'], ['4–5 yrs', 'Timeline']],
    img: null, alt: '',
  },
];

const GALLERY = [
  { src: `${IMG}/lion-quays-spa.jpg`, cap: 'Lion Quays - spa & wellness', span: 'md:col-span-2 md:row-span-2' },
  { src: `${IMG}/langstone-exterior.jpg`, cap: 'Langstone Quays - waterside' },
  { src: `${IMG}/ufford-blyth-suite.jpg`, cap: 'Ufford Park - Blyth Suite' },
  { src: `${IMG}/lion-quays-bedroom.jpg`, cap: 'Lion Quays - four-poster suite' },
  { src: `${IMG}/langstone-parnell-suite.jpg`, cap: 'Langstone - Parnell Suite' },
  { src: `${IMG}/ufford-golf.jpg`, cap: 'Ufford Park - championship golf' },
  { src: `${IMG}/lion-quays-canal.jpg`, cap: 'Lion Quays - Llangollen Canal' },
  { src: `${IMG}/parkway-hotel.jpg`, cap: 'Parkway Hotel & Spa' },
];

const PARTNERS = [
  { no: 'i', title: 'Owners', points: ['Hospitality or healthcare focus', 'Considering exit or growth capital', 'Looking for an operationally-fluent buyer', 'Want a clean, discreet process'] },
  { no: 'ii', title: 'Investors', points: ['HNW & sophisticated investors', 'Asset-backed UK opportunities', 'Hospitality, healthcare, and value-add property', 'Operator-led, aligned, transparent'] },
  { no: 'iii', title: 'Strategic Partners', points: ['Developers of premium hospitality property', 'Landlords seeking operating partners', 'Roll-up opportunities at platform scale', 'Joint-venture and co-investment structures'] },
];

export default function TrackRecord() {
  return (
    <>
      {/* Hero - full-bleed */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={`${IMG}/lion-quays-grounds.jpg`} alt="Lion Quays Resort - pergola garden with festoon lights" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A2540] via-[#0A2540]/85 to-[#0A2540]/55"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#0A2540]/90 to-transparent"></div>
        </div>
        <div className="relative z-10 container mx-auto px-6 py-32 text-white">
          <div className="max-w-4xl">
            <div className="text-[#FFD700] text-sm font-medium uppercase tracking-[0.25em] mb-6">
              UK Hospitality &amp; Healthcare
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-bold leading-[1.05] mb-8">
              Disciplined acquisition.
              <span className="block text-[#FFD700] mt-2">Operational value creation.</span>
            </h1>
            <p className="text-xl md:text-2xl text-white/85 max-w-3xl mb-12 leading-relaxed">
              We build compounding portfolios from under-monetised UK hospitality and healthcare assets - the kind of operator-led platforms that traditional capital can't access and traditional buyers can't run.
            </p>
            <div className="grid grid-cols-3 gap-8 max-w-2xl mb-12">
              {HERO_STATS.map((s) => (
                <div key={s.label}>
                  <div className="text-3xl md:text-5xl font-bold text-[#FFD700]">{s.num}</div>
                  <div className="text-white/70 text-sm mt-1">{s.label}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/submit-opportunity" className="group inline-flex items-center justify-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all">
                Submit an Opportunity
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/" className="group inline-flex items-center justify-center border-2 border-white/40 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all">
                <ArrowLeft className="mr-2 h-5 w-5" />
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* The Opportunity */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#0A2540]/50 text-sm font-medium uppercase tracking-[0.2em] mb-4">The Opportunity</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">A market of orphans.</h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              UK operators in hospitality and healthcare are building real value, but exit options come from finance-first buyers who don't understand operations. Investors chasing yield are stuck in overheated public markets. We sit at the intersection.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="bg-gray-50 p-8 rounded-2xl">
              <div className="text-[#FFD700] font-serif text-2xl mb-4">i.</div>
              <h3 className="text-xl font-bold text-[#0A2540] mb-3">Owners need real exit partners</h3>
              <p className="text-gray-600">Twenty years of running these assets means we know what to acquire, what to fix, and what to pay. Owners get a buyer who understands the business - not a spreadsheet.</p>
            </div>
            <div className="bg-gray-50 p-8 rounded-2xl">
              <div className="text-[#FFD700] font-serif text-2xl mb-4">ii.</div>
              <h3 className="text-xl font-bold text-[#0A2540] mb-3">Investors need real yield</h3>
              <p className="text-gray-600">Operator-led UK hospitality and healthcare deals - asset-backed, cash-generative, and aligned. The opposite of chasing tighter spreads in crowded public markets.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Full-width image divider */}
      <section className="relative h-[42vh] overflow-hidden">
        <img src={`${IMG}/langstone-exterior.jpg`} alt="Langstone Quays Resort exterior with lavender" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0A2540]/45"></div>
        <div className="absolute inset-0 flex items-center justify-center text-center px-6">
          <p className="text-2xl md:text-4xl font-serif font-bold text-white max-w-3xl leading-snug">
            Real assets. Real operations. <span className="text-[#FFD700]">Realised returns.</span>
          </p>
        </div>
      </section>

      {/* Why We Diversify */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#0A2540]/50 text-sm font-medium uppercase tracking-[0.2em] mb-4">Why We Diversify</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">One playbook. Multiple sectors.</h2>
            <p className="text-xl text-gray-600 leading-relaxed">
              Single-sector specialists carry single-point-of-failure risk. We apply the same operational discipline across multiple asset-backed sectors that share the same value-creation logic.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {SECTORS.map((s, i) => {
              const Icon = SECTOR_ICONS[i];
              const proven = s.status === 'Proven';
              return (
                <div key={s.name} className="bg-white p-8 rounded-2xl shadow-lg">
                  <div className="flex items-center justify-between mb-6">
                    <Icon className="h-10 w-10 text-[#FFD700]" />
                    <span className={`text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${proven ? 'bg-[#0A2540] text-[#FFD700]' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>
                  </div>
                  <div className="text-gray-400 font-serif text-lg mb-1">{s.no}</div>
                  <h3 className="text-xl font-bold text-[#0A2540] mb-3">{s.name}</h3>
                  <p className="text-gray-600">{s.detail}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* The Approach */}
      <section className="py-24 bg-[#0A2540] text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#FFD700]/70 text-sm font-medium uppercase tracking-[0.2em] mb-4">The Approach</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Four steps. Compounding outcomes.</h2>
            <p className="text-xl text-white/80 leading-relaxed">The same disciplined sequence applied to every asset we touch. The boring repeatability is the moat.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {STEPS.map((step, i) => (
              <div key={step.title} className="bg-white/5 p-8 rounded-2xl hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-[#FFD700] font-serif text-2xl">{['i', 'ii', 'iii', 'iv'][i]}.</span>
                  <step.icon className="h-8 w-8 text-[#FFD700]" />
                </div>
                <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                <p className="text-white/80 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track Record stat band */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#0A2540]/50 text-sm font-medium uppercase tracking-[0.2em] mb-4">Track Record</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">Two decades. Numbers that compound.</h2>
            <p className="text-xl text-gray-600 leading-relaxed">Built from a £300K base in 2004 into a £65M portfolio across hotels and nursing homes. Every figure below is realised, not projected.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {TRACK_STATS.map((s) => (
              <div key={s.label} className="text-center border border-gray-100 rounded-2xl py-8 px-4 bg-gray-50">
                <div className="text-4xl md:text-5xl font-bold text-[#0A2540]">
                  <span className="text-[#FFD700]">{s.pre}</span>{s.num}<span className="text-[#FFD700]">{s.post}</span>
                </div>
                <div className="text-gray-500 text-xs uppercase tracking-wider mt-3">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies - image-led */}
      <section className="py-24 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#0A2540]/50 text-sm font-medium uppercase tracking-[0.2em] mb-4">Case Studies</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">Realised outcomes, asset by asset.</h2>
          </div>
          <div className="max-w-6xl mx-auto space-y-16">
            {CASES.map((c, i) => (
              <div key={c.name} className="grid md:grid-cols-2 gap-10 items-center">
                <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                  {c.img ? (
                    <div className="group relative rounded-2xl overflow-hidden shadow-2xl aspect-[3/2]">
                      <img src={c.img} alt={c.alt} loading="lazy" className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0A2540]/70 via-transparent to-transparent"></div>
                      <div className="absolute bottom-5 left-5 right-5">
                        <span className="text-white/90 text-sm font-medium">{c.alt}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl overflow-hidden shadow-2xl aspect-[3/2] bg-gradient-to-br from-[#0A2540] to-[#15375f] flex flex-col items-center justify-center text-center px-8">
                      <HeartPulse className="h-12 w-12 text-[#FFD700] mb-4" />
                      <div className="text-[#FFD700] font-serif text-5xl mb-2">6× → 8×</div>
                      <div className="text-white/70 text-sm uppercase tracking-[0.2em]">EBITDA Re-Rating in Motion</div>
                    </div>
                  )}
                </div>
                <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-[#FFD700] font-serif italic text-xl">{c.no}.</span>
                    <h3 className="text-2xl md:text-3xl font-serif font-bold text-[#0A2540]">{c.name}</h3>
                  </div>
                  <div className="text-gray-400 text-xs uppercase tracking-[0.18em] mb-5">{c.meta}</div>
                  <p className="text-gray-600 leading-relaxed mb-7">{c.narrative}</p>
                  <div className="flex flex-wrap gap-8">
                    {c.stats.map(([v, l]) => (
                      <div key={l}>
                        <div className="text-2xl font-bold text-[#0A2540]">{v}</div>
                        <div className="text-gray-400 text-[0.65rem] uppercase tracking-[0.18em] mt-1">{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Portfolio gallery - epic mosaic */}
      <section className="py-24 bg-[#0A2540] text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#FFD700]/70 text-sm font-medium uppercase tracking-[0.2em] mb-4">Inside the Portfolio</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Assets worth operating.</h2>
            <p className="text-xl text-white/80 leading-relaxed">A look across the hospitality estate - spas, suites, waterside dining, and championship golf.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[200px] gap-4 max-w-6xl mx-auto">
            {GALLERY.map((g) => (
              <div key={g.src} className={`group relative rounded-xl overflow-hidden ${g.span || ''}`}>
                <img src={g.src} alt={g.cap} loading="lazy" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A2540]/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div className="absolute bottom-4 left-4 right-4 translate-y-2 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all">
                  <span className="text-white text-sm font-medium">{g.cap}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who We Work With */}
      <section className="py-24 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center mb-16">
            <div className="text-[#0A2540]/50 text-sm font-medium uppercase tracking-[0.2em] mb-4">Who We Work With</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-[#0A2540] mb-6">Three ways to partner.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {PARTNERS.map((p) => (
              <div key={p.title} className="bg-gray-50 p-8 rounded-2xl">
                <div className="text-[#FFD700] font-serif text-2xl mb-3">{p.no}.</div>
                <h3 className="text-xl font-bold text-[#0A2540] mb-6">{p.title}</h3>
                <ul className="space-y-3">
                  {p.points.map((pt) => (
                    <li key={pt} className="flex items-start text-gray-600">
                      <span className="text-[#FFD700] mr-3">-</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Next Steps CTA */}
      <section className="relative py-28 bg-[#0A2540] text-white overflow-hidden">
        <div className="absolute inset-0 opacity-15 bg-[url('/portfolio/assets/img/ufford-golf.jpg')] bg-cover bg-center"></div>
        <div className="relative z-10 container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <div className="text-[#FFD700]/70 text-sm font-medium uppercase tracking-[0.2em] mb-4">Next Steps</div>
            <h2 className="text-4xl md:text-5xl font-serif font-bold mb-6">Let's see if there's a fit.</h2>
            <p className="text-xl text-white/80 leading-relaxed mb-12">
              Share your situation and receive a considered, confidential response. Whether you're selling, investing, or partnering - every submission gets a real review.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/submit-opportunity" className="group inline-flex items-center justify-center bg-[#FFD700] text-[#0A2540] px-8 py-4 rounded-full font-semibold hover:bg-opacity-90 transition-all">
                Submit an Opportunity
                <ArrowRight className="ml-2 h-5 w-5 transform group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/" className="group inline-flex items-center justify-center border-2 border-white/40 text-white px-8 py-4 rounded-full font-semibold hover:bg-white/10 transition-all">
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
