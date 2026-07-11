/**
 * Design doc §6: rule file schema (rules/<year>.json).
 * All statutory numbers live in JSON; engine logic only reads parameters.
 * Fields for later phases are optional so Phase 1 rule files stay minimal.
 */

import type { Rate, Yen } from "./common.js";

/** Source annotation attached to every statutory value group */
export interface RuleSource {
  url: string;
  /** Date the primary source was confirmed, "YYYY-MM-DD" */
  confirmedOn: string;
  note?: string;
}

/** Progressive bracket: applies while taxable income <= upTo (null = no upper bound) */
export interface TaxBracket {
  upTo: Yen | null;
  rate: Rate;
  deduction: Yen;
}

/**
 * Piecewise definition of salary income (収入 − 給与所得控除) following the
 * official computation table, including the 1/4-rounding ("A" method) bands.
 */
export type SalaryIncomePiece =
  | { upTo: Yen | null; type: "zero" }
  | { upTo: Yen | null; type: "minus"; value: Yen }
  | { upTo: Yen | null; type: "fixed"; value: Yen }
  | {
      /** A = floor(income / 4 / 1000) * 1000; result = A * multiplier + adjust */
      upTo: Yen | null;
      type: "quarter";
      multiplier: number;
      adjust: Yen;
    }
  | { upTo: Yen | null; type: "rate"; rate: Rate; adjust: Yen };

export interface IncomeTaxRules {
  brackets: TaxBracket[];
  /** Salary income computed directly (income after 給与所得控除) */
  salaryIncomeNet: { pieces: SalaryIncomePiece[]; _source: RuleSource };
  /** Basic deduction ladder over 合計所得金額 */
  basicDeduction: { steps: { incomeUpTo: Yen | null; amount: Yen }[]; _source: RuleSource };
  spouseDeduction: {
    /** Spouse qualifies while spouse 合計所得金額 <= this */
    spouseIncomeMax: Yen;
    /** Deduction by taxpayer's own 合計所得金額 */
    steps: { ownerIncomeUpTo: Yen | null; amount: Yen }[];
    _source: RuleSource;
  };
  /** 復興特別所得税 (0.021). From 2027 this bucket represents 復興1.1% + 防衛1% (total unchanged). */
  reconstructionSurtax: Rate;
  _source: RuleSource;
}

export interface ResidentTaxRules {
  /** Income levy rates (所得割) */
  cityRate: Rate;
  prefRate: Rate;
  /** Per-capita levy (均等割) breakdown */
  perCapita: { city: Yen; pref: Yen; forestEnvironmentTax: Yen };
  basicDeduction: { steps: { incomeUpTo: Yen | null; amount: Yen }[] };
  spouseDeduction: {
    spouseIncomeMax: Yen;
    steps: { ownerIncomeUpTo: Yen | null; amount: Yen }[];
  };
  /** 調整控除 (personal-deduction gap credit) */
  adjustmentCredit: {
    basicDeductionGap: Yen;
    spouseDeductionGap: Yen;
    threshold: Yen;
    rateCity: Rate;
    ratePref: Rate;
    minimum: Yen;
    /** No credit above this 合計所得金額 */
    incomeLimit: Yen;
  };
  /** Non-taxation threshold for a single filer (Phase 1 simplification) */
  nonTaxableIncomeSingle: Yen;
  _source: RuleSource;
}

export interface SocialInsuranceRules {
  /** 標準報酬月額 grade table (health insurance grades 1..50) */
  standardMonthlyTable: { grade: number; standard: Yen; from: Yen; to: Yen | null }[];
  /** Pension standard monthly is the health standard clamped into [min, max] */
  pensionStandardMin: Yen;
  pensionStandardMax: Yen;
  /** 協会けんぽ都道府県単位保険料率 (total; employee pays half) */
  kyokaiKenpoRateTokyo: Rate;
  /** 介護保険料率 (40-64, nationwide; total) */
  nursingCareRate: Rate;
  /** 子ども・子育て支援金率 (total; employee pays half; effective 2026-04) */
  childSupportLevyRate: Rate;
  /** 厚生年金 total 18.3% (employee pays half = 9.15%) */
  pensionRate: Rate;
  /** 雇用保険 employee-side rate (applied to actual pay, not standard) */
  employmentInsuranceEmployeeRate: Rate;
  /** 標準賞与額 caps */
  bonusCapHealthAnnual: Yen;
  bonusCapPensionMonthly: Yen;
  _source: RuleSource;
}

/* ---- Phase 2+ sections (typed now, filled later) ---- */

export interface ChildbirthRules {
  lumpSum: Yen;
  maternityAllowanceRate: Rate;
  parentalLeaveBenefit: {
    rateFirst180Days: Rate;
    rateAfter: Rate;
    monthlyCapFirst: Yen;
    postnatalSupport: { rate: Rate; maxDays: number };
    socialInsuranceExemption: boolean;
  };
  _source: RuleSource;
}

export interface ChildBenefitsRules {
  childAllowance: {
    ageBands: { untilAge: number; monthly: Yen }[];
    thirdChildMonthly: Yen;
  };
  tokyo018: { monthly: Yen; untilAge: number };
  municipal: { [municipality: string]: { label: string; monthly: Yen; untilAge: number }[] };
  _source: RuleSource;
}

export interface HousingLoanTaxCreditRules {
  rate: Rate;
  years: { new: number; used: number };
  borrowLimit: { [category: string]: { base: Yen; withChild: Yen } };
  _source: RuleSource;
}

export interface NisaRules {
  lifetimeCap: Yen;
  growthLifetimeCap: Yen;
  annualTsumitate: Yen;
  annualGrowth: Yen;
  quotaRestoration: "next-year-cost-basis";
  _source: RuleSource;
}

export interface RuleSet {
  year: number;
  incomeTax: IncomeTaxRules;
  residentTax: ResidentTaxRules;
  socialInsurance: SocialInsuranceRules;
  childbirth?: ChildbirthRules;
  childBenefits?: ChildBenefitsRules;
  housingLoanTaxCredit?: HousingLoanTaxCreditRules;
  nisa?: NisaRules;
  capitalGainsTaxRate?: Rate;
}
