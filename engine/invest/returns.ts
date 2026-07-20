/**
 * Step 9 (design doc §8 手順9): 資産クラスごとの当年リターン実現値を解決する。
 * 決定論パスでは inflation/wage-growth と同じ deterministicOverride の仕組みで
 * 固定値を注入できるようにし、指定が無ければ assetClasses[].expectedReturn
 * (期待値)を使う — モンテカルロ paths→∞ で決定論パスに収束する設計(§9)。
 */

import type { Assumptions, Rate } from "../types/index.js";
import { applyReturns, type HoldingsState } from "./holdings.js";

export function returnRateFor(assetClassId: string, assumptions: Assumptions): Rate {
  const override = assumptions.deterministicOverride?.[assetClassId];
  if (override !== undefined) return override;
  const assetClass = assumptions.assetClasses.find((a) => a.id === assetClassId);
  return assetClass?.expectedReturn ?? 0;
}

export function applyAnnualReturns(holdings: HoldingsState, assumptions: Assumptions): HoldingsState {
  return applyReturns(holdings, (assetClassId) => returnRateFor(assetClassId, assumptions));
}
