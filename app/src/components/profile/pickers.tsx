/**
 * IDを手入力/コピペする代わりに、既存の人物・子ども・資産クラス・イベント・ローンから
 * 選ぶドロップダウン群。値は実体の id を格納するが、ユーザーはIDを意識しなくてよい
 * (選択肢のラベルは位置ベースの表示名で、生のIDは表示しない)。
 */
import { forwardRef, type SelectHTMLAttributes } from 'react'
import { useWatch, type Control } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { SelectInput } from '../form/fields'

type PickerProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  control: Control<ProfileFormValues>
  label: string
  hint?: string
  help?: string
}

const PLACEHOLDER = { value: '', label: '(選択してください)' }

export const PersonPicker = forwardRef<HTMLSelectElement, PickerProps>(function PersonPicker(
  { control, ...props },
  ref
) {
  const persons = useWatch({ control, name: 'household.persons' }) ?? []
  const options = persons.map((p, i) => ({ value: p?.id ?? '', label: `本人${i + 1}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const ChildPicker = forwardRef<HTMLSelectElement, PickerProps>(function ChildPicker({ control, ...props }, ref) {
  const children = useWatch({ control, name: 'household.children' }) ?? []
  const options = children.map((c, i) => ({ value: c?.id ?? '', label: `子ども${i + 1}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const AssetClassPicker = forwardRef<HTMLSelectElement, PickerProps>(function AssetClassPicker(
  { control, ...props },
  ref
) {
  const assetClasses = useWatch({ control, name: 'assumptions.assetClasses' }) ?? []
  const options = assetClasses.map((a, i) => ({ value: a?.id ?? '', label: a?.id || `資産クラス${i + 1}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const EducationEventPicker = forwardRef<HTMLSelectElement, PickerProps>(function EducationEventPicker(
  { control, ...props },
  ref
) {
  const events = useWatch({ control, name: 'events' }) ?? []
  const children = useWatch({ control, name: 'household.children' }) ?? []
  const options = events
    .filter((e) => e?.type === 'education')
    .map((e, i) => {
      const childIndex = children.findIndex((c) => c?.id === e.childId)
      const who = childIndex >= 0 ? `子ども${childIndex + 1}` : `未設定${i + 1}`
      return { value: e.id, label: `教育プラン(${who})` }
    })
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

/**
 * 基本生活費を「名前で」選ぶ。他のピッカーと違い値が id ではなく表示名そのもの
 * (terminatesExpenseLabels がスキーマ上そう定義されているため)。
 * 一覧に無い値は黙って消さず「存在しません」と明示して残す — 過去データや
 * リネーム漏れで壊れた参照を、画面上で見えるようにするため。
 */
export function ExpenseLabelPicker({
  control,
  value,
  onChange,
  label
}: {
  control: Control<ProfileFormValues>
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const expenses = useWatch({ control, name: 'household.baseExpenses' }) ?? []
  const known = [...new Set(expenses.map((e) => e?.label ?? '').filter((l) => l !== ''))]
  const options = [PLACEHOLDER, ...known.map((l) => ({ value: l, label: l }))]
  if (value !== '' && !known.includes(value)) {
    options.push({ value, label: `${value}(この費目は存在しません)` })
  }

  return (
    <SelectInput
      label={label}
      aria-label={label === '' ? '終了する基本生活費' : undefined}
      options={options}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export const LoanPicker = forwardRef<HTMLSelectElement, PickerProps>(function LoanPicker({ control, ...props }, ref) {
  const events = useWatch({ control, name: 'events' }) ?? []
  const loans = events.filter((e) => e?.type === 'housing-purchase').flatMap((e) => e.loans ?? [])
  const options = loans.map((l, i) => ({ value: l?.loanId ?? '', label: `ローン${i + 1}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})
