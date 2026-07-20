/**
 * NISA quota bookkeeping (design doc §5 NisaRules, §8 手順8, §9 property tests):
 * 生涯枠1800万円(うち成長投資枠1200万円)、年間枠(つみたて120万/成長240万)、
 * 売却翌年に簿価ベースで枠復活。
 *
 * Simplification: the household schema (`Household.financialAssets`) does
 * not attribute holdings to an individual person, so quota is tracked at
 * HOUSEHOLD granularity — a two-earner household is capped at a single
 * 18,000,000 lifetime quota here, not 36,000,000 (one per person). Modeling
 * per-person NISA accounts would require adding a personId to AssetHolding,
 * which is a profile-schema change out of this phase's scope.
 */

import type { NisaRules, Rate, Yen } from "../types/index.js";

export interface NisaState {
  /** 生涯枠消費額 (つみたて+成長合算、売却復活後) */
  lifetimeUsed: Yen;
  /** うち成長投資枠消費額 (売却復活後) */
  growthUsed: Yen;
}

export type NisaAccount = "nisa-tsumitate" | "nisa-growth";

/** Cap a requested contribution to one NISA account against annual + lifetime (+ growth sub-cap) room */
export function capNisaContribution(
  account: NisaAccount,
  requested: Yen,
  annualUsedSoFar: Yen,
  state: NisaState,
  rules: NisaRules
): Yen {
  const annualCap = account === "nisa-tsumitate" ? rules.annualTsumitate : rules.annualGrowth;
  const annualRoom = Math.max(0, annualCap - annualUsedSoFar);
  const lifetimeRoom = Math.max(0, rules.lifetimeCap - state.lifetimeUsed);
  const growthRoom =
    account === "nisa-growth" ? Math.max(0, rules.growthLifetimeCap - state.growthUsed) : Infinity;
  return Math.max(0, Math.min(requested, annualRoom, lifetimeRoom, growthRoom));
}

/** Record a contribution already capped by capNisaContribution */
export function recordNisaContribution(account: NisaAccount, amount: Yen, state: NisaState): NisaState {
  return {
    lifetimeUsed: state.lifetimeUsed + amount,
    growthUsed: state.growthUsed + (account === "nisa-growth" ? amount : 0)
  };
}

/**
 * Restore quota by the COST BASIS (not market value) of NISA holdings sold
 * this year. Per design doc: restoration lands the FOLLOWING year, so the
 * caller applies this to next year's opening NisaState, not the current one.
 */
export function restoreNisaQuota(state: NisaState, soldCostBasis: { tsumitate: Yen; growth: Yen }): NisaState {
  return {
    lifetimeUsed: Math.max(0, state.lifetimeUsed - soldCostBasis.tsumitate - soldCostBasis.growth),
    growthUsed: Math.max(0, state.growthUsed - soldCostBasis.growth)
  };
}

/** Unused import guard: Rate is re-exported for callers composing NISA + tax logic together */
export type { Rate };
