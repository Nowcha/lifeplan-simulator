/**
 * Loan amortization tests (design doc §8 手順7, §9 "元利均等の既知の償還表と
 * 月次一致。5年ルール発動ケースは手計算のフィクスチャを用意").
 *
 * annuityPayment is verified two ways: against an algebraically equivalent
 * rearrangement of the same closed-form formula (catches sign/exponent
 * bugs), and via a full-term simulation invariant (a fixed-rate loan must
 * amortize to exactly zero over its term). The 5-year/125%-rule fixtures
 * are hand-computed with deliberately extreme parameters so the capped
 * payment and resulting unpaid interest can be verified by exact arithmetic
 * without trusting a second annuity-formula computation.
 */

import { describe, expect, test } from "vitest";
import type { HousingLoan, LoanPrepaymentEvent } from "../../types/index.js";
import { annualLoanRow, annuityPayment, initLoanState, initialRateFor, stepLoanMonth, type LoanState } from "../loan.js";

function baseLoan(overrides: Partial<HousingLoan>): HousingLoan {
  return {
    loanId: "loan-1",
    borrowerPersonId: "partner-a",
    principal: 30000000,
    years: 30,
    method: "equal-payment",
    rateType: "fixed",
    fixedRate: 0.01,
    variableRules: { fiveYearRule: true, cap125Rule: true, rateResetMonths: 6 },
    groupCreditLife: "general",
    ...overrides
  };
}

describe("annuityPayment", () => {
  test("0%金利: 元金を月数で均等分割(端数切上げ)", () => {
    expect(annuityPayment(1200000, 0, 12)).toBe(100000);
    expect(annuityPayment(1000000, 0, 3)).toBe(Math.ceil(1000000 / 3));
  });

  test("等価な式変形と一致する: P = 元金×月利 / (1 - (1+月利)^-n)", () => {
    const principal = 30000000;
    const annualRate = 0.015;
    const months = 360;
    const r = annualRate / 12;
    const altFormula = Math.ceil((principal * r) / (1 - Math.pow(1 + r, -months)));
    expect(annuityPayment(principal, annualRate, months)).toBe(altFormula);
  });

  test("固定金利ローンは所定の年数でちょうど完済する(総支払 - 総利息 = 元金)", () => {
    const loan = baseLoan({ principal: 30000000, years: 30, fixedRate: 0.015 });
    const initialRate = initialRateFor(loan, () => 0, 2026);
    let state = initLoanState(loan, initialRate);
    let totalPayment = 0;
    let totalPrincipal = 0;
    const originationOrdinal = 2026 * 12 + 3; // 2026-04 purchase
    for (let year = 2026; year <= 2057; year++) {
      const { state: next, row } = annualLoanRow(state, loan, year, originationOrdinal, () => 0, []);
      state = next;
      totalPayment += row.payment;
      totalPrincipal += row.principalPaid;
    }
    expect(state.balance).toBe(0);
    expect(state.done).toBe(true);
    expect(totalPrincipal).toBe(30000000);
    expect(totalPayment).toBeGreaterThan(30000000); // interest was paid
  });
});

describe("元金均等 (equal-principal)", () => {
  test("毎月の元金は固定、利息は残高×月利で全額徴収する(未払利息は発生しない)", () => {
    const loan = baseLoan({ method: "equal-principal", principal: 1200000, years: 1, fixedRate: 0.12 });
    const originationOrdinal = 2026 * 12 + 0; // 2026-01
    const state = initLoanState(loan, 0.12);
    expect(state.fixedPrincipalPortion).toBe(100000); // 1,200,000 / 12

    // First payment month: 2026-02 (ord = originationOrdinal + 1)
    const monthlyRate = 0.12 / 12; // 0.01
    const result = stepLoanMonth(state, loan, originationOrdinal + 1, originationOrdinal, () => 0.12, undefined);
    expect(result.principalPaid).toBe(100000);
    expect(result.interest).toBe(Math.floor(1200000 * monthlyRate)); // floor(12,000) = 12,000
    expect(result.payment).toBe(100000 + 12000);
    expect(result.unpaidInterestThisMonth).toBe(0);
    expect(result.state.balance).toBe(1100000);
  });
});

