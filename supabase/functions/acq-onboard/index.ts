// =============================================================================
// acq-onboard v8 — self-serve signup backbone + tenant pipeline + GHL sync + drip.
// v8: deal_intake now serves the HOST org too — for Sandeep's workspace it
// creates a public.submissions row (his board's source of truth) with the
// analyst brief in notes and every gap as a deal_items clarification, so the
// admin demo experience is identical to what users get.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (x: string) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const STAGES = ['new', 'reviewing', 'shortlisted', 'discovery_call', 'structuring', 'hots', 'dd_financial', 'dd_commercial', 'dd_legal', 'funding', 'pre_completion', 'takeover', 'completed', 'passed', 'ineligible'];

function computeScore(i: any) {
  const b: any[] = [];
  const age = Number(i.oldest_director_age ?? 0);
  const succ = age >= 70 ? 30 : age >= 65 ? 25 : age >= 60 ? 18 : age >= 55 ? 10 : 0;
  b.push({ part: 'Succession pressure', pts: succ, max: 30 });
  const rev = Number(i.revenue ?? 0), eb = Number(i.ebitda ?? 0);
  let fin = (rev >= 750000 && eb >= 180000) ? 15 : 0;
  const margin = rev > 0 ? eb / rev : 0;
  fin += margin >= 0.2 ? 10 : margin >= 0.12 ? 5 : 0;
  b.push({ part: 'Financial quality', pts: fin, max: 25 });
  const yrs = i.incorporated_on ? (Date.now() - new Date(i.incorporated_on).getTime()) / 3.156e10 : 0;
  let ten = yrs >= 15 ? 12 : yrs >= 8 ? 8 : yrs >= 3 ? 4 : 0;
  ten += i.adverse_filings ? 0 : 8;
  b.push({ part: 'Tenure & stability', pts: ten, max: 20 });
  const ready = (i.accounts_current ? 5 : 0) + (i.seller_engaged ? 10 : 0);
  b.push({ part: 'Deal readiness', pts: ready, max: 15 });
  const asset = i.asset_backing === 'full' ? 10 : i.asset_backing === 'partial' ? 5 : 0;
  b.push({ part: 'Asset backing', pts: asset, max: 10 });
  const total = succ + fin + ten + ready + asset;
  return { score: total, breakdown: b, band: total >= 80 ? 'Exceptional' : total >= 65 ? 'Strong' : total >= 50 ? 'Solid' : 'Speculative' };
}

async function fetchSiteText(url: string): Promise<string> {
  try {
    let u = String(url).trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(u, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OfficiallyInvested/1.0)' }, redirect: 'follow' });
    clearTimeout(t);
    if (!r.ok) return '';
    const html = await r.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').slice(0, 9000);
  } catch (_) { return ''; }
}

async function ghlFind(key: string, loc: string, email: string): Promise<any | null> {
  const r = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(loc)}&query=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', Accept: 'application/json' },
  });
  if (!r.ok) return null;
  const j = await r.json();
  const list = j?.contacts ?? [];
  return list.find((c: any) => (c.email ?? '').toLowerCase() === email.toLowerCase()) ?? list[0] ?? null;
}
async function ghlUpsert(key: string, loc: string, payload: any): Promise<any | null> {
  const r = await fetch('https://services.leadconnectorhq.com/contacts/upsert', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ locationId: loc, ...payload }),
  });
  if (!r.ok) return null;
  return (await r.json())?.contact ?? null;
}

