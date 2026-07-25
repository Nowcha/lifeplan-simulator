import { useFieldArray, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { AddButton, HelpBadge, ItemCard, NumberInput, Section, SelectInput, TextInput } from '../form/fields'
import { BASE_RATE_MODEL_HELP, BASE_RATE_MODEL_OPTIONS } from '../../lib/formOptions'
import { numberRules, requiredTextRules } from '../../lib/validation'

/** engine/montecarlo/paths.ts の BASE_RATE_FACTOR_ID と一致させる固定値。変更すると相関構造が壊れる。 */
const BASE_RATE_FACTOR_ID = 'base-rate'

const CORRELATION_HELP =
  '相関係数は、2つの要因が同じ方向に動きやすいか(正の値)、逆方向に動きやすいか(負の値)、無関係か(0)を表す統計指標(-1〜1)。' +
  'モンテカルロが毎年の変動をランダムに生成する際、この数値に従って要因どうしの動きに関連性を持たせる。' +
  '例: 株式と債券をマイナス(株安のとき債券が買われやすい)、株式とインフレ・株式と金利をプラス寄りにする、など。' +
  '通常は初期値のままで問題なく、より現実の値動きに近づけたい場合だけ調整する。'

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput label="開始年" {...register('assumptions.simulation.startYear', numberRules({ min: 1900, max: 2200, integer: true }))} />
          <NumberInput label="終了年齢(最年長者基準)" suffix="歳" {...register('assumptions.simulation.endAge', numberRules({ min: 0, max: 120, integer: true }))} />
          <NumberInput label="モンテカルロ試行数" hint="多いほど精度は上がるが計算時間も増える" {...register('assumptions.simulation.paths', numberRules({ min: 1, integer: true }))} />
          <NumberInput label="乱数シード" hint="同じ値なら毎回同じ結果を再現" {...register('assumptions.simulation.seed', numberRules({ integer: true }))} />
        </div>
      </Section>

      <Section title="インフレ・賃金上昇率" note="平均(mean)と年率のばらつき(volatility)を小数で指定(0.02 = 年2%)。">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberInput label="インフレ率(平均)" step="0.001" {...register('assumptions.inflation.mean', numberRules())} />
          <NumberInput label="インフレ率(変動)" step="0.001" {...register('assumptions.inflation.volatility', numberRules({ min: 0 }))} />
          <NumberInput label="賃金上昇率(平均)" step="0.001" {...register('assumptions.wageGrowth.mean', numberRules())} />
          <NumberInput label="賃金上昇率(変動)" step="0.001" {...register('assumptions.wageGrowth.volatility', numberRules({ min: 0 }))} />
        </div>
      </Section>

      <Section
        title="資産クラス"
        note="名前は保有資産・積立配分・相関行列から参照される。"
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <TextInput
                  label="名前"
                  hint="保有資産・積立配分から選べるようになる呼び名"
                  {...register(`assumptions.assetClasses.${index}.id`, requiredTextRules)}
                />
                <NumberInput label="期待リターン(年率)" step="0.001" {...register(`assumptions.assetClasses.${index}.expectedReturn`, numberRules())} />
                <NumberInput label="ボラティリティ(年率)" step="0.001" {...register(`assumptions.assetClasses.${index}.volatility`, numberRules({ min: 0 }))} />
              </div>
            </ItemCard>
          ))}
        </div>
      </Section>

      <CorrelationMatrixEditor control={control} setValue={setValue} />

      <Section title="住宅ローン基準金利">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberInput label="初期値" step="0.001" {...register('assumptions.baseRate.initial', numberRules())} />
          <SelectInput
            label="モデル"
            help={BASE_RATE_MODEL_HELP}
            options={[...BASE_RATE_MODEL_OPTIONS]}
            {...register('assumptions.baseRate.model')}
          />
        </div>

        {baseRateModel === 'mean-reverting' && (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <NumberInput label="回帰速度" step="0.001" {...register('assumptions.baseRate.meanReversion.speed', numberRules({ min: 0 }))} />
            <NumberInput label="長期平均" step="0.001" {...register('assumptions.baseRate.meanReversion.longTermMean', numberRules())} />
            <NumberInput label="ボラティリティ" step="0.001" {...register('assumptions.baseRate.meanReversion.volatility', numberRules({ min: 0 }))} />
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
                <div key={field.id} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <NumberInput label="年" {...register(`assumptions.baseRate.manualPath.${index}.year`, numberRules({ min: 1900, max: 2200, integer: true }))} />
                  <NumberInput label="金利" step="0.001" {...register(`assumptions.baseRate.manualPath.${index}.rate`, numberRules())} />
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
    const factors = [...cm.factors, `新しい要因${n + 1}`]
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
      note="各行は「その要因が他の要因とどれだけ連動するか」。対角(自分自身)は常に1で編集不可。セルを編集すると対称になるよう自動でミラーする。"
      actions={<AddButton label="要因を追加" onClick={addFactor} />}
    >
      <div className="mb-4 flex items-center gap-1.5 text-sm text-ink-secondary">
        相関係数の読み方
        <HelpBadge text={CORRELATION_HELP} />
      </div>

      {cm.factors.length === 0 ? (
        <p className="text-sm text-ink-muted">要因がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          {/* 行列は折り返せないため横スクロール前提。スクロールできることを明示する */}
          <p className="mb-2 text-xs text-ink-muted sm:hidden">← 横にスクロールすると全ての要因を表示できます</p>
          <table className="border-collapse text-sm">
            <tbody>
              {cm.factors.map((factor, i) => {
                const isBaseRate = factor === BASE_RATE_FACTOR_ID
                return (
                  <tr key={i}>
                    <td className="p-1">
                      <div className="flex items-center gap-1">
                        {isBaseRate ? (
                          <span className="w-32 truncate text-xs text-ink" title="engine側の固定ID(名称変更不可)">
                            住宅ローン基準金利
                          </span>
                        ) : (
                          <input
                            value={factor}
                            onChange={(e) => renameFactor(i, e.target.value)}
                            className="min-h-11 w-32 rounded-sm border border-hairline-strong bg-surface px-2 py-1 text-base text-ink outline-none focus:border-amber-500 sm:min-h-0 sm:text-xs"
                          />
                        )}
                        <button type="button" onClick={() => removeFactor(i)} className="text-xs text-ink-muted hover:text-critical">
                          ×
                        </button>
                      </div>
                    </td>
                    {cm.factors.map((otherFactor, j) => {
                      if (j > i) return <td key={j} className="p-1" />
                      return (
                        <td key={j} className="p-1">
                          {i === j ? (
                            <span className="flex h-[26px] w-16 items-center justify-center text-xs text-ink-muted">1</span>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              min={-1}
                              max={1}
                              value={cm.matrix[i]?.[j] ?? 0}
                              onChange={(e) => setCell(i, j, Number(e.target.value))}
                              title={`${factor} × ${otherFactor}`}
                              className="min-h-11 w-16 rounded-sm border border-hairline-strong bg-surface px-1.5 py-1 text-base text-ink outline-none focus:border-amber-500 sm:min-h-0 sm:text-xs"
                            />
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  )
}
