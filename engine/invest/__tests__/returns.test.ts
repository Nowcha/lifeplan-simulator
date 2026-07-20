import { describe, expect, test } from "vitest";
import type { Assumptions } from "../../types/index.js";
import { holdingKey, initHoldings } from "../holdings.js";
import { applyAnnualReturns, returnRateFor } from "../returns.js";

const assumptions: Assumptions = {
  simulation: { startYear: 2026, endAge: 65, paths: 1000, seed: 1 },
  inflation: { mean: 0.015, volatility: 0.01 },
  wageGrowth: { mean: 0.02, volatility: 0.012 },
  assetClasses: [
    { id: "global-equity", expectedReturn: 0.05, volatility: 0.18 },
    { id: "bonds", expectedReturn: 0.015, volatility: 0.05 }
  ],
  correlationMatrix: { factors: [], matrix: [] },
  baseRate: { initial: 0.005, model: "manual", manualPath: [] }
};

describe("returnRateFor", () => {
  test("assetClasses[].expectedReturnを返す", () => {
    expect(returnRateFor("global-equity", assumptions)).toBe(0.05);
  });

  test("deterministicOverrideがあればそちらを優先する", () => {
    const overridden: Assumptions = { ...assumptions, deterministicOverride: { "global-equity": 0.0 } };
    expect(returnRateFor("global-equity", overridden)).toBe(0.0);
  });

  test("未定義のassetClassIdは0を返す", () => {
    expect(returnRateFor("unknown-class", assumptions)).toBe(0);
  });

  test("injected(モンテカルロの当年実現値)はdeterministicOverrideより優先される", () => {
    const overridden: Assumptions = { ...assumptions, deterministicOverride: { "global-equity": 0.0 } };
    expect(returnRateFor("global-equity", overridden, -0.1)).toBe(-0.1);
  });
});

describe("applyAnnualReturns", () => {
  test("assetClassIdに応じたリターンを各holdingに適用する", () => {
    const holdings = initHoldings([
      { assetClassId: "global-equity", account: "taxable", balance: 1000000, costBasis: 800000 },
      { assetClassId: "bonds", account: "taxable", balance: 1000000, costBasis: 1000000 }
    ]);
    const next = applyAnnualReturns(holdings, assumptions);
    expect(next[holdingKey("taxable", "global-equity")]?.balance).toBe(1050000);
    expect(next[holdingKey("taxable", "bonds")]?.balance).toBe(1015000);
  });

  test("injectedByAssetClassが指定されたholdingのみそちらを使う", () => {
    const holdings = initHoldings([
      { assetClassId: "global-equity", account: "taxable", balance: 1000000, costBasis: 800000 },
      { assetClassId: "bonds", account: "taxable", balance: 1000000, costBasis: 1000000 }
    ]);
    const next = applyAnnualReturns(holdings, assumptions, { "global-equity": -0.2 });
    expect(next[holdingKey("taxable", "global-equity")]?.balance).toBe(800000);
    expect(next[holdingKey("taxable", "bonds")]?.balance).toBe(1015000); // 未注入なのでexpectedReturnのまま
  });
});
