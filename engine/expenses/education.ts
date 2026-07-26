/**
 * EducationPlan expansion (design doc §4 EducationPlan, §8 手順6).
 *
 * Stage age bands (year-granularity approximation, see util/yearmonth#ageInYear):
 *   nursery/kindergarten 3-5, elementary 6-11, juniorHigh 12-14,
 *   highSchool 15-17, university 18-21 (admission fee at 18 only).
 *
 * Ages 0-2 are intentionally not itemized here: Tokyo's childcare model
 * (rules/2026.json childBenefits.childcareCost, model "tokyo-free-0to5")
 * makes authorized-nursery fees 0 yen for that range, so there is nothing
 * to book. From age 3, hoikuen still carries a real 副食費 (meal cost).
 *
 * Education-cost inflation is a distinct indexation factor from general CPI
 * (rules/education-costs.json "indexation" field, EducationIndexation type).
 * Phase 2 supplies it as a deterministic fixed value via the same
 * `deterministicOverride` mechanism used for inflation/wage (see
 * pipeline.ts `deterministicRates`).
 */

import type { ChildcareCostRules, EducationCosts, EducationIndexation, EducationPlan, UniversityCost, Yen, YearMonth } from "../types/index.js";
import { ageInYear, parseYearMonth } from "../util/yearmonth.js";
import type { ExpenseLine } from "./events.js";

export interface ChildEducationInput {
  childId: string;
  birthYearMonth: YearMonth;
  /** Undefined when no matching "education" event exists for this child */
  plan: EducationPlan | undefined;
  /** 合計所得金額(年額)。教育費には影響せず、扶養控除の判定にのみ使う */
  annualIncome?: Yen | undefined;
}

import type { IndexationFactors } from "../indexation.js";

type EducationRates = IndexationFactors;

interface AgeRange {
  from: number;
  to: number;
}

const NURSERY_AGE: AgeRange = { from: 3, to: 5 };
const ELEMENTARY_AGE: AgeRange = { from: 6, to: 11 };
const JUNIOR_HIGH_AGE: AgeRange = { from: 12, to: 14 };
const HIGH_SCHOOL_AGE: AgeRange = { from: 15, to: 17 };
const UNIVERSITY_AGE: AgeRange = { from: 18, to: 21 };

function inRange(age: number, range: AgeRange): boolean {
  return age >= range.from && age <= range.to;
}

/** Same compounding rule as income/curve#indexFactor, extended with the 'education' mode */
function educationIndexFactor(
  indexation: EducationIndexation,
  yearsElapsed: number,
  rates: EducationRates
): number {
  if (indexation === "fixed" || yearsElapsed <= 0) return 1;
  return indexation === "education" ? rates.education(yearsElapsed) : rates.inflation(yearsElapsed);
}

function universityCostFor(costs: EducationCosts, university: "national" | "private-liberal" | "private-science"): UniversityCost {
  if (university === "national") return costs.university.national;
  if (university === "private-liberal") return costs.university.privateLiberal;
  return costs.university.privateScience;
}

/** Annual nursery/kindergarten cost (yen, before indexation), or undefined if not applicable */
function nurseryKindergartenAnnualCost(
  plan: EducationPlan,
  educationCosts: EducationCosts | undefined,
  childcareCost: ChildcareCostRules | undefined
): Yen | undefined {
  const nursery = plan.stages.nursery;
  if (nursery === "none") return undefined;
  if (nursery === "hoikuen") {
    if (!childcareCost) return undefined;
    return (childcareCost.authorizedNurseryMonthly + childcareCost.mealCostMonthlyEstimate) * 12;
  }
  if (!educationCosts) return undefined;
  return nursery === "kindergarten-private"
    ? educationCosts.school.kindergarten.private.annual
    : educationCosts.school.kindergarten.public.annual;
}

