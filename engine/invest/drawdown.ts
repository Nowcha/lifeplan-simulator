/**
 * Step 8 取り崩しフェーズ(design doc §8 手順8): 現金バッファを割った年に、
 * 不足額ちょうどを SavingsPolicy.drawdown.order の順で取り崩す(口座内に
 * 複数assetClassIdの保有があれば全て対象にする)。課税は元本超過分にのみ
 * 発生し(capitalGains.ts)、税による目減り分を穴埋めするための追加取り崩し
 * (グロスアップ)は行わない — 取り崩し目標額はあくまで不足額そのもの
 * (ドキュメント化された簡略化)。rules.capitalGainsTax が未読込みの場合は
 * 税率0%として扱う(「ルール未定義→適用なし」慣習に合わせる)。
 * NISA口座からの売却分の簿価は非課税だが、design doc §5の通り生涯枠は
 * 翌年に簿価分だけ復活する — その値は soldNisaCostBasis として返し、
 * 呼び出し側が翌年の NisaState に restoreNisaQuota で適用する。
 */

import type { CapitalGainsTaxRules, SavingsPolicy, Yen } from "../types/index.js";
import { withdrawFromTaxableAccount } from "./capitalGains.js";
import { withdraw, type HoldingsState } from "./holdings.js";

export interface DrawdownResult {
  holdings: HoldingsState;
  totalWithdrawn: Yen;
  capitalGainsTax: Yen;
  netProceeds: Yen;
  soldNisaCostBasis: { tsumitate: Yen; growth: Yen };
}

export function applyDrawdown(
  order: SavingsPolicy["drawdown"]["order"],
  shortfall: Yen,
  holdings: HoldingsState,
  capitalGainsTaxRules: CapitalGainsTaxRules | undefined
): DrawdownResult {
  let remaining = Math.max(0, shortfall);
  let currentHoldings = holdings;
  let totalWithdrawn = 0;
  let capitalGainsTax = 0;
  const soldNisaCostBasis = { tsumitate: 0, growth: 0 };
  const rate = capitalGainsTaxRules?.rate ?? 0;

  for (const account of order) {
    if (remaining <= 0) break;
    const keys = Object.keys(currentHoldings).filter((k) => currentHoldings[k]?.account === account);

    for (const key of keys) {
      if (remaining <= 0) break;
      const holding = currentHoldings[key];
      if (!holding) continue;
      const requested = Math.min(remaining, holding.balance);
      if (requested <= 0) continue;

      if (account === "taxable") {
        const result = withdrawFromTaxableAccount(requested, holding, rate);
        currentHoldings = { ...currentHoldings, [key]: { ...holding, ...result.updatedHolding } };
        totalWithdrawn += requested;
        capitalGainsTax += result.tax;
        remaining -= requested;
      } else {
        const result = withdraw(currentHoldings, key, requested);
        currentHoldings = result.holdings;
        totalWithdrawn += result.withdrawn;
        remaining -= result.withdrawn;
        if (account === "nisa-growth") soldNisaCostBasis.growth += result.costBasisRemoved;
        else soldNisaCostBasis.tsumitate += result.costBasisRemoved;
      }
    }
  }

  return {
    holdings: currentHoldings,
    totalWithdrawn,
    capitalGainsTax,
    netProceeds: totalWithdrawn - capitalGainsTax,
    soldNisaCostBasis
  };
}
