/** プロフィール編集フォーム用の選択肢ラベル定義。engine/types の union値と1:1対応する。 */
import { rules } from './engine'

export const INDEXATION_OPTIONS = [
  { value: 'fixed', label: '固定(据え置き)' },
  { value: 'inflation', label: 'インフレ連動' },
  { value: 'wage', label: '賃金上昇連動' }
] as const

/** 改定方法(indexation)の補足説明。前提条件タブのインフレ率・賃金上昇率と連動する。 */
export const INDEXATION_HELP =
  '金額が毎年どう変わるかの指定。固定(据え置き)=ずっと同じ金額。インフレ連動=前提条件のインフレ率で毎年増減。賃金上昇連動=前提条件の賃金上昇率で毎年増減。'

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'salaried', label: '給与所得者' },
  { value: 'self-employed', label: '自営業' },
  { value: 'none', label: 'なし' }
] as const

export const EMPLOYMENT_TYPE_HELP =
  '社会保険・税金の計算方法が変わる。給与所得者=厚生年金・健康保険(協会けんぽ/組合健保)に加入し給与所得控除を適用。自営業=国民年金・国民健康保険相当で計算(本ツールでは給与所得として簡易計算)。なし=収入なしとして扱う。'

export const HEALTH_INSURANCE_OPTIONS = [
  { value: 'kyokai-kenpo', label: '協会けんぽ' },
  { value: 'kumiai', label: '組合健保' }
] as const

export const HEALTH_INSURANCE_HELP =
  '健康保険料率の決まり方。協会けんぽ=都道府県ごとの標準料率で自動計算。組合健保=勤務先の健康保険組合独自の料率(下の「労使折半率」で指定)。'

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'nisa-tsumitate', label: 'NISA(つみたて投資枠)' },
  { value: 'nisa-growth', label: 'NISA(成長投資枠)' },
  { value: 'taxable', label: '課税口座' },
  { value: 'cash', label: '現金' },
  { value: 'ideco', label: 'iDeCo' }
] as const

export const ACCOUNT_TYPE_HELP =
  '税制上の扱いが変わる。NISA(つみたて/成長投資枠)=運用益が非課税。課税口座=売却益に約20%課税。現金=無リスクでそのまま保有。iDeCo=掛金が所得控除の対象になるが、原則60歳まで引き出せない。'

export const CONTRIBUTION_ACCOUNT_OPTIONS = ACCOUNT_TYPE_OPTIONS.filter((o) => o.value !== 'cash')

export const DRAWDOWN_ACCOUNT_OPTIONS = [
  { value: 'taxable', label: '課税口座' },
  { value: 'nisa-growth', label: 'NISA(成長投資枠)' },
  { value: 'nisa-tsumitate', label: 'NISA(つみたて投資枠)' }
] as const

export const DRAWDOWN_ORDER_HELP =
  '資産を取り崩すときにどの口座から先に使うかの優先順位(先頭から消費する)。一般的には非課税の恩恵が薄い課税口座から取り崩し、NISA枠はできるだけ長く運用に残す順が有利になりやすい。'

export const DRAWDOWN_STRATEGY_OPTIONS = [
  { value: 'fixed-amount', label: '定額取り崩し' },
  { value: 'fixed-rate', label: '定率取り崩し' }
] as const

export const DRAWDOWN_STRATEGY_HELP =
  '資産の取り崩し方。定額取り崩し=毎年同じ金額を取り崩す(残高が尽きると枯渇しやすい)。定率取り崩し=残高に対して毎年同じ割合(%)を取り崩す(残高が減れば取り崩し額も減り、資産は尽きにくいが取り崩し額が変動する)。'

export const EVENT_TYPE_OPTIONS = [
  { value: 'childbirth', label: '出産' },
  { value: 'housing-purchase', label: '住宅購入' },
  { value: 'loan-prepayment', label: 'ローン繰上返済' },
  { value: 'education', label: '教育プラン' },
  { value: 'recurring', label: '定期支出' },
  { value: 'one-time', label: '単発の収支' }
] as const

export const PROPERTY_TYPE_OPTIONS = [
  { value: 'new-mansion', label: '新築マンション' },
  { value: 'used-mansion', label: '中古マンション' },
  { value: 'new-house', label: '新築一戸建て' },
  { value: 'used-house', label: '中古一戸建て' }
] as const

export const PROPERTY_TYPE_HELP =
  '住宅ローン控除(下の「控除カテゴリ」)の借入限度額や、中古住宅の場合の築年数要件などに影響する物件区分。'

export const LOAN_METHOD_OPTIONS = [
  { value: 'equal-payment', label: '元利均等' },
  { value: 'equal-principal', label: '元金均等' }
] as const

export const LOAN_METHOD_HELP =
  '毎月の返済額の決まり方。元利均等=毎月の返済額(元金+利息の合計)がずっと一定。元金均等=毎月の元金部分が一定で、返済額は当初大きく、年々減っていく(総利息は元利均等より少なくなりやすい)。'

export const RATE_TYPE_OPTIONS = [
  { value: 'variable', label: '変動金利' },
  { value: 'fixed', label: '全期間固定' },
  { value: 'fixed-period', label: '期間固定' }
] as const

export const RATE_TYPE_HELP =
  '適用金利の決まり方。変動金利=前提条件の基準金利パスに連動して変動(5年ルール・125%ルールの対象)。全期間固定=完済まで金利が変わらない。期間固定=一定期間だけ固定し、その後は変動金利に切り替わる想定で計算。'

