/**
 * Annual pipeline (design doc §8, Phase 1 scope = steps 1-6):
 *  1. income (curve interpolation x wage indexation)
 *  2. social insurance (standard monthly grade, bonus, employment insurance)
 *  3. benefits — STUB until Phase 2 (returns [])
 *  4. income tax (salary income deduction → deductions → brackets → surtax)
 *  5. resident tax — levied on the PREVIOUS year's income
 *  6. expenses (base items x indexation)
 *  7-9. loans / savings / investment returns — STUB until Phase 3-4;
 *       cash balance is a simple accumulation.
 *
 * Pure function: (household, events, assumptions, rules) → SimulationResult.
 * No wall-clock, no randomness, no I/O.
 */

import type {
  AnnualRow,
  Assumptions,
  Household,
  LifeEvent,
  Person,
  PersonIncomeRow,
  Rate,
  RuleSet,
  SimulationResult,
  Yen
} from "./types/index.js";
import { bonusAnnualAt, indexFactor, indexationAt, monthlyBaseAt } from "./income/curve.js";
import { annualBaseExpenses } from "./expenses/base.js";
import { salaryIncome } from "./tax/salaryIncome.js";
import { computeIncomeTax } from "./tax/incomeTax.js";
import { computeResidentTax } from "./tax/residentTax.js";
import { furusatoNozeiLimit } from "./tax/furusato.js";
import { bonusPremiums, employmentInsurance, monthlyPremiums } from "./tax/socialInsurance.js";
import { parseYearMonth } from "./util/yearmonth.js";

export interface PipelineOptions {
  /** First simulated year assumes previous-year income = first-year income (kit §2-3) */
  firstYearResidentTaxAssumesSameIncome?: boolean;
}

interface PersonYearEconomics {
  gross: Yen;
  socialInsurance: Yen;
  totalIncome: Yen;
  incomeTax: Yen;
  incomeTaxMarginalRate: Rate;
  /** Resident tax amount that will be levied NEXT year (computed from this year's income) */
  residentTaxForNextYear: Yen;
  /** Resident income levy (調整控除後所得割) for furusato limit */
  residentIncomeLevy: Yen;
}

function deterministicRates(assumptions: Assumptions): { inflation: Rate; wage: Rate } {
  return {
    inflation: assumptions.deterministicOverride?.["inflation"] ?? assumptions.inflation.mean,
    wage: assumptions.deterministicOverride?.["wage-growth"] ?? assumptions.wageGrowth.mean
  };
}

/** Age reached during the calendar year (= age on Dec 31; documented approximation) */
function ageInYear(person: Person, year: number): number {
  return year - parseYearMonth(person.birthYearMonth).year;
}

