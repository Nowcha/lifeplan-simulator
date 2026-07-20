import { describe, expect, test } from "vitest";
import type { CapitalGainsTaxRules, SavingsPolicy } from "../../types/index.js";
import { contribute, holdingKey, type HoldingsState } from "../holdings.js";
import { applyDrawdown } from "../drawdown.js";

const cgtRules: CapitalGainsTaxRules = {
  rate: 0.20315,
  _source: { url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm", confirmedOn: "2026-07-20" }
};

const order: SavingsPolicy["drawdown"]["order"] = ["taxable", "nisa-growth", "nisa-tsumitate"];

function seedHoldings(): HoldingsState {
  let holdings: HoldingsState = {};
  // taxable holding with an unrealized gain (balance 1,000,000 / cost basis 600,000)
  holdings = { ...holdings, [holdingKey("taxable", "global-equity")]: { account: "taxable", assetClassId: "global-equity", balance: 1000000, costBasis: 600000 } };
  holdings = contribute(holdings, "nisa-growth", "global-equity", 800000);
  holdings = contribute(holdings, "nisa-tsumitate", "global-equity", 500000);
  return holdings;
}

describe("applyDrawdown", () => {
  test("orderの先頭(課税口座)から取り崩し、譲渡益課税を差し引く", () => {
    const holdings = seedHoldings();
    const result = applyDrawdown(order, 500000, holdings, cgtRules);
    // gain proportion = 500,000 - floor(600,000*500,000/1,000,000) = 500,000-300,000=200,000
    // tax = floor(200,000*0.20315) = 40,630
    expect(result.totalWithdrawn).toBe(500000);
    expect(result.capitalGainsTax).toBe(40630);
    expect(result.netProceeds).toBe(500000 - 40630);
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(500000);
    expect(result.soldNisaCostBasis).toEqual({ tsumitate: 0, growth: 0 });
  });

  test("課税口座だけで不足額を賄えなければ次のorder(nisa-growth)に進む", () => {
    const holdings = seedHoldings();
    const result = applyDrawdown(order, 1500000, holdings, cgtRules);
    // taxable fully drained (1,000,000), remaining 500,000 comes from nisa-growth (no tax)
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(0);
    expect(result.holdings[holdingKey("nisa-growth", "global-equity")]?.balance).toBe(300000);
    expect(result.totalWithdrawn).toBe(1500000);
    // NISA growth withdrawal cost basis proportion: 500,000 of 800,000 balance (cost basis == balance, no gain)
    expect(result.soldNisaCostBasis.growth).toBe(500000);
    expect(result.soldNisaCostBasis.tsumitate).toBe(0);
  });

  test("NISA口座からの取り崩しは非課税", () => {
    const holdings = contribute({}, "nisa-tsumitate", "global-equity", 500000);
    const result = applyDrawdown(["nisa-tsumitate"], 200000, holdings, cgtRules);
    expect(result.capitalGainsTax).toBe(0);
    expect(result.netProceeds).toBe(200000);
    expect(result.soldNisaCostBasis.tsumitate).toBe(200000);
  });

  test("全口座を使い切っても不足額に届かなければそこで終わる(超過取り崩ししない)", () => {
    const holdings = seedHoldings(); // total balance across accounts = 1,000,000 + 800,000 + 500,000 = 2,300,000
    const result = applyDrawdown(order, 5000000, holdings, cgtRules);
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(0);
    expect(result.holdings[holdingKey("nisa-growth", "global-equity")]?.balance).toBe(0);
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]?.balance).toBe(0);
    expect(result.totalWithdrawn).toBe(2300000);
  });

  test("capitalGainsTaxRulesが未定義なら課税口座も無税として扱う", () => {
    const holdings = seedHoldings();
    const result = applyDrawdown(["taxable"], 500000, holdings, undefined);
    expect(result.capitalGainsTax).toBe(0);
    expect(result.netProceeds).toBe(500000);
  });

  test("不足額が0以下なら何も取り崩さない", () => {
    const holdings = seedHoldings();
    const result = applyDrawdown(order, 0, holdings, cgtRules);
    expect(result.totalWithdrawn).toBe(0);
    expect(result.holdings).toEqual(holdings);
  });

  test("orderに含まれない口座からは取り崩さない", () => {
    const holdings = seedHoldings();
    const result = applyDrawdown(["nisa-growth"], 5000000, holdings, cgtRules);
    expect(result.holdings[holdingKey("taxable", "global-equity")]?.balance).toBe(1000000);
    expect(result.holdings[holdingKey("nisa-tsumitate", "global-equity")]?.balance).toBe(500000);
    expect(result.totalWithdrawn).toBe(800000);
  });
});
