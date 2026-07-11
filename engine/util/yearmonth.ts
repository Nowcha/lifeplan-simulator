import type { YearMonth } from "../types/index.js";

export interface YM {
  year: number;
  month: number;
}

export function parseYearMonth(value: YearMonth): YM {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid YearMonth: "${value}" (expected "YYYY-MM")`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid month in YearMonth: "${value}"`);
  return { year, month };
}

/** Number of months of `year` inside the inclusive window [from, to] */
export function monthsActiveInYear(
  year: number,
  from: YearMonth | undefined,
  to: YearMonth | undefined
): number {
  let first = 1;
  let last = 12;
  if (from !== undefined) {
    const f = parseYearMonth(from);
    if (f.year > year) return 0;
    if (f.year === year) first = f.month;
  }
  if (to !== undefined) {
    const t = parseYearMonth(to);
    if (t.year < year) return 0;
    if (t.year === year) last = t.month;
  }
  return Math.max(0, last - first + 1);
}
