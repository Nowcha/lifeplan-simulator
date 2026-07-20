/**
 * Housing purchase cash items (design doc §4 HousingPurchaseEvent, §8 手順6):
 * one-time down payment + closing costs at purchase, and ongoing holding
 * costs (property tax, management fee with step-up escalation).
 *
 * 固定資産税(propertyTaxAnnual) is treated as a flat real amount for the
 * whole simulation — the design doc explicitly allows this simplification
 * ("新築軽減はrulesで処理してもよいが簡易は実額"), since the actual 3/5/7-year
 * new-build reduction schedule is a further refinement out of Phase 3 scope.
 * 管理費・修繕積立金 grows by repairReserveEscalation compounded annually
 * (段階増額), approximating a mansion's step-up reserve schedule.
 */

import type { HousingPurchaseEvent, Rate } from "../types/index.js";
import { parseYearMonth } from "../util/yearmonth.js";
import type { ExpenseLine } from "../expenses/base.js";

export function annualPurchaseCashOutflow(events: HousingPurchaseEvent[], year: number): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const event of events) {
    if (parseYearMonth(event.yearMonth).year !== year) continue;
    const amount = event.downPayment + event.closingCosts;
    if (amount > 0) lines.push({ category: `住宅購入(頭金・諸費用・${event.id})`, amount });
  }
  return lines;
}

export function annualHoldingCosts(events: HousingPurchaseEvent[], year: number): ExpenseLine[] {
  const lines: ExpenseLine[] = [];
  for (const event of events) {
    const purchaseYear = parseYearMonth(event.yearMonth).year;
    if (year < purchaseYear) continue;
    const yearsSincePurchase = year - purchaseYear;
    const { propertyTaxAnnual, managementFeeMonthly, repairReserveEscalation } = event.holdingCosts;

    if (propertyTaxAnnual > 0) {
      lines.push({ category: `固定資産税(${event.id})`, amount: propertyTaxAnnual });
    }
    if (managementFeeMonthly !== undefined && managementFeeMonthly > 0) {
      const escalation: Rate = repairReserveEscalation ?? 0;
      const factor = Math.pow(1 + escalation, yearsSincePurchase);
      lines.push({
        category: `管理費・修繕積立金(${event.id})`,
        amount: Math.floor(managementFeeMonthly * factor) * 12
      });
    }
  }
  return lines;
}
