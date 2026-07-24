import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { AddButton, ItemCard, NumberInput, Section, SelectInput, TextInput } from '../form/fields'
import { BASE_RATE_MODEL_HELP, BASE_RATE_MODEL_OPTIONS } from '../../lib/formOptions'

interface AssumptionsFormProps {
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
  setValue: UseFormSetValue<ProfileFormValues>
}

export function AssumptionsForm({ control, register, setValue }: AssumptionsFormProps) {
  const assetClasses = useFieldArray({ control, name: 'assumptions.assetClasses' })
  const manualPath = useFieldArray({ control, name: 'assumptions.baseRate.manualPath' })
  const baseRateModel = useWatch({ control, name: 'assumptions.baseRate.model' })

  return (
    <div>
      <Section title="シミュレーション条件">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberInput label="開始年" {...register('assumptions.simulation.startYear', { valueAsNumber: true })} />
          <NumberInput label="終了年齢(最年長者基準)" suffix="歳" {...register('assumptions.simulation.endAge', { valueAsNumber: true })} />
          <NumberInput label="モンテカルロ試行数" hint="多いほど精度は上がるが計算時間も増える" {...register('assumptions.simulation.paths', { valueAsNumber: true })} />
          <NumberInput label="乱数シード" hint="同じ値なら毎回同じ結果を再現" {...register('assumptions.simulation.seed', { valueAsNumber: true })} />
        </div>
      </Section>

      <Section title="インフレ・賃金上昇率" note="平均(mean)と年率のばらつき(volatility)を小数で指定(0.02 = 年2%)。">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <NumberInput label="インフレ率(平均)" step="0.001" {...register('assumptions.inflation.mean', { valueAsNumber: true })} />
          <NumberInput label="インフレ率(変動)" step="0.001" {...register('assumptions.inflation.volatility', { valueAsNumber: true })} />
          <NumberInput label="賃金上昇率(平均)" step="0.001" {...register('assumptions.wageGrowth.mean', { valueAsNumber: true })} />
          <NumberInput label="賃金上昇率(変動)" step="0.001" {...register('assumptions.wageGrowth.volatility', { valueAsNumber: true })} />
        </div>
      </Section>

      <Section
        title="資産クラス"
        note="idは保有資産・積立配分・相関行列から参照される。"
        actions={
          <AddButton
            label="追加"
            onClick={() => assetClasses.append({ id: `asset-${assetClasses.fields.length + 1}`, expectedReturn: 0.03, volatility: 0.1 })}
          />
        }
      >
        <div className="flex flex-col gap-3">
          {assetClasses.fields.map((field, index) => (
            <ItemCard key={field.id} title={`資産クラス${index + 1}`} onRemove={() => assetClasses.remove(index)}>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <TextInput
                  label="名前"
                  hint="保有資産・積立配分から選べるようになる呼び名"
                  {...register(`assumptions.assetClasses.${index}.id`)}
                />
                <NumberInput label="期待リターン(年率)" step="0.001" {...register(`assumptions.assetClasses.${index}.expectedReturn`, { valueAsNumber: true })} />
                <NumberInput label="ボラティリティ(年率)" step="0.001" {...register(`assumptions.assetClasses.${index}.volatility`, { valueAsNumber: true })} />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>

      <CorrelationMatrixEditor control={control} setValue={setValue} />

      <Section title="住宅ローン基準金利">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <NumberInput label="初期値" step="0.001" {...register('assumptions.baseRate.initial', { valueAsNumber: true })} />
          <SelectInput
            label="モデル"
            help={BASE_RATE_MODEL_HELP}
            options={[...BASE_RATE_MODEL_OPTIONS]}
            {...register('assumptions.baseRate.model')}
          />
        </div>

        {baseRateModel === 'mean-reverting' && (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <NumberInput label="回帰速度" step="0.001" {...register('assumptions.baseRate.meanReversion.speed', { valueAsNumber: true })} />
            <NumberInput label="長期平均" step="0.001" {...register('assumptions.baseRate.meanReversion.longTermMean', { valueAsNumber: true })} />
            <NumberInput label="ボラティリティ" step="0.001" {...register('assumptions.baseRate.meanReversion.volatility', { valueAsNumber: true })} />
          </div>
        )}

        {baseRateModel === 'manual' && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h5 className="text-xs tracking-wide text-ink-muted uppercase">手動パス(年→金利)</h5>
              <AddButton label="追加" onClick={() => manualPath.append({ year: new Date().getFullYear(), rate: 0.01 })} />
            </div>
            <div className="flex flex-col gap-2">
              {manualPath.fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
                  <NumberInput label="年" {...register(`assumptions.baseRate.manualPath.${index}.year`, { valueAsNumber: true })} />
                  <NumberInput label="金利" step="0.001" {...register(`assumptions.baseRate.manualPath.${index}.rate`, { valueAsNumber: true })} />
                  <button
                    type="button"
                    onClick={() => manualPath.remove(index)}
                    className="h-fit pb-1.5 text-xs text-ink-muted hover:text-critical"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </div>
  )
}

interface CorrelationMatrix {
  factors: string[]
  matrix: number[][]
}

function CorrelationMatrixEditor({
  control,
  setValue
}: {
  control: Control<ProfileFormValues>
  setValue: UseFormSetValue<ProfileFormValues>
}) {
  const cm = (useWatch({ control, name: 'assumptions.correlationMatrix' }) ?? { factors: [], matrix: [] }) as CorrelationMatrix

  function commit(next: CorrelationMatrix) {
    setValue('assumptions.correlationMatrix', next)
  }

  function addFactor() {
    const n = cm.factors.length
    const factors = [...cm.factors, `factor-${n + 1}`]
    const matrix = cm.matrix.map((row) => [...row, 0])
    const newRow = new Array(n + 1).fill(0)
    newRow[n] = 1
    matrix.push(newRow)
    commit({ factors, matrix })
  }

  function removeFactor(i: number) {
    const factors = cm.factors.filter((_, idx) => idx !== i)
    const matrix = cm.matrix.filter((_, ri) => ri !== i).map((row) => row.filter((_, ci) => ci !== i))
    commit({ factors, matrix })
  }

  function renameFactor(i: number, name: string) {
    commit({ factors: cm.factors.map((f, idx) => (idx === i ? name : f)), matrix: cm.matrix })
  }

  function setCell(i: number, j: number, value: number) {
    const matrix = cm.matrix.map((row) => [...row])
    const rowI = matrix[i]
    const rowJ = matrix[j]
    if (!rowI || !rowJ) return
    rowI[j] = value
    rowJ[i] = value
    commit({ factors: cm.factors, matrix })
  }

  return (
    <Section
      title="相関行列"
      note="資産クラス・インフレ・基準金利の変動要因間の相関(-1〜1)。対角は常に1。セルを編集すると対称になるよう自動でミラーする。"
      actions={<AddButton label="要因を追加" onClick={addFactor} />}
    >
      {cm.factors.length === 0 ? (
        <p className="text-sm text-ink-muted">要因がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="p-1" />
                {cm.factors.map((_, j) => (
                  <th key={j} className="p-1 text-xs text-ink-muted">
                    {j + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cm.factors.map((factor, i) => (
                <tr key={i}>
                  <td className="p-1">
                    <div className="flex items-center gap-1">
                      <input
                        value={factor}
                        onChange={(e) => renameFactor(i, e.target.value)}
                        className="w-28 rounded-sm border border-hairline-strong bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-amber-500"
                      />
                      <button type="button" onClick={() => removeFactor(i)} className="text-xs text-ink-muted hover:text-critical">
                        ×
                      </button>
                    </div>
                  </td>
                  {cm.factors.map((_, j) => (
                    <td key={j} className="p-1">
                      <input
                        type="number"
                        step="0.01"
                        min={-1}
                        max={1}
                        disabled={i === j}
                        value={i === j ? 1 : (cm.matrix[i]?.[j] ?? 0)}
                        onChange={(e) => setCell(i, j, Number(e.target.value))}
                        className="w-16 rounded-sm border border-hairline-strong bg-surface px-1.5 py-1 text-xs text-ink outline-none focus:border-amber-500 disabled:bg-surface-2 disabled:text-ink-muted"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
