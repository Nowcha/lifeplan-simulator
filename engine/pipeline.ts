/**
 * Annual pipeline (design doc §8, Phase 1-2 scope = steps 1-6):
 *  1. income (curve interpolation x wage indexation; maternity/parental
 *     leave months replace pay with zero, short-hours factor on return)
 *  2. social insurance (standard monthly grade, bonus, employment insurance;
 *     leave months exempted per statute / rules flag)
 *  3. benefits (childbirth lump sum, maternity allowance, parental leave
 *     benefit, child allowance, Tokyo 018, municipal) — all tax-exempt, so
 *     they enter cash flow directly and never touch steps 4-5
 *  4. income tax (salary income deduction → deductions → brackets → surtax)
 *  5. resident tax — levied on the PREVIOUS year's income
 *  6. expenses (base items x indexation + recurring/one-time event modifiers
 *     + education cost table expansion)
 *  7-9. loans / savings / investment returns — STUB until Phase 3-4;
 *       cash balance is a simple accumulation.
 *
 * Pure function: (household, events, assumptions, rules) → SimulationResult.
 * No wall-clock, no randomness, no I/O.
 */

import type {
  AnnualRow,
  Assumptions,
  ChildbirthEvent,
  EducationPlan,
  Household,
  LifeEvent,
  OneTimeEvent,
  Person,
  PersonIncomeRow,
  Rate,
  RecurringModifierEvent,
  RuleSet,
  SimulationResult,
  SocialInsuranceRules,
  Yen
} from "./types/index.js";
import { bonusAnnualAt, indexFactor, indexationAt, monthlyBaseAt } from "./income/curve.js";
import { annualBaseExpenses, type ExpenseLine } from "./expenses/base.js";
import { annualOneTimeEvents, annualRecurringEvents } from "./expenses/events.js";
import { annualEducationExpenses, type ChildEducationInput } from "./expenses/education.js";
import { salaryIncome } from "./tax/salaryIncome.js";
import { computeIncomeTax } from "./tax/incomeTax.js";
import { computeResidentTax } from "./tax/residentTax.js";
import { furusatoNozeiLimit } from "./tax/furusato.js";
import {
  bonusPremiums,
  employmentInsurance,
  lookupStandardMonthly,
  monthlyPremiums
} from "./tax/socialInsurance.js";
import { annualChildbirthBenefits, type BenefitLine, type LeaveWageBasis } from "./benefits/childbirth.js";
import { annualChildBenefits } from "./benefits/childAllowance.js";
import { monthlyLeavePlan, type MonthWorkPlan } from "./benefits/leave.js";
import { ageInYear, parseYearMonth } from "./util/yearmonth.js";

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

interface DeterministicRates {
  inflation: Rate;
  wage: Rate;
  /**
   * Education-cost inflation (design doc: distinct from general CPI).
   * Phase 2 supplies a deterministic fixed value via the same
   * deterministicOverride mechanism as inflation/wage-growth, falling back
   * to the general inflation rate when no override is supplied.
   */
  education: Rate;
}

function deterministicRates(assumptions: Assumptions): DeterministicRates {
  const inflation = assumptions.deterministicOverride?.["inflation"] ?? assumptions.inflation.mean;
  return {
    inflation,
    wage: assumptions.deterministicOverride?.["wage-growth"] ?? assumptions.wageGrowth.mean,
    education: assumptions.deterministicOverride?.["education"] ?? inflation
  };
}

/**
 * Combine already-born household.children with children born via a future
 * ChildbirthEvent, each paired with its "education" event if one exists.
 * Ages before the child's birth year are handled by annualEducationExpenses
 * (year < birthYear → no cost), so no filtering is needed here.
 */
function collectChildrenForEducation(household: Household, events: LifeEvent[]): ChildEducationInput[] {
  const educationEvents = events.filter((e): e is EducationPlan => e.type === "education");

  const fromHousehold: ChildEducationInput[] = household.children.map((child) => ({
    childId: child.id,
    birthYearMonth: child.birthYearMonth,
    plan: educationEvents.find((e) => e.id === child.educationPlanRef)
  }));

  const fromEvents: ChildEducationInput[] = events
    .filter((e): e is ChildbirthEvent => e.type === "childbirth")
    .map((e) => ({
      childId: e.childId,
      birthYearMonth: e.expectedYearMonth,
      plan: educationEvents.find((p) => p.childId === e.childId)
    }));

  return [...fromHousehold, ...fromEvents];
}

