import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { AddButton, ItemCard, MonthInput, Section, TextInput } from '../form/fields'
import { PersonForm } from './PersonForm'

interface HouseholdBasicsFormProps {
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
}

export function HouseholdBasicsForm({ control, register }: HouseholdBasicsFormProps) {
  const persons = useFieldArray({ control, name: 'household.persons' })
  const children = useFieldArray({ control, name: 'household.children' })

  return (
    <div>
      <Section title="基本情報">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <TextInput label="自治体(rules参照キー)" placeholder="koto-ku" {...register('household.municipality')} />
        </div>
      </Section>

      <Section
        title="本人・配偶者"
        note="収入・退職年齢などを持つ人物。イベントの借入人・育休取得者としても参照される。"
        actions={
          <AddButton
            label="追加"
            onClick={() =>
              persons.append({
                id: `person-${persons.fields.length + 1}`,
                birthYearMonth: '1990-01',
                employment: { type: 'salaried', healthInsurance: 'kyokai-kenpo' },
                incomeCurve: [{ age: 30, monthlyBase: 300000, bonusAnnual: 900000, indexation: 'wage' }],
                retirementAge: 65,
                deductions: {}
              })
            }
          />
        }
      >
        <div className="flex flex-col gap-4">
          {persons.fields.map((field, index) => (
            <PersonForm key={field.id} index={index} control={control} register={register} onRemove={() => persons.remove(index)} />
          ))}
        </div>
      </Section>

      <Section
        title="子ども"
        note="educationPlanRefはイベント側のeducationプランのIDと一致させる。"
        actions={
          <AddButton
            label="追加"
            onClick={() =>
              children.append({ id: `child-${children.fields.length + 1}`, birthYearMonth: '2026-01', educationPlanRef: '' })
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          {children.fields.map((field, index) => (
            <ItemCard key={field.id} title={`子ども${index + 1}`} onRemove={() => children.remove(index)}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextInput label="ID" {...register(`household.children.${index}.id`)} />
                <MonthInput label="生年月" {...register(`household.children.${index}.birthYearMonth`)} />
                <TextInput
                  label="教育プランID"
                  hint="ライフイベント側のeducationイベントIDと一致させる"
                  {...register(`household.children.${index}.educationPlanRef`)}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>
    </div>
  )
}
