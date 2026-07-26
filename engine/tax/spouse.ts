/**
 * 配偶者控除 / 配偶者特別控除。所得税と住民税で金額表が違うだけで、判定の
 * 構造は共通なので、区分の判定をここに集約し金額はそれぞれの rules から引く。
 *
 * 両者は排他: 配偶者の合計所得が要件(令和8年分は62万円)以下なら配偶者控除、
 * 超えて133万円以下なら配偶者特別控除。実装上ここを一本の関数にしているのは、
 * 「どちらが適用されたか」を呼び出し側が取り違えないようにするため —
 * 住民税の調整控除は配偶者控除にしか乗らない(配偶者特別控除は人的控除額の
 * 差の対象外。設計書§8 4-2)。
 */

import type { SpouseDeductionRules, SpouseSpecialDeductionRules, Yen } from "../types/index.js";
import { stepAmount } from "./rounding.js";

/**
 * どの控除が適用されたか。調整控除の人的控除額の差は "ordinary"(一般の配偶者控除)と
 * "elderly"(老人控除対象配偶者)で額が違い、"special"(配偶者特別控除)には乗らない。
 */
export type SpouseDeductionKind = "none" | "ordinary" | "elderly" | "special";

export interface SpouseDeductionResult {
  amount: Yen;
  kind: SpouseDeductionKind;
}

const NONE: Readonly<SpouseDeductionResult> = Object.freeze({ amount: 0, kind: "none" });

/** 配偶者特別控除: 配偶者の所得帯を選び、その中で本人の所得に応じた額を引く */
function specialAmount(
  ownerTotalIncome: Yen,
  spouseTotalIncome: Yen,
  rules: SpouseSpecialDeductionRules
): Yen {
  const bracket = rules.brackets.find((b) => spouseTotalIncome <= b.spouseIncomeUpTo);
  return bracket === undefined ? 0 : stepAmount(bracket.steps, ownerTotalIncome);
}

/**
 * 配偶者に係る控除額と、その種別。配偶者がいない場合は "none"。
 *
 * 金額が0でも種別は "ordinary"/"special" になりうる(本人の合計所得が1,000万円を
 * 超えるケース)。調整控除側は金額が0なら差も0になるので実害はないが、種別は
 * 「どの制度に当てはまったか」を表すものとして扱う。
 */
export function spouseDeduction(
  ownerTotalIncome: Yen,
  spouseTotalIncome: Yen | undefined,
  ordinary: SpouseDeductionRules,
  special: SpouseSpecialDeductionRules,
  /** 配偶者のその年12/31時点の年齢。老人控除対象配偶者の判定に使う */
  spouseAge?: number
): SpouseDeductionResult {
  if (spouseTotalIncome === undefined) return NONE;

  if (spouseTotalIncome <= ordinary.spouseIncomeMax) {
    const isElderly = spouseAge !== undefined && spouseAge >= ordinary.elderlyFromAge;
    return isElderly
      ? { amount: stepAmount(ordinary.elderlySteps, ownerTotalIncome), kind: "elderly" }
      : { amount: stepAmount(ordinary.steps, ownerTotalIncome), kind: "ordinary" };
  }

  if (spouseTotalIncome <= special.spouseIncomeMax) {
    return { amount: specialAmount(ownerTotalIncome, spouseTotalIncome, special), kind: "special" };
  }

  return NONE;
}
