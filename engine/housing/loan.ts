/**
 * Housing loan amortization (design doc §4 HousingLoan, §7 AnnualRow.housing,
 * §8 手順7): 元利均等/元金均等, 変動/固定/当初固定, 5年ルール, 125%ルール,
 * 未払利息, 繰上返済.
 *
 * Rounding (per CLAUDE.md "ローン償還は月次円未満切捨て"): monthly interest
 * is floored to the yen. Payment amounts computed by the annuity formula are
 * rounded UP (Math.ceil) so a loan is guaranteed to fully amortize within
 * its term — flooring would leave a residual balance that never reaches
 * zero. This mirrors how lenders quote 元利均等 payments (the standard
 * annuity formula: 金融広報中央委員会 knowledge base
 * https://www.shiruporuto.jp/public/document/container/yougo/g05.html).
 *
 * 変動金利の実務ルール (5年ルール/125%ルール), documented simplifications:
 * - 金利は rateResetMonths ごとに見直されるが、返済額自体は
 *   variableRules.fiveYearRule が true の場合のみ60か月ごとに見直す
 *   (false の場合は金利改定のたびに返済額も追随して再計算し、未払利息は
 *   発生しない — 一部金融機関の「都度型」変動ローンに相当)。
 * - 返済額見直し時、それまでの未払利息累計は残高に組み入れてから
 *   新返済額を計算する(元本組入れ方式。銀行により延納・別途精算等の扱いも
 *   あるが、単一モデルとしてこれを採用)。
 * - 125%ルールは返済額の「見直し」時のみ適用し、当初固定期間から変動への
 *   転換時(fixed-period満了)には適用しない(転換時は初回設定として扱う)。
 * - 元金均等(equal-principal)には5年/125%ルールの概念がない(返済額が
 *   固定されていないため未払利息が発生しない): 毎月の元金部分は
 *   principal/totalMonths で固定、利息は都度の残高×金利で全額徴収する。
 * - 元利均等ローンが本来の完済月を過ぎても残高(+未払利息)が残る場合は、
 *   完済月に一括精算する(バルーン精算)。
 */

import type { HousingLoan, LoanPrepaymentEvent, Rate, Yen, YearMonth } from "../types/index.js";
import { monthOrdinal } from "../util/yearmonth.js";

export interface LoanState {
  balance: Yen;
  currentRate: Rate;
  /** Fixed monthly installment (equal-payment method only) */
  currentPayment: Yen;
  /** Fixed monthly principal portion (equal-principal method only) */
  fixedPrincipalPortion: Yen;
  /** Carried until the next payment review, then folded into balance */
  unpaidInterestAccrued: Yen;
  paymentsMade: number;
  monthsSinceRateReview: number;
  monthsSincePaymentReview: number;
  /** fixed-period loans: whether the conversion to variable has happened */
  convertedToVariable: boolean;
  done: boolean;
}

export interface LoanMonthResult {
  state: LoanState;
  /** Total cash paid this month, including any prepayment lump sum */
  payment: Yen;
  interest: Yen;
  /** Regular principal paid this month, plus any prepayment lump sum */
  principalPaid: Yen;
  unpaidInterestThisMonth: Yen;
}

export interface LoanYearRow {
  payment: Yen;
  interest: Yen;
  principalPaid: Yen;
  /** Year-end balance */
  balance: Yen;
  /** Rate in effect at year end */
  appliedRate: Rate;
  unpaidInterest: Yen;
}

/** 元利均等返済の毎月返済額 (annuity formula), rounded up so the term fully amortizes */
export function annuityPayment(principal: Yen, annualRate: Rate, months: number): Yen {
  if (months <= 0) return Math.max(0, principal);
  const r = annualRate / 12;
  if (r === 0) return Math.ceil(principal / months);
  const factor = Math.pow(1 + r, months);
  return Math.ceil((principal * r * factor) / (factor - 1));
}

function isReviewable(loan: HousingLoan, convertedToVariable: boolean): boolean {
  return loan.rateType === "variable" || (loan.rateType === "fixed-period" && convertedToVariable);
}

export function initLoanState(loan: HousingLoan, initialRate: Rate): LoanState {
  const totalMonths = loan.years * 12;
  const currentPayment =
    loan.method === "equal-payment" ? annuityPayment(loan.principal, initialRate, totalMonths) : 0;
  const fixedPrincipalPortion =
    loan.method === "equal-principal" ? Math.floor(loan.principal / totalMonths) : 0;
  return {
    balance: loan.principal,
    currentRate: initialRate,
    currentPayment,
    fixedPrincipalPortion,
    unpaidInterestAccrued: 0,
    paymentsMade: 0,
    monthsSinceRateReview: 0,
    monthsSincePaymentReview: 0,
    convertedToVariable: false,
    done: false
  };
}

