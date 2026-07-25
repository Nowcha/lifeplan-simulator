import { describe, expect, test } from "vitest";
import type { DependentDeductionRules } from "../../types/index.js";
import { dependentDeductionTotal } from "../dependents.js";

/**
 * 所得税の扶養控除(国税庁 タックスアンサー No.1180)
 * https://www.nta.go.jp/taxes/shiraberu/taxanswer/shotoku/1180.htm (確認日 2026-07-25)
 * 控除対象扶養親族はその年12月31日現在16歳以上。一般38万円、特定扶養親族
 * (19歳以上23歳未満)63万円。
 */
const incomeTaxRules: DependentDeductionRules = {
  minAge: 16,
  specificFromAge: 19,
  specificToAge: 22,
  general: 380000,
  specific: 630000
};

/**
 * 住民税の扶養控除(江東区 所得控除の種類・令和8年度以降)
 * https://www.city.koto.lg.jp/060502/kurashi/zekin/kuminze/5105.html (確認日 2026-07-25)
 * 16歳未満=適用なし、一般(16〜19歳未満・23〜70歳未満)33万円、特定(19〜23歳未満)45万円。
 */
const residentTaxRules: DependentDeductionRules = {
  minAge: 16,
  specificFromAge: 19,
  specificToAge: 22,
  general: 330000,
  specific: 450000
};

describe("扶養控除の合計額(所得税)", () => {
  test("16歳未満(年少扶養親族)は控除なし", () => {
    expect(dependentDeductionTotal([0, 5, 15], incomeTaxRules)).toBe(0);
  });

  test("16歳ちょうどから一般の控除対象になる", () => {
    expect(dependentDeductionTotal([15], incomeTaxRules)).toBe(0);
    expect(dependentDeductionTotal([16], incomeTaxRules)).toBe(380000);
  });

  test("19歳〜22歳は特定扶養親族(63万円)", () => {
    expect(dependentDeductionTotal([19], incomeTaxRules)).toBe(630000);
    expect(dependentDeductionTotal([22], incomeTaxRules)).toBe(630000);
  });

  test("特定扶養の境界の外側は一般に戻る", () => {
    expect(dependentDeductionTotal([18], incomeTaxRules)).toBe(380000);
    expect(dependentDeductionTotal([23], incomeTaxRules)).toBe(380000);
  });

  test("複数の子は区分ごとに合算する", () => {
    // 5歳(0) + 17歳(38万) + 20歳(63万)
    expect(dependentDeductionTotal([5, 17, 20], incomeTaxRules)).toBe(1010000);
  });

  test("扶養親族がいなければ0", () => {
    expect(dependentDeductionTotal([], incomeTaxRules)).toBe(0);
  });
});

describe("扶養控除の合計額(住民税)", () => {
  test("住民税は所得税と別の控除額(一般33万/特定45万)", () => {
    expect(dependentDeductionTotal([17], residentTaxRules)).toBe(330000);
    expect(dependentDeductionTotal([20], residentTaxRules)).toBe(450000);
    expect(dependentDeductionTotal([10], residentTaxRules)).toBe(0);
  });

  test("同じ年齢構成でも所得税より控除額が小さい", () => {
    const ages = [5, 17, 20];

    expect(dependentDeductionTotal(ages, residentTaxRules)).toBe(780000);
    expect(dependentDeductionTotal(ages, incomeTaxRules)).toBeGreaterThan(
      dependentDeductionTotal(ages, residentTaxRules)
    );
  });
});
