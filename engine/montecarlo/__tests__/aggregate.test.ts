import { describe, expect, test } from "vitest";
import { computeDepletionProbability, computePercentiles } from "../aggregate.js";

describe("computePercentiles", () => {
  test("試行数5・1年分のp50は中央値になる", () => {
    const byTrial = [[10], [20], [30], [40], [50]];
    const result = computePercentiles(byTrial, [50]);
    expect(result).toEqual([{ p: 50, netWorthByYear: [30] }]);
  });

  test("p10/p90は両端寄りの補間値になる", () => {
    const byTrial = [[0], [10], [20], [30], [40], [50], [60], [70], [80], [90]];
    const result = computePercentiles(byTrial, [10, 90]);
    // rank = p/100*(n-1) = 0.1*9=0.9 → interpolate between index0(0)とindex1(10) → 9
    expect(result[0]).toEqual({ p: 10, netWorthByYear: [9] });
    // rank = 0.9*9=8.1 → interpolate between index8(80)とindex9(90) → 81
    expect(result[1]).toEqual({ p: 90, netWorthByYear: [81] });
  });

  test("年ごとに独立して集計する(複数年)", () => {
    const byTrial = [
      [100, 200],
      [300, 400]
    ];
    const result = computePercentiles(byTrial, [50]);
    expect(result[0]?.netWorthByYear).toEqual([200, 300]);
  });

  test("試行数0なら空配列を返す", () => {
    expect(computePercentiles([], [50])).toEqual([{ p: 50, netWorthByYear: [] }]);
  });

  test("複数のパーセンタイルは昇順に対応する結果を返す", () => {
    const byTrial = [[10], [20], [30], [40], [50]];
    const result = computePercentiles(byTrial, [10, 50, 90]);
    expect(result.map((r) => r.p)).toEqual([10, 50, 90]);
    // p10とp90は単調に外側へ広がる
    expect(result[0]?.netWorthByYear[0]).toBeLessThanOrEqual(result[1]?.netWorthByYear[0] ?? 0);
    expect(result[1]?.netWorthByYear[0]).toBeLessThanOrEqual(result[2]?.netWorthByYear[0] ?? 0);
  });
});

describe("computeDepletionProbability", () => {
  test("いずれかの年でマイナスになった試行の割合を返す", () => {
    const byTrial = [
      [100, 200, 300], // never depleted
      [100, -50, 300], // depleted in year2
      [-10, 200, 300], // depleted in year1
      [100, 200, 300] // never depleted
    ];
    expect(computeDepletionProbability(byTrial)).toBe(0.5);
  });

  test("枯渇する試行が無ければ0", () => {
    expect(computeDepletionProbability([[100, 200], [300, 400]])).toBe(0);
  });

  test("全試行が枯渇すれば1", () => {
    expect(computeDepletionProbability([[-1], [-2]])).toBe(1);
  });

  test("試行が無ければ0", () => {
    expect(computeDepletionProbability([])).toBe(0);
  });
});