/** Rate to apply at loan origination (month 0), before any review has run */
export function initialRateFor(loan: HousingLoan, baseRateForYear: (year: number) => Rate, originationYear: number): Rate {
  if (loan.rateType === "fixed" || loan.rateType === "fixed-period") return loan.fixedRate ?? 0;
  return baseRateForYear(originationYear) + (loan.spreadFromBaseRate ?? 0);
}

function recomputePayment(state: LoanState, loan: HousingLoan, remainingMonths: number, applyCap: boolean): LoanState {
  const basis = state.balance + state.unpaidInterestAccrued;
  let newPayment = annuityPayment(basis, state.currentRate, remainingMonths);
  if (applyCap && loan.variableRules.cap125Rule) {
    newPayment = Math.min(newPayment, Math.floor(state.currentPayment * 1.25));
  }
  return {
    ...state,
    balance: basis,
    unpaidInterestAccrued: 0,
    currentPayment: newPayment,
    monthsSincePaymentReview: 0
  };
}

/** Advance a loan by one calendar month. `ord` must be > origination month. */
export function stepLoanMonth(
  state: LoanState,
  loan: HousingLoan,
  ord: number,
  originationOrdinal: number,
  baseRateForYear: (year: number) => Rate,
  prepayment: { amount: Yen; method: "shorten-term" | "reduce-payment" } | undefined
): LoanMonthResult {
  if (ord <= originationOrdinal) {
    throw new Error(`stepLoanMonth: ord (${ord}) must be after originationOrdinal (${originationOrdinal})`);
  }
  if (state.done || state.balance <= 0) {
    return { state: { ...state, done: true }, payment: 0, interest: 0, principalPaid: 0, unpaidInterestThisMonth: 0 };
  }

  let s = { ...state };
  const totalMonths = loan.years * 12;
  const year = Math.floor(ord / 12);

  // 1. Prepayment applies before this month's review/interest split, as a
  // direct cash outflow (folded into principalPaid/payment below) — a
  // prepayment cannot exceed the outstanding balance; any excess requested
  // is simply not applied (not charged, not refunded — the boundary is the
  // caller's responsibility, per this engine's "trust internal input" convention).
  const prepaymentApplied = prepayment ? Math.min(prepayment.amount, s.balance) : 0;
  s.balance -= prepaymentApplied;

  // 2. Fixed-period → variable conversion (one-time, at the scheduled boundary).
  if (
    loan.rateType === "fixed-period" &&
    !s.convertedToVariable &&
    s.paymentsMade === (loan.fixedPeriodYears ?? 0) * 12
  ) {
    s.currentRate = baseRateForYear(year) + (loan.spreadFromBaseRate ?? 0);
    s.convertedToVariable = true;
    s.monthsSinceRateReview = 0;
    if (loan.method === "equal-payment") {
      s = recomputePayment(s, loan, totalMonths - s.paymentsMade, false);
    }
  }

  // 3. Periodic rate review.
  if (isReviewable(loan, s.convertedToVariable) && s.monthsSinceRateReview >= loan.variableRules.rateResetMonths) {
    s.currentRate = baseRateForYear(year) + (loan.spreadFromBaseRate ?? 0);
    s.monthsSinceRateReview = 0;
  }

  // 4. Periodic payment review (equal-payment only): every 60 months under
  // the 5-year rule, or every rate-reset cycle when the rule is off.
  if (loan.method === "equal-payment" && isReviewable(loan, s.convertedToVariable)) {
    const reviewCycle = loan.variableRules.fiveYearRule ? 60 : loan.variableRules.rateResetMonths;
    if (s.monthsSincePaymentReview >= reviewCycle) {
      s = recomputePayment(s, loan, totalMonths - s.paymentsMade, loan.variableRules.fiveYearRule);
    }
  }

  // 5. Prepayment payment-amount adjustment ("reduce-payment" keeps the
  // remaining term, lowers the installment; "shorten-term" leaves the
  // installment as-is and pays off early via the normal monthly loop).
  // equal-principal has no fixed installment to lower — a "reduce-payment"
  // request degrades to shorten-term there (the fixed principal/month is
  // unaffected either way; only the payoff date moves up).
  // If a scheduled 125%-capped review (step 4) lands in the same month,
  // this recompute intentionally supersedes it: it runs on the smaller
  // post-prepayment balance, which can only justify an equal-or-lower
  // payment than the pre-prepayment schedule, so re-applying the cap here
  // would be redundant.
  if (prepayment?.method === "reduce-payment" && loan.method === "equal-payment") {
    s = recomputePayment(s, loan, totalMonths - s.paymentsMade, false);
  }

  // 6. Balloon settlement at scheduled maturity if balance/unpaid interest remain
  // (only possible after repeated capped reviews under the 125% rule).
  const monthlyRate = s.currentRate / 12;
  let payment: Yen;
  let interest: Yen;
  let principalPaid: Yen;
  let unpaidInterestThisMonth = 0;

  const isMaturityMonth = s.paymentsMade >= totalMonths - 1;
  if (isMaturityMonth && (s.balance > 0 || s.unpaidInterestAccrued > 0)) {
    interest = Math.floor(s.balance * monthlyRate) + s.unpaidInterestAccrued;
    principalPaid = s.balance;
    payment = principalPaid + interest;
    s.balance = 0;
    s.unpaidInterestAccrued = 0;
  } else if (loan.method === "equal-principal") {
    interest = Math.floor(s.balance * monthlyRate);
    principalPaid = Math.min(s.fixedPrincipalPortion, s.balance);
    payment = interest + principalPaid;
    s.balance -= principalPaid;
  } else {
    const interestDue = Math.floor(s.balance * monthlyRate);
    if (interestDue <= s.currentPayment) {
      interest = interestDue;
      principalPaid = Math.min(s.currentPayment - interestDue, s.balance);
      payment = interest + principalPaid;
      s.balance -= principalPaid;
    } else {
      interest = s.currentPayment;
      principalPaid = 0;
      payment = s.currentPayment;
      unpaidInterestThisMonth = interestDue - s.currentPayment;
      s.unpaidInterestAccrued += unpaidInterestThisMonth;
    }
  }

  // Fold the prepayment lump sum into this month's cash outflow (it is pure
  // principal reduction, no interest component) so callers see the true
  // cash impact — otherwise a prepayment would silently shrink the balance
  // without ever leaving cashBalance, making net worth jump for free.
  principalPaid += prepaymentApplied;
  payment += prepaymentApplied;

  s.paymentsMade += 1;
  s.monthsSinceRateReview += 1;
  s.monthsSincePaymentReview += 1;
  if (s.balance <= 0) {
    s.balance = 0;
    s.done = true;
  }

  return { state: s, payment, interest, principalPaid, unpaidInterestThisMonth };
}

