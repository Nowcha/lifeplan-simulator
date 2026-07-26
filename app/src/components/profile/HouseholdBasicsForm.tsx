import { useFieldArray, useFormContext, type Control, type UseFormRegister } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { AddButton, ItemCard, MonthInput, NumberInput, Section, SelectInput } from '../form/fields'
import { optionalNumberRules, requiredTextRules, yearMonthRules } from '../../lib/validation'
import {
  CO_RESIDENT_ASCENDANT_HELP,
  CO_RESIDENT_ASCENDANT_OPTIONS,
  DEPENDENT_INCOME_HELP,
  MUNICIPALITY_HELP,
  municipalityOptions
} from '../../lib/formOptions'
import { describeReferences } from '../../lib/references'
import { useUndo } from '../../lib/undoContext'
import { PersonForm } from './PersonForm'
import { EducationEventPicker } from './pickers'

interface HouseholdBasicsFormProps {
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
}

export function HouseholdBasicsForm({ control, register }: HouseholdBasicsFormProps) {
  const persons = useFieldArray({ control, name: 'household.persons' })
  const children = useFieldArray({ control, name: 'household.children' })
  const dependents = useFieldArray({ control, name: 'household.dependents' })
  const { getValues } = useFormContext<ProfileFormValues>()
  const { pushUndo } = useUndo()

  return (
    <div>
      <Section title="基本情報">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SelectInput
            label="お住まいの自治体"
            help={MUNICIPALITY_HELP}
            options={municipalityOptions()}
            {...register('household.municipality', requiredTextRules)}
          />
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
                id: `person-${Date.now()}`,
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
            <PersonForm
              key={field.id}
              index={index}
              control={control}
              register={register}
              onRemove={() => {
                const removed = getValues(`household.persons.${index}`)
                persons.remove(index)
                pushUndo(`「本人${index + 1}」を削除しました。`, () => persons.insert(index, removed))
              }}
              getRemoveWarning={() =>
                describeReferences(getValues(), { kind: 'person', id: getValues(`household.persons.${index}.id`) })
              }
            />
          ))}
        </div>
      </Section>

      <Section
        title="子ども"
        note="教育プランは「ライフイベント」タブで作成したものから選ぶ。"
        actions={
          <AddButton
            label="追加"
            onClick={() =>
              children.append({ id: `child-${Date.now()}`, birthYearMonth: '2026-01', educationPlanRef: '' })
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          {children.fields.map((field, index) => (
            <ItemCard
              key={field.id}
              title={`子ども${index + 1}`}
              onRemove={() => {
                const removed = getValues(`household.children.${index}`)
                children.remove(index)
                pushUndo(`「子ども${index + 1}」を削除しました。`, () => children.insert(index, removed))
              }}
              getRemoveWarning={() =>
                describeReferences(getValues(), { kind: 'child', id: getValues(`household.children.${index}.id`) })
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MonthInput label="生年月" {...register(`household.children.${index}.birthYearMonth`, yearMonthRules)} />
                <EducationEventPicker
                  control={control}
                  label="教育プラン"
                  hint="ライフイベントタブで作成した教育プランから選ぶ"
                  {...register(`household.children.${index}.educationPlanRef`)}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>

      <Section
        title="その他の被扶養親族"
        note="生計を一にしている親など、子ども以外の扶養親族。扶養控除と住民税の非課税限度額に反映される。"
        actions={
          <AddButton
            label="追加"
            onClick={() =>
              dependents.append({
                id: `dependent-${crypto.randomUUID()}`,
                birthYearMonth: '1955-01',
                coResidentDirectAscendant: false
              })
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          {dependents.fields.map((field, index) => (
            <ItemCard
              key={field.id}
              title={`被扶養親族${index + 1}`}
              onRemove={() => {
                // household.dependents は省略可なので getValues は undefined を返しうる
                const removed = getValues(`household.dependents.${index}`)
                dependents.remove(index)
                if (removed === undefined) return
                pushUndo(`「被扶養親族${index + 1}」を削除しました。`, () => dependents.insert(index, removed))
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <MonthInput
                  label="生年月"
                  {...register(`household.dependents.${index}.birthYearMonth`, yearMonthRules)}
                />
                <SelectInput
                  label="同居の有無"
                  help={CO_RESIDENT_ASCENDANT_HELP}
                  options={[...CO_RESIDENT_ASCENDANT_OPTIONS]}
                  {...register(`household.dependents.${index}.coResidentDirectAscendant`, {
                    setValueAs: (v: unknown) => v === true || v === 'true'
                  })}
                />
                <NumberInput
                  label="本人の合計所得(任意)"
                  suffix="円"
                  help={DEPENDENT_INCOME_HELP}
                  {...register(`household.dependents.${index}.annualIncome`, optionalNumberRules({ min: 0 }))}
                />
              </div>
            </ItemCard>
          ))}
          {dependents.fields.length === 0 && (
            <p className="text-sm text-ink-muted">登録がありません。親などを扶養している場合に追加する。</p>
          )}
        </div>
      </Section>
    </div>
  )
}
