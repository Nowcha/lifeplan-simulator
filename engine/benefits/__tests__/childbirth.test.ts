/**
 * 出産関連給付 (design doc §4 ChildbirthEvent, §6 childbirth, §8 手順3) のテスト。
 *
 * 一次情報:
 * - 出産育児一時金 50万円: https://www.kyoukaikenpo.or.jp/faq/benefit/006/index.html
 * - 出産手当金 = 標準報酬月額平均÷30(1の位四捨五入)×2/3(小数点以下四捨五入):
 *   https://www.kyoukaikenpo.or.jp/benefit/childbirth/001
 * - 育児休業給付金 180日まで67%・以降50%、賃金日額上限16,110円、
 *   支給上限 323,811円 / 241,650円 (令和7年8月〜令和8年7月):
 *   https://www.mhlw.go.jp/content/11600000/001461102.pdf
 * - 出生後休業支援給付 最大28日 +13%: 雇用保険法(2025-04創設)
 */

import { describe, expect, test } from "vitest";
import type { ChildbirthEvent, ChildbirthRules } from "../../types/index.js";
import { annualChildbirthBenefits, type LeaveWageBasis } from "../childbirth.js";

const childbirthRules: ChildbirthRules = {
  lumpSum: 500000,
  lumpSumWithoutObstetricCompensation: 488000,
  maternityAllowanceRate: 0.6667,
  maternityLeaveDays: { beforeBirth: 42, beforeBirthMultiple: 98, afterBirth: 56 },
  parentalLeaveBenefit: {
    rateFirst180Days: 0.67,
    rateAfter: 0.5,
    wageDailyCap: 16110,
    monthlyCapFirst: 323811,
    monthlyCapAfter: 241650,
    postnatalSupport: { rate: 0.13, maxDays: 28, bothParentsMinLeaveDays: 14 },
    socialInsuranceExemption: true,
    taxExempt: true
  },
  _source: { url: "https://www.kyoukaikenpo.or.jp/faq/benefit/006/index.html", confirmedOn: "2026-07-11" }
};

const wageBasis: { [personId: string]: LeaveWageBasis } = {
  "partner-a": { monthlyPay: 400000, standardMonthly: 410000 },
  "partner-b": { monthlyPay: 300000, standardMonthly: 300000 }
};

function makeEvent(overrides: Partial<ChildbirthEvent>): ChildbirthEvent {
  return {
    id: "birth-c1",
    type: "childbirth",
    expectedYearMonth: "2027-02",
    childId: "c1",
    leavePlans: [],
    deliveryCost: 550000,
    ...overrides
  };
}

function amountOf(lines: { label: string; amount: number }[], label: string): number | undefined {
  return lines.find((l) => l.label === label)?.amount;
}

describe("出産育児一時金", () => {
  test("出産年に一時金から実費を相殺した額を計上する(50万 − 55万 = −5万)", () => {
    const lines = annualChildbirthBenefits([makeEvent({})], 2027, wageBasis, childbirthRules);
    expect(amountOf(lines, "出産育児一時金(実費相殺・c1)")).toBe(500000 - 550000);
  });

  test("出産年以外には計上しない", () => {
    expect(annualChildbirthBenefits([makeEvent({})], 2026, wageBasis, childbirthRules)).toEqual([]);
    expect(annualChildbirthBenefits([makeEvent({})], 2028, wageBasis, childbirthRules)).toEqual([]);
  });

  test("rules未定義(フェーズ1ルールファイル)なら何も計上しない", () => {
    expect(annualChildbirthBenefits([makeEvent({})], 2027, wageBasis, undefined)).toEqual([]);
  });
});

