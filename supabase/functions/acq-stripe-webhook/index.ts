// =============================================================================
// acq-stripe-webhook v6 — entitlement + credits + branded receipts + GHL tags.
// v6: GoHighLevel lifecycle tags on every plan event (investoros <plan>,
// investoros paying, investoros annual, investoros churned) — best effort,
// no-op until oi_config.ghl_api_key + ghl_location_id exist.
// v5: multi-pack baskets. v4: cancelled plans lose monthly allowance.
// Never trusts the payload: re-fetches the object from Stripe with our key.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const TIER_MAP: Record<string, string> = { analyst: 'academy', originator: 'accelerator', team: 'circle' };
const PACKS: Record<string, { kind: 'ai' | 'letter'; qty: number; label: string }> = {
  ai_100: { kind: 'ai', qty: 100, label: '100 AI credits' }, ai_500: { kind: 'ai', qty: 500, label: '500 AI credits' }, ai_2000: { kind: 'ai', qty: 2000, label: '2,000 AI credits' },
  letters_50: { kind: 'letter', qty: 50, label: '50 letter credits' }, letters_200: { kind: 'letter', qty: 200, label: '200 letter credits' }, letters_500: { kind: 'letter', qty: 500, label: '500 letter credits' },
};
const PLAN_COPY: Record<string, { name: string; tier: string; includes: string[]; first: string[] }> = {
  analyst: { name: 'Analyst', tier: 'Academy', includes: ['100 AI credits and 10 letter credits every month', 'Full AI analysis, committee, memos and drafts in your voice', 'Member deals open to you on day 7'], first: ['Open a deal in your pipeline and run the full AI analysis', 'Browse the member deal flow - your access tier is now Academy'] },
  originator: { name: 'Originator', tier: 'Accelerator', includes: ['300 AI credits and 100 letter credits every month', 'Automated sourcing across 1.1m UK companies plus your seller funnel', 'Member deals on day 3 with 3 NDA slots'], first: ['Start a sourcing run from Find companies - the engine works through your whole match set', 'Enrol your best-fit prospects and approve your first letters', 'Check the member deal flow - deals matching your buy box are flagged'] },
  team: { name: 'Team', tier: 'Circle', includes: ['1,000 AI credits and 400 letters included monthly', '5 users and 10+ concurrent deals', 'Member deals on day one, unlimited NDA slots, first look always'], first: ['Start sourcing runs for each mandate you hold', 'Open the member deal flow - you now see every deal on day one'] },
};

