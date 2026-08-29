/**
 * 生命保険料控除。
 *
 * 一次情報:
 * - 所得税の控除額(新契約4万円/旧契約5万円、合計12万円が限度)、および一般・介護医療・
 *   個人年金の3区分: 国税庁 No.1140 生命保険料控除。
 *   https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1140.htm (確認日 2026-08-30)
 * - 住民税の帯表(新契約 12,000/32,000/56,000円、旧契約 15,000/40,000/70,000円)と
 *   区分ごと上限(新2.8万円/旧3.5万円): 名古屋市・所得控除。
 *   https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011880/1011883/1011892.html (確認日 2026-08-30)
 * - 住民税の合計限度額7万円: 江東区・所得控除の種類。
 *   https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/5105.html (確認日 2026-08-30)
 * - 1円未満の端数は切り上げ: 国税庁・手順3 所得から差し引かれる金額(所得控除)を計算する。
 *   https://www.nta.go.jp/taxes/shiraberu/shinkoku/tebiki/2023/03/order3/3-3_12.htm (確認日 2026-08-30)
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../../rules/2026.json";
import type { LifeInsurancePremiums, RuleSet } from "../../types/index.js";
import { lifeInsuranceDeduction } from "../lifeInsurance.js";

const rules = rules2026 as unknown as RuleSet;
const incomeTax = rules.incomeTax.lifeInsuranceDeduction;
const residentTax = rules.residentTax.lifeInsuranceDeduction;

/** 一般生命保険料だけを持つ入力を組み立てる */
function general(regime: LifeInsurancePremiums["regime"], amount: number): LifeInsurancePremiums {
  return { regime, generalAnnual: amount };
}

describe("所得税・新契約", () => {
  test.each([
    [0, 0],
    [20_000, 20_000], // 全額控除の帯の上端
    [20_001, 20_001], // 20,001 x 1/2 + 10,000 = 20,000.5 -> 切り上げ 20,001
    [30_000, 25_000], // 30,000 x 1/2 + 10,000
    [40_000, 30_000], // 帯の上端
    [60_000, 35_000], // 60,000 x 1/4 + 20,000
    [80_000, 40_000], // 帯の上端かつ区分上限
    [200_000, 40_000] // 頭打ち
  ])("支払 %i 円 -> 控除 %i 円", (paid, expected) => {
    expect(lifeInsuranceDeduction(general("new", paid), incomeTax)).toBe(expected);
  });
});

describe("所得税・旧契約", () => {
  test.each([
    [25_000, 25_000], // 全額控除の帯の上端
    [40_000, 32_500], // 40,000 x 1/2 + 12,500
    [50_000, 37_500], // 帯の上端
    [80_000, 45_000], // 80,000 x 1/4 + 25,000
    [100_000, 50_000], // 帯の上端かつ区分上限
    [300_000, 50_000] // 頭打ち
  ])("支払 %i 円 -> 控除 %i 円", (paid, expected) => {
    expect(lifeInsuranceDeduction(general("old", paid), incomeTax)).toBe(expected);
  });
});

describe("住民税", () => {
  test.each([
    [12_000, 12_000],
    [20_000, 16_000], // 20,000 x 1/2 + 6,000
    [32_000, 22_000], // 帯の上端
    [40_000, 24_000], // 40,000 x 1/4 + 14,000
    [56_000, 28_000], // 帯の上端かつ区分上限
    [100_000, 28_000] // 頭打ち
  ])("新契約: 支払 %i 円 -> 控除 %i 円", (paid, expected) => {
    expect(lifeInsuranceDeduction(general("new", paid), residentTax)).toBe(expected);
  });

  test.each([
    [15_000, 15_000],
    [30_000, 22_500], // 30,000 x 1/2 + 7,500
    [40_000, 27_500], // 帯の上端
    [60_000, 32_500], // 60,000 x 1/4 + 17,500
    [70_000, 35_000], // 帯の上端かつ区分上限
    [200_000, 35_000] // 頭打ち
  ])("旧契約: 支払 %i 円 -> 控除 %i 円", (paid, expected) => {
    expect(lifeInsuranceDeduction(general("old", paid), residentTax)).toBe(expected);
  });
});

describe("区分ごとに別枠で計算して合算する", () => {
  test("所得税・新契約の3区分がそれぞれ上限に達すると 12 万円", () => {
    const premiums: LifeInsurancePremiums = {
      regime: "new",
      generalAnnual: 80_000,
      careMedicalAnnual: 80_000,
      annuityAnnual: 80_000
    };
    expect(lifeInsuranceDeduction(premiums, incomeTax)).toBe(120_000);
  });

  test("住民税・新契約の3区分は区分上限の合計 84,000 円ではなく合計限度額 70,000 円で頭打ち", () => {
    const premiums: LifeInsurancePremiums = {
      regime: "new",
      generalAnnual: 56_000,
      careMedicalAnnual: 56_000,
      annuityAnnual: 56_000
    };
    expect(lifeInsuranceDeduction(premiums, residentTax)).toBe(70_000);
  });

  test("区分ごとに帯を引く: 合算してから帯を引くのではない", () => {
    // 合算(40,000)してから引くと 30,000 円になるが、区分ごとなら 20,000 + 20,000。
    const premiums: LifeInsurancePremiums = {
      regime: "new",
      generalAnnual: 20_000,
      annuityAnnual: 20_000
    };
    expect(lifeInsuranceDeduction(premiums, incomeTax)).toBe(40_000);
  });
});

describe("入力の扱い", () => {
  test("未指定なら 0", () => {
    expect(lifeInsuranceDeduction(undefined, incomeTax)).toBe(0);
  });

  test("旧契約に介護医療保険料の区分は存在しないため計算を停止する", () => {
    const premiums: LifeInsurancePremiums = {
      regime: "old",
      generalAnnual: 50_000,
      careMedicalAnnual: 30_000
    };
    expect(() => lifeInsuranceDeduction(premiums, incomeTax)).toThrow(/介護医療/);
  });

  test("負の保険料は入力エラーとして計算を停止する", () => {
    expect(() => lifeInsuranceDeduction(general("new", -1), incomeTax)).toThrow();
  });
});
