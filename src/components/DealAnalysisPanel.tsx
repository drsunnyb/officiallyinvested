import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Upload, AlertTriangle, Gavel, FileText, RefreshCw, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { getDealBySubmission, getDealById, runAnalyze, runCommittee, runMemo, extractFile, pollBundle, type AcqBundle } from '../lib/acq';

function gbp(v: unknown): string {
  const n = Number(v);
  if (!isFinite(n) || v == null || v === '') return '—';
  if (Math.abs(n) >= 1e6) return '£' + (n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 2) + 'M';
  if (Math.abs(n) >= 1e3) return '£' + Math.round(n / 1e3) + 'k';
  return '£' + n.toLocaleString('en-GB');
}

const VERDICT_STYLE: Record<string, string> = {
  BUY: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50',
  WATCH: 'bg-amber-500/20 text-amber-200 border-amber-400/50',
  PASS: 'bg-white/15 text-white/70 border-white/30',
};
const CHIP: Record<string, string> = {
  pass: 'bg-emerald-500/15 text-emerald-300',
  monitor: 'bg-amber-500/15 text-amber-200',
  fail: 'bg-red-500/20 text-red-300',
};

export default function DealAnalysisPanel({ submissionId }: { submissionId: string }) {
  const [b, setB] = useState<AcqBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'' | 'extract' | 'analyze' | 'committee' | 'memo'>('');
  const [err, setErr] = useState('');
  const [showMemo, setShowMemo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try { setB(await getDealBySubmission(submissionId)); }
    catch (e: any) { setErr(e.message || String(e)); }
    finally { setLoading(false); }
  }, [submissionId]);

  useEffect(() => { load(); }, [load]);

  const dealId = b?.deal?.id as string | undefined;

  const onUpload = async (files: FileList | null) => {
    if (!files?.length || !dealId) return;
    setBusy('extract'); setErr('');
    try { for (const f of Array.from(files)) await extractFile(dealId, f); setB(await getDealById(dealId)); }
    catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  };

  const runStep = async (step: 'analyze' | 'committee' | 'memo') => {
    if (!dealId) return;
    setBusy(step); setErr('');
    const prev = step === 'analyze' ? b?.analysis?.id : step === 'committee' ? b?.verdict?.id : b?.memo?.id;
    try {
      if (step === 'analyze') await runAnalyze(dealId);
      if (step === 'committee') await runCommittee(dealId);
      if (step === 'memo') await runMemo(dealId);
      const fresh = await pollBundle(dealId, (x) =>
        step === 'analyze' ? !!x.analysis && x.analysis.id !== prev
        : step === 'committee' ? !!x.verdict && x.verdict.id !== prev
        : !!x.memo && x.memo.id !== prev);
      setB(fresh);
      if (step === 'memo') setShowMemo(true);
    } catch (e: any) { setErr(e.message || String(e)); }
    finally { setBusy(''); }
  };

  if (loading) return <Wrap><div className="flex items-center gap-2 text-white/60 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading analysis…</div></Wrap>;

  const res = b?.valuation?.result;
  const rep = b?.analysis?.report;
  const verdict = b?.verdict?.verdict as string | undefined;
  const seven = res?.sevenNumber;
  const verified = (b?.facts ?? []).filter((f) => !f.is_self_reported);
  const contradiction = verified.find((f) => f.contradicts_self_reported);

  return (
    <Wrap>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[#FFD700] font-serif text-lg font-bold"><Sparkles className="h-4 w-4" /> AI Investment Analyst</div>
        <button onClick={load} className="text-white/50 hover:text-white" title="Refresh"><RefreshCw className="h-3.5 w-3.5" /></button>
      </div>

      {err && <p className="text-red-300 text-xs mb-2">{err}</p>}

      {!b?.valuation && (
        <p className="text-white/60 text-sm mb-3">No analysis yet. Upload the accounts for verified figures, or run analysis now on the submitted numbers.</p>
      )}

      {/* decision header */}
      {b?.valuation && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {verdict
                ? <span className={'text-sm font-semibold px-3 py-1 rounded-full border ' + (VERDICT_STYLE[verdict] ?? VERDICT_STYLE.PASS)}>{verdict}</span>
                : <span className="text-sm font-semibold px-3 py-1 rounded-full border bg-white/10 text-white/70 border-white/25">Analysed</span>}
              {b?.analysis?.score != null && <span className="text-white/55 text-xs">score {b.analysis.score}</span>}
            </div>
            {res?.red?.overall && <span className="text-xs text-white/55">RED: <b className={res.red.overall === 'Proceed' ? 'text-emerald-300' : 'text-amber-200'}>{res.red.overall}</b></span>}
          </div>

          {contradiction && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-400/40 rounded-lg p-2.5 mb-3 text-xs text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>Seller figure contradicted by documents — {contradiction.metric.replace(/_/g, ' ')} {gbp(contradiction.value)} filed. Run the bank-statement test.</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Kpi label="Adj EBITDA" value={gbp(b.valuation.adjusted_ebitda)} gold />
            <Kpi label="Opening offer" value={gbp(res?.valuation?.openingOffer)} />
            <Kpi label="DSCR" value={seven?.results?.[0]?.value != null ? seven.results[0].value + '×' : '—'} good />
            <Kpi label="7-Number" value={seven ? `${seven.passes}/7` : '—'} good />
          </div>
        </>
      )}

      {/* actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => fileRef.current?.click()} disabled={!!busy} className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3.5 py-2 rounded-full text-xs font-semibold hover:bg-white/20 disabled:opacity-50">
          {busy === 'extract' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload accounts
        </button>
        <input ref={fileRef} type="file" accept="application/pdf,text/csv,text/plain" multiple className="hidden" onChange={(e) => { onUpload(e.target.files); e.target.value = ''; }} />
        <button onClick={() => runStep('analyze')} disabled={!!busy} className="inline-flex items-center gap-1.5 bg-[#FFD700] text-[#0A2540] px-3.5 py-2 rounded-full text-xs font-semibold hover:bg-opacity-90 disabled:opacity-50">
          {busy === 'analyze' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {b?.analysis ? 'Re-run analysis' : 'Run analysis'}
        </button>
        <button onClick={() => runStep('committee')} disabled={!!busy || !b?.analysis} className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3.5 py-2 rounded-full text-xs font-semibold hover:bg-white/20 disabled:opacity-40">
          {busy === 'committee' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gavel className="h-3.5 w-3.5" />} Committee
        </button>
        <button onClick={() => runStep('memo')} disabled={!!busy || !b?.analysis} className="inline-flex items-center gap-1.5 bg-white/10 text-white px-3.5 py-2 rounded-full text-xs font-semibold hover:bg-white/20 disabled:opacity-40">
          {busy === 'memo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Memo
        </button>
      </div>
      {busy === 'analyze' && <p className="text-white/45 text-xs mb-3">Running the engine and analyst… this takes about a minute.</p>}

      {/* verified financials */}
      {verified.length > 0 && (
        <Block title={`Verified financials (${verified.length})`}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
            {verified.slice(0, 9).map((f) => (
              <div key={f.id} className={'rounded-lg p-2 ' + (f.contradicts_self_reported ? 'bg-red-500/10 border border-red-400/40' : 'bg-white/5')}>
                <div className="text-white/45 text-[10px] capitalize">{f.metric.replace(/_/g, ' ')}{f.period ? ' · ' + f.period : ''}</div>
                <div className={'text-sm font-semibold ' + (f.contradicts_self_reported ? 'text-red-200' : 'text-white')}>{f.metric.endsWith('_pct') ? f.value + '%' : gbp(f.value)}</div>
              </div>
            ))}
          </div>
        </Block>
      )}

      {/* valuation + 7-number */}
      {res && (
        <Block title="Valuation & deal economics">
          {res.valuation && (
            <p className="text-white/75 text-[13px] mb-2">Range {gbp(res.valuation.enterpriseValue?.floor)} – {gbp(res.valuation.enterpriseValue?.ceiling)} · open {gbp(res.valuation.openingOffer)} · walk-away {gbp(res.valuation.walkAway)} <span className="text-white/40">({res.valuation.multipleRange?.low}–{res.valuation.multipleRange?.high}× {res.valuation.basis})</span></p>
          )}
          {res.fundingStack && (
            <div className="flex h-5 rounded overflow-hidden text-[10px] text-[#0A2540] font-semibold mb-2">
              <div style={{ width: (res.fundingStack.senior?.pct ?? 60) + '%' }} className="bg-[#FFD700] flex items-center justify-center">Senior {Math.round(res.fundingStack.senior?.pct ?? 0)}%</div>
              <div style={{ width: (res.fundingStack.vendor?.pct ?? 25) + '%' }} className="bg-emerald-300 flex items-center justify-center">VF {Math.round(res.fundingStack.vendor?.pct ?? 0)}%</div>
              <div style={{ width: (res.fundingStack.equity?.pct ?? 15) + '%' }} className="bg-white/50 flex items-center justify-center">Eq {Math.round(res.fundingStack.equity?.pct ?? 0)}%</div>
            </div>
          )}
          {seven?.results && (
            <div className="flex flex-wrap gap-1.5">
              {seven.results.map((r: any) => (
                <span key={r.n} className={'text-[10px] px-2 py-1 rounded-full ' + (CHIP[r.status] ?? CHIP.monitor)}>{r.name} {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✕' : '—'}</span>
              ))}
            </div>
          )}
        </Block>
      )}

      {/* analyst */}
      {rep && (
        <Block title="Analyst view">
          {rep.executive_summary && <p className="text-white/80 text-[13px] leading-relaxed mb-2">{rep.executive_summary}</p>}
          {Array.isArray(rep.key_risks) && rep.key_risks.length > 0 && (
            <ul className="list-disc pl-4 text-white/65 text-[12px] space-y-1 mb-2">{rep.key_risks.slice(0, 4).map((r: string, i: number) => <li key={i}>{r}</li>)}</ul>
          )}
          {rep.suggested_offer && <p className="text-[#FFD700] text-[12px]">Suggested: open {gbp(rep.suggested_offer.opening)} · walk {gbp(rep.suggested_offer.walk_away)}</p>}
        </Block>
      )}

      {/* committee */}
      {b?.verdict?.detail && (
        <Block title="Investment Committee">
          <p className="text-white/80 text-[13px] mb-2">{b.verdict.detail.headline}</p>
          {Array.isArray(b.verdict.detail.conditions) && b.verdict.detail.conditions.length > 0 && (
            <>
              <div className="text-white/45 text-[11px] mb-1">Conditions to proceed</div>
              <ul className="list-disc pl-4 text-white/70 text-[12px] space-y-1">{b.verdict.detail.conditions.slice(0, 5).map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
            </>
          )}
        </Block>
      )}

      {/* memo */}
      {b?.memo && (
        <Block title={b.memo.title || 'Investment memo'}>
          <button onClick={() => setShowMemo((s) => !s)} className="inline-flex items-center gap-1 text-[#FFD700] text-xs font-semibold mb-2">
            {showMemo ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {showMemo ? 'Hide' : 'View'} memo
          </button>
          {showMemo && <pre className="whitespace-pre-wrap text-white/75 text-[12px] leading-relaxed bg-black/20 rounded-lg p-3 max-h-96 overflow-y-auto font-sans">{b.memo.content}</pre>}
        </Block>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 bg-white/5 rounded-2xl p-4 border border-white/10">{children}</div>;
}
function Kpi({ label, value, gold, good }: { label: string; value: string; gold?: boolean; good?: boolean }) {
  return (
    <div className="bg-white/5 rounded-lg p-2.5">
      <div className="text-white/45 text-[10px]">{label}</div>
      <div className={'text-base font-semibold ' + (gold ? 'text-[#FFD700]' : good ? 'text-emerald-300' : 'text-white')}>{value}</div>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/8 pt-3 mt-3">
      <div className="text-white/50 text-[11px] uppercase tracking-wide mb-2">{title}</div>
      {children}
    </div>
  );
}
