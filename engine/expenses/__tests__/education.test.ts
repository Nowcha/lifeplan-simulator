/**
 * EducationPlan 展開 (design doc §4 EducationPlan, §8 手順6) のテスト。
 * ステージ年齢帯: 保育園/幼稚園3-5, 小6-11, 中12-14, 高15-17, 大18-21。
 */

import { describe, expect, test } from "vitest";
import { constantIndexation } from "../../indexation.js";
import rules2026 from "../../../rules/2026.json";
import educationCostsData from "../../../rules/education-costs.json";
import type {
  ChildcareCostRules,
  EducationCosts,
  EducationPlan,
  RuleSet
} from "../../types/index.js";
import { annualEducationExpenses, type ChildEducationInput } from "../education.js";

const rules = rules2026 as RuleSet;
const realEducationCosts = educationCostsData as EducationCosts;
const realChildcareCost = rules.childBenefits?.childcareCost as ChildcareCostRules;

const rates = constantIndexation({ inflation: 0.02, wage: 0.03, education: 0.02 });

// Small fixture with round numbers, isolated from real rules churn, used for
// stage-selection and boundary-logic assertions.
const fixtureCosts: EducationCosts = {
  indexation: "fixed",
  school: {
    kindergarten: {
      public: { annual: 100000 },
      private: { annual: 200000 },
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    elementary: {
      public: { annual: 300000 },
      private: { annual: 1000000 },
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    juniorHigh: {
      public: { annual: 400000 },
      private: { annual: 1200000 },
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    highSchool: {
      public: { annual: 500000 },
      private: { annual: 900000 },
      _source: { url: "x", confirmedOn: "2026-07-11" }
    }
  },
  university: {
    national: {
      admissionFee: 300000,
      annualTuition: 500000,
      facilityFeeAnnual: 0,
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    privateLiberal: {
      admissionFee: 250000,
      annualTuition: 800000,
      facilityFeeAnnual: 150000,
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    privateScience: {
      admissionFee: 250000,
      annualTuition: 1100000,
      facilityFeeAnnual: 150000,
      _source: { url: "x", confirmedOn: "2026-07-11" }
    },
    boardingAllowanceMonthly: 70000,
    _sourceBoarding: { url: "x", confirmedOn: "2026-07-11" }
  }
};

const fixtureChildcare: ChildcareCostRules = {
  model: "tokyo-free-0to5",
  freeFromAge3: true,
  kindergartenMonthlyCap: 25700,
  tokyoZeroToTwoFree: true,
  authorizedNurseryMonthly: 0,
  mealCostMonthlyEstimate: 4500,
  _source: { url: "x", confirmedOn: "2026-07-11" }
};

function planWith(overrides: Partial<EducationPlan["stages"]>): EducationPlan {
  return {
    id: "edu-child-a",
    type: "education",
    childId: "child-a",
    stages: {
      nursery: "none",
      elementary: "public",
      juniorHigh: "public",
      highSchool: "public",
      university: "none",
      universityHousing: "home",
      ...overrides
    }
  };
}

function childAt(birthYear: number, plan: EducationPlan | undefined): ChildEducationInput {
  return { childId: "child-a", birthYearMonth: `${birthYear}-04`, plan };
}

describe("annualEducationExpenses — ステージ判定", () => {
  test("3-5歳: hoikuenは childcareCost 参照(認可保育料+副食費)", () => {
    const plan = planWith({ nursery: "hoikuen" });
    const child = childAt(2023, plan); // 2026年に3歳
    const lines = annualEducationExpenses(
      [child],
      2026,
      2026,
      rates,
      fixtureCosts,
      fixtureChildcare
    );
    expect(lines).toEqual([
      {
        category: "教育費(child-a・保育園/幼稚園)",
        amount: (fixtureChildcare.authorizedNurseryMonthly + fixtureChildcare.mealCostMonthlyEstimate) * 12
      }
    ]);
  });

  test("3-5歳: kindergarten-public/private は education-costs テーブルを参照", () => {
    const publicPlan = planWith({ nursery: "kindergarten-public" });
    const privatePlan = planWith({ nursery: "kindergarten-private" });
    const child2026 = childAt(2023, publicPlan);
    expect(annualEducationExpenses([child2026], 2026, 2026, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・保育園/幼稚園)", amount: 100000 }
    ]);
    const privateChild = childAt(2023, privatePlan);
    expect(
      annualEducationExpenses([privateChild], 2026, 2026, rates, fixtureCosts, fixtureChildcare)
    ).toEqual([{ category: "教育費(child-a・保育園/幼稚園)", amount: 200000 }]);
  });

  test("nursery='none' は費用を計上しない", () => {
    const plan = planWith({ nursery: "none" });
    const child = childAt(2023, plan);
    expect(annualEducationExpenses([child], 2026, 2026, rates, fixtureCosts, fixtureChildcare)).toEqual([]);
  });

  test("0-2歳(3歳未満)は保育園/幼稚園ステージの費用を計上しない", () => {
    const plan = planWith({ nursery: "hoikuen" });
    const child = childAt(2025, plan); // 2026年に1歳
    expect(annualEducationExpenses([child], 2026, 2026, rates, fixtureCosts, fixtureChildcare)).toEqual([]);
  });

  test("小学校(6-11歳)の境界: 5歳では計上せず6歳から計上", () => {
    const plan = planWith({ elementary: "public" });
    const child = childAt(2020, plan);
    expect(annualEducationExpenses([child], 2025, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([]); // 5歳
    expect(annualEducationExpenses([child], 2026, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・小学校)", amount: 300000 }
    ]); // 6歳
    expect(annualEducationExpenses([child], 2031, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・小学校)", amount: 300000 }
    ]); // 11歳
    expect(annualEducationExpenses([child], 2032, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・中学校)", amount: 400000 }
    ]); // 12歳: 中学進学(小学校卒業)
  });

  test("私立小学校は private の年額を参照", () => {
    const plan = planWith({ elementary: "private" });
    const child = childAt(2020, plan);
    expect(annualEducationExpenses([child], 2026, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・小学校)", amount: 1000000 }
    ]);
  });

  test("中学校(12-14歳)・高校(15-17歳)の境界", () => {
    const plan = planWith({ juniorHigh: "public", highSchool: "private" });
    const child = childAt(2011, plan);
    expect(annualEducationExpenses([child], 2023, 2011, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・中学校)", amount: 400000 }
    ]); // 12歳
    expect(annualEducationExpenses([child], 2025, 2011, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・中学校)", amount: 400000 }
    ]); // 14歳
    expect(annualEducationExpenses([child], 2026, 2011, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・高校)", amount: 900000 }
    ]); // 15歳
    expect(annualEducationExpenses([child], 2028, 2011, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・高校)", amount: 900000 }
    ]); // 17歳
    expect(annualEducationExpenses([child], 2029, 2011, rates, fixtureCosts, fixtureChildcare)).toEqual([]); // 18歳: 卒業(大学はnone)
  });
});

