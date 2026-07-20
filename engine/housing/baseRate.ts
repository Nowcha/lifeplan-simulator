/**
 * Deterministic base-rate path (design doc §5 Assumptions.baseRate, §8 手順7).
 *
 * The deterministic (Monte Carlo off) pipeline only needs the EXPECTED path:
 * - "manual": breakpoints are 折れ点 (kinks) of a piecewise-linear curve,
 *   same convention as income/curve.ts#interpolate — linear interpolation
 *   between breakpoints, flat extrapolation outside the range.
 * - "mean-reverting": Vasicek drift term only (dr = a(b-r)dt), the
 *   stochastic dW term is dropped since this is the expected-value path;
 *   floored at 0 per the design doc's model description.
 *
 * The path is precomputed once for the whole simulation because the
 * mean-reverting recursion is stateful (each year depends on the previous
 * year's rate), unlike the stateless per-year lookups used elsewhere in the
 * engine (income curve, expense indexation).
 */

import type { Assumptions, Rate } from "../types/index.js";

function interpolateManualPath(points: { year: number; rate: Rate }[], year: number): Rate {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (year <= first.year) return first.rate;
  if (year >= last.year) return last.rate;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === undefined || b === undefined) continue;
    if (year >= a.year && year <= b.year) {
      const t = (year - a.year) / (b.year - a.year);
      return a.rate + (b.rate - a.rate) * t;
    }
  }
  return last.rate;
}

/** Base rate for every year in [startYear, endYear], inclusive */
export function buildBaseRatePath(
  baseRate: Assumptions["baseRate"],
  startYear: number,
  endYear: number
): Map<number, Rate> {
  const path = new Map<number, Rate>();

  if (baseRate.model === "manual") {
    const points =
      baseRate.manualPath && baseRate.manualPath.length > 0
        ? baseRate.manualPath
        : [{ year: startYear, rate: baseRate.initial }];
    for (let year = startYear; year <= endYear; year++) {
      path.set(year, interpolateManualPath(points, year));
    }
    return path;
  }

  const mr = baseRate.meanReversion;
  let rate = baseRate.initial;
  for (let year = startYear; year <= endYear; year++) {
    path.set(year, rate);
    if (mr) rate = Math.max(0, rate + mr.speed * (mr.longTermMean - rate));
  }
  return path;
}
