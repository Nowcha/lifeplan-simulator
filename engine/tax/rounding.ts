import type { Yen } from "../types/index.js";

/**
 * Multiply integer yen by a decimal rate using parts-per-million integer
 * arithmetic. Statutory rates have at most 4 decimal places (e.g. 0.0985),
 * so ppm is exact; this avoids binary floating-point drift right at the
 * .5-sen rounding boundaries (e.g. 830,000 x 0.0985 / 2 must be exactly
 * 40,877.5, not 40,877.500000000004).
 */
export function applyRate(amount: Yen, rate: number): number {
  const ppm = Math.round(rate * 1_000_000);
  return (amount * ppm) / 1_000_000;
}

/**
 * Employee-share rounding for social insurance premiums deducted from pay:
 * fractions of 50 sen or less are dropped, more than 50 sen rounds up.
 * Basis: kenpo premium table note (1) — 事業主が給与から控除する場合.
 */
export function roundEmployeeShare(value: number): Yen {
  const floored = Math.floor(value);
  return value - floored > 0.5 ? floored + 1 : floored;
}

/** Floor to a unit (e.g. 1000 for taxable income, 100 for final tax) */
export function floorTo(value: number, unit: number): Yen {
  return Math.floor(value / unit) * unit;
}

/**
 * One rung of an income-indexed step ladder. Tables indexed on the taxpayer's
 * own 合計所得金額 while *also* involving a second person's income (配偶者控除 and
 * its 調整控除 gap) name the bound `ownerIncomeUpTo` so the reader cannot mistake
 * it for the spouse's income; single-income tables (基礎控除) use `incomeUpTo`.
 */
export type IncomeStep =
  | { incomeUpTo: Yen | null; amount: Yen }
  | { ownerIncomeUpTo: Yen | null; amount: Yen };

/**
 * Look up the amount for an income-indexed step ladder (e.g. 基礎控除,
 * 配偶者控除 tables): returns the amount for the first step whose upper bound
 * is null (no upper bound) or >= income, and 0 if no step matches.
 */
export function stepAmount(steps: readonly IncomeStep[], income: Yen): Yen {
  for (const step of steps) {
    const upTo = "incomeUpTo" in step ? step.incomeUpTo : step.ownerIncomeUpTo;
    if (upTo === null || income <= upTo) return step.amount;
  }
  return 0;
}
