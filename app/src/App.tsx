import { useEffect, useState } from 'react'
import { rules, runSimulationInWorker, type SimulationBundle } from './lib/engine'
import { loadProfile, saveProfile, resetProfile, type EditableProfile } from './lib/profileStorage'
import { sanitizeFormValue } from './lib/sanitizeFormValue'
import { listScenarios, type Scenario } from './lib/scenarioStorage'
import { formatManYen, formatPercent } from './lib/format'
import { StatTile } from './components/StatTile'
import { FanChart, type FanChartSeries } from './components/charts/FanChart'
import { TornadoChart } from './components/charts/TornadoChart'
import { DataTable } from './components/DataTable'
import { ProfileEditor } from './components/profile/ProfileEditor'
import { ScenarioCompareView } from './components/scenarios/ScenarioCompareView'

// 資産クラスの感度分析行は assumptions.assetClasses[].id(ユーザー命名、通常は日本語)を
// そのままラベルとして使う。「基準金利」だけはエンジン側の固定ID(BASE_RATE_FACTOR_ID)
// なので、ここで日本語ラベルに変換する。
const FACTOR_LABELS: Record<string, string> = {
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

type View = 'dashboard' | 'editor' | 'compare'

export default function App() {
  const [profile, setProfile] = useState<EditableProfile>(() => loadProfile())
  const [editorKey, setEditorKey] = useState(0)
  const [view, setView] = useState<View>('dashboard')
  const [result, setResult] = useState<SimulationBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>(() => listScenarios())
  const [toast, setToast] = useState<string | null>(null)

  // 保存はダッシュボードへの遷移と再計算を伴うため、何が起きたのかを一言で返す
  useEffect(() => {
    if (toast === null) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  useEffect(() => {
    let cancelled = false
    setResult(null)
    setError(null)

    async function load(): Promise<void> {
      try {
        const bundle = await runSimulationInWorker({ ...profile, rules })
        if (!cancelled) setResult(bundle)
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'シミュレーションの実行に失敗しました')
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [profile])

  function handleApply(nextProfile: EditableProfile): void {
    const sanitized = sanitizeFormValue(nextProfile)
    saveProfile(sanitized)
    setProfile(sanitized)
    setView('dashboard')
    setToast('世帯データを保存しました。結果を再計算しています。')
  }

  function handleReset(): void {
    if (!window.confirm('編集内容を破棄してサンプルデータに戻します。よろしいですか?')) return
    const fresh = resetProfile()
    setProfile(fresh)
    setEditorKey((k) => k + 1)
    setToast('サンプルデータに戻しました。')
  }

  function handleScenarioSaved(name: string): void {
    setScenarios(listScenarios())
    setToast(`シナリオ「${name}」を保存しました。「シナリオ比較」タブで比較できます。`)
  }

  function refreshScenarios(): void {
    setScenarios(listScenarios())
  }

  return (
    <div className="min-h-screen bg-page pb-24">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs tracking-widest text-ink-muted uppercase">Life Plan Simulator</p>
              <h1 className="mt-1 text-xl font-medium text-ink sm:text-2xl">ライフプラン・シミュレーション</h1>
            </div>
            {/* 狭い画面ではタブが3つ縦に折り返して138px消費していたため、横スクロールにする */}
            <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:overflow-visible sm:px-0 sm:pb-0">
              <TabButton active={view === 'dashboard'} onClick={() => setView('dashboard')} label="ダッシュボード" />
              <TabButton active={view === 'editor'} onClick={() => setView('editor')} label="データ編集" />
              <TabButton active={view === 'compare'} onClick={() => setView('compare')} label="シナリオ比較" />
            </nav>
          </div>
          {view === 'dashboard' && result && (
            <DashboardSummary result={result} pathCount={profile.assumptions.simulation.paths} />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        {view === 'editor' && (
          <div className="py-8">
            <ProfileEditor
              key={editorKey}
              initialProfile={profile}
              onApply={handleApply}
              onReset={handleReset}
              onScenarioSaved={handleScenarioSaved}
            />
          </div>
        )}
        {view === 'compare' && <ScenarioCompareView scenarios={scenarios} onScenariosChanged={refreshScenarios} />}
        {view === 'dashboard' && <DashboardView result={result} error={error} />}
      </main>

      <Disclaimer />
      {toast !== null && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  )
}

/** 操作の結果を短く返す通知。セーフエリアを考慮してモバイルの下端に固定する */
function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div className="flex max-w-lg items-start gap-3 rounded-sm border border-hairline-strong bg-ink px-4 py-3 text-sm text-page shadow-lg">
        <span className="leading-relaxed">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="通知を閉じる"
          className="-my-1 shrink-0 px-1 text-page/70 hover:text-page"
        >
          ×
        </button>
      </div>
    </div>
  )
}

function Disclaimer() {
  return (
    <footer className="mx-auto mt-10 max-w-5xl px-4 sm:px-6">
      <p className="border-t border-hairline pt-4 text-xs leading-relaxed text-ink-muted">
        免責事項: 本ツールは税務相談・投資助言ではありません。計算結果は各種制度の簡易モデルによる概算であり、正確性を保証しません。実際の税額・保険料・給付額は税理士・社会保険労務士等の専門家、または公的機関にご確認ください。
      </p>
    </footer>
  )
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`min-h-11 shrink-0 rounded-sm border px-4 py-2 text-sm sm:min-h-0 ${
        active ? 'border-ink bg-ink text-page' : 'border-hairline-strong text-ink-secondary hover:border-ink'
      }`}
    >
      {label}
    </button>
  )
}

function DashboardSummary({ result, pathCount }: { result: SimulationBundle; pathCount: number }) {
  const rows = result.deterministic.deterministic
  const finalRow = rows.at(-1)
  const firstRow = rows[0]
  return (
    <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
      {firstRow?.year}年〜{finalRow?.year}年、{rows.length}年間の家計を試算。モンテカルロは{pathCount.toLocaleString('ja-JP')}パスで実行。
    </p>
  )
}

function DashboardView({ result, error }: { result: SimulationBundle | null; error: string | null }) {
  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-ink-secondary">
        <p className="text-sm text-critical">{error}</p>
      </div>
    )
  }

  if (!result) return <ComputingNotice />


  const series = buildFanChartSeries(result)
  const rows = result.deterministic.deterministic
  const finalRow = rows.at(-1)
  const firstRow = rows[0]
  const medianFinal = series.percentiles[50].at(-1) ?? 0
  const sensitivityData = result.sensitivity.filter((s) => s.low !== s.high)

  return (
    <>
      <section className="grid grid-cols-2 gap-x-4 gap-y-6 py-8 sm:gap-6 lg:grid-cols-4">
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

      <section className="border-t border-hairline py-8 sm:py-10">
        <SectionHeading title="純資産の推移(ファンチャート)" note="毎年の純資産分布。帯が広いほど不確実性が高い年。" />
        <div className="mt-5 rounded-sm border border-hairline bg-surface p-3 sm:p-6">
          <FanChart data={series} />
        </div>
      </section>

      <section className="border-t border-hairline py-8 sm:py-10">
        <SectionHeading title="年次データ" note="ファンチャートの数値テーブル。" />
        <div className="mt-5">
          <DataTable data={series} />
        </div>
      </section>

      <section className="border-t border-hairline py-8 sm:py-10">
        <SectionHeading
          title="感度分析(トルネードチャート)"
          note="各前提を±1σ動かした場合の、最終年純資産中央値への影響。影響が大きい順。"
        />
        <div className="mt-5 rounded-sm border border-hairline bg-surface p-3 sm:p-6">
          <TornadoChart data={sensitivityData} baseline={medianFinal} factorLabel={(f) => FACTOR_LABELS[f] ?? f} />
        </div>
      </section>
    </>
  )
}

/**
 * 10,000パスのモンテカルロは環境によっては30秒近くかかる。無言で待たせると
 * 固まったのか進んでいるのか判断できないため、経過秒数を出して進行を示す。
 */
function ComputingNotice() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-ink-secondary"
    >
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-hairline-strong border-t-amber-500" />
      <p className="text-sm">シミュレーションを計算しています…</p>
      <p className="tabular text-xs text-ink-muted">
        経過 {seconds} 秒(試行数が多いほど時間がかかります。前提条件タブで調整できます)
      </p>
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
