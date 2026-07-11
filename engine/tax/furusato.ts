/**
 * ふるさと納税の全額控除上限額 (by-product output, design doc §7).
 *
 * limit = 住民税所得割額 × specialDeductionCapRate
 *         / ((1 − 住民税所得割率) − 所得税限界税率 × (1 + reconstructionSurtax))
 *         + selfPayAmount
 * Basis: 総務省ふるさと納税ポータル「税金の控除について」の特例控除額計算式
 * (特例控除は住民税所得割額の2割が上限)。率・自己負担額はすべて rules から参照する:
 * - specialDeductionCapRate / selfPayAmount: rules.furusatoNozei (地方税法第37条の2)
 * - reconstructionSurtax: rules.incomeTax.reconstructionSurtax (二重定義しない)
 * - 住民税所得割率: rules.residentTax.cityRate + rules.residentTax.prefRate から
 *   (1 − 所得割率) を導出 (二重定義しない)
 */

import type { RuleSet, Rate, Yen } from "../types/index.js";

export interface FurusatoInput {
  /** 住民税所得割額 (調整控除後) */
  residentIncomeLevy: Yen;
  /** 所得税の限界税率 (復興特別所得税前) */
  incomeTaxMarginalRate: Rate;
  rules: RuleSet;
}

export function furusatoNozeiLimit(input: FurusatoInput): Yen {
  const { residentIncomeLevy, incomeTaxMarginalRate, rules } = input;
  if (residentIncomeLevy <= 0) return 0;

  const { specialDeductionCapRate, selfPayAmount } = rules.furusatoNozei;
  const residentIncomeLevyRate = rules.residentTax.cityRate + rules.residentTax.prefRate;
  const surtaxMultiplier = 1 + rules.incomeTax.reconstructionSurtax;
  const denominator = 1 - residentIncomeLevyRate - incomeTaxMarginalRate * surtaxMultiplier;

  return Math.floor((residentIncomeLevy * specialDeductionCapRate) / denominator) + selfPayAmount;
}
