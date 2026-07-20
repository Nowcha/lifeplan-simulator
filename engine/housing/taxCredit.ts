/**
 * 住宅ローン控除 (design doc §6 housingLoanTaxCredit, §8 手順4):
 * 控除額 = min(年末残高合計, 借入限度額) × 控除率, per borrower.
 *
 * ペアローンでは各名義人が自分の持ち分のローンの年末残高で個別に控除を
 * 計算する(借入限度額は名義人ごとにフルで適用— 世帯で分け合うのではなく、
 * 契約が2本という扱い)。
 */

import type { HousingLoanTaxCreditRules, HousingPurchaseEvent, Yen } from "../types/index.js";
import { applyRate } from "../tax/rounding.js";
import { parseYearMonth } from "../util/yearmonth.js";

/** Lookup key into rules.housingLoanTaxCredit.categories, or undefined if ineligible */
export function creditCategoryKey(event: HousingPurchaseEvent): string | undefined {
  const isNew = event.propertyType === "new-mansion" || event.propertyType === "new-house";
  if (event.taxCreditEligibility.category === "other" && isNew) return undefined;
  return `${event.taxCreditEligibility.category}-${isNew ? "new" : "used"}`;
}

/** This borrower's 住宅ローン控除 for `year`, or 0 if ineligible/out of window/income too high */
export function housingLoanCreditForYear(
  event: HousingPurchaseEvent,
  personLoanYearEndBalances: Yen[],
  year: number,
  personTotalIncome: Yen,
  rules: HousingLoanTaxCreditRules | undefined
): Yen {
  if (!rules || !event.taxCreditEligibility.eligible) return 0;
  if (personTotalIncome > rules.incomeLimitForYear) return 0;

  const key = creditCategoryKey(event);
  const category = key ? rules.categories[key] : undefined;
  if (!category) return 0;

  const purchaseYear = parseYearMonth(event.yearMonth).year;
  if (year < purchaseYear || year >= purchaseYear + category.years) return 0;

  const limit = event.taxCreditEligibility.hasChildOrYoungCouple
    ? category.borrowLimitWithChild
    : category.borrowLimitBase;
  const balance = personLoanYearEndBalances.reduce((sum, b) => sum + b, 0);

  return Math.floor(applyRate(Math.min(balance, limit), rules.rate));
}

/**
 * Split a candidate credit against this year's income tax first, then cap
 * the remainder at the statutory resident-tax spillover (総務省: 前年分の
 * 所得税の課税総所得金額等 × capRate, capped at capAmount). The spillover is
 * levied against NEXT year's resident tax (design doc §8 手順5 — resident
 * tax is always one year behind), so the caller carries `residentTaxSpillover`
 * forward the same way `pendingResidentTax` is carried.
 */
export function applyHousingCredit(
  candidateCredit: Yen,
  incomeTaxBeforeCredit: Yen,
  taxableIncome: Yen,
  rules: HousingLoanTaxCreditRules | undefined
): { incomeTaxAfterCredit: Yen; residentTaxSpillover: Yen } {
  const appliedToIncomeTax = Math.min(candidateCredit, incomeTaxBeforeCredit);
  const unused = candidateCredit - appliedToIncomeTax;
  if (unused <= 0 || !rules) {
    return { incomeTaxAfterCredit: incomeTaxBeforeCredit - appliedToIncomeTax, residentTaxSpillover: 0 };
  }
  const cap = Math.min(
    Math.floor(applyRate(taxableIncome, rules.residentTaxSpillover.capRate)),
    rules.residentTaxSpillover.capAmount
  );
  return {
    incomeTaxAfterCredit: incomeTaxBeforeCredit - appliedToIncomeTax,
    residentTaxSpillover: Math.min(unused, cap)
  };
}
