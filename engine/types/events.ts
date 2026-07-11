/** Design doc §4: life events (profile/events.json) — discriminated union */

import type { EventId, Indexation, PersonId, Rate, Yen, YearMonth } from "./common.js";

export type LifeEvent =
  | ChildbirthEvent
  | HousingPurchaseEvent
  | LoanPrepaymentEvent
  | EducationPlan
  | RecurringModifierEvent
  | OneTimeEvent;

export interface ChildbirthEvent {
  id: EventId;
  type: "childbirth";
  expectedYearMonth: YearMonth;
  childId: string;
  leavePlans: {
    personId: PersonId;
    maternityLeave?: { from: YearMonth; to: YearMonth };
    parentalLeave?: { from: YearMonth; to: YearMonth };
    /** Eligible days for 出生後休業支援給付 (engine checks conditions) */
    postnatalSupportDays?: number;
    returnToWork?: { shortHoursFactor: Rate; until: YearMonth };
  }[];
  /** Actual delivery cost (engine offsets against lump-sum benefit) */
  deliveryCost: Yen;
}

export interface HousingPurchaseEvent {
  id: EventId;
  type: "housing-purchase";
  yearMonth: YearMonth;
  propertyPrice: Yen;
  propertyType: "new-mansion" | "used-mansion" | "new-house" | "used-house";
  downPayment: Yen;
  closingCosts: Yen;
  loans: HousingLoan[];
  holdingCosts: {
    propertyTaxAnnual: Yen;
    managementFeeMonthly?: Yen;
    repairReserveEscalation?: Rate;
  };
  /** Base-expense labels terminated by this event (e.g. rent) */
  terminatesExpenseLabels: string[];
  taxCreditEligibility: {
    eligible: boolean;
    category: "certified" | "zeh" | "energy-efficient" | "other" | "used";
    hasChildOrYoungCouple: boolean;
  };
}

export interface HousingLoan {
  loanId: string;
  borrowerPersonId: PersonId;
  principal: Yen;
  years: number;
  method: "equal-payment" | "equal-principal";
  rateType: "variable" | "fixed" | "fixed-period";
  /** variable: applied rate = base rate path + spread (negative for discount) */
  spreadFromBaseRate?: Rate;
  fixedRate?: Rate;
  fixedPeriodYears?: number;
  variableRules: {
    fiveYearRule: boolean;
    cap125Rule: boolean;
    rateResetMonths: number;
  };
  groupCreditLife: "general" | "gan50" | "gan100" | "none";
}

export interface LoanPrepaymentEvent {
  id: EventId;
  type: "loan-prepayment";
  loanId: string;
  yearMonth: YearMonth;
  amount: Yen;
  method: "shorten-term" | "reduce-payment";
}

export interface EducationPlan {
  id: EventId;
  type: "education";
  childId: string;
  stages: {
    nursery: "hoikuen" | "kindergarten-public" | "kindergarten-private" | "none";
    elementary: "public" | "private";
    juniorHigh: "public" | "private";
    highSchool: "public" | "private";
    university: "national" | "private-liberal" | "private-science" | "none";
    universityHousing: "home" | "boarding";
  };
  extracurricularMonthly?: { fromAge: number; toAge: number; amount: Yen }[];
}

export interface RecurringModifierEvent {
  id: EventId;
  type: "recurring";
  label: string;
  startYearMonth: YearMonth;
  intervalYears?: number;
  amount: Yen;
  occurrences?: number;
  indexation: Indexation;
}

export interface OneTimeEvent {
  id: EventId;
  type: "one-time";
  label: string;
  yearMonth: YearMonth;
  /** Positive = expense, negative = income (gift etc.) */
  amount: Yen;
}
