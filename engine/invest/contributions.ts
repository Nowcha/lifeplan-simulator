/**
 * Step 8 拠出フェーズ(design doc §8 手順8): 現金バッファ充足後の余剰資金を
 * SavingsPolicy.contributions の優先順(NISAつみたて枠→成長枠→課税口座、
 * プロファイル側の並び順をそのまま使う)で配分する。各行の monthlyCap×12 で
 * 上限、NISA口座はさらに年間枠・生涯枠・成長サブ枠でも上限が掛かる。
 * rules.nisa が未読込みの場合、NISA口座への拠出は0円(他モジュールの
 * 「ルール未定義→適用なし」慣習に合わせる。例: housing/taxCredit.ts)。
 */

import type { NisaRules, SavingsPolicy, Yen } from "../types/index.js";
import { contribute, type HoldingsState } from "./holdings.js";
import { capNisaContribution, recordNisaContribution, type NisaState } from "./nisa.js";

export interface ContributionResult {
  holdings: HoldingsState;
  nisaState: NisaState;
  nisaAnnualUsed: { tsumitate: Yen; growth: Yen };
  totalContributed: Yen;
}

export function applyContributions(
  policy: SavingsPolicy["contributions"],
  surplus: Yen,
  holdings: HoldingsState,
  nisaState: NisaState,
  nisaRules: NisaRules | undefined
): ContributionResult {
  let remaining = Math.max(0, surplus);
  let currentHoldings = holdings;
  let currentNisa = nisaState;
  let tsumitateUsed = 0;
  let growthUsed = 0;
  let totalContributed = 0;

  for (const rule of policy) {
    if (remaining <= 0) break;
    const requested = Math.min(remaining, rule.monthlyCap * 12);
    let amount = requested;

    if (rule.account === "nisa-tsumitate" || rule.account === "nisa-growth") {
      if (!nisaRules) {
        amount = 0;
      } else {
        const usedSoFar = rule.account === "nisa-tsumitate" ? tsumitateUsed : growthUsed;
        amount = capNisaContribution(rule.account, requested, usedSoFar, currentNisa, nisaRules);
        currentNisa = recordNisaContribution(rule.account, amount, currentNisa);
        if (rule.account === "nisa-tsumitate") tsumitateUsed += amount;
        else growthUsed += amount;
      }
    }

    if (amount > 0) {
      currentHoldings = contribute(currentHoldings, rule.account, rule.assetClassId, amount);
      remaining -= amount;
      totalContributed += amount;
    }
  }

  return {
    holdings: currentHoldings,
    nisaState: currentNisa,
    nisaAnnualUsed: { tsumitate: tsumitateUsed, growth: growthUsed },
    totalContributed
  };
}
