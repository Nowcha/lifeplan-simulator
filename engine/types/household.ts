/** Design doc §3: household profile (profile/household.json) */

import type { EventId, Indexation, PersonId, Rate, Yen, YearMonth } from "./common.js";

export interface Household {
  schemaVersion: 1;
  persons: Person[];
  children: Child[];
  /**
   * 子以外の生計を一にする親族(主に親)。省略可 — 既存プロファイルとの
   * 後方互換のため。扶養控除と住民税の非課税限度額にのみ効く。
   */
  dependents?: Dependent[];
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

/**
 * 子以外の被扶養親族。children と分けているのは、子が教育費・児童手当・出産
 * イベントと密結合なのに対し、こちらは扶養控除と非課税限度額にしか効かないため
 * (design doc §3)。
 */
export interface Dependent {
  id: string;
  birthYearMonth: YearMonth;
  /**
   * 同居老親等の割増の判定。納税者またはその配偶者の直系尊属(父母・祖父母)で
   * かつ同居している場合のみ true。別居の親や直系尊属でない親族は false。
   */
  coResidentDirectAscendant: boolean;
  /** 合計所得金額(年額)。所得要件を超えると扶養親族に当たらない。省略時は0 */
  annualIncome?: Yen;
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
