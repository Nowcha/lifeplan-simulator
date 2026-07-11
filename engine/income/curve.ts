/**
 * Income curve: age breakpoints with linear interpolation in between,
 * flat extrapolation outside the defined range (design doc §3).
 * Indexation (wage growth) is applied by the caller via indexFactor.
 */

import type { Indexation, IncomePoint, Rate, Yen } from "../types/index.js";

function interpolate(points: IncomePoint[], age: number, pick: (p: IncomePoint) => Yen): Yen {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a.age - b.age);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (age <= first.age) return pick(first);
  if (age >= last.age) return pick(last);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (a === undefined || b === undefined) continue;
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return Math.floor(pick(a) + (pick(b) - pick(a)) * t);
    }
  }
  return pick(last);
}

export function monthlyBaseAt(points: IncomePoint[], age: number): Yen {
  return interpolate(points, age, (p) => p.monthlyBase);
}

export function bonusAnnualAt(points: IncomePoint[], age: number): Yen {
  return interpolate(points, age, (p) => p.bonusAnnual);
}

/** Indexation mode of the curve segment governing this age (last point at or before) */
export function indexationAt(points: IncomePoint[], age: number): Indexation {
  if (points.length === 0) return "fixed";
  const sorted = [...points].sort((a, b) => a.age - b.age);
  let current = sorted[0];
  if (current === undefined) return "fixed";
  for (const p of sorted) {
    if (p.age <= age) current = p;
  }
  return current.indexation;
}

/** Deterministic compounding factor for an indexation mode after `yearsElapsed` years */
export function indexFactor(
  indexation: Indexation,
  yearsElapsed: number,
  rates: { inflation: Rate; wage: Rate }
): number {
  if (indexation === "fixed" || yearsElapsed <= 0) return 1;
  const rate = indexation === "wage" ? rates.wage : rates.inflation;
  return Math.pow(1 + rate, yearsElapsed);
}
