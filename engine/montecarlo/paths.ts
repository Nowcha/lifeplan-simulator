/**
 * 資産クラスの年次リターン・基準金利の確率的パス生成(design doc §5
 * Assumptions.assetClasses/baseRate/correlationMatrix, §8 手順9)。
 *
 * スコープ(合意事項): インフレ率・賃金上昇率は Phase 4 v1 では決定論値
 * (mean固定)のまま据え置き、資産クラスのリターンと基準金利(mean-reverting
 * モデルのみ)だけを確率変動させる。インフレ・賃金の複利計算(income/curve.ts,
 * expenses/base.ts, expenses/education.ts)を「年次実現値の累積」へ作り直す
 * 大規模リファクタは別スコープとする。correlationMatrix.factors に
 * "inflation" 等が含まれていても、相関構造を保つために正規乱数ベクトルは
 * 毎年生成するが、その成分は消費しない(このモジュールが返すのは資産クラス
 * と base-rate の実現値のみ)。
 */

import type { Assumptions, Rate } from "../types/index.js";
import { buildBaseRatePath } from "../housing/baseRate.js";
import { cholesky, correlate } from "./correlation.js";
import { standardNormal, type Rng } from "./rng.js";

export const BASE_RATE_FACTOR_ID = "base-rate";

/**
 * Draw a log-normal simple return (design doc §5: "資産リターンは対数正規")
 * calibrated so that its ARITHMETIC mean/volatility match expectedReturn/
 * volatility exactly: with 1+R = exp(mu + sigma*z),
 *   sigma^2 = ln(1 + volatility^2 / (1+expectedReturn)^2)
 *   mu = ln(1+expectedReturn) - sigma^2/2
 * guarantees E[1+R] = 1+expectedReturn. Unlike an arithmetic-normal draw,
 * R is bounded below by -100% for any z (can't lose more than 100%).
 */
function logNormalReturn(expectedReturn: Rate, volatility: Rate, z: number): Rate {
  if (volatility <= 0) return expectedReturn;
  const variance = Math.log(1 + (volatility * volatility) / ((1 + expectedReturn) * (1 + expectedReturn)));
  const sigma = Math.sqrt(variance);
  const mu = Math.log(1 + expectedReturn) - variance / 2;
  return Math.exp(mu + sigma * z) - 1;
}

export interface FactorPaths {
  /** index = year - startYear */
  assetReturns: { [assetClassId: string]: Rate[] };
  /** index = year - startYear */
  baseRate: Rate[];
}

/** One correlated (or independent, if not listed in correlationMatrix.factors) standard normal draw per requested factor id, for a single year */
function drawYearShocks(
  factorIds: string[],
  correlationFactors: string[],
  choleskyFactor: number[][],
  rng: Rng
): Map<string, number> {
  const shocks = new Map<string, number>();

  if (correlationFactors.length > 0) {
    const independent = correlationFactors.map(() => standardNormal(rng));
    const correlated = correlate(choleskyFactor, independent);
    correlationFactors.forEach((id, i) => shocks.set(id, correlated[i] ?? 0));
  }

  for (const id of factorIds) {
    if (!shocks.has(id)) shocks.set(id, standardNormal(rng));
  }

  return shocks;
}

/**
 * Generate one Monte Carlo trial's realized asset-class returns and base
 * rate for every year in [startYear, endYear]. Consumes `rng` sequentially
 * — call once per trial with a shared, continuously-advancing Rng for
 * reproducible multi-trial runs (design doc §9: fixed seed → reproducible).
 */
export function generateFactorPaths(
  assumptions: Assumptions,
  startYear: number,
  endYear: number,
  rng: Rng
): FactorPaths {
  const assetClassIds = assumptions.assetClasses.map((a) => a.id);
  const wantsBaseRateShock = assumptions.baseRate.model === "mean-reverting";
  const factorIds = wantsBaseRateShock ? [...assetClassIds, BASE_RATE_FACTOR_ID] : assetClassIds;

  const correlationFactors = assumptions.correlationMatrix.factors;
  const choleskyFactor = cholesky(assumptions.correlationMatrix.matrix);

  const assetReturns: { [assetClassId: string]: Rate[] } = {};
  for (const id of assetClassIds) assetReturns[id] = [];
  const baseRate: Rate[] = [];

  // Manual base-rate paths have no defined stochastic component (no
  // volatility field); reuse the same deterministic interpolation as the
  // expected-value path, identically across every trial.
  const manualBaseRatePath = assumptions.baseRate.model === "manual"
    ? buildBaseRatePath(assumptions.baseRate, startYear, endYear)
    : undefined;

  let previousBaseRate = assumptions.baseRate.initial;
  const mr = assumptions.baseRate.meanReversion;

  for (let year = startYear; year <= endYear; year++) {
    const shocks = drawYearShocks(factorIds, correlationFactors, choleskyFactor, rng);

    for (const assetClass of assumptions.assetClasses) {
      const z = shocks.get(assetClass.id) ?? 0;
      assetReturns[assetClass.id]?.push(logNormalReturn(assetClass.expectedReturn, assetClass.volatility, z));
    }

    if (manualBaseRatePath) {
      baseRate.push(manualBaseRatePath.get(year) ?? assumptions.baseRate.initial);
      continue;
    }

    baseRate.push(previousBaseRate);
    if (mr) {
      const shock = shocks.get(BASE_RATE_FACTOR_ID) ?? 0;
      previousBaseRate = Math.max(
        0,
        previousBaseRate + mr.speed * (mr.longTermMean - previousBaseRate) + mr.volatility * shock
      );
    }
  }

  return { assetReturns, baseRate };
}
