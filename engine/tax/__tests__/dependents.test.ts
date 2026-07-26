import { describe, expect, test } from "vitest";
import type { DependentDeductionRules } from "../../types/index.js";
import { classifyDependents, dependentDeductionTotal, headcountDependents } from "../dependents.js";

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
  elderlyFromAge: 70,
  incomeMax: 620000,
  general: 380000,
  specific: 630000,
  elderly: 480000,
  coResidentElderly: 580000
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
  elderlyFromAge: 70,
  incomeMax: 620000,
  general: 330000,
  specific: 450000,
  elderly: 380000,
  coResidentElderly: 450000
};

describe("扶養控除の合計額(所得税)", () => {
  test("16歳未満(年少扶養親族)は控除なし", () => {
    expect(dependentDeductionTotal([{ age: 0 }, { age: 5 }, { age: 15 }], incomeTaxRules)).toBe(0);
  });

  test("16歳ちょうどから一般の控除対象になる", () => {
    expect(dependentDeductionTotal([{ age: 15 }], incomeTaxRules)).toBe(0);
    expect(dependentDeductionTotal([{ age: 16 }], incomeTaxRules)).toBe(380000);
  });

  test("19歳〜22歳は特定扶養親族(63万円)", () => {
    expect(dependentDeductionTotal([{ age: 19 }], incomeTaxRules)).toBe(630000);
    expect(dependentDeductionTotal([{ age: 22 }], incomeTaxRules)).toBe(630000);
  });

  test("特定扶養の境界の外側は一般に戻る", () => {
    expect(dependentDeductionTotal([{ age: 18 }], incomeTaxRules)).toBe(380000);
    expect(dependentDeductionTotal([{ age: 23 }], incomeTaxRules)).toBe(380000);
  });

  test("複数の子は区分ごとに合算する", () => {
    // 5歳(0) + 17歳(38万) + 20歳(63万)
    expect(dependentDeductionTotal([{ age: 5 }, { age: 17 }, { age: 20 }], incomeTaxRules)).toBe(1010000);
  });

  test("扶養親族がいなければ0", () => {
    expect(dependentDeductionTotal([], incomeTaxRules)).toBe(0);
  });
});

describe("扶養控除の合計額(住民税)", () => {
  test("住民税は所得税と別の控除額(一般33万/特定45万)", () => {
    expect(dependentDeductionTotal([{ age: 17 }], residentTaxRules)).toBe(330000);
    expect(dependentDeductionTotal([{ age: 20 }], residentTaxRules)).toBe(450000);
    expect(dependentDeductionTotal([{ age: 10 }], residentTaxRules)).toBe(0);
  });

  test("同じ年齢構成でも所得税より控除額が小さい", () => {
    const family = [{ age: 5 }, { age: 17 }, { age: 20 }];

    expect(dependentDeductionTotal(family, residentTaxRules)).toBe(780000);
    expect(dependentDeductionTotal(family, incomeTaxRules)).toBeGreaterThan(
      dependentDeductionTotal(family, residentTaxRules)
    );
  });
});

describe("老人扶養親族(70歳以上)", () => {
  test("70歳から老人扶養(所得税48万/住民税38万)", () => {
    expect(dependentDeductionTotal([{ age: 69 }], incomeTaxRules)).toBe(380000);
    expect(dependentDeductionTotal([{ age: 70 }], incomeTaxRules)).toBe(480000);
    expect(dependentDeductionTotal([{ age: 70 }], residentTaxRules)).toBe(380000);
  });

  test("同居の直系尊属はさらに割増(所得税58万/住民税45万)", () => {
    const parent = [{ age: 75, coResidentDirectAscendant: true }];

    expect(dependentDeductionTotal(parent, incomeTaxRules)).toBe(580000);
    expect(dependentDeductionTotal(parent, residentTaxRules)).toBe(450000);
  });

  test("別居の親は割増なし", () => {
    expect(dependentDeductionTotal([{ age: 75, coResidentDirectAscendant: false }], incomeTaxRules)).toBe(480000);
  });

  test("70歳未満は同居でも割増されない", () => {
    expect(dependentDeductionTotal([{ age: 69, coResidentDirectAscendant: true }], incomeTaxRules)).toBe(380000);
  });

  test("区分ごとに数える", () => {
    const counts = classifyDependents(
      [
        { age: 10 },
        { age: 17 },
        { age: 20 },
        { age: 72 },
        { age: 80, coResidentDirectAscendant: true }
      ],
      incomeTaxRules
    );

    expect(counts).toEqual({ general: 1, specific: 1, elderly: 1, coResidentElderly: 1 });
  });
});

describe("扶養親族の所得要件", () => {
  test("合計所得が要件を超える者は控除の対象にならない", () => {
    expect(dependentDeductionTotal([{ age: 75, annualIncome: 620000 }], incomeTaxRules)).toBe(480000);
    expect(dependentDeductionTotal([{ age: 75, annualIncome: 620001 }], incomeTaxRules)).toBe(0);
  });

  test("所得要件を超える者は非課税限度額の人数にも算入しない", () => {
    const family = [{ age: 75, annualIncome: 620001 }, { age: 10 }];

    expect(headcountDependents(family, incomeTaxRules)).toBe(1);
  });

  test("16歳未満は控除対象外でも人数には算入する", () => {
    expect(headcountDependents([{ age: 3 }, { age: 10 }], incomeTaxRules)).toBe(2);
  });
});
