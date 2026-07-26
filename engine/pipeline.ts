/**
 * Annual pipeline (design doc §8, Phase 1-3 scope = steps 1-7):
 *  1. income (curve interpolation x wage indexation; maternity/parental
 *     leave months replace pay with zero, short-hours factor on return)
 *  2. social insurance (standard monthly grade, bonus, employment insurance;
 *     leave months exempted per statute / rules flag)
 *  3. benefits (childbirth lump sum, maternity allowance, parental leave
 *     benefit, child allowance, Tokyo 018, municipal) — all tax-exempt, so
 *     they enter cash flow directly and never touch steps 4-5
 *  4. income tax (salary income deduction → deductions → brackets → surtax
 *     → 住宅ローン控除, spillover into next year's resident tax)
 *  5. resident tax — levied on the PREVIOUS year's income, less any carried
 *     housing-credit spillover
 *  6. expenses (base items x indexation + recurring/one-time event modifiers
 *     + education cost table expansion + housing holding costs/purchase
 *     cash outflow; rent items terminated by a purchase event stop here)
 *  7. loan amortization (base-rate path, 5-year/125% rule, prepayments) —
 *     computed BEFORE step 4 in code (ahead of its design-doc step number)
 *     because the housing tax credit needs this year's year-end balance;
 *     the loan math itself has no dependency on this year's tax result.
 *  8. savings / drawdown: if cash clears the buffer (cashBufferMonths x
 *     monthly expenses), the surplus is contributed per SavingsPolicy
 *     .contributions in order (NISA quota-checked); if cash falls short,
 *     the shortfall is drawn down per SavingsPolicy.drawdown.order (taxable
 *     withdrawals incur capital gains tax; NISA quota consumed by a sale
 *     restores the following year, per nisa.ts).
 *  9. investment returns: this year's per-asset-class return (expected
 *     value in the deterministic path) is applied to every holding.
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
  HousingLoan,
  HousingPurchaseEvent,
  LifeEvent,
  LoanPrepaymentEvent,
  OneTimeEvent,
  Person,
  PersonIncomeRow,
  Rate,
  RecurringModifierEvent,
  RuleSet,
  SimulationResult,
  SocialInsuranceRules,
  Yen,
  YearMonth
} from "./types/index.js";
import { bonusAnnualAt, indexFactor, indexationAt, monthlyBaseAt } from "./income/curve.js";
import { constantIndexation, pathFactor, type IndexationFactors } from "./indexation.js";
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
import type { DependentInput } from "./tax/dependents.js";
import { monthlyLeavePlan, type MonthWorkPlan } from "./benefits/leave.js";
import { buildBaseRatePath } from "./housing/baseRate.js";
import { annualHoldingCosts, annualPurchaseCashOutflow } from "./housing/holdingCosts.js";
import { annualLoanRow, initLoanState, initialRateFor, type LoanState, type LoanYearRow } from "./housing/loan.js";
import { applyHousingCredit, housingLoanCreditForYear } from "./housing/taxCredit.js";
import { ageInYear, monthOrdinal, parseYearMonth } from "./util/yearmonth.js";
import { applyContributions } from "./invest/contributions.js";
import { applyDrawdown } from "./invest/drawdown.js";
import { accountTotals, initHoldings, type HoldingsState } from "./invest/holdings.js";
import { restoreNisaQuota, type NisaState } from "./invest/nisa.js";
import { applyAnnualReturns } from "./invest/returns.js";

export interface PipelineOptions {
  /** First simulated year assumes previous-year income = first-year income (kit §2-3) */
  firstYearResidentTaxAssumesSameIncome?: boolean;
  /**
   * モンテカルロ試行が1本のパスを評価する際に、決定論の期待値パスの代わりに
   * 使う実現値(generateFactorPaths由来)。未指定なら従来どおり決定論パス
   * (期待値/deterministicOverride)を使う。
   */
  stochasticPaths?: {
    /** year → rate */
    baseRate?: Map<number, Rate>;
    /** assetClassId → rate[], index = year - startYear */
    assetReturns?: { [assetClassId: string]: Rate[] };
    /** インフレ率の年次実現値, index = year - startYear */
    inflation?: Rate[];
    /** 賃金上昇率の年次実現値, index = year - startYear */
    wage?: Rate[];
  };
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

