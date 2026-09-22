import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@16?target=deno";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GHL_FUNNEL_WEBHOOK_URL = Deno.env.get("GHL_FUNNEL_WEBHOOK_URL") ?? Deno.env.get("GHL_WEBHOOK_URL") ?? "";

const stripe = new Stripe(STRIPE_SECRET, { apiVersion: "2024-06-20", httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();

  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    console.error("signature verification failed", (e as Error).message);
    return new Response("bad_signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const items: string[] = (s.metadata?.items || "").split(",").filter(Boolean);
    const email = s.customer_details?.email || s.customer_email || s.metadata?.email || null;
    const pc = items.includes("challenge");
    const pb = items.includes("bump");
    const ps = items.includes("session");
    // furthest thing they bought decides the stage
    const stage = ps ? "strategy-session" : pc ? "challenge-buyer" : "free-member";
    const tags = ["customer"];
    if (pc) tags.push("purchased-challenge");
    if (pb) tags.push("purchased-toolkit");
    if (ps) tags.push("purchased-strategy-session");

    // record the order (idempotent on stripe_session_id)
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
        method: "POST",
        headers: {
          "apikey": SERVICE_ROLE, "Authorization": `Bearer ${SERVICE_ROLE}`,
          "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify({
          stripe_session_id: s.id, email,
          amount_total: (s.amount_total || 0) / 100, currency: s.currency,
          items, purchased_challenge: pc, purchased_bump: pb, purchased_session: ps,
          ghl_stage: stage, raw: s,
        }),
      });
    } catch (e) { console.error("order insert error", e); }

    // tell GHL what they bought + which stage to move them to
    if (GHL_FUNNEL_WEBHOOK_URL && email) {
      try {
        await fetch(GHL_FUNNEL_WEBHOOK_URL, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email, type: "purchase", stage, tags, items,
            amount_total: (s.amount_total || 0) / 100, currency: s.currency,
          }),
        });
      } catch (e) { console.error("ghl forward error", e); }
    }
  }

  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
