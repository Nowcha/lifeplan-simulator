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
