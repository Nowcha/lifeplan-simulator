# ライフプランシミュレーター エンジン設計書 v0.1

## 0. 設計原則

1. **エンジンとUIの完全分離**: エンジンは純粋TS関数群。ブラウザAPI・React依存ゼロ。Web Workerにそのまま載る。
2. **決定論的コア + 確率ラッパー**: コアエンジンは「確率変数の実現値パス」を入力に取る決定論的関数。モンテカルロはその外側で乱数パスを生成して繰り返し呼ぶだけ。乱数生成とビジネスロジックを混ぜない。
3. **データとロジックの分離**: 個人データ(`profile/`)はgitignore。税制・給付金パラメータ(`rules/`)は年度別JSONで、ロジックはパラメータを参照するのみ。公開時はサンプルプロファイル同梱。
4. **金額は整数円、率はdecimal**(0.03 = 3%)。浮動小数点誤差が問題になる箇所(ローン償還)は円単位で都度丸め、丸め規則を明記。
5. **時間軸は暦年ベース**。内部計算は月次(ローン・育休給付・社会保険は月次でないと精度が出ない)、出力は年次集計 + 月次詳細のオプション。

## 1. ディレクトリ構成

```
lifeplan-sim/
├── engine/                  # 純粋TS。UIから独立してテスト
│   ├── types/               # 本書のスキーマ定義
│   ├── income/              # 収入カーブ、育休中の給与
│   ├── tax/                 # 手取りエンジン(所得税・住民税・社保)
│   ├── benefits/            # 給付金(出産・育児・児童手当・自治体)
│   ├── housing/             # ローン償還、金利パス、5年/125%ルール
│   ├── education/           # 教育費ステージ関数
│   ├── expenses/            # ベース支出 + イベント修飾子
│   ├── invest/              # NISA枠管理、資産推移、取り崩し
│   ├── pipeline.ts          # 年次パイプライン(§8の処理順序)
│   └── montecarlo/          # パス生成(乱数)、集計(パーセンタイル)
├── rules/
│   ├── 2026.json            # 税制・社保・給付パラメータ(§6)
│   └── education-costs.json # 教育費テーブル
├── profile/                 # gitignore対象
│   ├── household.json       # §3
│   ├── events.json          # §4
│   └── assumptions.json     # §5
├── profile.sample/          # 公開用サンプル
└── app/                     # React+Vite+TS+Tailwind (フェーズ5)
```

## 2. 共通型

```typescript
type Yen = number;            // 整数円
type Rate = number;           // 0.03 = 3%
type YearMonth = string;      // "2026-07"
type PersonId = string;
type EventId = string;

/** インフレ連動の指定。支出・収入項目に付与 */
type Indexation = "inflation" | "wage" | "fixed";
```

## 3. 世帯プロファイル `household.json`

```typescript
interface Household {
  schemaVersion: 1;
  persons: Person[];
  children: Child[];          // 既存 + イベントで追加される
  municipality: string;       // "koto-ku" — 自治体給付・保育料のrules参照キー
  baseExpenses: BaseExpenseItem[];
  financialAssets: AssetHolding[];
  savingsPolicy: SavingsPolicy;
}

interface Person {
  id: PersonId;
  birthYearMonth: YearMonth;
  employment: {
    type: "salaried" | "self-employed" | "none";
    healthInsurance: "kyokai-kenpo" | "kumiai";  // 組合健保は料率をrulesで上書き可
    kumiaiRate?: Rate;        // 組合健保の場合の本人負担料率
  };
  /** 収入カーブ: 年齢の折れ点で指定、間は線形補間。昇進をポイントで表現 */
  incomeCurve: IncomePoint[];
  retirementAge: number;
  retirementLumpSum?: Yen;    // 退職金(退職所得課税はエンジンが処理)
  /** 個人の控除要素 */
  deductions: {
    idecoMonthly?: Yen;
    lifeInsurancePremiumAnnual?: Yen;
  };
}

interface IncomePoint {
  age: number;
  monthlyBase: Yen;           // 月額基本給(標準報酬月額の算定基礎)
  bonusAnnual: Yen;           // 年間賞与(標準賞与額の算定基礎)
  indexation: Indexation;     // 通常 "wage"(賃金上昇率連動)
}

interface Child {
  id: string;
  birthYearMonth: YearMonth;  // 出産イベント由来の子はイベント側で定義
  educationPlanRef: EventId;  // education イベントへの参照
}

interface BaseExpenseItem {
  label: string;              // "食費", "住居費(賃貸)", "通信", "趣味" ...
  monthly: Yen;
  indexation: Indexation;
  /** 有効期間。住宅購入イベントで賃貸家賃を止める、等はイベント側の modifier で制御 */
  activeFrom?: YearMonth;
  activeTo?: YearMonth;
}

interface AssetHolding {
  assetClassId: string;       // §5 の assetClasses と対応
  account: "nisa-tsumitate" | "nisa-growth" | "taxable" | "cash" | "ideco";
  balance: Yen;
  costBasis: Yen;             // 課税口座の譲渡益計算用
  /** NISA口座は生涯枠消費額の初期値を別途持つ */
  nisaLifetimeUsed?: Yen;
}

interface SavingsPolicy {
  /** 生活防衛資金: この月数分の支出を現金で確保、超過分を投資に回す */
  cashBufferMonths: number;
  /** 投資順序: NISAつみたて枠 → NISA成長枠 → 課税口座 の優先度と月額上限 */
  contributions: {
    account: "nisa-tsumitate" | "nisa-growth" | "taxable" | "ideco";
    monthlyCap: Yen;
    assetClassId: string;
  }[];
  /** 取り崩しフェーズ */
  drawdown: {
    strategy: "fixed-amount" | "fixed-rate";
    value: number;            // 円/年 or 率
    order: ("taxable" | "nisa-growth" | "nisa-tsumitate")[];  // 取り崩し順序
  };
}
```