const dH = (t: string) => `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;color:#0A2540;margin:0 0 16px;">${t}</h1>`;
const dP = (t: string) => `<p style="margin:0 0 14px;">${t}</p>`;
const dBtn = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td bgcolor="#F5C518" style="background:#F5C518;border-radius:12px;"><a href="${href}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#0A2540;text-decoration:none;padding:13px 26px;">${label}</a></td></tr></table>`;
const dFoot = dP('<span style="font-size:12.5px;color:#6B7A89;">Questions? Reply to this email. A person reads it. Reply "stop" to pause these tips.</span>');
type DripStage = { key: string; day: number; subject: string; preheader: string; inner: (first: string) => string };
const FREE_DRIP: DripStage[] = [
  { key: 'free_1', day: 1, subject: 'Your first Acquisition Score takes four minutes', preheader: 'Add any business you are watching and let the engine score it.',
    inner: (f) => dH('Score a real business today.') + dP(`${f}, the fastest way to feel what this platform does: add any business you already know of to your pipeline, answer five questions, and get its Acquisition Score on the same framework behind £5bn of deal analysis. Free, every time.`) + dP('A 63 is a maybe. An 80 is a business you should be writing to this week.') + dBtn('https://www.officiallyinvested.com/admin/pipeline', 'Add a deal and score it') + dFoot },
  { key: 'free_3', day: 3, subject: 'Why owners answer letters and ignore everyone else', preheader: 'The method behind members’ 3-8% reply rates.',
    inner: (f) => dH('The letters method, in one minute.') + dP(`${f}, the owners worth buying from are in their 60s. They do not answer cold emails or LinkedIn. A short personal letter from a named buyer lands on their desk where nothing else does. Our members see 3-8% reply rates against under 1% for email.`) + dP('The engine finds the right owners from 1.1 million UK companies, writes every letter in your voice, and nothing sends until you approve it. That is what the Originator plan runs on: 100 letters a month, which is typically 3 to 8 real seller conversations.') + dBtn('https://www.officiallyinvested.com/admin/origination?view=campaigns', 'See how campaigns work') + dFoot },
  { key: 'free_7', day: 7, subject: 'The deals you can see but not open', preheader: 'Members got first look this week. Here is what that means.',
    inner: (f) => dH('You are watching the shop window.') + dP(`${f}, the deals in the member flow are businesses we approached directly, before any broker or listing site. Members apply, sign the NDA in-app, and speak to the owner with no auction around them. Free accounts see the teaser. Members open the data room.`) + dP('Analyst gets you in on day 7. Originator on day 3 with NDA slots. Team sees every deal the moment it releases.') + dBtn('https://www.officiallyinvested.com/deals', 'See the current deals') + dFoot },
];
const PAID_DRIP: DripStage[] = [
  { key: 'paid_1', day: 1, subject: 'Day one: point the engine at your buy box', preheader: 'Start your first sourcing run. It works while you sleep.',
    inner: (f) => dH('Start your first sourcing run.') + dP(`${f}, your plan includes automated sourcing across the whole UK register. Open Find companies, check your buy box filters, and start a run: the engine works through every match in the background and your Prospects view fills as it analyses.`) + dP('Most members find their first genuinely interesting owner inside 48 hours.') + dBtn('https://www.officiallyinvested.com/admin/origination?view=find', 'Start a sourcing run') + dFoot },
  { key: 'paid_3', day: 3, subject: 'Your letters are drafted. They need your yes.', preheader: 'Nothing sends without approval. Here is the rhythm.',
    inner: (f) => dH('Approve your first letters.') + dP(`${f}, once prospects are enrolled in a campaign the AI drafts every letter in your voice and queues it for approval. One letter credit per letter posted; your monthly allowance is already in your account.`) + dP('The rhythm that works: approve a batch, let the engine pace them out, and watch replies land in your funnel. Call tasks appear in Tasks when it is time to pick up the phone.') + dBtn('https://www.officiallyinvested.com/admin/origination?view=campaigns', 'Open the approval queue') + dFoot },
  { key: 'paid_6', day: 6, subject: 'Your member deal flow is open', preheader: 'Deals matching your buy box are flagged for you.',
    inner: (f) => dH('Deals, sourced for you.') + dP(`${f}, your membership tier is live in the deal flow: deals matching your buy box are flagged and ordered for you, and when one fits, you apply, sign the NDA in-app and open the data room the same day.`) + dP('One buyer gets exclusivity on each deal. First look matters.') + dBtn('https://www.officiallyinvested.com/deals', 'Open the deal flow') + dFoot },
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  const done = async (b: unknown, s = 200) => { await sql.end({ timeout: 5 }); return json(b, s); };
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'status';

    if (action === 'run_drip') {
      const secret = (await sql`select value from public.oi_config where key='acq_internal_secret'`)[0]?.value;
      if (!(req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === secret)) return done({ error: 'unauthorised' }, 401);
      const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('resend_api_key','from_email','email_template')`).map((r: any) => [r.key, r.value]));
      if (!cfg.resend_api_key) return done({ ok: true, note: 'no resend key' });
      const host = (await sql`select id from acq.organizations order by created_at limit 1`)[0];
      const orgs = await sql`select o.id, o.settings, u.email, coalesce(o.settings->'profile'->>'founder_name','') as fname
        from acq.organizations o join acq.org_members m on m.org_id=o.id and m.role='owner' join auth.users u on u.id=m.user_id
        where o.id <> ${host.id}`;
      let sent = 0; const report: string[] = [];
      for (const o of orgs) {
        const st = o.settings ?? {}; const drip = st.drip ?? {}; const already = drip.sent ?? {};
        if (drip.stop) continue;
        const plan = st.plan ?? 'free';
        const seq = plan === 'free' ? FREE_DRIP : PAID_DRIP;
        const anchor = plan === 'free' ? st.signup?.at : (drip.paid_started ?? st.billing?.since);
        if (!anchor || !o.email) continue;
        const days = (Date.now() - new Date(anchor).getTime()) / 86400000;
        const due = seq.find((d) => days >= d.day && !already[d.key]);
        if (!due || days > due.day + 10) { if (due) { already[due.key] = 'skipped_stale'; await sql`update acq.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{drip,sent}', ${already}) where id=${o.id}`; } continue; }
        const first = esc((o.fname || o.email.split('@')[0]).split(' ')[0]);
        const tpl = cfg.email_template ?? '<html><body>{{CONTENT}}</body></html>';
        const html = tpl.replaceAll('{{BRAND}}', 'Officially Invested').replaceAll('{{PREHEADER}}', due.preheader).replaceAll('{{CONTENT}}', due.inner(first));
        try {
          const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: `Officially Invested <${cfg.from_email ?? 'deals@officiallyinvested.com'}>`, to: [o.email], subject: due.subject, html }) });
          if (r.ok) { already[due.key] = new Date().toISOString(); sent++; report.push(`${o.email}:${due.key}`); await sql`update acq.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{drip,sent}', ${already}) where id=${o.id}`; }
        } catch (_) { /* next org */ }
      }
      return done({ ok: true, sent, report });
    }

    const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data } = await sb.auth.getUser();
    if (!data?.user) return done({ error: 'unauthorised' }, 401);
    const userId = data.user.id, email = (data.user.email ?? '').toLowerCase();

    const mem = (await sql`select m.org_id, m.role, o.name, o.settings from acq.org_members m join acq.organizations o on o.id=m.org_id where m.user_id=${userId} order by m.created_at limit 1`)[0] ?? null;
    const hostOrg = (await sql`select id from acq.organizations order by created_at limit 1`)[0];

    if (action === 'status') {
      if (!mem) return done({ ok: true, has_org: false, email });
      const buybox = (await sql`select count(*)::int as n from acq.buy_boxes where org_id=${mem.org_id}`)[0].n;
      const prospects = (await sql`select count(*)::int as n from acq.prospects where org_id=${mem.org_id}`)[0].n;
      const deals = (await sql`select count(*)::int as n from acq.deals where org_id=${mem.org_id}`)[0].n;
      return done({
        ok: true, has_org: true, org_id: mem.org_id, org_name: mem.name, role: mem.role,
        plan: mem.settings?.plan ?? 'free', is_host_org: mem.org_id === hostOrg.id,
        profile: mem.settings?.profile ?? null, tour_done: !!mem.settings?.tour_done,
        ghl_tags: mem.settings?.ghl?.tags ?? null,
        buyboxes: Number(buybox), prospects: Number(prospects), deals: Number(deals), email,
      });
    }

    if (action === 'provision') {
      if (mem) return done({ ok: true, org_id: mem.org_id, existing: true });
      const name = String(body.org_name ?? '').trim().slice(0, 80) || `${(body.full_name ?? email.split('@')[0])}'s workspace`;
      const fullName = String(body.full_name ?? '').slice(0, 120);
      const profile = { founder_name: fullName, entity_name: name, website: String(body.website ?? '').slice(0, 200), bio: String(body.bio ?? '').slice(0, 1000) };
      const settings: any = { plan: 'free', profile, signup: { at: new Date().toISOString(), email } };
      const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('resend_api_key','from_email','email_template','ghl_api_key','ghl_location_id','ghl_tier_tags')`).map((r: any) => [r.key, r.value]));
      let ghlTags: string[] = []; let ghlId: string | null = null; let mappedTier: string | null = null;
      if (cfg.ghl_api_key && cfg.ghl_location_id) {
        try {
          const existing = await ghlFind(cfg.ghl_api_key, cfg.ghl_location_id, email);
          ghlTags = (existing?.tags ?? []).map((t: string) => String(t).toLowerCase());
          const first = fullName.split(' ')[0] ?? ''; const last = fullName.split(' ').slice(1).join(' ');
          const up = await ghlUpsert(cfg.ghl_api_key, cfg.ghl_location_id, {
            email, firstName: first || undefined, lastName: last || undefined,
            companyName: name, website: profile.website || undefined, source: 'Investor OS signup',
            tags: Array.from(new Set([...(existing?.tags ?? []), 'investoros signup', 'investoros free'])),
          });
          ghlId = up?.id ?? existing?.id ?? null;
          settings.ghl = { contact_id: ghlId, tags: ghlTags, known: ghlTags.length > 0, synced_at: new Date().toISOString() };
          if (cfg.ghl_tier_tags) {
            try {
              const map = JSON.parse(cfg.ghl_tier_tags);
              for (const [tag, tier] of Object.entries(map)) {
                if (ghlTags.includes(String(tag).toLowerCase()) && ['circle', 'accelerator', 'academy'].includes(String(tier))) { mappedTier = String(tier); break; }
              }
            } catch (_) { /* bad mapping json */ }
          }
        } catch (_) { /* GHL best-effort */ }
      }
      const org = (await sql`insert into acq.organizations (name, settings) values (${name}, ${settings}) returning id, name`)[0];
      await sql`insert into acq.org_members (org_id, user_id, role) values (${org.id}, ${userId}, 'owner')`;
      if (mappedTier) {
        await sql`insert into acq.members (org_id, user_id, email, full_name, tier, status, notes)
          values (${hostOrg.id}, ${userId}, ${email}, ${fullName}, ${mappedTier}, 'active', 'auto: ghl tag mapping')
          on conflict (org_id, email) do update set tier=${mappedTier}, status='active', user_id=coalesce(acq.members.user_id, excluded.user_id), updated_at=now()`;
      }
      if (cfg.resend_api_key) {
        const inner = `
<div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.3;color:#0A2540;font-weight:700;">Welcome, ${esc(fullName.split(' ')[0] || 'investor')}.</div>
<p style="margin-top:14px;">Your Investor OS is live. Most people spend months browsing listings everyone else has already seen. You now run the other playbook: the whole UK register, scanned against your buy box, with owners approached before they ever list.</p>
<p><b>Your first week, well spent:</b></p>
<p style="margin:6px 0;">1. Finish your buy box with the coach. Everything keys off it.<br/>2. Open Find companies and watch your matches appear.<br/>3. Browse the member deal flow. Anonymised until NDA, released to members first.<br/>4. Add any deal you're already tracking to your pipeline and get its Acquisition Score, free.</p>
<p style="margin-top:24px;"><a href="https://www.officiallyinvested.com/admin/origination" style="display:inline-block;background:#FFD700;color:#0A2540;font-weight:700;font-size:14px;padding:13px 26px;border-radius:10px;text-decoration:none;">Open my workspace</a>
<a href="https://www.officiallyinvested.com/deals" style="display:inline-block;margin-left:10px;color:#0A2540;font-weight:700;font-size:14px;padding:13px 8px;text-decoration:none;">See live deals &rarr;</a></p>
<p style="font-size:13px;color:#93A0B4;margin-top:20px;">Questions? Reply to this email. A person reads it.</p>`;
        const tpl = cfg.email_template ?? '';
        const html = tpl.includes('{{CONTENT}}')
          ? tpl.replace(/{{BRAND}}/g, 'Officially Invested').replace(/{{PREHEADER}}/g, 'Your Investor OS is live. Here is your first week, well spent.').replace('{{CONTENT}}', inner)
          : inner;
        try { await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: cfg.from_email, to: [email], subject: 'Welcome to your Investor OS', html }) }); } catch (_) { /* best effort */ }
      }
      return done({ ok: true, org_id: org.id, org_name: org.name, existing: false, ghl_known: ghlTags.length > 0, mapped_tier: mappedTier });
    }

    if (!mem) return done({ error: 'no workspace' }, 403);

    if (action === 'score') {
      const r = { ok: true, ...computeScore(body.inputs ?? {}) };
      if (body.deal_id) {
        try { await sql`update acq.deals set ch_snapshot = coalesce(ch_snapshot,'{}'::jsonb) || ${{ acquisition_score: (r as any).score, score_breakdown: (r as any).breakdown, score_band: (r as any).band, score_inputs: body.inputs ?? {} }} where id=${body.deal_id} and org_id=${mem.org_id}`; } catch (_) { /* best effort */ }
      }
      return done(r);
    }

    if (action === 'complete_tour') {
      await sql`update acq.organizations set settings = jsonb_set(coalesce(settings,'{}'::jsonb), '{tour_done}', 'true') where id=${mem.org_id}`;
      return done({ ok: true });
    }

    if (action === 'deals_list') {
      const rows = await sql`select d.id, d.name, d.asset_type, d.sector, d.status, d.source, d.asking_price, d.ch_snapshot, d.submission_id, d.created_at, d.updated_at,
          (select count(*)::int from acq.documents doc where doc.deal_id = d.id) as docs_count,
          (select count(*)::int from acq.tasks t where t.deal_id = d.id and t.status = 'open') as open_tasks
        from acq.deals d where d.org_id=${mem.org_id} order by d.updated_at desc limit 300`;
      return done({ ok: true, deals: rows, stages: STAGES });
    }
    if (action === 'deal_create') {
      const d = body.deal ?? {};
      if (!String(d.name ?? '').trim()) return done({ error: 'name required' }, 400);
      const row = (await sql`insert into acq.deals (org_id, name, asset_type, sector, status, source, asking_price, created_by)
        values (${mem.org_id}, ${String(d.name).slice(0, 160)}, ${d.asset_type ?? 'business'}, ${d.sector ?? null}, ${STAGES.includes(d.status) ? d.status : 'new'}, ${d.source ?? 'manual'}, ${d.asking_price ?? null}, ${userId}) returning *`)[0];
      return done({ ok: true, deal: row });
    }
    if (action === 'deal_update') {
      const row = (await sql`update acq.deals set
        status = ${body.status && STAGES.includes(body.status) ? body.status : sql`status`},
        name = ${body.name ? String(body.name).slice(0, 160) : sql`name`},
        sector = ${body.sector !== undefined ? body.sector : sql`sector`},
        asking_price = ${body.asking_price !== undefined ? body.asking_price : sql`asking_price`},
        updated_at = now()
        where id=${body.deal_id} and org_id=${mem.org_id} returning *`)[0];
      return done({ ok: true, deal: row });
    }

    // ---- conversational intake: research the business, score it, list the gaps.
    // Tenants get an acq.deals row; the HOST org gets a public.submissions row so
    // the deal lands on Sandeep's board with the same brief and gap items.
    if (action === 'deal_intake') {
      const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','from_email')`).map((r: any) => [r.key, r.value]));
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      if (!ANTHROPIC) return done({ error: 'The analyst is briefly unavailable. Add the deal manually and it will still score.' }, 500);
      const raw = String(body.text ?? '').slice(0, 4000);
      const urlMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?/i);
      const site = body.website ?? (urlMatch ? urlMatch[0] : null);
      let siteText = '';
      let chUrl: string | null = null;
      if (site && /find-and-update\.company-information|companieshouse/i.test(site)) chUrl = site;
      else if (site) siteText = await fetchSiteText(site);
      let chFromUrl: any = null;
      if (chUrl) {
        const num = chUrl.match(/company\/([A-Z0-9]{6,10})/i)?.[1];
        if (num) chFromUrl = (await sql`select * from acq.companies_index where company_number=${num.toUpperCase()} limit 1`)[0] ?? null;
      }
      const blocks: any[] = [];
      for (const a of (Array.isArray(body.attachments) ? body.attachments : []).slice(0, 4)) {
        if (!a?.base64 && !a?.text) continue;
        if (a.text) blocks.push({ type: 'text', text: `Attached file ${a.file_name}:\n${String(a.text).slice(0, 12000)}` });
        else if (String(a.media_type).startsWith('image/')) blocks.push({ type: 'image', source: { type: 'base64', media_type: a.media_type, data: a.base64 } });
        else blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.base64 } });
      }
      const context = [
        raw ? `What the buyer told us: ${raw}` : '',
        siteText ? `Website content (${site}): ${siteText}` : '',
        chFromUrl ? `Official register record: ${JSON.stringify(chFromUrl)}` : '',
      ].filter(Boolean).join('\n\n') || 'No text provided, rely on the attachments.';
      const ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1500,
          system: 'You are the intake analyst for a UK business acquisition pipeline built on the Officially Invested framework. From the buyer\'s notes, the website content, the official register record and any attached documents (NDAs, accounts, IMs, broker packs), extract what is actually evidenced. Plain UK English, no em dashes, no AI tells. NEVER invent numbers: only report revenue, EBITDA or director ages that appear in the material. Everything the framework still needs goes in missing_info, most important first (the playbook starts with: confirm fit with the buy box, request VAT returns because they beat accounts, last 3 years accounts, confirm the owner\'s age and reason for selling, asking price and terms, lease or freehold position). summary is 3 to 4 sentences a buyer would actually find useful: what the business does, how it makes money, why it might fit or not, and the single biggest unknown.',
          tools: [{ name: 'set_intake', description: 'Structured intake', input_schema: { type: 'object', properties: {
            name: { type: 'string', description: 'trading or registered company name' },
            asset_type: { type: 'string', enum: ['business', 'property'] },
            sector: { type: 'string' }, region: { type: 'string' },
            asking_price: { type: 'number', description: 'only if stated in the material' },
            summary: { type: 'string' },
            score_inputs: { type: 'object', properties: { oldest_director_age: { type: 'number' }, revenue: { type: 'number' }, ebitda: { type: 'number' }, incorporated_on: { type: 'string' }, accounts_current: { type: 'boolean' }, seller_engaged: { type: 'boolean' }, asset_backing: { type: 'string', enum: ['none', 'partial', 'full'] } } },
            doc_types_seen: { type: 'array', items: { type: 'string' }, description: 'e.g. NDA, accounts 2023, IM' },
            missing_info: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, why: { type: 'string' } }, required: ['item'] }, description: 'max 6, most important first' },
            confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
          }, required: ['name', 'asset_type', 'summary', 'missing_info', 'confidence'] } }],
          tool_choice: { type: 'tool', name: 'set_intake' },
          messages: [{ role: 'user', content: [...blocks, { type: 'text', text: context }] }],
        }),
      });
      if (!ar.ok) { const t = await ar.text(); return done({ error: 'The analyst could not read that just now. Try again, or add the deal manually. (' + ar.status + ')', detail: t.slice(0, 150) }, 502); }
      const intake: any = ((await ar.json()).content ?? []).find((b: any) => b.type === 'tool_use')?.input;
      if (!intake?.name) return done({ error: 'Could not identify the business from that. Add its name or website and try again.' }, 422);
      let ch = chFromUrl;
      if (!ch) { try { ch = (await sql`select * from acq.companies_index where name=${String(intake.name).toUpperCase()} and status='active' limit 1`)[0] ?? null; } catch (_) { ch = null; } }
      const si: any = intake.score_inputs ?? {};
      if (!si.incorporated_on && ch?.incorporated) si.incorporated_on = String(ch.incorporated).slice(0, 10);
      if (si.accounts_current === undefined) si.accounts_current = true;
      if (si.seller_engaged === undefined) si.seller_engaged = false;
      if (!si.asset_backing) si.asset_backing = 'none';
      const scorable = Number(si.revenue) > 0 || Number(si.ebitda) > 0 || Number(si.oldest_director_age) > 0 || si.incorporated_on;
      const scored = scorable ? computeScore(si) : null;
      const missing = (intake.missing_info ?? []).slice(0, 6);
      const summary = String(intake.summary).slice(0, 900);

      // ---- HOST ORG: create a submission so it lands on the admin board ----
      if (mem.org_id === hostOrg.id) {
        const isProp = intake.asset_type === 'property';
        const notes = [
          `ANALYST INTAKE BRIEF (confidence ${intake.confidence}${ch ? ', matched CH ' + ch.company_number : ''})`,
          summary,
          raw ? `Buyer notes: ${raw}` : '',
          scored ? `First-pass Acquisition Score: ${scored.score} (${scored.band})` : 'Not scorable yet from the material provided.',
        ].filter(Boolean).join('\n\n');
        const sub = (await sql`
          insert into public.submissions
            (type, submitter_name, email, phone, submitter_role, heard_via, business_name, spv_name, sector,
             revenue, net_profit, asking_price, website, notes, consent, marketing_optin, status)
          values
            (${isProp ? 'property' : 'business'}, 'Officially Invested (origination)', ${cfg.from_email || 'deals@officiallyinvested.com'}, '', 'other', 'analyst_intake',
             ${isProp ? null : String(intake.name).slice(0, 160)}, ${isProp ? String(intake.name).slice(0, 160) : null}, ${intake.sector ?? null},
             ${Number(si.revenue) > 0 ? Number(si.revenue) : null}, ${Number(si.ebitda) > 0 ? Number(si.ebitda) : null}, ${intake.asking_price ?? null},
             ${site ?? null}, ${notes}, true, false, 'new')
          returning id, reference`)[0];
        for (const g of missing) {
          const content = `Get: ${String(g.item).slice(0, 120)}` + (g.why ? ` (${String(g.why).slice(0, 100)})` : '');
          try { await sql`insert into public.deal_items (submission_id, kind, content, stage) values (${sub.id}, 'clarification', ${content}, 'new')`; } catch (_) { /* best effort */ }
        }
        return done({ ok: true, host: true, submission_id: sub.id, reference: sub.reference, summary, confidence: intake.confidence, score: scored?.score ?? null, band: scored?.band ?? null, missing_info: missing, ch_matched: !!ch });
      }

      // ---- TENANT: acq.deals row with the brief in ch_snapshot ----
      const snapshot: any = {
        score_inputs: si,
        ...(scored ? { acquisition_score: scored.score, score_breakdown: scored.breakdown, score_band: scored.band } : {}),
        intake: {
          summary, confidence: intake.confidence,
          missing_info: missing, doc_types_seen: intake.doc_types_seen ?? [],
          website: site ?? null, at: new Date().toISOString(),
          ...(ch ? { ch: { number: ch.company_number, incorporated: ch.incorporated, postcode: ch.postcode, town: ch.town, sic: ch.sic_primary } } : {}),
        },
      };
      const row = (await sql`insert into acq.deals (org_id, name, asset_type, sector, status, source, asking_price, ch_snapshot, created_by)
        values (${mem.org_id}, ${String(intake.name).slice(0, 160)}, ${intake.asset_type ?? 'business'}, ${intake.sector ?? null}, 'new', 'intake', ${intake.asking_price ?? null}, ${snapshot}, ${userId}) returning *`)[0];
      for (const g of missing.slice(0, 5)) {
        const title = `Get: ${String(g.item).slice(0, 90)}` + (g.why ? ` (${String(g.why).slice(0, 80)})` : '');
        try { await sql`insert into acq.tasks (org_id, deal_id, title, due_date, created_by, meta) values (${mem.org_id}, ${row.id}, ${title}, ${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}, ${userId}, ${{ auto: true, action: 'call_or_manual', why: String(g.why ?? 'intake gap').slice(0, 150) }})`; } catch (_) { /* best effort */ }
      }
      return done({ ok: true, deal: row, summary, confidence: intake.confidence, score: scored?.score ?? null, band: scored?.band ?? null, missing_info: missing, ch_matched: !!ch });
    }

    return done({ error: `unknown action ${action}` }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
