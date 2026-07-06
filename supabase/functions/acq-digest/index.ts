// =============================================================================
// acq-digest — daily branded priority email for every org member.
// Sections: overdue & due-today tasks (split Origination vs Pipeline),
// outreach awaiting approval, replies in the last 24h, new funnel leads.
// Branded with the org's own colours/logo (defaults to Officially Invested
// navy/gold). Sent via Resend on a 07:30 cron. Trusted only (x-acq-secret).
// =============================================================================
import postgres from 'npm:postgres@3.4.5';
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const esc = (x: string) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

function rowHtml(t: any, accent: string) {
  const due = t.due_date ? new Date(t.due_date) : null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = due && due < today;
  return `<tr><td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:14px;color:#26313c">${esc(t.title).slice(0, 140)}${t.deal_name ? `<span style=\"color:#8a94a0\"> · ${esc(t.deal_name)}</span>` : ''}</td><td style="padding:7px 0;border-bottom:1px solid #eef1f5;font-size:12px;text-align:right;white-space:nowrap;color:${overdue ? '#c0392b;font-weight:700' : '#8a94a0'}">${due ? (overdue ? 'OVERDUE · ' : '') + due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</td></tr>`;
}
function section(title: string, inner: string, color: string) {
  return `<div style="margin-top:26px"><div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${color};font-weight:700;margin-bottom:6px">${title}</div><table style="width:100%;border-collapse:collapse">${inner}</table></div>`;
}

Deno.serve(async (req: Request) => {
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','resend_api_key','from_email')`).map((r: any) => [r.key, r.value]));
    if (!cfg.acq_internal_secret || req.headers.get('x-acq-secret') !== cfg.acq_internal_secret) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
    if (!cfg.resend_api_key) { await sql.end({ timeout: 5 }); return json({ error: 'resend not configured' }); }

    const orgs = await sql`select id, name, settings from acq.organizations`;
    const report: any[] = [];
    for (const org of orgs) {
      const tasks = await sql`
        select t.title, t.due_date, t.deal_id, d.name as deal_name from acq.tasks t
        left join acq.deals d on d.id = t.deal_id
        where t.org_id=${org.id} and t.status='open'
        order by t.due_date nulls last, t.created_at limit 40`;
      const approvals = Number((await sql`select count(*)::int as n from acq.outreach_touches where org_id=${org.id} and status='needs_approval'`)[0].n);
      const replies = await sql`select company_name from acq.prospects where org_id=${org.id} and stage='replied' and updated_at > now() - interval '24 hours' limit 10`;
      const leads = await sql`select company_name from acq.prospects where org_id=${org.id} and provenance in ('funnel','meta_ads') and created_at > now() - interval '24 hours' limit 10`;
      const origTasks = tasks.filter((t: any) => !t.deal_id);
      const pipeTasks = tasks.filter((t: any) => t.deal_id);
      if (!origTasks.length && !pipeTasks.length && !approvals && !replies.length && !leads.length) { report.push({ org: org.name, skipped: 'nothing to report' }); continue; }

      const members = await sql`select u.email from acq.org_members m join auth.users u on u.id = m.user_id where m.org_id=${org.id} and m.role in ('owner','admin','analyst') and u.email is not null`;
      if (!members.length) { report.push({ org: org.name, skipped: 'no recipients' }); continue; }

      const brand = org.settings?.brand ?? {};
      const navy = brand.color || '#0A2540'; const gold = brand.accent || '#FFD700';
      const brandName = brand.name || org.name;
      const hot: string[] = [];
      if (approvals) hot.push(`<b>${approvals}</b> outreach message${approvals > 1 ? 's' : ''} waiting for your approval`);
      if (replies.length) hot.push(`<b>${replies.length}</b> owner${replies.length > 1 ? 's' : ''} replied: ${replies.map((r: any) => esc(r.company_name)).join(', ')}`);
      if (leads.length) hot.push(`<b>${leads.length}</b> new inbound lead${leads.length > 1 ? 's' : ''}: ${leads.map((r: any) => esc(r.company_name)).join(', ')}`);

      const html = `<!doctype html><html><body style="margin:0;background:#f4f6f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 14px">
  <div style="background:${navy};border-radius:14px 14px 0 0;padding:26px 28px">
    ${brand.logo ? `<img src=\"${brand.logo}\" style=\"max-height:34px;margin-bottom:10px\" alt=\"\"/>` : ''}
    <div style="color:${gold};font-size:20px;font-weight:800">Your priorities today</div>
    <div style="color:rgba(255,255,255,.65);font-size:13px;margin-top:4px">${esc(brandName)} · ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
  </div>
  <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:8px 28px 26px">
    ${hot.length ? `<div style=\"margin-top:18px;background:${navy};border-radius:10px;padding:14px 16px\">${hot.map((h) => `<div style=\"color:#fff;font-size:13.5px;padding:3px 0\">⚡ ${h}</div>`).join('')}</div>` : ''}
    ${origTasks.length ? section('Origination · sourcing & outreach', origTasks.map((t: any) => rowHtml(t, gold)).join(''), navy) : ''}
    ${pipeTasks.length ? section('Pipeline · live deals', pipeTasks.map((t: any) => rowHtml(t, gold)).join(''), navy) : ''}
    <div style="margin-top:26px">
      <a href="https://www.officiallyinvested.com/admin/origination" style="display:inline-block;background:${gold};color:${navy};font-weight:700;font-size:14px;padding:11px 20px;border-radius:9px;text-decoration:none">Open Origination</a>
      <a href="https://www.officiallyinvested.com/admin/pipeline" style="display:inline-block;margin-left:8px;color:${navy};font-weight:700;font-size:14px;padding:11px 14px;text-decoration:none">Open pipeline →</a>
    </div>
    <div style="margin-top:22px;font-size:11px;color:#a6afba">You receive this because you are a member of ${esc(brandName)} on Officially Invested AI.</div>
  </div>
</div></body></html>`;

      let sent = 0;
      for (const m of members) {
        try {
          const rr = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${cfg.resend_api_key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: (org.settings?.outreach?.from) || cfg.from_email, to: [m.email], subject: `Your priorities today · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${brandName}`, html }) });
          if (rr.ok) sent++;
        } catch (_) { /* member best-effort */ }
      }
      report.push({ org: org.name, sent, orig_tasks: origTasks.length, pipe_tasks: pipeTasks.length, approvals, replies: replies.length, leads: leads.length });
    }
    await sql.end({ timeout: 5 });
    return json({ ok: true, report });
  } catch (e) {
    try { await sql.end({ timeout: 5 }); } catch (_) { /* noop */ }
    return json({ error: String(e).slice(0, 300) }, 500);
  }
});
