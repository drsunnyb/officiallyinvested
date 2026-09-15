import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const STRIPE_SECRET = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const PRICES: Record<string, string> = {
  challenge: Deno.env.get("STRIPE_PRICE_CHALLENGE") ?? "",
  bump: Deno.env.get("STRIPE_PRICE_BUMP") ?? "",
  session: Deno.env.get("STRIPE_PRICE_SESSION") ?? "",
};
const SUCCESS_URL = Deno.env.get("CHECKOUT_SUCCESS_URL") ?? "";
const CANCEL_URL = Deno.env.get("CHECKOUT_CANCEL_URL") ?? "";

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
  const items: string[] = body && Array.isArray(body.items) ? body.items : [];

  if (!STRIPE_SECRET) return json({ error: "stripe_not_configured" }, 400);
  if (!SUCCESS_URL || !CANCEL_URL) return json({ error: "urls_not_configured" }, 400);

  const valid = items.filter((k) => PRICES[k]);

  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", SUCCESS_URL + (SUCCESS_URL.includes("?") ? "&" : "?") + "status=success&session_id={CHECKOUT_SESSION_ID}");
  form.set("cancel_url", CANCEL_URL + (CANCEL_URL.includes("?") ? "&" : "?") + "status=cancel");
  if (body && body.email) form.set("customer_email", String(body.email));

  let idx = 0;
  for (const key of valid) {
    form.set(`line_items[${idx}][price]`, PRICES[key]);
    form.set(`line_items[${idx}][quantity]`, "1");
    idx++;
  }
  if (idx === 0) return json({ error: "no_valid_items" }, 400);

  // metadata so the webhook knows exactly what was bought without re-fetching line items
  form.set("metadata[source]", "ownership_quiz_funnel");
  form.set("metadata[items]", valid.join(","));
  if (body && body.email) form.set("metadata[email]", String(body.email));

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${STRIPE_SECRET}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("stripe error", data);
    return json({ error: "stripe_error", detail: data?.error?.message ?? null }, 400);
  }
  return json({ url: data.url, id: data.id });
});
