import { describe, expect, test } from "vitest";
import type { AssetHolding } from "../../types/index.js";
import { accountTotals, applyReturns, contribute, holdingKey, initHoldings, proportionalCostBasis, withdraw } from "../holdings.js";

describe("initHoldings", () => {
  test("cash口座は除外する", () => {
    const assets: AssetHolding[] = [{ assetClassId: "cash", account: "cash", balance: 1000000, costBasis: 1000000 }];
    expect(initHoldings(assets)).toEqual({});
  });

  test("(account, assetClassId)ごとにholdingを作る", () => {
    const assets: AssetHolding[] = [
      { assetClassId: "global-equity", account: "nisa-tsumitate", balance: 2600000, costBasis: 2400000 },
      { assetClassId: "bonds", account: "taxable", balance: 500000, costBasis: 500000 }
    ];
    const holdings = initHoldings(assets);
    expect(holdings[holdingKey("nisa-tsumitate", "global-equity")]).toEqual({
      account: "nisa-tsumitate",
      assetClassId: "global-equity",
      balance: 2600000,
      costBasis: 2400000
    });
    expect(holdings[holdingKey("taxable", "bonds")]).toEqual({
      account: "taxable",
      assetClassId: "bonds",
      balance: 500000,
      costBasis: 500000
    });
  });

  test("同一(account, assetClassId)が複数あれば合算する", () => {
    const assets: AssetHolding[] = [
      { assetClassId: "global-equity", account: "taxable", balance: 100000, costBasis: 90000 },
      { assetClassId: "global-equity", account: "taxable", balance: 200000, costBasis: 150000 }
    ];
    const holdings = initHoldings(assets);
    expect(holdings[holdingKey("taxable", "global-equity")]).toEqual({
      account: "taxable",
      assetClassId: "global-equity",
      balance: 300000,
      costBasis: 240000
    });
  });
});

describe("accountTotals", () => {
  test("口座ごとの残高合計を返す", () => {
    const holdings = initHoldings([
      { assetClassId: "global-equity", account: "nisa-tsumitate", balance: 1000000, costBasis: 900000 },
      { assetClassId: "bonds", account: "nisa-tsumitate", balance: 500000, costBasis: 500000 },
      { assetClassId: "bonds", account: "taxable", balance: 300000, costBasis: 300000 }
    ]);
    expect(accountTotals(holdings)).toEqual({ "nisa-tsumitate": 1500000, taxable: 300000 });
  });

  test("holdingsが空なら空オブジェクトを返す", () => {
    expect(accountTotals({})).toEqual({});
  });
});

describe("contribute", () => {
  test("新規holdingを作成する(costBasis = 拠出額)", () => {
    const holdings = contribute({}, "taxable", "global-equity", 100000);
    expect(holdings[holdingKey("taxable", "global-equity")]).toEqual({
      account: "taxable",
      assetClassId: "global-equity",
      balance: 100000,
      costBasis: 100000
    });
  });

  test("既存holdingに積み増す", () => {
    const initial = contribute({}, "taxable", "global-equity", 100000);
    const next = contribute(initial, "taxable", "global-equity", 50000);
    expect(next[holdingKey("taxable", "global-equity")]).toEqual({
      account: "taxable",
      assetClassId: "global-equity",
      balance: 150000,
      costBasis: 150000
    });
  });

  test("0円以下の拠出は何もしない", () => {
    expect(contribute({}, "taxable", "global-equity", 0)).toEqual({});
    expect(contribute({}, "taxable", "global-equity", -100)).toEqual({});
  });

  test("元のholdings参照は変更しない(イミュータブル)", () => {
    const initial = contribute({}, "taxable", "global-equity", 100000);
    contribute(initial, "taxable", "global-equity", 50000);
    expect(initial[holdingKey("taxable", "global-equity")]?.balance).toBe(100000);
  });
});

describe("proportionalCostBasis", () => {
  test("平均取得費で按分する", () => {
    expect(proportionalCostBasis(500000, { balance: 1000000, costBasis: 600000 })).toBe(300000);
  });

  test("残高0ならゼロ除算せず0を返す", () => {
    expect(proportionalCostBasis(100000, { balance: 0, costBasis: 0 })).toBe(0);
  });
});

describe("withdraw", () => {
  test("残高・取得費を按分して減らす", () => {
    const holdings = contribute({}, "taxable", "global-equity", 1000000);
    const key = holdingKey("taxable", "global-equity");
    const result = withdraw(holdings, key, 400000);
    expect(result.withdrawn).toBe(400000);
    expect(result.costBasisRemoved).toBe(400000); // cost basis == balance here (no gain yet)
    expect(result.holdings[key]).toEqual({ account: "taxable", assetClassId: "global-equity", balance: 600000, costBasis: 600000 });
  });

  test("残高を超える要求は残高で頭打ちにする", () => {
    const holdings = contribute({}, "taxable", "global-equity", 500000);
    const key = holdingKey("taxable", "global-equity");
    const result = withdraw(holdings, key, 999999999);
    expect(result.withdrawn).toBe(500000);
    expect(result.holdings[key]?.balance).toBe(0);
  });

  test("存在しないkeyへの取り崩しは何もしない", () => {
    const result = withdraw({}, "taxable:global-equity", 100000);
    expect(result).toEqual({ holdings: {}, withdrawn: 0, costBasisRemoved: 0 });
  });
});

describe("applyReturns", () => {
  test("assetClassIdごとのリターン率を残高に適用する(取得費は変化しない)", () => {
    const holdings = initHoldings([
      { assetClassId: "global-equity", account: "taxable", balance: 1000000, costBasis: 800000 },
      { assetClassId: "bonds", account: "taxable", balance: 500000, costBasis: 500000 }
    ]);
    const rateFor = (assetClassId: string): number => (assetClassId === "global-equity" ? 0.05 : 0.01);
    const next = applyReturns(holdings, rateFor);
    expect(next[holdingKey("taxable", "global-equity")]).toEqual({
      account: "taxable",
      assetClassId: "global-equity",
      balance: 1050000,
      costBasis: 800000
    });
    expect(next[holdingKey("taxable", "bonds")]).toEqual({
      account: "taxable",
      assetClassId: "bonds",
      balance: 505000,
      costBasis: 500000
    });
  });

  test("マイナスのリターンで残高が減る", () => {
    const holdings = initHoldings([{ assetClassId: "global-equity", account: "taxable", balance: 1000000, costBasis: 800000 }]);
    const next = applyReturns(holdings, () => -0.1);
    expect(next[holdingKey("taxable", "global-equity")]?.balance).toBe(900000);
  });
});
