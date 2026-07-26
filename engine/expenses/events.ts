/**
 * Life-event expense modifiers (design doc §4 RecurringModifierEvent /
 * OneTimeEvent, §8 手順6):
 *  - RecurringModifierEvent: books `amount` every `intervalYears`
 *    (default: every year) starting at startYearMonth's year, up to
 *    `occurrences` times (default: unbounded — the simulation's endYear
 *    naturally caps it), indexed by `indexation`.
 *  - OneTimeEvent: books `amount` in the calendar year of `yearMonth`
 *    (positive = expense, negative = income, e.g. a gift).
 *
 * Both are annual-granularity expansions: since AnnualRow has no monthly
 * breakdown for expenses (design doc §7), only the calendar year of the
 * event's yearMonth matters, not the month itself.
 */

import type { OneTimeEvent, RecurringModifierEvent, Yen } from "../types/index.js";
import { indexFactor } from "../income/curve.js";
import type { IndexationFactors } from "../indexation.js";
import { parseYearMonth } from "../util/yearmonth.js";

export interface ExpenseLine {
  category: string;
  amount: Yen;
}

/** 0-based occurrence index of a recurring event in `year`, or undefined if it does not occur */
function occurrenceIndex(event: RecurringModifierEvent, year: number): number | undefined {
  const startYear = parseYearMonth(event.startYearMonth).year;
  if (year < startYear) return undefined;
  // Guard against non-positive intervalYears (invalid input): treat as annual.
  const interval = event.intervalYears !== undefined && event.intervalYears > 0 ? event.intervalYears : 1;
  const diff = year - startYear;
  if (diff % interval !== 0) return undefined;
  const index = diff / interval;
  if (event.occurrences !== undefined && index >= event.occurrences) return undefined;
  return index;
}

export function annualRecurringEvents(
  events: RecurringModifierEvent[],
  year: number,
  simulationStartYear: number,
  rates: Pick<IndexationFactors, "inflation" | "wage">
): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const event of events) {
    if (occurrenceIndex(event, year) === undefined) continue;
    const factor = indexFactor(event.indexation, year - simulationStartYear, rates);
    lines.push({ category: event.label, amount: Math.floor(event.amount * factor) });
  }
  return lines;
}

export function annualOneTimeEvents(events: OneTimeEvent[], year: number): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const event of events) {
    if (parseYearMonth(event.yearMonth).year !== year) continue;
    lines.push({ category: event.label, amount: event.amount });
  }
  return lines;
}
