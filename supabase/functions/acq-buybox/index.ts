// =============================================================================
// acq-buybox — multiple named buy boxes per org, created through a guided
// CHAT grounded in the Officially Invested frameworks (screening gates,
// RED Framework, 7-Number Test, funding stack, Deal Finder method).
// The ACTIVE box is mirrored into organizations.settings->buy_box so all
// existing sourcing/campaign/funnel code keeps working unchanged.
// Actions: list | chat | create | activate | delete | rename
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function syncActive(sql: any, orgId: string) {
  const active = (await sql`select criteria from acq.buy_boxes where org_id=${orgId} and is_active order by updated_at desc limit 1`)[0];
  const org = (await sql`select settings from acq.organizations where id=${orgId}`)[0];
  const settings = { ...(org?.settings ?? {}), buy_box: active ? active.criteria : undefined };
  if (!active) delete settings.buy_box;
  await sql`update acq.organizations set settings=${settings} where id=${orgId}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','anthropic_api_key','acq_analyst_brief')`).map((r: any) => [r.key, r.value]));
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = body.org_id ?? null;
    if (userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} and role in ('owner','admin','analyst') order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    else if (!orgId) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'list';

    if (action === 'list') {
      const boxes = await sql`select id, name, criteria, is_active, created_from, created_at from acq.buy_boxes where org_id=${orgId} order by is_active desc, updated_at desc`;
      await sql.end({ timeout: 5 });
      return json({ ok: true, boxes });
    }

    if (action === 'create') {
      const criteria = body.criteria ?? {};
      const makeActive = body.activate !== false; // default: new box becomes active
      if (makeActive) await sql`update acq.buy_boxes set is_active=false where org_id=${orgId}`;
      const b = (await sql`insert into acq.buy_boxes (org_id, name, criteria, is_active, created_from, transcript)
        values (${orgId}, ${body.name ?? criteria.name ?? 'My buy box'}, ${criteria}, ${makeActive}, ${body.created_from ?? 'chat'}, ${body.transcript ?? []}) returning id, name, criteria, is_active`)[0];
      await syncActive(sql, orgId);
      await sql.end({ timeout: 5 });
      return json({ ok: true, box: b });
    }

    if (action === 'activate') {
      await sql`update acq.buy_boxes set is_active=false where org_id=${orgId}`;
      await sql`update acq.buy_boxes set is_active=true, updated_at=now() where id=${body.box_id} and org_id=${orgId}`;
      await syncActive(sql, orgId);
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    if (action === 'delete') {
      await sql`delete from acq.buy_boxes where id=${body.box_id} and org_id=${orgId}`;
      await syncActive(sql, orgId);
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    if (action === 'rename') {
      await sql`update acq.buy_boxes set name=${body.name}, updated_at=now() where id=${body.box_id} and org_id=${orgId}`;
      await sql.end({ timeout: 5 });
      return json({ ok: true });
    }

    if (action === 'chat') {
      const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
      if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }); }
      // taxonomy keys for grounding (public action on acq-source)
      let taxLine = '';
      try {
        const tr = await fetch(`${SUPABASE_URL}/functions/v1/acq-source`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'taxonomy' }) });
        if (tr.ok) { const tj = await tr.json(); taxLine = (tj.taxonomy ?? []).map((t: any) => `${t.key}=${t.label}`).join(', '); }
      } catch (_) { /* optional */ }

      const system = `You are the Officially Invested Buy Box coach. You help acquisition entrepreneurs define a precise, disciplined buy box using the Officially Invested methodology — the frameworks behind £5bn+ of deal analysis. Voice: warm, plain, expert; one question at a time; short messages (2-4 sentences max before your question); no markdown, no bullet lists, no em-dashes, no AI tells. If the user attaches a CV, LinkedIn profile or similar, read it closely, reflect back the 3-4 most acquisition-relevant facts (sectors, seniority, operational experience, geography) and skip questions it already answers. If they attach or paste an existing INVESTMENT THESIS, mandate or acquisition criteria document, treat it as the foundation: map it straight into the buy box fields, reflect it back in one concise message for confirmation, and ask only about genuine gaps - never make a seasoned investor start from zero. Calibrate to experience: someone with prior acquisitions, PE, search fund or portfolio experience gets a faster, peer-level conversation with no basics explained.\n\nFINANCING DOCTRINE - never treat personal capital as a hard cap on deal size. Deployable capital is the deposit, not the ceiling. UK acquisition entrepreneurs routinely fund the balance by leveraging the target business itself: Growth Guarantee Scheme backed lending, cashflow term loans against the target EBITDA, asset finance secured on the target plant, vehicles, property or debtor book, invoice finance, plus vendor finance and deferred consideration which commonly cover 30-50 percent of price in succession deals. A buyer with 100k deployable can credibly pursue deals of 500k-1m plus where the target cashflows support the debt. Frame deal size on serviceability: post-debt cashflow should cover repayments with sensible headroom, roughly 1.25x or better. Mention leverage naturally when capital comes up, set max_price from what the capital plus sensible structure supports, and note the assumed structure in the rationale.

THE METHOD (ground every recommendation in this):
- Screening gates: a trading business should normally show at least £750k revenue AND £180k adjusted EBITDA; property portfolios at least £1m, ideally bought as an SPV/share purchase. Smaller is usually not worth the same effort.
- Circle of competence first: what does the buyer know, what have they run, what unfair advantages (trade skills, sector contacts, geography) do they have?
- RED Framework risk filters: Recurring revenue (contracted/repeat beats one-off), Earnings quality (clean, provable, not owner-inflated), Diversification (no customer over ~20-25% of revenue).
- The 7-Number Test and funding stack: deals are structured roughly 60% senior debt / 25% vendor finance / 15% equity, and the business must service debt comfortably (target DSCR around 2x or better). So the buyer's available deposit/equity caps the sensible deal size: max price is roughly 6-7x their deployable cash.
- Succession is the strongest "will sell" signal: owners 55+ without an obvious successor.
- Boring is beautiful: essential, unglamorous, cash-generative businesses beat trendy ones. Property, land and select tech are valid but the core focus is boring cash flow.
${cfg.acq_analyst_brief ? '\nHOUSE METHODOLOGY (authoritative):\n' + String(cfg.acq_analyst_brief).slice(0, 2500) : ''}

CONVERSATION PLAN — one area at a time, adapting to what they already told you (never re-ask). START WITH THE PERSON, NOT THE INDUSTRY:
1) Expertise first: their career, industries worked in, what they've run or managed, trade skills, sector contacts, unfair advantages. Invite them to paste their CV or LinkedIn experience text, or attach it with the paperclip - and if they already run a thesis or acquisition mandate, to attach that instead and skip ahead — read it carefully and reflect back what you see.
2) Financial foundations (explain WHY you ask: the funding stack starts from deployable capital, and there are often untapped sources): cash available; pension — a SSAS can lend to or invest in their own trading company and SIPPs/SSAS can hold commercial property; stocks/ISAs; equity in property that could be released; rough net-worth band (bands are fine, be tactful); and their investment or deal experience to date. Capture all of it in the buy box fields. Always pair the capital number with what it supports once leverage is applied - never present it as a ceiling.
3) Involvement: full-time owner-operator vs part-time chairman with a strong GM vs hands-off investor — explain how each changes the multiple they'll pay, the risk, and which businesses suit.
4) Regulated or not: care (CQC), childcare (Ofsted), financial services (FCA), pharmacy (GPhC) — regulation is a moat and often means motivated sellers, but brings scrutiny, slower deals and fit-and-proper checks. Gauge their appetite honestly.
5) Geography and how far they'll travel or relocate.
6) ONLY NOW suggest 4-6 specific industries from the taxonomy, each with a one-line WHY tied to their expertise, capital, involvement and regulation appetite (e.g. an ex-facilities manager with £300k and SSAS → commercial cleaning, water hygiene, fire protection, washroom services). Let them react and refine.
7) Risk filters (recurring revenue, customer concentration), succession preference, exclusions.
8) When you have enough, set complete=true, give the box a short memorable name, and summarise WHY it fits them — referencing their expertise and capital plan, not just the filters. Usually 7-10 questions total, one per message.

INDUSTRY TAXONOMY KEYS (use ONLY these keys in industries[]): ${taxLine || 'use generic labels in custom_industries instead'}`;

      const orgRow = (await sql`select name, settings from acq.organizations where id=${orgId}`)[0];
      const profile = orgRow?.settings?.profile ?? null;
      const systemFull = system + (profile ? '\n\nBUYER PROFILE (already known, do not re-ask; use it to personalise your coaching): ' + JSON.stringify(profile).slice(0, 900) : '');
      // Messages may carry attachments (CV PDFs, LinkedIn screenshots) passed to Claude natively.
      const IMG_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
      const rawMessages = Array.isArray(body.messages) && body.messages.length ? body.messages.slice(-30) : [{ role: 'user', content: 'Hi, help me define my buy box.' }];
      const messages = rawMessages.map((m: any) => {
        const atts = Array.isArray(m.attachments) ? m.attachments.slice(0, 3) : [];
        if (!atts.length) return { role: m.role, content: m.content };
        const blocks: any[] = [];
        for (const a of atts) {
          if (a?.media_type === 'application/pdf' && a.data) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
          else if (IMG_TYPES.includes(a?.media_type) && a.data) blocks.push({ type: 'image', source: { type: 'base64', media_type: a.media_type, data: a.data } });
          else if (a?.text) blocks.push({ type: 'text', text: 'Attached file ' + (a.name ?? 'document') + ':\n' + String(a.text).slice(0, 24000) });
        }
        blocks.push({ type: 'text', text: (typeof m.content === 'string' && m.content.trim()) || 'I have attached my background - please read it and use it.' });
        return { role: m.role, content: blocks };
      });
      const ar = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1600, system: systemFull,
          tools: [{ name: 'respond', description: 'Reply to the user; include the buy box when complete', input_schema: { type: 'object', properties: {
            message: { type: 'string', description: 'Your conversational reply (question or final summary). Plain text.' },
            complete: { type: 'boolean' },
            buy_box: { type: 'object', properties: {
              name: { type: 'string' },
              expertise_summary: { type: 'string', description: '2-3 sentences on their background and unfair advantages' },
              capital_sources: { type: 'array', items: { type: 'string' }, description: 'cash|ssas_sipp|stocks_isas|property_equity|investors' },
              net_worth_band: { type: 'string' }, investment_experience: { type: 'string' },
              hands_on_level: { type: 'string', description: 'owner_operator|part_time|hands_off' },
              regulated_ok: { type: 'boolean' },
              industries: { type: 'array', items: { type: 'string' }, description: 'taxonomy keys only' },
              custom_industries: { type: 'array', items: { type: 'string' } },
              location: { type: 'string' }, radius_miles: { type: 'number' }, regions: { type: 'array', items: { type: 'string' } },
              deal_types: { type: 'array', items: { type: 'string' }, description: 'business|property|land' },
              revenue_min: { type: 'number' }, revenue_max: { type: 'number' }, profit_min: { type: 'number' }, profit_max: { type: 'number' },
              size_band: { type: 'string', description: 'any|small_plus|medium_plus' }, years_trading_min: { type: 'number' },
              succession_pref: { type: 'boolean' }, min_director_age: { type: 'number' },
              max_price: { type: 'number' }, deposit_available: { type: 'number' }, vendor_finance_openness: { type: 'boolean' },
              recurring_revenue_pref: { type: 'boolean' }, max_customer_concentration_pct: { type: 'number' },
              owner_managed_pref: { type: 'boolean' }, exclusions: { type: 'array', items: { type: 'string' } },
              rationale: { type: 'string', description: 'Why this box fits them, referencing the frameworks' },
            } },
          }, required: ['message', 'complete'] } }],
          tool_choice: { type: 'tool', name: 'respond' },
          messages,
        }),
      });
      if (!ar.ok) { const t = await ar.text(); await sql.end({ timeout: 5 }); return json({ error: 'The coach is briefly unavailable, try again. (' + ar.status + ')', detail: t.slice(0, 150) }); }
      const out: any = ((await ar.json()).content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? { message: 'Sorry, say that again?', complete: false };
      await sql.end({ timeout: 5 });
      return json({ ok: true, message: out.message, complete: !!out.complete, buy_box: out.buy_box ?? null });
    }

    await sql.end({ timeout: 5 });
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
