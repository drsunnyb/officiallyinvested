import { useEffect, useState } from 'react';
import { Loader2, X, RefreshCw, AlertTriangle, Bell, Clock } from 'lucide-react';
import { monitorList, monitorRun, monitorDismiss } from '../lib/acq';

const SEV: Record<string, { c: string; icon: any }> = {
  critical: { c: 'bg-red-500/12 border-red-400/40 text-red-200', icon: AlertTriangle },
  warn: { c: 'bg-amber-500/12 border-amber-400/40 text-amber-100', icon: AlertTriangle },
  info: { c: 'bg-white/5 border-white/10 text-white/75', icon: Clock },
};

export default function AlertsModal({ onClose }: { onClose: () => void }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => { setLoading(true); setErr(''); try { const r = await monitorList(); setAlerts(r.alerts || []); } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); } };
  useEffect(() => { load(); }, []);

  const run = async () => { setRunning(true); setErr(''); setMsg(''); try { const r = await monitorRun(); setMsg(`Checked ${r.checked} companies · ${r.alerts_created} new alert(s)`); await load(); } catch (e: any) { setErr(e.message || String(e)); } finally { setRunning(false); } };
  const dismiss = async (id: string) => { setAlerts((a) => a.filter((x) => x.id !== id)); try { await monitorDismiss(id); } catch { /**/ } };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-lg bg-[#0E3257] rounded-2xl p-6 border border-white/10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-serif font-bold text-[#FFD700] flex items-center gap-2"><Bell className="h-4 w-4" /> Monitoring &amp; alerts</h3>
          <button onClick={onClose} className="text-white/60 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-white/45 text-[12px] mb-4">Watches your deals on Companies House - status, charges, insolvency, overdue accounts - and flags the refinance window.</p>

        <div className="flex items-center gap-2 mb-4">
          <button onClick={run} disabled={running} className="inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-3.5 py-2 rounded-full text-xs font-semibold hover:bg-opacity-90 disabled:opacity-50">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Run check now
          </button>
          {msg && <span className="text-emerald-300 text-xs">{msg}</span>}
        </div>
        {err && <p className="text-red-300 text-xs mb-2">{err}</p>}

        {loading ? <div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : (
          alerts.length === 0 ? <p className="text-white/45 text-sm">All clear - nothing flagged across your deals.</p> : (
            <div className="flex flex-col gap-2">
              {alerts.map((a) => { const s = SEV[a.severity] || SEV.info; const Icon = s.icon; return (
                <div key={a.id} className={'flex items-start gap-2.5 rounded-lg border p-3 ' + s.c}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{a.title}</div>
                    {a.deal_name && <div className="text-[11px] opacity-70">{a.deal_name}</div>}
                    {a.detail && <div className="text-[12px] opacity-80 mt-1 leading-relaxed">{a.detail}</div>}
                  </div>
                  <button onClick={() => dismiss(a.id)} className="text-white/40 hover:text-white text-[10px]">dismiss</button>
                </div>
              ); })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