/**
 * インフレ・賃金・教育費の累積倍率。決定論パスは一定率の複利、モンテカルロ試行は
 * 年次実現値の累積積を使う(engine/indexation.ts)。
 *
 * `deterministicOverride` は決定論の期待値を差し替えるためのものなので、実現値の
 * パスが渡されている指標ではそちらを優先する。教育費のインフレは実現値パスを
 * 持たないため、一般物価の実現値に追随させる(設計書§5: 教育費は一般物価と別の
 * 率を置けるが、確率変動の因子としては独立に扱っていない)。
 */
function indexationFactors(
  assumptions: Assumptions,
  stochastic?: PipelineOptions["stochasticPaths"]
): IndexationFactors {
  const inflationMean = assumptions.deterministicOverride?.["inflation"] ?? assumptions.inflation.mean;
  const wageMean = assumptions.deterministicOverride?.["wage-growth"] ?? assumptions.wageGrowth.mean;
  const educationMean = assumptions.deterministicOverride?.["education"] ?? inflationMean;

  const constant = constantIndexation({
    inflation: inflationMean,
    wage: wageMean,
    education: educationMean
  });

  const inflationPath = stochastic?.inflation;
  const wagePath = stochastic?.wage;
  if (inflationPath === undefined && wagePath === undefined) return constant;

  // 教育費は一般物価の実現値に、決定論での差分(教育率 − 物価率)を上乗せして追随させる
  const educationSpread = educationMean - inflationMean;
  return {
    inflation: inflationPath === undefined ? constant.inflation : pathFactor(inflationPath),
    wage: wagePath === undefined ? constant.wage : pathFactor(wagePath),
    education:
      inflationPath === undefined
        ? constant.education
        : pathFactor(inflationPath.map((rate) => rate + educationSpread))
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

/**
 * Step 6: base expenses (rent items stop at any HousingPurchaseEvent that
 * names them in terminatesExpenseLabels) + recurring/one-time event
 * modifiers + education cost table + housing purchase cash outflow/holding
 * costs. Loan repayment itself is tracked separately (step 7's housing rows),
 * not folded into this expense list, to match the design doc's AnnualRow
 * shape (`expenses` vs. `housing`).
 */
function computeExpenseLines(
  household: Household,
  year: number,
  startYear: number,
  rates: IndexationFactors,
  recurringEvents: RecurringModifierEvent[],
  oneTimeEvents: OneTimeEvent[],
  children: ChildEducationInput[],
  rules: RuleSet,
  housingPurchaseEvents: HousingPurchaseEvent[],
  rentTerminations: Map<string, YearMonth>
): ExpenseLine[] {
  return [
    ...annualBaseExpenses(household.baseExpenses, year, startYear, rates, rentTerminations),
    ...annualRecurringEvents(recurringEvents, year, startYear, rates),
    ...annualOneTimeEvents(oneTimeEvents, year),
    ...annualEducationExpenses(
      children,
      year,
      startYear,
      rates,
      rules.educationCosts,
      rules.childBenefits?.childcareCost
    ),
    ...annualPurchaseCashOutflow(housingPurchaseEvents, year),
    ...annualHoldingCosts(housingPurchaseEvents, year)
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
  rates: Pick<IndexationFactors, "inflation" | "wage">,
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

interface LoanContext {
  event: HousingPurchaseEvent;
  loan: HousingLoan;
  originationOrdinal: number;
}

/** Loans grouped by (purchase event, borrower) for 住宅ローン控除 (limits/years are per-purchase, balances are per-borrower's own loan) */
interface CreditGroup {
  event: HousingPurchaseEvent;
  personId: string;
  loanIds: string[];
}

function buildLoanContexts(housingPurchaseEvents: HousingPurchaseEvent[]): LoanContext[] {
  return housingPurchaseEvents.flatMap((event) =>
    event.loans.map((loan) => ({ event, loan, originationOrdinal: monthOrdinal(event.yearMonth) }))
  );
}

/**
 * Groups are keyed by whatever `borrowerPersonId` the profile declares; the
 * engine does not validate it against household.persons (consistent with
 * other cross-reference fields like ChildbirthEvent.leavePlans[].personId —
 * profile data is trusted, not re-validated internally). A candidate credit
 * for an unknown personId is simply never read back, since the step-4 tax
 * loop only iterates household.persons.
 *
 * Known simplification: if the same person holds qualifying loans across
 * TWO separate HousingPurchaseEvents, their candidate credits are summed
 * (per-event borrowLimit/years are still respected individually), which
 * does not model the statutory "one primary residence" restriction. The
 * profile schema has no concept of which purchase is the current primary
 * residence, so this is left unenforced rather than guessed at.
 */
function buildCreditGroups(housingPurchaseEvents: HousingPurchaseEvent[]): CreditGroup[] {
  const groups: CreditGroup[] = [];
  for (const event of housingPurchaseEvents) {
    const byPerson = new Map<string, string[]>();
    for (const loan of event.loans) {
      const list = byPerson.get(loan.borrowerPersonId) ?? [];
      list.push(loan.loanId);
      byPerson.set(loan.borrowerPersonId, list);
    }
    for (const [personId, loanIds] of byPerson) {
      groups.push({ event, personId, loanIds });
    }
  }
  return groups;
}

export function runDeterministic(
  household: Household,
  events: LifeEvent[],
  assumptions: Assumptions,
  rules: RuleSet,
  options?: PipelineOptions
): SimulationResult {
  const firstYearSameIncome = options?.firstYearResidentTaxAssumesSameIncome ?? true;
  const rates = indexationFactors(assumptions, options?.stochasticPaths);
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

  const housingPurchaseEvents = events.filter(
    (e): e is HousingPurchaseEvent => e.type === "housing-purchase"
  );
  const prepaymentEvents = events.filter((e): e is LoanPrepaymentEvent => e.type === "loan-prepayment");
  const loanContexts = buildLoanContexts(housingPurchaseEvents);
  const creditGroups = buildCreditGroups(housingPurchaseEvents);
  const rentTerminations = new Map<string, YearMonth>();
  for (const event of housingPurchaseEvents) {
    for (const label of event.terminatesExpenseLabels) rentTerminations.set(label, event.yearMonth);
  }

  const baseRatePath = options?.stochasticPaths?.baseRate ?? buildBaseRatePath(assumptions.baseRate, startYear, endYear);
  const baseRateForYear = (year: number): Rate => baseRatePath.get(year) ?? assumptions.baseRate.initial;

  const loanStates = new Map<string, LoanState>();
  for (const ctx of loanContexts) {
    const originationYear = Math.floor(ctx.originationOrdinal / 12);
    loanStates.set(ctx.loan.loanId, initLoanState(ctx.loan, initialRateFor(ctx.loan, baseRateForYear, originationYear)));
  }

  const initialCash = household.financialAssets
    .filter((h) => h.account === "cash")
    .reduce((sum, h) => sum + h.balance, 0);
  let holdings: HoldingsState = initHoldings(household.financialAssets);
  let nisaState: NisaState = {
    lifetimeUsed: household.financialAssets.reduce((sum, h) => sum + (h.nisaLifetimeUsed ?? 0), 0),
    growthUsed: household.financialAssets
      .filter((h) => h.account === "nisa-growth")
      .reduce((sum, h) => sum + (h.nisaLifetimeUsed ?? 0), 0)
  };
  /** NISA売却分の簿価復活は翌年に反映する(design doc §5 quotaRestoration) */
  let pendingNisaRestoration = { tsumitate: 0, growth: 0 };

  let cashBalance = initialCash;
  const pendingResidentTax = new Map<string, Yen>();
  /** 住宅ローン控除のうち所得税から引ききれず住民税へ繰り越された額 (design doc §8 手順4-5) */
  const pendingHousingCreditSpillover = new Map<string, Yen>();
  const rows: AnnualRow[] = [];

  for (let year = startYear; year <= endYear; year++) {
    // NISA quota restored from last year's NISA sales (design doc: restoration lands the FOLLOWING year)
    nisaState = restoreNisaQuota(nisaState, pendingNisaRestoration);

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

    // Step 7 (computed here, ahead of its design-doc number — see module
    // header): housing loan amortization. This year's year-end balance
    // feeds the 住宅ローン控除 candidate in step 4 below.
    const housingRows: { [loanId: string]: LoanYearRow } = {};
    for (const ctx of loanContexts) {
      // Loan not yet originated: omit it from this year's housing output
      // entirely (no disbursed balance exists yet to report).
      if (year < Math.floor(ctx.originationOrdinal / 12)) continue;
      const state = loanStates.get(ctx.loan.loanId);
      if (!state) continue;
      const loanPrepayments = prepaymentEvents.filter((p) => p.loanId === ctx.loan.loanId);
      const { state: next, row } = annualLoanRow(
        state,
        ctx.loan,
        year,
        ctx.originationOrdinal,
        baseRateForYear,
        loanPrepayments
      );
      loanStates.set(ctx.loan.loanId, next);
      housingRows[ctx.loan.loanId] = row;
    }
    const housingCreditCandidateByPerson = new Map<string, Yen>();
    for (const group of creditGroups) {
      const balances = group.loanIds.map((id) => housingRows[id]?.balance ?? 0);
      const candidate = housingLoanCreditForYear(
        group.event,
        balances,
        year,
        totalIncomeById.get(group.personId) ?? 0,
        rules.housingLoanTaxCredit
      );
      housingCreditCandidateByPerson.set(
        group.personId,
        (housingCreditCandidateByPerson.get(group.personId) ?? 0) + candidate
      );
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

    // 扶養親族の帰属: 累進課税なので、その年の合計所得が最も高い人物に子を全員
    // 寄せると世帯の税額が最小になる(設計書§8 4-1)。同額なら persons の先頭。
    const dependentClaimantId = household.persons.reduce<string | undefined>((best, p) => {
      if (best === undefined) return p.id;
      return (totalIncomeById.get(p.id) ?? 0) > (totalIncomeById.get(best) ?? 0) ? p.id : best;
    }, undefined);
    // 出生前の子は age < 0 になるので除外する(その年はまだ扶養親族ではない)。
    // 子以外の被扶養親族(household.dependents)も同じ扶養に入れる。
    const householdDependents: DependentInput[] = [
      ...children.map((c) => ({ age: ageInYear(c.birthYearMonth, year) })),
      ...(household.dependents ?? []).map((d) => ({
        age: ageInYear(d.birthYearMonth, year),
        coResidentDirectAscendant: d.coResidentDirectAscendant,
        annualIncome: d.annualIncome
      }))
    ].filter((d) => d.age >= 0);

    // Step 4-5: income tax and resident tax per person
    const appliedHousingCreditByPerson = new Map<string, Yen>();
    const newHousingSpilloverByPerson = new Map<string, Yen>();
    for (const person of household.persons) {
      const g = grossById.get(person.id);
      if (!g) continue;
      const totalIncome = totalIncomeById.get(person.id) ?? 0;
      const spouse =
        household.persons.length === 2
          ? household.persons.find((p) => p.id !== person.id)
          : undefined;
      const spouseTotalIncome = spouse ? totalIncomeById.get(spouse.id) : undefined;
      const spouseAge = spouse ? ageInYear(spouse.birthYearMonth, year) : undefined;
      const idecoAnnual = (person.deductions.idecoMonthly ?? 0) * 12;

      const taxInputBase = {
        totalIncome,
        socialInsurancePaid: g.socialInsurance,
        idecoAnnual,
        spouseAge,
        dependents: person.id === dependentClaimantId ? householdDependents : []
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

      // 住宅ローン控除: 所得税から先に充当し、引ききれない額は翌年の住民税へ繰越。
      const candidateCredit = housingCreditCandidateByPerson.get(person.id) ?? 0;
      const credit = applyHousingCredit(
        candidateCredit,
        incomeTax.tax,
        incomeTax.taxableIncome,
        rules.housingLoanTaxCredit
      );
      appliedHousingCreditByPerson.set(person.id, Math.min(candidateCredit, incomeTax.tax));
      newHousingSpilloverByPerson.set(person.id, credit.residentTaxSpillover);

      econ.set(person.id, {
        gross: g.gross,
        socialInsurance: g.socialInsurance,
        totalIncome,
        incomeTax: credit.incomeTaxAfterCredit,
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
      const residentTaxBeforeSpillover =
        carried ?? (firstYearSameIncome && year === startYear ? e.residentTaxForNextYear : 0);
      pendingResidentTax.set(person.id, e.residentTaxForNextYear);

      // 前年分の住宅ローン控除で住民税へ繰り越された額をこの年の住民税から差し引く。
      const carriedSpillover = pendingHousingCreditSpillover.get(person.id) ?? 0;
      const residentTaxThisYear = Math.max(0, residentTaxBeforeSpillover - carriedSpillover);
      pendingHousingCreditSpillover.set(person.id, newHousingSpilloverByPerson.get(person.id) ?? 0);

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

    // Step 6: expenses (base items + recurring/one-time event modifiers +
    // education costs + housing purchase/holding costs; rent items
    // terminated by a purchase event are excluded via rentTerminations)
    const expenseLines = computeExpenseLines(
      household,
      year,
      startYear,
      rates,
      recurringEvents,
      oneTimeEvents,
      children,
      rules,
      housingPurchaseEvents,
      rentTerminations
    );
    const totalExpenses = expenseLines.reduce((sum, l) => sum + l.amount, 0);
    const totalNet = Object.values(incomeRows).reduce((sum, r) => sum + r.net, 0);
    const totalBenefits = benefits.reduce((sum, b) => sum + b.amount, 0);
    const totalLoanPayments = Object.values(housingRows).reduce((sum, r) => sum + r.payment, 0);
    // Only the portion applied against THIS year's income tax — any amount
    // that spilled over to reduce NEXT year's resident tax is not included
    // here (it instead shows up as a lower income[personId].residentTax in
    // that future year's row, per applyHousingCredit's spillover carry).
    const totalHousingCreditApplied = Array.from(appliedHousingCreditByPerson.values()).reduce(
      (sum, v) => sum + v,
      0
    );

    cashBalance += totalNet + totalBenefits - totalExpenses - totalLoanPayments;
    const monthlyExpenses = totalExpenses / 12;
    const bufferTarget = household.savingsPolicy.cashBufferMonths * monthlyExpenses;

    // Step 8: contribute the surplus above the cash buffer, or draw down the
    // shortfall below it (design doc §8 手順8). Exactly one of the two runs.
    let contributionsTotal = 0;
    let withdrawalsTotal = 0;
    let capitalGainsTaxTotal = 0;
    let nisaAnnualUsed = { tsumitate: 0, growth: 0 };
    let soldNisaCostBasisThisYear = { tsumitate: 0, growth: 0 };

    if (cashBalance >= bufferTarget) {
      const result = applyContributions(
        household.savingsPolicy.contributions,
        cashBalance - bufferTarget,
        holdings,
        nisaState,
        rules.nisa
      );
      holdings = result.holdings;
      nisaState = result.nisaState;
      nisaAnnualUsed = result.nisaAnnualUsed;
      contributionsTotal = result.totalContributed;
      cashBalance -= contributionsTotal;
    } else {
      const result = applyDrawdown(
        household.savingsPolicy.drawdown.order,
        bufferTarget - cashBalance,
        holdings,
        rules.capitalGainsTax
      );
      holdings = result.holdings;
      withdrawalsTotal = result.totalWithdrawn;
      capitalGainsTaxTotal = result.capitalGainsTax;
      soldNisaCostBasisThisYear = result.soldNisaCostBasis;
      cashBalance += result.netProceeds;
    }
    pendingNisaRestoration = soldNisaCostBasisThisYear;

    // Step 9: apply this year's realized returns to whatever remains.
    const assetReturnPaths = options?.stochasticPaths?.assetReturns;
    const injectedReturnsThisYear = assetReturnPaths
      ? Object.fromEntries(
          Object.entries(assetReturnPaths)
            .map(([assetClassId, path]) => [assetClassId, path[yearsElapsed]] as const)
            .filter((entry): entry is [string, Rate] => entry[1] !== undefined)
        )
      : undefined;
    holdings = applyAnnualReturns(holdings, assumptions, injectedReturnsThisYear);

    const investBalances = accountTotals(holdings);
    const investTotal = Object.values(investBalances).reduce((sum, v) => sum + v, 0);
    // 住宅評価額(簡易): 購入価格で据え置き(値上がり/値下がりはモデル化しない)。
    const housePriceIfPurchased = housingPurchaseEvents
      .filter((e) => year >= parseYearMonth(e.yearMonth).year)
      .reduce((sum, e) => sum + e.propertyPrice, 0);
    const loanBalanceTotal = Object.values(housingRows).reduce((sum, r) => sum + r.balance, 0);
    rows.push({
      year,
      ages,
      income: incomeRows,
      benefits,
      expenses: expenseLines.map((l) => ({ category: l.category, amount: l.amount })),
      housing: housingRows,
      taxCredits: { housingLoan: totalHousingCreditApplied },
      invest: {
        contributions: contributionsTotal,
        withdrawals: withdrawalsTotal,
        capitalGainsTax: capitalGainsTaxTotal,
        balances: investBalances,
        nisaLifetimeUsed: nisaState.lifetimeUsed,
        nisaAnnualUsed
      },
      cashBalance,
      netWorth: cashBalance + investTotal + housePriceIfPurchased - loanBalanceTotal,
      liquidityAlert: cashBalance < bufferTarget,
      furusatoNozeiLimit: furusato
    });
  }

  return { deterministic: rows };
}