## 4. ライフイベント `events.json`

discriminated union。すべてのイベントは `id` と発生時期を持つ。

```typescript
type LifeEvent =
  | ChildbirthEvent
  | HousingPurchaseEvent
  | LoanPrepaymentEvent
  | EducationPlan
  | RecurringModifierEvent
  | OneTimeEvent;

interface ChildbirthEvent {
  id: EventId;
  type: "childbirth";
  expectedYearMonth: YearMonth;
  childId: string;
  /** 親ごとの休業計画 */
  leavePlans: {
    personId: PersonId;
    maternityLeave?: { from: YearMonth; to: YearMonth };  // 産前産後(出産手当金)
    parentalLeave?: { from: YearMonth; to: YearMonth };   // 育休(育児休業給付)
    /** 出生後休業支援給付の対象期間(両親とも14日以上取得等の要件判定はエンジン) */
    postnatalSupportDays?: number;
    /** 復帰後の時短勤務: 給与係数と期間 */
    returnToWork?: { shortHoursFactor: Rate; until: YearMonth };
  }[];
  /** 出産費用実費(一時金との差額をエンジンが支出計上) */
  deliveryCost: Yen;
}

interface HousingPurchaseEvent {
  id: EventId;
  type: "housing-purchase";
  yearMonth: YearMonth;
  propertyPrice: Yen;
  propertyType: "new-mansion" | "used-mansion" | "new-house" | "used-house";
  downPayment: Yen;
  closingCosts: Yen;          // 諸費用(登記・仲介・火災保険等)
  loans: HousingLoan[];       // ペアローンは2本、収入合算は1本
  /** 保有コスト */
  holdingCosts: {
    propertyTaxAnnual: Yen;         // 固定資産税(新築軽減はrulesで処理してもよいが簡易は実額)
    managementFeeMonthly?: Yen;     // 管理費・修繕積立金(マンション)
    repairReserveEscalation?: Rate; // 修繕積立金の段階増額率/年
  };
  /** このイベント発動で止める既存支出(賃貸家賃のlabel) */
  terminatesExpenseLabels: string[];
  /** 住宅ローン控除の適格性 */
  taxCreditEligibility: {
    eligible: boolean;
    category: "certified" | "zeh" | "energy-efficient" | "other" | "used";
    hasChildOrYoungCouple: boolean;   // 子育て世帯等の借入限度額上乗せ
  };
}

interface HousingLoan {
  loanId: string;
  borrowerPersonId: PersonId;
  principal: Yen;
  years: number;
  method: "equal-payment" | "equal-principal";  // 元利均等 / 元金均等
  rateType: "variable" | "fixed" | "fixed-period";
  /** 変動: 基準金利パス(§5) + 優遇幅。固定: 実行金利 */
  spreadFromBaseRate?: Rate;   // 変動: base rate - 優遇幅
  fixedRate?: Rate;
  fixedPeriodYears?: number;   // 当初固定の場合
  /** 変動金利の実務ルール */
  variableRules: {
    fiveYearRule: boolean;     // 5年間返済額据置
    cap125Rule: boolean;       // 見直し時125%上限
    rateResetMonths: number;   // 金利見直し周期(通常6ヶ月)
  };
  groupCreditLife: "general" | "gan50" | "gan100" | "none";  // 団信(金利上乗せはspreadに込み)
}

interface LoanPrepaymentEvent {
  id: EventId;
  type: "loan-prepayment";
  loanId: string;
  yearMonth: YearMonth;
  amount: Yen;
  method: "shorten-term" | "reduce-payment";
}

interface EducationPlan {
  id: EventId;
  type: "education";
  childId: string;
  stages: {
    nursery: "hoikuen" | "kindergarten-public" | "kindergarten-private" | "none";
    elementary: "public" | "private";
    juniorHigh: "public" | "private";
    highSchool: "public" | "private";
    university: "national" | "private-liberal" | "private-science" | "none";
    universityHousing: "home" | "boarding";  // 下宿は仕送りを自動計上
  };
  /** 習い事・塾の上乗せ(教育費テーブルに含まれない裁量分) */
  extracurricularMonthly?: { fromAge: number; toAge: number; amount: Yen }[];
}

/** 車の買い替えサイクル、旅行頻度など、繰り返し支出の宣言 */
interface RecurringModifierEvent {
  id: EventId;
  type: "recurring";
  label: string;
  startYearMonth: YearMonth;
  intervalYears?: number;     // 例: 車7年ごと
  amount: Yen;
  occurrences?: number;
  indexation: Indexation;
}

interface OneTimeEvent {
  id: EventId;
  type: "one-time";
  label: string;
  yearMonth: YearMonth;
  amount: Yen;                // 正=支出、負=収入(贈与等)
}
```

