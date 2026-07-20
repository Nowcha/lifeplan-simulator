import { describe, expect, test } from "vitest";
import type { HousingPurchaseEvent } from "../../types/index.js";
import { annualHoldingCosts, annualPurchaseCashOutflow } from "../holdingCosts.js";

function makeEvent(overrides: Partial<HousingPurchaseEvent>): HousingPurchaseEvent {
  return {
    id: "house-1",
    type: "housing-purchase",
    yearMonth: "2026-04",
    propertyPrice: 60000000,
    propertyType: "new-mansion",
    downPayment: 6000000,
    closingCosts: 2000000,
    loans: [],
    holdingCosts: { propertyTaxAnnual: 150000, managementFeeMonthly: 30000, repairReserveEscalation: 0.05 },
    terminatesExpenseLabels: ["家賃"],
    taxCreditEligibility: { eligible: true, category: "certified", hasChildOrYoungCouple: false },
    ...overrides
  };
}

describe("annualPurchaseCashOutflow", () => {
  test("購入年に頭金+諸費用を一括計上する", () => {
    const lines = annualPurchaseCashOutflow([makeEvent({})], 2026);
    expect(lines).toEqual([{ category: "住宅購入(頭金・諸費用・house-1)", amount: 8000000 }]);
  });

  test("購入年以外は計上しない", () => {
    expect(annualPurchaseCashOutflow([makeEvent({})], 2027)).toEqual([]);
  });
});

describe("annualHoldingCosts", () => {
  test("購入年から固定資産税を計上する(実額・据え置き)", () => {
    const lines2026 = annualHoldingCosts([makeEvent({})], 2026);
    const lines2030 = annualHoldingCosts([makeEvent({})], 2030);
    expect(lines2026.find((l) => l.category === "固定資産税(house-1)")?.amount).toBe(150000);
    expect(lines2030.find((l) => l.category === "固定資産税(house-1)")?.amount).toBe(150000);
  });

  test("購入前の年は計上しない", () => {
    expect(annualHoldingCosts([makeEvent({})], 2025)).toEqual([]);
  });

  test("管理費・修繕積立金はrepairReserveEscalationで年複利増額する", () => {
    const lines2026 = annualHoldingCosts([makeEvent({})], 2026);
    const lines2028 = annualHoldingCosts([makeEvent({})], 2028);
    expect(lines2026.find((l) => l.category === "管理費・修繕積立金(house-1)")?.amount).toBe(30000 * 12);
    // 2年経過: 30,000 × 1.05^2 = 33,075 (円未満切捨て) × 12
    const expectedMonthly = Math.floor(30000 * Math.pow(1.05, 2));
    expect(lines2028.find((l) => l.category === "管理費・修繕積立金(house-1)")?.amount).toBe(expectedMonthly * 12);
  });

  test("managementFeeMonthly未指定なら管理費行を出さない", () => {
    const lines = annualHoldingCosts([makeEvent({ holdingCosts: { propertyTaxAnnual: 150000 } })], 2026);
    expect(lines.some((l) => l.category.startsWith("管理費"))).toBe(false);
  });
});
