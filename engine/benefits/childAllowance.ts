/**
 * Child benefits (design doc §6 childBenefits, §8 手順3):
 * 児童手当, 東京都018サポート, 自治体独自給付.
 *
 * The engine iterates the 12 calendar months of the simulated year so that
 * month-precise rules are reproduced exactly:
 * - 支給開始は出生の翌月分から (児童手当法8条)
 * - 3歳未満15,000円は生後36か月に達する月の前月分まで(額改定は誕生月から)
 * - 支給終了は「18歳到達後最初の3月31日」= 到達年度末 (fiscalYearEndOrdinal)
 * - 第3子以降30,000円の多子カウントは22歳年度末までの子を年長順に数える
 *
 * Documented simplifications:
 * - 所得制限は2024年10月改正で撤廃済み(rules.incomeLimit = null)。過去年の
 *   ルールファイルで incomeLimit が設定されても本実装は評価しない。
 * - 018サポートは都内在住が前提。rules ファイル自体が地域スコープ
 *   (childcareCost.model = "tokyo-free-0to5") なので世帯側の判定は持たない。
 * - 現物給付(inKind: ギフトカード等)も現金同等として benefits に計上する。
 * - 支給月(偶数月・年6回)は年次集計では影響しないため月割で計上する。
 */

import type {
  AmountByBirthOrder,
  ChildBenefitsRules,
  MunicipalBenefit,
  Yen,
  YearMonth
} from "../types/index.js";
import { fiscalYearEndOrdinal, monthOrdinal } from "../util/yearmonth.js";
import type { BenefitLine } from "./childbirth.js";

/** Minimal child reference (household.children and ChildbirthEvent both satisfy it) */
export interface ChildRef {
  childId: string;
  birthYearMonth: YearMonth;
}

const MONTHS_PER_YEAR = 12;
/** 支給は出生の翌月分から (児童手当法8条・018サポートも同運用に統一) */
const FIRST_ELIGIBLE_AGE_MONTHS = 1;

function birthOrderAmount(amount: AmountByBirthOrder, rank: number): Yen {
  if (rank <= 1) return amount.first;
  if (rank === 2) return amount.second ?? amount.first;
  return amount.thirdPlus ?? amount.second ?? amount.first;
}

function sortByBirth(children: ChildRef[]): ChildRef[] {
  return [...children].sort((a, b) => monthOrdinal(a.birthYearMonth) - monthOrdinal(b.birthYearMonth));
}

/**
 * 多子加算の出生順位: 対象月時点で「22歳年度末まで」のカウント窓に入っている
 * 子を年長順に数えたときの、この子の順位 (1始まり)。
 */
function countedRank(child: ChildRef, sortedChildren: ChildRef[], ord: number, countedUntilAge: number): number {
  let rank = 0;
  for (const c of sortedChildren) {
    const isCounted =
      ord >= monthOrdinal(c.birthYearMonth) && ord <= fiscalYearEndOrdinal(c.birthYearMonth, countedUntilAge);
    if (isCounted) rank++;
    if (c.childId === child.childId) return rank;
  }
  return rank;
}

/**
 * 年齢帯レート: 額改定は「◯歳に達した日(=誕生日の前日)の翌月分から」
 * (児童手当法施行令)。household.birthYearMonth は日の情報を持たないため、
 * 誕生日が1日でない大多数のケースに合わせ「誕生月の翌月から新レート」と
 * 近似する(= band上限月まで旧レートを含める、以下の `<=`)。1日生まれの
 * 子だけ実際より1か月遅く切り替わる。
 */
function bandMonthly(bands: { untilAge: number; monthly: Yen }[], ageMonths: number, lastBand: { monthly: Yen }): Yen {
  for (const band of bands) {
    if (ageMonths <= band.untilAge * MONTHS_PER_YEAR) return band.monthly;
  }
  return lastBand.monthly;
}

