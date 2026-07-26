import { describe, expect, test } from "vitest";
import type { IncomePoint } from "../../types/index.js";
import { bonusAnnualAt, indexFactor, monthlyBaseAt } from "../curve.js";
import { constantFactor, pathFactor } from "../../indexation.js";

const curve: IncomePoint[] = [
  { age: 30, monthlyBase: 300000, bonusAnnual: 900000, indexation: "wage" },
  { age: 40, monthlyBase: 400000, bonusAnnual: 1200000, indexation: "wage" },
  { age: 50, monthlyBase: 450000, bonusAnnual: 1400000, indexation: "wage" }
];

describe("収入カーブの補間", () => {
  test("折れ点上はそのままの値", () => {
    expect(monthlyBaseAt(curve, 40)).toBe(400000);
  });

  test("折れ点間は線形補間 (35歳 = 30歳と40歳の中間)", () => {
    expect(monthlyBaseAt(curve, 35)).toBe(350000);
    expect(bonusAnnualAt(curve, 35)).toBe(1050000);
  });

  test("範囲外はフラット外挿", () => {
    expect(monthlyBaseAt(curve, 25)).toBe(300000);
    expect(monthlyBaseAt(curve, 60)).toBe(450000);
  });
});

describe("indexation係数", () => {
  test("fixed は常に1", () => {
    expect(indexFactor("fixed", 10, { inflation: constantFactor(0.02), wage: constantFactor(0.03) })).toBe(1);
  });

  test("wage は賃金上昇率で複利", () => {
    expect(indexFactor("wage", 2, { inflation: constantFactor(0.02), wage: constantFactor(0.03) })).toBeCloseTo(1.0609, 6);
  });

  test("inflation はインフレ率で複利", () => {
    expect(indexFactor("inflation", 1, { inflation: constantFactor(0.02), wage: constantFactor(0.03) })).toBeCloseTo(1.02, 6);
  });
});

describe("indexFactorは決定論・確率どちらの累積でも同じ扱いをする", () => {
  test("確率パスの累積積をそのまま引く", () => {
    // 年次実現値が違っても、indexFactor 側は指標の選択だけを担う
    const factors = {
      inflation: pathFactor([0.01, 0.03]),
      wage: pathFactor([0.02, 0.04])
    };

    expect(indexFactor("inflation", 2, factors)).toBeCloseTo(1.01 * 1.03, 12);
    expect(indexFactor("wage", 2, factors)).toBeCloseTo(1.02 * 1.04, 12);
  });

  test("fixed は確率パスでも1倍のまま", () => {
    const factors = { inflation: pathFactor([0.5, 0.5]), wage: pathFactor([0.5, 0.5]) };

    expect(indexFactor("fixed", 2, factors)).toBe(1);
  });

  test("一定率を並べた確率パスは決定論と一致する", () => {
    const constant = { inflation: constantFactor(0.02), wage: constantFactor(0.02) };
    const asPath = { inflation: pathFactor([0.02, 0.02, 0.02]), wage: pathFactor([0.02, 0.02, 0.02]) };

    expect(indexFactor("inflation", 3, asPath)).toBeCloseTo(indexFactor("inflation", 3, constant), 10);
  });
});
