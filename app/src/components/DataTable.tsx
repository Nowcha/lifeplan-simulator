import { formatManYen } from '../lib/format'
import type { FanChartSeries } from './charts/FanChart'
import { MaterialIcon } from './form/MaterialIcon'

interface DataTableProps {
  data: FanChartSeries
}

/** ファンチャートの数値テーブル版(dataviz: グラフには必ずテーブル代替を用意する) */
export function DataTable({ data }: DataTableProps) {
  const { years, percentiles, deterministic } = data

  return (
    <>
      {/* 狭い画面では表が横にはみ出す。スクロールできることを明示しないと列の存在に気づけない */}
      <p className="mb-2 flex items-center gap-1 text-xs text-ink-muted sm:hidden">
        <MaterialIcon name="arrow_back" />
        横にスクロールすると全ての列を表示できます
      </p>
      <div className="max-h-80 overflow-auto border border-hairline">
      <table className="w-full min-w-[640px] border-collapse text-sm whitespace-nowrap">
        <thead className="sticky top-0 bg-surface-2 text-xs text-ink-secondary">
          <tr>
            <th className="px-3 py-2 text-left font-medium">年</th>
            <th className="px-3 py-2 text-right font-medium">p10</th>
            <th className="px-3 py-2 text-right font-medium">p25</th>
            <th className="px-3 py-2 text-right font-medium">p50(中央値)</th>
            <th className="px-3 py-2 text-right font-medium">p75</th>
            <th className="px-3 py-2 text-right font-medium">p90</th>
            <th className="px-3 py-2 text-right font-medium">決定論パス</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {years.map((year, i) => (
            <tr key={year} className="border-t border-hairline">
              <td className="px-3 py-1.5 text-ink">{year}</td>
              <td className="px-3 py-1.5 text-right text-ink-secondary">{formatManYen(percentiles[10][i] ?? 0)}</td>
              <td className="px-3 py-1.5 text-right text-ink-secondary">{formatManYen(percentiles[25][i] ?? 0)}</td>
              <td className="px-3 py-1.5 text-right font-medium text-ink">{formatManYen(percentiles[50][i] ?? 0)}</td>
              <td className="px-3 py-1.5 text-right text-ink-secondary">{formatManYen(percentiles[75][i] ?? 0)}</td>
              <td className="px-3 py-1.5 text-right text-ink-secondary">{formatManYen(percentiles[90][i] ?? 0)}</td>
              <td className="px-3 py-1.5 text-right text-ink-secondary">{formatManYen(deterministic[i] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-ink-muted">
        p10〜p90 は試行を良い順に並べたときの位置。p10 は「悪い方から10%目」(悲観側)、p50
        は真ん中、p90 は「良い方から10%目」(楽観側)。決定論パスは変動を考えず期待値どおりに推移した場合。
      </p>
    </>
  )
}