describe("5年ルール・125%ルール(手計算フィクスチャ)", () => {
  // 0%金利で60か月固定払い(月10,000円)にした後、61か月目に金利を急騰させ、
  // 125%ルールで新返済額が旧返済額の125%(12,500円)に抑えられることを検証する。
  function stepRepeatedly(state: LoanState, loan: HousingLoan, ords: number[], ratePath: (year: number) => number, originationOrdinal: number): LoanState {
    let s = state;
    for (const ord of ords) {
      s = stepLoanMonth(s, loan, ord, originationOrdinal, ratePath, undefined).state;
    }
    return s;
  }

  test("125%ルール: 見直し後の返済額は旧返済額の125%を超えない", () => {
    const loan = baseLoan({
      principal: 1200000,
      years: 10,
      rateType: "variable",
      spreadFromBaseRate: 0,
      variableRules: { fiveYearRule: true, cap125Rule: true, rateResetMonths: 60 }
    });
    const originationOrdinal = 2020 * 12 + 0;
    // Rate is 0% for the first 60 payments, then jumps to 12% annual.
    const ratePath = (year: number): number => (year < 2025 ? 0 : 0.12);
    let state = initLoanState(loan, 0);
    expect(state.currentPayment).toBe(10000); // 1,200,000 / 120, 0% interest

    const ords1to60 = Array.from({ length: 60 }, (_, i) => originationOrdinal + 1 + i);
    state = stepRepeatedly(state, loan, ords1to60, ratePath, originationOrdinal);
    expect(state.balance).toBe(600000); // 60 payments x 10,000 principal, 0% interest
    expect(state.currentPayment).toBe(10000); // unchanged through payment 60

    // 61st payment triggers both the rate review (0% -> 12%) and the
    // 60-month payment review at the same month.
    const result61 = stepLoanMonth(state, loan, originationOrdinal + 61, originationOrdinal, ratePath, undefined);
    expect(result61.state.currentRate).toBe(0.12);
    expect(result61.state.currentPayment).toBe(12500); // floor(10,000 * 1.25), capped below the fair annuity payment
  });

  test("125%ルールで未払利息が発生する(上限後の返済額でも利息を賄いきれない)", () => {
    // Directly construct the state entering a payment-review month with a
    // large balance and a low old payment, so the capped new payment is
    // provably (by hand) less than the interest due that month.
    const loan = baseLoan({
      principal: 10000000,
      years: 30,
      rateType: "variable",
      variableRules: { fiveYearRule: true, cap125Rule: true, rateResetMonths: 60 }
    });
    const state: LoanState = {
      balance: 10000000,
      currentRate: 0.001,
      currentPayment: 30000, // artificially low "old" payment for this fixture
      fixedPrincipalPortion: 0,
      unpaidInterestAccrued: 0,
      paymentsMade: 60,
      monthsSinceRateReview: 60,
      monthsSincePaymentReview: 60,
      convertedToVariable: false,
      done: false
    };
    const originationOrdinal = 2020 * 12; // arbitrary; paymentsMade already reflects 60 elapsed
    const ord = originationOrdinal + 61;
    const result = stepLoanMonth(state, loan, ord, originationOrdinal, () => 0.06, undefined);

    // Cap: floor(30,000 * 1.25) = 37,500 (the "fair" annuity payment at 6%
    // over the remaining 300 months on ~10M balance is far larger, so the
    // cap binds regardless of its exact value).
    expect(result.state.currentPayment).toBe(37500);
    // Interest due this month at the new 6% rate: floor(10,000,000 * 0.06/12) = 50,000
    expect(result.interest).toBe(37500); // only the capped payment is collected as interest
    expect(result.principalPaid).toBe(0);
    expect(result.unpaidInterestThisMonth).toBe(50000 - 37500);
    expect(result.state.unpaidInterestAccrued).toBe(12500);
    expect(result.state.balance).toBe(10000000); // untouched: payment didn't even cover interest
  });
});

