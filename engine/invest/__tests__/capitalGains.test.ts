import { describe, expect, test } from "vitest";
import type { CapitalGainsTaxRules } from "../../types/index.js";
import { computeCapitalGainsTax, withdrawFromTaxableAccount, type TaxableHolding } from "../capitalGains.js";

const rules: CapitalGainsTaxRules = {
  rate: 0.20315,
  _source: { url: "https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1463.htm", confirmedOn: "2026-07-20" }
};

describe("computeCapitalGainsTax", () => {
  test("含み益がある口座の全額取り崩しは評価益全体に課税される", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    // gain = 400,000; tax = floor(400,000 * 0.20315) = 81,260
    expect(computeCapitalGainsTax(1000000, holding, rules.rate)).toBe(81260);
  });

  test("部分的な取り崩しは平均取得費で按分した含み益にのみ課税される", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    // withdraw half: proportional cost basis = 300,000; gain = 200,000; tax = floor(200,000*0.20315) = 40,630
    expect(computeCapitalGainsTax(500000, holding, rules.rate)).toBe(40630);
  });

  test("含み損の口座は課税されない(マイナス課税にならない)", () => {
    const holding: TaxableHolding = { balance: 500000, costBasis: 800000 };
    expect(computeCapitalGainsTax(500000, holding, rules.rate)).toBe(0);
  });

  test("取得費と評価額が同額(損益ゼロ)なら課税されない", () => {
    const holding: TaxableHolding = { balance: 500000, costBasis: 500000 };
    expect(computeCapitalGainsTax(500000, holding, rules.rate)).toBe(0);
  });

  test("残高を超える取り崩し要求は残高で頭打ちにして計算する", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    expect(computeCapitalGainsTax(5000000, holding, rules.rate)).toBe(computeCapitalGainsTax(1000000, holding, rules.rate));
  });

  test("残高0の口座は課税されない(ゼロ除算にならない)", () => {
    const holding: TaxableHolding = { balance: 0, costBasis: 0 };
    expect(computeCapitalGainsTax(100000, holding, rules.rate)).toBe(0);
  });

  test("1円未満の端数は切り捨てる", () => {
    const holding: TaxableHolding = { balance: 3, costBasis: 1 };
    // gain = 3 - floor(1*3/3) = 3 - 1 = 2; tax = floor(2 * 0.20315) = 0 (0.4063 → 切り捨て)
    expect(computeCapitalGainsTax(3, holding, rules.rate)).toBe(0);
  });
});

describe("withdrawFromTaxableAccount", () => {
  test("課税後の手取りと残高・取得費の更新を返す", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    const result = withdrawFromTaxableAccount(500000, holding, rules.rate);

    expect(result.tax).toBe(40630);
    expect(result.netProceeds).toBe(500000 - 40630);
    // proportional cost basis removed = floor(600,000 * 500,000 / 1,000,000) = 300,000
    expect(result.updatedHolding).toEqual({ balance: 500000, costBasis: 300000 });
  });

  test("全額取り崩すと残高・取得費ともに0になる", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    const result = withdrawFromTaxableAccount(1000000, holding, rules.rate);
    expect(result.updatedHolding).toEqual({ balance: 0, costBasis: 0 });
  });

  test("残高を超える要求は残高で頭打ちし、残高超過分は取り崩されない", () => {
    const holding: TaxableHolding = { balance: 1000000, costBasis: 600000 };
    const result = withdrawFromTaxableAccount(5000000, holding, rules.rate);
    expect(result.updatedHolding.balance).toBe(0);
    expect(result.netProceeds).toBe(1000000 - result.tax);
  });

  test("含み損口座からの取り崩しは課税なしで全額が手取りになる", () => {
    const holding: TaxableHolding = { balance: 500000, costBasis: 800000 };
    const result = withdrawFromTaxableAccount(200000, holding, rules.rate);
    expect(result.tax).toBe(0);
    expect(result.netProceeds).toBe(200000);
  });

  test("残高0からの取り崩しは何も動かさない", () => {
    const holding: TaxableHolding = { balance: 0, costBasis: 0 };
    const result = withdrawFromTaxableAccount(100000, holding, rules.rate);
    expect(result).toEqual({ tax: 0, netProceeds: 0, updatedHolding: { balance: 0, costBasis: 0 } });
  });
});
