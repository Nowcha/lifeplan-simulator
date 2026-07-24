import { useEffect, useState } from 'react'
import { assumptions, runSimulationInWorker, type SimulationBundle } from './lib/engine'
import { formatManYen, formatPercent } from './lib/format'
import { StatTile } from './components/StatTile'
import { FanChart, type FanChartSeries } from './components/charts/FanChart'
import { TornadoChart } from './components/charts/TornadoChart'
import { DataTable } from './components/DataTable'

const FACTOR_LABELS: Record<string, string> = {
  'global-equity': '世界株式リターン',
  bonds: '債券リターン',
  cash: '現金リターン',
  'base-rate': '住宅ローン基準金利',
}

function buildFanChartSeries(result: SimulationBundle): FanChartSeries {
  const years = result.deterministic.deterministic.map((row) => row.year)
  const deterministic = result.deterministic.deterministic.map((row) => row.netWorth)
  const percentiles = Object.fromEntries(
    result.monteCarlo.percentiles.map((p) => [p.p, p.netWorthByYear])
  ) as FanChartSeries['percentiles']
  return { years, percentiles, deterministic }
}

export default function App() {
  const [result, setResult] = useState<SimulationBundle | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load(): Promise<void> {
      try {
        const bundle = await runSimulationInWorker()
        if (!cancelled) setResult(bundle)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'シミュレーションの実行に失敗しました')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-ink-secondary">
        <p className="text-sm text-critical">{error}</p>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-page text-ink-secondary">
        <p className="text-sm">シミュレーションを計算しています(モンテカルロ10,000パス、数秒〜十数秒かかります)…</p>
      </div>
    )
  }

  const series = buildFanChartSeries(result)
  const rows = result.deterministic.deterministic
  const finalRow = rows.at(-1)
  const firstRow = rows[0]
  const medianFinal = series.percentiles[50].at(-1) ?? 0
  const sensitivityData = result.sensitivity.filter((s) => s.low !== s.high)

  return (
    <div className="min-h-screen bg-page pb-24">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-xs tracking-widest text-ink-muted uppercase">Life Plan Simulator</p>
          <h1 className="mt-1 text-2xl font-medium text-ink">ライフプラン・シミュレーション</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            {firstRow?.year}年〜{finalRow?.year}年、{rows.length}年間の家計を試算。モンテカルロは{assumptions.simulation.paths.toLocaleString('ja-JP')}パスで実行。
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid grid-cols-2 gap-6 py-8 sm:grid-cols-4">
          <StatTile
            label="最終年 純資産(中央値)"
            value={formatManYen(medianFinal)}
            detail={`決定論パス: ${formatManYen(finalRow?.netWorth ?? 0)}`}
          />
          <StatTile
            label="資産枯渇確率"
            value={formatPercent(result.monteCarlo.depletionProbability, 0)}
            tone={result.monteCarlo.depletionProbability > 0.1 ? 'critical' : 'default'}
          />
          <StatTile label="開始年 純資産" value={formatManYen(firstRow?.netWorth ?? 0)} />
          <StatTile label="シミュレーション期間" value={`${rows.length}年`} detail={`${firstRow?.year}–${finalRow?.year}`} />
        </section>

        <section className="border-t border-hairline py-10">
          <SectionHeading title="純資産の推移(ファンチャート)" note="毎年の純資産分布。帯が広いほど不確実性が高い年。" />
          <div className="mt-5 rounded-sm border border-hairline bg-surface p-6">
            <FanChart data={series} />
          </div>
        </section>

        <section className="border-t border-hairline py-10">
          <SectionHeading title="年次データ" note="ファンチャートの数値テーブル。" />
          <div className="mt-5">
            <DataTable data={series} />
          </div>
        </section>

        <section className="border-t border-hairline py-10">
          <SectionHeading
            title="感度分析(トルネードチャート)"
            note="各前提を±1σ動かした場合の、最終年純資産中央値への影響。影響が大きい順。"
          />
          <div className="mt-5 rounded-sm border border-hairline bg-surface p-6">
            <TornadoChart data={sensitivityData} baseline={medianFinal} factorLabel={(f) => FACTOR_LABELS[f] ?? f} />
          </div>
        </section>
      </main>
    </div>
  )
}

function SectionHeading({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h2 className="text-lg font-medium text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{note}</p>
    </div>
  )
}