describe("annualEducationExpenses — 大学", () => {
  test("入学金は入学年(18歳)のみ、授業料は18-21歳の毎年計上", () => {
    const plan = planWith({ university: "national" });
    const child = childAt(2008, plan);
    expect(annualEducationExpenses([child], 2026, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・大学入学金)", amount: 300000 },
      { category: "教育費(child-a・大学授業料)", amount: 500000 }
    ]); // 18歳
    expect(annualEducationExpenses([child], 2027, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・大学授業料)", amount: 500000 }
    ]); // 19歳: 入学金なし
    expect(annualEducationExpenses([child], 2029, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・大学授業料)", amount: 500000 }
    ]); // 21歳
    expect(annualEducationExpenses([child], 2030, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([]); // 22歳: 卒業
  });

  test("私立は授業料+施設設備費を計上する", () => {
    const plan = planWith({ university: "private-liberal" });
    const child = childAt(2008, plan);
    expect(annualEducationExpenses([child], 2027, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・大学授業料)", amount: 800000 + 150000 }
    ]);
  });

  test("universityHousing='boarding' なら仕送り月額×12を追加計上する", () => {
    const plan = planWith({ university: "national", universityHousing: "boarding" });
    const child = childAt(2008, plan);
    expect(annualEducationExpenses([child], 2027, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・大学授業料)", amount: 500000 },
      { category: "教育費(child-a・大学仕送り)", amount: 70000 * 12 }
    ]);
  });

  test("university='none' は大学費用を計上しない", () => {
    const plan = planWith({ university: "none" });
    const child = childAt(2008, plan);
    expect(annualEducationExpenses([child], 2027, 2008, rates, fixtureCosts, fixtureChildcare)).toEqual([]);
  });
});

