/**
 * Demo: run the deterministic pipeline on the sample household (profile.sample/)
 * and print a 30+ year annual cash-flow table.
 *
 * Usage: npm run demo
 * Note: this script does file I/O; the engine itself stays pure.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Assumptions, EducationCosts, Household, LifeEvent, RuleSet } from "../engine/types/index.js";
import { runDeterministic } from "../engine/pipeline.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadJson<T>(relativePath: string): T {
  try {
    return JSON.parse(readFileSync(path.join(root, relativePath), "utf-8")) as T;
  } catch (error) {
    console.error(`Failed to load ${relativePath}:`, error);
    throw error;
  }
}

const household = loadJson<Household>(path.join("profile.sample", "household.json"));
const events = loadJson<LifeEvent[]>(path.join("profile.sample", "events.json"));
const assumptions = loadJson<Assumptions>(path.join("profile.sample", "assumptions.json"));
// rules/education-costs.json is a separate file (MEXT survey stats, not year-specific
// tax/social-insurance policy) and is merged into the single RuleSet passed to the engine.
const educationCosts = loadJson<EducationCosts>(path.join("rules", "education-costs.json"));
const rules: RuleSet = {
  ...loadJson<RuleSet>(path.join("rules", "2026.json")),
  educationCosts
};

const result = runDeterministic(household, events, assumptions, rules);

const yen = (v: number): string => (v / 10000).toFixed(0).padStart(7) + "万";

console.log("=== lifeplan-sim フェーズ1-2 デモ: サンプル世帯(夫婦・子1人・賃貸) ===");
console.log("※ 本ツールは税務相談・投資助言ではありません。制度の概算シミュレーションです。\n");
console.log(
  "年    " +
    "年齢      " +
    "額面計    " +
    "社保計    " +
    "所得税    " +
    "住民税    " +
    "手取り計  " +
    "支出計    " +
    "現金残高   " +
    "警告"
);

for (const row of result.deterministic) {
  const ages = Object.values(row.ages)
    .map((a) => String(a).padStart(2))
    .join("/");
  const persons = Object.values(row.income);
  const gross = persons.reduce((s, p) => s + p.gross, 0);
  const si = persons.reduce((s, p) => s + p.socialInsurance, 0);
  const incomeTax = persons.reduce((s, p) => s + p.incomeTax, 0);
  const residentTax = persons.reduce((s, p) => s + p.residentTax, 0);
  const net = persons.reduce((s, p) => s + p.net, 0);
  const expenses = row.expenses.reduce((s, e) => s + e.amount, 0);
  console.log(
    `${row.year}  ${ages}   ${yen(gross)} ${yen(si)} ${yen(incomeTax)} ${yen(residentTax)} ` +
      `${yen(net)} ${yen(expenses)} ${yen(row.cashBalance)}  ${row.liquidityAlert ? "⚠流動性" : ""}`
  );
}

const first = result.deterministic[0];
if (first) {
  console.log("\n--- 初年度(2026)の内訳 ---");
  for (const [personId, income] of Object.entries(first.income)) {
    console.log(
      `${personId}: 額面 ${income.gross.toLocaleString()}円 / 社保 ${income.socialInsurance.toLocaleString()}円 / ` +
        `所得税 ${income.incomeTax.toLocaleString()}円 / 住民税 ${income.residentTax.toLocaleString()}円 / ` +
        `手取り ${income.net.toLocaleString()}円 / ふるさと納税上限目安 ${(
          first.furusatoNozeiLimit[personId] ?? 0
        ).toLocaleString()}円`
    );
  }
  console.log("\n--- 初年度(2026)の支出内訳 ---");
  for (const line of first.expenses) {
    console.log(`${line.category}: ${line.amount.toLocaleString()}円`);
  }
}

// 車の買い替え(7年ごと)が計上される年の支出内訳を確認
const carYear = result.deterministic.find((row) => row.year === 2033);
if (carYear) {
  console.log("\n--- 車の買い替え年(2033)の支出内訳 ---");
  for (const line of carYear.expenses) {
    console.log(`${line.category}: ${line.amount.toLocaleString()}円`);
  }
}
