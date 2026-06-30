import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ArrowLeft, Check, Upload, PenLine, ShieldCheck, Inbox, Sparkles } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { legalGetProfile, legalSetProfile } from '../../lib/acq';

type Profile = Record<string, any>;

export default function Settings() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [p, setP] = useState<Profile>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const sigRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => {
      const ok = !!data.session;
      setAuthed(ok);
      if (ok) legalGetProfile().then((r) => setP(r.profile || {})).catch((e) => setErr(String(e))).finally(() => setLoading(false));
      else setLoading(false);
    });
  }, []);

  const set = (k: string, v: any) => { setP((x) => ({ ...x, [k]: v })); setSaved(false); };
  const onSig = (f: File | null) => {
    if (!f) return;
    const r = new FileReader();
    r.onload = () => { set('signature_image', String(r.result)); };
    r.readAsDataURL(f);
  };
  const save = async () => {
    setSaving(true); setErr('');
    try { const r = await legalSetProfile(p); setP(r.profile || p); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    catch (e: any) { setErr(e.message || String(e)); } finally { setSaving(false); }
  };

  const input = 'w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-white/35 outline-none focus:border-[#FFD700]/60';
  const label = 'block text-white/55 text-xs font-semibold mb-1.5';

  if (authed === false) return (
    <div className="min-h-screen bg-[#0A2540] text-white flex items-center justify-center p-6">
      <div className="text-center"><p className="text-white/70 mb-3">Please sign in to access settings.</p><Link to="/admin/pipeline" className="text-[#FFD700] font-semibold">Go to sign in →</Link></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A2540] text-white">
      <div className="max-w-3xl mx-auto px-5 py-8">
        <Link to="/admin/pipeline" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-5"><ArrowLeft className="h-4 w-4" /> Back to pipeline</Link>
        <h1 className="text-3xl font-serif font-bold text-[#FFD700] mb-1">Settings</h1>
        <p className="text-white/55 text-sm mb-8">Set up your buyer profile and e-signature once. The agent uses these to complete and sign NDAs and onboarding documents for brokers, on every deal.</p>

        {loading ? <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : (
          <div className="flex flex-col gap-5">
            {/* Buyer profile */}
            <Section icon={<Sparkles className="h-4 w-4" />} title="Buyer profile" sub="Used to pre-fill NDAs, the buyer background and proof of funds.">
              <div className="grid md:grid-cols-2 gap-3">
                <div><span className={label}>Your name</span><input className={input} value={p.buyer_name ?? ''} onChange={(e) => set('buyer_name', e.target.value)} placeholder="Jane Smith" /></div>
                <div><span className={label}>Company / buying entity</span><input className={input} value={p.company ?? ''} onChange={(e) => set('company', e.target.value)} placeholder="Acme Acquisitions Ltd" /></div>
                <div><span className={label}>Role</span><input className={input} value={p.role ?? ''} onChange={(e) => set('role', e.target.value)} placeholder="Principal / Director" /></div>
                <div><span className={label}>Email</span><input className={input} value={p.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="you@firm.com" /></div>
                <div className="md:col-span-2"><span className={label}>Registered / correspondence address</span><input className={input} value={p.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="1 High Street, London, EC1A 1AA" /></div>
                <div className="md:col-span-2"><span className={label}>Background (for the buyer one-pager)</span><textarea className={input + ' h-24 resize-none'} value={p.background ?? ''} onChange={(e) => set('background', e.target.value)} placeholder="Your experience, track record and the kind of assets you acquire." /></div>
                <div className="md:col-span-2"><span className={label}>Proof of funds / funding readiness</span><textarea className={input + ' h-20 resize-none'} value={p.proof_of_funds ?? ''} onChange={(e) => set('proof_of_funds', e.target.value)} placeholder="How you fund deals (equity, debt facilities, etc). Formal evidence available on request." /></div>
              </div>
            </Section>

            {/* E-signature */}
            <Section icon={<PenLine className="h-4 w-4" />} title="E-signature" sub="The agent applies this to documents you generate. You always review before anything is sent.">
              <div className="grid md:grid-cols-2 gap-3">
                <div><span className={label}>Signatory name</span><input className={input} value={p.signatory_name ?? ''} onChange={(e) => set('signatory_name', e.target.value)} placeholder="Jane Smith" /></div>
                <div><span className={label}>Typed signature</span><input className={input + ' font-serif italic text-lg'} value={p.signature_typed ?? ''} onChange={(e) => set('signature_typed', e.target.value)} placeholder="Jane Smith" /></div>
              </div>
              <div className="mt-3">
                <span className={label}>Or upload a signature image (PNG/JPG)</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => sigRef.current?.click()} className="inline-flex items-center gap-2 bg-white/10 text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-white/20"><Upload className="h-4 w-4" /> Upload</button>
                  <input ref={sigRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { onSig(e.target.files?.[0] ?? null); e.target.value = ''; }} />
                  {p.signature_image && <img src={p.signature_image} alt="signature" className="h-12 bg-white rounded-md px-2" />}
                  {p.signature_image && <button onClick={() => set('signature_image', null)} className="text-white/50 text-xs hover:text-white">Remove</button>}
                </div>
              </div>
              <label className="flex items-start gap-2.5 mt-4 cursor-pointer bg-[#FFD700]/8 border border-[#FFD700]/25 rounded-lg p-3">
                <input type="checkbox" className="h-4 w-4 mt-0.5 accent-[#FFD700]" checked={!!p.esign_consent} onChange={(e) => set('esign_consent', e.target.checked)} />
                <span className="text-[13px] text-white/80"><span className="font-semibold text-white">I consent to electronic signing.</span> I authorise the software to apply my signature above to NDAs and onboarding documents I generate, as my electronic signature. I understand I review each document and remain responsible for what I send.{p.consent_at && <span className="block text-white/45 text-[11px] mt-1">Consent recorded {new Date(p.consent_at).toLocaleDateString('en-GB')}.</span>}</span>
              </label>
              <p className="text-white/35 text-[11px] mt-2 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Documents are generated as standard templates, not legal advice. Have them reviewed before relying on them.</p>
            </Section>

            {err && <p className="text-red-300 text-sm">{err}</p>}
            <div className="flex items-center gap-3">
              <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 bg-[#FFD700] text-[#0A2540] px-5 py-2.5 rounded-full text-sm font-bold hover:bg-opacity-90 disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : saved ? <Check className="h-4 w-4" /> : null}{saved ? 'Saved' : 'Save settings'}</button>
            </div>

            {/* Email capture */}
            <Section icon={<Inbox className="h-4 w-4" />} title="Email capture" sub="Forward or BCC deal emails and they file themselves to the deal and CRM.">
              <p className="text-[13px] text-white/65">Each deal shows its own capture address in the deal drawer (under Correspondence). Forward or BCC there and the email is logged automatically; the agent's own emails are saved too.</p>
            </Section>

            <p className="text-white/40 text-xs">Investment thesis and buy box, CRM and alerts are on the <Link to="/admin/pipeline" className="text-[#FFD700]">pipeline board</Link> header.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ icon, title, sub, children }: { icon: React.ReactNode; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
      <div className="flex items-center gap-2 text-[#FFD700] mb-0.5">{icon}<h2 className="font-serif font-bold text-lg">{title}</h2></div>
      {sub && <p className="text-white/45 text-xs mb-4">{sub}</p>}
      {children}
    </div>
  );
}
