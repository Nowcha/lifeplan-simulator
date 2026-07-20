/**
 * 児童手当・018サポート・自治体独自給付 (design doc §6 childBenefits, §8 手順3) のテスト。
 *
 * 一次情報:
 * - 児童手当(2024年10月拡充後): 3歳未満15,000円・3歳〜18歳年度末10,000円・
 *   第3子以降30,000円、多子カウントは22歳年度末まで、所得制限撤廃:
 *   https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai/
 * - 東京都018サポート 月5,000円・0〜18歳(年度末まで)・所得制限なし:
 *   https://www.fukushi.metro.tokyo.lg.jp/kodomo/kosodate/018
 * - 江東区バースデーサポート(1歳・第1子6万/第2子7万/第3子以降8万):
 *   https://www.city.koto.lg.jp/260501/kodomo/ninshinshussan/ninshin/97553.html
 */

import { describe, expect, test } from "vitest";
import type { ChildBenefitsRules } from "../../types/index.js";
import {
  annualChildAllowance,
  annualMunicipalBenefits,
  annualTokyo018,
  type ChildRef
} from "../childAllowance.js";

const rules: ChildBenefitsRules = {
  childAllowance: {
    ageBands: [
      { untilAge: 3, monthly: 15000 },
      { untilAge: 18, monthly: 10000 }
    ],
    thirdChildMonthly: 30000,
    incomeLimit: null,
    countedChildUntilAge: 22,
    paymentMonths: [2, 4, 6, 8, 10, 12]
  },
  tokyo018: { monthly: 5000, untilAge: 18, incomeLimit: null },
  municipal: {
    "koto-ku": [
      {
        label: "バースデーサポート(1歳)",
        type: "one-time",
        atAge: 1,
        amount: { first: 60000, second: 70000, thirdPlus: 80000 },
        inKind: true
      }
    ],
    "test-city": [
      {
        label: "こども医療助成",
        type: "monthly",
        untilAge: 2,
        amount: { first: 10000 },
        inKind: false
      }
    ]
  },
  childcareCost: {
    model: "tokyo-free-0to5",
    freeFromAge3: true,
    kindergartenMonthlyCap: 25700,
    tokyoZeroToTwoFree: true,
    authorizedNurseryMonthly: 0,
    mealCostMonthlyEstimate: 4500,
    _source: { url: "https://www.fukushi.metro.tokyo.lg.jp/kodomo/hoiku/mushouka", confirmedOn: "2026-07-11" }
  },
  _source: { url: "https://www.cfa.go.jp/policies/kokoseido/jidouteate/annai/", confirmedOn: "2026-07-11" }
};

const c1: ChildRef = { childId: "c1", birthYearMonth: "2026-05" };

function amountOf(lines: { label: string; amount: number }[], label: string): number | undefined {
  return lines.find((l) => l.label === label)?.amount;
}

