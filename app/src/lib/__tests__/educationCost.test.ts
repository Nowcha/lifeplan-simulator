import { describe, expect, test } from "vitest";
import type { RuleSet } from "../../../../engine/types/index.js";
import { nurseryCostHint, schoolStageCostHint, universityCostHint } from "../educationCost";

/**
 * 実際の rules/*.json ではなく丸い数字のスタブを使う。このモジュールの責務は
 * 「ルール値をどう組み立てて表示するか」であって、ルール値そのものの正しさは
 * rules 側の _source と engine/expenses/education.ts のテストが担保する。
 */
const rules = {
  childBenefits: {
    childcareCost: { authorizedNurseryMonthly: 30_000, mealCostMonthlyEstimate: 5_000 }
  },
  educationCosts: {
    school: {
      kindergarten: { public: { annual: 100_000 }, private: { annual: 300_000 } },
      elementary: { public: { annual: 200_000 }, private: { annual: 1_600_000 } },
      juniorHigh: { public: { annual: 500_000 }, private: { annual: 1_400_000 } },
      highSchool: { public: { annual: 500_000 }, private: { annual: 1_000_000 } }
    },
    university: {
      national: { admissionFee: 280_000, annualTuition: 540_000, facilityFeeAnnual: 0 },
      privateLiberal: { admissionFee: 230_000, annualTuition: 800_000, facilityFeeAnnual: 150_000 },
      privateScience: { admissionFee: 250_000, annualTuition: 1_100_000, facilityFeeAnnual: 200_000 },
      boardingAllowanceMonthly: 80_000
    }
  }
} as unknown as RuleSet;

describe("nurseryCostHint", () => {
  test("認可保育園は保育料と副食費の年額合計を出す", () => {
    // (30,000 + 5,000) * 12 = 420,000
    expect(nurseryCostHint(rules, "hoikuen")).toBe("目安 年額42万円(保育料+副食費)");
  });

  test("公立・私立幼稚園はそれぞれの年額を出す", () => {
    expect(nurseryCostHint(rules, "kindergarten-public")).toBe("目安 年額10万円");
    expect(nurseryCostHint(rules, "kindergarten-private")).toBe("目安 年額30万円");
  });

  test("利用しない場合はヒントを出さない", () => {
    expect(nurseryCostHint(rules, "none")).toBeUndefined();
  });

  test("ルールに該当データが無ければヒントを出さない(表示専用なので落とさない)", () => {
    expect(nurseryCostHint({} as RuleSet, "hoikuen")).toBeUndefined();
    expect(nurseryCostHint({} as RuleSet, "kindergarten-public")).toBeUndefined();
  });
});

describe("schoolStageCostHint", () => {
  test("段階と公私の組み合わせで年額を引く", () => {
    expect(schoolStageCostHint(rules, "elementary", "public")).toBe("目安 年額20万円");
    expect(schoolStageCostHint(rules, "elementary", "private")).toBe("目安 年額160万円");
    expect(schoolStageCostHint(rules, "juniorHigh", "private")).toBe("目安 年額140万円");
    expect(schoolStageCostHint(rules, "highSchool", "public")).toBe("目安 年額50万円");
  });

  test("ルールに該当データが無ければヒントを出さない", () => {
    expect(schoolStageCostHint({} as RuleSet, "elementary", "public")).toBeUndefined();
  });
});

describe("universityCostHint", () => {
  test("国立・自宅通学は入学金と年額(授業料+施設費)を出す", () => {
    // 540,000 + 0 = 540,000
    expect(universityCostHint(rules, "national", "home")).toBe("目安 入学金28万円+年額54万円(在学中)");
  });

  test("私立理系・自宅通学は施設費を年額に含める", () => {
    // 1,100,000 + 200,000 = 1,300,000
    expect(universityCostHint(rules, "private-science", "home")).toBe("目安 入学金25万円+年額130万円(在学中)");
  });

  test("下宿は仕送りを年額に加算し、注記を添える", () => {
    // 800,000 + 150,000 + 80,000 * 12 = 1,910,000
    expect(universityCostHint(rules, "private-liberal", "boarding")).toBe(
      "目安 入学金23万円+年額191万円(在学中・仕送り込み)"
    );
  });

  test("進学しない場合はヒントを出さない", () => {
    expect(universityCostHint(rules, "none", "home")).toBeUndefined();
  });

  test("ルールに該当データが無ければヒントを出さない", () => {
    expect(universityCostHint({} as RuleSet, "national", "home")).toBeUndefined();
  });
});
