import { describe, expect, test } from "vitest";
import { buildBaseRatePath } from "../baseRate.js";

describe("buildBaseRatePath (manual)", () => {
  const baseRate = {
    initial: 0.005,
    model: "manual" as const,
    manualPath: [
      { year: 2026, rate: 0.005 },
      { year: 2031, rate: 0.01 },
      { year: 2041, rate: 0.015 }
    ]
  };

  test("折れ点そのものの年は指定値をそのまま返す", () => {
    const path = buildBaseRatePath(baseRate, 2026, 2045);
    expect(path.get(2026)).toBe(0.005);
    expect(path.get(2031)).toBe(0.01);
    expect(path.get(2041)).toBe(0.015);
  });

  test("折れ点の間は線形補間する(2026→2031の中間2028.5相当を年粒度で確認)", () => {
    const path = buildBaseRatePath(baseRate, 2026, 2045);
    // 2028: (2028-2026)/(2031-2026) = 2/5 = 0.4
    expect(path.get(2028)).toBeCloseTo(0.005 + (0.01 - 0.005) * 0.4, 10);
  });

  test("最終折れ点より後は横ばい", () => {
    const path = buildBaseRatePath(baseRate, 2026, 2045);
    expect(path.get(2045)).toBe(0.015);
  });

  test("最初の折れ点がstartYearより後でも、それ以前は最初の値で横ばい", () => {
    const path = buildBaseRatePath(
      { initial: 0.02, model: "manual", manualPath: [{ year: 2030, rate: 0.02 }] },
      2026,
      2032
    );
    expect(path.get(2026)).toBe(0.02);
    expect(path.get(2029)).toBe(0.02);
  });

  test("manualPathが空配列でもinitialにフォールバックする(??はundefinedのみ捕捉しnullish以外の空配列を通さないので明示的に対処)", () => {
    const path = buildBaseRatePath({ initial: 0.02, model: "manual", manualPath: [] }, 2026, 2028);
    expect(path.get(2026)).toBe(0.02);
    expect(path.get(2028)).toBe(0.02);
  });
});

describe("buildBaseRatePath (mean-reverting)", () => {
  test("Vasicek型ドリフトの決定論パス(dr = speed×(longTermMean-r)、下限0)", () => {
    const baseRate = {
      initial: 0.01,
      model: "mean-reverting" as const,
      meanReversion: { speed: 0.5, longTermMean: 0.02, volatility: 0 }
    };
    const path = buildBaseRatePath(baseRate, 2026, 2029);
    expect(path.get(2026)).toBe(0.01);
    // r1 = 0.01 + 0.5*(0.02-0.01) = 0.015
    expect(path.get(2027)).toBeCloseTo(0.015, 10);
    // r2 = 0.015 + 0.5*(0.02-0.015) = 0.0175
    expect(path.get(2028)).toBeCloseTo(0.0175, 10);
  });

  test("下限0でクランプされる(長期平均が負でも0を下回らない)", () => {
    const baseRate = {
      initial: 0.01,
      model: "mean-reverting" as const,
      meanReversion: { speed: 1, longTermMean: -0.05, volatility: 0 }
    };
    const path = buildBaseRatePath(baseRate, 2026, 2028);
    expect(path.get(2027)).toBe(0);
    expect(path.get(2028)).toBe(0);
  });
});