## 5. 前提条件 `assumptions.json`

```typescript
interface Assumptions {
  simulation: {
    startYear: number;
    endAge: number;           // 最年長者がこの年齢になるまで
    paths: number;            // モンテカルロ試行数(例: 10000)
    seed: number;             // 再現性のため固定
  };
  inflation: StochasticVar;   // CPI
  wageGrowth: StochasticVar;  // 賃金上昇率(incomeCurveのindexation="wage"に適用)
  assetClasses: {
    id: string;               // "global-equity", "bonds", "cash"
    expectedReturn: Rate;     // 名目・年率
    volatility: Rate;
  }[];
  /** 資産クラス + inflation + baseRate を含む相関行列(対称・正定値) */
  correlationMatrix: {
    factors: string[];        // ["global-equity","bonds","inflation","base-rate"]
    matrix: number[][];
  };
  /** 住宅ローン基準金利(短プラ相当)のモデル */
  baseRate: {
    initial: Rate;
    model: "manual" | "mean-reverting";
    /** manual: 折れ点指定 */
    manualPath?: { year: number; rate: Rate }[];
    /** mean-reverting: Vasicek型 dr = a(b - r)dt + σdW, 下限0 */
    meanReversion?: { speed: number; longTermMean: Rate; volatility: Rate };
  };
  /** 決定論モード(モンテカルロOFF)用の固定値上書き */
  deterministicOverride?: { [factorId: string]: Rate };
}

interface StochasticVar { mean: Rate; volatility: Rate; }
```

**パス生成の仕様**: 相関行列をCholesky分解し、月次ではなく**年次**で相関乱数を生成(資産リターンは対数正規)。基準金利のみ年次値を月次に展開してローン計算に渡す。シード付きPRNGは `mulberry32` などの軽量実装で可。

**Phase 4 v1 のスコープ限定(承認済み)**: `inflation`/`wageGrowth` は `StochasticVar` 型のまま残すが、Phase 4 v1では確率変動させず決定論値(mean固定)で据え置く。理由: `income/curve.ts`・`expenses/base.ts`・`expenses/education.ts` の複利計算が「年率のyearsElapsed乗」実装になっており、年次実現値を変動させるには「年次実現値の累積積」への作り直しが必要で、Phase 1-3の既存テスト資産に触れるリスクが大きいため。資産クラスのリターンと基準金利(`mean-reverting`モデルのみ)だけを確率変動させる(`engine/montecarlo/paths.ts`)。インフレ・賃金の確率化は将来のフェーズで別途対応する。

