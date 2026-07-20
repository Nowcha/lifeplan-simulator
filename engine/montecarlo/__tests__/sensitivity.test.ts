import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { Assumptions, Household, RuleSet } from "../../types/index.js";
import { runSensitivity } from "../sensitivity.js";
import { BASE_RATE_FACTOR_ID } from "../paths.js";

const rules = rules2026 as unknown as RuleSet;

// 住宅ローンなし・現金余剰が常に出る世帯 — 資産クラスのリターンだけが
// 最終資産を左右するので、低リターン<高リターンという単調な方向を
// 確実に検証できる。
const household: Household = {
  schemaVersion: 1,
  persons: [
    {
      id: "solo",
      birthYearMonth: "1990-01",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 400000, bonusAnnual: 0, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    }
  ],
  children: [],
  municipality: "koto-ku",
  baseExpenses: [{ label: "生活費", monthly: 150000, indexation: "fixed" }],
  financialAssets: [
    { assetClassId: "cash", account: "cash", balance: 3000000, costBasis: 3000000 },
    { assetClassId: "global-equity", account: "taxable", balance: 2000000, costBasis: 2000000 }
  ],
  savingsPolicy: {
    cashBufferMonths: 6,
    contributions: [{ account: "taxable", monthlyCap: 100000, assetClassId: "global-equity" }],
    drawdown: { strategy: "fixed-amount", value: 0, order: ["taxable"] }
  }
};

function makeAssumptions(overrides: Partial<Assumptions> = {}): Assumptions {
  return {
    simulation: { startYear: 2026, endAge: 40, paths: 200, seed: 1 },
    inflation: { mean: 0, volatility: 0 },
    wageGrowth: { mean: 0, volatility: 0 },
    assetClasses: [{ id: "global-equity", expectedReturn: 0.05, volatility: 0.15 }],
    correlationMatrix: { factors: [], matrix: [] },
    baseRate: { initial: 0.01, model: "manual", manualPath: [{ year: 2026, rate: 0.01 }] },
    deterministicOverride: { inflation: 0, "wage-growth": 0 },
    ...overrides
  };
}

describe("runSensitivity", () => {
  test("資産クラスごとに low<high(低リターン想定より高リターン想定の方が最終資産中央値が高い)を返す", () => {
    const result = runSensitivity(household, [], makeAssumptions(), rules);
    const equity = result.find((r) => r.factor === "global-equity");
    expect(equity).toBeDefined();
    expect(equity?.low).toBeLessThan(equity?.high ?? 0);
  });

  test("baseRateがmanualモデルならbase-rate要素は含まれない(確率変動しないため)", () => {
    const result = runSensitivity(household, [], makeAssumptions(), rules);
    expect(result.find((r) => r.factor === BASE_RATE_FACTOR_ID)).toBeUndefined();
  });

  test("baseRateがmean-revertingモデルならbase-rate要素も含まれる", () => {
    const assumptions = makeAssumptions({
      baseRate: { initial: 0.01, model: "mean-reverting", meanReversion: { speed: 0.2, longTermMean: 0.02, volatility: 0.01 } }
    });
    const result = runSensitivity(household, [], assumptions, rules);
    expect(result.find((r) => r.factor === BASE_RATE_FACTOR_ID)).toBeDefined();
  });

  test("資産クラスが複数あればその数だけ要素を返す", () => {
    const assumptions = makeAssumptions({
      assetClasses: [
        { id: "global-equity", expectedReturn: 0.05, volatility: 0.15 },
        { id: "bonds", expectedReturn: 0.015, volatility: 0.05 }
      ]
    });
    const result = runSensitivity(household, [], assumptions, rules);
    expect(result.map((r) => r.factor).sort()).toEqual(["bonds", "global-equity"]);
  });

  test("同じseedのモンテカルロを再利用するので結果は再現する", () => {
    const assumptions = makeAssumptions();
    const a = runSensitivity(household, [], assumptions, rules);
    const b = runSensitivity(household, [], assumptions, rules);
    expect(a).toEqual(b);
  });
});
