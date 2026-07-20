/**
 * フェーズ3統合: 住宅購入イベントがパイプライン全体に与える影響のテスト
 * (design doc §8 手順6-7, §7 AnnualRow.housing/taxCredits)。
 * 個々の償還・税額控除ロジックの正確性は engine/housing/__tests__/ で
 * 検証済みなので、ここでは pipeline への結線(家賃終了、現金収支への
 * ローン返済反映、住宅ローン控除の所得税/住民税への反映、純資産)を確認する。
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../rules/2026.json";
import type {
  Assumptions,
  Household,
  HousingPurchaseEvent,
  LoanPrepaymentEvent,
  RuleSet
} from "../types/index.js";
import { runDeterministic } from "../pipeline.js";

const rules = rules2026 as unknown as RuleSet;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected value to be defined");
  return value;
}

const household: Household = {
  schemaVersion: 1,
  persons: [
    {
      id: "partner-a",
      birthYearMonth: "1990-01",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 500000, bonusAnnual: 1000000, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    }
  ],
  children: [],
  municipality: "koto-ku",
  baseExpenses: [{ label: "家賃", monthly: 150000, indexation: "fixed" }],
  financialAssets: [{ assetClassId: "cash", account: "cash", balance: 15000000, costBasis: 15000000 }],
  savingsPolicy: {
    cashBufferMonths: 6,
    contributions: [],
    drawdown: { strategy: "fixed-amount", value: 0, order: [] }
  }
};

const assumptions: Assumptions = {
  simulation: { startYear: 2026, endAge: 60, paths: 1, seed: 1 },
  inflation: { mean: 0, volatility: 0 },
  wageGrowth: { mean: 0, volatility: 0 },
  assetClasses: [],
  correlationMatrix: { factors: [], matrix: [] },
  baseRate: { initial: 0.01, model: "manual", manualPath: [{ year: 2026, rate: 0.01 }] }
};

const purchase: HousingPurchaseEvent = {
  id: "house-1",
  type: "housing-purchase",
  yearMonth: "2027-04",
  propertyPrice: 50000000,
  propertyType: "new-mansion",
  downPayment: 10000000,
  closingCosts: 2000000,
  loans: [
    {
      loanId: "loan-1",
      borrowerPersonId: "partner-a",
      principal: 40000000,
      years: 35,
      method: "equal-payment",
      rateType: "fixed",
      fixedRate: 0.01,
      variableRules: { fiveYearRule: false, cap125Rule: false, rateResetMonths: 6 },
      groupCreditLife: "general"
    }
  ],
  holdingCosts: { propertyTaxAnnual: 120000, managementFeeMonthly: 20000 },
  terminatesExpenseLabels: ["家賃"],
  taxCreditEligibility: { eligible: true, category: "certified", hasChildOrYoungCouple: false }
};

function expenseAmount(row: { expenses: { category: string; amount: number }[] }, category: string): number | undefined {
  return row.expenses.find((e) => e.category === category)?.amount;
}

describe("住宅購入イベント統合 (2026〜2030)", () => {
  const result = runDeterministic(household, [purchase], assumptions, rules);
  const rows = result.deterministic;
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const y2026 = must(byYear.get(2026));
  const y2027 = must(byYear.get(2027));
  const y2028 = must(byYear.get(2028));
  const loan2027 = must(y2027.housing["loan-1"]);
  const loan2028 = must(y2028.housing["loan-1"]);

  test("購入前は家賃を計上する", () => {
    expect(expenseAmount(y2026, "家賃")).toBe(150000 * 12);
  });

  test("購入月(2027-04)以降は家賃を計上しない(terminatesExpenseLabels)", () => {
    // 購入年は1〜3月分(3か月)のみ計上され、4月以降は止まる。
    expect(expenseAmount(y2027, "家賃")).toBe(150000 * 3);
    expect(expenseAmount(y2028, "家賃")).toBeUndefined();
  });

  test("購入年に頭金・諸費用を一括計上する", () => {
    expect(expenseAmount(y2027, "住宅購入(頭金・諸費用・house-1)")).toBe(12000000);
    expect(expenseAmount(y2028, "住宅購入(頭金・諸費用・house-1)")).toBeUndefined();
  });

  test("保有コスト(固定資産税・管理費)は購入年以降毎年計上する", () => {
    expect(expenseAmount(y2027, "固定資産税(house-1)")).toBe(120000);
    expect(expenseAmount(y2028, "固定資産税(house-1)")).toBe(120000);
    expect(expenseAmount(y2027, "管理費・修繕積立金(house-1)")).toBe(20000 * 12);
  });

  test("AnnualRow.housingにローン償還明細が入る(残高は年々減少する)", () => {
    expect(loan2027.balance).toBeLessThan(40000000);
    expect(loan2028.balance).toBeLessThan(loan2027.balance);
    expect(loan2027.payment).toBeGreaterThan(0);
  });

  test("購入前年はhousingが空", () => {
    expect(y2026.housing).toEqual({});
  });

  test("現金残高は 手取り+給付-支出-ローン返済 の累積になっている(購入年)", () => {
    const netTotal = Object.values(y2027.income).reduce((s, r) => s + r.net, 0);
    const benefitTotal = y2027.benefits.reduce((s, b) => s + b.amount, 0);
    const expenseTotal = y2027.expenses.reduce((s, e) => s + e.amount, 0);
    expect(y2027.cashBalance).toBe(y2026.cashBalance + netTotal + benefitTotal - expenseTotal - loan2027.payment);
  });

  test("住宅ローン控除: 購入年の所得税が控除適用前より軽くなる(taxCreditsに計上)", () => {
    expect(y2027.taxCredits.housingLoan).toBeGreaterThan(0);
  });

  test("住宅ローン控除は控除期間(certified-new=13年)を過ぎると計上されない", () => {
    const afterWindow = must(byYear.get(2027 + 13));
    expect(afterWindow.taxCredits.housingLoan).toBe(0);
  });

  test("純資産 = 現金+投資 + 住宅評価額(簡易・購入価格据え置き) - ローン残高", () => {
    const investTotal = Object.values(y2027.invest.balances).reduce((s, v) => s + v, 0);
    expect(y2027.netWorth).toBe(y2027.cashBalance + investTotal + 50000000 - loan2027.balance);
  });

  test("購入前は住宅評価額が乗らない(netWorth = cashBalance + invest)", () => {
    const investTotal = Object.values(y2026.invest.balances).reduce((s, v) => s + v, 0);
    expect(y2026.netWorth).toBe(y2026.cashBalance + investTotal);
  });

  test("イベントを差し替えるだけで別シナリオが走る(イベントなし=ベースライン、家賃が続く)", () => {
    const baseline = runDeterministic(household, [], assumptions, rules);
    const b2027 = must(baseline.deterministic.find((r) => r.year === 2027));
    expect(expenseAmount(b2027, "家賃")).toBe(150000 * 12);
    expect(b2027.housing).toEqual({});
  });
});

describe("繰上返済イベント統合", () => {
  const prepay: LoanPrepaymentEvent = {
    id: "prepay-1",
    type: "loan-prepayment",
    loanId: "loan-1",
    yearMonth: "2028-06",
    amount: 3000000,
    method: "reduce-payment"
  };

  test("繰上返済後は返済額が下がる、または残高がより速く減る", () => {
    const withPrepay = runDeterministic(household, [purchase, prepay], assumptions, rules);
    const withoutPrepay = runDeterministic(household, [purchase], assumptions, rules);
    const row2029With = must(withPrepay.deterministic.find((r) => r.year === 2029));
    const row2029Without = must(withoutPrepay.deterministic.find((r) => r.year === 2029));
    const loanWith = must(row2029With.housing["loan-1"]);
    const loanWithout = must(row2029Without.housing["loan-1"]);
    expect(loanWith.balance).toBeLessThan(loanWithout.balance);
  });

  test("繰上返済は現金からも支払われる(残高が減るだけでなく現金も減る)", () => {
    const withPrepay = runDeterministic(household, [purchase, prepay], assumptions, rules);
    const withoutPrepay = runDeterministic(household, [purchase], assumptions, rules);
    const row2027 = must(withPrepay.deterministic.find((r) => r.year === 2027));
    const row2028With = must(withPrepay.deterministic.find((r) => r.year === 2028));
    const row2028Without = must(withoutPrepay.deterministic.find((r) => r.year === 2028));

    // The prepayment year's cash-flow reconciliation identity still holds
    // (row.payment already folds in the 3,000,000 lump sum): cash was
    // actually charged for it, not just the loan balance.
    const netTotal = Object.values(row2028With.income).reduce((s, r) => s + r.net, 0);
    const benefitTotal = row2028With.benefits.reduce((s, b) => s + b.amount, 0);
    const expenseTotal = row2028With.expenses.reduce((s, e) => s + e.amount, 0);
    const loanPayment = must(row2028With.housing["loan-1"]).payment;
    expect(row2028With.cashBalance).toBe(
      row2027.cashBalance + netTotal + benefitTotal - expenseTotal - loanPayment
    );

    // A 3,000,000-yen prepayment must actually cost cash this year, not
    // just shrink the loan balance for free (the blocker this regression
    // test targets: prior to the fix, cashBalance was identical either way).
    expect(row2028With.cashBalance).toBeLessThan(row2028Without.cashBalance);
  });
});