/** Annual gross pay and social insurance for one person-year */
function computePersonYear(
  person: Person,
  age: number,
  yearsElapsed: number,
  rates: { inflation: Rate; wage: Rate },
  rules: RuleSet
): { gross: Yen; monthlyPay: Yen; bonusAnnual: Yen; socialInsurance: Yen } {
  const isWorking = person.employment.type === "salaried" && age < person.retirementAge;
  if (!isWorking) return { gross: 0, monthlyPay: 0, bonusAnnual: 0, socialInsurance: 0 };

  const factor = indexFactor(indexationAt(person.incomeCurve, age), yearsElapsed, rates);
  const monthlyPay = Math.floor(monthlyBaseAt(person.incomeCurve, age) * factor);
  const bonusAnnual = Math.floor(bonusAnnualAt(person.incomeCurve, age) * factor);
  const gross = monthlyPay * 12 + bonusAnnual;
  if (gross <= 0) return { gross: 0, monthlyPay: 0, bonusAnnual: 0, socialInsurance: 0 };

  // 介護保険第2号被保険者 (40-64). Year-granularity approximation:
  // applied for the whole year in which the person turns 40 / stops at 65.
  const isCareInsured = age >= 40 && age < 65;
  const kumiaiEmployeeRate =
    person.employment.healthInsurance === "kumiai" ? person.employment.kumiaiRate : undefined;
  const si = rules.socialInsurance;

  const premiumInput = { monthlyPay, isCareInsured, rules: si } as const;
  const monthly =
    kumiaiEmployeeRate !== undefined
      ? monthlyPremiums({ ...premiumInput, kumiaiEmployeeRate })
      : monthlyPremiums(premiumInput);

  // Bonus paid in two installments (June/December) — documented simplification.
  // The health-side annual cap is tracked per calendar year (fiscal-year approx.)
  const bonus1 = Math.floor(bonusAnnual / 2);
  const bonus2 = bonusAnnual - bonus1;
  let bonusTotal = 0;
  let healthBonusCumulative = 0;
  for (const payment of [bonus1, bonus2]) {
    if (payment <= 0) continue;
    const input = { bonusPayment: payment, healthBonusCumulative, isCareInsured, rules: si } as const;
    const b =
      kumiaiEmployeeRate !== undefined
        ? bonusPremiums({ ...input, kumiaiEmployeeRate })
        : bonusPremiums(input);
    bonusTotal += b.total + employmentInsurance(payment, si);
    healthBonusCumulative += b.standardBonus;
  }

  const employmentMonthly = employmentInsurance(monthlyPay, si);
  const socialInsurance = (monthly.total + employmentMonthly) * 12 + bonusTotal;

  return { gross, monthlyPay, bonusAnnual, socialInsurance };
}

