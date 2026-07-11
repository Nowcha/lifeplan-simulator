/** Design doc §3: household profile (profile/household.json) */

import type { EventId, Indexation, PersonId, Rate, Yen, YearMonth } from "./common.js";

export interface Household {
  schemaVersion: 1;
  persons: Person[];
  children: Child[];
  /** Rules lookup key for municipal benefits / childcare cost, e.g. "koto-ku" */
  municipality: string;
  baseExpenses: BaseExpenseItem[];
  financialAssets: AssetHolding[];
  savingsPolicy: SavingsPolicy;
}

export interface Person {
  id: PersonId;
  birthYearMonth: YearMonth;
  employment: {
    type: "salaried" | "self-employed" | "none";
    healthInsurance: "kyokai-kenpo" | "kumiai";
    /** Employee-side rate override when healthInsurance === "kumiai" */
    kumiaiRate?: Rate;
  };
  /** Income curve: breakpoints by age, linear interpolation in between */
  incomeCurve: IncomePoint[];
  retirementAge: number;
  retirementLumpSum?: Yen;
  deductions: {
    idecoMonthly?: Yen;
    lifeInsurancePremiumAnnual?: Yen;
  };
}

export interface IncomePoint {
  age: number;
  /** Monthly base salary (basis of 標準報酬月額) */
  monthlyBase: Yen;
  /** Annual bonus total (basis of 標準賞与額) */
  bonusAnnual: Yen;
  indexation: Indexation;
}

export interface Child {
  id: string;
  birthYearMonth: YearMonth;
  /** Reference to an "education" event */
  educationPlanRef: EventId;
}

export interface BaseExpenseItem {
  label: string;
  monthly: Yen;
  indexation: Indexation;
  activeFrom?: YearMonth;
  activeTo?: YearMonth;
}

export type AccountType = "nisa-tsumitate" | "nisa-growth" | "taxable" | "cash" | "ideco";

export interface AssetHolding {
  /** Matches Assumptions.assetClasses[].id */
  assetClassId: string;
  account: AccountType;
  balance: Yen;
  /** Cost basis for capital gains in taxable accounts */
  costBasis: Yen;
  /** Initial NISA lifetime quota already consumed */
  nisaLifetimeUsed?: Yen;
}

export interface SavingsPolicy {
  /** Emergency fund: keep this many months of expenses in cash */
  cashBufferMonths: number;
  contributions: {
    account: "nisa-tsumitate" | "nisa-growth" | "taxable" | "ideco";
    monthlyCap: Yen;
    assetClassId: string;
  }[];
  drawdown: {
    strategy: "fixed-amount" | "fixed-rate";
    value: number;
    order: ("taxable" | "nisa-growth" | "nisa-tsumitate")[];
  };
}
