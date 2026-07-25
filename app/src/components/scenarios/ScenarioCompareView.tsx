import { useState } from 'react'
import { rules, runSimulationInWorker, type SimulationBundle } from '../../lib/engine'
import { deleteScenario, type Scenario } from '../../lib/scenarioStorage'
import { CATEGORICAL_PALETTE, MAX_COMPARE_SCENARIOS } from '../../lib/categoricalPalette'
import { formatManYen, formatPercent } from '../../lib/format'
import { CompareChart, type CompareSeries } from '../charts/CompareChart'

interface ScenarioCompareViewProps {
  scenarios: Scenario[]
  onScenariosChanged: () => void
}

type ResultState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'done'; bundle: SimulationBundle }

export function ScenarioCompareView({ scenarios, onScenariosChanged }: ScenarioCompareViewProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [results, setResults] = useState<Record<string, ResultState>>({})

  function toggleSelected(id: string): void {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= MAX_COMPARE_SCENARIOS) return prev
      return [...prev, id]
    })
  }

  function handleDelete(id: string): void {
    if (!window.confirm('このシナリオを削除します。よろしいですか?')) return
    deleteScenario(id)
    setSelectedIds((prev) => prev.filter((x) => x !== id))
    onScenariosChanged()
  }

  async function handleCompare(): Promise<void> {
    const targets = scenarios.filter((s) => selectedIds.includes(s.id))
    setResults(Object.fromEntries(targets.map((s) => [s.id, { status: 'loading' } as ResultState])))

    await Promise.all(
      targets.map(async (scenario) => {
        try {
          const bundle = await runSimulationInWorker({ ...scenario.profile, rules })
          setResults((prev) => ({ ...prev, [scenario.id]: { status: 'done', bundle } }))
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'シミュレーションの実行に失敗しました'
          setResults((prev) => ({ ...prev, [scenario.id]: { status: 'error', message } }))
        }
      })
    )
  }

  const compareSeries: CompareSeries[] = selectedIds
    .map((id, i) => {
      const scenario = scenarios.find((s) => s.id === id)
      const result = results[id]
      if (!scenario || !result || result.status !== 'done') return null
      const rows = result.bundle.deterministic.deterministic
      const p50 = result.bundle.monteCarlo.percentiles.find((p) => p.p === 50)
      const series: CompareSeries = {
        id,
        name: scenario.name,
        color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
        years: rows.map((r) => r.year),
        netWorthByYear: p50?.netWorthByYear ?? rows.map((r) => r.netWorth)
      }
      return series
    })
    .filter((s): s is CompareSeries => s !== null)

  const isComparing = selectedIds.some((id) => results[id]?.status === 'loading')

  return (
    <div className="py-8">
      <div className="border-b border-hairline pb-8">
        <h2 className="text-lg font-medium text-ink">保存済みシナリオ</h2>
        <p className="mt-1 text-sm text-ink-muted">
          「データ編集」タブで内容を調整し「シナリオとして保存」すると、ここに追加される。最大{MAX_COMPARE_SCENARIOS}件まで選んで比較できる。
        </p>

        {scenarios.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">保存済みシナリオがありません。</p>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            {scenarios.map((scenario) => (
              <label
                key={scenario.id}
                className="flex min-h-11 items-center justify-between gap-3 rounded-sm border border-hairline bg-surface px-4 py-2.5"
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500"
                    checked={selectedIds.includes(scenario.id)}
                    disabled={!selectedIds.includes(scenario.id) && selectedIds.length >= MAX_COMPARE_SCENARIOS}
                    onChange={() => toggleSelected(scenario.id)}
                  />
                  <span className="text-sm text-ink">{scenario.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(scenario.id)}
                  className="-my-2 shrink-0 px-2 py-2 text-xs text-ink-muted hover:text-critical"
                >
                  削除
                </button>
              </label>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleCompare()}
          disabled={selectedIds.length === 0 || isComparing}
          className="mt-5 min-h-11 w-full rounded-sm bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:w-auto"
        >
          {isComparing ? '計算しています…' : `比較を実行(${selectedIds.length}件選択中)`}
        </button>
      </div>

      {compareSeries.length > 0 && (
        <>
          <section className="border-t border-hairline py-8">
            <h3 className="text-base font-medium text-ink">指標比較</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-hairline text-left text-xs text-ink-muted uppercase">
                    <th className="py-2 pr-4">シナリオ</th>
                    <th className="py-2 pr-4">最終年 純資産(中央値)</th>
                    <th className="py-2 pr-4">決定論パス</th>
                    <th className="py-2 pr-4">資産枯渇確率</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedIds.map((id, i) => {
                    const scenario = scenarios.find((s) => s.id === id)
                    const result = results[id]
                    if (!scenario) return null
                    if (!result || result.status === 'loading')
                      return (
                        <tr key={id} className="border-b border-hairline">
                          <td className="py-2 pr-4 text-ink">{scenario.name}</td>
                          <td colSpan={3} className="py-2 text-ink-muted">
                            計算中…
                          </td>
                        </tr>
                      )
                    if (result.status === 'error')
                      return (
                        <tr key={id} className="border-b border-hairline">
                          <td className="py-2 pr-4 text-ink">{scenario.name}</td>
                          <td colSpan={3} className="py-2 text-critical">
                            {result.message}
                          </td>
                        </tr>
                      )
                    const rows = result.bundle.deterministic.deterministic
                    const finalRow = rows.at(-1)
                    const p50 = result.bundle.monteCarlo.percentiles.find((p) => p.p === 50)
                    const medianFinal = p50?.netWorthByYear.at(-1) ?? 0
                    return (
                      <tr key={id} className="border-b border-hairline">
                        <td className="py-2 pr-4">
                          <span className="inline-flex items-center gap-2 text-ink">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-sm"
                              style={{ background: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length] }}
                            />
                            {scenario.name}
                          </span>
                        </td>
                        <td className="py-2 pr-4 tabular text-ink">{formatManYen(medianFinal)}</td>
                        <td className="py-2 pr-4 tabular text-ink">{formatManYen(finalRow?.netWorth ?? 0)}</td>
                        <td className={`py-2 pr-4 tabular ${result.bundle.monteCarlo.depletionProbability > 0.1 ? 'text-critical' : 'text-ink'}`}>
                          {formatPercent(result.bundle.monteCarlo.depletionProbability, 0)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="border-t border-hairline py-8">
            <h3 className="text-base font-medium text-ink">純資産の推移(中央値・シナリオ間比較)</h3>
            <div className="mt-5 rounded-sm border border-hairline bg-surface p-3 sm:p-6">
              <CompareChart series={compareSeries} />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
