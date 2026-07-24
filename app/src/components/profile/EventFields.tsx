import { useFieldArray, type Control, type FieldArrayPath, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { eventPath } from '../../lib/formPath'
import { usePrimitiveArrayField } from '../../lib/usePrimitiveArrayField'
import { AddButton, ItemCard, MonthInput, NumberInput, SelectInput, TextInput } from '../form/fields'
import {
  GROUP_CREDIT_LIFE_OPTIONS,
  LOAN_METHOD_OPTIONS,
  NURSERY_OPTIONS,
  PREPAYMENT_METHOD_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
  RATE_TYPE_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  TAX_CREDIT_CATEGORY_OPTIONS,
  UNIVERSITY_HOUSING_OPTIONS,
  UNIVERSITY_OPTIONS
} from '../../lib/formOptions'

interface EventFieldsProps {
  index: number
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
  setValue: UseFormSetValue<ProfileFormValues>
}

export function ChildbirthEventFields({ index, control, register }: EventFieldsProps) {
  const leavePlans = useFieldArray({ control, name: eventPath(index, 'leavePlans') as FieldArrayPath<ProfileFormValues> })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MonthInput label="出産予定年月" {...register(eventPath(index, 'expectedYearMonth'))} />
        <TextInput label="子どものID" hint="household.childrenのidと一致させる" {...register(eventPath(index, 'childId'))} />
        <NumberInput label="出産費用" suffix="円" {...register(eventPath(index, 'deliveryCost'), { valueAsNumber: true })} />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-xs tracking-wide text-ink-muted uppercase">育休プラン</h5>
          <AddButton
            label="追加"
            onClick={() =>
              leavePlans.append({ personId: '', maternityLeave: undefined, parentalLeave: undefined })
            }
          />
        </div>
        <div className="flex flex-col gap-3">
          {leavePlans.fields.map((field, planIndex) => (
            <ItemCard key={field.id} title={`育休プラン${planIndex + 1}`} onRemove={() => leavePlans.remove(planIndex)}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextInput label="対象者ID" {...register(eventPath(index, `leavePlans.${planIndex}.personId`))} />
                <MonthInput
                  label="産休開始"
                  {...register(eventPath(index, `leavePlans.${planIndex}.maternityLeave.from`))}
                />
                <MonthInput
                  label="産休終了"
                  {...register(eventPath(index, `leavePlans.${planIndex}.maternityLeave.to`))}
                />
                <MonthInput
                  label="育休開始"
                  {...register(eventPath(index, `leavePlans.${planIndex}.parentalLeave.from`))}
                />
                <MonthInput
                  label="育休終了"
                  {...register(eventPath(index, `leavePlans.${planIndex}.parentalLeave.to`))}
                />
                <NumberInput
                  label="出生後休業支援給付 対象日数(任意)"
                  {...register(eventPath(index, `leavePlans.${planIndex}.postnatalSupportDays`), { valueAsNumber: true })}
                />
                <NumberInput
                  label="復職後の時短係数(任意)"
                  hint="1.0=フルタイム、0.8=8割等"
                  step="0.01"
                  {...register(eventPath(index, `leavePlans.${planIndex}.returnToWork.shortHoursFactor`), { valueAsNumber: true })}
                />
                <MonthInput
                  label="時短終了年月(任意)"
                  {...register(eventPath(index, `leavePlans.${planIndex}.returnToWork.until`))}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HousingPurchaseEventFields({ index, control, register, setValue }: EventFieldsProps) {
  const loans = useFieldArray({ control, name: eventPath(index, 'loans') as FieldArrayPath<ProfileFormValues> })
  const terminatesLabels = usePrimitiveArrayField<ProfileFormValues, string>(
    control,
    eventPath(index, 'terminatesExpenseLabels'),
    (name, value) => setValue(name, value)
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <MonthInput label="購入年月" {...register(eventPath(index, 'yearMonth'))} />
        <NumberInput label="物件価格" suffix="円" {...register(eventPath(index, 'propertyPrice'), { valueAsNumber: true })} />
        <SelectInput label="物件種別" options={[...PROPERTY_TYPE_OPTIONS]} {...register(eventPath(index, 'propertyType'))} />
        <NumberInput label="頭金" suffix="円" {...register(eventPath(index, 'downPayment'), { valueAsNumber: true })} />
        <NumberInput label="諸費用" suffix="円" {...register(eventPath(index, 'closingCosts'), { valueAsNumber: true })} />
        <NumberInput
          label="固定資産税(年額)"
          suffix="円"
          {...register(eventPath(index, 'holdingCosts.propertyTaxAnnual'), { valueAsNumber: true })}
        />
        <NumberInput
          label="管理費(月額・任意)"
          suffix="円"
          {...register(eventPath(index, 'holdingCosts.managementFeeMonthly'), { valueAsNumber: true })}
        />
        <NumberInput
          label="修繕積立の年上昇率(任意)"
          step="0.001"
          {...register(eventPath(index, 'holdingCosts.repairReserveEscalation'), { valueAsNumber: true })}
        />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" {...register(eventPath(index, 'taxCreditEligibility.eligible'))} />
          住宅ローン控除の対象
        </label>
        <SelectInput
          label="控除カテゴリ"
          options={[...TAX_CREDIT_CATEGORY_OPTIONS]}
          {...register(eventPath(index, 'taxCreditEligibility.category'))}
        />
        <label className="flex items-center gap-2 text-sm text-ink-secondary">
          <input
            type="checkbox"
            className="h-4 w-4 accent-amber-500"
            {...register(eventPath(index, 'taxCreditEligibility.hasChildOrYoungCouple'))}
          />
          子育て・若年夫婦世帯
        </label>
      </div>

      <div>
        <span className="text-xs tracking-wide text-ink-muted uppercase">この購入で終了する基本生活費(項目名)</span>
        <div className="mt-2 flex flex-col gap-2">
          {terminatesLabels.value.map((label, i) => (
            <div key={i} className="flex items-center gap-3">
              <input
                value={label}
                onChange={(e) => terminatesLabels.update(i, e.target.value)}
                className="w-full rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-amber-500"
                placeholder="住居費(賃貸)"
              />
              <button type="button" onClick={() => terminatesLabels.remove(i)} className="text-xs text-ink-muted hover:text-critical">
                削除
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <AddButton label="追加" onClick={() => terminatesLabels.append('')} />
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-xs tracking-wide text-ink-muted uppercase">ローン</h5>
          <AddButton
            label="追加"
            onClick={() =>
              loans.append({
                loanId: `loan-${loans.fields.length + 1}`,
                borrowerPersonId: '',
                principal: 0,
                years: 35,
                method: 'equal-payment',
                rateType: 'variable',
                spreadFromBaseRate: 0,
                variableRules: { fiveYearRule: true, cap125Rule: true, rateResetMonths: 12 },
                groupCreditLife: 'general'
              })
            }
          />
        </div>
        <div className="flex flex-col gap-3">
          {loans.fields.map((field, loanIndex) => (
            <ItemCard key={field.id} title={`ローン${loanIndex + 1}`} onRemove={() => loans.remove(loanIndex)}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextInput label="ローンID" {...register(eventPath(index, `loans.${loanIndex}.loanId`))} />
                <TextInput label="借入人ID" {...register(eventPath(index, `loans.${loanIndex}.borrowerPersonId`))} />
                <NumberInput label="借入額" suffix="円" {...register(eventPath(index, `loans.${loanIndex}.principal`), { valueAsNumber: true })} />
                <NumberInput label="返済期間" suffix="年" {...register(eventPath(index, `loans.${loanIndex}.years`), { valueAsNumber: true })} />
                <SelectInput label="返済方法" options={[...LOAN_METHOD_OPTIONS]} {...register(eventPath(index, `loans.${loanIndex}.method`))} />
                <SelectInput label="金利タイプ" options={[...RATE_TYPE_OPTIONS]} {...register(eventPath(index, `loans.${loanIndex}.rateType`))} />
                <NumberInput
                  label="基準金利からの優遇幅(任意)"
                  hint="変動金利のとき使用。マイナス値=優遇"
                  step="0.001"
                  {...register(eventPath(index, `loans.${loanIndex}.spreadFromBaseRate`), { valueAsNumber: true })}
                />
                <NumberInput
                  label="固定金利(任意)"
                  step="0.001"
                  {...register(eventPath(index, `loans.${loanIndex}.fixedRate`), { valueAsNumber: true })}
                />
                <NumberInput
                  label="固定期間(任意)"
                  suffix="年"
                  {...register(eventPath(index, `loans.${loanIndex}.fixedPeriodYears`), { valueAsNumber: true })}
                />
                <SelectInput
                  label="団体信用生命保険"
                  options={[...GROUP_CREDIT_LIFE_OPTIONS]}
                  {...register(eventPath(index, `loans.${loanIndex}.groupCreditLife`))}
                />
                <NumberInput
                  label="金利見直し間隔"
                  suffix="か月"
                  {...register(eventPath(index, `loans.${loanIndex}.variableRules.rateResetMonths`), { valueAsNumber: true })}
                />
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500"
                    {...register(eventPath(index, `loans.${loanIndex}.variableRules.fiveYearRule`))}
                  />
                  5年ルール
                </label>
                <label className="flex items-center gap-2 text-sm text-ink-secondary">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500"
                    {...register(eventPath(index, `loans.${loanIndex}.variableRules.cap125Rule`))}
                  />
                  125%ルール
                </label>
              </div>
            </ItemCard>
          ))}
        </div>
      </div>
    </div>
  )
}

export function LoanPrepaymentEventFields({ index, register }: EventFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <TextInput label="対象ローンID" {...register(eventPath(index, 'loanId'))} />
      <MonthInput label="実行年月" {...register(eventPath(index, 'yearMonth'))} />
      <NumberInput label="繰上返済額" suffix="円" {...register(eventPath(index, 'amount'), { valueAsNumber: true })} />
      <SelectInput label="方式" options={[...PREPAYMENT_METHOD_OPTIONS]} {...register(eventPath(index, 'method'))} />
    </div>
  )
}

export function EducationPlanFields({ index, control, register }: EventFieldsProps) {
  const extracurricular = useFieldArray({
    control,
    name: eventPath(index, 'extracurricularMonthly') as FieldArrayPath<ProfileFormValues>
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <TextInput label="対象の子どもID" {...register(eventPath(index, 'childId'))} />
        <SelectInput label="未就学(保育・幼稚園)" options={[...NURSERY_OPTIONS]} {...register(eventPath(index, 'stages.nursery'))} />
        <SelectInput label="小学校" options={[...SCHOOL_TYPE_OPTIONS]} {...register(eventPath(index, 'stages.elementary'))} />
        <SelectInput label="中学校" options={[...SCHOOL_TYPE_OPTIONS]} {...register(eventPath(index, 'stages.juniorHigh'))} />
        <SelectInput label="高校" options={[...SCHOOL_TYPE_OPTIONS]} {...register(eventPath(index, 'stages.highSchool'))} />
        <SelectInput label="大学" options={[...UNIVERSITY_OPTIONS]} {...register(eventPath(index, 'stages.university'))} />
        <SelectInput
          label="大学時の住まい"
          options={[...UNIVERSITY_HOUSING_OPTIONS]}
          {...register(eventPath(index, 'stages.universityHousing'))}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h5 className="text-xs tracking-wide text-ink-muted uppercase">習い事(任意)</h5>
          <AddButton label="追加" onClick={() => extracurricular.append({ fromAge: 6, toAge: 12, amount: 10000 })} />
        </div>
        <div className="flex flex-col gap-3">
          {extracurricular.fields.map((field, exIndex) => (
            <div key={field.id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
              <NumberInput label="開始年齢" suffix="歳" {...register(eventPath(index, `extracurricularMonthly.${exIndex}.fromAge`), { valueAsNumber: true })} />
              <NumberInput label="終了年齢" suffix="歳" {...register(eventPath(index, `extracurricularMonthly.${exIndex}.toAge`), { valueAsNumber: true })} />
              <NumberInput label="月額" suffix="円" {...register(eventPath(index, `extracurricularMonthly.${exIndex}.amount`), { valueAsNumber: true })} />
              <button
                type="button"
                onClick={() => extracurricular.remove(exIndex)}
                className="h-fit pb-1.5 text-xs text-ink-muted hover:text-critical"
              >
                削除
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function RecurringModifierEventFields({ index, register }: EventFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <TextInput label="項目名" {...register(eventPath(index, 'label'))} />
      <MonthInput label="開始年月" {...register(eventPath(index, 'startYearMonth'))} />
      <NumberInput label="間隔(任意)" suffix="年" {...register(eventPath(index, 'intervalYears'), { valueAsNumber: true })} />
      <NumberInput label="金額" suffix="円" {...register(eventPath(index, 'amount'), { valueAsNumber: true })} />
      <NumberInput label="発生回数(任意)" hint="空欄=期間中ずっと" {...register(eventPath(index, 'occurrences'), { valueAsNumber: true })} />
      <SelectInput
        label="改定方法"
        options={[
          { value: 'fixed', label: '固定(据え置き)' },
          { value: 'inflation', label: 'インフレ連動' },
          { value: 'wage', label: '賃金上昇連動' }
        ]}
        {...register(eventPath(index, 'indexation'))}
      />
    </div>
  )
}

export function OneTimeEventFields({ index, register }: EventFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <TextInput label="項目名" {...register(eventPath(index, 'label'))} />
      <MonthInput label="発生年月" {...register(eventPath(index, 'yearMonth'))} />
      <NumberInput label="金額" suffix="円" hint="正=支出、負=収入(贈与等)" {...register(eventPath(index, 'amount'), { valueAsNumber: true })} />
    </div>
  )
}
