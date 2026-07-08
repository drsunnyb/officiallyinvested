// =============================================================================
// Officially Invested - Deterministic Financial Engine
// -----------------------------------------------------------------------------
// Encodes Dr Sandeep Bansal's acquisition methodology as PURE, AUDITABLE code:
//   • Adjusted EBITDA build-up (value off this, never reported profit)
//   • The 4-Multiple Method (Owner / Market / Sector / Deal)
//   • Sector multiple tables (UK SME, 2024–25 benchmarks)
//   • Valuation (EV = Adj EBITDA × multiple; Equity = EV − Net Debt + Cash)
//   • Offer construction (floor / ceiling / opening offer / walk-away)
//   • The Funding Stack (senior debt / vendor finance / equity)
//   • The 7-Number Test (deal-economics gate)
//   • The RED Framework (60-second filter)
//   • Property metrics (NOI, yields, LTV, DSCR, GDV)
//
// Every number is computed here, in code - the LLM layers narrative on top but
// NEVER invents the figures. No external dependencies; runs in Deno (edge
// functions) and Node. All money in GBP.
// =============================================================================

// ----------------------------- small helpers ---------------------------------

export const round = (n: number, dp = 0): number => {
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
};
const safe = (n: unknown): number => (typeof n === 'number' && isFinite(n) ? n : 0);
const pct = (n: number, dp = 1): number => round(n * 100, dp);

/**
 * Annual debt service on an amortising loan.
 * payment = P·r / (1 − (1+r)^−n).  Validated against Sandeep's refinance case:
 * £396k @ 5.5% / 7yr → £69,680/yr → DSCR 2.4× on £165k EBITDA.
 */
export function debtServiceAnnual(principal: number, annualRate: number, termYears: number): number {
  principal = safe(principal); annualRate = safe(annualRate); termYears = safe(termYears);
  if (principal <= 0 || termYears <= 0) return 0;
  if (annualRate === 0) return principal / termYears;
  const r = annualRate;
  return principal * r / (1 - Math.pow(1 + r, -termYears));
}

// ----------------------------- sector multiples ------------------------------
// From the framework §2.3. SDE multiple under ~£500k profit; EBITDA multiple above.
// Where only an EBITDA range is given in materials, it is used for both bands.

export type SectorKey =
  | 'care_residential' | 'care_domiciliary' | 'dental' | 'childcare' | 'funeral'
  | 'self_storage' | 'vehicle_services' | 'trade' | 'waste' | 'fm_cleaning'
  | 'testing_compliance' | 'transport_logistics' | 'pest_control' | 'laundry'
  | 'pharmacy' | 'accountancy' | 'ifa' | 'other';

interface SectorRow {
  label: string;
  sde?: [number, number];     // SDE multiple range (profit < ~£500k)
  ebitda: [number, number];   // EBITDA multiple range (£500k+)
  basisNote?: string;         // special bases (e.g. multiple of recurring fees)
}

export const SECTOR_MULTIPLES: Record<SectorKey, SectorRow> = {
  care_residential:   { label: 'Care - residential', sde: [2.5, 4], ebitda: [4, 8] },
  care_domiciliary:   { label: 'Care - domiciliary', sde: [2.5, 4], ebitda: [3, 5] },
  dental:             { label: 'Dental practice', ebitda: [4, 8] },
  childcare:          { label: 'Childcare / nursery', ebitda: [3, 6] },
  funeral:            { label: 'Funeral directors', ebitda: [4, 8] },
  self_storage:       { label: 'Self-storage', ebitda: [6, 10] },
  vehicle_services:   { label: 'Vehicle services / garages', ebitda: [3, 5] },
  trade:              { label: 'Trade (plumbing/electrical/HVAC)', sde: [2, 3.5], ebitda: [3.5, 5.5] },
  waste:              { label: 'Waste & recycling', sde: [2, 3], ebitda: [3, 5] },
  fm_cleaning:        { label: 'FM & commercial cleaning', sde: [3, 4.5], ebitda: [5, 8] },
  testing_compliance: { label: 'Testing & compliance', sde: [3, 5], ebitda: [5, 8] },
  transport_logistics:{ label: 'Transport & logistics', sde: [2, 3], ebitda: [3, 5.5] },
  pest_control:       { label: 'Pest control', ebitda: [4, 6] },
  laundry:            { label: 'Laundry / dry cleaning', ebitda: [3, 5] },
  pharmacy:           { label: 'Pharmacy', ebitda: [3, 5] },
  accountancy:        { label: 'Accountancy practice', ebitda: [1, 2], basisNote: '× annual recurring fees (not EBITDA)' },
  ifa:                { label: 'IFA / financial planning', ebitda: [2, 4], basisNote: '× recurring revenue (not EBITDA)' },
  other:              { label: 'Boring business (general)', sde: [2, 3], ebitda: [2, 4] },
};

