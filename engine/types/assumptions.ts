/** Design doc §5: simulation assumptions (profile/assumptions.json) */

import type { Rate } from "./common.js";

export interface Assumptions {
  simulation: {
    startYear: number;
    /** Simulate until the oldest person reaches this age */
    endAge: number;
    /** Monte Carlo trials (e.g. 10000) */
    paths: number;
    /** Fixed seed for reproducibility */
    seed: number;
  };
  inflation: StochasticVar;
  wageGrowth: StochasticVar;
  assetClasses: {
    id: string;
    /** Nominal annual expected return */
    expectedReturn: Rate;
    volatility: Rate;
  }[];
  /** Correlation matrix over asset classes + inflation + base-rate (symmetric, positive definite) */
  correlationMatrix: {
    factors: string[];
    matrix: number[][];
  };
  /** Housing loan base rate model */
  baseRate: {
    initial: Rate;
    model: "manual" | "mean-reverting";
    manualPath?: { year: number; rate: Rate }[];
    /** Vasicek: dr = a(b - r)dt + σdW, floored at 0 */
    meanReversion?: { speed: number; longTermMean: Rate; volatility: Rate };
  };
  /** Fixed-value overrides for deterministic mode (Monte Carlo off) */
  deterministicOverride?: { [factorId: string]: Rate };
}

export interface StochasticVar {
  mean: Rate;
  volatility: Rate;
}
