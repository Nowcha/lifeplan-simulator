/**
 * モンテカルロ試行の集計(design doc §7 MonteCarloSummary)。
 * 入力は [試行][年インデックス] の二次元配列。
 */

import type { Yen } from "../types/index.js";

/** Linear-interpolation percentile (matches common statistics library conventions) of an already-sorted array */
function percentileOfSorted(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const rank = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerValue = sorted[lower] ?? 0;
  if (lower === upper) return lowerValue;
  const upperValue = sorted[upper] ?? 0;
  return lowerValue + (upperValue - lowerValue) * (rank - lower);
}

export type MonteCarloPercentile = 10 | 25 | 50 | 75 | 90;

/**
 * Per-year percentiles of netWorth across trials.
 * `byTrial[trial][yearIndex]` — all trials must share the same year count.
 */
export function computePercentiles(
  byTrial: Yen[][],
  percentiles: MonteCarloPercentile[]
): { p: MonteCarloPercentile; netWorthByYear: Yen[] }[] {
  const yearCount = byTrial[0]?.length ?? 0;

  return percentiles.map((p) => ({
    p,
    netWorthByYear: Array.from({ length: yearCount }, (_, yearIndex) => {
      const valuesThisYear = byTrial.map((trial) => trial[yearIndex] ?? 0).sort((a, b) => a - b);
      return Math.round(percentileOfSorted(valuesThisYear, p));
    })
  }));
}

/**
 * Fraction of trials whose liquid balance (cash + investable assets, design
 * doc §7: "現金+換金可能資産<0") drops below zero in ANY simulated year.
 */
export function computeDepletionProbability(byTrial: Yen[][]): number {
  if (byTrial.length === 0) return 0;
  const depletedCount = byTrial.filter((trial) => trial.some((v) => v < 0)).length;
  return depletedCount / byTrial.length;
}