export interface SectorRange { low: number; high: number; mid: number; basis: 'SDE' | 'EBITDA'; label: string; note?: string; }

/** Pick the right multiple range. Profit < £500k → SDE basis where available. */
export function sectorRange(sector: SectorKey, adjustedProfit: number): SectorRange {
  const row = SECTOR_MULTIPLES[sector] ?? SECTOR_MULTIPLES.other;
  const useSde = adjustedProfit < 500_000 && !!row.sde;
  const [low, high] = useSde ? (row.sde as [number, number]) : row.ebitda;
  return { low, high, mid: round((low + high) / 2, 2), basis: useSde ? 'SDE' : 'EBITDA', label: row.label, note: row.basisNote };
}

// ----------------------------- adjusted EBITDA -------------------------------

export interface AdjustedEbitdaInputs {
  operatingProfit: number;
  depreciation?: number;
  amortisation?: number;
  ownerSalary?: number;
  ownerDividends?: number;
  oneOffCosts?: number;          // non-recurring costs added back
  oneOffIncome?: number;         // non-recurring income removed
  otherAddBacks?: { label: string; amount: number; acceptance?: 'high' | 'medium' | 'rejected' }[];
  replaceOwnerWithManager?: boolean;
  managerSalary?: number;        // netted out only if replacing the owner
}

export interface AdjustedEbitdaResult {
  adjustedEbitda: number;
  lines: { label: string; amount: number }[];
  rejectedAddBacks: { label: string; amount: number }[];
}

/**
 * §2.1 build: Operating profit + D&A + owner salary + owner dividends
 *   + one-off costs − one-off income (+ vetted add-backs). If a manager will
 *   replace the owner, net the manager salary back out.
 * Worked example: £60k op profit + £50k salary + £40k dividends = £150k. ✓
 */
export function computeAdjustedEbitda(i: AdjustedEbitdaInputs): AdjustedEbitdaResult {
  const lines: { label: string; amount: number }[] = [];
  const push = (label: string, amount: number) => { if (amount) lines.push({ label, amount: round(amount) }); };

  push('Operating profit', safe(i.operatingProfit));
  push('+ Depreciation', safe(i.depreciation));
  push('+ Amortisation', safe(i.amortisation));
  push('+ Owner salary (add-back)', safe(i.ownerSalary));
  push('+ Owner dividends (add-back)', safe(i.ownerDividends));
  push('+ One-off / non-recurring costs', safe(i.oneOffCosts));
  push('− One-off / non-recurring income', -safe(i.oneOffIncome));

  const rejected: { label: string; amount: number }[] = [];
  for (const a of i.otherAddBacks ?? []) {
    if (a.acceptance === 'rejected') { rejected.push({ label: a.label, amount: round(a.amount) }); continue; }
    push(`+ ${a.label}`, safe(a.amount));
  }

  if (i.replaceOwnerWithManager && i.managerSalary) push('− Replacement manager salary', -safe(i.managerSalary));

  const adjustedEbitda = round(lines.reduce((s, l) => s + l.amount, 0));
  return { adjustedEbitda, lines, rejectedAddBacks: rejected };
}

// ----------------------------- 4-Multiple Method -----------------------------

export interface FourMultipleInputs {
  askingPrice: number;
  adjustedEbitda: number;
  sector: SectorKey;
  marketMultipleOverride?: number;  // live broker quote, if known
  qualityScore?: number;            // −1..+1 → position within sector range
  structureAdjustment?: number;     // −0.5 unpriced risk / +0.5 provable plan
}

export interface FourMultipleResult {
  ownerMultiple: number | null;     // null if no asking price
  marketMultiple: number;
  sectorMultiple: number;
  dealMultiple: number;
  range: SectorRange;
}