/** 児童手当 (こども家庭庁・2024年10月拡充後) の年額を子ごとに計上 */
export function annualChildAllowance(
  children: ChildRef[],
  year: number,
  rules: ChildBenefitsRules | undefined
): BenefitLine[] {
  if (!rules) return [];
  const allowance = rules.childAllowance;
  const lastBand = allowance.ageBands[allowance.ageBands.length - 1];
  if (!lastBand) return [];
  const sorted = sortByBirth(children);

  const lines: BenefitLine[] = [];
  for (const child of children) {
    const birthOrd = monthOrdinal(child.birthYearMonth);
    const endOrd = fiscalYearEndOrdinal(child.birthYearMonth, lastBand.untilAge);
    let total = 0;
    for (let m = 0; m < MONTHS_PER_YEAR; m++) {
      const ord = year * MONTHS_PER_YEAR + m;
      const ageMonths = ord - birthOrd;
      if (ageMonths < FIRST_ELIGIBLE_AGE_MONTHS || ord > endOrd) continue;
      const rank = countedRank(child, sorted, ord, allowance.countedChildUntilAge);
      total +=
        rank >= 3 ? allowance.thirdChildMonthly : bandMonthly(allowance.ageBands, ageMonths, lastBand);
    }
    if (total > 0) lines.push({ label: `児童手当(${child.childId})`, amount: total });
  }
  return lines;
}

/** 月額×対象月数 (出生翌月〜untilAge歳年度末) を子ごとに合算する共通処理 */
function monthlyBenefitTotal(child: ChildRef, year: number, monthly: Yen, untilAge: number): Yen {
  const birthOrd = monthOrdinal(child.birthYearMonth);
  const endOrd = fiscalYearEndOrdinal(child.birthYearMonth, untilAge);
  let total = 0;
  for (let m = 0; m < MONTHS_PER_YEAR; m++) {
    const ord = year * MONTHS_PER_YEAR + m;
    const ageMonths = ord - birthOrd;
    if (ageMonths >= FIRST_ELIGIBLE_AGE_MONTHS && ord <= endOrd) total += monthly;
  }
  return total;
}

/** 東京都018サポート (月5,000円・0〜18歳年度末・所得制限なし) */
export function annualTokyo018(
  children: ChildRef[],
  year: number,
  rules: ChildBenefitsRules | undefined
): BenefitLine[] {
  if (!rules) return [];
  const lines: BenefitLine[] = [];
  for (const child of children) {
    const total = monthlyBenefitTotal(child, year, rules.tokyo018.monthly, rules.tokyo018.untilAge);
    if (total > 0) lines.push({ label: `018サポート(${child.childId})`, amount: total });
  }
  return lines;
}

function municipalBenefitFor(child: ChildRef, benefit: MunicipalBenefit, year: number, rank: number): Yen {
  if (benefit.type === "one-time") {
    if (benefit.atAge === undefined) return 0;
    // atAge歳の誕生月が属する暦年に一括計上
    const paymentOrd = monthOrdinal(child.birthYearMonth) + benefit.atAge * MONTHS_PER_YEAR;
    if (Math.floor(paymentOrd / MONTHS_PER_YEAR) !== year) return 0;
    return birthOrderAmount(benefit.amount, rank);
  }
  if (benefit.untilAge === undefined) return 0;
  return monthlyBenefitTotal(child, year, birthOrderAmount(benefit.amount, rank), benefit.untilAge);
}

/** 自治体独自給付 (household.municipality をキーに rules.municipal を参照) */
export function annualMunicipalBenefits(
  children: ChildRef[],
  municipality: string,
  year: number,
  rules: ChildBenefitsRules | undefined
): BenefitLine[] {
  if (!rules) return [];
  const benefits = rules.municipal[municipality] ?? [];
  if (benefits.length === 0) return [];
  const sorted = sortByBirth(children);

  const lines: BenefitLine[] = [];
  for (const child of children) {
    // 自治体給付の「第◯子」は生涯出生順位で判定 (多子カウント窓は児童手当固有)
    const rank = sorted.findIndex((c) => c.childId === child.childId) + 1;
    for (const benefit of benefits) {
      const amount = municipalBenefitFor(child, benefit, year, rank);
      if (amount > 0) lines.push({ label: `${benefit.label}(${child.childId})`, amount });
    }
  }
  return lines;
}

/** 児童手当 + 018 + 自治体給付をまとめて返す (pipeline §8 手順3 用) */
export function annualChildBenefits(
  children: ChildRef[],
  municipality: string,
  year: number,
  rules: ChildBenefitsRules | undefined
): BenefitLine[] {
  return [
    ...annualChildAllowance(children, year, rules),
    ...annualTokyo018(children, year, rules),
    ...annualMunicipalBenefits(children, municipality, year, rules)
  ];
}
