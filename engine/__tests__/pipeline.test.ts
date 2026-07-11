import { describe, expect, test } from "vitest";
import rules2026 from "../../rules/2026.json";
import household from "../../profile.sample/household.json";
import assumptions from "../../profile.sample/assumptions.json";
import type { Assumptions, Household, RuleSet } from "../types/index.js";
import { runDeterministic } from "../pipeline.js";

const rules = rules2026 as RuleSet;
const sampleHousehold = household as Household;
const sampleAssumptions = assumptions as Assumptions;

describe("決定論パイプライン (サンプル世帯)", () => {
  const result = runDeterministic(sampleHousehold, [], sampleAssumptions, rules);
  const rows = result.deterministic;

  test("最年長者がendAgeに達するまでの年次行を出力する (2026〜2056 = 31行)", () => {
    expect(rows.length).toBe(31);
    expect(rows[0]?.year).toBe(2026);
    expect(rows[rows.length - 1]?.year).toBe(2056);
  });

  test("初年度の住民税は「前年所得=当年」の仮定で計上される", () => {
    const first = rows[0];
    expect(first).toBeDefined();
    if (!first) return;
    for (const personId of Object.keys(first.income)) {
      expect(first.income[personId]?.residentTax).toBeGreaterThan(0);
    }
  });

  test("2年目の住民税は初年度所得から計算した額と一致する(前年課税の再現)", () => {
    const first = rows[0];
    const second = rows[1];
    expect(first && second).toBeTruthy();
    if (!first || !second) return;
    // 賃金上昇率>0なので2年目の給与は増えるが、住民税は前年(初年度)所得ベース。
    // 初年度は「前年=当年」仮定なので、初年度と2年目の住民税は同額になるはず。
    for (const personId of Object.keys(first.income)) {
      expect(second.income[personId]?.residentTax).toBe(first.income[personId]?.residentTax);
    }
  });

  test("退職後(65歳以降)は給与収入ゼロ", () => {
    const lastRow = rows[rows.length - 1];
    expect(lastRow).toBeDefined();
    if (!lastRow) return;
    expect(lastRow.income["partner-a"]?.gross).toBe(0);
  });

  test("手取り = 額面 − 社保 − 所得税 − 住民税", () => {
    for (const row of rows) {
      for (const personId of Object.keys(row.income)) {
        const r = row.income[personId];
        if (!r) continue;
        expect(r.net).toBe(r.gross - r.socialInsurance - r.incomeTax - r.residentTax);
      }
    }
  });

  test("現金残高は毎年の収支の累積になっている", () => {
    const first = rows[0];
    expect(first).toBeDefined();
    if (!first) return;
    const netTotal = Object.values(first.income).reduce((s, r) => s + r.net, 0);
    const expenseTotal = first.expenses.reduce((s, e) => s + e.amount, 0);
    expect(first.cashBalance).toBe(6000000 + netTotal - expenseTotal);
  });

  test("同一入力で結果が再現する(純粋関数)", () => {
    const again = runDeterministic(sampleHousehold, [], sampleAssumptions, rules);
    expect(again).toEqual(result);
  });

  test("ふるさと納税限度額が副産物として出力される", () => {
    const first = rows[0];
    if (!first) return;
    expect(first.furusatoNozeiLimit["partner-a"]).toBeGreaterThan(0);
  });
});