## 6. ルールファイル `rules/2026.json`(抜粋構造)

エンジンは計算時点の暦年に対応するルールを参照。将来年度はデフォルトで最新年度を継続適用。**数値はプレースホルダにせず、実装時にClaude Codeで一次情報(国税庁・協会けんぽ・こども家庭庁・江東区)を確認して埋めること。**

```typescript
interface RuleSet {
  year: number;
  incomeTax: {
    brackets: { upTo: Yen | null; rate: Rate; deduction: Yen }[];
    salaryIncomeDeduction: { upTo: Yen | null; rate: Rate; add: Yen }[];  // 給与所得控除
    basicDeduction: { incomeUpTo: Yen | null; amount: Yen }[];
    spouseDeduction: {...};
    dependentDeduction: {                  // 扶養控除(§8 4-1)
      minAge: number;                      // 控除対象となる最低年齢(16)
      specificFromAge: number;             // 特定扶養親族の年齢下限(19)
      specificToAge: number;               // 同 上限(22、この年齢を含む)
      general: Yen;                        // 一般 38万
      specific: Yen;                       // 特定 63万
    };
    reconstructionSurtax: Rate;      // 復興特別所得税 2.1%
    retirementIncomeRule: {...};     // 退職所得控除
  };
  residentTax: {
    rate: Rate;                      // 10%
    perCapita: Yen;                  // 均等割+森林環境税
    basicDeduction: Yen;             // 43万(所得税と異なる点に注意)
    dependentDeduction: {...};       // 扶養控除(住民税: 一般33万 / 特定45万)
    nonTaxable: {                    // 非課税限度額(1級地)
      perPerson: Yen;                // 35万 ×(本人+同一生計配偶者+扶養親族)
      base: Yen;                     // +10万
      addPerCapita: Yen;             // 扶養親族がいる場合 均等割に +21万
      addIncomeLevy: Yen;            // 扶養親族がいる場合 所得割に +32万
    };
  };
  socialInsurance: {
    standardMonthlyTable: { from: Yen; to: Yen | null; standard: Yen }[];  // 標準報酬月額等級表
    kyokaiKenpoRateTokyo: Rate;      // 労使折半後の本人負担
    nursingCareRate: Rate;           // 40歳以上介護保険
    pensionRate: Rate;               // 厚生年金 本人負担 9.15%
    employmentInsuranceRate: Rate;
    bonusCapHealthAnnual: Yen;       // 標準賞与額上限(健保573万/年度)
    bonusCapPensionMonthly: Yen;     // 厚年150万/月
  };
  childbirth: {
    lumpSum: Yen;                          // 出産育児一時金
    maternityAllowanceRate: Rate;          // 出産手当金 2/3
    parentalLeaveBenefit: {
      rateFirst180Days: Rate;              // 67%
      rateAfter: Rate;                     // 50%
      monthlyCapFirst: Yen;
      postnatalSupport: { rate: Rate; maxDays: number; conditions: {...} };  // 出生後休業支援給付 +13%
      socialInsuranceExemption: boolean;   // 育休中の社保免除
    };
  };
  childBenefits: {
    childAllowance: { ageBands: {...}; thirdChildMultiplier: number };  // 児童手当(所得制限撤廃後)
    tokyo018: { monthly: Yen; untilAge: number };
    municipal: { [municipality: string]: {...} };   // 江東区独自給付
    childcareCost: {...};                           // 保育料(都の無償化範囲を反映)
  };
  housingLoanTaxCredit: {
    rate: Rate;                        // 0.7%
    years: { new: number; used: number };  // 13年/10年
    borrowLimit: { [category: string]: { base: Yen; withChild: Yen } };
  };
  nisa: {
    lifetimeCap: Yen;                  // 1800万
    growthLifetimeCap: Yen;            // 1200万
    annualTsumitate: Yen;              // 120万
    annualGrowth: Yen;                 // 240万
    quotaRestoration: "next-year-cost-basis";  // 売却翌年に簿価分復活
  };
  capitalGainsTaxRate: Rate;           // 20.315%
  furusatoNozei: {...};                // 限度額計算パラメータ(副産物出力用)
}
```

`education-costs.json` は文科省「子供の学習費調査」等をベースに、ステージ×公私別の年額テーブル + 大学は入学金/授業料/下宿仕送りを分離。全項目にindexation(教育費インフレは一般CPIより高めに別係数を持てるようにする)。

## 7. エンジン出力

