import { describe, expect, test } from "vitest";
import type { HousingLoanTaxCreditRules, HousingPurchaseEvent } from "../../types/index.js";
import { applyHousingCredit, creditCategoryKey, housingLoanCreditForYear } from "../taxCredit.js";

const rules: HousingLoanTaxCreditRules = {
  rate: 0.007,
  categories: {
    "certified-new": { years: 13, borrowLimitBase: 45000000, borrowLimitWithChild: 50000000 },
    "other-used": { years: 10, borrowLimitBase: 20000000, borrowLimitWithChild: 20000000 }
  },
  incomeLimitForYear: 20000000,
  residentTaxSpillover: { capRate: 0.05, capAmount: 97500 },
  _source: { url: "https://www.mlit.go.jp/report/press/content/001975750.pdf", confirmedOn: "2026-07-20" }
};

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
    holdingCosts: { propertyTaxAnnual: 150000 },
    terminatesExpenseLabels: ["家賃"],
    taxCreditEligibility: { eligible: true, category: "certified", hasChildOrYoungCouple: false },
    ...overrides
  };
}

describe("creditCategoryKey", () => {
  test("新築+certified → certified-new", () => {
    expect(creditCategoryKey(makeEvent({}))).toBe("certified-new");
  });

  test("既存(used-house)+その他 → other-used", () => {
    const event = makeEvent({
      propertyType: "used-house",
      taxCreditEligibility: { eligible: true, category: "other", hasChildOrYoungCouple: false }
    });
    expect(creditCategoryKey(event)).toBe("other-used");
  });

  test("新築+その他(other-new)は対象外(undefined)", () => {
    const event = makeEvent({
      propertyType: "new-house",
      taxCreditEligibility: { eligible: true, category: "other", hasChildOrYoungCouple: false }
    });
    expect(creditCategoryKey(event)).toBeUndefined();
  });
});

describe("housingLoanCreditForYear", () => {
  test("年末残高×控除率(残高が限度額以下)", () => {
    const event = makeEvent({});
    const amount = housingLoanCreditForYear(event, [28000000], 2027, 8000000, rules);
    expect(amount).toBe(Math.floor(28000000 * 0.007));
  });

  test("年末残高が借入限度額を超える場合は限度額で頭打ち", () => {
    const event = makeEvent({ taxCreditEligibility: { eligible: true, category: "certified", hasChildOrYoungCouple: false } });
    const amount = housingLoanCreditForYear(event, [46000000], 2027, 8000000, rules);
    expect(amount).toBe(Math.floor(45000000 * 0.007)); // borrowLimitBase, not the 46M balance
  });

  test("子育て世帯等は上乗せ限度額を使う", () => {
    const event = makeEvent({ taxCreditEligibility: { eligible: true, category: "certified", hasChildOrYoungCouple: true } });
    const amount = housingLoanCreditForYear(event, [48000000], 2027, 8000000, rules);
    expect(amount).toBe(Math.floor(48000000 * 0.007)); // under withChild limit (50M)
  });

  test("控除期間(13年)を過ぎた年はゼロ", () => {
    const event = makeEvent({});
    expect(housingLoanCreditForYear(event, [10000000], 2026 + 13, 8000000, rules)).toBe(0);
    expect(housingLoanCreditForYear(event, [10000000], 2026 + 12, 8000000, rules)).toBeGreaterThan(0);
  });

  test("購入年より前はゼロ", () => {
    const event = makeEvent({});
    expect(housingLoanCreditForYear(event, [10000000], 2025, 8000000, rules)).toBe(0);
  });

  test("合計所得金額が2,000万円を超える年は控除停止", () => {
    const event = makeEvent({});
    expect(housingLoanCreditForYear(event, [10000000], 2027, 20000001, rules)).toBe(0);
    expect(housingLoanCreditForYear(event, [10000000], 2027, 20000000, rules)).toBeGreaterThan(0);
  });

  test("eligible=falseなら常にゼロ", () => {
    const event = makeEvent({ taxCreditEligibility: { eligible: false, category: "certified", hasChildOrYoungCouple: false } });
    expect(housingLoanCreditForYear(event, [10000000], 2027, 8000000, rules)).toBe(0);
  });

  test("複数ローン(ペアローンの片方が複数契約を持つ場合)は残高を合算する", () => {
    const event = makeEvent({});
    const amount = housingLoanCreditForYear(event, [10000000, 5000000], 2027, 8000000, rules);
    expect(amount).toBe(Math.floor(15000000 * 0.007));
  });

  test("rules未定義なら常にゼロ", () => {
    expect(housingLoanCreditForYear(makeEvent({}), [10000000], 2027, 8000000, undefined)).toBe(0);
  });
});

describe("applyHousingCredit", () => {
  test("所得税で全額引ききれる場合は住民税への繰越なし", () => {
    const result = applyHousingCredit(100000, 300000, 4000000, rules);
    expect(result.incomeTaxAfterCredit).toBe(200000);
    expect(result.residentTaxSpillover).toBe(0);
  });

  test("引ききれない額は課税所得×5%(上限97,500円)の小さい方まで住民税へ繰り越す", () => {
    // 課税所得400万円×5% = 200,000円 > 上限97,500円 → 上限が効く
    const result = applyHousingCredit(300000, 100000, 4000000, rules);
    expect(result.incomeTaxAfterCredit).toBe(0);
    expect(result.residentTaxSpillover).toBe(97500); // min(200,000, 100,000, 97,500) = 97,500
  });

  test("課税所得が小さく5%枠の方が上限97,500円より小さい場合はそちらが効く", () => {
    // 課税所得100万円×5% = 50,000円 < 97,500円
    const result = applyHousingCredit(300000, 100000, 1000000, rules);
    expect(result.incomeTaxAfterCredit).toBe(0);
    expect(result.residentTaxSpillover).toBe(50000);
  });

  test("引ききれない額自体が繰越上限より小さければその額のみ繰り越す", () => {
    const result = applyHousingCredit(150000, 100000, 4000000, rules);
    // unused = 150,000 - 100,000 = 50,000 < min(200,000, 97,500)
    expect(result.residentTaxSpillover).toBe(50000);
  });
});
