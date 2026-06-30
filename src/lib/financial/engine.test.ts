// Validation suite for the financial engine — asserts against Sandeep's own
// worked examples wherever the materials give numbers. Run:
//   node --experimental-strip-types engine.test.ts
import {
  computeAdjustedEbitda, debtServiceAnnual, sectorRange, fourMultipleMethod,
  valuation, recommendedFundingStack, sevenNumberTest, redFramework,
  propertyMetrics, developmentAppraisal,
} from './engine.ts';

let passed = 0, failed = 0;
const approx = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}  ${detail}`); }
}

console.log('\n— Adjusted EBITDA build (§2.1 worked example: 60+50+40 = 150) —');
{
  const r = computeAdjustedEbitda({ operatingProfit: 60_000, ownerSalary: 50_000, ownerDividends: 40_000,
    otherAddBacks: [{ label: 'Hypothetical cost cut', amount: 30_000, acceptance: 'rejected' }] });
  check('adjusted EBITDA = £150,000', r.adjustedEbitda === 150_000, `got ${r.adjustedEbitda}`);
  check('rejected add-back excluded', r.rejectedAddBacks.length === 1 && r.adjustedEbitda === 150_000);
}

console.log('\n— Amortising debt service (refinance case: £396k @5.5%/7yr → ~£69,680; DSCR 2.4×) —');
{
  const ds = debtServiceAnnual(396_000, 0.055, 7);
  check('annual debt service ≈ £69,680', approx(ds, 69_680, 60), `got ${Math.round(ds)}`);
  check('DSCR on £165k EBITDA ≈ 2.4×', approx(165_000 / ds, 2.37, 0.05), `got ${(165_000 / ds).toFixed(2)}`);
  check('zero-rate loan = principal/term', debtServiceAnnual(100_000, 0, 5) === 20_000);
}

console.log('\n— Sector multiple ranges (§2.3) —');
{
  const small = sectorRange('care_domiciliary', 215_000); // <£500k → SDE basis
  check('care domiciliary <£500k uses SDE 2.5–4', small.basis === 'SDE' && small.low === 2.5 && small.high === 4);
  const big = sectorRange('care_domiciliary', 600_000);   // ≥£500k → EBITDA basis
  check('care domiciliary ≥£500k uses EBITDA 3–5', big.basis === 'EBITDA' && big.low === 3 && big.high === 5);
  const ss = sectorRange('self_storage', 200_000);
  check('self-storage 6–10', ss.low === 6 && ss.high === 10);
}

console.log('\n— 4-Multiple Method (Meadowbrook: £965k ÷ £215k EBITDA = 4.5× owner multiple) —');
{
  const r = fourMultipleMethod({ askingPrice: 967_500, adjustedEbitda: 215_000, sector: 'care_domiciliary' });
  check('owner multiple = 4.5×', r.ownerMultiple === 4.5, `got ${r.ownerMultiple}`);
}

console.log('\n— Valuation & offer construction (sub-£500k → SDE basis [2,3]) —');
{
  const v = valuation({ adjustedEbitda: 100_000, sector: 'other', netDebt: 50_000, cash: 10_000, askingPrice: 450_000 });
  check('basis = SDE for sub-£500k profit', v.basis === 'SDE');
  check('EV mid = £250k (2.5× of [2,3])', v.enterpriseValue.mid === 250_000, `got ${v.enterpriseValue.mid}`);
  check('EV floor £200k / ceiling £300k', v.enterpriseValue.floor === 200_000 && v.enterpriseValue.ceiling === 300_000);
  check('equity mid = EV − netDebt + cash = £210k', v.equityValue.mid === 210_000, `got ${v.equityValue.mid}`);
  check('opening offer = £262.5k (12.5% below ceiling)', v.openingOffer === 262_500, `got ${v.openingOffer}`);
  check('walk-away = ceiling £300k', v.walkAway === 300_000);
  check('asking £450k flagged above ceiling (>1)', (v.askingVsCeiling ?? 0) > 1);
}

console.log('\n— Asset-value floor (§2.5) —');
{
  const v = valuation({ adjustedEbitda: 50_000, sector: 'self_storage', assetValueFloor: 800_000 });
  check('freehold floor overrides thin EBITDA value', v.assetFloorApplied && v.enterpriseValue.floor === 800_000);
}

console.log('\n— Funding stack (§3.1 reference: ~60/25/15 on a £500k deal) —');
{
  const s = recommendedFundingStack(500_000, 150_000);
  check('senior £300k (60%)', s.senior.amount === 300_000 && s.senior.pct === 60, `got ${s.senior.amount}/${s.senior.pct}%`);
  check('vendor £125k (25%)', s.vendor.amount === 125_000 && s.vendor.pct === 25, `got ${s.vendor.amount}/${s.vendor.pct}%`);
  check('equity £75k (15%, in 10–20% range)', s.equity.amount === 75_000 && s.equity.pct === 15);
  check('no under-capitalisation warning', !s.warnings.some((w) => w.includes('under-capitalised')));
  // senior capped by 3× EBITDA when EBITDA is thin
  const thin = recommendedFundingStack(500_000, 80_000);
  check('senior capped at 3× EBITDA (£240k) when EBITDA thin', thin.senior.amount === 240_000, `got ${thin.senior.amount}`);
}

console.log('\n— 7-Number Test (§2.7) —');
{
  const stack = recommendedFundingStack(500_000, 150_000);
  const t = sevenNumberTest({
    adjustedEbitda: 150_000, totalAnnualDebtService: stack.totalAnnualDebtService,
    vendorAnnualDebtService: stack.vendor.annualDebtService ?? 0, buyerMarketSalary: 60_000,
    equityIn: stack.equity.amount, purchaseMultiple: 500_000 / 150_000,
    sectorRange: { low: 2, high: 4 }, revenue: 900_000, fteCount: 12, sectorCategory: 'services',
  });
  const dscr = t.results[0];
  check('DSCR computed ≈1.5× and passes', dscr.value != null && approx(dscr.value, 1.54, 0.06) && dscr.status === 'pass', `got ${dscr.value}`);
  check('purchase multiple 3.33× within sector range → pass', t.results[3].status === 'pass', `got ${t.results[3].value}`);
  check('revenue/FTE £75k services → pass', t.results[5].status === 'pass', `got ${t.results[5].value}`);
  check('VF affordability < 50% → pass', t.results[6].status === 'pass', `got ${t.results[6].value}`);
  check('verdict is a valid enum', ['Proceed', 'Renegotiate', 'Walk away'].includes(t.verdict), t.verdict);
  // a clearly bad deal walks
  const bad = sevenNumberTest({ adjustedEbitda: 100_000, totalAnnualDebtService: 110_000, vendorAnnualDebtService: 70_000,
    buyerMarketSalary: 60_000, equityIn: 20_000, purchaseMultiple: 9, sectorRange: { low: 2, high: 4 },
    revenue: 300_000, fteCount: 10, sectorCategory: 'services' });
  check('over-levered 9× deal → Walk away', bad.verdict === 'Walk away', bad.verdict);
}

console.log('\n— RED Framework (§1.4) —');
{
  const ok = redFramework({ revenueTrend: [800_000, 820_000, 840_000], recurringPct: 0.6, largestCustomerPct: 0.1, sellerReason: 'pass', ownerDependency: 'pass' });
  check('growing, recurring, diversified, credible → Proceed', ok.overall === 'Proceed', JSON.stringify(ok));
  const decline = redFramework({ revenueTrend: [900_000, 800_000, 700_000], recurringPct: 0.5, largestCustomerPct: 0.1 });
  check('3-yr decline → R fails → Park', decline.R === 'fail' && decline.overall === 'Park');
  const conc = redFramework({ revenueTrend: [800_000, 820_000], recurringPct: 0.6, largestCustomerPct: 0.4, sellerReason: 'pass' });
  check('customer >30% → D fails → Park', conc.D === 'fail' && conc.overall === 'Park');
}

console.log('\n— Property metrics —');
{
  const p = propertyMetrics({ value: 1_000_000, grossRent: 80_000, netIncome: 55_000, outstandingDebt: 600_000, newDebtRate: 0.06, newDebtTermYears: 20 });
  check('gross yield 8%', p.grossYield === 8);
  check('net yield 5.5%', p.netYield === 5.5);
  check('LTV 60%', p.ltv === 60);
  check('DSCR ≈ 1.05×', p.dscr != null && approx(p.dscr, 1.05, 0.03), `got ${p.dscr}`);
  check('equity value £400k', p.equityValue === 400_000);
}

console.log('\n— Development appraisal (GDV) —');
{
  const d = developmentAppraisal({ units: 10, avgUnitGdv: 300_000, landCost: 800_000, buildCostPerUnit: 150_000, otherCosts: 200_000 });
  check('GDV £3.0m', d.gdv === 3_000_000);
  check('total cost £2.5m', d.totalCost === 2_500_000);
  check('profit £500k', d.profit === 500_000);
  check('profit on cost 20%', d.profitOnCostPct === 20);
  check('profit on GDV ≈16.7%', approx(d.profitOnGdvPct, 16.67, 0.1));
}

console.log(`\n=============================\n  ${passed} passed, ${failed} failed\n=============================\n`);
if (failed > 0) process.exit(1);
