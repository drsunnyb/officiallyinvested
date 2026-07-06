// =============================================================================
// acq-funnel — per-tenant public seller-intake funnel + Meta Lead Ads webhook.
// GET  ?org=<slug>                      -> branded "Thinking of selling?" page
// GET  ?hub.mode=subscribe&hub....      -> Meta webhook verification
// POST { form submission }              -> prospect (provenance='funnel') + auto-reply
// POST Meta leadgen payload             -> prospect (provenance='meta_ads')
// Public by design (it IS the tenant's lead form); honeypot + size caps.
// =============================================================================
import postgres from 'npm:postgres@3.4.5';

const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

async function resolveOrg(sql: any, slug: string | null) {
  if (slug) {
    const o = (await sql`select id, name, settings from acq.organizations where settings->'funnel'->>'slug' = ${slug} or id::text = ${slug} limit 1`)[0];
    if (o) return o;
  }
  return (await sql`select id, name, settings from acq.organizations order by created_at limit 1`)[0];
}

function page(org: any) {
  const brand = org?.settings?.brand ?? {};
  const f = org?.settings?.funnel ?? {};
  const color = brand.color || '#0A2540'; const accent = brand.accent || '#FFD700';
  const name = brand.name || org.name || 'Us';
  const headline = f.headline || 'Thinking of selling your business?';
  const sub = f.subheadline || `${name} buys established businesses directly from their owners. Confidential, fair, and on your timetable. Tell us a little about your business and we will come back to you personally within two working days.`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(headline)} — ${esc(name)}</title>