describe("出産手当金", () => {
  test("標準報酬月額30万: 日額6,667円 × 98日 = 653,366円(単年窓)", () => {
    const event = makeEvent({
      leavePlans: [{ personId: "partner-b", maternityLeave: { from: "2027-01", to: "2027-04" } }]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    // 300,000 ÷ 30 = 10,000(10円単位に四捨五入) × 0.6667 = 6,667円/日 × (42+56)日
    expect(amountOf(lines, "出産手当金(partner-b)")).toBe(6667 * 98);
  });

  test("標準報酬月額41万: ÷30の1の位四捨五入 → 13,670 → 日額9,114円", () => {
    const event = makeEvent({
      leavePlans: [{ personId: "partner-a", maternityLeave: { from: "2027-01", to: "2027-04" } }]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    // 410,000 ÷ 30 = 13,666.67 → 13,670 → × 0.6667 = 9,113.79 → 9,114
    expect(amountOf(lines, "出産手当金(partner-a)")).toBe(9114 * 98);
  });

  test("年をまたぐ窓(2026-11〜2027-02)では日数を月数比で按分する(49日ずつ)", () => {
    const event = makeEvent({
      expectedYearMonth: "2026-12",
      leavePlans: [{ personId: "partner-b", maternityLeave: { from: "2026-11", to: "2027-02" } }]
    });
    const lines2026 = annualChildbirthBenefits([event], 2026, wageBasis, childbirthRules);
    const lines2027 = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    expect(amountOf(lines2026, "出産手当金(partner-b)")).toBe(6667 * 49);
    expect(amountOf(lines2027, "出産手当金(partner-b)")).toBe(6667 * 49);
  });

  test("賃金ベースがない(非給与所得者)場合は計上しない", () => {
    const event = makeEvent({
      leavePlans: [{ personId: "partner-x", maternityLeave: { from: "2027-01", to: "2027-04" } }]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    expect(amountOf(lines, "出産手当金(partner-x)")).toBeUndefined();
  });
});

describe("育児休業給付金", () => {
  test("月給30万・11か月窓: 180日まで67%(201,000円/月)・以降50%(150,000円/月)", () => {
    const event = makeEvent({
      leavePlans: [{ personId: "partner-b", parentalLeave: { from: "2027-05", to: "2028-03" } }]
    });
    const lines2027 = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    const lines2028 = annualChildbirthBenefits([event], 2028, wageBasis, childbirthRules);
    // 賃金日額 = 300,000÷30 = 10,000。2027年は支給単位1〜8(6単位×67% + 2単位×50%)
    expect(amountOf(lines2027, "育児休業給付金(partner-b)")).toBe(201000 * 6 + 150000 * 2);
    // 2028年は支給単位9〜11(3単位×50%)
    expect(amountOf(lines2028, "育児休業給付金(partner-b)")).toBe(150000 * 3);
  });

  test("高所得者は賃金日額上限16,110円で頭打ち(支給上限額と一致)", () => {
    const highWage: { [personId: string]: LeaveWageBasis } = {
      "partner-a": { monthlyPay: 600000, standardMonthly: 590000 }
    };
    const event = makeEvent({
      leavePlans: [{ personId: "partner-a", parentalLeave: { from: "2027-03", to: "2027-12" } }]
    });
    const lines = annualChildbirthBenefits([event], 2027, highWage, childbirthRules);
    // 16,110×30×0.67 = 323,811(上限と一致)×6 + 16,110×30×0.5 = 241,650×4
    expect(amountOf(lines, "育児休業給付金(partner-a)")).toBe(323811 * 6 + 241650 * 4);
  });
});

describe("出生後休業支援給付", () => {
  test("申告日数(≤28日)×賃金日額×13%を育休開始年に計上する", () => {
    const event = makeEvent({
      leavePlans: [
        {
          personId: "partner-a",
          parentalLeave: { from: "2027-02", to: "2027-03" },
          postnatalSupportDays: 28
        }
      ]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    // 賃金日額 = floor(400,000÷30) = 13,333 × 28日 × 0.13 = 48,532.12 → 48,532
    expect(amountOf(lines, "出生後休業支援給付(partner-a)")).toBe(48532);
    // 育休2年目には計上しない
    const lines2028 = annualChildbirthBenefits([event], 2028, wageBasis, childbirthRules);
    expect(amountOf(lines2028, "出生後休業支援給付(partner-a)")).toBeUndefined();
  });

  test("申告日数は最大28日にクランプされる", () => {
    const event = makeEvent({
      leavePlans: [
        {
          personId: "partner-a",
          parentalLeave: { from: "2027-02", to: "2027-03" },
          postnatalSupportDays: 60
        }
      ]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    expect(amountOf(lines, "出生後休業支援給付(partner-a)")).toBe(48532);
  });

  test("育休(parentalLeave)を取得しない場合は計上しない", () => {
    const event = makeEvent({
      leavePlans: [{ personId: "partner-a", postnatalSupportDays: 28 }]
    });
    const lines = annualChildbirthBenefits([event], 2027, wageBasis, childbirthRules);
    expect(amountOf(lines, "出生後休業支援給付(partner-a)")).toBeUndefined();
  });
});
