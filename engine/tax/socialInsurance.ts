/**
 * Social insurance premiums (employee share) for salaried workers:
 * health (Kyokai Kenpo or kumiai), long-term care (40-64), child support levy,
 * employees' pension, and employment insurance.
 *
 * Monthly premiums are computed on the 標準報酬月額 grade; bonuses on the
 * 標準賞与額 (floored to 1,000 yen) with statutory caps; employment insurance
 * on actual pay. All employee shares use the 50-sen rounding rule.
 */

import type { Rate, SocialInsuranceRules, Yen } from "../types/index.js";
import { applyRate, floorTo, roundEmployeeShare } from "./rounding.js";

/** Map an actual monthly pay to its 標準報酬月額 (health insurance grades 1..50) */
export function lookupStandardMonthly(monthlyPay: Yen, rules: SocialInsuranceRules): Yen {
  for (const row of rules.standardMonthlyTable) {
    if (row.to === null || monthlyPay < row.to) {
      return row.standard;
    }
  }
  // Unreachable if the table's last row has to === null
  const last = rules.standardMonthlyTable[rules.standardMonthlyTable.length - 1];
  if (last === undefined) throw new Error("standardMonthlyTable is empty");
  return last.standard;
}

/**
 * Pension standard monthly: same grade table clamped into pension grades 1..32.
 * (Below the health band containing 93,000 reads as 88,000; 635,000+ reads as 650,000.)
 */
export function pensionStandardMonthly(healthStandard: Yen, rules: SocialInsuranceRules): Yen {
  return Math.min(Math.max(healthStandard, rules.pensionStandardMin), rules.pensionStandardMax);
}

export interface PremiumBreakdown {
  health: Yen;
  care: Yen;
  childSupport: Yen;
  pension: Yen;
  total: Yen;
}

export interface MonthlyPremiumInput {
  monthlyPay: Yen;
  /** 介護保険第2号被保険者 (age 40-64) */
  isCareInsured: boolean;
  rules: SocialInsuranceRules;
  /** Employee-side health rate override for kumiai kenpo members */
  kumiaiEmployeeRate?: Rate;
}

/** Employee share of one month's health/care/child-support/pension premiums */
export function monthlyPremiums(input: MonthlyPremiumInput): PremiumBreakdown {
  const { monthlyPay, isCareInsured, rules, kumiaiEmployeeRate } = input;
  const standard = lookupStandardMonthly(monthlyPay, rules);
  const pensionStd = pensionStandardMonthly(standard, rules);

  const health =
    kumiaiEmployeeRate !== undefined
      ? roundEmployeeShare(applyRate(standard, kumiaiEmployeeRate))
      : roundEmployeeShare(applyRate(standard, rules.kyokaiKenpoRateTokyo) / 2);
  const care = isCareInsured ? roundEmployeeShare(applyRate(standard, rules.nursingCareRate) / 2) : 0;
  const childSupport = roundEmployeeShare(applyRate(standard, rules.childSupportLevyRate) / 2);
  const pension = roundEmployeeShare(applyRate(pensionStd, rules.pensionRate) / 2);

  return { health, care, childSupport, pension, total: health + care + childSupport + pension };
}

export interface BonusPremiumInput {
  bonusPayment: Yen;
  /** Sum of standard bonus amounts already counted toward the health-side annual cap */
  healthBonusCumulative: Yen;
  isCareInsured: boolean;
  rules: SocialInsuranceRules;
  kumiaiEmployeeRate?: Rate;
}

export interface BonusPremiumResult extends PremiumBreakdown {
  /** 標準賞与額 (bonus floored to 1,000 yen, before caps) */
  standardBonus: Yen;
}

/** Employee share of premiums on one bonus payment */
export function bonusPremiums(input: BonusPremiumInput): BonusPremiumResult {
  const { bonusPayment, healthBonusCumulative, isCareInsured, rules, kumiaiEmployeeRate } = input;
  // 標準賞与額: drop fractions below 1,000 yen
  const standardBonus = floorTo(bonusPayment, 1000);
  // Health/care/child-support share the annual (fiscal-year) cap of 5.73M
  const healthBase = Math.max(
    0,
    Math.min(standardBonus, rules.bonusCapHealthAnnual - healthBonusCumulative)
  );
  // Pension caps per payment month at 1.5M
  const pensionBase = Math.min(standardBonus, rules.bonusCapPensionMonthly);

  const health =
    kumiaiEmployeeRate !== undefined
      ? roundEmployeeShare(applyRate(healthBase, kumiaiEmployeeRate))
      : roundEmployeeShare(applyRate(healthBase, rules.kyokaiKenpoRateTokyo) / 2);
  const care = isCareInsured ? roundEmployeeShare(applyRate(healthBase, rules.nursingCareRate) / 2) : 0;
  const childSupport = roundEmployeeShare(applyRate(healthBase, rules.childSupportLevyRate) / 2);
  const pension = roundEmployeeShare(applyRate(pensionBase, rules.pensionRate) / 2);

  return { health, care, childSupport, pension, total: health + care + childSupport + pension, standardBonus };
}

/** Employment insurance employee share on actual pay (monthly pay or bonus) */
export function employmentInsurance(pay: Yen, rules: SocialInsuranceRules): Yen {
  return roundEmployeeShare(applyRate(pay, rules.employmentInsuranceEmployeeRate));
}
