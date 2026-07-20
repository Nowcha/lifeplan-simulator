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

/* ---- Phase 2: childbirth / child benefits / education costs ---- */

export interface ChildbirthRules {
  /** 出産育児一時金: 産科医療補償制度に加入する機関での妊娠22週以降の出産 (1児あたり) */
  lumpSum: Yen;
  /** 産科医療補償制度に未加入の機関での出産等 (加算1.2万円なし) */
  lumpSumWithoutObstetricCompensation: Yen;
  /** 出産手当金: 標準報酬日額 (支給開始日以前12か月の平均標準報酬月額 ÷ 30) × このレート */
  maternityAllowanceRate: Rate;
  /** 出産手当金の支給対象日数 */
  maternityLeaveDays: {
    /** 出産(予定)日以前 (単胎) */
    beforeBirth: number;
    /** 出産(予定)日以前 (多胎) */
    beforeBirthMultiple: number;
    /** 出産の翌日以後 */
    afterBirth: number;
  };
  parentalLeaveBenefit: {
    /** 育児休業給付金 支給率: 通算180日まで */
    rateFirst180Days: Rate;
    /** 育児休業給付金 支給率: 181日目以降 */
    rateAfter: Rate;
    /** 休業開始時賃金日額の上限額 (毎年8月1日改定) */
    wageDailyCap: Yen;
    /** 支給上限額 (30日相当・67%区分) */
    monthlyCapFirst: Yen;
    /** 支給上限額 (30日相当・50%区分) */
    monthlyCapAfter: Yen;
    /** 出生後休業支援給付 (2025-04 創設) */
    postnatalSupport: {
      /** 上乗せ給付率 (67% と合算で実質手取り10割相当) */
      rate: Rate;
      /** 支給対象の最大日数 */
      maxDays: number;
      /** 原則、両親がともにこの日数以上の育児休業を取得することが要件 (配偶者非就業・ひとり親は例外) */
      bothParentsMinLeaveDays: number;
    };
    /** 育休中の社会保険料免除 (月末時点取得 or 同月内14日以上取得) */
    socialInsuranceExemption: boolean;
    /** 育児休業給付は非課税かつ社会保険料の算定対象外 (雇用保険法第12条) */
    taxExempt: boolean;
  };
  _source: RuleSource;
}

/** 出生順位別の給付額 (単一額の給付は first のみ設定) */
export interface AmountByBirthOrder {
  first: Yen;
  second?: Yen;
  thirdPlus?: Yen;
}

export interface MunicipalBenefit {
  label: string;
  /** monthly: 月額給付 / one-time: 特定年齢時の一時給付 */
  type: "monthly" | "one-time";
  /** monthly: 対象年齢上限 (この歳の年度末まで) */
  untilAge?: number;
  /** one-time: 支給対象となる年齢 (歳) */
  atAge?: number;
  amount: AmountByBirthOrder;
  /** 現物給付 (ギフトカード・こども商品券等) なら true */
  inKind: boolean;
}

export interface ChildBenefitsRules {
  childAllowance: {
    /** 年齢帯別の月額 (第1子・第2子) */
    ageBands: { untilAge: number; monthly: Yen }[];
    /** 第3子以降は全年齢で一律この月額 */
    thirdChildMonthly: Yen;
    /** 所得制限撤廃後は null */
    incomeLimit: Yen | null;
    /** 多子加算のカウント対象となる子の年齢上限 (この歳の年度末まで) */
    countedChildUntilAge: number;
    /** 支給月 (偶数月・年6回) */
    paymentMonths: number[];
  };
  /** 東京都 018サポート */
  tokyo018: { monthly: Yen; untilAge: number; incomeLimit: Yen | null };
  /** 自治体独自給付 (municipality キーは household.municipality に対応) */
  municipal: { [municipality: string]: MunicipalBenefit[] };
  /** 認可保育所等の保育料モデル */
  childcareCost: ChildcareCostRules;
  _source: RuleSource;
}

/** 認可保育料は本来世帯所得連動だが、東京都は無償化により実質0円 (2025年時点) */
export interface ChildcareCostRules {
  /** 保育料モデルの種別 */
  model: "tokyo-free-0to5";
  /** 3〜5歳: 国の幼児教育・保育無償化 (認可保育所・認定こども園の保育料) */
  freeFromAge3: boolean;
  /** 幼稚園利用時の無償化上限 (月額) */
  kindergartenMonthlyCap: Yen;
  /** 東京都独自: 0〜2歳の第1子保育料も無償化 (2025-09〜, 所得制限なし) */
  tokyoZeroToTwoFree: boolean;
  /** 無償化後に世帯負担として残る認可保育料の月額 (東京都在住は実質0円) */
  authorizedNurseryMonthly: Yen;
  /** 無償化対象外の実費: 副食費の目安月額 (給食費。年収360万円未満相当世帯・第3子以降は免除) */
  mealCostMonthlyEstimate: Yen;
  _source: RuleSource;
}

