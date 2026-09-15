import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Called by a GoHighLevel outbound webhook AFTER a successful payment, to mirror the
// order into the Investment OS warehouse. GHL/Stripe handle the actual payment; this is
// just a read-only-of-money record so your data layer stays complete.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_TOKEN = Deno.env.get("ORDER_INGEST_TOKEN") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: any = null;
  try { body = await req.json(); } catch (_) { try { body = JSON.parse(await req.text()); } catch (_) { body = null; } }
  if (!body) return json({ error: "bad_request" }, 400);

  // simple shared-secret so only your GHL workflow can write orders
  if (INGEST_TOKEN && body.token !== INGEST_TOKEN) return json({ error: "unauthorized" }, 401);

  let items: string[] = [];
  if (Array.isArray(body.items)) items = body.items;
  else if (typeof body.items === "string") items = body.items.split(",").map((s: string) => s.trim()).filter(Boolean);

  const pc = items.includes("challenge") || body.purchased_challenge === true;
  const pb = items.includes("bump") || body.purchased_bump === true;
  const ps = items.includes("session") || body.purchased_session === true;
  const stage = body.stage || (ps ? "strategy-session" : pc ? "challenge-buyer" : "free-member");

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        "apikey": SERVICE_ROLE, "Authorization": `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        stripe_session_id: body.order_id || body.transaction_id || null, // any unique external order id
        email: body.email || null,
        amount_total: typeof body.amount_total === "number" ? body.amount_total : (body.amount ? Number(body.amount) : null),
        currency: body.currency || null,
        items, purchased_challenge: pc, purchased_bump: pb, purchased_session: ps,
        ghl_stage: stage, raw: body,
      }),
    });
    if (!res.ok) { console.error("order mirror failed", res.status, await res.text()); return json({ ok: false }, 200); }
  } catch (e) { console.error("order mirror error", e); }

  return json({ ok: true });
});
