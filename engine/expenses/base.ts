/**
 * Base living expenses: expand BaseExpenseItem[] into annual amounts for a
 * given year, honoring activeFrom/activeTo windows and indexation.
 * `terminations` (label → HousingPurchaseEvent.yearMonth) implements
 * terminatesExpenseLabels (design doc §4 HousingPurchaseEvent): a rent item
 * whose label is terminated stops the month a home purchase closes,
 * regardless of its own activeTo.
 */

import type { BaseExpenseItem, Rate, Yen, YearMonth } from "../types/index.js";
import { indexFactor } from "../income/curve.js";
import { monthsActiveInYear } from "../util/yearmonth.js";

export interface ExpenseLine {
  category: string;
  amount: Yen;
}

export function annualBaseExpenses(
  items: BaseExpenseItem[],
  year: number,
  startYear: number,
  rates: { inflation: Rate; wage: Rate },
  terminations?: Map<string, YearMonth>
): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const item of items) {
    const months = monthsActiveInYear(year, item.activeFrom, item.activeTo, terminations?.get(item.label));
    if (months === 0) continue;
    const factor = indexFactor(item.indexation, year - startYear, rates);
    // Round the indexed monthly amount to integer yen, then multiply by months
    const monthly = Math.floor(item.monthly * factor);
    lines.push({ category: item.label, amount: monthly * months });
  }
  return lines;
}