/** §2.2 - the 30-minute valuation cross-check. */
export function fourMultipleMethod(i: FourMultipleInputs): FourMultipleResult {
  const range = sectorRange(i.sector, i.adjustedEbitda);
  const q = Math.max(-1, Math.min(1, safe(i.qualityScore)));
  // position within range: mid + q × (half-width)
  const half = (range.high - range.low) / 2;
  const sectorMultiple = round(range.mid + q * half, 2);
  const marketMultiple = i.marketMultipleOverride != null ? i.marketMultipleOverride : range.mid;
  const dealMultiple = round(Math.max(0, sectorMultiple + safe(i.structureAdjustment)), 2);
  const ownerMultiple = i.askingPrice > 0 && i.adjustedEbitda > 0 ? round(i.askingPrice / i.adjustedEbitda, 2) : null;
  return { ownerMultiple, marketMultiple, sectorMultiple, dealMultiple, range };
}

// ----------------------------- valuation -------------------------------------

export interface ValuationInputs {
  adjustedEbitda: number;
  sector: SectorKey;
  netDebt?: number;
  cash?: number;
  qualityScore?: number;     // −1..+1
  assetValueFloor?: number;  // freehold valuation for asset-heavy businesses (§2.5)
  askingPrice?: number;
}

export interface ValuationResult {
  basis: 'SDE' | 'EBITDA';
  multipleRange: { low: number; high: number };
  enterpriseValue: { floor: number; mid: number; ceiling: number };
  equityValue: { floor: number; mid: number; ceiling: number };
  openingOffer: number;       // 10–15% below ceiling, not below floor (§2.6)
  walkAway: number;           // the justified ceiling - never exceed
  assetFloorApplied: boolean;
  askingVsCeiling: number | null; // asking ÷ ceiling (>1 = priced above the zone)
}

/** §2.1/§2.5/§2.6 valuation + offer construction. */
export function valuation(i: ValuationInputs): ValuationResult {
  const range = sectorRange(i.sector, i.adjustedEbitda);
  const e = safe(i.adjustedEbitda);
  let floorEV = e * range.low, midEV = e * range.mid, ceilingEV = e * range.high;

  let assetFloorApplied = false;
  if (i.assetValueFloor && i.assetValueFloor > floorEV) {  // asset value sets the floor
    floorEV = i.assetValueFloor; assetFloorApplied = true;
    if (midEV < floorEV) midEV = floorEV;
    if (ceilingEV < floorEV) ceilingEV = floorEV;
  }

  const nd = safe(i.netDebt), cash = safe(i.cash);
  const eq = (ev: number) => ev - nd + cash;

  const openingOffer = round(Math.max(floorEV, ceilingEV * 0.875)); // ~12.5% below ceiling
  return {
    basis: range.basis,
    multipleRange: { low: range.low, high: range.high },
    enterpriseValue: { floor: round(floorEV), mid: round(midEV), ceiling: round(ceilingEV) },
    equityValue: { floor: round(eq(floorEV)), mid: round(eq(midEV)), ceiling: round(eq(ceilingEV)) },
    openingOffer,
    walkAway: round(ceilingEV),
    assetFloorApplied,
    askingVsCeiling: i.askingPrice && ceilingEV > 0 ? round(i.askingPrice / ceilingEV, 2) : null,
  };
}

// ----------------------------- funding stack ---------------------------------

export interface FundingPrefs {
  seniorRate?: number; seniorTermYears?: number;     // default 7% / 6yr
  vendorRate?: number; vendorTermYears?: number;     // default 4% / 4yr
  targetSeniorPct?: number;                          // default 0.60 (range 50–60%)
  targetVendorPct?: number;                          // default 0.25 (range 20–30%)
  maxSeniorLtvPct?: number;                          // hard cap, default 0.70
  maxSeniorEbitdaMultiple?: number;                  // default 3.0
}

export interface FundingLayer { amount: number; pct: number; rate?: number; termYears?: number; annualDebtService?: number; }
export interface FundingStack {
  price: number;
  senior: FundingLayer;
  vendor: FundingLayer;
  equity: FundingLayer;
  totalAnnualDebtService: number;
  warnings: string[];
}

