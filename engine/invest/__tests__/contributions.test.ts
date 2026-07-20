import { describe, expect, test } from "vitest";
import type { NisaRules, SavingsPolicy } from "../../types/index.js";
import { holdingKey } from "../holdings.js";
import { applyContributions } from "../contributions.js";
import type { NisaState } from "../nisa.js";

const nisaRules: NisaRules = {
  lifetimeCap: 18000000,
  growthLifetimeCap: 12000000,
  annualTsumitate: 1200000,
  annualGrowth: 2400000,
  quotaRestoration: "next-year-cost-basis",
  _source: { url: "https://www.fsa.go.jp/policy/nisa2/know/index.html", confirmedOn: "2026-07-20" }
};

const emptyNisa: NisaState = { lifetimeUsed: 0, growthUsed: 0 };

const policy: SavingsPolicy["contributions"] = [
  { account: "nisa-tsumitate", monthlyCap: 100000, assetClassId: "global-equity" },
  { account: "nisa-growth", monthlyCap: 100000, assetClassId: "global-equity" },
  { account: "taxable", monthlyCap: 500000, assetClassId: "global-equity" }
];

describe("applyContributions", () => {
  test("余剰資金を優先順位どおりに配分する(各行の年間上限まで)", () => {
    const result = applyContributions(policy, 5000000, {}, emptyNisa, nisaRules);
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]?.balance).toBe(1200000);
    expect(result.holdings[holdingKey("nisa-growth", "global-equity")]?.balance).toBe(1200000);
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(2600000);
    expect(result.totalContributed).toBe(5000000);
  });

  test("余剰資金が不足していれば途中の行までしか配分されない", () => {
    const result = applyContributions(policy, 1500000, {}, emptyNisa, nisaRules);
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]?.balance).toBe(1200000);
    expect(result.holdings[holdingKey("nisa-growth", "global-equity")]?.balance).toBe(300000);
    expect(result.holdings[holdingKey("taxable", "global-equity")]).toBeUndefined();
    expect(result.totalContributed).toBe(1500000);
  });

  test("NISA生涯枠の残りが少なければそこでキャップされる", () => {
    const nearFull: NisaState = { lifetimeUsed: 17900000, growthUsed: 0 };
    const result = applyContributions(policy, 5000000, {}, nearFull, nisaRules);
    // lifetime room = 100,000 → tsumitate gets capped there, nothing left for growth/taxable via NISA path
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]?.balance).toBe(100000);
    expect(result.nisaState.lifetimeUsed).toBe(18000000);
  });

  test("nisaRulesが未定義ならNISA口座への拠出は0円、課税口座は影響を受けない", () => {
    const result = applyContributions(policy, 5000000, {}, emptyNisa, undefined);
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]).toBeUndefined();
    expect(result.holdings[holdingKey("nisa-growth", "global-equity")]).toBeUndefined();
    // NISA contributions are skipped entirely, so the full surplus flows to the next rule (taxable)
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(5000000);
    expect(result.nisaState).toEqual(emptyNisa);
  });

  test("余剰資金が0以下なら何も配分しない", () => {
    expect(applyContributions(policy, 0, {}, emptyNisa, nisaRules).totalContributed).toBe(0);
    expect(applyContributions(policy, -1000, {}, emptyNisa, nisaRules).totalContributed).toBe(0);
  });

  test("nisaAnnualUsedは今年拠出した分だけを反映する", () => {
    const result = applyContributions(policy, 5000000, {}, emptyNisa, nisaRules);
    expect(result.nisaAnnualUsed).toEqual({ tsumitate: 1200000, growth: 1200000 });
  });

  test("既存holdingsに積み増す(初期値を破壊しない)", () => {
    const initialHoldings = { [holdingKey("taxable", "global-equity")]: { account: "taxable" as const, assetClassId: "global-equity", balance: 1000000, costBasis: 800000 } };
    const result = applyContributions(policy, 5000000, initialHoldings, emptyNisa, nisaRules);
    expect(result.holdings[holdingKey("taxable", "global-equity")]).toEqual({
      account: "taxable",
      assetClassId: "global-equity",
      balance: 1000000 + 2600000,
      costBasis: 800000 + 2600000
    });
    expect(initialHoldings[holdingKey("taxable", "global-equity")]?.balance).toBe(1000000);
  });
});
