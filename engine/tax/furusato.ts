/**
 * ふるさと納税の全額控除上限額 (by-product output, design doc §7).
 *
 * limit = 住民税所得割額 × 20% / (90% − 所得税限界税率 × 1.021) + 2,000
 * Basis: 総務省ふるさと納税ポータル「税金の控除について」の特例控除額計算式
 * (特例控除は住民税所得割額の2割が上限)。
 */

import type { Rate, Yen } from "../types/index.js";

export interface FurusatoInput {
  /** 住民税所得割額 (調整控除後) */
  residentIncomeLevy: Yen;
  /** 所得税の限界税率 (復興特別所得税前) */
  incomeTaxMarginalRate: Rate;
}

export function furusatoNozeiLimit(input: FurusatoInput): Yen {
  const { residentIncomeLevy, incomeTaxMarginalRate } = input;
  if (residentIncomeLevy <= 0) return 0;
  const denominator = 0.9 - incomeTaxMarginalRate * 1.021;
  return Math.floor((residentIncomeLevy * 0.2) / denominator) + 2000;
}
