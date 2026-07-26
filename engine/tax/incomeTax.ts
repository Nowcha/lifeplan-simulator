/**
 * National income tax for a salaried resident:
 * 合計所得 → 所得控除 (social insurance actual, iDeCo, basic, spouse/spouse-special, dependents)
 * → progressive brackets → 復興特別所得税 surtax → final 100-yen floor.
 */

import type { IncomeTaxRules, Rate, Yen } from "../types/index.js";
import { applyRate, floorTo, stepAmount } from "./rounding.js";
import { dependentDeductionTotal, type DependentInput } from "./dependents.js";
import { spouseDeduction } from "./spouse.js";

export interface IncomeTaxInput {
  /** 合計所得金額 (Phase 1: salary income only) */
  totalIncome: Yen;
  /** Actual social insurance paid in the year (社会保険料控除) */
  socialInsurancePaid: Yen;
  /** iDeCo contributions (小規模企業共済等掛金控除) */
  idecoAnnual?: Yen;
  /** Spouse's 合計所得金額; undefined = no spouse */
  spouseTotalIncome?: Yen;
  /** この納税者の扶養に入れる親族(扶養控除) */
  dependents?: readonly DependentInput[];
  rules: IncomeTaxRules;
}

export interface IncomeTaxResult {
  /** 課税所得 (floored to 1,000 yen) */
  taxableIncome: Yen;
  /** Final tax including surtax (floored to 100 yen) */
  tax: Yen;
  /** Marginal bracket rate (before surtax) — used for furusato nozei limit */
  marginalRate: Rate;
  deductions: {
    socialInsurance: Yen;
    ideco: Yen;
    basic: Yen;
    spouse: Yen;
    dependents: Yen;
    total: Yen;
  };
}

export function computeIncomeTax(input: IncomeTaxInput): IncomeTaxResult {
  const { totalIncome, socialInsurancePaid, rules } = input;
  const ideco = input.idecoAnnual ?? 0;
  const basic = stepAmount(rules.basicDeduction.steps, totalIncome);
  const spouse = spouseDeduction(
    totalIncome,
    input.spouseTotalIncome,
    rules.spouseDeduction,
    rules.spouseSpecialDeduction
  );
  const dependents = dependentDeductionTotal(input.dependents ?? [], rules.dependentDeduction);
  const totalDeductions = socialInsurancePaid + ideco + basic + spouse.amount + dependents;

  // 課税所得: floor to 1,000 yen
  const taxableIncome = floorTo(Math.max(0, totalIncome - totalDeductions), 1000);

  let marginalRate = 0;
  let baseTax = 0;
  for (const bracket of rules.brackets) {
    if (bracket.upTo === null || taxableIncome <= bracket.upTo) {
      marginalRate = bracket.rate;
      baseTax = Math.max(0, applyRate(taxableIncome, bracket.rate) - bracket.deduction);
      break;
    }
  }

  // 復興特別所得税を上乗せし、申告納税額として100円未満切捨て
  const tax = floorTo(applyRate(baseTax, 1 + rules.reconstructionSurtax), 100);

  return {
    taxableIncome,
    tax,
    marginalRate,
    deductions: {
      socialInsurance: socialInsurancePaid,
      ideco,
      basic,
      spouse: spouse.amount,
      dependents,
      total: totalDeductions
    }
  };
}
