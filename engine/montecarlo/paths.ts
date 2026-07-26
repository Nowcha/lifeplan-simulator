/**
 * 資産クラスの年次リターン・基準金利の確率的パス生成(design doc §5
 * Assumptions.assetClasses/baseRate/correlationMatrix, §8 手順9)。
 *
 * 資産クラスのリターン・基準金利に加えて、インフレ率・賃金上昇率も確率変動
 * させる。これらは correlationMatrix.factors に含めれば資産クラスと相関を
 * 持たせられる(例: 株式とインフレを正の相関にする)。volatility が 0 の指標は
 * 実現値が毎年 mean と一致するので、決定論パスと同じ挙動になる。
 */

import type { Assumptions, Rate } from "../types/index.js";
import { buildBaseRatePath } from "../housing/baseRate.js";
import { cholesky, correlate } from "./correlation.js";
import { standardNormal, type Rng } from "./rng.js";

export const BASE_RATE_FACTOR_ID = "base-rate";
/** correlationMatrix.factors でインフレ・賃金上昇率を指す固定ID */
export const INFLATION_FACTOR_ID = "inflation";
export const WAGE_GROWTH_FACTOR_ID = "wage-growth";

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
  /** index = year - startYear */
  inflation: Rate[];
  /** index = year - startYear */
  wageGrowth: Rate[];
}

/**
 * インフレ・賃金上昇率は資産リターンと違って正負どちらにも振れる素の率なので、
 * 対数正規ではなく正規分布で引く(-100%の下限を課す意味がない)。
 */
function normalRate(mean: Rate, volatility: Rate, z: number): Rate {
  return volatility <= 0 ? mean : mean + volatility * z;
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
  const factorIds = [
    ...assetClassIds,
    ...(wantsBaseRateShock ? [BASE_RATE_FACTOR_ID] : []),
    INFLATION_FACTOR_ID,
    WAGE_GROWTH_FACTOR_ID
  ];

  const correlationFactors = assumptions.correlationMatrix.factors;
  const choleskyFactor = cholesky(assumptions.correlationMatrix.matrix);

  const assetReturns: { [assetClassId: string]: Rate[] } = {};
  for (const id of assetClassIds) assetReturns[id] = [];
  const baseRate: Rate[] = [];
  const inflation: Rate[] = [];
  const wageGrowth: Rate[] = [];

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

    inflation.push(
      normalRate(assumptions.inflation.mean, assumptions.inflation.volatility, shocks.get(INFLATION_FACTOR_ID) ?? 0)
    );
    wageGrowth.push(
      normalRate(
        assumptions.wageGrowth.mean,
        assumptions.wageGrowth.volatility,
        shocks.get(WAGE_GROWTH_FACTOR_ID) ?? 0
      )
    );

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

  return { assetReturns, baseRate, inflation, wageGrowth };
}