/**
 * §3.1 reference stack: senior 2–3× EBITDA & ≤70% price, vendor 20–40%,
 * equity 10–20%. Returns the canonical stack + warnings; the 7-Number Test
 * then judges whether it actually services.
 */
export function recommendedFundingStack(price: number, adjustedEbitda: number, p: FundingPrefs = {}): FundingStack {
  price = safe(price); adjustedEbitda = safe(adjustedEbitda);
  const seniorRate = p.seniorRate ?? 0.07, seniorTerm = p.seniorTermYears ?? 6;
  const vendorRate = p.vendorRate ?? 0.04, vendorTerm = p.vendorTermYears ?? 4;
  const tgtSenior = p.targetSeniorPct ?? 0.60, tgtVendor = p.targetVendorPct ?? 0.25;
  const maxLtv = p.maxSeniorLtvPct ?? 0.70, maxMult = p.maxSeniorEbitdaMultiple ?? 3.0;
  const warnings: string[] = [];

  // Senior: target 60% of price, but never above the LTV cap or 3× EBITDA.
  const senior = Math.max(0, Math.min(price * tgtSenior, price * maxLtv, adjustedEbitda * maxMult));
  const vendor = Math.min(price * tgtVendor, Math.max(0, price - senior));
  const equity = Math.max(0, price - senior - vendor);

  const eqPct = price > 0 ? equity / price : 0;
  if (eqPct > 0.20) warnings.push(`Equity is ${pct(eqPct)}% of price - above the 10–20% range; consider more vendor finance.`);
  if (eqPct < 0.10 && price > 0) warnings.push(`Equity is only ${pct(eqPct)}% - below the 10% lender minimum; deal may be under-capitalised.`);
  if (senior < price * 0.50 && adjustedEbitda * maxMult < price * 0.50)
    warnings.push('Senior debt is constrained by the 3× EBITDA cap, not LTV - EBITDA may be too thin to fund this price.');

  const svc = (amt: number, rate: number, term: number) => round(debtServiceAnnual(amt, rate, term));
  const seniorSvc = svc(senior, seniorRate, seniorTerm);
  const vendorSvc = svc(vendor, vendorRate, vendorTerm);

  const layer = (amount: number, rate: number, term: number, ds: number): FundingLayer =>
    ({ amount: round(amount), pct: price > 0 ? pct(amount / price) : 0, rate, termYears: term, annualDebtService: ds });

  return {
    price: round(price),
    senior: layer(senior, seniorRate, seniorTerm, seniorSvc),
    vendor: layer(vendor, vendorRate, vendorTerm, vendorSvc),
    equity: { amount: round(equity), pct: price > 0 ? pct(equity / price) : 0 },
    totalAnnualDebtService: round(seniorSvc + vendorSvc),
    warnings,
  };
}

// ----------------------------- the 7-Number Test -----------------------------

export type TestStatus = 'pass' | 'monitor' | 'fail';
export interface NumberResult { n: number; name: string; value: number | null; unit: string; benchmark: string; status: TestStatus; note?: string; }
export interface SevenNumberResult { results: NumberResult[]; passes: number; fails: number; verdict: 'Proceed' | 'Renegotiate' | 'Walk away'; }

export interface SevenNumberInputs {
  adjustedEbitda: number;
  totalAnnualDebtService: number;
  vendorAnnualDebtService: number;
  buyerMarketSalary: number;       // what a manager doing your job would cost
  equityIn: number;                // your cash into the deal
  purchaseMultiple: number;        // deal price ÷ adjusted EBITDA
  sectorRange: { low: number; high: number };
  revenue: number;
  fteCount: number;
  sectorCategory?: 'services' | 'trade' | 'waste';
}

