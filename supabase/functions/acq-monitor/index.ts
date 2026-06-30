// acq-monitor — watches live deals via Companies House (status, charges, insolvency,
// accounts) and fires a refinance reminder. Actions: run | list | dismiss.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const DB_URL = Deno.env.get('SUPABASE_DB_URL')!;
const EIGHTEEN_MONTHS_MS = 540 * 86400 * 1000;

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-acq-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function ch(num: string, key: string): Promise<any> {
  try {
    const r = await fetch(`https://api.company-information.service.gov.uk/company/${encodeURIComponent(num.trim())}`, { headers: { Authorization: 'Basic ' + btoa(key + ':') } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sql = postgres(DB_URL, { prepare: false });
  try {
    const body = await req.json().catch(() => ({} as any));
    const cfg = Object.fromEntries((await sql`select key, value from public.oi_config where key in ('acq_internal_secret','ch_api_key')`).map((r: any) => [r.key, r.value]));
    const CH_KEY = Deno.env.get('COMPANIES_HOUSE_API_KEY') || cfg.ch_api_key || '';
    const trusted = !!req.headers.get('x-acq-secret') && req.headers.get('x-acq-secret') === cfg.acq_internal_secret;
    let userId: string | null = null;
    if (!trusted) {
      const sb = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data } = await sb.auth.getUser();
      if (!data?.user) { await sql.end({ timeout: 5 }); return json({ error: 'unauthorised' }, 401); }
      userId = data.user.id;
    }
    let orgId: string | null = body.org_id ?? null;
    if (!orgId && userId) { const m = (await sql`select org_id from acq.org_members where user_id=${userId} order by created_at limit 1`)[0]; orgId = m?.org_id ?? null; }
    if (!orgId && trusted) { const o = (await sql`select id from acq.organizations order by created_at limit 1`)[0]; orgId = o?.id ?? null; }
    if (!orgId) { await sql.end({ timeout: 5 }); return json({ error: 'no org' }, 403); }

    const action = body.action ?? 'list';

    if (action === 'dismiss') {
      await sql`update acq.alerts set status='dismissed' where id=${body.alert_id} and org_id=${orgId}`;
      return json({ ok: true });
    }

    if (action === 'run') {
      const deals = await sql`select d.id, d.name, d.ch_snapshot, d.updated_at, s.companies_house_number as chno, s.status as sub_status
        from acq.deals d left join public.submissions s on s.id=d.submission_id where d.org_id=${orgId}`;
      let checked = 0, created = 0;
      const addAlert = async (deal_id: string, kind: string, severity: string, title: string, detail: string) => {
        const dup = await sql`select 1 from acq.alerts where deal_id=${deal_id} and kind=${kind} and title=${title} and status<>'dismissed' limit 1`;
        if (dup.length) return; await sql`insert into acq.alerts (org_id, deal_id, kind, severity, title, detail) values (${orgId}, ${deal_id}, ${kind}, ${severity}, ${title}, ${detail})`; created++;
      };
      for (const d of deals) {
        if (d.sub_status === 'completed' && new Date(d.updated_at).getTime() < Date.now() - EIGHTEEN_MONTHS_MS) {
          await addAlert(d.id, 'refinance', 'info', 'Refinance window open', 'This completed deal is ~18+ months old — two clean years of accounts make this the moment to revalue and refinance.');
        }
        if (!d.chno || !CH_KEY) continue;
        const j = await ch(d.chno, CH_KEY); if (!j) continue; checked++;
        const snap = { status: j.company_status, has_charges: !!j.has_charges, has_insolvency_history: !!j.has_insolvency_history, accounts_overdue: !!(j.accounts && j.accounts.overdue) };
        const prev = d.ch_snapshot || null;
        if (prev) {
          if (snap.status !== prev.status) await addAlert(d.id, 'ch_status', (snap.status === 'dissolved' || snap.status === 'liquidation') ? 'critical' : 'warn', `Company status changed to ${snap.status}`, `Companies House status moved from ${prev.status} to ${snap.status}.`);
          if (snap.has_charges && !prev.has_charges) await addAlert(d.id, 'ch_charge', 'warn', 'New charge registered', 'A charge (security) has been registered at Companies House since the last check.');
          if (snap.has_insolvency_history && !prev.has_insolvency_history) await addAlert(d.id, 'ch_insolvency', 'critical', 'Insolvency history appeared', 'Companies House now shows insolvency history for this company.');
          if (snap.accounts_overdue && !prev.accounts_overdue) await addAlert(d.id, 'ch_accounts', 'warn', 'Accounts overdue', 'Statutory accounts are now overdue at Companies House.');
        }
        await sql`update acq.deals set ch_snapshot=${sql.json(snap)}, ch_last_checked=now() where id=${d.id}`;
      }
      return json({ ok: true, deals: deals.length, checked, alerts_created: created });
    }

    const alerts = await sql`select a.*, d.name as deal_name from acq.alerts a left join acq.deals d on d.id=a.deal_id where a.org_id=${orgId} and a.status<>'dismissed' order by case a.severity when 'critical' then 0 when 'warn' then 1 else 2 end, a.created_at desc limit 100`;
    return json({ ok: true, alerts });
  } catch (e) {
    return json({ error: String(e) }, 500);
  } finally {
    await sql.end({ timeout: 5 });
  }
});