/** Step 6: base expenses + recurring/one-time event modifiers + education cost table */
function computeExpenseLines(
  household: Household,
  year: number,
  startYear: number,
  rates: DeterministicRates,
  recurringEvents: RecurringModifierEvent[],
  oneTimeEvents: OneTimeEvent[],
  children: ChildEducationInput[],
  rules: RuleSet
): ExpenseLine[] {
  return [
    ...annualBaseExpenses(household.baseExpenses, year, startYear, rates),
    ...annualRecurringEvents(recurringEvents, year, startYear, rates),
    ...annualOneTimeEvents(oneTimeEvents, year),
    ...annualEducationExpenses(
      children,
      year,
      startYear,
      rates,
      rules.educationCosts,
      rules.childBenefits?.childcareCost
    )
  ];
}

/** Monthly pay and employee premiums summed over the 12-month work plan */
function monthlyPayrollTotals(
  months: MonthWorkPlan[],
  monthlyPay: Yen,
  isCareInsured: boolean,
  kumiaiEmployeeRate: Rate | undefined,
  si: SocialInsuranceRules
): { payTotal: Yen; premiumTotal: Yen } {
  const premiumsFor = (pay: Yen): Yen => {
    const input = { monthlyPay: pay, isCareInsured, rules: si } as const;
    return (
      kumiaiEmployeeRate !== undefined
        ? monthlyPremiums({ ...input, kumiaiEmployeeRate })
        : monthlyPremiums(input)
    ).total;
  };

  let payTotal = 0;
  let premiumTotal = 0;
  for (const month of months) {
    const pay = Math.floor(monthlyPay * month.payFactor);
    payTotal += pay;
    if (pay > 0) {
      premiumTotal += premiumsFor(pay) + employmentInsurance(pay, si);
    } else if (!month.siExempt) {
      // Leave month without statutory exemption: premiums continue on the
      // pre-leave standard monthly (no pay, so no employment insurance).
      premiumTotal += premiumsFor(monthlyPay);
    }
  }
  return { payTotal, premiumTotal };
}

/** Bonus installment month indices (June/December) — documented simplification */
const BONUS_MONTH_INDICES = [5, 11] as const;

/** Annual gross pay and social insurance for one person-year */
function computePersonYear(
  person: Person,
  age: number,
  yearsElapsed: number,
  rates: { inflation: Rate; wage: Rate },
  rules: RuleSet,
  months: MonthWorkPlan[]
): { gross: Yen; monthlyPay: Yen; bonusAnnual: Yen; socialInsurance: Yen } {
  const isWorking = person.employment.type === "salaried" && age < person.retirementAge;
  if (!isWorking) return { gross: 0, monthlyPay: 0, bonusAnnual: 0, socialInsurance: 0 };

  const factor = indexFactor(indexationAt(person.incomeCurve, age), yearsElapsed, rates);
  const monthlyPay = Math.floor(monthlyBaseAt(person.incomeCurve, age) * factor);
  const bonusAnnualFull = Math.floor(bonusAnnualAt(person.incomeCurve, age) * factor);
  if (monthlyPay * 12 + bonusAnnualFull <= 0) {
    return { gross: 0, monthlyPay: 0, bonusAnnual: 0, socialInsurance: 0 };
  }

  // 介護保険第2号被保険者 (40-64). Year-granularity approximation:
  // applied for the whole year in which the person turns 40 / stops at 65.
  const isCareInsured = age >= 40 && age < 65;
  const kumiaiEmployeeRate =
    person.employment.healthInsurance === "kumiai" ? person.employment.kumiaiRate : undefined;
  const si = rules.socialInsurance;

  const payroll = monthlyPayrollTotals(months, monthlyPay, isCareInsured, kumiaiEmployeeRate, si);

  // Bonus prorated by leave months (company-specific rules are out of scope),
  // paid in two installments. The health-side annual cap is tracked per
  // calendar year (fiscal-year approx.)
  const leaveMonthCount = months.filter((m) => m.payFactor === 0).length;
  const bonusPaid = Math.floor((bonusAnnualFull * (12 - leaveMonthCount)) / 12);
  const firstInstallment = Math.floor(bonusPaid / 2);
  const installments = [firstInstallment, bonusPaid - firstInstallment];
  let bonusTotal = 0;
  let healthBonusCumulative = 0;
  for (const [i, payment] of installments.entries()) {
    if (payment <= 0) continue;
    const monthPlan = months[BONUS_MONTH_INDICES[i] ?? 11];
    const isExemptMonth = monthPlan !== undefined && monthPlan.payFactor === 0 && monthPlan.siExempt;
    if (!isExemptMonth) {
      const input = { bonusPayment: payment, healthBonusCumulative, isCareInsured, rules: si } as const;
      const b =
        kumiaiEmployeeRate !== undefined
          ? bonusPremiums({ ...input, kumiaiEmployeeRate })
          : bonusPremiums(input);
      bonusTotal += b.total;
      healthBonusCumulative += b.standardBonus;
    }
    // 雇用保険は賃金支払いがあれば徴収される (社保免除の対象外)
    bonusTotal += employmentInsurance(payment, si);
  }

  return {
    gross: payroll.payTotal + bonusPaid,
    monthlyPay,
    bonusAnnual: bonusPaid,
    socialInsurance: payroll.premiumTotal + bonusTotal
  };
}

