import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function db(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SRK,
      Authorization: `Bearer ${SRK}`,
      "Content-Type": "application/json",
      Prefer: init.method === "POST" ? "return=representation" : "",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`db ${path}: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// v9: negotiating posture on external documents. Terms are stated, never
// justified; no reassurance language, no capability or funding signals.
// v8: cleanDoc sanitiser (no em/en dashes, no bold markers) on every save.
function cleanDoc(s: string): string {
  return s
    .replace(/\s+—\s+/g, ", ")
    .replace(/—/g, " - ")
    .replace(/–/g, "-")
    .replace(/\*\*/g, "")
    .replace(/[ \t]+$/gm, "");
}

const ASSISTS: Record<string, { title: string; instructions: string }> = {
  "screen-brief": {
    title: "Initial screening brief",
    instructions: "Produce a one-page initial screening brief: run the RED Framework (Revenue / Exit / Dependencies) explicitly, list what must be verified before a discovery call, and give a clear pursue / park / pass recommendation with reasoning.",
  },
  "discovery-pack": {
    title: "Discovery call pack (20-30 min first call)",
    instructions: "Produce the definitive pack for the FIRST 20-30 minute discovery call on THIS deal, in three parts.\n\nPART 1, PRE-CALL INTELLIGENCE: checklist of what to look up with the specific search for THIS business: (a) data already held, each datapoint and what it implies; (b) free sources in 15 minutes: Companies House (filings, charges, directorships), Google & Maps reviews, website/social recency, LinkedIn (employee trend, leavers), job boards, sector registers (CQC etc.), CCJ search. For each: what to look for and what a red flag looks like.\n\nPART 2, THE CALL (timed Seller Conversation Compass agenda): exact questions in priority order, split VERIFY (data held, confirm gently) vs DISCOVER (data missing), phrased conversationally as Sandeep would say them. Star the 5 must-asks.\n\nPART 3, CLOSE & NEXT STEP: close script (to a next step, never a deal), documents to request, and the follow-up email drafted.",
  },
  "structure-proposal": {
    title: "Deal structure options",
    instructions: "Produce DEAL STRUCTURE OPTIONS for Sandeep to choose between. Format strictly as:\n\n1. An executive comparison table first: rows = Option A / B / C; columns = Headline price, Day-one cash, Vendor finance (amount/term/rate), Earn-out, Bank debt, DSCR (calculated), Cash-on-cash, Seller appeal (1-5), Buyer protection (1-5).\n\n2. Then '## Option A: [name]', '## Option B: [name]', '## Option C: [name]' sections. Each: the structure in full with REAL numbers from this deal, the funding stack, the 7-Number Test results, why the seller says yes, where it protects the buyer, risks, and the negotiation line to deliver it (Boring Negotiation System).\n\n3. End with '## Recommendation': which option and why, plus what would make you switch.\n\nUse the Deal Architecture Method levers throughout. Sandeep will SELECT one option (or ask for adjustments) and the chosen structure becomes the basis of the Heads of Terms, so each option must be complete enough to paste into HoTs. This is an INTERNAL document: frameworks and funding analysis belong here, never in the HoTs.",
  },
  "hots-draft": {
    title: "Heads of Terms - detailed draft",
    instructions: "Draft COMPREHENSIVE Heads of Terms for THIS deal, a clean, formal document a solicitor could pick up. If a SELECTED deal structure exists in the provided outputs, take ONLY its commercial terms (price, payment amounts, instruments, timings), never its analysis. Mark the head clearly 'SUBJECT TO CONTRACT, NOT LEGALLY BINDING (save for Confidentiality, Exclusivity and Costs)'.\n\nAUDIENCE, CRITICAL: This document is ISSUED TO THE VENDOR AND THEIR ADVISERS. It must read as the work of a seasoned acquirer's solicitor: formal, confident, terse where possible. ABSOLUTELY PROHIBITED anywhere in the document: framework names of any kind; affordability checks; debt-service tables; DSCR or any ratios; interest-cover analysis; 'assumed funding' tables; leverage multiples; lender names; 'no equity contribution' statements; equity or deposit references of any kind; valuation rationale; sensitivity analysis; negotiation reasoning. The HoTs records WHAT the parties agree, amounts, instruments, dates, obligations, protections, never WHY the Buyer is comfortable or HOW the Buyer funds it. Funding appears exactly once: as a condition precedent ('completion is conditional upon the Buyer's funding arrangements being unconditionally committed').\n\nNEGOTIATING POSTURE, NON-NEGOTIABLE: this document must show zero weakness and invite minimum push-back. Terms are STATED, never justified: no sentences explaining that a structure 'is standard', 'is customary' or 'does not affect' anything; if a term needs defending it is drafted more plainly instead. No reassurance language about the Buyer's commitment, seriousness, experience or ability to complete; the document's competence IS the reassurance. Never volunteer information the vendor has not asked for. Every clause uses calm, standard-market wording a vendor's solicitor would recognise and accept without comment. Where detail is unresolved, a neutral [TO CONFIRM] beats a hedge.\n\nROBUST means full protections: exclusivity with break conditions, binding confidentiality, conduct-of-business undertakings, comprehensive conditions precedent, warranty/indemnity heads, restrictive covenants. FLEXIBLE means non-binding status preserved and wording like 'or such other structure as the parties may agree in the SPA'.\n\nSections required, numbered:\n1. Parties & advisers ([TO CONFIRM] where unknown)\n2. The Target (legal name, Companies House number, share capital, what is being acquired)\n3. Transaction structure (share purchase; acquiring entity stated plainly, one sentence, no commentary)\n4. Consideration, total and breakdown table: completion payment, deferred/vendor loan note (amount, term, interest rate, repayment profile, security/subordination ranking), earn-out (metric, period, cap, worked example), basis (locked box vs completion accounts [TO CONFIRM])\n5. Conditions precedent (satisfactory DD, Buyer's committed funding in place, regulatory/CQC change-of-control consents where relevant, key contract consents, no material adverse change)\n6. Due diligence (scope, access, window)\n7. Exclusivity (8-12 weeks, what breaks it)\n8. Confidentiality (binding)\n9. Warranties & indemnities, heads of cover expected in the SPA\n10. Restrictive covenants (non-compete [TO CONFIRM: years/radius], non-solicit)\n11. Seller transition & handover (period, hours/week, remuneration)\n12. Key staff (retention intentions)\n13. Property/leases ([TO CONFIRM details])\n14. Conduct of business pre-completion\n15. Timeline table (HoTs, DD, SPA exchange, completion)\n16. Costs (each side bears own)\n17. Governing law (England & Wales)\n18. Signature blocks for both parties ([TO CONFIRM: signatory names], dated)\n\nUse [TO CONFIRM: ...] placeholders for missing specifics. After the document add a short warm vendor cover email in Sandeep's voice, equally free of justification or reassurance language. Any internal commentary goes ONLY at the very end after the exact line '--- INTERNAL NOTES, DO NOT ISSUE ---'.",
  },
  "accountant-pack": {
    title: "Financial DD pack - email to accountant",
    instructions: "Produce: (1) a professional email to Sandeep's accountant instructing financial due diligence on THIS deal, deal summary table (price, structure, headline numbers), scope of work (verify revenue & EBITDA via bank statement test and VAT returns, add-back analysis, working capital & debt review, cash conversion, payroll liabilities), the documents already received vs still outstanding, and the deadline ask; (2) the tailored financial DD checklist from the Due Diligence Blueprint. Ready to paste and send.",
  },
  "commercial-dd-plan": {
    title: "Commercial DD plan",
    instructions: "Produce a commercial due diligence plan for THIS deal: customer concentration analysis, contract/commissioner review, market position checks, competitor snapshot, people & key-person risk (Step 17), property/lease review, and a scored go/no-go checklist. Assign each item [B]uyer / [A]ccountant / [S]olicitor. Write every checklist line as a single actionable bullet so it can be tracked and ticked.",
  },
  "solicitor-pack": {
    title: "Legal DD pack - email to solicitor",
    instructions: "Produce: (1) a professional instruction email to Sandeep's solicitor for THIS deal, deal summary (parties, target + Companies House number, agreed structure & price, using the SELECTED structure and HoTs where present in outputs), scope (SPA, legal DD: title, litigation, employment/TUPE, key contracts & change-of-control, property/leases, regulatory), HoTs status, exclusivity, timeline; (2) the legal DD checklist. Ready to paste and send. Do not include the Buyer's funding analysis.",
  },
  "lender-pack": {
    title: "Funding pack - lender summary",
    instructions: "Produce a one-page lender/funder summary for THIS deal using the SELECTED structure where present: business overview, normalised EBITDA notes, funding stack with amounts, DSCR and cash-on-cash calculations, security, repayment profile, the ask. Written as a commercial finance broker would want it. (This audience DOES see the funding analysis, that is its purpose, but never offer a personal guarantee; if security beyond the target's assets is raised, note it as 'to be discussed'.)",
  },
  "completion-checklist": {
    title: "Pre-completion checklist",
    instructions: "Produce the pre-completion checklist for THIS deal (Step 15-16): finance/legal/structure convergence, completion-day mechanics, funds flow, bank mandates & access handover, documents to exchange, day-one comms plan, final 48-hour verifications. Single actionable bullets so items can be tracked and ticked.",
  },
  "takeover-plan": {
    title: "Takeover week plan",
    instructions: "Produce the takeover week plan (Step 17-18): day-by-day week one, 'change nothing for 30 days', day-one staff meeting script, customer/supplier introductions, systems & banking checklist, listening tour questions, early red-flag watch-list. Single actionable bullets where possible.",
  },
  "hundred-day-plan": {
    title: "100-day plan",
    instructions: "Produce a 100-day plan using the Ten EBITDA Levers and Five Hidden Value Lenses: 30/60/100-day milestones, quick wins, owner-dependency removal, reporting rhythm, refinance/exit-readiness checkpoint (Steps 19 & 21). Single actionable bullets where possible.",
  },
};

const EXTERNAL_DOCS = new Set(["hots-draft", "accountant-pack", "solicitor-pack", "lender-pack"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: SRK },
    });
    if (!userRes.ok) return new Response(JSON.stringify({ error: "unauthorised" }), { status: 401, headers: CORS });
    const user = await userRes.json();
    if (!String(user.email ?? "").toLowerCase().endsWith("@officiallyinvested.com")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
    }

    const { submission_id, assist_key, instructions, refine_of } = await req.json();
    const assist = ASSISTS[assist_key];
    if (!submission_id || !assist) return new Response(JSON.stringify({ error: "submission_id and valid assist_key required" }), { status: 400, headers: CORS });

    const cfgRows = await db("oi_config?select=key,value");
    const cfg: Record<string, string> = {};
    for (const r of cfgRows) cfg[r.key] = r.value;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || cfg.anthropic_api_key || "";
    if (!ANTHROPIC_KEY) return new Response(JSON.stringify({ error: "no anthropic key configured" }), { status: 500, headers: CORS });

    const subs = await db(`submissions?id=eq.${submission_id}&select=*`);
    if (!subs?.length) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: CORS });
    const sub = subs[0];
    const documents = await db(`documents?submission_id=eq.${submission_id}&select=file_name,source,uploaded_at`);
    const itemsRows = await db(`deal_items?submission_id=eq.${submission_id}&select=kind,content,is_done,stage,note&order=created_at.desc&limit=60`);
    const comms = await db(`communications?submission_id=eq.${submission_id}&select=kind,subject,content,happened_at&order=happened_at.desc&limit=8`);
    const scores = await db(`scores?submission_id=eq.${submission_id}&select=tier,fit_score,summary,rationale,red_flags,missing_documents,companies_house&order=scored_at.desc&limit=1`);
    const selectedOutputs = await db(`deal_outputs?submission_id=eq.${submission_id}&selected=eq.true&select=id,assist_key,title,content&order=created_at.desc&limit=3`);

    let prevOutput: any = null;
    if (refine_of) {
      const prev = await db(`deal_outputs?id=eq.${refine_of}&select=id,title,content,selected,assist_key`);
      if (prev?.length) prevOutput = prev[0];
    }

    let task: string;
    if (prevOutput && instructions) {
      task = "REVISION TASK, HIGHEST PRIORITY. Sandeep has reviewed the previous version (below) and requires these changes. His instructions are BINDING:\n\n>>> SANDEEP'S CHANGES: " + instructions + " <<<\n\nApply them to the previous version: keep unaffected sections (including any [TO CONFIRM] values already filled in), change everything his instructions touch, RECALCULATE every dependent number. Also re-apply the STANDING DRAFTING RULES, strip any content the rules prohibit even if it was in the previous version. Output the COMPLETE revised document.\n\nPREVIOUS VERSION:\n" + prevOutput.content
        + "\n\n(Original deliverable spec, for reference: " + assist.instructions.slice(0, 900) + "...)";
    } else if (instructions) {
      task = "TASK: " + assist.instructions + "\n\nSANDEEP'S BINDING INSTRUCTIONS, these override template defaults and any selected outputs; recalculate all dependent numbers:\n>>> " + instructions + " <<<";
    } else {
      task = "TASK: " + assist.instructions;
    }

    const externalNote = EXTERNAL_DOCS.has(assist_key)
      ? "\n\nDOCUMENT FORMALITY: This output is issued externally on Officially Invested letterhead. Start with a document header block: H1 title, 'Re: [asset] - [deal reference]', the date, 'Prepared by: Officially Invested'. End with 'PRIVATE & CONFIDENTIAL, prepared by Officially Invested. Not for distribution beyond the named recipients.' Formal numbers (£950,000). No emojis.\n\nEXTERNAL POSTURE: counterparties and their advisers read this. Project quiet strength: state, never justify; never reassure; never reveal or imply anything about the Buyer's funding sources, equity, capability or process beyond what the document type strictly requires."
      : "\n\nFORMATTING: Internal working document, clean markdown, scannable. No emojis.";

    const cleanNote = "\n\nCLEAN DOCUMENT RULE, ABSOLUTE: never use em dashes or en dashes anywhere (use commas, colons, full stops or the word to); never use double-asterisk bold markers in body text; headings are plain markdown headings only. The finished document must read as if typed by a careful human adviser.";

    const payload = {
      model: "claude-sonnet-4-6",
      max_tokens: 6000,
      system:
        "You are Dr Sandeep Bansal's acquisitions chief-of-staff at Officially Invested. You produce stage deliverables for live UK SME acquisition deals using Sandeep's own methodology (below). Know your audience: INTERNAL documents (briefs, plans, structure options) use his frameworks openly; EXTERNAL documents (HoTs, adviser instructions, lender packs) read as the work of a seasoned dealmaker's professional advisers. UK conventions (GBP, SDLT, TUPE, CQC). Use the FULL living deal record and weigh newer information over the original submission. ABSOLUTE RULE: Sandeep's explicit instructions outrank everything; propagate them through every dependent calculation. Where data is missing, use [TO CONFIRM: ...] placeholders." + externalNote + cleanNote
        + "\n\n=== STANDING DRAFTING RULES (always apply, second only to Sandeep's explicit instructions) ===\n" + (cfg.drafting_rules ?? "")
        + "\n\n=== SANDEEP'S METHODOLOGY ===\n" + (cfg.assessment_framework ?? ""),
      messages: [
        {
          role: "user",
          content: "TODAY: " + new Date().toISOString().slice(0, 10)
            + "\nDEAL DATA:\n" + JSON.stringify({ submission: sub, documents, working_items: itemsRows, recent_communications: (comms ?? []).map((c: any) => ({ ...c, content: String(c.content ?? "").slice(0, 2500) })), latest_assessment: scores?.[0] ?? null, selected_outputs: (selectedOutputs ?? []).filter((o: any) => o.id !== refine_of) })
            + "\n\n" + task,
        },
      ],
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const j = await res.json();
    const raw = (j.content ?? []).map((b: any) => b.text ?? "").join("").trim();
    if (!raw) throw new Error("empty model output");
    const content = cleanDoc(raw);

    const saved = await db("deal_outputs", {
      method: "POST",
      body: JSON.stringify({
        submission_id,
        stage: sub.status,
        assist_key,
        title: assist.title + (instructions ? " (revised)" : ""),
        content,
        model: j.model ?? "claude-sonnet-4-6",
      }),
    });

    if (prevOutput?.selected && saved?.[0]?.id) {
      await db(`deal_outputs?id=eq.${prevOutput.id}`, { method: "PATCH", body: JSON.stringify({ selected: false }) });
      await db(`deal_outputs?id=eq.${saved[0].id}`, { method: "PATCH", body: JSON.stringify({ selected: true }) });
    }

    return new Response(JSON.stringify({ ok: true, id: saved?.[0]?.id, title: assist.title, content }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
