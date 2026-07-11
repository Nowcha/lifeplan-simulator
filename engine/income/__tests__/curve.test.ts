import { describe, expect, test } from "vitest";
import type { IncomePoint } from "../../types/index.js";
import { bonusAnnualAt, indexFactor, monthlyBaseAt } from "../curve.js";

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
    expect(indexFactor("fixed", 10, { inflation: 0.02, wage: 0.03 })).toBe(1);
  });

  test("wage は賃金上昇率で複利", () => {
    expect(indexFactor("wage", 2, { inflation: 0.02, wage: 0.03 })).toBeCloseTo(1.0609, 6);
  });

  test("inflation はインフレ率で複利", () => {
    expect(indexFactor("inflation", 1, { inflation: 0.02, wage: 0.03 })).toBeCloseTo(1.02, 6);
  });
});
