/**
 * Monthly leave calendar for one person-year (design doc §8 手順1-2):
 * 産休・育休期間は給与ゼロに置換し、時短復帰には shortHoursFactor を適用する。
 *
 * Social-insurance exemption:
 * - 産前産後休業: 法定免除 (健保法159条の3・厚年法81条の2の2、2014-04〜)。
 *   rules にフラグを持たないため常に免除する。
 * - 育児休業: rules.childbirth.parentalLeaveBenefit.socialInsuranceExemption
 *   に従う。実際の免除要件(月末時点取得 or 同月内14日以上)は月粒度では
 *   「休業月 = 免除」と近似する。
 */

import type { ChildbirthEvent, PersonId, YearMonth } from "../types/index.js";
import { monthOrdinal } from "../util/yearmonth.js";

export interface MonthWorkPlan {
  /** 0 while on leave; otherwise the short-hours factor (1 = full-time) */
  payFactor: number;
  /** Social insurance premiums exempted for this month */
  siExempt: boolean;
}

const MONTHS_PER_YEAR = 12;
const FULL_WORK: MonthWorkPlan = { payFactor: 1, siExempt: false };

function within(ord: number, window: { from: YearMonth; to: YearMonth }): boolean {
  return ord >= monthOrdinal(window.from) && ord <= monthOrdinal(window.to);
}

/**
 * A person can hold leavePlans for more than one child in the same calendar
 * month (e.g. 年子: still on reduced hours for child 1 while starting
 * maternity leave for child 2). Collect every matching plan's status for
 * `ord` and keep the most restrictive one, rather than the first match —
 * otherwise payroll (short-hours pay + premiums) and benefits (full leave
 * pay) would disagree about which status applies.
 */
function candidatePlansAt(
  events: ChildbirthEvent[],
  personId: PersonId,
  ord: number,
  parentalSiExempt: boolean
): MonthWorkPlan[] {
  const candidates: MonthWorkPlan[] = [];
  for (const event of events) {
    for (const plan of event.leavePlans) {
      if (plan.personId !== personId) continue;
      if (plan.maternityLeave && within(ord, plan.maternityLeave)) {
        candidates.push({ payFactor: 0, siExempt: true });
      }
      if (plan.parentalLeave && within(ord, plan.parentalLeave)) {
        candidates.push({ payFactor: 0, siExempt: parentalSiExempt });
      }
      const returnToWork = plan.returnToWork;
      if (returnToWork) {
        // 時短は休業明けの翌月から returnToWork.until (含む) まで
        const leaveEnd = plan.parentalLeave ?? plan.maternityLeave;
        if (leaveEnd && ord > monthOrdinal(leaveEnd.to) && ord <= monthOrdinal(returnToWork.until)) {
          candidates.push({ payFactor: returnToWork.shortHoursFactor, siExempt: false });
        }
      }
    }
  }
  return candidates;
}

function mostRestrictive(candidates: MonthWorkPlan[]): MonthWorkPlan {
  return candidates.reduce((worst, c) => {
    if (c.payFactor < worst.payFactor) return c;
    if (c.payFactor === worst.payFactor && c.siExempt && !worst.siExempt) return c;
    return worst;
  }, FULL_WORK);
}

function monthPlanAt(
  events: ChildbirthEvent[],
  personId: PersonId,
  ord: number,
  parentalSiExempt: boolean
): MonthWorkPlan {
  const candidates = candidatePlansAt(events, personId, ord, parentalSiExempt);
  return candidates.length === 0 ? FULL_WORK : mostRestrictive(candidates);
}

/** The 12 calendar months of `year` for one person, leave and short-hours applied */
export function monthlyLeavePlan(
  events: ChildbirthEvent[],
  personId: PersonId,
  year: number,
  parentalSiExempt: boolean
): MonthWorkPlan[] {
  const months: MonthWorkPlan[] = [];
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    months.push(monthPlanAt(events, personId, year * MONTHS_PER_YEAR + m, parentalSiExempt));
  }
  return months;
}
