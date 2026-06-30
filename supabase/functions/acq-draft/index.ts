// =============================================================================
// acq-draft — the agent's drafting engine (draft-only)
// Given a deal + an action_key, generates the stage-appropriate output: an email
// to the right party, a stage document, or an indicative comparables brief.
// Uses the firm's voice (oi_config.drafting_rules) + methodology brief, grounded
// in the verified facts and the deterministic engine result. Stores acq.drafts.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

type Kind = 'email' | 'doc' | 'comparables';
interface ActionDef { kind: Kind; recipient?: string; label: string; instruction: string; }

const ACTIONS: Record<string, ActionDef> = {
  request_docs:       { kind: 'email', recipient: 'vendor', label: 'Request documents', instruction: 'Request the documents needed to assess the opportunity: last 2-3 years statutory accounts, recent management accounts/P&L, and (business) VAT returns + bank statements + a customer/revenue breakdown, or (property) the rent roll + leases + a recent valuation. Warm, professional, concise; explain it helps us move quickly and stays confidential.' },
  approach_vendor:    { kind: 'email', recipient: 'vendor', label: 'Approach the owner', instruction: 'A warm initial approach expressing genuine interest and proposing a short, no-obligation introductory call. Reference what is attractive about the business. Do NOT make or imply an offer.' },
  chase_vendor:       { kind: 'email', recipient: 'vendor', label: 'Chase the vendor', instruction: 'Politely chase the outstanding documents; restate what is still needed and why it helps move the deal forward quickly.' },
  email_accountant:   { kind: 'email', recipient: 'accountant', label: 'Brief the accountant', instruction: 'Brief our accountant for financial due diligence: summarise the deal and the VERIFIED figures, set the scope (verify revenue/EBITDA via bank statements and VAT, scrutinise add-backs, debt and working capital, the bank-statement test), flag any seller contradiction, and ask them to proceed.' },
  email_solicitor:    { kind: 'email', recipient: 'solicitor', label: 'Brief the solicitor', instruction: 'Brief our solicitor to act / for legal due diligence: summarise the deal and intended structure, set the scope (title, key contracts and change-of-control clauses, employment/TUPE, litigation, licences/regulatory), and confirm next steps.' },
  email_broker:       { kind: 'email', recipient: 'lender', label: 'Approach a funder', instruction: 'Write to a finance broker/lender with a concise, lender-ready funding summary: business overview, verified adjusted EBITDA, proposed price and structure (senior/vendor/equity), DSCR and security. Request indicative terms.' },
  offer_letter:       { kind: 'email', recipient: 'vendor', label: 'Draft offer / indicative terms', instruction: 'Draft a non-binding indicative-offer email using the engine OPENING OFFER and the funding structure, framed collaboratively (a range and a structure, not a single hard number). Never exceed the engine walk-away. Reference the rationale briefly.' },
  discovery_pack:     { kind: 'doc', label: 'Discovery-call pack', instruction: 'Produce a discovery-call pack: a 60-minute agenda, the key probe questions (owner dependency, motivation, succession), the five questions to ask after reviewing accounts, and the exact documents to request next.' },
  structure_proposal: { kind: 'doc', label: 'Deal structure proposal', instruction: 'Produce a deal structure proposal: the funding stack (senior/vendor/equity with the engine numbers), the offer range (floor/ceiling/opening/walk-away), gap-bridging options (vendor loan/deferred/earnout), and the rationale.' },
  hots_draft:         { kind: 'doc', label: 'Heads of Terms', instruction: 'Draft Heads of Terms: parties, price and structure, exclusivity and any deposit, conditions precedent, indicative timeline, confidentiality. Clearly non-binding except exclusivity/confidentiality.' },
  commercial_dd_plan: { kind: 'doc', label: 'Commercial DD plan', instruction: 'Produce a commercial due-diligence plan: customer concentration, contracts, market position, key-person risk, regulatory rating (e.g. CQC/Ofsted), plus the value-creation levers (the Five Hidden Value Lenses).' },
  lender_pack:        { kind: 'doc', label: 'Lender pack', instruction: 'Produce a lender pack summary: business overview, verified financials and adjusted EBITDA, proposed structure, DSCR and serviceability, security, and buyer credibility.' },
  completion_checklist:{ kind: 'doc', label: 'Pre-completion checklist', instruction: 'Produce a pre-completion checklist: funds flow, legal items, corporate structure (HoldCo/OpCo/SPV), access and bank handover from the seller, and final verifications.' },
  takeover_plan:      { kind: 'doc', label: 'Takeover-week plan', instruction: 'Produce a takeover-week plan: people, customers, suppliers, systems and bank access, and a change-nothing-yet discipline for week one.' },
  hundred_day_plan:   { kind: 'doc', label: '100-day plan', instruction: 'Produce a 100-day value-creation plan using the Ten EBITDA Levers and quick wins, with owners and a refinance-readiness note for the 18-24 month window.' },
  comparables:        { kind: 'comparables', label: 'Find comparables', instruction: 'Produce an INDICATIVE comparables and market brief for this asset\'s sector and size: the typical multiple range (cite the sector range used by the engine), what moves the multiple up or down, and where this specific deal plausibly sits. Be explicit that it is indicative, pending a live market-data feed.' },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const def = ACTIONS[body.action_key];
    if (!body.deal_id || !def) return json({ error: 'deal_id and a valid action_key required', valid_actions: Object.keys(ACTIONS) }, 400);
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('anthropic_api_key','acq_internal_secret','acq_analyst_brief','drafting_rules','accountant_email','solicitor_email','from_email')`).map((r: any) => [r.key, r.value]));
    const ANTHROPIC = Deno.env.get('ANTHROPIC_API_KEY') || cfg.anthropic_api_key;
    if (!ANTHROPIC) { await sql.end({ timeout: 5 }); return json({ error: 'no anthropic key' }, 500); }

    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }

    const deal = (await sql`select d.*, o.name as org_name, o.settings as org_settings from acq.deals d join acq.organizations o on o.id=d.org_id where d.id=${body.deal_id}`)[0];
    if (!deal) { await sql.end({ timeout: 5 }); return json({ error: 'deal not found' }, 404); }
    if (!trusted) {
      const m = await sql`select 1 from acq.org_members where org_id=${deal.org_id} and user_id=${userId} and role in ('owner','admin','analyst')`;
      if (!m.length) { await sql.end({ timeout: 5 }); return json({ error: 'forbidden' }, 403); }
    }

    const facts = await sql`select metric, period, value, is_self_reported, contradicts_self_reported from acq.financial_facts where deal_id=${deal.id} and is_self_reported=false`;
    const val = (await sql`select result from acq.valuations where deal_id=${deal.id} order by created_at desc limit 1`)[0];
    const ana = (await sql`select summary from acq.analyses where deal_id=${deal.id} order by created_at desc limit 1`)[0];

    const recipientEmail = def.recipient === 'accountant' ? cfg.accountant_email : def.recipient === 'solicitor' ? cfg.solicitor_email : null;
    const system =
      `You are the Acquisition Manager for ${deal.org_name}, drafting on the principal's behalf in their professional voice. ` +
      (cfg.drafting_rules ? `\n\nVOICE & DRAFTING RULES:\n${cfg.drafting_rules}\n` : '') +
      (cfg.acq_analyst_brief ? `\n\nMETHODOLOGY (for grounding, not to quote verbatim):\n${cfg.acq_analyst_brief}\n` : '') +
      `\n\nRULES: Use the VERIFIED figures and engine numbers given — never invent figures. This is a DRAFT for the principal to review and send themselves; do not claim it has been sent. Be concise and specific to this deal.`;

    const tools = def.kind === 'email'
      ? [{ name: 'submit_email', description: 'Return the drafted email.', input_schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string', description: 'plain-text email body, with greeting and sign-off' } }, required: ['subject', 'body'] } }]
      : [{ name: 'submit_doc', description: 'Return the drafted document.', input_schema: { type: 'object', properties: { title: { type: 'string' }, markdown: { type: 'string', description: 'the document in clean markdown' } }, required: ['title', 'markdown'] } }];
    const toolName = def.kind === 'email' ? 'submit_email' : 'submit_doc';

    const user = JSON.stringify({
      task: def.instruction,
      recipient: def.recipient ?? null,
      recipient_email: recipientEmail,
      deal: { name: deal.name, asset_type: deal.asset_type, sector: deal.sector, asking_price: deal.asking_price },
      verified_facts: facts, engine: val?.result ?? null, analyst_summary: ana?.summary ?? null,
    }) + `\n\nDraft it now and call ${toolName}.`;

    const ar = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system, tools, tool_choice: { type: 'tool', name: toolName }, messages: [{ role: 'user', content: user }] }),
    });
    if (!ar.ok) { const t = await ar.text(); await sql.end({ timeout: 5 }); return json({ error: 'anthropic ' + ar.status, detail: t.slice(0, 300) }, 502); }
    const aj = await ar.json();
    const out: any = (aj.content ?? []).find((b: any) => b.type === 'tool_use')?.input ?? {};
    const subject = def.kind === 'email' ? (out.subject ?? null) : (out.title ?? def.label);
    const bodyText = def.kind === 'email' ? (out.body ?? '') : (out.markdown ?? '');
    if (!bodyText) { await sql.end({ timeout: 5 }); return json({ error: 'no draft produced' }, 502); }

    const row = (await sql`insert into acq.drafts (org_id, deal_id, action_key, kind, recipient_role, subject, body, model, created_by)
      values (${deal.org_id}, ${deal.id}, ${body.action_key}, ${def.kind}, ${def.recipient ?? null}, ${subject}, ${bodyText}, ${aj.model ?? 'claude-sonnet-4-6'}, ${userId})
      returning id, action_key, kind, recipient_role, subject, body, created_at`)[0];

    return json({ ok: true, draft: row, recipient_email: recipientEmail });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
