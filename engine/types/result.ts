/** Design doc §7: engine output */

import type { Rate, Yen } from "./common.js";

export interface SimulationResult {
  /** Expected-value path (initial UI display / debugging) */
  deterministic: AnnualRow[];
  monteCarlo?: MonteCarloSummary;
}

export interface PersonIncomeRow {
  gross: Yen;
  socialInsurance: Yen;
  incomeTax: Yen;
  /** Levied on PREVIOUS year's income (reproduces the post-parental-leave gap) */
  residentTax: Yen;
  net: Yen;
}

export interface AnnualRow {
  year: number;
  ages: { [personId: string]: number };
  income: { [personId: string]: PersonIncomeRow };
  benefits: { label: string; amount: Yen }[];
  expenses: { category: string; amount: Yen }[];
  housing: {
    [loanId: string]: {
      payment: Yen;
      interest: Yen;
      principalPaid: Yen;
      balance: Yen;
      appliedRate: Rate;
      /** Unpaid interest accrued under the 5-year rule */
      unpaidInterest: Yen;
    };
  };
  taxCredits: { housingLoan: Yen };
  invest: {
    contributions: Yen;
    withdrawals: Yen;
    capitalGainsTax: Yen;
    balances: { [account: string]: Yen };
    nisaLifetimeUsed: Yen;
    nisaAnnualUsed: { tsumitate: Yen; growth: Yen };
  };
  cashBalance: Yen;
  /** Financial assets + housing value (simplified) - loan balance */
  netWorth: Yen;
  /** Cash dropped below the buffer months this year */
  liquidityAlert: boolean;
  /** By-product: ふるさと納税 limit per person */
  furusatoNozeiLimit: { [personId: string]: Yen };
}

export interface MonteCarloSummary {
  percentiles: { p: 10 | 25 | 50 | 75 | 90; netWorthByYear: Yen[] }[];
  depletionProbability: number;
  depletionAgeDistribution?: number[];
  sensitivity?: { factor: string; low: Yen; high: Yen }[];
}
