import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Search, Upload, Send, Globe, Users, ShieldCheck, Check, ArrowUpRight, ArrowLeft,
  LayoutDashboard, Target, Building2, PhoneCall, Mail, FileText, ChevronRight, X, Sparkles, Settings2, Copy,
} from 'lucide-react';
import {
  prospectsList, prospectGet, prospectSuppress, prospectPromote,
  sourceTaxonomy, sourceSearch, ingestPropose, ingestCommit,
  outreachList, outreachCreate, outreachUpdate, outreachDraftTemplates, outreachEnrol,
  outreachQueue, outreachApprove, outreachApproveAll, outreachRun, outreachMarkReplied,
  getOrgSettings, setOrgSettings, crmList, crmAddContact, crmAddTask, crmCompleteTask,
} from '../../lib/acq';

// ---------------------------------------------------------------------------
// The Origination workspace: a full product surface (not a modal).
// Navy sidebar + light content area. Everything keys off the org buy box,
// which is captured by the onboarding wizard on first run.
// ---------------------------------------------------------------------------

const NAVY = '#0A2540';
const card = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const input = 'border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-[#0A2540] focus:ring-1 focus:ring-[#0A2540]/30 bg-white';
const btnPrimary = 'inline-flex items-center gap-1.5 bg-[#0A2540] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#0E3257] disabled:opacity-40';
const btnGold = 'inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-4 py-2 rounded-lg text-sm font-bold hover:brightness-95 disabled:opacity-40';
const btnGhost = 'inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 px-3.5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-40';
const chip = (on: boolean) => 'text-[12px] px-3 py-1.5 rounded-full border cursor-pointer transition ' + (on ? 'bg-[#0A2540] text-white border-[#0A2540] font-semibold' : 'border-gray-300 text-gray-600 hover:border-[#0A2540]/50');

const STAGE_TINT: Record<string, string> = {
  new: 'bg-gray-100 text-gray-600', enriched: 'bg-blue-50 text-blue-700', in_campaign: 'bg-purple-50 text-purple-700',
  replied: 'bg-amber-50 text-amber-700', qualified: 'bg-emerald-50 text-emerald-700', promoted: 'bg-[#0A2540] text-[#FFD700]',
  suppressed: 'bg-red-50 text-red-600', disqualified: 'bg-red-50 text-red-600',
};
const PROV_LABEL: Record<string, string> = { platform: 'Sourced', uploaded: 'Your upload', funnel: 'Funnel lead', meta_ads: 'Meta lead' };
const fitTint = (n: number | null) => n == null ? 'bg-gray-100 text-gray-400' : n >= 80 ? 'bg-emerald-100 text-emerald-800' : n >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500';
const money = (n: any) => n == null ? '—' : '£' + Number(n).toLocaleString();

type View = 'dashboard' | 'find' | 'prospects' | 'contacts' | 'campaigns' | 'funnel' | 'buybox';

export default function Origination() {
  const [view, setView] = useState<View>('dashboard');
  const [settings, setSettings] = useState<any | null>(null);
  const [orgName, setOrgName] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [err, setErr] = useState('');

  const reloadSettings = async () => {
    const r = await getOrgSettings();
    setSettings(r.settings ?? {}); setOrgName(r.org_name ?? '');
    if (!r.settings?.buy_box) setShowWizard(true);
    return r.settings ?? {};
  };
  useEffect(() => { reloadSettings().catch((e) => setErr(e.message || String(e))); }, []);

  const NAV: { key: View; label: string; icon: any }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'find', label: 'Find companies', icon: Search },
    { key: 'prospects', label: 'Prospects', icon: Building2 },
    { key: 'contacts', label: 'Contacts & tasks', icon: Users },
    { key: 'campaigns', label: 'Campaigns', icon: Send },
    { key: 'funnel', label: 'Funnel & Meta ads', icon: Globe },
    { key: 'buybox', label: 'Buy box', icon: Target },
  ];

  if (settings === null) return <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading Origination…</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ============ SIDEBAR ============ */}
      <aside className="w-60 shrink-0 flex flex-col text-white" style={{ background: NAVY }}>
        <div className="px-5 pt-6 pb-4">
          <div className="text-[#FFD700] font-serif font-bold text-lg leading-tight">Origination</div>
          <div className="text-white/45 text-[11px] mt-0.5">{orgName}</div>
        </div>
        <nav className="flex-1 px-3 flex flex-col gap-0.5">
          {NAV.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] text-left transition ' + (view === n.key ? 'bg-white/10 text-white font-semibold' : 'text-white/60 hover:text-white hover:bg-white/5')}>
              <n.icon className="h-4 w-4" />{n.label}
              {view === n.key && <ChevronRight className="h-3.5 w-3.5 ml-auto text-[#FFD700]" />}
            </button>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-white/10">
          <Link to="/admin/pipeline" className="flex items-center gap-2 text-white/60 hover:text-white text-[13px]"><ArrowLeft className="h-4 w-4" /> Back to pipeline</Link>
          <div className="flex items-start gap-1.5 text-[10px] text-white/35 mt-3 leading-relaxed"><ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-px" /> Sourced data lives here and cannot be exported. Lists you upload remain yours.</div>
        </div>
      </aside>

      {/* ============ CONTENT ============ */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {err && <div className="m-6 mb-0 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2.5">{err}</div>}
        {view === 'dashboard' && <Dashboard setErr={setErr} go={setView} buyBox={settings.buy_box} openWizard={() => setShowWizard(true)} />}
        {view === 'find' && <FindView setErr={setErr} buyBox={settings.buy_box} go={setView} />}
        {view === 'prospects' && <ProspectsView setErr={setErr} />}
        {view === 'contacts' && <ContactsView setErr={setErr} />}
        {view === 'campaigns' && <CampaignsView setErr={setErr} buyBox={settings.buy_box} />}
        {view === 'funnel' && <FunnelView setErr={setErr} settings={settings} onSaved={reloadSettings} />}
        {view === 'buybox' && <BuyBoxView settings={settings} openWizard={() => setShowWizard(true)} />}
      </main>

      {showWizard && <BuyBoxWizard orgName={orgName} settings={settings} onDone={async () => { setShowWizard(false); await reloadSettings(); setView('find'); }} onSkip={() => setShowWizard(false)} />}
    </div>
  );
}

