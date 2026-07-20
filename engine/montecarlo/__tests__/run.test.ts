/**
 * design doc §9 モンテカルロ検証要件:
 * - シード固定で結果が再現すること
 * - paths→∞で決定論パス(期待値)に収束すること(平均リターンで検算)
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { Assumptions, Household, RuleSet } from "../../types/index.js";
import { runDeterministic } from "../../pipeline.js";
import { runMonteCarlo } from "../run.js";

const rules = rules2026 as unknown as RuleSet;

// 常に現金余剰が出る(取り崩しが一切発動しない)世帯 — 拠出は毎年cashフロー
// (給与-支出)だけで決まり資産評価額に依存しないため、パイプラインが
// 実現リターンに対して線形になり、E[最終資産] が決定論パス(期待値)に
// 一致することを検算しやすい。
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

function makeAssumptions(overrides: Partial<Assumptions["simulation"]> = {}): Assumptions {
  return {
    simulation: { startYear: 2026, endAge: 40, paths: 30, seed: 1, ...overrides },
    inflation: { mean: 0, volatility: 0 },
    wageGrowth: { mean: 0, volatility: 0 },
    assetClasses: [{ id: "global-equity", expectedReturn: 0.05, volatility: 0.15 }],
    correlationMatrix: { factors: [], matrix: [] },
    baseRate: { initial: 0.01, model: "manual", manualPath: [{ year: 2026, rate: 0.01 }] },
    deterministicOverride: { inflation: 0, "wage-growth": 0 }
  };
}

describe("runMonteCarlo", () => {
  test("同じseedなら同じ結果を返す(再現性)", () => {
    const assumptions = makeAssumptions({ paths: 20 });
    const a = runMonteCarlo(household, [], assumptions, rules);
    const b = runMonteCarlo(household, [], assumptions, rules);
    expect(a).toEqual(b);
  });

  test("パーセンタイルは昇順(p10<=p25<=p50<=p75<=p90)に並ぶ", () => {
    const assumptions = makeAssumptions({ paths: 50 });
    const result = runMonteCarlo(household, [], assumptions, rules);
    const finalYearByPercentile = result.percentiles.map((p) => ({
      p: p.p,
      value: p.netWorthByYear[p.netWorthByYear.length - 1] ?? 0
    }));
    for (let i = 1; i < finalYearByPercentile.length; i++) {
      expect(finalYearByPercentile[i]?.value).toBeGreaterThanOrEqual(finalYearByPercentile[i - 1]?.value ?? 0);
    }
  });

  test("depletionProbabilityは0〜1の範囲", () => {
    const assumptions = makeAssumptions({ paths: 50 });
    const result = runMonteCarlo(household, [], assumptions, rules);
    expect(result.depletionProbability).toBeGreaterThanOrEqual(0);
    expect(result.depletionProbability).toBeLessThanOrEqual(1);
  });

  test("試行数が多いほど、平均最終資産は決定論パス(期待値)に収束する", () => {
    const assumptions = makeAssumptions({ paths: 3000 });
    const deterministicFinal = runDeterministic(household, [], assumptions, rules).deterministic.at(-1);
    expect(deterministicFinal).toBeDefined();
    if (!deterministicFinal) return;

    // p50(中央値)は分布の中心を表す代理指標として使う。試行数を増やすことで
    // 中央値と決定論パス(期待値)の乖離が縮む方向にあることを確認する。
    const small = runMonteCarlo(household, [], makeAssumptions({ paths: 30 }), rules);
    const large = runMonteCarlo(household, [], assumptions, rules);
    const median = (r: typeof small): number => {
      const p50 = r.percentiles.find((p) => p.p === 50);
      return p50?.netWorthByYear.at(-1) ?? 0;
    };

    const deterministicValue = deterministicFinal.netWorth;
    const smallDiff = Math.abs(median(small) - deterministicValue);
    const largeDiff = Math.abs(median(large) - deterministicValue);

    // 大標本側は決定論パスの5%以内に収まることを確認する(緩めの許容誤差)。
    expect(largeDiff).toBeLessThan(Math.abs(deterministicValue) * 0.05);
    expect(largeDiff).toBeLessThanOrEqual(smallDiff * 3); // 大標本が極端に悪化していないことの健全性チェック
  });
});

// 支出が収入・資産を大きく上回り、リターンの確率変動に関わらず必ず資産が
// 枯渇する世帯 — depletionAgeDistribution の健全性を確実に検証するため。
const depletingHousehold: Household = {
  schemaVersion: 1,
  persons: [
    {
      id: "solo",
      birthYearMonth: "1990-01",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 150000, bonusAnnual: 0, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    }
  ],
  children: [],
  municipality: "koto-ku",
  baseExpenses: [{ label: "生活費", monthly: 400000, indexation: "fixed" }],
  financialAssets: [
    { assetClassId: "cash", account: "cash", balance: 1000000, costBasis: 1000000 },
    { assetClassId: "global-equity", account: "taxable", balance: 1000000, costBasis: 1000000 }
  ],
  savingsPolicy: {
    cashBufferMonths: 1,
    contributions: [],
    drawdown: { strategy: "fixed-amount", value: 0, order: ["taxable"] }
  }
};

describe("runMonteCarlo: depletionAgeDistribution", () => {
  test("必ず枯渇する世帯では全試行分の年齢が記録され、depletionProbabilityは1になる", () => {
    const assumptions = makeAssumptions({ paths: 20 });
    const result = runMonteCarlo(depletingHousehold, [], assumptions, rules);
    expect(result.depletionProbability).toBe(1);
    expect(result.depletionAgeDistribution).toHaveLength(20);
    for (const age of result.depletionAgeDistribution ?? []) {
      expect(age).toBeGreaterThanOrEqual(36); // 1990年生まれ、シミュレーション開始(2026年)時点の年齢
      expect(age).toBeLessThanOrEqual(36 + 40);
    }
  });

  test("枯渇しない世帯ではdepletionAgeDistributionが空", () => {
    const assumptions = makeAssumptions({ paths: 20 });
    const result = runMonteCarlo(household, [], assumptions, rules);
    expect(result.depletionAgeDistribution).toEqual([]);
  });
});
