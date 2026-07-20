/**
 * Step 9 (design doc §8 手順9): 資産クラスごとの当年リターン実現値を解決する。
 * 優先順位: (1) 呼び出し側が注入した当年の実現値(モンテカルロ試行の
 * generateFactorPaths由来) → (2) deterministicOverride(決定論パスの固定値
 * 注入、inflation/wage-growthと同じ仕組み) → (3) assetClasses[].expectedReturn
 * (期待値) — モンテカルロ paths→∞ で決定論パスに収束する設計(§9)。
 */

import type { Assumptions, Rate } from "../types/index.js";
import { applyReturns, type HoldingsState } from "./holdings.js";

export function returnRateFor(assetClassId: string, assumptions: Assumptions, injected?: Rate): Rate {
  if (injected !== undefined) return injected;
  const override = assumptions.deterministicOverride?.[assetClassId];
  if (override !== undefined) return override;
  const assetClass = assumptions.assetClasses.find((a) => a.id === assetClassId);
  return assetClass?.expectedReturn ?? 0;
}

export function applyAnnualReturns(
  holdings: HoldingsState,
  assumptions: Assumptions,
  injectedByAssetClass?: { [assetClassId: string]: Rate }
): HoldingsState {
  return applyReturns(holdings, (assetClassId) =>
    returnRateFor(assetClassId, assumptions, injectedByAssetClass?.[assetClassId])
  );
}