describe("annualEducationExpenses — 習い事・非在籍ケース", () => {
  test("extracurricularMonthlyの年齢範囲内は月額×12を上乗せする", () => {
    const plan: EducationPlan = {
      ...planWith({ elementary: "public" }),
      extracurricularMonthly: [{ fromAge: 6, toAge: 11, amount: 20000 }]
    };
    const child = childAt(2020, plan);
    // simulationStartYear = year: no indexation growth, isolates the age-range check.
    expect(annualEducationExpenses([child], 2026, 2026, rates, fixtureCosts, fixtureChildcare)).toEqual([
      { category: "教育費(child-a・小学校)", amount: 300000 },
      { category: "教育費(child-a・習い事)", amount: 20000 * 12 }
    ]);
    // 12歳: 中学生になり extracurricularMonthly(6-11歳)の対象外
    expect(
      annualEducationExpenses(
        [{ childId: "child-a", birthYearMonth: "2020-04", plan }],
        2032,
        2032,
        rates,
        fixtureCosts,
        fixtureChildcare
      )
    ).toEqual([{ category: "教育費(child-a・中学校)", amount: 400000 }]);
  });

  test("plan が undefined の子は費用を計上しない", () => {
    const child = childAt(2020, undefined);
    expect(annualEducationExpenses([child], 2026, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([]);
  });

  test("シミュレーション対象年より誕生年が後(未出生)の子は計上しない", () => {
    const plan = planWith({ elementary: "public" });
    const child = childAt(2028, plan); // 誕生 2028年
    expect(annualEducationExpenses([child], 2026, 2020, rates, fixtureCosts, fixtureChildcare)).toEqual([]);
  });

  test("educationCosts が undefined の場合は学校ステージの費用を計上しない", () => {
    const plan = planWith({ elementary: "public" });
    const child = childAt(2020, plan);
    expect(annualEducationExpenses([child], 2026, 2020, rates, undefined, fixtureChildcare)).toEqual([]);
  });
});

describe("annualEducationExpenses — インフレ指数", () => {
  test("indexation='education' の場合、経過年数に応じて複利で増額される", () => {
    const indexedCosts: EducationCosts = { ...fixtureCosts, indexation: "education" };
    const plan = planWith({ elementary: "public" });
    const child = childAt(2020, plan);
    const lines = annualEducationExpenses([child], 2033, 2026, rates, indexedCosts, fixtureChildcare);
    // 2033年時点で13歳(中学生) -> 中学校費用に'education'係数(2033-2026=7年)を適用
    expect(lines).toEqual([
      { category: "教育費(child-a・中学校)", amount: Math.floor(400000 * 1.02 ** 7) }
    ]);
  });
});

describe("annualEducationExpenses — 実データ整合性(rules/2026.json, rules/education-costs.json)", () => {
  test("公立小学校の年額は文科省統計値と一致する", () => {
    const plan = planWith({ elementary: "public" });
    const child = childAt(2020, plan);
    const lines = annualEducationExpenses(
      [child],
      2026,
      2026,
      rates,
      realEducationCosts,
      realChildcareCost
    );
    expect(lines).toEqual([
      { category: "教育費(child-a・小学校)", amount: realEducationCosts.school.elementary.public.annual }
    ]);
  });

  test("hoikuen 3-5歳は東京都無償化(認可保育料0円+副食費実額)を反映する", () => {
    const plan = planWith({ nursery: "hoikuen" });
    const child = childAt(2023, plan);
    const lines = annualEducationExpenses(
      [child],
      2026,
      2026,
      rates,
      realEducationCosts,
      realChildcareCost
    );
    expect(realChildcareCost.authorizedNurseryMonthly).toBe(0);
    expect(lines).toEqual([
      {
        category: "教育費(child-a・保育園/幼稚園)",
        amount: realChildcareCost.mealCostMonthlyEstimate * 12
      }
    ]);
  });

  test("国立大学の入学金・授業料は省令標準額と一致する", () => {
    const plan = planWith({ university: "national" });
    const child = childAt(2008, plan);
    const lines = annualEducationExpenses(
      [child],
      2026,
      2026,
      rates,
      realEducationCosts,
      realChildcareCost
    );
    expect(lines).toEqual([
      {
        category: "教育費(child-a・大学入学金)",
        amount: realEducationCosts.university.national.admissionFee
      },
      {
        category: "教育費(child-a・大学授業料)",
        amount: realEducationCosts.university.national.annualTuition
      }
    ]);
  });
});
