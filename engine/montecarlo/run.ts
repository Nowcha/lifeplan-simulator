/**
 * モンテカルロ試行の実行(design doc §7 MonteCarloSummary, §8, §9)。
 * assumptions.simulation.paths 回、runDeterministic を「1本の確率的パス」
 * として評価する — 各試行は generateFactorPaths が生成した資産クラス
 * リターン・基準金利の実現値を PipelineOptions.stochasticPaths 経由で注入し、
 * それ以外(所得・税・給付・支出・ローン月次計算等)は決定論パスと同じロジックを通す。
 * RNGは全試行を通じて1本のストリームを連続消費するので、seed固定で
 * 全体の結果が再現する(design doc §9)。
 */

import type { Assumptions, Household, LifeEvent, MonteCarloSummary, RuleSet, Yen } from "../types/index.js";
import { runDeterministic, type PipelineOptions } from "../pipeline.js";
import { parseYearMonth } from "../util/yearmonth.js";
import { computeDepletionProbability, computePercentiles, type MonteCarloPercentile } from "./aggregate.js";
import { generateFactorPaths } from "./paths.js";
import { createRng } from "./rng.js";

const DEFAULT_PERCENTILES: MonteCarloPercentile[] = [10, 25, 50, 75, 90];

export function runMonteCarlo(
  household: Household,
  events: LifeEvent[],
  assumptions: Assumptions,
  rules: RuleSet,
  pipelineOptions?: PipelineOptions
): MonteCarloSummary {
  const { startYear, endAge, paths, seed } = assumptions.simulation;
  // Mirrors pipeline.ts's own endYear derivation (oldest person reaches endAge).
  const oldestBirthYear = Math.min(...household.persons.map((p) => parseYearMonth(p.birthYearMonth).year));
  const endYear = oldestBirthYear + endAge;
  const oldestPersonId = household.persons.find(
    (p) => parseYearMonth(p.birthYearMonth).year === oldestBirthYear
  )?.id;

  const rng = createRng(seed);
  const netWorthByTrial: Yen[][] = [];
  /** 現金+換金可能資産(design doc §7 depletionProbabilityの定義対象、netWorthとは異なり住宅評価額・ローン残高を含まない) */
  const liquidAssetsByTrial: Yen[][] = [];
  /** 枯渇した試行について、最年長者(endAgeの基準人物)が最初に枯渇した年の年齢 */
  const depletionAges: number[] = [];

  for (let trial = 0; trial < paths; trial++) {
    const factorPaths = generateFactorPaths(assumptions, startYear, endYear, rng);
    const baseRateMap = new Map<number, number>();
    factorPaths.baseRate.forEach((rate, i) => baseRateMap.set(startYear + i, rate));

    const result = runDeterministic(household, events, assumptions, rules, {
      ...pipelineOptions,
      stochasticPaths: { baseRate: baseRateMap, assetReturns: factorPaths.assetReturns }
    });
    const rows = result.deterministic;

    netWorthByTrial.push(rows.map((row) => row.netWorth));
    const liquidAssets = rows.map(
      (row) => row.cashBalance + Object.values(row.invest.balances).reduce((sum, v) => sum + v, 0)
    );
    liquidAssetsByTrial.push(liquidAssets);

    if (oldestPersonId) {
      const depletionYearIndex = liquidAssets.findIndex((v) => v < 0);
      const age = depletionYearIndex === -1 ? undefined : rows[depletionYearIndex]?.ages[oldestPersonId];
      if (age !== undefined) depletionAges.push(age);
    }
  }

  return {
    percentiles: computePercentiles(netWorthByTrial, DEFAULT_PERCENTILES),
    depletionProbability: computeDepletionProbability(liquidAssetsByTrial),
    depletionAgeDistribution: depletionAges
  };
}