/**
 * Aggregate one calendar year of a loan's amortization into an AnnualRow
 * line. `state` must be the state carried over from the previous year (or
 * `initLoanState` output, for the origination year).
 */
export function annualLoanRow(
  state: LoanState,
  loan: HousingLoan,
  year: number,
  originationOrdinal: number,
  baseRateForYear: (year: number) => Rate,
  prepayments: LoanPrepaymentEvent[]
): { state: LoanState; row: LoanYearRow } {
  let s = state;
  let paymentTotal = 0;
  let interestTotal = 0;
  let principalTotal = 0;
  let unpaidTotal = 0;

  for (let m = 0; m < 12; m++) {
    const ord = year * 12 + m;
    if (ord <= originationOrdinal || s.done) continue;
    // Multiple prepayment events on the same loan in the same month are
    // summed into a single lump sum; the method of the first one governs
    // how the payment schedule reacts (mixing methods in one month is an
    // edge case the profile schema doesn't otherwise distinguish).
    const matchingPrepayments = prepayments.filter((p) => monthOrdinal(p.yearMonth) === ord);
    const [firstPrepayment] = matchingPrepayments;
    const prepay = firstPrepayment
      ? {
          amount: matchingPrepayments.reduce((sum, p) => sum + p.amount, 0),
          method: firstPrepayment.method
        }
      : undefined;
    const result = stepLoanMonth(s, loan, ord, originationOrdinal, baseRateForYear, prepay);
    s = result.state;
    paymentTotal += result.payment;
    interestTotal += result.interest;
    principalTotal += result.principalPaid;
    unpaidTotal += result.unpaidInterestThisMonth;
  }

  return {
    state: s,
    row: {
      payment: paymentTotal,
      interest: interestTotal,
      principalPaid: principalTotal,
      balance: s.balance,
      appliedRate: s.currentRate,
      unpaidInterest: unpaidTotal
    }
  };
}

export type { HousingLoan, LoanPrepaymentEvent, YearMonth };
