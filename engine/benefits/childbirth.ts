/**
 * Childbirth-related benefits (design doc §4 ChildbirthEvent, §6 childbirth,
 * §8 手順3): 出産育児一時金, 出産手当金, 育児休業給付金, 出生後休業支援給付.
 *
 * All amounts here are TAX-EXEMPT and outside social-insurance assessment
 * (rules.parentalLeaveBenefit.taxExempt; 雇用保険法12条 / 健保法62条), so the
 * pipeline adds them to cash flow WITHOUT running them through the tax steps.
 *
 * Month-granularity conventions (the engine's time axis is monthly):
 * - 育児休業給付の支給単位期間(30日)を暦月1か月と同一視する。従って
 *   「180日まで67%」は開始から6か月(180/30)までとして扱う。
 * - 出産手当金の支給日数(産前42+産後56)は、休業窓が年をまたぐ場合に
 *   月数比で各年へ按分する(端数は前年側切捨て・最終年に残余)。
 * - 多胎(beforeBirthMultiple)はイベント側に多胎フラグがないため未対応。
 *
 * Documented simplifications:
 * - 出産手当金の標準報酬は「支給開始日以前12か月の平均」ではなく休業年の
 *   標準報酬月額をそのまま使う(賃金カーブの年内変動を持たないため同値)。
 * - 出生後休業支援給付の両親要件(ともに14日以上)・産後8週以内要件は
 *   プロファイル側で検証済みの postnatalSupportDays を信頼し、エンジンは
 *   maxDays へのクランプと育休取得の有無のみ確認する。
 * - 出産育児一時金は産科医療補償制度加入機関での出産を前提とする
 *   (lumpSumWithoutObstetricCompensation はイベント側に選択肢がないため未使用)。
 */

import type { ChildbirthEvent, ChildbirthRules, Yen, YearMonth } from "../types/index.js";
import { applyRate } from "../tax/rounding.js";
import { monthOrdinal, parseYearMonth } from "../util/yearmonth.js";

export interface BenefitLine {
  label: string;
  amount: Yen;
}

/** Wage basis for leave benefits, supplied per person by the pipeline */
export interface LeaveWageBasis {
  /** Pre-leave monthly pay of the simulated year (賃金日額 basis; bonus excluded) */
  monthlyPay: Yen;
  /** 標準報酬月額 mapped from monthly pay (出産手当金 basis) */
  standardMonthly: Yen;
}

interface LeaveWindow {
  from: YearMonth;
  to: YearMonth;
}

/** 支給単位期間 = 30日 (雇用保険の給付単位、月粒度の換算にも使用) */
const DAYS_PER_BENEFIT_UNIT = 30;
/** Boundary encoded in the rules schema field name `rateFirst180Days` */
const FIRST_RATE_DAYS = 180;

/**
 * 出産手当金の支給日額: 標準報酬月額 ÷ 30 (1の位を四捨五入 → 10円単位)
 * × 2/3 (小数点以下四捨五入 → 円単位)。協会けんぽの計算規則に従う。
 */
