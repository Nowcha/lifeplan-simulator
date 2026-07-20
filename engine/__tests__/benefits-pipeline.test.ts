/**
 * フェーズ2統合: 出産・育休イベントがパイプライン全体に与える影響のテスト。
 * (design doc §8 手順1-3, 手順5 / 申し送り「住民税の前年課税・育休給付の非課税・
 *  社保免除の3点は手取り精度に効く最重要ポイント」)
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../rules/2026.json";
import type { Assumptions, ChildbirthEvent, Household, RuleSet } from "../types/index.js";
import { runDeterministic } from "../pipeline.js";

const rules = rules2026 as unknown as RuleSet;

const household: Household = {
  schemaVersion: 1,
  persons: [
    {
      id: "partner-a",
      birthYearMonth: "1996-01",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 400000, bonusAnnual: 1200000, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    },
    {
      id: "partner-b",
      birthYearMonth: "1998-07",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 300000, bonusAnnual: 0, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    }
  ],
  children: [],
  municipality: "koto-ku",
  baseExpenses: [],
  financialAssets: [{ assetClassId: "cash", account: "cash", balance: 10000000, costBasis: 10000000 }],
  savingsPolicy: {
    cashBufferMonths: 6,
    contributions: [],
    drawdown: { strategy: "fixed-amount", value: 0, order: [] }
  }
};

const assumptions: Assumptions = {
  simulation: { startYear: 2026, endAge: 34, paths: 1, seed: 1 },
  inflation: { mean: 0, volatility: 0 },
  wageGrowth: { mean: 0, volatility: 0 },
  assetClasses: [],
  correlationMatrix: { factors: [], matrix: [] },
  baseRate: { initial: 0, model: "manual" }
};

const childbirth: ChildbirthEvent = {
  id: "birth-c1",
  type: "childbirth",
  expectedYearMonth: "2027-02",
  childId: "c1",
  deliveryCost: 550000,
  leavePlans: [
    {
      personId: "partner-b",
      maternityLeave: { from: "2027-01", to: "2027-04" },
      parentalLeave: { from: "2027-05", to: "2028-03" }
    },
    {
      personId: "partner-a",
      parentalLeave: { from: "2027-02", to: "2027-03" },
      postnatalSupportDays: 28
    }
  ]
};

function benefitAmount(row: { benefits: { label: string; amount: number }[] }, label: string): number | undefined {
  return row.benefits.find((b) => b.label === label)?.amount;
}

describe("出産・育休イベント統合 (2026〜2030)", () => {
  const result = runDeterministic(household, [childbirth], assumptions, rules);
  const rows = result.deterministic;
  const byYear = new Map(rows.map((r) => [r.year, r]));
  const y2026 = byYear.get(2026);
  const y2027 = byYear.get(2027);
  const y2028 = byYear.get(2028);

  test("イベントなしの年(2026)は通常どおりの給与収入", () => {
    expect(y2026?.income["partner-a"]?.gross).toBe(400000 * 12 + 1200000);
    expect(y2026?.income["partner-b"]?.gross).toBe(300000 * 12);
  });

  test("休業年(2027): partner-bは通年休業で給与ゼロ・社保ゼロ(免除)", () => {
    expect(y2027?.income["partner-b"]?.gross).toBe(0);
    expect(y2027?.income["partner-b"]?.socialInsurance).toBe(0);
    expect(y2027?.income["partner-b"]?.incomeTax).toBe(0);
  });

  test("休業年(2027): partner-aは育休2か月分の給与・賞与が減る", () => {
    // 月給×10か月 + 賞与×(10/12)
    expect(y2027?.income["partner-a"]?.gross).toBe(400000 * 10 + Math.floor((1200000 * 10) / 12));
  });

  test("出産育児一時金は実費と相殺して計上(50万−55万 = −5万)", () => {
    expect(y2027 && benefitAmount(y2027, "出産育児一時金(実費相殺・c1)")).toBe(-50000);
  });

  test("出産手当金: 標準報酬月額30万 → 日額6,667円×98日", () => {
    expect(y2027 && benefitAmount(y2027, "出産手当金(partner-b)")).toBe(6667 * 98);
  });

  test("育児休業給付金: 67%→50%の切替と年またぎを再現する", () => {
    // partner-b: 2027-05〜2028-03。2027年は6単位×201,000 + 2単位×150,000
    expect(y2027 && benefitAmount(y2027, "育児休業給付金(partner-b)")).toBe(201000 * 6 + 150000 * 2);
    expect(y2028 && benefitAmount(y2028, "育児休業給付金(partner-b)")).toBe(150000 * 3);
    // partner-a: 2027-02〜03の2単位×floor(13,333×30×0.67)
    expect(y2027 && benefitAmount(y2027, "育児休業給付金(partner-a)")).toBe(267993 * 2);
  });

  test("出生後休業支援給付: 28日×賃金日額×13%", () => {
    expect(y2027 && benefitAmount(y2027, "出生後休業支援給付(partner-a)")).toBe(48532);
  });

  test("児童手当・018サポートは出生翌月から計上される", () => {
    expect(y2027 && benefitAmount(y2027, "児童手当(c1)")).toBe(15000 * 10);
    expect(y2027 && benefitAmount(y2027, "018サポート(c1)")).toBe(5000 * 10);
    expect(y2028 && benefitAmount(y2028, "児童手当(c1)")).toBe(15000 * 12);
  });

  test("江東区バースデーサポートは1歳の年(2028)に計上される", () => {
    expect(y2028 && benefitAmount(y2028, "バースデーサポート(1歳)(c1)")).toBe(60000);
    expect(y2027 && benefitAmount(y2027, "バースデーサポート(1歳)(c1)")).toBeUndefined();
  });

  test("社保免除: partner-bの2028年保険料は勤務9か月分(=通常年の3/4)", () => {
    const si2026 = y2026?.income["partner-b"]?.socialInsurance ?? 0;
    const si2028 = y2028?.income["partner-b"]?.socialInsurance ?? 0;
    expect(si2026).toBeGreaterThan(0);
    expect(si2028 * 4).toBe(si2026 * 3);
  });

  test("前年課税の再現: 休業翌年(2028)のpartner-b住民税はゼロ(前年所得ゼロ)", () => {
    // 2027年の住民税は前年(2026)のフル勤務所得ベースで重い
    expect(y2027?.income["partner-b"]?.residentTax).toBeGreaterThan(0);
    expect(y2028?.income["partner-b"]?.residentTax).toBe(0);
  });

  test("給付は非課税: 現金残高は手取り+給付−支出の累積になっている", () => {
    if (!y2026 || !y2027) return;
    const netTotal = Object.values(y2027.income).reduce((s, r) => s + r.net, 0);
    const benefitTotal = y2027.benefits.reduce((s, b) => s + b.amount, 0);
    const expenseTotal = y2027.expenses.reduce((s, e) => s + e.amount, 0);
    expect(y2027.cashBalance).toBe(y2026.cashBalance + netTotal + benefitTotal - expenseTotal);
  });

  test("配偶者控除の復活: 配偶者所得ゼロの年はpartner-aの所得税が軽くなる", () => {
    // 2027はpartner-a自身の所得も減るため、税額比較は2028(復帰後)対2026で行わず
    // 2027年のpartner-aの所得税が「同じ所得で配偶者控除なし」より小さいことを
    // 給与総額の近い2026年比の実効税率低下で近似確認する
    const a2026 = y2026?.income["partner-a"];
    const a2027 = y2027?.income["partner-a"];
    if (!a2026 || !a2027) return;
    expect(a2027.incomeTax / a2027.gross).toBeLessThan(a2026.incomeTax / a2026.gross);
  });

  test("イベントを差し替えるだけで別シナリオが走る(イベントなし=ベースライン)", () => {
    const baseline = runDeterministic(household, [], assumptions, rules);
    const b2027 = baseline.deterministic.find((r) => r.year === 2027);
    expect(b2027?.income["partner-b"]?.gross).toBe(300000 * 12);
    expect(b2027?.benefits).toEqual([]);
  });
});
