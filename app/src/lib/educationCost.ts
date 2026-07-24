/**
 * 教育プランの各段階について、選択中の内容から概算年額費用を組み立てる(表示専用)。
 * 数値は rules/2026.json(保育料)・rules/education-costs.json(学習費・大学納付金)から
 * そのまま読む — ここでハードコードはしない。実際のシミュレーション計算は
 * engine/expenses/education.ts が担う(このモジュールはUIのプレビュー表示のみ)。
 */
import type { RuleSet } from "../../../engine/types/index.js";
import { formatManYen } from "./format";

export type NurseryValue = "hoikuen" | "kindergarten-public" | "kindergarten-private" | "none";
export type SchoolValue = "public" | "private";
export type UniversityValue = "national" | "private-liberal" | "private-science" | "none";
export type UniversityHousingValue = "home" | "boarding";

export function nurseryCostHint(rules: RuleSet, value: NurseryValue): string | undefined {
  if (value === "none") return undefined;
  if (value === "hoikuen") {
    const c = rules.childBenefits?.childcareCost;
    if (!c) return undefined;
    const annual = (c.authorizedNurseryMonthly + c.mealCostMonthlyEstimate) * 12;
    return `目安 年額${formatManYen(annual)}(保育料+副食費)`;
  }
  const costs = rules.educationCosts?.school.kindergarten;
  if (!costs) return undefined;
  const annual = value === "kindergarten-private" ? costs.private.annual : costs.public.annual;
  return `目安 年額${formatManYen(annual)}`;
}

export function schoolStageCostHint(
  rules: RuleSet,
  stage: "elementary" | "juniorHigh" | "highSchool",
  value: SchoolValue
): string | undefined {
  const costs = rules.educationCosts?.school[stage];
  if (!costs) return undefined;
  const annual = value === "private" ? costs.private.annual : costs.public.annual;
  return `目安 年額${formatManYen(annual)}`;
}

export function universityCostHint(
  rules: RuleSet,
  university: UniversityValue,
  housing: UniversityHousingValue
): string | undefined {
  if (university === "none") return undefined;
  const costs = rules.educationCosts?.university;
  if (!costs) return undefined;
  const uni =
    university === "national" ? costs.national : university === "private-liberal" ? costs.privateLiberal : costs.privateScience;
  const boardingAnnual = housing === "boarding" ? costs.boardingAllowanceMonthly * 12 : 0;
  const annualTotal = uni.annualTuition + uni.facilityFeeAnnual + boardingAnnual;
  const boardingNote = boardingAnnual > 0 ? "・仕送り込み" : "";
  return `目安 入学金${formatManYen(uni.admissionFee)}+年額${formatManYen(annualTotal)}(在学中${boardingNote})`;
}