export function runDeterministic(
  household: Household,
  events: LifeEvent[],
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

  const recurringEvents = events.filter((e): e is RecurringModifierEvent => e.type === "recurring");
  const oneTimeEvents = events.filter((e): e is OneTimeEvent => e.type === "one-time");
  // Without rules.childbirth there is no statutory basis loaded (e.g. a
  // Phase 1 rule file), so leave plans are ignored entirely rather than
  // zeroing pay with no offsetting benefit.
  const childbirthEvents = rules.childbirth
    ? events.filter((e): e is ChildbirthEvent => e.type === "childbirth")
    : [];
  const children = collectChildrenForEducation(household, events);
  const parentalSiExempt = rules.childbirth?.parentalLeaveBenefit.socialInsuranceExemption ?? true;

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
      const age = ageInYear(person.birthYearMonth, year);
      ages[person.id] = age;
      const months = monthlyLeavePlan(childbirthEvents, person.id, year, parentalSiExempt);
      grossById.set(person.id, computePersonYear(person, age, yearsElapsed, rates, rules, months));
    }

    // 合計所得 per person (needed cross-wise for spouse deduction)
    const totalIncomeById = new Map<string, Yen>();
    for (const person of household.persons) {
      const g = grossById.get(person.id);
      totalIncomeById.set(person.id, g ? salaryIncome(g.gross, rules.incomeTax) : 0);
    }

    // Step 3: benefits. All lines are tax-exempt (育休給付は雇用保険法12条、
    // 出産手当金・一時金は健保法62条), so they bypass steps 4-5 and are added
    // to household cash flow directly.
    // Known gap: g.monthlyPay is 0 once age >= retirementAge, so a leave that
    // spans into the retirement year silently loses its wage basis and the
    // corresponding maternity/parental benefit for that year (leave pay is
    // still zeroed by monthlyLeavePlan either way). Retiring mid-leave is an
    // edge case the profile schema doesn't otherwise model.
    const wageBasis: { [personId: string]: LeaveWageBasis } = {};
    for (const person of household.persons) {
      const g = grossById.get(person.id);
      if (!g || g.monthlyPay <= 0) continue;
      wageBasis[person.id] = {
        monthlyPay: g.monthlyPay,
        standardMonthly: lookupStandardMonthly(g.monthlyPay, rules.socialInsurance)
      };
    }
    const benefits: BenefitLine[] = [
      ...annualChildbirthBenefits(childbirthEvents, year, wageBasis, rules.childbirth),
      ...annualChildBenefits(children, household.municipality, year, rules.childBenefits)
    ];

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

    // Step 6: expenses (base items + recurring/one-time event modifiers + education costs)
    const expenseLines = computeExpenseLines(
      household,
      year,
      startYear,
      rates,
      recurringEvents,
      oneTimeEvents,
      children,
      rules
    );
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
