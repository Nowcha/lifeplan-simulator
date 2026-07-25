/**
 * 扶養控除 (dependent deduction), shared by income tax and resident tax.
 *
 * Ages are "age reached during the calendar year" (= age on Dec 31), which is
 * exactly the statutory reference date (前年12月31日の現況). Only children are
 * modeled as dependents — 老人扶養親族/同居老親等 are out of scope because the
 * household schema has no elderly dependents (design doc §8 4-1).
 *
 * The 合計所得金額 requirement for a dependent (62万円以下 from 令和8年分) is not
 * checked here: children carry no income in the model, so it always holds.
 */

import type { DependentDeductionRules, Yen } from "../types/index.js";

/** How many dependents fall in each deduction bracket (年少扶養親族 are in neither) */
export interface DependentCounts {
  general: number;
  specific: number;
}

export function classifyDependents(ages: readonly number[], rules: DependentDeductionRules): DependentCounts {
  let general = 0;
  let specific = 0;
  for (const age of ages) {
    if (age < rules.minAge) continue;
    if (age >= rules.specificFromAge && age <= rules.specificToAge) specific += 1;
    else general += 1;
  }
  return { general, specific };
}

/** Total 扶養控除 for the dependents attributed to one taxpayer */
export function dependentDeductionTotal(ages: readonly number[], rules: DependentDeductionRules): Yen {
  const { general, specific } = classifyDependents(ages, rules);
  return general * rules.general + specific * rules.specific;
}
