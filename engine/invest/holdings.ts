/**
 * Per-(account, assetClass) holding bookkeeping shared by the contribution
 * and drawdown steps (design doc §8 手順8-9). Cost basis is tracked per
 * holding in aggregate and reduced proportionally to the average cost basis
 * on withdrawal ("総平均法に準ずる方法", same convention as capitalGains.ts).
 */

import type { AccountType, AssetHolding, Rate, Yen } from "../types/index.js";

export interface HoldingRecord {
  account: AccountType;
  assetClassId: string;
  balance: Yen;
  costBasis: Yen;
}

export type HoldingsState = { [key: string]: HoldingRecord };

export function holdingKey(account: AccountType, assetClassId: string): string {
  return `${account}:${assetClassId}`;
}

/** Seed holdings state from the household's opening financial assets (cash is tracked separately as cashBalance) */
export function initHoldings(financialAssets: AssetHolding[]): HoldingsState {
  const holdings: HoldingsState = {};
  for (const h of financialAssets) {
    if (h.account === "cash") continue;
    const key = holdingKey(h.account, h.assetClassId);
    const existing = holdings[key];
    holdings[key] = existing
      ? { ...existing, balance: existing.balance + h.balance, costBasis: existing.costBasis + h.costBasis }
      : { account: h.account, assetClassId: h.assetClassId, balance: h.balance, costBasis: h.costBasis };
  }
  return holdings;
}

/** Sum balances by account, for AnnualRow.invest.balances */
export function accountTotals(holdings: HoldingsState): { [account: string]: Yen } {
  const totals: { [account: string]: Yen } = {};
  for (const h of Object.values(holdings)) {
    totals[h.account] = (totals[h.account] ?? 0) + h.balance;
  }
  return totals;
}

/** Immutable contribution: adds to an existing (account, assetClass) holding or creates a new one; cost basis increases by the amount invested */
export function contribute(holdings: HoldingsState, account: AccountType, assetClassId: string, amount: Yen): HoldingsState {
  if (amount <= 0) return holdings;
  const key = holdingKey(account, assetClassId);
  const existing = holdings[key] ?? { account, assetClassId, balance: 0, costBasis: 0 };
  return { ...holdings, [key]: { ...existing, balance: existing.balance + amount, costBasis: existing.costBasis + amount } };
}

/** Cost basis attributable to a withdrawal, proportional to the holding's average cost basis */
export function proportionalCostBasis(withdrawal: Yen, holding: { balance: Yen; costBasis: Yen }): Yen {
  if (holding.balance <= 0) return 0;
  return Math.floor((holding.costBasis * withdrawal) / holding.balance);
}

/** Immutable withdrawal from a single holding by key: caps at the holding's balance, returns the actual amount withdrawn and cost basis removed */
export function withdraw(
  holdings: HoldingsState,
  key: string,
  requested: Yen
): { holdings: HoldingsState; withdrawn: Yen; costBasisRemoved: Yen } {
  const holding = holdings[key];
  if (!holding) return { holdings, withdrawn: 0, costBasisRemoved: 0 };
  const withdrawn = Math.max(0, Math.min(requested, holding.balance));
  const costBasisRemoved = proportionalCostBasis(withdrawn, holding);
  return {
    holdings: {
      ...holdings,
      [key]: { ...holding, balance: holding.balance - withdrawn, costBasis: holding.costBasis - costBasisRemoved }
    },
    withdrawn,
    costBasisRemoved
  };
}

/**
 * Step 9 (design doc §8): apply this year's realized return to every
 * holding's balance. Cost basis is untouched — market movement is not a
 * contribution or a sale. Rounded to the nearest yen per holding.
 */
export function applyReturns(holdings: HoldingsState, returnRateFor: (assetClassId: string) => Rate): HoldingsState {
  const next: HoldingsState = {};
  for (const [key, h] of Object.entries(holdings)) {
    const rate = returnRateFor(h.assetClassId);
    next[key] = { ...h, balance: Math.round(h.balance * (1 + rate)) };
  }
  return next;
}
