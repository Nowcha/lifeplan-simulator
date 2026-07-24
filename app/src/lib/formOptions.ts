/** プロフィール編集フォーム用の選択肢ラベル定義。engine/types の union値と1:1対応する。 */

export const INDEXATION_OPTIONS = [
  { value: 'fixed', label: '固定(据え置き)' },
  { value: 'inflation', label: 'インフレ連動' },
  { value: 'wage', label: '賃金上昇連動' }
] as const

export const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'salaried', label: '給与所得者' },
  { value: 'self-employed', label: '自営業' },
  { value: 'none', label: 'なし' }
] as const

export const HEALTH_INSURANCE_OPTIONS = [
  { value: 'kyokai-kenpo', label: '協会けんぽ' },
  { value: 'kumiai', label: '組合健保' }
] as const

export const ACCOUNT_TYPE_OPTIONS = [
  { value: 'nisa-tsumitate', label: 'NISA(つみたて投資枠)' },
  { value: 'nisa-growth', label: 'NISA(成長投資枠)' },
  { value: 'taxable', label: '課税口座' },
  { value: 'cash', label: '現金' },
  { value: 'ideco', label: 'iDeCo' }
] as const

export const CONTRIBUTION_ACCOUNT_OPTIONS = ACCOUNT_TYPE_OPTIONS.filter((o) => o.value !== 'cash')

export const DRAWDOWN_ACCOUNT_OPTIONS = [
  { value: 'taxable', label: '課税口座' },
  { value: 'nisa-growth', label: 'NISA(成長投資枠)' },
  { value: 'nisa-tsumitate', label: 'NISA(つみたて投資枠)' }
] as const

export const DRAWDOWN_STRATEGY_OPTIONS = [
  { value: 'fixed-amount', label: '定額取り崩し' },
  { value: 'fixed-rate', label: '定率取り崩し' }
] as const

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

export const LOAN_METHOD_OPTIONS = [
  { value: 'equal-payment', label: '元利均等' },
  { value: 'equal-principal', label: '元金均等' }
] as const

export const RATE_TYPE_OPTIONS = [
  { value: 'variable', label: '変動金利' },
  { value: 'fixed', label: '全期間固定' },
  { value: 'fixed-period', label: '期間固定' }
] as const

export const GROUP_CREDIT_LIFE_OPTIONS = [
  { value: 'general', label: '一般団信' },
  { value: 'gan50', label: 'がん50%団信' },
  { value: 'gan100', label: 'がん100%団信' },
  { value: 'none', label: 'なし' }
] as const

export const PREPAYMENT_METHOD_OPTIONS = [
  { value: 'shorten-term', label: '期間短縮型' },
  { value: 'reduce-payment', label: '返済額軽減型' }
] as const

export const TAX_CREDIT_CATEGORY_OPTIONS = [
  { value: 'certified', label: '認定住宅' },
  { value: 'zeh', label: 'ZEH水準省エネ住宅' },
  { value: 'energy-efficient', label: '省エネ基準適合住宅' },
  { value: 'other', label: 'その他(新築・買取再販)' },
  { value: 'used', label: '中古住宅' }
] as const

export const NURSERY_OPTIONS = [
  { value: 'hoikuen', label: '保育園' },
  { value: 'kindergarten-public', label: '幼稚園(公立)' },
  { value: 'kindergarten-private', label: '幼稚園(私立)' },
  { value: 'none', label: 'なし' }
] as const

export const SCHOOL_TYPE_OPTIONS = [
  { value: 'public', label: '公立' },
  { value: 'private', label: '私立' }
] as const

export const UNIVERSITY_OPTIONS = [
  { value: 'national', label: '国公立' },
  { value: 'private-liberal', label: '私立文系' },
  { value: 'private-science', label: '私立理系' },
  { value: 'none', label: '進学しない' }
] as const

export const UNIVERSITY_HOUSING_OPTIONS = [
  { value: 'home', label: '自宅通学' },
  { value: 'boarding', label: '下宿・一人暮らし' }
] as const

export const BASE_RATE_MODEL_OPTIONS = [
  { value: 'manual', label: '手動パス指定' },
  { value: 'mean-reverting', label: '平均回帰モデル' }
] as const