/** §2.7 - the deal-economics gate. Run before any offer. */
export function sevenNumberTest(i: SevenNumberInputs): SevenNumberResult {
  const e = safe(i.adjustedEbitda), ds = safe(i.totalAnnualDebtService);
  const results: NumberResult[] = [];

  // 1 - DSCR
  const dscr = ds > 0 ? e / ds : Infinity;
  results.push({ n: 1, name: 'DSCR', value: isFinite(dscr) ? round(dscr, 2) : null, unit: '×',
    benchmark: '≥1.5 safe; 1.2–1.5 monitor; <1.2 danger',
    status: dscr >= 1.5 ? 'pass' : dscr >= 1.2 ? 'monitor' : 'fail' });

  // 2 - Buyer's annual cash return (£ above a market salary)
  const cashReturn = e - ds - safe(i.buyerMarketSalary);
  results.push({ n: 2, name: 'Annual cash return', value: round(cashReturn), unit: '£',
    benchmark: '>£50k of surplus after debt service + a market salary',
    status: cashReturn >= 50_000 ? 'pass' : cashReturn >= 0 ? 'monitor' : 'fail' });

  // 3 - Cash-on-cash
  const coc = i.equityIn > 0 ? cashReturn / i.equityIn : null;
  results.push({ n: 3, name: 'Cash-on-cash', value: coc != null ? pct(coc) : null, unit: '%',
    benchmark: '>25% excellent; 15–25% good; <15% rethink',
    status: coc == null ? 'monitor' : coc >= 0.25 ? 'pass' : coc >= 0.15 ? 'monitor' : 'fail' });

  // 4 - Purchase-multiple sanity vs sector range
  const m = safe(i.purchaseMultiple), r = i.sectorRange;
  results.push({ n: 4, name: 'Purchase multiple', value: round(m, 2), unit: '×',
    benchmark: `within sector ${r.low}–${r.high}×`,
    status: m <= r.high ? (m >= r.low ? 'pass' : 'monitor') : (m > r.high * 2 ? 'fail' : 'monitor'),
    note: m > r.high * 2 ? 'Asking >2× the market comparable - Severity-1 red flag.' : undefined });

  // 5 - Payback on equity
  const payback = cashReturn > 0 ? i.equityIn / cashReturn : null;
  results.push({ n: 5, name: 'Equity payback', value: payback != null ? round(payback, 1) : null, unit: 'yrs',
    benchmark: '<4 years',
    status: payback == null ? 'fail' : payback < 4 ? 'pass' : payback <= 6 ? 'monitor' : 'fail' });

  // 6 - Revenue per FTE
  const rpf = i.fteCount > 0 ? i.revenue / i.fteCount : null;
  const cat = i.sectorCategory ?? 'services';
  const bench = cat === 'waste' ? 100_000 : cat === 'trade' ? 80_000 : 60_000;
  results.push({ n: 6, name: 'Revenue per FTE', value: rpf != null ? round(rpf) : null, unit: '£',
    benchmark: `${cat}: >£${(bench / 1000)}k`,
    status: rpf == null ? 'monitor' : rpf >= bench ? 'pass' : rpf >= bench * 0.75 ? 'monitor' : 'fail' });

  // 7 - Vendor-finance affordability
  const vf = e > 0 ? safe(i.vendorAnnualDebtService) / e : 0;
  results.push({ n: 7, name: 'VF affordability', value: pct(vf), unit: '%',
    benchmark: 'vendor repayment <50% of EBITDA',
    status: vf < 0.5 ? 'pass' : vf < 0.65 ? 'monitor' : 'fail' });

  const passes = results.filter((x) => x.status === 'pass').length;
  const fails = results.filter((x) => x.status === 'fail').length;
  const dscrFail = results[0].status === 'fail';
  const verdict: SevenNumberResult['verdict'] =
    fails === 0 && passes >= 6 ? 'Proceed' : dscrFail || fails >= 3 ? 'Walk away' : 'Renegotiate';
  return { results, passes, fails, verdict };
}

// ----------------------------- RED Framework ---------------------------------

export type RedStatus = 'pass' | 'investigate' | 'fail';
export interface RedInputs {
  revenueTrend?: number[];          // oldest→newest; e.g. [800000, 820000, 840000]
  recurringPct?: number;            // 0..1
  largestCustomerPct?: number;      // 0..1
  sellerReason?: RedStatus;         // credibility of exit reason (human-set)
  ownerDependency?: RedStatus;      // can a manager run it? (human-set)
}
export interface RedResult { R: RedStatus; E: RedStatus; D: RedStatus; overall: 'Proceed' | 'Park'; rationale: string[]; }

