import { useMemo } from 'react'
import { formatAxisYen, formatManYen } from '../../lib/format'
import { useContainerWidth } from '../../lib/useContainerWidth'

export interface TornadoDatum {
  factor: string
  low: number
  high: number
}

interface TornadoChartProps {
  data: TornadoDatum[]
  /** 基準線(決定論パスの最終資産などの参照値) */
  baseline: number
  factorLabel: (factor: string) => string
}

const NARROW_BREAKPOINT = 560
const MIN_WIDTH = 280

/**
 * 狭い画面では要因名を棒の左に置けない(左余白140pxを確保すると棒がほぼ残らない)。
 * 名前を棒の上、金額を棒の下に積む縦積みレイアウトへ切り替える。
 */
function layoutFor(width: number): {
  margin: { top: number; right: number; bottom: number; left: number }
  rowHeight: number
  isNarrow: boolean
} {
  const isNarrow = width < NARROW_BREAKPOINT
  return {
    margin: isNarrow
      ? { top: 8, right: 8, bottom: 28, left: 8 }
      : { top: 8, right: 16, bottom: 28, left: 140 },
    rowHeight: isNarrow ? 68 : 44,
    isNarrow
  }
}

export function TornadoChart({ data, baseline, factorLabel }: TornadoChartProps) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => Math.abs(b.high - b.low) - Math.abs(a.high - a.low)),
    [data]
  )
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()

  const WIDTH = Math.max(MIN_WIDTH, containerWidth)
  const { margin: MARGIN, rowHeight: ROW_HEIGHT, isNarrow } = layoutFor(WIDTH)
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = sorted.length * ROW_HEIGHT
  const height = plotHeight + MARGIN.top + MARGIN.bottom

  const x = useMemo(() => {
    const values = sorted.flatMap((d) => [d.low, d.high, baseline])
    const dataMin = Math.min(...values)
    const dataMax = Math.max(...values)
    const pad = (dataMax - dataMin) * 0.1 || 1
    const minX = dataMin - pad
    const maxX = dataMax + pad
    return (v: number): number => ((v - minX) / (maxX - minX)) * plotWidth
  }, [sorted, baseline, plotWidth])

  if (sorted.length === 0) {
    return <p className="text-sm text-ink-muted">感度分析の対象となる確率変動要因がありません。</p>
  }

  return (
    <div className="viz-root" ref={containerRef}>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="感度分析(トルネードチャート)" className="w-full">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          <line x1={x(baseline)} x2={x(baseline)} y1={0} y2={plotHeight} stroke="var(--color-ink-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />

          {sorted.map((d, i) => {
            const rowTop = i * ROW_HEIGHT
            const rowY = isNarrow ? rowTop + 30 : rowTop + ROW_HEIGHT / 2
            const barLow = Math.min(d.low, d.high)
            const barHigh = Math.max(d.low, d.high)
            return (
              <g key={d.factor}>
                {isNarrow ? (
                  <text x={0} y={rowTop + 12} textAnchor="start" dominantBaseline="middle" className="fill-ink text-[13px]">
                    {factorLabel(d.factor)}
                  </text>
                ) : (
                  <text x={-12} y={rowY} textAnchor="end" dominantBaseline="middle" className="fill-ink text-[13px]">
                    {factorLabel(d.factor)}
                  </text>
                )}
                <line x1={x(barLow)} x2={x(barHigh)} y1={rowY} y2={rowY} stroke="var(--color-amber-300)" strokeWidth={14} strokeLinecap="round" />
                <circle cx={x(d.low)} cy={rowY} r={4} fill="var(--color-ink-secondary)" />
                <circle cx={x(d.high)} cy={rowY} r={4} fill="var(--color-amber-700)" />
                {isNarrow ? (
                  <>
                    {/* 棒の外側に置くと画面端で切れるため、狭い画面では真下に回す */}
                    <text x={x(barLow)} y={rowY + 20} textAnchor="start" dominantBaseline="middle" className="fill-ink-secondary text-[11px] tabular">
                      {formatAxisYen(d.low, true)}
                    </text>
                    <text x={x(barHigh)} y={rowY + 20} textAnchor="end" dominantBaseline="middle" className="fill-ink-secondary text-[11px] tabular">
                      {formatAxisYen(d.high, true)}
                    </text>
                  </>
                ) : (
                  <>
                    <text x={x(barLow) - 8} y={rowY} textAnchor="end" dominantBaseline="middle" className="fill-ink-secondary text-[11px] tabular">
                      {formatManYen(d.low)}
                    </text>
                    <text x={x(barHigh) + 8} y={rowY} textAnchor="start" dominantBaseline="middle" className="fill-ink-secondary text-[11px] tabular">
                      {formatManYen(d.high)}
                    </text>
                  </>
                )}
              </g>
            )
          })}

          <text x={x(baseline)} y={plotHeight + 20} textAnchor="middle" className="fill-ink-muted text-[11px] tabular">
            基準 {isNarrow ? formatAxisYen(baseline, true) : formatManYen(baseline)}
          </text>
        </g>
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-ink-secondary" /> -1σ想定
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-700" /> +1σ想定
        </span>
      </div>
    </div>
  )
}