```typescript
interface SimulationResult {
  deterministic: AnnualRow[];          // 期待値パス(UI初期表示・デバッグ用)
  monteCarlo?: MonteCarloSummary;
}

interface AnnualRow {
  year: number;
  ages: { [personId: string]: number };
  income: {
    [personId: string]: {
      gross: Yen;
      socialInsurance: Yen;
      incomeTax: Yen;
      residentTax: Yen;      // ★前年所得ベースで課税(育休翌年の住民税負担を正しく出す)
      net: Yen;
    };
  };
  benefits: { label: string; amount: Yen }[];   // 育休給付・児童手当・018等の内訳
  expenses: { category: string; amount: Yen }[];
  housing: {
    [loanId: string]: {
      payment: Yen; interest: Yen; principalPaid: Yen;
      balance: Yen; appliedRate: Rate;
      unpaidInterest: Yen;    // 5年ルール下で発生した未払利息
    };
  };
  taxCredits: { housingLoan: Yen };
  invest: {
    contributions: Yen; withdrawals: Yen; capitalGainsTax: Yen;
    balances: { [account: string]: Yen };
    nisaLifetimeUsed: Yen; nisaAnnualUsed: { tsumitate: Yen; growth: Yen };
  };
  cashBalance: Yen;
  netWorth: Yen;              // 金融資産 + 住宅評価額(簡易: 取得価格×償却) - ローン残高
  liquidityAlert: boolean;    // 現金がバッファ月数を割った年
  furusatoNozeiLimit: { [personId: string]: Yen };  // 副産物
}

interface MonteCarloSummary {
  percentiles: { p: 10 | 25 | 50 | 75 | 90; netWorthByYear: Yen[] }[];  // ファンチャート用
  depletionProbability: number;        // 資産枯渇(現金+換金可能資産<0)確率
  depletionAgeDistribution?: number[];
  /** 感度分析: 各前提を±1σ動かしたときの最終資産中央値の変化(トルネードチャート用) */
  sensitivity?: { factor: string; low: Yen; high: Yen }[];
}
```

**感度分析の「±1σ」の定義(実装確定・Phase 5で発覚した問題への対応)**: 複利シミュレーションでは、資産クラスの年率volatilityをそのまま毎年乗せ続けると(例: 世界株式 期待5%・volatility18%→ 年率23%を31年複利)、実際のモンテカルロ分布(p10〜p90)から何桁も外れた非現実的な値になることが確認された(UIで検証時、感度分析の結果がp90の17倍に達した)。そのため「±1σ」は年率volatilityそのものではなく、シミュレーション年数Nに対する平均リターンの標準誤差 `volatility/√N` を用いる(「長期平均の見積もりが1σ分ズレていたら」という解釈であり、「毎年ずっと1σ分ズレ続ける」ではない)。実装は `engine/montecarlo/sensitivity.ts`。

## 8. 年次パイプライン(処理順序 — ここを間違えると精度が出ない)

各年、各月について:

1. **収入確定**: incomeCurve補間 × wage indexation。育休・産休期間は給与ゼロ(or 会社規定)に置換、時短係数適用
2. **社会保険料**: 標準報酬月額を等級表にマップ。**育休期間は免除**。賞与は標準賞与額で別計算
3. **給付金**: 出産一時金(実費と相殺)、出産手当金、育児休業給付+出生後休業支援(**非課税・社保対象外**)、児童手当、018サポート、自治体給付、保育料算定
4. **所得税**: 給与所得控除 → 所得控除(社保・iDeCo・基礎・配偶者・扶養 ※育休で所得が下がった年の配偶者控除復活を判定) → 累進税率 → 住宅ローン控除(所得税から引き切れない分は住民税へ)
5. **住民税**: **前年の課税所得**に基づき当年徴収。初年度・育休翌年のギャップを正確に再現。非課税限度額は扶養人数に応じて算定し、均等割と所得割で別のしきい値を用いる

### 4-1. 扶養控除の扱い(Phase 2 追加)

扶養親族は `household.children` および将来の `ChildbirthEvent` で生まれる子のみを対象とする(世帯モデルに高齢の被扶養者が存在しないため)。子の年齢は既存の `ageInYear()`(その年の12/31時点の年齢)で判定する。

