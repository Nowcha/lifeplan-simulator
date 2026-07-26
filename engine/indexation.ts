/**
 * インフレ・賃金・教育費の「経過年数 → 累積倍率」を供給する(design doc §8 手順1・6)。
 *
 * 決定論パスは一定率の複利なので `(1+r)^n` をそのまま使う。モンテカルロでは
 * 年ごとに実現値が違うため、累積は `∏(1+r_i)` になる。両者を同じ関数シグネチャ
 * で扱えるようにして、複利を使う側(income/curve.ts, expenses/*.ts)が
 * 決定論か確率かを意識しなくて済むようにする。
 *
 * 決定論側をあえて累積積で書き直していないのは、`(1+r)^n` と n回の乗算が
 * 浮動小数点で一致しないため。既存の期待値パスの結果を1円も動かさないことを
 * 優先している。
 */

import type { Rate } from "./types/index.js";

/** 経過年数を渡すと累積倍率を返す(0年経過なら必ず1) */
export type CumulativeFactor = (yearsElapsed: number) => number;

export interface IndexationFactors {
  inflation: CumulativeFactor;
  wage: CumulativeFactor;
  /** 教育費のインフレ(一般物価と別に置ける。設計書§5) */
  education: CumulativeFactor;
}

/** 一定率の複利。決定論パスと、volatilityが0の確率変動で使う。 */
export function constantFactor(rate: Rate): CumulativeFactor {
  return (yearsElapsed) => (yearsElapsed <= 0 ? 1 : Math.pow(1 + rate, yearsElapsed));
}

/**
 * 年次実現値の累積積。`annualRates[i]` はシミュレーション開始から i 年目に
 * 適用される率。範囲外の経過年数は端の値で頭打ちにする(パスより長い期間を
 * 引かれても破綻させない)。
 */
export function pathFactor(annualRates: readonly Rate[]): CumulativeFactor {
  // 累積を前計算する。毎回の呼び出しで先頭から掛け直すと O(n^2) になるため。
  const cumulative: number[] = [1];
  for (const rate of annualRates) {
    const previous = cumulative[cumulative.length - 1] ?? 1;
    cumulative.push(previous * (1 + rate));
  }

  return (yearsElapsed) => {
    if (yearsElapsed <= 0) return 1;
    return cumulative[Math.min(yearsElapsed, cumulative.length - 1)] ?? 1;
  };
}

/** 決定論パス用: 3つとも一定率 */
export function constantIndexation(rates: {
  inflation: Rate;
  wage: Rate;
  education: Rate;
}): IndexationFactors {
  return {
    inflation: constantFactor(rates.inflation),
    wage: constantFactor(rates.wage),
    education: constantFactor(rates.education)
  };
}
