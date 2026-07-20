/**
 * 産休・育休・時短復帰の月次カレンダー (design doc §8 手順1-2) のテスト。
 *
 * - 産前産後休業中の社保免除は法定(健保法159条の3・厚年法81条の2の2、2014-04〜)
 * - 育休中の社保免除は rules.childbirth.parentalLeaveBenefit.socialInsuranceExemption
 */

import { describe, expect, test } from "vitest";
import type { ChildbirthEvent } from "../../types/index.js";
import { monthlyLeavePlan } from "../leave.js";

const event: ChildbirthEvent = {
  id: "birth-c1",
  type: "childbirth",
  expectedYearMonth: "2027-02",
  childId: "c1",
  deliveryCost: 550000,
  leavePlans: [
    {
      personId: "partner-b",
      maternityLeave: { from: "2027-01", to: "2027-04" },
      parentalLeave: { from: "2027-05", to: "2027-08" },
      returnToWork: { shortHoursFactor: 0.8, until: "2028-03" }
    }
  ]
};

describe("monthlyLeavePlan", () => {
  test("イベントがなければ全月フル勤務・社保免除なし", () => {
    const plan = monthlyLeavePlan([], "partner-b", 2027, true);
    expect(plan).toHaveLength(12);
    for (const m of plan) expect(m).toEqual({ payFactor: 1, siExempt: false });
  });

  test("産休月は給与ゼロ・社保免除(法定・フラグに依存しない)", () => {
    const plan = monthlyLeavePlan([event], "partner-b", 2027, false);
    for (const i of [0, 1, 2, 3]) {
      expect(plan[i]).toEqual({ payFactor: 0, siExempt: true });
    }
  });

  test("育休月は給与ゼロ・社保免除はrulesフラグに従う", () => {
    const exempt = monthlyLeavePlan([event], "partner-b", 2027, true);
    const notExempt = monthlyLeavePlan([event], "partner-b", 2027, false);
    for (const i of [4, 5, 6, 7]) {
      expect(exempt[i]).toEqual({ payFactor: 0, siExempt: true });
      expect(notExempt[i]).toEqual({ payFactor: 0, siExempt: false });
    }
  });

  test("育休明けから returnToWork.until まで時短係数を適用する", () => {
    const plan2027 = monthlyLeavePlan([event], "partner-b", 2027, true);
    for (const i of [8, 9, 10, 11]) {
      expect(plan2027[i]).toEqual({ payFactor: 0.8, siExempt: false });
    }
    const plan2028 = monthlyLeavePlan([event], "partner-b", 2028, true);
    for (const i of [0, 1, 2]) {
      expect(plan2028[i]).toEqual({ payFactor: 0.8, siExempt: false });
    }
    // until の翌月からフル勤務に戻る
    expect(plan2028[3]).toEqual({ payFactor: 1, siExempt: false });
  });

  test("他の人のleavePlanには影響されない", () => {
    const plan = monthlyLeavePlan([event], "partner-a", 2027, true);
    for (const m of plan) expect(m).toEqual({ payFactor: 1, siExempt: false });
  });

  test("年子: 第1子の時短復帰中に第2子の産休が重なる月は産休(給与ゼロ・免除)を優先する", () => {
    const secondChild: ChildbirthEvent = {
      id: "birth-c2",
      type: "childbirth",
      expectedYearMonth: "2027-06",
      childId: "c2",
      deliveryCost: 550000,
      leavePlans: [{ personId: "partner-b", maternityLeave: { from: "2027-05", to: "2027-08" } }]
    };
    // event(第1子)の時短復帰は 2027-09〜2028-03、うち 2027-09は第1子の時短のみ、
    // secondChildの産休(2027-05〜08)と時短期間は重ならない設計だが、
    // 時短復帰中の月(2027-09〜)に第2子の育休が始まるケースを検証する。
    const overlappingParental: ChildbirthEvent = {
      ...secondChild,
      leavePlans: [{ personId: "partner-b", parentalLeave: { from: "2027-09", to: "2027-12" } }]
    };
    const plan = monthlyLeavePlan([event, overlappingParental], "partner-b", 2027, true);
    // 2027-09(index 8): 第1子時短(0.8) と 第2子育休(0/免除)が重なる → 育休を優先
    expect(plan[8]).toEqual({ payFactor: 0, siExempt: true });
  });
});
