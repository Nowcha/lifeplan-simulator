/**
 * RecurringModifierEvent / OneTimeEvent 展開 (design doc §4, §8 手順6) のテスト。
 */

import { describe, expect, test } from "vitest";
import { constantFactor } from "../../indexation.js";
import type { OneTimeEvent, RecurringModifierEvent } from "../../types/index.js";
import { annualOneTimeEvents, annualRecurringEvents } from "../events.js";

const rates = { inflation: constantFactor(0.02), wage: constantFactor(0.03) };

describe("annualRecurringEvents", () => {
  test("intervalYears ごとに amount を計上する(車の買い替え7年ごと)", () => {
    const event: RecurringModifierEvent = {
      id: "car-replacement",
      type: "recurring",
      label: "車の買い替え",
      startYearMonth: "2026-04",
      intervalYears: 7,
      amount: 3000000,
      indexation: "fixed"
    };

    expect(annualRecurringEvents([event], 2026, 2026, rates)).toEqual([
      { category: "車の買い替え", amount: 3000000 }
    ]);
    expect(annualRecurringEvents([event], 2027, 2026, rates)).toEqual([]);
    expect(annualRecurringEvents([event], 2033, 2026, rates)).toEqual([
      { category: "車の買い替え", amount: 3000000 }
    ]);
    expect(annualRecurringEvents([event], 2040, 2026, rates)).toEqual([
      { category: "車の買い替え", amount: 3000000 }
    ]);
  });

  test("開始年より前は計上しない", () => {
    const event: RecurringModifierEvent = {
      id: "car-replacement",
      type: "recurring",
      label: "車の買い替え",
      startYearMonth: "2028-04",
      intervalYears: 7,
      amount: 3000000,
      indexation: "fixed"
    };
    expect(annualRecurringEvents([event], 2026, 2026, rates)).toEqual([]);
    expect(annualRecurringEvents([event], 2028, 2026, rates)).toEqual([
      { category: "車の買い替え", amount: 3000000 }
    ]);
  });

  test("occurrences 上限に達したら計上を止める", () => {
    const event: RecurringModifierEvent = {
      id: "car-replacement",
      type: "recurring",
      label: "車の買い替え",
      startYearMonth: "2026-04",
      intervalYears: 7,
      amount: 3000000,
      occurrences: 2,
      indexation: "fixed"
    };
    // 0回目: 2026, 1回目: 2033 (計2回), 2回目would-be 2040 は上限超過で計上しない
    expect(annualRecurringEvents([event], 2026, 2026, rates).length).toBe(1);
    expect(annualRecurringEvents([event], 2033, 2026, rates).length).toBe(1);
    expect(annualRecurringEvents([event], 2040, 2026, rates).length).toBe(0);
  });

  test("intervalYears省略時は毎年発生する", () => {
    const event: RecurringModifierEvent = {
      id: "annual-trip",
      type: "recurring",
      label: "旅行",
      startYearMonth: "2026-08",
      amount: 400000,
      indexation: "fixed"
    };
    expect(annualRecurringEvents([event], 2027, 2026, rates)).toEqual([
      { category: "旅行", amount: 400000 }
    ]);
  });

  test("indexation='inflation' は経過年数に応じて複利で増額される", () => {
    const event: RecurringModifierEvent = {
      id: "car-replacement",
      type: "recurring",
      label: "車の買い替え",
      startYearMonth: "2026-04",
      intervalYears: 7,
      amount: 3000000,
      indexation: "inflation"
    };
    const result = annualRecurringEvents([event], 2033, 2026, rates);
    // 3,000,000 * 1.02^7 = 3,447,302.98... -> floor
    expect(result).toEqual([{ category: "車の買い替え", amount: Math.floor(3000000 * 1.02 ** 7) }]);
  });
});

describe("annualOneTimeEvents", () => {
  test("指定年月の年に amount を計上する(正=支出)", () => {
    const event: OneTimeEvent = {
      id: "renovation",
      type: "one-time",
      label: "リフォーム",
      yearMonth: "2030-05",
      amount: 1500000
    };
    expect(annualOneTimeEvents([event], 2030)).toEqual([{ category: "リフォーム", amount: 1500000 }]);
    expect(annualOneTimeEvents([event], 2029)).toEqual([]);
    expect(annualOneTimeEvents([event], 2031)).toEqual([]);
  });

  test("負のamountは収入として計上される(贈与等)", () => {
    const event: OneTimeEvent = {
      id: "gift",
      type: "one-time",
      label: "祖父母からの贈与",
      yearMonth: "2028-01",
      amount: -2000000
    };
    expect(annualOneTimeEvents([event], 2028)).toEqual([
      { category: "祖父母からの贈与", amount: -2000000 }
    ]);
  });

  test("複数イベントをまとめて展開する", () => {
    const events: OneTimeEvent[] = [
      { id: "a", type: "one-time", label: "A", yearMonth: "2030-01", amount: 100 },
      { id: "b", type: "one-time", label: "B", yearMonth: "2030-06", amount: 200 },
      { id: "c", type: "one-time", label: "C", yearMonth: "2031-01", amount: 300 }
    ];
    expect(annualOneTimeEvents(events, 2030)).toEqual([
      { category: "A", amount: 100 },
      { category: "B", amount: 200 }
    ]);
  });
});
