/**
 * Base living expenses: expand BaseExpenseItem[] into annual amounts for a
 * given year, honoring activeFrom/activeTo windows and indexation.
 * Event modifiers (rent termination on purchase etc.) are Phase 2.
 */

import type { BaseExpenseItem, Rate, Yen } from "../types/index.js";
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
  rates: { inflation: Rate; wage: Rate }
): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const item of items) {
    const months = monthsActiveInYear(year, item.activeFrom, item.activeTo);
    if (months === 0) continue;
    const factor = indexFactor(item.indexation, year - startYear, rates);
    // Round the indexed monthly amount to integer yen, then multiply by months
    const monthly = Math.floor(item.monthly * factor);
    lines.push({ category: item.label, amount: monthly * months });
  }
  return lines;
}