/** §1.4 - the 60-second filter. Computes what's computable; flags the rest. */
export function redFramework(i: RedInputs): RedResult {
  const rationale: string[] = [];

  // R - Revenue: real, recurring, growing?
  let R: RedStatus = 'pass';
  const t = i.revenueTrend ?? [];
  if (t.length >= 2) {
    const declining = t.every((v, idx) => idx === 0 || v <= t[idx - 1]);
    const firstLast = t[t.length - 1] < t[0];
    if (t.length >= 3 && declining && firstLast) { R = 'fail'; rationale.push('R: revenue declining across 3 years without a provable reversal plan.'); }
    else if (firstLast) { R = 'investigate'; rationale.push('R: revenue lower than the start of the window - probe the cause.'); }
  }
  if ((i.recurringPct ?? 0) < 0.40 && R === 'pass') { R = 'investigate'; rationale.push('R: recurring revenue below 40% - quality of revenue uncertain.'); }

  // E - Exit credibility (needs human judgement)
  const E: RedStatus = i.sellerReason ?? 'investigate';
  if (E === 'investigate' && !i.sellerReason) rationale.push("E: seller's reason for sale not yet assessed.");
  if (E === 'fail') rationale.push('E: seller exit reason not credible / evasive.');

  // D - Dependencies
  let D: RedStatus = 'pass';
  const cc = i.largestCustomerPct ?? 0;
  if (cc > 0.30) { D = 'fail'; rationale.push(`D: largest customer ${pct(cc)}% of revenue (>30%).`); }
  else if (cc >= 0.20) { D = 'investigate'; rationale.push(`D: customer concentration ${pct(cc)}% (20–30%).`); }
  if (i.ownerDependency === 'fail') { D = 'fail'; rationale.push('D: business depends on the owner personally.'); }
  else if (i.ownerDependency === 'investigate' && D === 'pass') D = 'investigate';

  const states = [R, E, D];
  const overall: RedResult['overall'] = states.includes('fail') ? 'Park'
    : states.filter((s) => s === 'investigate').length >= 2 ? 'Park' : 'Proceed';
  return { R, E, D, overall, rationale };
}

// ----------------------------- property path ---------------------------------

export interface PropertyInputs {
  value: number;                 // valuation or asking price
  grossRent?: number;            // annual
  netIncome?: number;            // NOI (annual)
  outstandingDebt?: number;
  newDebtRate?: number; newDebtTermYears?: number;  // for DSCR on proposed debt
  targetNetYield?: number;       // to derive a yield-based valuation
}
export interface PropertyResult {
  grossYield: number | null; netYield: number | null; ltv: number | null;
  dscr: number | null; yieldBasedValue: number | null; equityValue: number | null;
}
export function propertyMetrics(i: PropertyInputs): PropertyResult {
  const v = safe(i.value);
  const grossYield = v > 0 && i.grossRent != null ? round((i.grossRent / v) * 100, 2) : null;
  const netYield = v > 0 && i.netIncome != null ? round((i.netIncome / v) * 100, 2) : null;
  const debt = safe(i.outstandingDebt);
  const ltv = v > 0 ? round((debt / v) * 100, 2) : null;
  const ds = debtServiceAnnual(debt, safe(i.newDebtRate), safe(i.newDebtTermYears));
  const dscr = ds > 0 && i.netIncome != null ? round(i.netIncome / ds, 2) : null;
  const yieldBasedValue = i.targetNetYield && i.netIncome != null ? round(i.netIncome / i.targetNetYield) : null;
  const equityValue = v > 0 ? round(v - debt) : null;
  return { grossYield, netYield, ltv, dscr, yieldBasedValue, equityValue };
}

export interface DevelopmentInputs { units: number; avgUnitGdv: number; landCost: number; buildCostPerUnit: number; otherCosts?: number; }
export interface DevelopmentResult { gdv: number; totalCost: number; profit: number; profitOnCostPct: number; profitOnGdvPct: number; }
/** Simple GDV appraisal for development / JV-origination deals. */
export function developmentAppraisal(i: DevelopmentInputs): DevelopmentResult {
  const gdv = safe(i.units) * safe(i.avgUnitGdv);
  const totalCost = safe(i.landCost) + safe(i.units) * safe(i.buildCostPerUnit) + safe(i.otherCosts);
  const profit = gdv - totalCost;
  return {
    gdv: round(gdv), totalCost: round(totalCost), profit: round(profit),
    profitOnCostPct: totalCost > 0 ? pct(profit / totalCost) : 0,
    profitOnGdvPct: gdv > 0 ? pct(profit / gdv) : 0,
  };
}