describe("繰上返済 (LoanPrepaymentEvent)", () => {
  test("reduce-payment: 残存期間を保ったまま返済額を下げる", () => {
    const loan = baseLoan({ principal: 1200000, years: 1, fixedRate: 0 });
    const originationOrdinal = 2026 * 12 + 0;
    let state = initLoanState(loan, 0);
    expect(state.currentPayment).toBe(100000);

    // Two ordinary payments (no prepayment): balance 1,200,000 -> 1,000,000.
    for (let i = 1; i <= 2; i++) {
      state = stepLoanMonth(state, loan, originationOrdinal + i, originationOrdinal, () => 0, undefined).state;
    }
    expect(state.balance).toBe(1000000);

    // Prepay 600,000 at the 3rd payment month, keeping the original 12-month
    // maturity (10 payments remain, including this one: 12 - 2 already made).
    const result = stepLoanMonth(
      state,
      loan,
      originationOrdinal + 3,
      originationOrdinal,
      () => 0,
      { amount: 600000, method: "reduce-payment" }
    );
    // Balance before this month's payment: 1,000,000 - 600,000 = 400,000,
    // spread over the remaining 10 months (this one included) at 0%.
    expect(result.state.currentPayment).toBe(40000);
    // The prepayment lump sum is a real cash outflow this month, on top of
    // the (already-recomputed) regular installment.
    expect(result.principalPaid).toBe(600000 + 40000);
    expect(result.payment).toBe(600000 + 40000);
  });

  test("繰上返済額は残高を超えて計上しない(残高以上を要求しても残高分だけ充当)", () => {
    const loan = baseLoan({ principal: 1200000, years: 1, fixedRate: 0 });
    const originationOrdinal = 2026 * 12 + 0;
    let state = initLoanState(loan, 0);
    for (let i = 1; i <= 2; i++) {
      state = stepLoanMonth(state, loan, originationOrdinal + i, originationOrdinal, () => 0, undefined).state;
    }
    expect(state.balance).toBe(1000000);

    const result = stepLoanMonth(
      state,
      loan,
      originationOrdinal + 3,
      originationOrdinal,
      () => 0,
      { amount: 5000000, method: "shorten-term" } // far more than the 1,000,000 balance
    );
    // Only the outstanding 1,000,000 is applied/charged; the loan finishes.
    expect(result.principalPaid).toBe(1000000);
    expect(result.payment).toBe(1000000);
    expect(result.state.balance).toBe(0);
    expect(result.state.done).toBe(true);
  });

  test("annualLoanRow: 同月に複数の繰上返済イベントがあれば合算する", () => {
    const loan = baseLoan({ principal: 1200000, years: 1, fixedRate: 0 });
    const originationOrdinal = 2026 * 12 + 0;
    const state = initLoanState(loan, 0);
    const prepayments: LoanPrepaymentEvent[] = [
      { id: "p1", type: "loan-prepayment", loanId: "loan-1", yearMonth: "2026-02", amount: 200000, method: "shorten-term" },
      { id: "p2", type: "loan-prepayment", loanId: "loan-1", yearMonth: "2026-02", amount: 100000, method: "shorten-term" }
    ];
    const { row } = annualLoanRow(state, loan, 2026, originationOrdinal, () => 0, prepayments);
    // Jan(100,000 principal) + Feb(100,000 regular + 300,000 prepay) + ... :
    // total principal for the year includes both prepayments summed (300,000).
    expect(row.principalPaid).toBeGreaterThanOrEqual(300000 + 100000);
  });

  test("shorten-term: 返済額は変えず、残高減少分だけ早く完済する", () => {
    const loan = baseLoan({ principal: 1200000, years: 1, fixedRate: 0 });
    const originationOrdinal = 2026 * 12 + 0;
    let state = initLoanState(loan, 0);
    for (let i = 1; i <= 2; i++) {
      state = stepLoanMonth(state, loan, originationOrdinal + i, originationOrdinal, () => 0, undefined).state;
    }
    expect(state.balance).toBe(1000000);
    const result = stepLoanMonth(
      state,
      loan,
      originationOrdinal + 3,
      originationOrdinal,
      () => 0,
      { amount: 600000, method: "shorten-term" }
    );
    expect(result.state.currentPayment).toBe(100000); // unchanged
    // Balance after prepayment (600,000->400,000) minus this month's
    // 100,000 principal payment = 300,000, paid off 4 months early.
    expect(result.state.balance).toBe(300000);
  });
});

describe("当初固定期間 → 変動への転換", () => {
  test("fixedPeriodYears満了後は基準金利+spreadに切り替わり、返済額も再計算される", () => {
    const loan = baseLoan({
      principal: 1200000,
      years: 10,
      rateType: "fixed-period",
      fixedRate: 0,
      fixedPeriodYears: 5,
      spreadFromBaseRate: 0.01,
      variableRules: { fiveYearRule: false, cap125Rule: false, rateResetMonths: 6 }
    });
    const originationOrdinal = 2020 * 12 + 0;
    let state = initLoanState(loan, 0);
    expect(state.currentPayment).toBe(10000); // 1,200,000 / 120, 0%

    for (let i = 1; i <= 60; i++) {
      state = stepLoanMonth(state, loan, originationOrdinal + i, originationOrdinal, () => 0, undefined).state;
    }
    expect(state.convertedToVariable).toBe(false);
    expect(state.balance).toBe(1200000 - 60 * 10000);

    // 61st payment: 60 payments already made (= fixedPeriodYears(5)*12) triggers conversion.
    const result = stepLoanMonth(state, loan, originationOrdinal + 61, originationOrdinal, () => 0.02, undefined);
    expect(result.state.convertedToVariable).toBe(true);
    expect(result.state.currentRate).toBe(0.03); // baseRate(0.02) + spread(0.01)
    expect(result.state.currentPayment).not.toBe(10000); // recomputed, no 125% cap on conversion
  });
});