async function stripeGet(key: string, path: string) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe ${path} ${r.status}`);
  return j;
}

function money(pence: number | null | undefined, currency = 'gbp') {
  if (pence == null) return '';
  const sym = currency === 'gbp' ? '£' : currency === 'usd' ? '$' : currency === 'eur' ? '€' : '';
  return sym + (pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 });
}

async function sendBranded(sql: any, to: string, subject: string, preheader: string, inner: string) {
  try {
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('resend_api_key','email_template','from_email')`).map((r: any) => [r.key, r.value]));
    if (!cfg.resend_api_key || !to) return;
    const tpl = cfg.email_template ?? '<html><body>{{CONTENT}}</body></html>';
    const html = tpl.replaceAll('{{BRAND}}', 'Officially Invested').replaceAll('{{PREHEADER}}', preheader).replaceAll('{{CONTENT}}', inner);
    await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Officially Invested <${cfg.from_email ?? 'deals@officiallyinvested.com'}>`, to: [to], subject, html }),
    });
  } catch (_) { /* receipts must never break entitlements */ }
}

// ---- GoHighLevel: best-effort lifecycle tags (no-op until ghl keys exist) ----
async function ghlTag(sql: any, email: string, addTags: string[]) {
  try {
    if (!email) return;
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('ghl_api_key','ghl_location_id')`).map((r: any) => [r.key, r.value]));
    if (!cfg.ghl_api_key || !cfg.ghl_location_id) return;
    const H = { Authorization: `Bearer ${cfg.ghl_api_key}`, Version: '2021-07-28', 'Content-Type': 'application/json', Accept: 'application/json' };
    const fr = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${encodeURIComponent(cfg.ghl_location_id)}&query=${encodeURIComponent(email)}`, { headers: H });
    const existing = fr.ok ? ((await fr.json())?.contacts ?? []).find((c: any) => (c.email ?? '').toLowerCase() === email.toLowerCase()) : null;
    const tags = Array.from(new Set([...(existing?.tags ?? []), ...addTags]));
    await fetch('https://services.leadconnectorhq.com/contacts/upsert', { method: 'POST', headers: H, body: JSON.stringify({ locationId: cfg.ghl_location_id, email, tags }) });
  } catch (_) { /* never blocks entitlements */ }
}

async function grantAllowance(sql: any, orgId: string, plan: string) {
  const allow = (await sql`select value from public.oi_config where key='plan_allowances'`)[0]?.value;
  const table = allow ? JSON.parse(allow) : { free: { ai: 0, letter: 0 }, analyst: { ai: 100, letter: 10 }, originator: { ai: 300, letter: 100 }, team: { ai: 1000, letter: 400 } };
  const a = table[plan] ?? { ai: 0, letter: 0 };
  await sql`insert into acq.credits (org_id, ai_monthly, letter_monthly) values (${orgId}, ${a.ai}, ${a.letter})
    on conflict (org_id) do update set ai_monthly = greatest(acq.credits.ai_monthly, ${a.ai}), letter_monthly = greatest(acq.credits.letter_monthly, ${a.letter}), updated_at = now()`;
  await sql`insert into acq.credit_events (org_id, kind, delta, reason) values (${orgId}, 'ai', ${a.ai}, ${'plan ' + plan + ' allowance'})`;
}

async function applyEntitlement(sql: any, orgId: string, plan: string | null, billing: any, email: string | null) {
  const active = plan && TIER_MAP[plan];
  await sql`update acq.organizations set settings = coalesce(settings,'{}'::jsonb) || ${{ plan: active ? plan : 'free', billing }} where id=${orgId}`;
  if (active) await grantAllowance(sql, orgId, plan!);
  else {
    await sql`update acq.credits set ai_monthly=0, letter_monthly=0, updated_at=now() where org_id=${orgId}`;
    await sql`insert into acq.credit_events (org_id, kind, delta, reason) values (${orgId}, 'ai', 0, 'plan cancelled - monthly allowance removed')`;
  }
  const host = (await sql`select id from acq.organizations order by created_at limit 1`)[0];
  const owner = (await sql`select m.user_id, u.email, coalesce(o.settings->'profile'->>'founder_name','') as fname from acq.org_members m join auth.users u on u.id=m.user_id join acq.organizations o on o.id=m.org_id where m.org_id=${orgId} and m.role='owner' limit 1`)[0];
  const memberEmail = (email ?? owner?.email ?? '').toLowerCase();
  if (!memberEmail) return owner;
  if (active) {
    await sql`insert into acq.members (org_id, user_id, email, full_name, tier, status, notes)
      values (${host.id}, ${owner?.user_id ?? null}, ${memberEmail}, ${owner?.fname ?? ''}, ${TIER_MAP[plan!]}, 'active', ${'auto: plan ' + plan})
      on conflict (org_id, email) do update set tier=${TIER_MAP[plan!]}, status='active', user_id=coalesce(acq.members.user_id, excluded.user_id), updated_at=now()`;
  } else {
    await sql`update acq.members set status='suspended', updated_at=now() where org_id=${host.id} and lower(email)=${memberEmail} and notes like 'auto:%'`;
  }
  return owner;
}

Deno.serve(async (req: Request) => {
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const event = await req.json().catch(() => ({} as any));
    const key = (await sql`select value from public.oi_config where key='stripe_secret_key'`)[0]?.value;
    if (!key) { await sql.end({ timeout: 5 }); return json({ ok: true, note: 'stripe not configured' }); }
    const type = String(event?.type ?? '');
    const objId = event?.data?.object?.id;
    if (!objId) { await sql.end({ timeout: 5 }); return json({ ok: true, ignored: true }); }

    if (type === 'checkout.session.completed') {
      const s = await stripeGet(key, `checkout/sessions/${objId}`);
      const orgId = s.metadata?.org_id ?? s.client_reference_id;
      if (s.status === 'complete' && orgId) {
        const payerEmail = (s.customer_details?.email ?? '').toLowerCase();
        const payerName = (s.customer_details?.name ?? '').split(' ')[0] || 'there';
        const when = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        const topupList = String(s.metadata?.topups ?? s.metadata?.topup ?? '').split(',').map((x: string) => x.trim()).filter((k: string) => PACKS[k]);
        if (topupList.length) {
          const bought: { kind: string; label: string }[] = [];
          for (const k of topupList) {
            const pk = PACKS[k];
            if (pk.kind === 'ai') await sql`insert into acq.credits (org_id, ai_topup) values (${orgId}, ${pk.qty}) on conflict (org_id) do update set ai_topup = acq.credits.ai_topup + ${pk.qty}, updated_at=now()`;
            else await sql`insert into acq.credits (org_id, letter_topup) values (${orgId}, ${pk.qty}) on conflict (org_id) do update set letter_topup = acq.credits.letter_topup + ${pk.qty}, updated_at=now()`;
            await sql`insert into acq.credit_events (org_id, kind, delta, reason) values (${orgId}, ${pk.kind}, ${pk.qty}, ${'top-up ' + k})`;
            bought.push({ kind: pk.kind, label: pk.label });
          }
          const bal = (await sql`select * from acq.credits where org_id=${orgId}`)[0];
          const rows: [string, string][] = bought.map((b, i) => [`Pack ${i + 1}`, b.label] as [string, string]);
          rows.push(['Amount paid', money(s.amount_total, s.currency)], ['Date', when], ['Balance now', `${bal.ai_monthly + bal.ai_topup} AI credits · ${bal.letter_monthly + bal.letter_topup} letter credits`], ['Rolls over', 'Yes. Purchased credits never expire.']);
          const inner = h1('Credits added. Receipt inside.')
            + p(`Thanks ${payerName}. Your payment went through and every pack below is already live in your workspace.`)
            + receiptBox(rows)
            + btn('https://www.officiallyinvested.com/admin/origination?view=campaigns', 'Back to your campaigns')
            + p('<span style="font-size:12.5px;color:#6B7A89;">Stripe also emails a formal receipt for your records. Questions? Reply to this email.</span>');
          if (payerEmail) await sendBranded(sql, payerEmail, 'Payment confirmed. ' + bought.map((b) => b.label).join(' + ') + ' added.', 'Your credits are live in your workspace.', inner);
          if (payerEmail) await ghlTag(sql, payerEmail, ['investoros topup']);
        } else if (s.metadata?.plan) {
          const owner = await applyEntitlement(sql, orgId, s.metadata.plan, { customer_id: s.customer, subscription_id: s.subscription, since: new Date().toISOString() }, payerEmail || null);
          const pc = PLAN_COPY[s.metadata.plan];
          if (pc) {
            const inner = h1(`Welcome to ${pc.name}. Payment confirmed.`)
              + p(`Thanks ${owner?.fname || payerName}. Your workspace just changed gear: everything below is live right now.`)
              + receiptBox([['Plan', pc.name + (s.metadata?.interval === 'annual' ? ' (annual - 2 months free)' : ' (monthly)')], ['Amount paid', money(s.amount_total, s.currency)], ['Date', when], ['Deal flow tier', pc.tier], ['Manage billing', 'Usage &amp; billing in your workspace']])
              + `<p style=\"margin:0 0 8px;\"><b style=\"color:#0A2540;\">Now included:</b></p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 16px;\">${pc.includes.map(li).join('')}</table>`
              + `<p style=\"margin:0 0 8px;\"><b style=\"color:#0A2540;\">Do these first:</b></p><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 16px;\">${pc.first.map(li).join('')}</table>`
              + btn('https://www.officiallyinvested.com/admin/origination', 'Open my workspace')
              + p('<span style="font-size:12.5px;color:#6B7A89;">Stripe also emails a formal receipt. Cancel or change plan any time from Usage &amp; billing. Questions? Reply to this email. A person reads it.</span>');
            const to = payerEmail || owner?.email;
            if (to) await sendBranded(sql, to, `Welcome to ${pc.name}. Payment confirmed.`, 'Your plan is live. Here is what changed and what to do first.', inner);
          }
          await sql`update acq.organizations set settings = coalesce(settings,'{}'::jsonb) || jsonb_build_object('drip', coalesce(settings->'drip','{}'::jsonb) || jsonb_build_object('paid_started', now()::text)) where id=${orgId}`;
          const tagEmail = payerEmail || owner?.email;
          if (tagEmail) await ghlTag(sql, tagEmail, ['investoros ' + s.metadata.plan, 'investoros paying', ...(s.metadata?.interval === 'annual' ? ['investoros annual'] : [])]);
        }
      }
    } else if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const sub = await stripeGet(key, `subscriptions/${objId}`);
      const orgId = sub.metadata?.org_id;
      const plan = sub.metadata?.plan ?? null;
      if (orgId) {
        const live = ['active', 'trialing', 'past_due'].includes(sub.status);
        const owner = await applyEntitlement(sql, orgId, live ? plan : null, { customer_id: sub.customer, subscription_id: sub.id, status: sub.status }, null);
        if (!live && owner?.email) await ghlTag(sql, owner.email, ['investoros churned']);
      }
    }
    await sql.end({ timeout: 5 });
    return json({ ok: true });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});

const li = (t: string) => `<tr><td style="font-family:Georgia,serif;color:#C9A227;font-size:15px;padding:4px 10px 4px 0;vertical-align:top;">✓</td><td style="font-family:Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#26313D;padding:4px 0;">${t}</td></tr>`;
const h1 = (t: string) => `<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:25px;color:#0A2540;margin:0 0 16px;">${t}</h1>`;
const p = (t: string) => `<p style="margin:0 0 14px;">${t}</p>`;
const btn = (href: string, label: string) => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr><td bgcolor="#F5C518" style="background:#F5C518;border-radius:12px;"><a href="${href}" style="display:inline-block;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:#0A2540;text-decoration:none;padding:13px 26px;">${label}</a></td></tr></table>`;
const receiptBox = (rows: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5EE;border-radius:12px;margin:6px 0 18px;"><tr><td style="padding:16px 20px;">${rows.map(([k, v]) => `<div style=\"font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#26313D;padding:3px 0;\"><span style=\"color:#6B7A89;\">${k}</span> &nbsp; <b>${v}</b></div>`).join('')}</td></tr></table>`;