function schoolStageLines(
  plan: EducationPlan,
  age: number,
  educationCosts: EducationCosts | undefined,
  childcareCost: ChildcareCostRules | undefined,
  factor: number,
  label: (suffix: string) => string
): ExpenseLine[] {
  if (inRange(age, NURSERY_AGE)) {
    const annual = nurseryKindergartenAnnualCost(plan, educationCosts, childcareCost);
    if (annual === undefined) return [];
    return [{ category: label("保育園/幼稚園"), amount: Math.floor(annual * factor) }];
  }
  if (!educationCosts) return [];
  if (inRange(age, ELEMENTARY_AGE)) {
    const annual =
      plan.stages.elementary === "private"
        ? educationCosts.school.elementary.private.annual
        : educationCosts.school.elementary.public.annual;
    return [{ category: label("小学校"), amount: Math.floor(annual * factor) }];
  }
  if (inRange(age, JUNIOR_HIGH_AGE)) {
    const annual =
      plan.stages.juniorHigh === "private"
        ? educationCosts.school.juniorHigh.private.annual
        : educationCosts.school.juniorHigh.public.annual;
    return [{ category: label("中学校"), amount: Math.floor(annual * factor) }];
  }
  if (inRange(age, HIGH_SCHOOL_AGE)) {
    const annual =
      plan.stages.highSchool === "private"
        ? educationCosts.school.highSchool.private.annual
        : educationCosts.school.highSchool.public.annual;
    return [{ category: label("高校"), amount: Math.floor(annual * factor) }];
  }
  return [];
}

function universityLines(
  plan: EducationPlan,
  age: number,
  educationCosts: EducationCosts | undefined,
  factor: number,
  label: (suffix: string) => string
): ExpenseLine[] {
  if (!educationCosts || plan.stages.university === "none" || !inRange(age, UNIVERSITY_AGE)) return [];
  const uni = universityCostFor(educationCosts, plan.stages.university);
  const lines: ExpenseLine[] = [];
  if (age === UNIVERSITY_AGE.from) {
    lines.push({ category: label("大学入学金"), amount: Math.floor(uni.admissionFee * factor) });
  }
  lines.push({
    category: label("大学授業料"),
    amount: Math.floor((uni.annualTuition + uni.facilityFeeAnnual) * factor)
  });
  if (plan.stages.universityHousing === "boarding") {
    lines.push({
      category: label("大学仕送り"),
      amount: Math.floor(educationCosts.university.boardingAllowanceMonthly * 12 * factor)
    });
  }
  return lines;
}

function extracurricularLines(
  plan: EducationPlan,
  age: number,
  rates: EducationRates,
  yearsElapsed: number,
  label: (suffix: string) => string
): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  // Discretionary top-up amounts are declared directly in the plan (not sourced
  // from the education-costs table), so they track general inflation rather
  // than the education-specific rate.
  const factor = educationIndexFactor("inflation", yearsElapsed, rates);
  for (const entry of plan.extracurricularMonthly ?? []) {
    if (age < entry.fromAge || age > entry.toAge) continue;
    lines.push({ category: label("習い事"), amount: Math.floor(entry.amount * 12 * factor) });
  }
  return lines;
}

export function annualEducationExpenses(
  children: ChildEducationInput[],
  year: number,
  simulationStartYear: number,
  rates: EducationRates,
  educationCosts: EducationCosts | undefined,
  childcareCost: ChildcareCostRules | undefined
): ExpenseLine[] {
  const yearsElapsed = year - simulationStartYear;
  const eduIndexation = educationCosts?.indexation ?? "inflation";
  const eduFactor = educationIndexFactor(eduIndexation, yearsElapsed, rates);

  const lines: ExpenseLine[] = [];
  for (const child of children) {
    if (year < parseYearMonth(child.birthYearMonth).year) continue;
    const plan = child.plan;
    if (!plan) continue;
    const age = ageInYear(child.birthYearMonth, year);
    const label = (suffix: string): string => `教育費(${child.childId}・${suffix})`;

    lines.push(...schoolStageLines(plan, age, educationCosts, childcareCost, eduFactor, label));
    lines.push(...universityLines(plan, age, educationCosts, eduFactor, label));
    lines.push(...extracurricularLines(plan, age, rates, yearsElapsed, label));
  }
  return lines;
}
