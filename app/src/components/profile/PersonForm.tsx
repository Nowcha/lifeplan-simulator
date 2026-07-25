import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { AddButton, ItemCard, MonthInput, NumberInput, SelectInput } from '../form/fields'
import { numberRules, optionalNumberRules, yearMonthRules } from '../../lib/validation'
import {
  EMPLOYMENT_TYPE_HELP,
  EMPLOYMENT_TYPE_OPTIONS,
  HEALTH_INSURANCE_HELP,
  HEALTH_INSURANCE_OPTIONS,
  INDEXATION_HELP,
  INDEXATION_OPTIONS
} from '../../lib/formOptions'

interface PersonFormProps {
  index: number
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
  onRemove: () => void
}

export function PersonForm({ index, control, register, onRemove }: PersonFormProps) {
  const path = `household.persons.${index}` as const
  const curve = useFieldArray({ control, name: `household.persons.${index}.incomeCurve` })

  return (
    <ItemCard title={`本人${index + 1}`} onRemove={onRemove}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MonthInput label="生年月" {...register(`${path}.birthYearMonth`, yearMonthRules)} />
        <NumberInput
          label="退職年齢"
          suffix="歳"
          {...register(`${path}.retirementAge`, numberRules({ min: 0, max: 120, integer: true }))}
        />
        <SelectInput
          label="就業形態"
          help={EMPLOYMENT_TYPE_HELP}
          options={[...EMPLOYMENT_TYPE_OPTIONS]}
          {...register(`${path}.employment.type`)}
        />
        <SelectInput
          label="健康保険"
          help={HEALTH_INSURANCE_HELP}
          options={[...HEALTH_INSURANCE_OPTIONS]}
          {...register(`${path}.employment.healthInsurance`)}
        />
        <NumberInput
          label="組合健保 労使折半率(任意)"
          hint="healthInsurance=組合健保のときのみ使用"
          step="0.001"
          {...register(`${path}.employment.kumiaiRate`, optionalNumberRules({ min: 0, max: 1 }))}
        />
        <NumberInput
          label="退職金(任意)"
          suffix="円"
          {...register(`${path}.retirementLumpSum`, optionalNumberRules({ min: 0 }))}
        />
        <NumberInput
          label="iDeCo月額(任意)"
          suffix="円"
          {...register(`${path}.deductions.idecoMonthly`, optionalNumberRules({ min: 0 }))}
        />
        <NumberInput
          label="生命保険料(年額・任意)"
          suffix="円"
          {...register(`${path}.deductions.lifeInsurancePremiumAnnual`, optionalNumberRules({ min: 0 }))}
        />
      </div>

      <div className="mt-5">
        <h5 className="mb-2 text-xs tracking-wide text-ink-muted uppercase">収入カーブ(年齢ごとの内挿ポイント)</h5>
        <div className="flex flex-col gap-3">
          {curve.fields.map((field, curveIndex) => (
            <div key={field.id} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <NumberInput
                label="年齢"
                suffix="歳"
                {...register(`${path}.incomeCurve.${curveIndex}.age`, numberRules({ min: 0, max: 120, integer: true }))}
              />
              <NumberInput
                label="月額基本給"
                suffix="円"
                {...register(`${path}.incomeCurve.${curveIndex}.monthlyBase`, numberRules({ min: 0 }))}
              />
              <NumberInput
                label="年間賞与"
                suffix="円"
                {...register(`${path}.incomeCurve.${curveIndex}.bonusAnnual`, numberRules({ min: 0 }))}
              />
              <SelectInput
                label="改定方法"
                help={INDEXATION_HELP}
                options={[...INDEXATION_OPTIONS]}
                {...register(`${path}.incomeCurve.${curveIndex}.indexation`)}
              />
              <button
                type="button"
                onClick={() => curve.remove(curveIndex)}
                className="h-fit pb-1.5 text-xs text-ink-muted hover:text-critical"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <AddButton
            label="収入ポイントを追加"
            onClick={() => curve.append({ age: 40, monthlyBase: 300000, bonusAnnual: 900000, indexation: 'wage' })}
          />
        </div>
      </div>
    </ItemCard>
  )
}
