import { useRef, type FocusEvent } from 'react'
import { useFieldArray, useFormContext, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { usePrimitiveArrayField } from '../../lib/usePrimitiveArrayField'
import { AddButton, HelpBadge, ItemCard, MonthInput, NumberInput, Section, SelectInput, TextInput } from '../form/fields'
import { AssetClassPicker } from './pickers'
import { describeReferences, renameExpenseLabelReferences } from '../../lib/references'
import { useUndo } from '../../lib/undoContext'
import { numberRules, optionalNumberRules, optionalYearMonthRules, requiredTextRules } from '../../lib/validation'
import {
  ACCOUNT_TYPE_HELP,
  ACCOUNT_TYPE_OPTIONS,
  CONTRIBUTION_ACCOUNT_OPTIONS,
  DRAWDOWN_ACCOUNT_OPTIONS,
  DRAWDOWN_ORDER_HELP,
  DRAWDOWN_STRATEGY_HELP,
  DRAWDOWN_STRATEGY_OPTIONS,
  INDEXATION_HELP,
  INDEXATION_OPTIONS
} from '../../lib/formOptions'

interface HouseholdFinanceFormProps {
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
  setValue: UseFormSetValue<ProfileFormValues>
}

export function HouseholdFinanceForm({ control, register, setValue }: HouseholdFinanceFormProps) {
  const baseExpenses = useFieldArray({ control, name: 'household.baseExpenses' })
  const financialAssets = useFieldArray({ control, name: 'household.financialAssets' })
  const contributions = useFieldArray({ control, name: 'household.savingsPolicy.contributions' })
  const { getValues } = useFormContext<ProfileFormValues>()
  const { pushUndo } = useUndo()
  // 費目名は住宅購入イベントから「名前で」参照される唯一の項目。リネームすると
  // 参照が黙って切れるため、フォーカス時の値を覚えてblurで差分を見る。
  const renamingFrom = useRef('')

  function labelFieldProps(index: number) {
    const field = register(`household.baseExpenses.${index}.label`, requiredTextRules)
    return {
      ...field,
      onFocus: (e: FocusEvent<HTMLInputElement>) => {
        renamingFrom.current = e.target.value
      },
      onBlur: (e: FocusEvent<HTMLInputElement>) => {
        void field.onBlur(e)
        applyLabelRename(renamingFrom.current, e.target.value)
      }
    }
  }

  /** 参照側も同時に書き換え、黙って変えないよう取り消し可能な通知を出す */
  function applyLabelRename(oldLabel: string, newLabel: string): void {
    const previous = getValues('events')
    const { events, changed } = renameExpenseLabelReferences(previous, oldLabel, newLabel)
    if (changed === 0) return
    setValue('events', events)
    pushUndo(`費目名の変更に合わせて、住宅購入イベントの参照${changed}件を更新しました。`, () =>
      setValue('events', previous)
    )
  }
  const drawdownOrder = usePrimitiveArrayField<ProfileFormValues, (typeof DRAWDOWN_ACCOUNT_OPTIONS)[number]['value']>(
    control,
    'household.savingsPolicy.drawdown.order',
    (name, value) => setValue(name, value)
  )

  return (
    <div>
      <Section
        title="基本生活費"
        note="住居費・食費など毎月固定でかかる支出。「改定方法」で物価/賃金連動か据え置きかを指定。"
        actions={
          <AddButton
            label="追加"
            onClick={() => baseExpenses.append({ label: '新規費目', monthly: 0, indexation: 'inflation' })}
          />
        }
      >
        <div className="flex flex-col gap-3">
          {baseExpenses.fields.map((field, index) => (
            <ItemCard
              key={field.id}
              title={`費目${index + 1}`}
              onRemove={() => {
                const removed = getValues(`household.baseExpenses.${index}`)
                baseExpenses.remove(index)
                pushUndo(`「費目${index + 1}」を削除しました。`, () => baseExpenses.insert(index, removed))
              }}
              getRemoveWarning={() =>
                describeReferences(getValues(), {
                  kind: 'expenseLabel',
                  label: getValues(`household.baseExpenses.${index}.label`)
                })
              }
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <TextInput label="項目名" {...labelFieldProps(index)} />
                <NumberInput
                  label="月額"
                  suffix="円"
                  {...register(`household.baseExpenses.${index}.monthly`, numberRules({ min: 0 }))}
                />
                <SelectInput
                  label="改定方法"
                  help={INDEXATION_HELP}
                  options={[...INDEXATION_OPTIONS]}
                  {...register(`household.baseExpenses.${index}.indexation`)}
                />
                <MonthInput
                  label="開始年月(任意)"
                  {...register(`household.baseExpenses.${index}.activeFrom`, optionalYearMonthRules)}
                />
                <MonthInput
                  label="終了年月(任意)"
                  {...register(`household.baseExpenses.${index}.activeTo`, optionalYearMonthRules)}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>

      <Section
        title="保有資産"
        note="現在保有している金融資産の残高。costBasisは取得原価(譲渡益課税の計算に使用)。"
        actions={
          <AddButton
            label="追加"
            onClick={() =>
              financialAssets.append({ assetClassId: 'global-equity', account: 'taxable', balance: 0, costBasis: 0 })
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          {financialAssets.fields.map((field, index) => (
            <ItemCard
              key={field.id}
              title={`資産${index + 1}`}
              onRemove={() => {
                const removed = getValues(`household.financialAssets.${index}`)
                financialAssets.remove(index)
                pushUndo(`「資産${index + 1}」を削除しました。`, () => financialAssets.insert(index, removed))
              }}
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <AssetClassPicker
                  control={control}
                  label="資産クラス"
                  hint="前提条件タブで定義したものから選ぶ"
                  {...register(`household.financialAssets.${index}.assetClassId`)}
                />
                <SelectInput
                  label="口座"
                  help={ACCOUNT_TYPE_HELP}
                  options={[...ACCOUNT_TYPE_OPTIONS]}
                  {...register(`household.financialAssets.${index}.account`)}
                />
                <NumberInput
                  label="残高"
                  suffix="円"
                  {...register(`household.financialAssets.${index}.balance`, numberRules({ min: 0 }))}
                />
                <NumberInput
                  label="取得原価"
                  suffix="円"
                  {...register(`household.financialAssets.${index}.costBasis`, numberRules({ min: 0 }))}
                />
                <NumberInput
                  label="NISA生涯枠消化額(任意)"
                  suffix="円"
                  {...register(`household.financialAssets.${index}.nisaLifetimeUsed`, optionalNumberRules({ min: 0 }))}
                />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>

      <Section title="貯蓄・取り崩し方針" note="毎月の積立配分と、取り崩し開始後の引き出しルール。">
        <div className="flex flex-col gap-6">
          <NumberInput
            label="生活防衛資金"
            suffix="か月分"
            {...register('household.savingsPolicy.cashBufferMonths', numberRules({ min: 0 }))}
          />

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-xs tracking-wide text-ink-muted uppercase">積立配分</h5>
              <AddButton
                label="追加"
                onClick={() => contributions.append({ account: 'nisa-tsumitate', monthlyCap: 0, assetClassId: 'global-equity' })}
              />
            </div>
            <div className="flex flex-col gap-3">
              {contributions.fields.map((field, index) => (
                <ItemCard
                  key={field.id}
                  title={`積立${index + 1}`}
                  onRemove={() => {
                    const removed = getValues(`household.savingsPolicy.contributions.${index}`)
                    contributions.remove(index)
                    pushUndo(`「積立${index + 1}」を削除しました。`, () => contributions.insert(index, removed))
                  }}
                >
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <SelectInput
                      label="口座"
                      help={ACCOUNT_TYPE_HELP}
                      options={[...CONTRIBUTION_ACCOUNT_OPTIONS]}
                      {...register(`household.savingsPolicy.contributions.${index}.account`)}
                    />
                    <NumberInput
                      label="月額上限"
                      suffix="円"
                      {...register(`household.savingsPolicy.contributions.${index}.monthlyCap`, numberRules({ min: 0 }))}
                    />
                    <AssetClassPicker
                      control={control}
                      label="資産クラス"
                      {...register(`household.savingsPolicy.contributions.${index}.assetClassId`)}
                    />
                  </div>
                </ItemCard>
              ))}
            </div>
          </div>

          <div>
            <h5 className="mb-2 text-xs tracking-wide text-ink-muted uppercase">取り崩しルール</h5>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectInput
                label="方式"
                help={DRAWDOWN_STRATEGY_HELP}
                options={[...DRAWDOWN_STRATEGY_OPTIONS]}
                {...register('household.savingsPolicy.drawdown.strategy')}
              />
              <NumberInput
                label="金額 / 率(将来機能)"
                hint="現在の計算では未使用。定額=円、定率=0.04など小数"
                step="any"
                {...register('household.savingsPolicy.drawdown.value', numberRules({ min: 0 }))}
              />
            </div>
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                取り崩し優先順(先頭から消費)
                <HelpBadge text={DRAWDOWN_ORDER_HELP} />
              </span>
              <div className="mt-2 flex flex-col gap-2">
                {drawdownOrder.value.map((account, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <span className="w-5 text-xs text-ink-muted">{index + 1}.</span>
                    <select
                      value={account}
                      onChange={(e) =>
                        drawdownOrder.update(index, e.target.value as (typeof DRAWDOWN_ACCOUNT_OPTIONS)[number]['value'])
                      }
                      className="min-h-11 w-full rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-base text-ink outline-none focus:border-amber-500 sm:min-h-0 sm:text-sm"
                    >
                      {DRAWDOWN_ACCOUNT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => drawdownOrder.remove(index)}
                      className="text-xs text-ink-muted hover:text-critical"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <AddButton label="追加" onClick={() => drawdownOrder.append('taxable')} />
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  )
}
