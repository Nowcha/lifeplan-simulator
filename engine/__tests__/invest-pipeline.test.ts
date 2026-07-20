/**
 * フェーズ4統合: 貯蓄・投資ステップ(design doc §8 手順8-9)の pipeline 結線テスト。
 * 個々のロジック(NISA枠管理・譲渡益課税・按分)の正確性は engine/invest/__tests__/
 * で検証済みなので、ここでは「現金バッファ充足→拠出」「不足→取り崩し(課税口座優先)」
 * 「NISA売却分の簿価が翌年に枠復活する」という年次パイプライン結線を確認する。
 * 資産クラスのリターンは0%に固定し、拠出/取り崩し額そのものの検証に集中する。
 */

import { describe, expect, test } from "vitest";
import rules2026 from "../../rules/2026.json";
import type { Assumptions, Household, OneTimeEvent, RuleSet } from "../types/index.js";
import { runDeterministic } from "../pipeline.js";

const rules = rules2026 as unknown as RuleSet;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected value to be defined");
  return value;
}

const household: Household = {
  schemaVersion: 1,
  persons: [
    {
      id: "solo",
      birthYearMonth: "1990-01",
      employment: { type: "salaried", healthInsurance: "kyokai-kenpo" },
      incomeCurve: [{ age: 0, monthlyBase: 400000, bonusAnnual: 0, indexation: "fixed" }],
      retirementAge: 65,
      deductions: {}
    }
  ],
  children: [],
  municipality: "koto-ku",
  baseExpenses: [{ label: "生活費", monthly: 200000, indexation: "fixed" }],
  financialAssets: [
    { assetClassId: "cash", account: "cash", balance: 3000000, costBasis: 3000000 },
    { assetClassId: "global-equity", account: "taxable", balance: 1500000, costBasis: 1000000 },
    {
      assetClassId: "global-equity",
      account: "nisa-tsumitate",
      balance: 1000000,
      costBasis: 1000000,
      nisaLifetimeUsed: 1000000
    }
  ],
  savingsPolicy: {
    cashBufferMonths: 6,
    // わざと課税口座への行を含めない: 拠出フェーズ中の課税口座残高を固定し、
    // 取り崩しフェーズの検証額(withdrawals合計)を予測可能にするため。
    contributions: [{ account: "nisa-tsumitate", monthlyCap: 50000, assetClassId: "global-equity" }],
    drawdown: { strategy: "fixed-amount", value: 0, order: ["taxable", "nisa-tsumitate"] }
  }
};

const assumptions: Assumptions = {
  simulation: { startYear: 2026, endAge: 38, paths: 1, seed: 1 },
  inflation: { mean: 0, volatility: 0 },
  wageGrowth: { mean: 0, volatility: 0 },
  assetClasses: [{ id: "global-equity", expectedReturn: 0, volatility: 0 }],
  correlationMatrix: { factors: [], matrix: [] },
  baseRate: { initial: 0.01, model: "manual", manualPath: [{ year: 2026, rate: 0.01 }] },
  deterministicOverride: { inflation: 0, "wage-growth": 0 }
};

// 2027年に臨時支出1,000万円 — 保有する課税口座(150万)+NISAつみたて(初期100万+初年度拠出60万=160万)
// を合算した310万円を大きく上回る不足を発生させ、両口座が満額取り崩される決定論的な状況を作る。
const bigExpense: OneTimeEvent = {
  id: "big-expense",
  type: "one-time",
  label: "臨時支出",
  yearMonth: "2027-06",
  amount: 10000000
};

describe("貯蓄・投資パイプライン統合", () => {
  const result = runDeterministic(household, [bigExpense], assumptions, rules);
  const rows = result.deterministic;
  const y2026 = must(rows.find((r) => r.year === 2026));
  const y2027 = must(rows.find((r) => r.year === 2027));
  const y2028 = must(rows.find((r) => r.year === 2028));

  test("現金バッファを上回る年はNISAつみたて枠へ月額上限まで拠出する", () => {
    expect(y2026.invest.contributions).toBe(600000);
    expect(y2026.invest.withdrawals).toBe(0);
    expect(y2026.invest.nisaAnnualUsed.tsumitate).toBe(600000);
    expect(y2026.invest.nisaLifetimeUsed).toBe(1600000); // 初期100万 + 拠出60万
    expect(y2026.invest.balances["nisa-tsumitate"]).toBe(1600000);
    expect(y2026.invest.balances.taxable).toBe(1500000); // 拠出対象外なので不変
  });

  test("現金バッファを割る年はdrawdown.order(課税口座→NISA)の順で取り崩す", () => {
    expect(y2027.invest.contributions).toBe(0);
    // 課税口座(150万)+NISAつみたて(160万)を使い切る = 310万円
    expect(y2027.invest.withdrawals).toBe(3100000);
    expect(y2027.invest.balances.taxable).toBe(0);
    expect(y2027.invest.balances["nisa-tsumitate"]).toBe(0);
  });

  test("課税口座の取り崩しには含み益に対して譲渡所得税(20.315%)がかかる", () => {
    // gain = 1,500,000 - costBasis(1,000,000) = 500,000; tax = floor(500,000*0.20315) = 101,575
    expect(y2027.invest.capitalGainsTax).toBe(101575);
  });

  test("NISA売却分の簿価は当年の生涯枠消費額を減らさない(翌年復活)", () => {
    // 売却してもNISA lifetimeUsed は年内では変化しない(design doc: 復活は翌年)
    expect(y2027.invest.nisaLifetimeUsed).toBe(1600000);
  });

  test("NISA枠は売却翌年に簿価分だけ復活する", () => {
    // 2027年に売却したNISAつみたて分(簿価160万円)が2028年の生涯枠消費額から差し引かれる
    expect(y2028.invest.nisaLifetimeUsed).toBe(0);
  });
});
