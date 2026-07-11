/**
 * 給与所得 (salary income after 給与所得控除), computed directly from the
 * statutory piecewise table in rules — including the official 1/4-rounding
 * ("A" method: A = floor(income/4 to 1,000 yen) * 1,000) bands used below
 * 6.6M yen, which a naive percentage formula gets wrong by up to ~800 yen.
 */

import type { IncomeTaxRules, Yen } from "../types/index.js";
import { applyRate, floorTo } from "./rounding.js";

export function salaryIncome(grossSalary: Yen, rules: IncomeTaxRules): Yen {
  for (const piece of rules.salaryIncomeNet.pieces) {
    if (piece.upTo !== null && grossSalary > piece.upTo) continue;
    switch (piece.type) {
      case "zero":
        return 0;
      case "minus":
        return Math.max(0, grossSalary - piece.value);
      case "fixed":
        return piece.value;
      case "quarter": {
        const quartered = floorTo(grossSalary / 4, 1000);
        return Math.floor(applyRate(quartered, piece.multiplier) + piece.adjust);
      }
      case "rate":
        return Math.floor(applyRate(grossSalary, piece.rate) + piece.adjust);
    }
  }
  throw new Error(`salaryIncomeNet table does not cover gross salary ${grossSalary}`);
}