/** 教育費テーブル (education-costs.json)。文科省統計ベースの年額。 */
export type EducationIndexation = "education" | "inflation" | "fixed";

export interface EducationStageCost {
  /** 学習費総額 (年額): 学校教育費 + 学校給食費 + 学校外活動費 */
  public: { annual: Yen };
  private: { annual: Yen };
  _source: RuleSource;
}

export interface UniversityCost {
  /** 入学金 (初年度のみ) */
  admissionFee: Yen;
  /** 授業料 (年額) */
  annualTuition: Yen;
  /** 施設設備費 (年額。国立は0) */
  facilityFeeAnnual: Yen;
  _source: RuleSource;
}

export interface EducationCosts {
  /** 教育費インフレは一般CPIより高めに設定可能。係数は assumptions 側で供給する想定 */
  indexation: EducationIndexation;
  school: {
    /** 幼稚園 (保育所利用時は childBenefits.childcareCost 参照) */
    kindergarten: EducationStageCost;
    elementary: EducationStageCost;
    juniorHigh: EducationStageCost;
    /** 高等学校 (全日制)。総額は就学支援金反映後の実支出。 */
    highSchool: EducationStageCost;
  };
  university: {
    national: UniversityCost;
    privateLiberal: UniversityCost;
    privateScience: UniversityCost;
    /** 下宿生への仕送り月額 (公的統計ではなく全国大学生協連の調査値) */
    boardingAllowanceMonthly: Yen;
    _sourceBoarding: RuleSource;
  };
}

/**
 * One certification x new/used cell of the 住宅ローン減税 borrow-limit table
 * (国土交通省 令和8年度住宅税制改正概要, 別紙1). Keyed in HousingLoanTaxCreditRules
 * by `${category}-${"new"|"used"}` (e.g. "certified-new", "zeh-used"); the
 * "other-new" combination is intentionally absent — new-build 一般住宅 has
 * been outside the credit since the 2024 revision (省エネ基準適合が必須化).
 */
export interface HousingLoanCreditCategory {
  /** 控除期間 (年) */
  years: number;
  /** 借入限度額: 通常世帯 */
  borrowLimitBase: Yen;
  /** 借入限度額: 子育て世帯等(19歳未満の子を有する世帯 or 夫婦のいずれかが40歳未満) */
  borrowLimitWithChild: Yen;
}

export interface HousingLoanTaxCreditRules {
  rate: Rate;
  categories: { [key: string]: HousingLoanCreditCategory };
  /** その年の合計所得金額がこれを超えると、その年は控除が停止される */
  incomeLimitForYear: Yen;
  /**
   * 所得税から控除しきれなかった額の個人住民税への繰越上限:
   * min(繰越候補額, 課税総所得金額等 × capRate, capAmount)
   */
  residentTaxSpillover: { capRate: Rate; capAmount: Yen };
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

/** ふるさと納税 特例控除の上限率と自己負担額 (地方税法第37条の2等) */
export interface FurusatoNozeiRules {
  /** 特例控除額の上限 = 住民税所得割額 × この率 (地方税法第37条の2、通常0.2) */
  specialDeductionCapRate: Rate;
  /** 控除対象外の自己負担額 (通常2,000円) */
  selfPayAmount: Yen;
  _source: RuleSource;
}

/** 上場株式等の譲渡所得等に係る申告分離課税 (所得税15% + 復興特別所得税0.315% + 住民税5%) */
export interface CapitalGainsTaxRules {
  rate: Rate;
  _source: RuleSource;
}

export interface RuleSet {
  year: number;
  incomeTax: IncomeTaxRules;
  residentTax: ResidentTaxRules;
  socialInsurance: SocialInsuranceRules;
  furusatoNozei: FurusatoNozeiRules;
  childbirth?: ChildbirthRules;
  childBenefits?: ChildBenefitsRules;
  /** Loaded separately from rules/education-costs.json and merged by the caller */
  educationCosts?: EducationCosts;
  housingLoanTaxCredit?: HousingLoanTaxCreditRules;
  nisa?: NisaRules;
  capitalGainsTax?: CapitalGainsTaxRules;
}
