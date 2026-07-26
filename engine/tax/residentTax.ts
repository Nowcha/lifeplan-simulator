/**
 * Resident tax (個人住民税, Tokyo 23 wards):
 * income levy 10% (city 6% + pref 4%) on prior-year income, adjustment credit
 * (調整控除), and per-capita levy incl. forest environment tax.
 *
 * The engine computes the tax amount FROM a given year's income; the pipeline
 * is responsible for levying it in the FOLLOWING year (design doc §8 step 5).
 *
 * 非課税限度額 (Tokyo 23 wards = 1級地) scales with the household headcount and
 * differs between the two levies: 均等割 uses a smaller addition than 所得割, so
 * there is a band where 均等割 is charged but 所得割 is not. Dependents under 16
 * earn no 扶養控除 yet still count toward the headcount (design doc §8 4-1).
 */

import type { ResidentTaxRules, Yen } from "../types/index.js";
import { applyRate, floorTo, stepAmount } from "./rounding.js";
import { spouseDeduction } from "./spouse.js";
import { classifyDependents, dependentDeductionTotal } from "./dependents.js";

export interface ResidentTaxInput {
  totalIncome: Yen;
  socialInsurancePaid: Yen;
  idecoAnnual?: Yen;
  spouseTotalIncome?: Yen;
  /** Ages (on Dec 31) of the dependents attributed to this taxpayer */
  dependentAges?: readonly number[];
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

const ZERO: Readonly<ResidentTaxResult> = Object.freeze({
  taxableIncome: 0,
  incomeLevy: 0,
  adjustmentCredit: 0,
  perCapita: 0,
  total: 0
});

/**
 * 非課税限度額. `headcount` is 本人 + 同一生計配偶者 + 扶養親族; the extra amount
 * only applies once the taxpayer has at least one of the latter two.
 */
export function nonTaxableThresholds(
  headcount: number,
  rules: ResidentTaxRules["nonTaxable"]
): { perCapita: Yen; incomeLevy: Yen } {
  const shared = rules.perPerson * headcount + rules.base;
  const hasOthers = headcount > 1;
  return {
    perCapita: shared + (hasOthers ? rules.addPerCapita : 0),
    incomeLevy: shared + (hasOthers ? rules.addIncomeLevy : 0)
  };
}

export function computeResidentTax(input: ResidentTaxInput): ResidentTaxResult {
  const { totalIncome, socialInsurancePaid, rules } = input;

  const ideco = input.idecoAnnual ?? 0;
  const basic = stepAmount(rules.basicDeduction.steps, totalIncome);
  const spouse = spouseDeduction(
    totalIncome,
    input.spouseTotalIncome,
    rules.spouseDeduction,
    rules.spouseSpecialDeduction
  );
  const dependentAges = input.dependentAges ?? [];
  const dependents = dependentDeductionTotal(dependentAges, rules.dependentDeduction);

  // 非課税判定: 均等割のしきい値の方が低いので、間に「均等割のみ課税」の帯がある
  const hasSameLivelihoodSpouse =
    input.spouseTotalIncome !== undefined && input.spouseTotalIncome <= rules.spouseDeduction.spouseIncomeMax;
  const headcount = 1 + (hasSameLivelihoodSpouse ? 1 : 0) + dependentAges.length;
  const thresholds = nonTaxableThresholds(headcount, rules.nonTaxable);

  if (totalIncome <= thresholds.perCapita) return ZERO;

  const perCapitaLevy = rules.perCapita.city + rules.perCapita.pref + rules.perCapita.forestEnvironmentTax;
  if (totalIncome <= thresholds.incomeLevy) {
    return { taxableIncome: 0, incomeLevy: 0, adjustmentCredit: 0, perCapita: perCapitaLevy, total: perCapitaLevy };
  }

  const taxableIncome = floorTo(
    Math.max(0, totalIncome - (socialInsurancePaid + ideco + basic + spouse.amount + dependents)),
    1000
  );

  // 調整控除: 人的控除差(基礎5万 + 配偶者5万/4万/2万 + 扶養 一般5万/特定18万)に基づく。
  // 配偶者控除の差は本人の合計所得金額で段階的に縮む(900万超で4万、950万超で2万)。
  const ac = rules.adjustmentCredit;
  const counts = classifyDependents(dependentAges, rules.dependentDeduction);
  let adjustmentCredit = 0;
  if (totalIncome <= ac.incomeLimit && taxableIncome > 0) {
    const gap =
      ac.basicDeductionGap +
      // 配偶者特別控除は人的控除額の差の対象外(全帯「適用無」)。配偶者控除のときだけ乗る
      (spouse.kind === "ordinary" && spouse.amount > 0 ? stepAmount(ac.spouseDeductionGap.steps, totalIncome) : 0) +
      counts.general * ac.generalDependentGap +
      counts.specific * ac.specificDependentGap;
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

  const incomeLevy = cityLevy + prefLevy;

  return {
    taxableIncome,
    incomeLevy,
    adjustmentCredit,
    perCapita: perCapitaLevy,
    total: incomeLevy + perCapitaLevy
  };
}
