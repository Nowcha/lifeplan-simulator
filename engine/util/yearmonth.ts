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

/**
 * Age reached during the calendar year (= age on Dec 31; documented
 * approximation shared by adult and child age calculations across the
 * engine — sub-year precision is not modeled since AnnualRow is annual).
 */
export function ageInYear(birthYearMonth: YearMonth, year: number): number {
  return year - parseYearMonth(birthYearMonth).year;
}

/** Absolute month ordinal (year * 12 + month - 1) for month arithmetic */
export function monthOrdinal(value: YearMonth): number {
  const { year, month } = parseYearMonth(value);
  return year * 12 + (month - 1);
}

/**
 * Ordinal of the last month ("YYYY-03") of the fiscal year in which the
 * person reaches `age` — i.e. the March containing the first March 31 on or
 * after the birthday. Used for 児童手当 / 018サポート style "◯歳到達後最初の
 * 年度末まで" eligibility windows.
 */
export function fiscalYearEndOrdinal(birthYearMonth: YearMonth, age: number): number {
  const birth = parseYearMonth(birthYearMonth);
  const reachedYear = birth.year + age;
  const endYear = birth.month >= 4 ? reachedYear + 1 : reachedYear;
  return endYear * 12 + (3 - 1);
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