function maternityDailyAllowance(standardMonthly: Yen, rules: ChildbirthRules): Yen {
  const dailyStandard = Math.round(standardMonthly / DAYS_PER_BENEFIT_UNIT / 10) * 10;
  return Math.round(applyRate(dailyStandard, rules.maternityAllowanceRate));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * 出産手当金 (産前42日 + 産後56日) のうち `year` に属する額。
 * 支給日数は休業窓の月数比で各年に按分する。
 */
function maternityAllowanceForYear(
  window: LeaveWindow,
  year: number,
  standardMonthly: Yen,
  rules: ChildbirthRules
): Yen {
  const fromOrd = monthOrdinal(window.from);
  const toOrd = monthOrdinal(window.to);
  const totalMonths = toOrd - fromOrd + 1;
  if (totalMonths <= 0) return 0;

  const monthsBefore = clamp(year * 12 - fromOrd, 0, totalMonths);
  const monthsThrough = clamp(year * 12 + 12 - fromOrd, 0, totalMonths);
  if (monthsThrough <= monthsBefore) return 0;

  const totalDays = rules.maternityLeaveDays.beforeBirth + rules.maternityLeaveDays.afterBirth;
  const daysBefore = Math.floor((totalDays * monthsBefore) / totalMonths);
  const daysThrough = Math.floor((totalDays * monthsThrough) / totalMonths);
  return maternityDailyAllowance(standardMonthly, rules) * (daysThrough - daysBefore);
}

/** 休業開始時賃金日額 (月給 ÷ 30、円未満切捨て) を上限でクランプ */
function cappedWageDaily(monthlyPay: Yen, benefit: ChildbirthRules["parentalLeaveBenefit"]): Yen {
  return Math.min(Math.floor(monthlyPay / DAYS_PER_BENEFIT_UNIT), benefit.wageDailyCap);
}

/** 育児休業給付金のうち `year` に属する額 (単位期間ごとに67%/50%と上限を適用) */
function parentalLeaveBenefitForYear(
  window: LeaveWindow,
  year: number,
  monthlyPay: Yen,
  benefit: ChildbirthRules["parentalLeaveBenefit"]
): Yen {
  const fromOrd = monthOrdinal(window.from);
  const toOrd = monthOrdinal(window.to);
  const wageDaily = cappedWageDaily(monthlyPay, benefit);

  let total = 0;
  for (let m = 0; m < 12; m++) {
    const ord = year * 12 + m;
    if (ord < fromOrd || ord > toOrd) continue;
    const unit = ord - fromOrd + 1;
    const isFirstPhase = unit * DAYS_PER_BENEFIT_UNIT <= FIRST_RATE_DAYS;
    const rate = isFirstPhase ? benefit.rateFirst180Days : benefit.rateAfter;
    const cap = isFirstPhase ? benefit.monthlyCapFirst : benefit.monthlyCapAfter;
    total += Math.min(Math.floor(applyRate(wageDaily * DAYS_PER_BENEFIT_UNIT, rate)), cap);
  }
  return total;
}

/** 出生後休業支援給付: 賃金日額 × 対象日数(≤28) × 13%、円未満切捨て */
function postnatalSupportAmount(
  declaredDays: number,
  monthlyPay: Yen,
  benefit: ChildbirthRules["parentalLeaveBenefit"]
): Yen {
  const wageDaily = cappedWageDaily(monthlyPay, benefit);
  const days = Math.min(declaredDays, benefit.postnatalSupport.maxDays);
  return Math.floor(applyRate(wageDaily * days, benefit.postnatalSupport.rate));
}

/** All childbirth-related benefit lines attributable to `year` */
export function annualChildbirthBenefits(
  events: ChildbirthEvent[],
  year: number,
  wageBasisByPerson: { [personId: string]: LeaveWageBasis },
  rules: ChildbirthRules | undefined
): BenefitLine[] {
  if (!rules) return [];
  const lines: BenefitLine[] = [];

  for (const event of events) {
    if (parseYearMonth(event.expectedYearMonth).year === year) {
      // 一時金は出産費用実費と相殺して1行で計上する (§8 手順3「実費と相殺」)。
      // 実費が一時金を上回る場合は負の給付(= 持ち出し)になる。
      lines.push({
        label: `出産育児一時金(実費相殺・${event.childId})`,
        amount: rules.lumpSum - event.deliveryCost
      });
    }

    for (const plan of event.leavePlans) {
      const basis = wageBasisByPerson[plan.personId];
      if (!basis) continue; // 非給与所得者・無収入者は被保険者給付の対象外

      if (plan.maternityLeave) {
        const amount = maternityAllowanceForYear(plan.maternityLeave, year, basis.standardMonthly, rules);
        if (amount > 0) lines.push({ label: `出産手当金(${plan.personId})`, amount });
      }

      if (plan.parentalLeave) {
        const amount = parentalLeaveBenefitForYear(
          plan.parentalLeave,
          year,
          basis.monthlyPay,
          rules.parentalLeaveBenefit
        );
        if (amount > 0) lines.push({ label: `育児休業給付金(${plan.personId})`, amount });

        // Unlike maternityAllowanceForYear/parentalLeaveBenefitForYear above,
        // this is booked 100% in the leave-start year with no year-spanning
        // proration — a December leave start front-loads the full amount.
        // Documented simplification (see module header); not a bug.
        const declaredDays = plan.postnatalSupportDays ?? 0;
        if (declaredDays > 0 && parseYearMonth(plan.parentalLeave.from).year === year) {
          lines.push({
            label: `出生後休業支援給付(${plan.personId})`,
            amount: postnatalSupportAmount(declaredDays, basis.monthlyPay, rules.parentalLeaveBenefit)
          });
        }
      }
    }
  }
  return lines;
}