- **控除額**: 16歳未満=なし、16〜18歳および23〜69歳=一般、19〜22歳=特定。所得税・住民税それぞれの `dependentDeduction` を参照する
- **帰属**: 子は全員、その年の合計所得金額が最も高い人物の扶養に入れる(同額なら `household.persons` の先頭)。累進課税のため世帯の税額が最小になり、実務上も一般的な選択にあたる。扶養親族を複数人で分けて申告するケースはモデル化しない
- **住民税の非課税限度額**: `35万円 ×(本人 + 同一生計配偶者 + 扶養親族)+ 10万円`、扶養親族がいる場合はさらに均等割で21万円、所得割で32万円を加算(東京23区=1級地)。判定に算入する扶養親族には**16歳未満も含む**(控除対象外でも人数には数える)

**スコープ外(意図的な単純化)**:
- **老人扶養親族・同居老親等**: 世帯モデルに70歳以上の被扶養者を置けないため未実装
- **特定親族特別控除**(令和7年度創設、19〜22歳で合計所得62万円超123万円以下): 子に所得を持たせるモデルがないため、子は常に控除対象扶養親族に該当し、この控除は発生しない
- **扶養親族の所得要件**(令和8年分: 62万円以下): 上記のとおり子の所得が常に0のため判定は常に成立する。配偶者側は既存の `spouseDeduction.spouseIncomeMax` で判定済み
6. **支出**: ベース支出 × indexation + イベント修飾子 + 教育費テーブル + 住宅保有コスト
7. **ローン償還**(月次): 適用金利 = 基準金利パス + spread。変動は見直し周期で再計算、5年ルール/125%ルールを適用し未払利息を追跡。繰上返済イベントを反映
8. **貯蓄・投資**: 現金バッファ充足 → contributionsの優先順で拠出(NISA年間枠・生涯枠をチェック、売却があれば翌年枠復活を記帳)。不足時は取り崩し(drawdown順序、課税口座は譲渡益課税)
9. **資産リターン適用**: 当年のリターン実現値(パスから供給)を各残高に適用
10. **年次行を記録**

## 9. テスト戦略

- **ゴールデンテスト(必須)**: 年収400/600/800/1000/1500万の給与所得者について、手取り・所得税・住民税・社保を国税庁速算表と市販計算機の値に対し誤差±1000円以内で一致させる。育休ありケース(給付金非課税・社保免除・翌年住民税)も1ケース固定
- **ローン償還**: 元利均等の既知の償還表(金融広報中央委員会の例等)と月次一致。5年ルール発動ケースは手計算のフィクスチャを用意
- **NISA枠管理**: プロパティテスト — 生涯枠1800万超過なし、成長枠1200万超過なし、売却翌年復活が簿価ベース
- **モンテカルロ**: シード固定で結果が再現すること。paths→∞で決定論パスの期待値に収束すること(平均リターンで検算)
- **エンジン純粋性**: engine/配下に `window`/`document`/`Date.now()` 直参照がないことをlintで強制(現在日時は入力で渡す)

## 10. 実装フェーズとの対応

| フェーズ | 実装範囲 | 本書の該当章 |
|---|---|---|
| 1 | 手取りエンジン + 決定論CF表 + ゴールデンテスト | §6 incomeTax/residentTax/socialInsurance, §8 手順1-6 |
| 2 | 出産育児・給付金・教育費 | §4 Childbirth/Education, §6 childbirth/childBenefits |
| 3 | 住宅ローン(金利パス・5年/125%・繰上・控除) | §4 Housing, §5 baseRate, §8 手順7 |
| 4 | NISA枠管理 + モンテカルロ + 感度分析 | §3 SavingsPolicy, §5, §7 MonteCarloSummary |
| 5 | UI(ファンチャート・シナリオ比較・トルネード) | §7 |
| 6 | 公開準備(プロファイル分離・免責・Pages) | §1 |

## 11. 実装時の注意(Claude Codeへの申し送り)

- rules/2026.json の数値は**実装セッションで必ず一次情報を検索して確定**すること(制度改正が頻繁: 児童手当拡充、出生後休業支援給付、東京都保育料無償化、住宅ローン控除の子育て特例延長など)
- 住民税の前年課税、育休給付の非課税扱い、社保免除の3点は手取り精度に効く最重要ポイント
- シナリオ比較UIのため、`(household, events, assumptions, rules) → SimulationResult` は完全に副作用なしで、events配列の差し替えだけで別シナリオが走る構造を維持すること
- 免責: 本ツールは税務相談・投資助言ではない旨をUI/READMEに明記
