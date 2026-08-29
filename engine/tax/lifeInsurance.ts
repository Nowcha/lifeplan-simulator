import type {
  LifeInsuranceDeductionRules,
  LifeInsurancePremiums,
  LifeInsuranceRegimeRules,
  Yen
} from "../types/index.js";
import { applyRate } from "./rounding.js";

/** 区分ごとの支払保険料。旧契約に介護医療の枠は無い */
type Category = "generalAnnual" | "careMedicalAnnual" | "annuityAnnual";

const CATEGORIES: readonly Category[] = ["generalAnnual", "careMedicalAnnual", "annuityAnnual"];

/**
 * 一区分の控除額。支払保険料が属する帯で `保険料 x rate + add` を計算し、
 * 区分上限で頭打ちにする。1円未満の端数は切り上げる(国税庁・手順3)。
 */
function deductionForCategory(paid: Yen, regime: LifeInsuranceRegimeRules): Yen {
  const band = regime.bands.find((b) => b.upTo === null || paid <= b.upTo);
  if (!band) {
    throw new Error("生命保険料控除の帯表が上限なしの帯を持っていません");
  }
  const raw = applyRate(paid, band.rate) + band.add;
  return Math.min(Math.ceil(raw), regime.perCategoryMax);
}

/**
 * 生命保険料控除。区分(一般 / 介護医療 / 個人年金)ごとに別枠で控除額を出して
 * 合算し、最後に合計限度額で頭打ちにする。合算してから帯を引くのではない。
 */
export function lifeInsuranceDeduction(
  premiums: LifeInsurancePremiums | undefined,
  rules: LifeInsuranceDeductionRules
): Yen {
  if (!premiums) return 0;

  const isNew = premiums.regime === "new";
  const regime = isNew ? rules.newContract : rules.oldContract;

  if (!isNew && (premiums.careMedicalAnnual ?? 0) > 0) {
    throw new Error(
      "介護医療保険料控除は新契約(平成24年1月1日以後)にのみ存在します。旧契約では指定できません"
    );
  }

  let total = 0;
  for (const category of CATEGORIES) {
    const paid = premiums[category] ?? 0;
    if (paid < 0) {
      throw new Error(`生命保険料の支払額が負の値です: ${category}=${paid}`);
    }
    if (paid === 0) continue;
    total += deductionForCategory(paid, regime);
  }

  return Math.min(total, rules.totalMax);
}