describe("児童手当", () => {
  test("出生翌月から支給開始(2026-05生まれ → 2026年は6〜12月の7か月×15,000円)", () => {
    const lines = annualChildAllowance([c1], 2026, rules);
    expect(amountOf(lines, "児童手当(c1)")).toBe(15000 * 7);
  });

  test("3歳到達月の翌月から10,000円に切り替わる(2029年 = 15,000×5 + 10,000×7)", () => {
    // 2026-05生まれ → 2029-05に生後36か月(3歳到達月)。日付情報がないため
    // 誕生日1日以外の大多数のケースに合わせ、切替は誕生月の翌月(6月)からとする。
    const lines = annualChildAllowance([c1], 2029, rules);
    expect(amountOf(lines, "児童手当(c1)")).toBe(15000 * 5 + 10000 * 7);
  });

  test("18歳到達後最初の3月末で支給終了(2045年は1〜3月のみ、2046年はゼロ)", () => {
    // 2026-05生まれ → 2044-05に18歳到達 → 2045-03まで支給
    expect(amountOf(annualChildAllowance([c1], 2045, rules), "児童手当(c1)")).toBe(10000 * 3);
    expect(annualChildAllowance([c1], 2046, rules)).toEqual([]);
  });

  test("1〜3月生まれは18歳到達年の3月末で終了(2026-02生まれ → 2044-03まで)", () => {
    const early: ChildRef = { childId: "c2", birthYearMonth: "2026-02" };
    expect(amountOf(annualChildAllowance([early], 2044, rules), "児童手当(c2)")).toBe(10000 * 3);
    expect(annualChildAllowance([early], 2045, rules)).toEqual([]);
  });

  test("第3子は30,000円、長子が22歳年度末を超えると第2子扱いに繰り上がる", () => {
    // 長子2005-05生まれ: 2027-05に22歳到達 → 多子カウントは2028-03まで。
    // 2028年の第3子(2025-05生まれ): 1〜3月は第3子30,000円、
    // 4〜5月は第2子繰上げで3歳未満15,000円(生後35〜36か月)、6月以降は10,000円。
    const children: ChildRef[] = [
      { childId: "e1", birthYearMonth: "2005-05" },
      { childId: "c2", birthYearMonth: "2023-05" },
      { childId: "c3", birthYearMonth: "2025-05" }
    ];
    const lines = annualChildAllowance(children, 2028, rules);
    expect(amountOf(lines, "児童手当(c3)")).toBe(30000 * 3 + 15000 * 2 + 10000 * 7);
    // 第2子(c2)は繰上げ後も第1子/第2子レートのまま(3歳以上10,000円×12)
    expect(amountOf(lines, "児童手当(c2)")).toBe(10000 * 12);
    // 長子自身の支給は18歳年度末(2024-03)で終了済み
    expect(amountOf(lines, "児童手当(e1)")).toBeUndefined();
  });

  test("rules未定義なら何も計上しない", () => {
    expect(annualChildAllowance([c1], 2026, undefined)).toEqual([]);
  });
});

describe("東京都018サポート", () => {
  test("出生翌月から18歳年度末まで月5,000円", () => {
    expect(amountOf(annualTokyo018([c1], 2026, rules), "018サポート(c1)")).toBe(5000 * 7);
    expect(amountOf(annualTokyo018([c1], 2045, rules), "018サポート(c1)")).toBe(5000 * 3);
    expect(annualTokyo018([c1], 2046, rules)).toEqual([]);
  });
});

describe("自治体独自給付", () => {
  test("江東区バースデーサポート: 1歳の誕生年に第1子60,000円を一度だけ計上", () => {
    expect(
      amountOf(annualMunicipalBenefits([c1], "koto-ku", 2027, rules), "バースデーサポート(1歳)(c1)")
    ).toBe(60000);
    expect(annualMunicipalBenefits([c1], "koto-ku", 2026, rules)).toEqual([]);
    expect(annualMunicipalBenefits([c1], "koto-ku", 2028, rules)).toEqual([]);
  });

  test("出生順位で額が変わる(第2子70,000円・第3子以降80,000円)", () => {
    const children: ChildRef[] = [
      { childId: "c1", birthYearMonth: "2022-05" },
      { childId: "c2", birthYearMonth: "2026-05" },
      { childId: "c3", birthYearMonth: "2026-11" }
    ];
    const lines2027 = annualMunicipalBenefits(children, "koto-ku", 2027, rules);
    expect(amountOf(lines2027, "バースデーサポート(1歳)(c2)")).toBe(70000);
    expect(amountOf(lines2027, "バースデーサポート(1歳)(c3)")).toBe(80000);
  });

  test("月額型給付は対象年齢の年度末まで計上する", () => {
    // 2026-05生まれ・untilAge 2 → 2028-05に2歳到達 → 2029-03まで
    expect(
      amountOf(annualMunicipalBenefits([c1], "test-city", 2026, rules), "こども医療助成(c1)")
    ).toBe(10000 * 7);
    expect(
      amountOf(annualMunicipalBenefits([c1], "test-city", 2029, rules), "こども医療助成(c1)")
    ).toBe(10000 * 3);
    expect(annualMunicipalBenefits([c1], "test-city", 2030, rules)).toEqual([]);
  });

  test("rulesに存在しない自治体キーなら何も計上しない", () => {
    expect(annualMunicipalBenefits([c1], "unknown-city", 2027, rules)).toEqual([]);
  });
});
