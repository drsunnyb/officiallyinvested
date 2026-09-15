// =============================================================================
// acq-credits v2 — metered usage: balances, atomic consumption, tiered top-ups.
// v2: topup_checkout accepts MULTIPLE packs in one basket (AI + letters mixed),
// one Stripe checkout, one receipt. Monthly allowances come from the plan;
// purchased top-ups roll over. consume() is atomic in SQL and returns
// needs_topup when the tank is empty so the UI can offer upgrade or packs.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Tiered top-up packs (GBP pence). Editable here; products bootstrap on first buy.
const PACKS: Record<string, { kind: 'ai' | 'letter'; qty: number; amount: number; label: string }> = {
  ai_100: { kind: 'ai', qty: 100, amount: 2500, label: '100 AI credits' },
  ai_500: { kind: 'ai', qty: 500, amount: 10000, label: '500 AI credits' },
  ai_2000: { kind: 'ai', qty: 2000, amount: 32000, label: '2,000 AI credits' },
  letters_50: { kind: 'letter', qty: 50, amount: 7000, label: '50 letter credits' },
  letters_200: { kind: 'letter', qty: 200, amount: 24000, label: '200 letter credits' },
  letters_500: { kind: 'letter', qty: 500, amount: 50000, label: '500 letter credits' },
};

async function stripe(key: string, path: string, params: Record<string, string>) {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `stripe ${path} ${r.status}`);
  return j;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  const done = async (b: unknown, s = 200) => { await sql.end({ timeout: 5 }); return json(b, s); };
  try {
    const body = await req.json().catch(() => ({} as any));
    const action = body.action ?? 'balance';
    const secret = (await sql`select value from public.oi_config where key='acq_internal_secret'`)[0]?.value;
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === secret;

    let orgId: string | null = body.org_id && trusted ? body.org_id : null;
    let email: string | null = null;
    if (!orgId) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) return done({ error: 'unauthorised' }, 401);
      email = data.user.email ?? null;
      const m = (await sql`select org_id from acq.org_members where user_id=${data.user.id} order by created_at limit 1`)[0];
      if (!m) return done({ error: 'no workspace' }, 403);
      orgId = m.org_id;
    }

    if (action === 'balance') {
      await sql`insert into acq.credits (org_id) values (${orgId}) on conflict (org_id) do nothing`;
      const c = (await sql`select * from acq.credits where org_id=${orgId}`)[0];
      const events = await sql`select kind, delta, reason, created_at from acq.credit_events where org_id=${orgId} order by created_at desc limit 20`;
      return done({ ok: true, ai: c.ai_monthly + c.ai_topup, letter: c.letter_monthly + c.letter_topup, detail: { ai_monthly: c.ai_monthly, ai_topup: c.ai_topup, letter_monthly: c.letter_monthly, letter_topup: c.letter_topup }, packs: PACKS, events });
    }

    if (action === 'consume') {
      const kind = body.kind === 'letter' ? 'letter' : 'ai';
      const n = Math.max(1, Math.min(500, Number(body.amount ?? 1)));
      try {
        const bal = (await sql`select acq.consume_credit(${orgId}, ${kind}, ${n}, ${String(body.reason ?? '').slice(0, 120) || null}) as b`)[0].b;
        return done({ ok: true, balance: bal });
      } catch (e) {
        if (String(e).includes('insufficient_credits')) {
          const c = (await sql`select * from acq.credits where org_id=${orgId}`)[0];
          return done({ ok: false, needs_topup: true, kind, ai: c ? c.ai_monthly + c.ai_topup : 0, letter: c ? c.letter_monthly + c.letter_topup : 0 });
        }
        throw e;
      }
    }

    if (action === 'topup_checkout') {
      // accepts body.packs (array, mixed kinds) or legacy body.pack (single)
      const wanted: string[] = Array.isArray(body.packs) && body.packs.length ? body.packs.map(String) : (body.pack ? [String(body.pack)] : []);
      const items = wanted.filter((k, i) => PACKS[k] && wanted.indexOf(k) === i).slice(0, 6);
      if (!items.length) return done({ error: 'unknown pack' }, 400);
      const key = (await sql`select value from public.oi_config where key='stripe_secret_key'`)[0]?.value;
      if (!key) return done({ error: 'not_configured', message: 'Payments are being switched on - email sandeep@officiallyinvested.com and we will add the credits manually today.' });
      const params: Record<string, string> = {
        mode: 'payment',
        customer_email: email ?? '',
        client_reference_id: orgId!,
        'metadata[org_id]': orgId!,
        'metadata[topups]': items.join(','),
        success_url: 'https://www.officiallyinvested.com/admin/origination?view=billing&topup=done',
        cancel_url: 'https://www.officiallyinvested.com/admin/origination?view=billing',
      };
      items.forEach((k, i) => {
        const pack = PACKS[k];
        params[`line_items[${i}][price_data][currency]`] = 'gbp';
        params[`line_items[${i}][price_data][unit_amount]`] = String(pack.amount);
        params[`line_items[${i}][price_data][product_data][name]`] = `Officially Invested AI — ${pack.label}`;
        params[`line_items[${i}][quantity]`] = '1';
      });
      const session = await stripe(key, 'checkout/sessions', params);
      return done({ ok: true, url: session.url });
    }

    if (action === 'grant' && trusted) {
      const kind = body.kind === 'letter' ? 'letter' : 'ai';
      const n = Number(body.amount ?? 0);
      await sql`insert into acq.credits (org_id) values (${orgId}) on conflict (org_id) do nothing`;
      if (kind === 'ai') await sql`update acq.credits set ai_topup = ai_topup + ${n}, updated_at=now() where org_id=${orgId}`;
      else await sql`update acq.credits set letter_topup = letter_topup + ${n}, updated_at=now() where org_id=${orgId}`;
      await sql`insert into acq.credit_events (org_id, kind, delta, reason) values (${orgId}, ${kind}, ${n}, ${body.reason ?? 'grant'})`;
      return done({ ok: true });
    }

    return done({ error: `unknown action ${action}` }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
