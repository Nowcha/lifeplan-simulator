/**
 * 扶養控除 (dependent deduction), shared by income tax and resident tax.
 *
 * 年齢はその年の12/31時点(= `ageInYear`)で判定する。統計上の基準日そのもの。
 * 対象は `household.children` と `household.dependents`(子以外の被扶養親族)。
 * 金額は所得税と住民税で違うが、区分の判定は共通なのでここに集約する
 * (design doc §8 4-1)。
 */

import type {
  DependentDeductionRules,
  SpecificRelativeSpecialDeductionRules,
  Yen
} from "../types/index.js";
import { stepAmount } from "./rounding.js";

/** 控除の区分。年少(16歳未満)と所得要件超過はどの区分にも入らない。 */
export type DependentCategory = "general" | "specific" | "elderly" | "coResidentElderly";

/** 扶養親族1人分の判定に必要な情報 */
export interface DependentInput {
  /** その年の12/31時点の年齢 */
  age: number;
  /** 納税者またはその配偶者の直系尊属で同居しているか(同居老親等の割増) */
  coResidentDirectAscendant?: boolean;
  /** 合計所得金額。省略時は0 */
  annualIncome?: Yen | undefined;
}

export type DependentCounts = Record<DependentCategory, number>;

const EMPTY_COUNTS: Readonly<DependentCounts> = Object.freeze({
  general: 0,
  specific: 0,
  elderly: 0,
  coResidentElderly: 0
});

/**
 * 1人分の区分。控除対象にならない場合は undefined。
 * 年齢より先に所得要件を見る — 所得が要件を超える者はそもそも扶養親族に当たらない。
 */
export function categorize(
  dependent: DependentInput,
  rules: DependentDeductionRules
): DependentCategory | undefined {
  if ((dependent.annualIncome ?? 0) > rules.incomeMax) return undefined;
  if (dependent.age < rules.minAge) return undefined;
  if (dependent.age >= rules.elderlyFromAge) {
    return dependent.coResidentDirectAscendant === true ? "coResidentElderly" : "elderly";
  }
  if (dependent.age >= rules.specificFromAge && dependent.age <= rules.specificToAge) return "specific";
  return "general";
}

/** 区分ごとの人数。調整控除の人的控除差の計算にも使う。 */
export function classifyDependents(
  dependents: readonly DependentInput[],
  rules: DependentDeductionRules
): DependentCounts {
  const counts: DependentCounts = { ...EMPTY_COUNTS };
  for (const dependent of dependents) {
    const category = categorize(dependent, rules);
    if (category !== undefined) counts[category] += 1;
  }
  return counts;
}

/** Total 扶養控除 for the dependents attributed to one taxpayer */
export function dependentDeductionTotal(
  dependents: readonly DependentInput[],
  rules: DependentDeductionRules
): Yen {
  const counts = classifyDependents(dependents, rules);
  return (
    counts.general * rules.general +
    counts.specific * rules.specific +
    counts.elderly * rules.elderly +
    counts.coResidentElderly * rules.coResidentElderly
  );
}

/**
 * 住民税の非課税限度額の人数に算入される扶養親族の数。
 * 控除対象外の16歳未満も含むが、所得要件を超える者は含まない
 * (design doc §8 4-1)。
 */
export function headcountDependents(
  dependents: readonly DependentInput[],
  rules: DependentDeductionRules
): number {
  return dependents.filter((d) => (d.annualIncome ?? 0) <= rules.incomeMax).length;
}

/**
 * 特定親族特別控除。19〜22歳の親族の合計所得が扶養親族の要件を超えて123万円以下の
 * とき、外れた特定扶養控除の代わりに段階的な控除を与える。
 *
 * 扶養控除とは排他 — `categorize` は所得要件超で undefined を返すので、扶養控除と
 * 二重に足されることはない。
 */
export function specificRelativeSpecialDeductionTotal(
  dependents: readonly DependentInput[],
  rules: SpecificRelativeSpecialDeductionRules
): Yen {
  let total = 0;
  for (const dependent of dependents) {
    const income = dependent.annualIncome ?? 0;
    if (dependent.age < rules.fromAge || dependent.age > rules.toAge) continue;
    if (income <= rules.incomeMin || income > rules.incomeMax) continue;
    total += stepAmount(rules.steps, income);
  }
  return total;
}
