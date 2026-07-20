/**
 * 感度分析/トルネードチャート用データ(design doc §7 MonteCarloSummary.sensitivity:
 * "各前提を±1σ動かしたときの最終資産中央値の変化")。
 *
 * Phase 4 v1でモンテカルロが確率変動させる前提(資産クラスのリターン・
 * mean-reverting基準金利の長期平均)それぞれについて、その前提の平均を
 * ±1σ(その前提自身のvolatility)だけ動かしたシナリオでモンテカルロを
 * 再実行し(他の前提・乱数シードは固定して比較可能にする)、最終年の
 * 資産中央値(p50)を low/high として返す。low<high が保証されるとは
 * 限らない(例: 基準金利は上がるほど住宅ローン利息が増え純資産が下がる
 * ことがある) — トルネードチャート側で符号を判断する。
 */

import type { Assumptions, Household, LifeEvent, Rate, RuleSet, Yen } from "../types/index.js";
import type { PipelineOptions } from "../pipeline.js";
import { BASE_RATE_FACTOR_ID } from "./paths.js";
import { runMonteCarlo } from "./run.js";

export interface SensitivityFactor {
  factor: string;
  low: Yen;
  high: Yen;
}

function medianFinalNetWorth(
  household: Household,
  events: LifeEvent[],
  assumptions: Assumptions,
  rules: RuleSet,
  pipelineOptions?: PipelineOptions
): Yen {
  const summary = runMonteCarlo(household, events, assumptions, rules, pipelineOptions);
  const p50 = summary.percentiles.find((p) => p.p === 50);
  return p50?.netWorthByYear.at(-1) ?? 0;
}

function withAssetClassReturn(assumptions: Assumptions, assetClassId: string, expectedReturn: Rate): Assumptions {
  return {
    ...assumptions,
    assetClasses: assumptions.assetClasses.map((a) => (a.id === assetClassId ? { ...a, expectedReturn } : a))
  };
}

function withBaseRateLongTermMean(assumptions: Assumptions, longTermMean: Rate): Assumptions {
  const mr = assumptions.baseRate.meanReversion;
  if (!mr) return assumptions;
  return { ...assumptions, baseRate: { ...assumptions.baseRate, meanReversion: { ...mr, longTermMean } } };
}

export function runSensitivity(
  household: Household,
  events: LifeEvent[],
  assumptions: Assumptions,
  rules: RuleSet,
  pipelineOptions?: PipelineOptions
): SensitivityFactor[] {
  const results: SensitivityFactor[] = [];

  for (const assetClass of assumptions.assetClasses) {
    const low = withAssetClassReturn(assumptions, assetClass.id, assetClass.expectedReturn - assetClass.volatility);
    const high = withAssetClassReturn(assumptions, assetClass.id, assetClass.expectedReturn + assetClass.volatility);
    results.push({
      factor: assetClass.id,
      low: medianFinalNetWorth(household, events, low, rules, pipelineOptions),
      high: medianFinalNetWorth(household, events, high, rules, pipelineOptions)
    });
  }

  const mr = assumptions.baseRate.meanReversion;
  if (assumptions.baseRate.model === "mean-reverting" && mr) {
    const low = withBaseRateLongTermMean(assumptions, mr.longTermMean - mr.volatility);
    const high = withBaseRateLongTermMean(assumptions, mr.longTermMean + mr.volatility);
    results.push({
      factor: BASE_RATE_FACTOR_ID,
      low: medianFinalNetWorth(household, events, low, rules, pipelineOptions),
      high: medianFinalNetWorth(household, events, high, rules, pipelineOptions)
    });
  }

  return results;
}
