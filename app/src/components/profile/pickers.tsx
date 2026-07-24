/**
 * IDを手入力/コピペする代わりに、既存の人物・子ども・資産クラス・イベント・ローンから
 * 選ぶドロップダウン群。値は実体の id を格納するが、ユーザーはIDを意識しなくてよい。
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
  const options = persons.map((p, i) => ({ value: p?.id ?? '', label: `本人${i + 1}${p?.id ? `(${p.id})` : ''}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const ChildPicker = forwardRef<HTMLSelectElement, PickerProps>(function ChildPicker({ control, ...props }, ref) {
  const children = useWatch({ control, name: 'household.children' }) ?? []
  const options = children.map((c, i) => ({ value: c?.id ?? '', label: `子ども${i + 1}${c?.id ? `(${c.id})` : ''}` }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const AssetClassPicker = forwardRef<HTMLSelectElement, PickerProps>(function AssetClassPicker(
  { control, ...props },
  ref
) {
  const assetClasses = useWatch({ control, name: 'assumptions.assetClasses' }) ?? []
  const options = assetClasses.map((a) => ({ value: a?.id ?? '', label: a?.id || '(未設定)' }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const EducationEventPicker = forwardRef<HTMLSelectElement, PickerProps>(function EducationEventPicker(
  { control, ...props },
  ref
) {
  const events = useWatch({ control, name: 'events' }) ?? []
  const options = events
    .filter((e) => e?.type === 'education')
    .map((e) => ({ value: e.id, label: e.id }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})

export const LoanPicker = forwardRef<HTMLSelectElement, PickerProps>(function LoanPicker({ control, ...props }, ref) {
  const events = useWatch({ control, name: 'events' }) ?? []
  const loans = events.filter((e) => e?.type === 'housing-purchase').flatMap((e) => e.loans ?? [])
  const options = loans.map((l) => ({ value: l?.loanId ?? '', label: l?.loanId || '(未設定)' }))
  return <SelectInput ref={ref} options={[PLACEHOLDER, ...options]} {...props} />
})