function Header({ title, sub, children }: { title: string; sub?: string; children?: any }) {
  return (
    <div className="flex items-end justify-between px-8 pt-7 pb-5">
      <div>
        <h1 className="text-[22px] font-bold text-gray-900">{title}</h1>
        {sub && <p className="text-[13px] text-gray-500 mt-0.5 max-w-2xl">{sub}</p>}
      </div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}


function IndustryPicker({ tax, sel, setSel, max = 10, height = 'max-h-72' }: { tax: any[]; sel: string[]; setSel: any; max?: number; height?: string }) {
  const [q, setQ] = useState('');
  const filtered = q ? tax.filter((t) => t.label.toLowerCase().includes(q.toLowerCase()) || t.group.toLowerCase().includes(q.toLowerCase())) : tax;
  const groups: Record<string, any[]> = {};
  for (const t of filtered) (groups[t.group] = groups[t.group] || []).push(t);
  const toggle = (k: string) => setSel((s: string[]) => s.includes(k) ? s.filter((x) => x !== k) : s.length < max ? [...s, k] : s);
  return (
    <div>
      <input className={input + ' w-full mb-2'} placeholder={'Search ' + tax.length + ' business types\u2026'} value={q} onChange={(e) => setQ(e.target.value)} />
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {sel.map((k) => { const t = tax.find((x) => x.key === k); return (
            <button key={k} onClick={() => toggle(k)} className="text-[11px] px-2 py-1 rounded-full bg-[#0A2540] text-white flex items-center gap-1">{t?.label ?? k}<X className="h-3 w-3" /></button>
          ); })}
        </div>
      )}
      <div className={height + ' overflow-y-auto pr-1'}>
        {Object.entries(groups).map(([g, items]) => (
          <div key={g} className="mb-2.5">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{g}</div>
            <div className="flex flex-wrap gap-1.5">{(items as any[]).map((t) => <button key={t.key} onClick={() => toggle(t.key)} className={chip(sel.includes(t.key))}>{t.label}</button>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================ ONBOARDING WIZARD ============================
function BuyBoxWizard({ orgName, settings, onDone, onSkip }: { orgName: string; settings: any; onDone: () => void; onSkip: () => void }) {
  const [step, setStep] = useState(0);
  const [tax, setTax] = useState<{ key: string; label: string; group: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const bb = settings?.buy_box ?? {};
  const [industries, setIndustries] = useState<string[]>(bb.industries ?? []);
  const [location, setLocation] = useState(bb.location ?? '');
  const [radiusMiles, setRadiusMiles] = useState(String(bb.radius_miles ?? 25));
  const [sizeBand, setSizeBand] = useState(bb.size_band ?? 'small_plus');
  const [regions, setRegions] = useState<string[]>(bb.regions ?? []);
  const [revMin, setRevMin] = useState(bb.revenue_min ?? '1000000');
  const [profMin, setProfMin] = useState(bb.profit_min ?? '200000');
  const [yearsMin, setYearsMin] = useState(String(bb.years_trading_min ?? 8));
  const [succession, setSuccession] = useState(bb.succession_pref !== false);
  const [senderName, setSenderName] = useState(settings?.outreach?.sender_name ?? '');
  const REGIONS = ['London','South East','South West','Midlands','East of England','North West','Yorkshire','North East','Wales','Scotland','Northern Ireland'];

  useEffect(() => { sourceTaxonomy().then((r) => setTax(r.taxonomy)).catch(() => setTax([])); }, []);
  const toggle = (arr: string[], set: (v: string[]) => void, k: string, max = 99) => set(arr.includes(k) ? arr.filter((x) => x !== k) : arr.length < max ? [...arr, k] : arr);

  const save = async () => {
    setBusy(true);
    try {
      await setOrgSettings({
        ...(settings ?? {}),
        buy_box: { industries, location, radius_miles: Number(radiusMiles) || 0, size_band: sizeBand, regions, revenue_min: Number(revMin) || null, profit_min: Number(profMin) || null, years_trading_min: Number(yearsMin) || 8, succession_pref: succession, completed_at: new Date().toISOString() },
        outreach: { ...(settings?.outreach ?? {}), sender_name: senderName || undefined },
      });
      onDone();
    } finally { setBusy(false); }
  };

  const steps = ['Industries', 'Geography', 'Size & signals', 'Your identity'];
  const canNext = step === 0 ? industries.length > 0 : true;
  return (
    <div className="fixed inset-0 z-[70] bg-[#0A2540]/95 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-8 pt-7 pb-5" style={{ background: NAVY }}>
          <div className="text-[#FFD700] font-serif font-bold text-xl">Let's define your buy box</div>
          <p className="text-white/60 text-[13px] mt-1">Everything in Origination works off this: which companies we find, how they're scored, and how outreach is written for {orgName || 'you'}. Two minutes, and you can change it any time.</p>
          <div className="flex gap-1.5 mt-4">
            {steps.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={'h-1 rounded-full ' + (i <= step ? 'bg-[#FFD700]' : 'bg-white/15')} />
                <div className={'text-[10px] mt-1 ' + (i === step ? 'text-white' : 'text-white/40')}>{s}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="px-8 py-6 min-h-[300px]">
          {step === 0 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Which boring-but-good industries do you want to own?</h3>
              <p className="text-[13px] text-gray-500 mb-4">Pick as many as you like. These map to Companies House SIC codes behind the scenes.</p>
              <IndustryPicker tax={tax} sel={industries} setSel={setIndustries} max={30} height="max-h-60" />
            </>
          )}
          {step === 1 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Where do you want to buy?</h3>
              <p className="text-[13px] text-gray-500 mb-4">A home town or city gives the sharpest search; regions widen the net.</p>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Primary town / city</label>
              <div className="flex gap-3 mb-4 items-end">
                <input className={input + ' w-64'} placeholder="e.g. Manchester" value={location} onChange={(e) => setLocation(e.target.value)} />
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Within</label>
                  <select className={input} value={radiusMiles} onChange={(e) => setRadiusMiles(e.target.value)}><option value="0">Town only</option><option value="10">10 miles</option><option value="25">25 miles</option><option value="50">50 miles</option><option value="75">75 miles</option></select></div>
              </div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Regions</label>
              <div className="flex flex-wrap gap-2">{REGIONS.map((r) => <button key={r} onClick={() => toggle(regions, setRegions, r)} className={chip(regions.includes(r))}>{r}</button>)}</div>
            </>
          )}
          {step === 2 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">What size of business, and which signals matter?</h3>
              <p className="text-[13px] text-gray-500 mb-4">We score every prospect 0–100 against this.</p>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Min revenue (£)</label><input className={input + ' w-full'} value={revMin} onChange={(e) => setRevMin(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Min profit (£)</label><input className={input + ' w-full'} value={profMin} onChange={(e) => setProfMin(e.target.value.replace(/[^0-9]/g, ''))} /></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Trading at least</label>
                  <select className={input + ' w-full'} value={yearsMin} onChange={(e) => setYearsMin(e.target.value)}><option value="5">5 years</option><option value="8">8 years</option><option value="15">15 years</option></select></div>
                <div><label className="block text-[12px] font-semibold text-gray-700 mb-1">Company size (filed accounts)</label>
                  <select className={input + ' w-full'} value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}><option value="any">Any size</option><option value="small_plus">£632k+ turnover</option><option value="medium_plus">£10.2m+ turnover</option></select></div>
              </div>
              <label className="flex items-center gap-2.5 mt-5 cursor-pointer max-w-md">
                <input type="checkbox" checked={succession} onChange={(e) => setSuccession(e.target.checked)} className="h-4 w-4 accent-[#0A2540]" />
                <span className="text-[13px] text-gray-700">Prioritise <b>succession signals</b> — owners aged 55+ with no obvious successor (the strongest "will sell" indicator)</span>
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <h3 className="font-semibold text-gray-900 mb-1">Who is the outreach from?</h3>
              <p className="text-[13px] text-gray-500 mb-4">Letters and emails are written in a personal voice. Owners respond to people, not companies.</p>
              <label className="block text-[12px] font-semibold text-gray-700 mb-1">Your name (as signed on letters)</label>
              <input className={input + ' w-72'} placeholder="e.g. Sandeep Bansal" value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4 text-[13px] text-gray-600">
                <b className="text-gray-800">Your buy box:</b> {industries.length} industries · {location || regions.join(', ') || 'UK-wide'} · £{Number(revMin || 0).toLocaleString()}+ revenue · £{Number(profMin || 0).toLocaleString()}+ profit · {yearsMin}+ years{succession ? ' · succession priority' : ''}
              </div>
            </>
          )}
        </div>
        <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onSkip} className="text-gray-400 hover:text-gray-600 text-[13px]">Skip for now</button>
          <div className="flex gap-2">
            {step > 0 && <button onClick={() => setStep(step - 1)} className={btnGhost}>Back</button>}
            {step < 3 ? <button disabled={!canNext} onClick={() => setStep(step + 1)} className={btnPrimary}>Continue</button>
              : <button disabled={busy} onClick={save} className={btnGold}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save buy box & start sourcing</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================ DASHBOARD ============================
function Dashboard({ setErr, go, buyBox, openWizard }: { setErr: (s: string) => void; go: (v: View) => void; buyBox: any; openWizard: () => void }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [camps, setCamps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([prospectsList({ per: 5 }), outreachList()])
      .then(([p, c]) => { setCounts(p.stage_counts || {}); setTotal(Object.values(p.stage_counts || {}).reduce((a, b) => a + b, 0)); setCamps(c.campaigns); })
      .catch((e) => setErr(e.message || String(e))).finally(() => setLoading(false));
  }, []);
  const needsApproval = camps.reduce((a, c) => a + (c.needs_approval || 0), 0);
  const replied = (counts.replied || 0) + (counts.qualified || 0);
  const kpis = [
    { label: 'Prospects in CRM', value: total, action: () => go('prospects') },
    { label: 'In campaigns', value: counts.in_campaign || 0, action: () => go('campaigns') },
    { label: 'Awaiting your approval', value: needsApproval, action: () => go('campaigns'), hot: needsApproval > 0 },
    { label: 'Replied / qualified', value: replied, action: () => go('prospects'), hot: replied > 0 },
    { label: 'Promoted to deals', value: counts.promoted || 0, action: () => go('prospects') },
  ];
  return (
    <>
      <Header title="Origination" sub="Find owners in your buy box, reach them across letter, email and phone, and move interested sellers straight onto your pipeline." >
        <button onClick={() => go('find')} className={btnGold}><Search className="h-4 w-4" />Find companies</button>
      </Header>
      <div className="px-8 pb-8">
        {!buyBox && (
          <button onClick={openWizard} className="w-full mb-5 text-left bg-[#0A2540] text-white rounded-xl p-5 flex items-center gap-4 hover:bg-[#0E3257] transition">
            <Sparkles className="h-6 w-6 text-[#FFD700] shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Set up your buy box to unlock Origination</div>
              <div className="text-white/60 text-[13px] mt-0.5">Industries, geography and deal size — everything here is driven by it. Takes two minutes.</div>
            </div>
            <ChevronRight className="h-5 w-5 text-[#FFD700]" />
          </button>
        )}
        {loading ? <div className="text-gray-400 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {kpis.map((k) => (
                <button key={k.label} onClick={k.action} className={card + ' p-4 text-left hover:shadow-md transition ' + (k.hot ? 'ring-2 ring-[#FFD700]' : '')}>
                  <div className="text-[26px] font-bold text-gray-900">{k.value}</div>
                  <div className="text-[12px] text-gray-500 mt-0.5">{k.label}</div>
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className={card + ' p-5'}>
                <div className="font-semibold text-gray-900 mb-3">How it flows</div>
                {[
                  ['Find companies', 'Companies House, filtered to your buy box, scored for fit and succession', 'find'],
                  ['Enrol in a campaign', 'Letter first, then email, then a call task — drafted in your voice, sent only after you approve', 'campaigns'],
                  ['Replies come back', 'Interested owners are flagged; unsubscribes are suppressed automatically', 'prospects'],
                  ['Promote to deal', 'One click puts them on your pipeline with the full history attached', 'prospects'],
                ].map(([t, d, v], i) => (
                  <button key={t as string} onClick={() => go(v as View)} className="w-full text-left flex gap-3 py-2.5 group">
                    <div className="h-6 w-6 rounded-full bg-[#0A2540] text-[#FFD700] text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</div>
                    <div><div className="text-[13px] font-semibold text-gray-800 group-hover:text-[#0A2540]">{t}</div><div className="text-[12px] text-gray-500">{d}</div></div>
                  </button>
                ))}
              </div>
              <div className={card + ' p-5'}>
                <div className="font-semibold text-gray-900 mb-3">Campaigns</div>
                {camps.length === 0 ? (
                  <div className="text-[13px] text-gray-500">No campaigns yet. Create one and the AI drafts the letter, email and call brief from your buy box.
                    <div className="mt-3"><button onClick={() => go('campaigns')} className={btnPrimary}><Send className="h-4 w-4" />Create your first campaign</button></div>
                  </div>
                ) : camps.slice(0, 4).map((c) => (
                  <button key={c.id} onClick={() => go('campaigns')} className="w-full flex items-center gap-2 py-2 border-b border-gray-50 last:border-0 text-left">
                    <span className={'h-2 w-2 rounded-full ' + (c.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300')} />
                    <span className="text-[13px] font-medium text-gray-800 flex-1 truncate">{c.name}</span>
                    <span className="text-[12px] text-gray-400">{c.members} enrolled · {c.sent} sent · {c.replied} replied</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// ============================ FIND ============================
function FindView({ setErr, buyBox, go }: { setErr: (s: string) => void; buyBox: any; go: (v: View) => void }) {
  const [tax, setTax] = useState<{ key: string; label: string; group: string }[]>([]);
  const [sel, setSel] = useState<string[]>(buyBox?.industries?.slice(0, 10) ?? []);
  const [location, setLocation] = useState(buyBox?.location ?? '');
  const [radius, setRadius] = useState(String(buyBox?.radius_miles ?? 25));
  const [sizeBand, setSizeBand] = useState(buyBox?.size_band ?? 'any');
  const [dirAge, setDirAge] = useState(buyBox?.succession_pref !== false ? '55' : '0');
  const [minAge, setMinAge] = useState(String(buyBox?.years_trading_min ?? 8));
  const [maxN, setMaxN] = useState('25');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { sourceTaxonomy().then((r) => setTax(r.taxonomy)).catch((e) => setErr(e.message || String(e))); }, []);
  const run = async () => {
    if (!sel.length) { setErr('Pick at least one industry'); return; }
    setBusy(true); setErr(''); setResult(null);
    try { setResult(await sourceSearch({ categories: sel, location: location || undefined, radius_miles: location ? Number(radius) : 0, size_band: sizeBand, min_director_age: Number(dirAge), min_age_years: Number(minAge), max_results: Number(maxN) })); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Find companies" sub="Live Companies House search across your target industries. We read director ages for succession signals and score every company against your buy box." />
      <div className="px-8 pb-8 flex gap-5">
        {/* filter rail */}
        <div className={card + ' w-72 shrink-0 p-5 h-fit'}>
          <div className="text-[12px] font-bold text-gray-800 uppercase tracking-wide mb-3">Filters</div>
          {buyBox && <div className="text-[11px] text-gray-400 mb-3 flex items-center gap-1"><Target className="h-3 w-3" /> Pre-filled from your buy box</div>}
          <div className="text-[12px] font-semibold text-gray-700 mb-2">Industries <span className="text-gray-400 font-normal">(up to 10)</span></div>
          <div className="mb-4"><IndustryPicker tax={tax} sel={sel} setSel={setSel} max={10} height="max-h-64" /></div>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Town / city</div>
          <input className={input + ' w-full mb-2'} placeholder="e.g. Manchester" value={location} onChange={(e) => setLocation(e.target.value)} />
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Distance</div>
          <select className={input + ' w-full mb-3'} value={radius} onChange={(e) => setRadius(e.target.value)} disabled={!location}>
            <option value="0">Town match only</option><option value="10">Within 10 miles</option><option value="25">Within 25 miles</option><option value="50">Within 50 miles</option><option value="75">Within 75 miles</option>
          </select>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Company size <span className="text-gray-400 font-normal">(from filed accounts)</span></div>
          <select className={input + ' w-full mb-3'} value={sizeBand} onChange={(e) => setSizeBand(e.target.value)}>
            <option value="any">Any size</option><option value="small_plus">£632k+ turnover</option><option value="medium_plus">£10.2m+ turnover</option>
          </select>
          <div className="text-[12px] font-semibold text-gray-700 mb-1">Succession signal</div>
          <select className={input + ' w-full mb-3'} value={dirAge} onChange={(e) => setDirAge(e.target.value)}>
            <option value="0">Any director age</option><option value="55">Oldest director 55+</option><option value="60">Oldest director 60+</option>
          </select>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div><div className="text-[12px] font-semibold text-gray-700 mb-1">Trading</div>
              <select className={input + ' w-full'} value={minAge} onChange={(e) => setMinAge(e.target.value)}><option value="5">5+ yrs</option><option value="8">8+ yrs</option><option value="15">15+ yrs</option></select></div>
            <div><div className="text-[12px] font-semibold text-gray-700 mb-1">Results</div>
              <select className={input + ' w-full'} value={maxN} onChange={(e) => setMaxN(e.target.value)}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></div>
          </div>
          <button onClick={run} disabled={busy} className={btnGold + ' w-full justify-center'}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{busy ? 'Searching Companies House…' : 'Find companies'}</button>
        </div>
        {/* results */}
        <div className="flex-1 min-w-0">
          {!result && !busy && (
            <div className={card + ' p-10 text-center text-gray-400'}>
              <Building2 className="h-8 w-8 mx-auto mb-3 text-gray-300" />
              <div className="text-gray-600 font-medium mb-1">Your next acquisition is already trading</div>
              <div className="text-[13px]">Pick industries on the left and run the search. Every result lands in your Prospects, scored and ready for outreach.</div>
            </div>
          )}
          {busy && <div className={card + ' p-10 text-center text-gray-400'}><Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />Searching Companies House — checking distances, filed accounts sizes and director ages. Tight filters can take up to a minute.</div>}
          {result && (
            <div className={card}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-[14px] text-gray-800"><b>{result.created}</b> new prospects added{result.updated ? `, ${result.updated} refreshed` : ''} <span className="text-gray-400">(of {result.total_hits} matches)</span></div>
                <button onClick={() => go('prospects')} className={btnPrimary}>Open Prospects<ArrowUpRight className="h-4 w-4" /></button>
              </div>
              {result.prospects.map((p: any) => (
                <div key={p.id} className="px-5 py-3 border-b border-gray-50 last:border-0 flex items-center gap-3">
                  <span className={'text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-gray-800 truncate">{p.company_name}</div>
                    <div className="text-[12px] text-gray-400 truncate">{[p.company_number, p.address, p.distance_miles != null ? p.distance_miles + ' mi away' : null, p.size && !String(p.size).includes('unknown') ? p.size : null].filter(Boolean).join(' · ')}</div>
                  </div>
                  {p.oldest_director_age && <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full shrink-0">Oldest director {p.oldest_director_age}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ============================ PROSPECTS ============================
function ProspectsView({ setErr }: { setErr: (s: string) => void }) {
  const [rows, setRows] = useState<any[]>([]); const [total, setTotal] = useState(0); const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1); const [q, setQ] = useState(''); const [stage, setStage] = useState(''); const [minFit, setMinFit] = useState('');
  const [loading, setLoading] = useState(true); const [openId, setOpenId] = useState<string | null>(null); const [detail, setDetail] = useState<any>(null);
  const [busy, setBusy] = useState(''); const [uploadOpen, setUploadOpen] = useState(false);
  const per = 25;
  const load = async (p = page) => {
    setLoading(true); setErr('');
    try { const r = await prospectsList({ page: p, per, ...(q ? { q } : {}), ...(stage ? { stage } : {}), ...(minFit ? { min_fit: Number(minFit) } : {}) }); setRows(r.prospects); setTotal(r.total); setCounts(r.stage_counts || {}); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };
  useEffect(() => { load(1); setPage(1); }, [q, stage, minFit]);
  const openDrawer = async (id: string) => { setOpenId(id); setDetail(null); try { setDetail(await prospectGet(id)); } catch (e: any) { setErr(e.message || String(e)); } };
  const promote = async (id: string) => { setBusy('p'); try { const r = await prospectPromote(id); setOpenId(null); await load(); alert('Now on your pipeline as ' + r.reference); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const suppress = async (id: string) => { setBusy('s'); try { await prospectSuppress(id); setOpenId(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const markReplied = async (id: string) => { setBusy('r'); try { await outreachMarkReplied(id); setOpenId(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  return (
    <>
      <Header title="Prospects" sub={`${total} companies in your CRM. Sourced data stays in here — it cannot be downloaded or exported.`}>
        <button onClick={() => setUploadOpen(true)} className={btnGhost}><Upload className="h-4 w-4" />Upload list</button>
      </Header>
      <div className="px-8 pb-8">
        <div className="flex gap-2 mb-4 items-center flex-wrap">
          <div className="relative"><Search className="h-4 w-4 absolute left-3 top-2.5 text-gray-400" /><input className={input + ' pl-9 w-64'} placeholder="Search name, number, region…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select className={input} value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All active stages</option>
            {['new','enriched','in_campaign','replied','qualified','promoted','suppressed','disqualified'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}{counts[s] ? ` (${counts[s]})` : ''}</option>)}
          </select>
          <select className={input} value={minFit} onChange={(e) => setMinFit(e.target.value)}><option value="">Any fit</option><option value="80">Fit 80+</option><option value="60">Fit 60+</option></select>
        </div>
        <div className={card + ' overflow-hidden'}>
          <table className="w-full text-left">
            <thead><tr className="text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
              <th className="px-5 py-3 font-semibold">Fit</th><th className="px-2 py-3 font-semibold">Company</th><th className="px-2 py-3 font-semibold hidden lg:table-cell">Region</th>
              <th className="px-2 py-3 font-semibold hidden md:table-cell">Succession</th><th className="px-2 py-3 font-semibold hidden md:table-cell">Revenue</th>
              <th className="px-2 py-3 font-semibold">Source</th><th className="px-5 py-3 font-semibold text-right">Stage</th>
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="px-5 py-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
                : rows.length === 0 ? <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-[13px]">No prospects match. Use <b>Find companies</b> or <b>Upload list</b> to fill your CRM.</td></tr>
                : rows.map((p) => (
                  <tr key={p.id} onClick={() => openDrawer(p.id)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                    <td className="px-5 py-3"><span className={'text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(p.fit_score)}>{p.fit_score ?? '—'}</span></td>
                    <td className="px-2 py-3"><div className="text-[13px] font-semibold text-gray-800">{p.company_name}</div><div className="text-[11px] text-gray-400">{p.company_number ?? ''}</div></td>
                    <td className="px-2 py-3 text-[12px] text-gray-500 hidden lg:table-cell">{p.region ?? '—'}</td>
                    <td className="px-2 py-3 hidden md:table-cell">{p.oldest_director_age ? <span className={'text-[11px] px-2 py-0.5 rounded-full ' + (p.oldest_director_age >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500')}>Dir. {p.oldest_director_age}</span> : <span className="text-gray-300 text-[12px]">—</span>}</td>
                    <td className="px-2 py-3 text-[12px] text-gray-500 hidden md:table-cell">{money(p.revenue_estimate)}</td>
                    <td className="px-2 py-3"><span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{PROV_LABEL[p.provenance] ?? p.provenance}</span></td>
                    <td className="px-5 py-3 text-right"><span className={'text-[11px] font-semibold px-2 py-0.5 rounded-full ' + (STAGE_TINT[p.stage] ?? '')}>{p.stage.replace('_', ' ')}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
            <button disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }} className={btnGhost + ' disabled:opacity-30'}>Previous</button>
            <span className="text-[12px] text-gray-400">Page {page} of {Math.max(1, Math.ceil(total / per))}</span>
            <button disabled={page >= Math.ceil(total / per)} onClick={() => { const p = page + 1; setPage(p); load(p); }} className={btnGhost + ' disabled:opacity-30'}>Next</button>
          </div>
        </div>
      </div>

      {/* drawer */}
      {openId && (
        <div className="fixed inset-0 z-[65] bg-black/40 flex justify-end" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl">
            {!detail ? <div className="p-8 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
              <>
                <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-start justify-between" style={{ background: NAVY }}>
                  <div>
                    <div className="text-white font-bold text-[16px]">{detail.prospect.company_name}</div>
                    <div className="text-white/50 text-[12px] mt-0.5">{[detail.prospect.company_number, detail.prospect.region].filter(Boolean).join(' · ')}</div>
                    <span className={'inline-block mt-2 text-[11px] font-bold px-2 py-0.5 rounded-full ' + fitTint(detail.prospect.fit_score)}>{detail.prospect.fit_score != null ? `Fit ${detail.prospect.fit_score}` : 'Unscored'}</span>
                  </div>
                  <button onClick={() => setOpenId(null)} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
                </div>
                <div className="px-6 py-5 text-[13px] text-gray-700 flex flex-col gap-4">
                  {detail.prospect.fit_reasons && <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-lg p-3 text-[12px]">{detail.prospect.fit_reasons}</div>}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    {detail.prospect.incorporated_on && <div><div className="text-[11px] text-gray-400">Incorporated</div>{String(detail.prospect.incorporated_on).slice(0, 10)}</div>}
                    {detail.prospect.revenue_estimate && <div><div className="text-[11px] text-gray-400">Revenue ({detail.prospect.revenue_basis})</div>{money(detail.prospect.revenue_estimate)}</div>}
                    {detail.prospect.owner_name && <div><div className="text-[11px] text-gray-400">Owner</div>{detail.prospect.owner_name}</div>}
                    {detail.prospect.owner_email && <div className="col-span-2"><div className="text-[11px] text-gray-400">Email</div>{detail.prospect.owner_email}</div>}
                    {detail.prospect.owner_phone && <div><div className="text-[11px] text-gray-400">Phone</div>{detail.prospect.owner_phone}</div>}
                    {detail.prospect.address && <div className="col-span-2"><div className="text-[11px] text-gray-400">Address</div>{detail.prospect.address} {detail.prospect.postcode ?? ''}</div>}
                  </div>
                  {(detail.prospect.directors ?? []).length > 0 && (
                    <div><div className="text-[11px] text-gray-400 mb-1">Directors</div>
                      {(detail.prospect.directors as any[]).map((d, i) => <div key={i} className="flex justify-between py-1 border-b border-gray-50 last:border-0"><span>{d.name}</span>{d.dob_year && <span className="text-gray-400">{new Date().getFullYear() - d.dob_year} yrs</span>}</div>)}
                    </div>
                  )}
                  {detail.memberships.length > 0 && (
                    <div><div className="text-[11px] text-gray-400 mb-1">Campaigns</div>
                      {detail.memberships.map((m: any) => <div key={m.id} className="text-[12px]">{m.campaign_name} — {m.status}, step {m.current_step + 1}</div>)}
                    </div>
                  )}
                  {detail.touches.length > 0 && (
                    <div><div className="text-[11px] text-gray-400 mb-1">Outreach history</div>
                      {detail.touches.slice(0, 8).map((t: any) => (
                        <div key={t.id} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0 text-[12px]">
                          {t.channel === 'email' ? <Mail className="h-3.5 w-3.5 text-gray-400" /> : t.channel === 'letter' ? <FileText className="h-3.5 w-3.5 text-gray-400" /> : <PhoneCall className="h-3.5 w-3.5 text-gray-400" />}
                          <span className="flex-1 truncate">{t.subject ?? t.channel}</span>
                          <span className={'text-[10px] px-1.5 py-0.5 rounded-full ' + (t.status === 'sent' ? 'bg-emerald-50 text-emerald-700' : t.status === 'needs_approval' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500')}>{t.status.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {detail.prospect.notes && <div className="text-[12px] text-gray-500 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">{detail.prospect.notes}</div>}
                </div>
                {detail.prospect.stage !== 'promoted' && detail.prospect.stage !== 'suppressed' && (
                  <div className="px-6 py-4 border-t border-gray-100 flex gap-2 flex-wrap sticky bottom-0 bg-white">
                    <button disabled={!!busy} onClick={() => promote(detail.prospect.id)} className={btnGold}><ArrowUpRight className="h-4 w-4" />Promote to deal</button>
                    <button disabled={!!busy} onClick={() => markReplied(detail.prospect.id)} className={btnGhost}>Mark replied</button>
                    <button disabled={!!busy} onClick={() => suppress(detail.prospect.id)} className={btnGhost + ' text-red-600 border-red-200 hover:bg-red-50'}>Suppress</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {uploadOpen && <UploadModal onClose={() => { setUploadOpen(false); load(); }} setErr={setErr} />}
    </>
  );
}

// ============================ UPLOAD ============================
function UploadModal({ onClose, setErr }: { onClose: () => void; setErr: (s: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState(''); const [fileName, setFileName] = useState('');
  const [proposal, setProposal] = useState<any>(null); const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(''); const [report, setReport] = useState<any>(null);
  const FIELDS = ['company_name','company_number','website','owner_name','owner_email','owner_phone','address','postcode','region','sic_code','revenue','staff','notes'];
  const pick = async (f: File) => {
    setErr(''); setReport(null); setProposal(null);
    const text = await f.text(); setCsv(text); setFileName(f.name); setBusy('propose');
    try { const r = await ingestPropose(text, f.name); setProposal(r); setMapping(r.mapping); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const commit = async () => { setBusy('commit'); try { setReport(await ingestCommit(csv, mapping, proposal?.job_id ?? null, fileName)); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  return (
    <div className="fixed inset-0 z-[65] bg-black/40 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-1"><h3 className="font-bold text-gray-900">Upload a list</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button></div>
        <p className="text-[13px] text-gray-500 mb-4">Broker sheets, data-provider exports, your own research. We map the columns, de-duplicate, and merge without overwriting good data. <b>Uploaded records stay yours.</b></p>
        {!proposal && (
          <button onClick={() => fileRef.current?.click()} disabled={busy === 'propose'} className="w-full border-2 border-dashed border-gray-300 rounded-xl p-10 text-gray-400 hover:border-[#0A2540]/50 hover:text-gray-600 text-sm flex items-center justify-center gap-2">
            {busy === 'propose' ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading and mapping your file…</> : <><Upload className="h-4 w-4" /> Drop or choose a CSV file</>}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
        {proposal && !report && (
          <>
            <p className="text-[13px] text-gray-600 mb-2">{fileName} · {proposal.rows_total} rows. Check the mapping:</p>
            <div className="flex flex-col gap-1.5 mb-4 max-h-60 overflow-y-auto">
              {proposal.headers.map((h: string) => (
                <div key={h} className="flex items-center gap-2">
                  <span className="text-[13px] text-gray-700 w-48 truncate">{h}</span>
                  <select className={input + ' flex-1'} value={mapping[h] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value || null }))}>
                    <option value="">— ignore —</option>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <button onClick={commit} disabled={busy === 'commit'} className={btnGold}>{busy === 'commit' && <Loader2 className="h-4 w-4 animate-spin" />}Import {proposal.rows_total} rows</button>
          </>
        )}
        {report && (
          <div className="bg-gray-50 rounded-xl p-4 text-[13px] text-gray-700">
            <b>{report.created}</b> new prospects · <b>{report.merged}</b> merged into existing records · {report.skipped} skipped.
            {report.errors?.length > 0 && <div className="text-amber-600 mt-1">{report.errors.length} rows had issues.</div>}
            <div className="mt-3"><button onClick={onClose} className={btnPrimary}>Done</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================ CONTACTS (CRM) ============================
function ContactsView({ setErr }: { setErr: (s: string) => void }) {
  const [contacts, setContacts] = useState<any[]>([]); const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [cf, setCf] = useState<Record<string, string>>({}); const [tf, setTf] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const load = async () => { setLoading(true); try { const r = await crmList(); setContacts(r.contacts || []); setTasks(r.tasks || []); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const addContact = async () => { if (!cf.name?.trim()) return; setBusy('c'); try { await crmAddContact({ name: cf.name, role: cf.role || 'other', company: cf.company, email: cf.email }); setCf({}); await load(); } finally { setBusy(''); } };
  const addTask = async () => { if (!tf.title?.trim()) return; setBusy('t'); try { await crmAddTask({ title: tf.title, due_date: tf.due || null }); setTf({}); await load(); } finally { setBusy(''); } };
  const done = async (id: string) => { await crmCompleteTask(id); setTasks((t) => t.filter((x) => x.id !== id)); };
  return (
    <>
      <Header title="Contacts & tasks" sub="Everyone your deals touch — vendors, agents, accountants, solicitors, lenders — and what needs doing next. Call tasks from campaigns land here too." />
      <div className="px-8 pb-8 grid lg:grid-cols-5 gap-5">
        <div className={card + ' lg:col-span-2 p-5 h-fit'}>
          <div className="font-semibold text-gray-900 mb-3">Needs you <span className="text-gray-400 font-normal">· {tasks.length} open</span></div>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-300" /> : tasks.length === 0 ? <div className="text-[13px] text-gray-400">Nothing outstanding.</div> : tasks.map((t) => (
            <div key={t.id} className="flex items-start gap-2.5 py-2.5 border-b border-gray-50 last:border-0">
              <button onClick={() => done(t.id)} className="mt-0.5 text-gray-300 hover:text-emerald-500" title="Mark done"><Check className="h-4 w-4" /></button>
              <div className="min-w-0"><div className="text-[13px] text-gray-800">{t.title}</div><div className="text-[11px] text-gray-400">{[t.deal_name, t.contact_name, t.due_date ? 'due ' + String(t.due_date).slice(0, 10) : null].filter(Boolean).join(' · ') || '—'}</div></div>
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <input className={input + ' flex-1'} placeholder="Add a task…" value={tf.title ?? ''} onChange={(e) => setTf((f) => ({ ...f, title: e.target.value }))} />
            <input type="date" className={input} value={tf.due ?? ''} onChange={(e) => setTf((f) => ({ ...f, due: e.target.value }))} />
            <button onClick={addTask} disabled={busy === 't'} className={btnPrimary}>Add</button>
          </div>
        </div>
        <div className={card + ' lg:col-span-3 p-5'}>
          <div className="font-semibold text-gray-900 mb-3">Contacts <span className="text-gray-400 font-normal">· {contacts.length}</span></div>
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-gray-300" /> : contacts.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="h-8 w-8 rounded-full bg-[#0A2540] text-[#FFD700] text-[11px] font-bold flex items-center justify-center shrink-0">{(c.name || '?').split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join('')}</div>
                <div className="min-w-0 flex-1"><div className="text-[13px] font-medium text-gray-800 truncate">{c.name}</div><div className="text-[11px] text-gray-400 truncate">{[c.company, c.email].filter(Boolean).join(' · ')}</div></div>
                {c.role && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">{c.role}</span>}
                {c.deal_count > 0 && <span className="text-[10px] text-gray-400 shrink-0">{c.deal_count} deal{c.deal_count > 1 ? 's' : ''}</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            <input className={input} placeholder="Name" value={cf.name ?? ''} onChange={(e) => setCf((f) => ({ ...f, name: e.target.value }))} />
            <input className={input} placeholder="Company" value={cf.company ?? ''} onChange={(e) => setCf((f) => ({ ...f, company: e.target.value }))} />
            <input className={input} placeholder="Email" value={cf.email ?? ''} onChange={(e) => setCf((f) => ({ ...f, email: e.target.value }))} />
            <button onClick={addContact} disabled={busy === 'c'} className={btnPrimary + ' justify-center'}>Add</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================ CAMPAIGNS ============================
function CampaignsView({ setErr, buyBox }: { setErr: (s: string) => void; buyBox: any }) {
  const [camps, setCamps] = useState<any[]>([]); const [steps, setSteps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState('');
  const [creating, setCreating] = useState(false); const [name, setName] = useState('');
  const [draftSteps, setDraftSteps] = useState<any[]>([]); const [queue, setQueue] = useState<any[] | null>(null);
  const [enrolFor, setEnrolFor] = useState<string | null>(null); const [ef, setEf] = useState<Record<string, string>>({ min_fit: '60', limit: '50' });
  const CHANNEL_LABEL: Record<string, string> = { letter: 'Letter (posted)', email: 'Email', call_task: 'Call task (human)' };
  const CHANNEL_ICON: Record<string, any> = { letter: FileText, email: Mail, call_task: PhoneCall };

  const load = async () => { setLoading(true); try { const r = await outreachList(); setCamps(r.campaigns); setSteps(r.steps); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);
  const aiDraft = async () => { setBusy('draft'); setErr(''); try { const r = await outreachDraftTemplates(buyBox ? { buy_box: buyBox } : undefined); setDraftSteps(r.steps); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const create = async () => {
    if (!name.trim() || !draftSteps.length) { setErr('Name the campaign and draft the sequence first'); return; }
    setBusy('create'); try { await outreachCreate({ name, steps: draftSteps }); setCreating(false); setName(''); setDraftSteps([]); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const setStatus = async (id: string, status: string) => { setBusy(id); try { await outreachUpdate(id, { status }); await load(); } finally { setBusy(''); } };
  const enrol = async (id: string) => {
    setBusy('enrol'); try { const r = await outreachEnrol(id, { min_fit: ef.min_fit ? Number(ef.min_fit) : undefined, region: ef.region || undefined, limit: Number(ef.limit || 50) }); alert(`${r.enrolled} prospects enrolled (${r.suppressed} suppressed).`); setEnrolFor(null); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); }
  };
  const showQueue = async () => { setBusy('queue'); try { const r = await outreachQueue('needs_approval'); setQueue(r.touches); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };
  const approveAll = async () => { setBusy('approve'); try { const r = await outreachApproveAll(); alert(`${r.approved} messages approved. They send inside each campaign's window and daily cap.`); setQueue(null); await load(); } finally { setBusy(''); } };
  const runNow = async () => { setBusy('run'); try { await outreachRun(); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(''); } };

  return (
    <>
      <Header title="Campaigns" sub="Letter → email → call sequences, written in your voice from your buy box. Nothing sends until you approve it; suppressions and daily caps are enforced automatically.">
        <button onClick={showQueue} disabled={!!busy} className={btnGhost}><Check className="h-4 w-4" />Approval queue</button>
        <button onClick={runNow} disabled={!!busy} className={btnGhost}>{busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Run engine now</button>
        <button onClick={() => setCreating((c) => !c)} className={btnGold}><Send className="h-4 w-4" />New campaign</button>
      </Header>
      <div className="px-8 pb-8">
        {creating && (
          <div className={card + ' p-5 mb-5'}>
            <div className="flex gap-2 mb-3">
              <input className={input + ' flex-1'} placeholder="Campaign name, e.g. Laundries North West Q3" value={name} onChange={(e) => setName(e.target.value)} />
              <button onClick={aiDraft} disabled={busy === 'draft'} className={btnPrimary}>{busy === 'draft' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy === 'draft' ? 'Writing in your voice…' : 'Draft sequence with AI'}</button>
            </div>
            {draftSteps.map((s, i) => {
              const Icon = CHANNEL_ICON[s.channel];
              return (
                <div key={i} className="mb-3 bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-[12px] text-gray-500 mb-2"><Icon className="h-4 w-4" /><b className="text-gray-700">Step {i + 1} · {CHANNEL_LABEL[s.channel]}</b>{s.wait_days ? `· ${s.wait_days} days after previous` : '· immediately'}</div>
                  {s.subject != null && s.channel === 'email' && <input className={input + ' w-full mb-2'} value={s.subject} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, subject: e.target.value } : x))} />}
                  <textarea className={input + ' w-full min-h-[100px]'} value={s.body} onChange={(e) => setDraftSteps((d) => d.map((x, j) => j === i ? { ...x, body: e.target.value } : x))} />
                </div>
              );
            })}
            {draftSteps.length > 0 && <button onClick={create} disabled={busy === 'create'} className={btnGold}>{busy === 'create' && <Loader2 className="h-4 w-4 animate-spin" />}Create campaign (starts paused)</button>}
          </div>
        )}
        {queue && (
          <div className={card + ' p-5 mb-5'}>
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-gray-900">{queue.length} messages waiting for approval</div>
              <div className="flex gap-2"><button onClick={approveAll} disabled={!queue.length || !!busy} className={btnGold}><Check className="h-4 w-4" />Approve all</button><button onClick={() => setQueue(null)} className={btnGhost}>Close</button></div>
            </div>
            <div className="max-h-72 overflow-y-auto flex flex-col gap-2">
              {queue.map((t) => (
                <div key={t.id} className="bg-gray-50 rounded-lg p-3 text-[12px]">
                  <div className="flex items-center gap-2 mb-1"><b className="text-gray-800">{t.company_name}</b><span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-500">{t.channel}</span>
                    <button onClick={async () => { await outreachApprove([t.id]); setQueue((q) => q!.filter((x) => x.id !== t.id)); }} className="ml-auto text-emerald-600 hover:text-emerald-700 font-semibold">Approve</button></div>
                  {t.subject && <div className="text-gray-600 font-medium">{t.subject}</div>}
                  <div className="text-gray-500 line-clamp-2 whitespace-pre-wrap">{t.body}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {loading ? <div className="text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : camps.length === 0 && !creating ? (
          <div className={card + ' p-12 text-center text-gray-400'}>
            <Send className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <div className="text-gray-600 font-medium mb-1">No campaigns yet</div>
            <div className="text-[13px] mb-4">The proven recipe: a personal letter, a short follow-up email ten days later, then a phone call. The AI drafts all three from your buy box.</div>
            <button onClick={() => setCreating(true)} className={btnGold}><Send className="h-4 w-4" />Create your first campaign</button>
          </div>
        ) : camps.map((c) => (
          <div key={c.id} className={card + ' p-5 mb-3'}>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={'h-2.5 w-2.5 rounded-full ' + (c.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300')} />
              <b className="text-[14px] text-gray-900">{c.name}</b>
              <span className="text-[12px] text-gray-400">{c.members} enrolled · {c.sent} sent · {c.replied} replied{c.needs_approval ? ` · ${c.needs_approval} awaiting approval` : ''}</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEnrolFor(enrolFor === c.id ? null : c.id)} className={btnGhost}>Enrol prospects</button>
                {c.status !== 'active' ? <button onClick={() => setStatus(c.id, 'active')} disabled={busy === c.id} className={btnPrimary}>Activate</button>
                  : <button onClick={() => setStatus(c.id, 'paused')} disabled={busy === c.id} className={btnGhost}>Pause</button>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[12px] text-gray-400 mt-2">
              {steps.filter((s) => s.campaign_id === c.id).map((s, i, arr) => {
                const Icon = CHANNEL_ICON[s.channel];
                return <span key={s.id} className="flex items-center gap-1.5"><span className="flex items-center gap-1 bg-gray-100 rounded-full px-2.5 py-1 text-gray-600"><Icon className="h-3 w-3" />{CHANNEL_LABEL[s.channel]}{s.wait_days ? ` +${s.wait_days}d` : ''}</span>{i < arr.length - 1 && <ChevronRight className="h-3 w-3" />}</span>;
              })}
            </div>
            {enrolFor === c.id && (
              <div className="flex gap-2 items-center mt-3 flex-wrap bg-gray-50 rounded-lg p-3">
                <select className={input} value={ef.min_fit} onChange={(e) => setEf((f) => ({ ...f, min_fit: e.target.value }))}><option value="">Any fit</option><option value="60">Fit 60+</option><option value="80">Fit 80+</option></select>
                <input className={input + ' w-40'} placeholder="Region (optional)" value={ef.region ?? ''} onChange={(e) => setEf((f) => ({ ...f, region: e.target.value }))} />
                <select className={input} value={ef.limit} onChange={(e) => setEf((f) => ({ ...f, limit: e.target.value }))}><option value="25">Up to 25</option><option value="50">Up to 50</option><option value="100">Up to 100</option></select>
                <button onClick={() => enrol(c.id)} disabled={busy === 'enrol'} className={btnGold}>{busy === 'enrol' && <Loader2 className="h-4 w-4 animate-spin" />}Enrol</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

// ============================ FUNNEL ============================
function FunnelView({ setErr, settings, onSaved }: { setErr: (s: string) => void; settings: any; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState(settings?.funnel?.slug ?? '');
  const [headline, setHeadline] = useState(settings?.funnel?.headline ?? '');
  const [verifyTok, setVerifyTok] = useState(settings?.funnel?.meta_verify_token ?? '');
  const apiBase = ((import.meta as any).env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '') + '/functions/v1/acq-funnel';
  const pageUrl = window.location.origin + '/f' + (slug ? '/' + encodeURIComponent(slug) : '');
  const save = async () => {
    setBusy(true); setErr('');
    try { await setOrgSettings({ ...(settings ?? {}), funnel: { ...(settings?.funnel ?? {}), slug: slug || undefined, headline: headline || undefined, meta_verify_token: verifyTok || undefined } }); onSaved(); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <Header title="Funnel & Meta ads" sub="Your always-on inbound channel. A branded 'Thinking of selling?' page plus Meta lead ads, both feeding straight into Prospects." />
      <div className="px-8 pb-8 grid lg:grid-cols-2 gap-5">
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-1">Your seller page</div>
          <p className="text-[13px] text-gray-500 mb-3">Use it in ads, letters, email signatures and QR codes. Enquiries arrive as qualified leads with an automatic confidential reply.</p>
          <div className="flex gap-2 mb-2">
            <input className={input + ' w-44'} placeholder="Link slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} />
            <input className={input + ' flex-1'} placeholder="Headline (optional)" value={headline} onChange={(e) => setHeadline(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 mb-3">
            <Globe className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-[13px] text-gray-700 break-all flex-1">{pageUrl}</span>
            <button onClick={() => navigator.clipboard.writeText(pageUrl)} className={btnGhost + ' !px-2.5'} title="Copy"><Copy className="h-3.5 w-3.5" /></button>
            <a href={pageUrl} target="_blank" rel="noreferrer" className={btnGhost}>Preview</a>
          </div>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>
        </div>
        <div className={card + ' p-5'}>
          <div className="font-semibold text-gray-900 mb-1">Meta lead ads → straight into Prospects</div>
          <p className="text-[13px] text-gray-500 mb-3">Run "Thinking of selling your business?" instant-form ads on Facebook and Instagram. Leads flow in via webhook — no landing page needed.</p>
          <ol className="list-decimal list-inside text-[13px] text-gray-600 flex flex-col gap-1.5 mb-3">
            <li>Create a <b>Lead Ads</b> campaign with an instant form: business name, owner name, email, phone, area, rough turnover.</li>
            <li>Target your buy-box regions, ages 45–65, business-owner interests. Plain, personal creative beats stock photos.</li>
            <li>In the Meta App Dashboard add a <b>Webhooks</b> product → Page → subscribe to <b>leadgen</b> with the callback below.</li>
            <li>Save your Page ID and Page token in org settings so full lead details can be pulled.</li>
          </ol>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-2.5 mb-2">
            <span className="text-[12px] text-gray-700 break-all flex-1">{apiBase}</span>
            <button onClick={() => navigator.clipboard.writeText(apiBase)} className={btnGhost + ' !px-2.5'}><Copy className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex gap-2">
            <input className={input + ' flex-1'} placeholder="Webhook verify token" value={verifyTok} onChange={(e) => setVerifyTok(e.target.value)} />
            <button onClick={save} disabled={busy} className={btnPrimary}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================ BUY BOX ============================
function BuyBoxView({ settings, openWizard }: { settings: any; openWizard: () => void }) {
  const bb = settings?.buy_box;
  const [tax, setTax] = useState<Record<string, string>>({});
  useEffect(() => { sourceTaxonomy().then((r) => setTax(Object.fromEntries(r.taxonomy.map((t) => [t.key, t.label])))).catch(() => {}); }, []);
  return (
    <>
      <Header title="Buy box" sub="The definition of what you buy. Sourcing, fit scoring, campaign drafting and the funnel all read from it.">
        <button onClick={openWizard} className={btnGold}><Settings2 className="h-4 w-4" />{bb ? 'Edit buy box' : 'Set up buy box'}</button>
      </Header>
      <div className="px-8 pb-8">
        {!bb ? (
          <div className={card + ' p-12 text-center text-gray-400'}>
            <Target className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <div className="text-gray-600 font-medium mb-1">No buy box yet</div>
            <div className="text-[13px] mb-4">Two minutes of setup drives everything in Origination.</div>
            <button onClick={openWizard} className={btnGold}>Start the wizard</button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            <div className={card + ' p-5'}>
              <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Industries</div>
              <div className="flex flex-wrap gap-1.5">{(bb.industries ?? []).map((k: string) => <span key={k} className="text-[12px] px-3 py-1.5 rounded-full bg-[#0A2540] text-white">{tax[k] ?? k}</span>)}</div>
            </div>
            <div className={card + ' p-5'}>
              <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Geography</div>
              <div className="text-[14px] text-gray-800">{bb.location || '—'}</div>
              <div className="flex flex-wrap gap-1.5 mt-2">{(bb.regions ?? []).map((r: string) => <span key={r} className="text-[12px] px-3 py-1 rounded-full bg-gray-100 text-gray-600">{r}</span>)}</div>
            </div>
            <div className={card + ' p-5'}>
              <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Size</div>
              <div className="text-[14px] text-gray-800">{money(bb.revenue_min)}+ revenue · {money(bb.profit_min)}+ profit</div>
              <div className="text-[13px] text-gray-500 mt-1">Trading {bb.years_trading_min ?? 8}+ years</div>
            </div>
            <div className={card + ' p-5'}>
              <div className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Signals</div>
              <div className="text-[13px] text-gray-700">{bb.succession_pref !== false ? 'Succession priority on — owners 55+ score higher.' : 'Succession priority off.'}</div>
              {settings?.outreach?.sender_name && <div className="text-[13px] text-gray-500 mt-2">Outreach signed by <b className="text-gray-700">{settings.outreach.sender_name}</b></div>}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
