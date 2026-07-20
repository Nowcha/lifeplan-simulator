/**
 * 感度分析/トルネードチャート用データ(design doc §7 MonteCarloSummary.sensitivity:
 * "各前提を±1σ動かしたときの最終資産中央値の変化")。
 *
 * Phase 4 v1でモンテカルロが確率変動させる前提(資産クラスのリターン・
 * mean-reverting基準金利の長期平均)それぞれについて、その前提の平均を
 * 動かしたシナリオでモンテカルロを再実行し(他の前提・乱数シードは固定して
 * 比較可能にする)、最終年の資産中央値(p50)を low/high として返す。
 *
 * シフト幅は「年率volatilityそのもの」ではなく、シミュレーション年数Nに対する
 * 標準誤差 volatility/√N を使う。理由: このシミュレーションは複利なので、
 * 仮に年率volatility(例: 世界株式18%)をそのまま毎年ずっと乗せ続けると、
 * 31年複利でリターンが数百倍に達し、実際のモンテカルロ分布(p10〜p90)から
 * 何桁も外れた非現実的な値になる(検証時に実測: 単純に±volatilityを適用した
 * 結果、最終資産が5億円超に達し、同条件のモンテカルロp90(3億円弱)を大きく
 * 上回った)。標準誤差を使うのは「長期平均リターンの見積もりが±1σ分だけ
 * ズレていたら」という意味での感度分析であり、「毎年ずっと1σ分ズレ続ける」
 * という意味ではないため、統計的にはこちらが正しい解釈。
 *
 * low<high が保証されるとは限らない(例: 基準金利は上がるほど住宅ローン
 * 利息が増え純資産が下がることがある) — トルネードチャート側で符号を判断する。
 */

import type { Assumptions, Household, LifeEvent, Rate, RuleSet, Yen } from "../types/index.js";
import type { PipelineOptions } from "../pipeline.js";
import { parseYearMonth } from "../util/yearmonth.js";
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

/** Mirrors pipeline.ts / run.ts's own endYear derivation (oldest person reaches endAge) */
function yearsSimulated(household: Household, assumptions: Assumptions): number {
  const oldestBirthYear = Math.min(...household.persons.map((p) => parseYearMonth(p.birthYearMonth).year));
  const endYear = oldestBirthYear + assumptions.simulation.endAge;
  return Math.max(1, endYear - assumptions.simulation.startYear + 1);
}

/** Standard error of the long-run mean, given N independent annual draws of the given volatility */
function standardError(volatility: Rate, years: number): Rate {
  return volatility / Math.sqrt(years);
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
  const years = yearsSimulated(household, assumptions);

  for (const assetClass of assumptions.assetClasses) {
    const shift = standardError(assetClass.volatility, years);
    const low = withAssetClassReturn(assumptions, assetClass.id, assetClass.expectedReturn - shift);
    const high = withAssetClassReturn(assumptions, assetClass.id, assetClass.expectedReturn + shift);
    results.push({
      factor: assetClass.id,
      low: medianFinalNetWorth(household, events, low, rules, pipelineOptions),
      high: medianFinalNetWorth(household, events, high, rules, pipelineOptions)
    });
  }

  const mr = assumptions.baseRate.meanReversion;
  if (assumptions.baseRate.model === "mean-reverting" && mr) {
    const shift = standardError(mr.volatility, years);
    const low = withBaseRateLongTermMean(assumptions, mr.longTermMean - shift);
    const high = withBaseRateLongTermMean(assumptions, mr.longTermMean + shift);
    results.push({
      factor: BASE_RATE_FACTOR_ID,
      low: medianFinalNetWorth(household, events, low, rules, pipelineOptions),
      high: medianFinalNetWorth(household, events, high, rules, pipelineOptions)
    });
  }

  return results;
}
