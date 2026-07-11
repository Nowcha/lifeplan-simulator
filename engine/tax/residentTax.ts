/**
 * Resident tax (個人住民税, Tokyo 23 wards):
 * income levy 10% (city 6% + pref 4%) on prior-year income, adjustment credit
 * (調整控除), and per-capita levy incl. forest environment tax.
 *
 * The engine computes the tax amount FROM a given year's income; the pipeline
 * is responsible for levying it in the FOLLOWING year (design doc §8 step 5).
 *
 * Phase 1 simplification: the non-taxation threshold uses the single-filer
 * amount only (dependent-based thresholds are a Phase 2 TODO).
 */

import type { ResidentTaxRules, Yen } from "../types/index.js";
import { applyRate, floorTo } from "./rounding.js";
import { spouseDeductionAmount } from "./incomeTax.js";

export interface ResidentTaxInput {
  totalIncome: Yen;
  socialInsurancePaid: Yen;
  idecoAnnual?: Yen;
  spouseTotalIncome?: Yen;
  rules: ResidentTaxRules;
}

export interface ResidentTaxResult {
  taxableIncome: Yen;
  /** 所得割 after adjustment credit (city + pref, each floored to 100 yen) */
  incomeLevy: Yen;
  adjustmentCredit: Yen;
  perCapita: Yen;
  total: Yen;
}

const ZERO: ResidentTaxResult = {
  taxableIncome: 0,
  incomeLevy: 0,
  adjustmentCredit: 0,
  perCapita: 0,
  total: 0
};

function stepAmount(steps: { incomeUpTo: Yen | null; amount: Yen }[], income: Yen): Yen {
  for (const step of steps) {
    if (step.incomeUpTo === null || income <= step.incomeUpTo) return step.amount;
  }
  return 0;
}

export function computeResidentTax(input: ResidentTaxInput): ResidentTaxResult {
  const { totalIncome, socialInsurancePaid, rules } = input;

  // 非課税判定 (Phase 1: 単身の均等割・所得割非課税限度)
  if (totalIncome <= rules.nonTaxableIncomeSingle) return ZERO;

  const ideco = input.idecoAnnual ?? 0;
  const basic = stepAmount(rules.basicDeduction.steps, totalIncome);
  const spouse = spouseDeductionAmount(totalIncome, input.spouseTotalIncome, rules.spouseDeduction);
  const taxableIncome = floorTo(
    Math.max(0, totalIncome - (socialInsurancePaid + ideco + basic + spouse)),
    1000
  );

  // 調整控除: 人的控除差(基礎5万 + 配偶者5万)に基づく
  const ac = rules.adjustmentCredit;
  let adjustmentCredit = 0;
  if (totalIncome <= ac.incomeLimit && taxableIncome > 0) {
    const gap = ac.basicDeductionGap + (spouse > 0 ? ac.spouseDeductionGap : 0);
    const rateTotal = ac.rateCity + ac.ratePref;
    if (taxableIncome <= ac.threshold) {
      adjustmentCredit = Math.floor(applyRate(Math.min(gap, taxableIncome), rateTotal));
    } else {
      const shrunk = gap - (taxableIncome - ac.threshold);
      adjustmentCredit = Math.max(Math.floor(applyRate(shrunk, rateTotal)), ac.minimum);
    }
  }
  // Split the credit at the statutory city:pref ratio (3%:2%)
  const creditCity = Math.round(
    (adjustmentCredit * ac.rateCity) / (ac.rateCity + ac.ratePref)
  );
  const creditPref = adjustmentCredit - creditCity;

  // 所得割: 市区町村民税と道府県民税を別々に100円未満切捨て
  const cityLevy = Math.max(0, floorTo(applyRate(taxableIncome, rules.cityRate) - creditCity, 100));
  const prefLevy = Math.max(0, floorTo(applyRate(taxableIncome, rules.prefRate) - creditPref, 100));

  const perCapita = rules.perCapita.city + rules.perCapita.pref + rules.perCapita.forestEnvironmentTax;
  const incomeLevy = cityLevy + prefLevy;

  return { taxableIncome, incomeLevy, adjustmentCredit, perCapita, total: incomeLevy + perCapita };
}