<style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f6f7f9;color:#16232f}
.hero{background:${color};color:#fff;padding:48px 20px;text-align:center}
.hero img{max-height:52px;margin-bottom:14px}.hero h1{font-size:clamp(26px,4vw,40px);margin:0 0 10px}
.hero p{max-width:640px;margin:0 auto;opacity:.85;line-height:1.6}
form{max-width:640px;margin:-24px auto 60px;background:#fff;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.08);padding:28px}
label{display:block;font-size:13px;font-weight:600;margin:14px 0 5px}
input,select,textarea{width:100%;box-sizing:border-box;padding:11px;border:1px solid #d6dce3;border-radius:8px;font-size:15px;font-family:inherit}
textarea{min-height:90px}.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
button{margin-top:20px;width:100%;padding:14px;background:${accent};color:${color};font-weight:700;font-size:16px;border:0;border-radius:9px;cursor:pointer}
.small{font-size:12px;color:#68727d;margin-top:12px;line-height:1.5}.ok{max-width:640px;margin:40px auto;background:#fff;border-radius:14px;padding:36px;text-align:center;display:none}
.hp{position:absolute;left:-9999px}</style></head><body>
<div class="hero">${brand.logo ? `<img src="${brand.logo}" alt="">` : ''}<h1>${esc(headline)}</h1><p>${esc(sub)}</p></div>
<form id="f"><input class="hp" name="website_url" tabindex="-1" autocomplete="off">
<div class="row"><div><label>Your name</label><input name="name" required></div><div><label>Business name</label><input name="company" required></div></div>
<div class="row"><div><label>Email</label><input name="email" type="email" required></div><div><label>Phone (optional)</label><input name="phone"></div></div>
<div class="row"><div><label>What does the business do?</label><input name="sector"></div><div><label>Where is it based?</label><input name="region"></div></div>
<div class="row"><div><label>Approx. annual revenue</label><input name="revenue" placeholder="e.g. £1.5m"></div><div><label>Approx. annual profit</label><input name="profit" placeholder="e.g. £300k"></div></div>
<label>Anything you'd like us to know?</label><textarea name="message"></textarea>
<button type="submit">Start a confidential conversation</button>
<p class="small">Everything you share is treated in strict confidence and used only to assess your enquiry. We never share your details. Submitting this form does not commit you to anything.</p></form>
<div class="ok" id="ok"><h2>Thank you</h2><p>Your details are with us. A real person will come back to you within two working days.</p></div>
<script>document.getElementById('f').addEventListener('submit',async function(e){e.preventDefault();var d=Object.fromEntries(new FormData(this).entries());d.org=${JSON.stringify(f.slug ?? org.id)};var r=await fetch(location.pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});if(r.ok){this.style.display='none';document.getElementById('ok').style.display='block'}else{alert('Sorry, something went wrong. Please try again.')}});</script>
</body></html>`;
}

const num = (v: unknown) => { if (v == null) return null; const s = String(v).toLowerCase().replace(/[£$,\s]/g, ''); const m = s.match(/^([0-9]*\.?[0-9]+)(k|m)?$/); if (!m) return null; const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1); return isFinite(n) && n > 0 ? n : null; };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const url = new URL(req.url);

    if (req.method === 'GET') {
      // Meta webhook verification
      if (url.searchParams.get('hub.mode') === 'subscribe') {
        const token = url.searchParams.get('hub.verify_token') ?? '';
        const cfgTok = (await sql`select value from public.oi_config where key='meta_verify_token'`)[0]?.value;
        const orgTok = (await sql`select 1 from acq.organizations where settings->'funnel'->>'meta_verify_token' = ${token} limit 1`)[0];
        await sql.end({ timeout: 5 });
        if (token && (token === cfgTok || orgTok)) return new Response(url.searchParams.get('hub.challenge') ?? '', { headers: { ...cors, 'Content-Type': 'text/plain' } });
        return new Response('forbidden', { status: 403, headers: cors });
      }
      const org = await resolveOrg(sql, url.searchParams.get('org'));
      await sql.end({ timeout: 5 });
      if (!org) return json({ error: 'no org' }, 404);
      return new Response(page(org), { headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8' } });
    }

    const body = await req.json().catch(() => ({} as any));

    // ---- Meta Lead Ads webhook ----
    if (body.object === 'page' && Array.isArray(body.entry)) {
      let createdCount = 0;
      for (const entry of body.entry) {
        for (const ch of entry.changes ?? []) {
          if (ch.field !== 'leadgen') continue;
          const v = ch.value ?? {};
          const pageId = String(v.page_id ?? '');
          const org = (await sql`select id, name, settings from acq.organizations where settings->'funnel'->>'meta_page_id' = ${pageId} limit 1`)[0] ?? (await resolveOrg(sql, null));
          if (!org) continue;
          let fields: Record<string, string> = {};
          if (Array.isArray(v.field_data)) for (const fd of v.field_data) fields[fd.name] = (fd.values ?? [])[0] ?? '';
          const token = org?.settings?.funnel?.meta_page_token;
          if (!Object.keys(fields).length && token && v.leadgen_id) {
            try {
              const lr = await fetch(`https://graph.facebook.com/v19.0/${v.leadgen_id}?access_token=${token}`);
              if (lr.ok) { const lj = await lr.json(); for (const fd of lj.field_data ?? []) fields[fd.name] = (fd.values ?? [])[0] ?? ''; }
            } catch (_) { /* keep raw */ }
          }
          const company = fields.company_name || fields.business_name || fields.company || 'Unknown business (Meta lead)';
          const email = (fields.email || '').toLowerCase() || null;
          const dupe = email ? (await sql`select id from acq.prospects where org_id=${org.id} and lower(owner_email)=${email} limit 1`)[0] : null;
          if (!dupe) {
            await sql`insert into acq.prospects (org_id, company_name, owner_name, owner_email, owner_phone, region, provenance, exportable, source, stage, notes)
              values (${org.id}, ${company}, ${fields.full_name || fields.name || null}, ${email}, ${fields.phone_number || fields.phone || null}, ${fields.city || fields.region || null},
                'meta_ads', true, ${{ kind: 'meta_lead', leadgen_id: v.leadgen_id ?? null, page_id: pageId, raw: fields }}, 'qualified', ${'Meta lead ad enquiry.' + (fields.message ? ' Message: ' + fields.message : '')})`;
            await sql`insert into acq.tasks (org_id, title, due_date) values (${org.id}, ${'New Meta lead: ' + company + (email ? ' <' + email + '>' : '') + ' — review and respond today'}, ${new Date().toISOString().slice(0, 10)})`;
            createdCount++;
          }
        }
      }
      await sql.end({ timeout: 5 });
      return json({ ok: true, created: createdCount });
    }

    // ---- public funnel form submission ----
    if (body.website_url) { await sql.end({ timeout: 5 }); return json({ ok: true }); } // honeypot
    const org = await resolveOrg(sql, body.org ?? null);
    if (!org) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 404); }
    const company = String(body.company ?? '').slice(0, 200).trim();
    const email = String(body.email ?? '').slice(0, 200).toLowerCase().trim() || null;
    if (!company || !email) { await sql.end({ timeout: 5 }); return json({ error: 'company and email required' }, 400); }

    const dupe = (await sql`select id from acq.prospects where org_id=${org.id} and lower(owner_email)=${email} limit 1`)[0];
    if (!dupe) {
      await sql`insert into acq.prospects (org_id, company_name, owner_name, owner_email, owner_phone, region, revenue_estimate, revenue_basis, provenance, exportable, source, stage, notes)
        values (${org.id}, ${company}, ${String(body.name ?? '').slice(0, 120) || null}, ${email}, ${String(body.phone ?? '').slice(0, 40) || null}, ${String(body.region ?? '').slice(0, 120) || null},
          ${num(body.revenue)}, ${num(body.revenue) ? 'self_reported' : null}, 'funnel', true,
          ${{ kind: 'funnel', sector: body.sector ?? null, profit: body.profit ?? null }}, 'qualified',
          ${['Inbound seller enquiry via funnel.', body.sector ? 'Sector: ' + String(body.sector).slice(0, 120) : null, body.profit ? 'Stated profit: ' + String(body.profit).slice(0, 40) : null, body.message ? 'Message: ' + String(body.message).slice(0, 1500) : null].filter(Boolean).join('\n')})`;
      await sql`insert into acq.tasks (org_id, title, due_date) values (${org.id}, ${'New seller enquiry: ' + company + ' — respond within 2 working days'}, ${new Date().toISOString().slice(0, 10)})`;
    }

    // auto-reply (best-effort)
    try {
      const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('resend_api_key','from_email')`).map((r: any) => [r.key, r.value]));
      const f = org?.settings?.funnel ?? {};
      if (cfg.resend_api_key && f.auto_reply !== false) {
        const from = org?.settings?.outreach?.from || cfg.from_email;
        const brandName = org?.settings?.brand?.name || org.name;
        const text = `Hello${body.name ? ' ' + String(body.name).split(' ')[0] : ''},\n\nThank you for getting in touch about ${company}. Your enquiry has arrived safely and is completely confidential.\n\nA real person will come back to you within two working days. It usually helps to have a rough idea of revenue, profit and what you would like to happen next, but there is no need to prepare anything formal.\n\nKind regards\n${brandName}`;
        await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from, to: [email], subject: `We received your enquiry about ${company}`, text }) });
      }
    } catch (_) { /* non-blocking */ }

    await sql.end({ timeout: 5 });
    return json({ ok: true });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) {}
    return json({ error: String(e) }, 500);
  }
});
