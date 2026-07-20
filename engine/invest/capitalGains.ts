/**
 * 譲渡所得税(課税口座の取り崩し時、design doc §8 手順8)。
 * 取得費は「総平均法に準ずる方法」(国税庁タックスアンサーNo.1464)に基づき、
 * 残高全体の簿価に対する平均取得費として按分する(銘柄別ロット管理はしない、
 * 按分計算そのものは holdings.ts と共有)。端数(1円未満)は切り捨て(源泉徴収実務に合わせる)。
 */

import type { Rate, Yen } from "../types/index.js";
import { proportionalCostBasis } from "./holdings.js";

export interface TaxableHolding {
  balance: Yen;
  costBasis: Yen;
}

export interface TaxableWithdrawal {
  tax: Yen;
  netProceeds: Yen;
  updatedHolding: TaxableHolding;
}

/** Capital gains tax on a withdrawal from a taxable account (loss positions owe no tax; losses are not carried forward) */
export function computeCapitalGainsTax(withdrawal: Yen, holding: TaxableHolding, rate: Rate): Yen {
  const capped = Math.max(0, Math.min(withdrawal, holding.balance));
  const gain = capped - proportionalCostBasis(capped, holding);
  return gain > 0 ? Math.floor(gain * rate) : 0;
}

/** Withdraw from a taxable account: caps at the available balance, withholds capital gains tax, and returns the updated holding */
export function withdrawFromTaxableAccount(withdrawal: Yen, holding: TaxableHolding, rate: Rate): TaxableWithdrawal {
  const capped = Math.max(0, Math.min(withdrawal, holding.balance));
  const tax = computeCapitalGainsTax(capped, holding, rate);
  const costBasisRemoved = proportionalCostBasis(capped, holding);

  return {
    tax,
    netProceeds: capped - tax,
    updatedHolding: {
      balance: holding.balance - capped,
      costBasis: holding.costBasis - costBasisRemoved
    }
  };
}