export const GROUP_CREDIT_LIFE_OPTIONS = [
  { value: 'general', label: '一般団信' },
  { value: 'gan50', label: 'がん50%団信' },
  { value: 'gan100', label: 'がん100%団信' },
  { value: 'none', label: 'なし' }
] as const

export const GROUP_CREDIT_LIFE_HELP =
  '借入人が死亡・高度障害等になった際にローン残債が保険金で弁済される制度。がん団信は保障が手厚い分、上乗せ金利がかかることが多い(本ツールでは上の金利欄に上乗せ後の金利を入力する想定)。'

export const PREPAYMENT_METHOD_OPTIONS = [
  { value: 'shorten-term', label: '期間短縮型' },
  { value: 'reduce-payment', label: '返済額軽減型' }
] as const

export const PREPAYMENT_METHOD_HELP =
  '繰上返済の効果の出方。期間短縮型=毎月の返済額は変えず完済時期を早める(総利息の軽減効果が大きい)。返済額軽減型=完済時期は変えず毎月の返済額を減らす(月々の家計にゆとりを持たせたい場合向け)。'

export const TAX_CREDIT_CATEGORY_OPTIONS = [
  { value: 'certified', label: '認定住宅' },
  { value: 'zeh', label: 'ZEH水準省エネ住宅' },
  { value: 'energy-efficient', label: '省エネ基準適合住宅' },
  { value: 'other', label: 'その他(新築・買取再販)' },
  { value: 'used', label: '中古住宅' }
] as const

export const TAX_CREDIT_CATEGORY_HELP =
  '住宅ローン控除(住宅借入金等特別控除)の借入限度額を左右する住宅の環境性能区分。認定住宅が最も限度額が高く、ZEH水準省エネ住宅・省エネ基準適合住宅の順に下がり、その他(省エネ基準未達)・中古住宅は最も低い。'

export const NURSERY_OPTIONS = [
  { value: 'hoikuen', label: '保育園' },
  { value: 'kindergarten-public', label: '幼稚園(公立)' },
  { value: 'kindergarten-private', label: '幼稚園(私立)' },
  { value: 'none', label: 'なし' }
] as const

export const NURSERY_HELP =
  '未就学期の預け先。保育園=保育料相当+副食費(自治体の無償化制度が適用される場合がある)。幼稚園は公立/私立で学費が大きく異なり、私立は公立よりかなり高くなる。なし=費用を計上しない。'

export const SCHOOL_TYPE_OPTIONS = [
  { value: 'public', label: '公立' },
  { value: 'private', label: '私立' }
] as const

export const SCHOOL_TYPE_HELP =
  '学費に大きく影響。私立は公立に比べて学習費(授業料・給食費・学校外活動費の合計)が数倍高くなる傾向がある(文部科学省の学習費調査ベース)。学年が上がるほど差が広がりやすい。'

export const UNIVERSITY_OPTIONS = [
  { value: 'national', label: '国公立' },
  { value: 'private-liberal', label: '私立文系' },
  { value: 'private-science', label: '私立理系' },
  { value: 'none', label: '進学しない' }
] as const

export const UNIVERSITY_HELP =
  '入学金・授業料の水準が変わる。国公立が最も学費を抑えられ、私立文系・私立理系の順に高くなる(私立理系は実験・実習費等でさらに高い)。進学しない=大学費用を計上しない。'

export const UNIVERSITY_HOUSING_OPTIONS = [
  { value: 'home', label: '自宅通学' },
  { value: 'boarding', label: '下宿・一人暮らし' }
] as const

export const UNIVERSITY_HOUSING_HELP =
  '自宅通学は追加費用なし。下宿・一人暮らしは仕送り費用(月額)が大学費用に上乗せされる。'

export const BASE_RATE_MODEL_OPTIONS = [
  { value: 'manual', label: '手動パス指定' },
  { value: 'mean-reverting', label: '平均回帰モデル' }
] as const

export const BASE_RATE_MODEL_HELP =
  '住宅ローン基準金利の将来推移の与え方。手動パス指定=年ごとの金利を自分で指定し、全試行で同じ値を使う。平均回帰モデル=長期平均に向かって確率的に変動する統計モデルで、モンテカルロの試行ごとに金利も変動する。'

/**
 * 自治体独自給付は rules.childBenefits.municipal のキーで引く。以前は生のキーを
 * テキスト入力させていたが、有効な値は rules に載っている自治体だけなので選択式にする。
 * 表示名はここで対応付け、未知のキーはそのまま出す(rules追加時に落とさないため)。
 */
const MUNICIPALITY_LABELS: Record<string, string> = {
  'koto-ku': '東京都 江東区'
}

/** rules に自治体独自給付が無い場合に選ぶ値。エンジンは未知のキーを「給付なし」として扱う。 */
export const MUNICIPALITY_OTHER = 'other'

export const MUNICIPALITY_HELP =
  '児童手当・018サポートに加えて、自治体独自の子育て給付を計上するかどうかが変わる。一覧に無い自治体は「その他」を選ぶ(自治体独自給付は0円として計算され、国と東京都の給付は住所によらず計上される)。'

export function municipalityOptions(): { value: string; label: string }[] {
  const keys = Object.keys(rules.childBenefits?.municipal ?? {})
  return [
    ...keys.map((key) => ({ value: key, label: MUNICIPALITY_LABELS[key] ?? key })),
    { value: MUNICIPALITY_OTHER, label: 'その他(自治体独自給付なし)' }
  ]
}