export function runDeterministic(
  household: Household,
  _events: LifeEvent[],
  assumptions: Assumptions,
  rules: RuleSet,
  options?: PipelineOptions
): SimulationResult {
  const firstYearSameIncome = options?.firstYearResidentTaxAssumesSameIncome ?? true;
  const rates = deterministicRates(assumptions);
  const { startYear, endAge } = assumptions.simulation;

  const oldestBirthYear = Math.min(
    ...household.persons.map((p) => parseYearMonth(p.birthYearMonth).year)
  );
  const endYear = oldestBirthYear + endAge;

  // Phase 1: investment balances stay flat; cash accumulates net cash flow.
  const initialCash = household.financialAssets
    .filter((h) => h.account === "cash")
    .reduce((sum, h) => sum + h.balance, 0);
  const investBalances: { [account: string]: Yen } = {};
  for (const holding of household.financialAssets) {
    if (holding.account === "cash") continue;
    investBalances[holding.account] = (investBalances[holding.account] ?? 0) + holding.balance;
  }
  const nisaLifetimeUsed = household.financialAssets.reduce(
    (sum, h) => sum + (h.nisaLifetimeUsed ?? 0),
    0
  );

  let cashBalance = initialCash;
  const pendingResidentTax = new Map<string, Yen>();
  const rows: AnnualRow[] = [];

  for (let year = startYear; year <= endYear; year++) {
    const yearsElapsed = year - startYear;
    const ages: { [personId: string]: number } = {};
    const incomeRows: { [personId: string]: PersonIncomeRow } = {};
    const furusato: { [personId: string]: Yen } = {};

    // Step 1-2: gross income and social insurance per person
    const econ = new Map<string, PersonYearEconomics>();
    const grossById = new Map<string, ReturnType<typeof computePersonYear>>();
    for (const person of household.persons) {
      const age = ageInYear(person, year);
      ages[person.id] = age;
      grossById.set(person.id, computePersonYear(person, age, yearsElapsed, rates, rules));
    }

    // 合計所得 per person (needed cross-wise for spouse deduction)
    const totalIncomeById = new Map<string, Yen>();
    for (const person of household.persons) {
      const g = grossById.get(person.id);
      totalIncomeById.set(person.id, g ? salaryIncome(g.gross, rules.incomeTax) : 0);
    }

    // Step 3: benefits — Phase 2 stub
    const benefits: { label: string; amount: Yen }[] = [];

    // Step 4-5: income tax and resident tax per person
    for (const person of household.persons) {
      const g = grossById.get(person.id);
      if (!g) continue;
      const totalIncome = totalIncomeById.get(person.id) ?? 0;
      const spouse =
        household.persons.length === 2
          ? household.persons.find((p) => p.id !== person.id)
          : undefined;
      const spouseTotalIncome = spouse ? totalIncomeById.get(spouse.id) : undefined;
      const idecoAnnual = (person.deductions.idecoMonthly ?? 0) * 12;

      const taxInputBase = {
        totalIncome,
        socialInsurancePaid: g.socialInsurance,
        idecoAnnual
      };
      const incomeTax = computeIncomeTax(
        spouseTotalIncome !== undefined
          ? { ...taxInputBase, spouseTotalIncome, rules: rules.incomeTax }
          : { ...taxInputBase, rules: rules.incomeTax }
      );
      const residentNext = computeResidentTax(
        spouseTotalIncome !== undefined
          ? { ...taxInputBase, spouseTotalIncome, rules: rules.residentTax }
          : { ...taxInputBase, rules: rules.residentTax }
      );

      econ.set(person.id, {
        gross: g.gross,
        socialInsurance: g.socialInsurance,
        totalIncome,
        incomeTax: incomeTax.tax,
        incomeTaxMarginalRate: incomeTax.marginalRate,
        residentTaxForNextYear: residentNext.total,
        residentIncomeLevy: residentNext.incomeLevy
      });
    }

    for (const person of household.persons) {
      const e = econ.get(person.id);
      if (!e) continue;
      // Resident tax levied this year = computed from previous year's income.
      // First year: optionally assume previous year had the same income.
      const carried = pendingResidentTax.get(person.id);
      const residentTaxThisYear =
        carried ?? (firstYearSameIncome && year === startYear ? e.residentTaxForNextYear : 0);
      pendingResidentTax.set(person.id, e.residentTaxForNextYear);

      const net = e.gross - e.socialInsurance - e.incomeTax - residentTaxThisYear;
      incomeRows[person.id] = {
        gross: e.gross,
        socialInsurance: e.socialInsurance,
        incomeTax: e.incomeTax,
        residentTax: residentTaxThisYear,
        net
      };
      furusato[person.id] = furusatoNozeiLimit({
        residentIncomeLevy: e.residentIncomeLevy,
        incomeTaxMarginalRate: e.incomeTaxMarginalRate,
        rules
      });
    }

    // Step 6: expenses
    const expenseLines = annualBaseExpenses(household.baseExpenses, year, startYear, rates);
    const totalExpenses = expenseLines.reduce((sum, l) => sum + l.amount, 0);
    const totalNet = Object.values(incomeRows).reduce((sum, r) => sum + r.net, 0);
    const totalBenefits = benefits.reduce((sum, b) => sum + b.amount, 0);

    // Steps 7-9 (loans / savings / returns): Phase 3-4 stubs.
    cashBalance += totalNet + totalBenefits - totalExpenses;

    const investTotal = Object.values(investBalances).reduce((sum, v) => sum + v, 0);
    const monthlyExpenses = totalExpenses / 12;
    rows.push({
      year,
      ages,
      income: incomeRows,
      benefits,
      expenses: expenseLines.map((l) => ({ category: l.category, amount: l.amount })),
      housing: {},
      taxCredits: { housingLoan: 0 },
      invest: {
        contributions: 0,
        withdrawals: 0,
        capitalGainsTax: 0,
        balances: { ...investBalances },
        nisaLifetimeUsed,
        nisaAnnualUsed: { tsumitate: 0, growth: 0 }
      },
      cashBalance,
      netWorth: cashBalance + investTotal,
      liquidityAlert: cashBalance < household.savingsPolicy.cashBufferMonths * monthlyExpenses,
      furusatoNozeiLimit: furusato
    });
  }

  return { deterministic: rows };
}
