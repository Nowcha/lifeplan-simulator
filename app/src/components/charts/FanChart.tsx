import { useMemo, useState } from 'react'
import { formatManYen } from '../../lib/format'

export interface FanChartSeries {
  years: number[]
  /** percentile → year-indexed net worth */
  percentiles: Record<10 | 25 | 50 | 75 | 90, number[]>
  /** 決定論パス(期待値)の参考線 */
  deterministic: number[]
}

interface FanChartProps {
  data: FanChartSeries
}

const MARGIN = { top: 16, right: 16, bottom: 32, left: 72 }
const WIDTH = 920
const HEIGHT = 380

function niceTicks(min: number, max: number, count: number): number[] {
  if (min === max) return [min]
  const rawStep = (max - min) / count
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const residual = rawStep / magnitude
  const step = (residual > 5 ? 10 : residual > 2 ? 5 : residual > 1 ? 2 : 1) * magnitude
  const start = Math.ceil(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max; v += step) ticks.push(v)
  return ticks
}

export function FanChart({ data }: FanChartProps) {
  const { years, percentiles, deterministic } = data
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom

  const { minY, maxY, x, y, yTicks } = useMemo(() => {
    const allValues = [...percentiles[10], ...percentiles[90], ...deterministic, 0]
    const dataMin = Math.min(...allValues)
    const dataMax = Math.max(...allValues)
    const pad = (dataMax - dataMin) * 0.05 || 1
    const minY = dataMin - pad
    const maxY = dataMax + pad

    const xScale = (i: number): number => (years.length <= 1 ? 0 : (i / (years.length - 1)) * plotWidth)
    const yScale = (v: number): number => plotHeight - ((v - minY) / (maxY - minY)) * plotHeight

    return { minY, maxY, x: xScale, y: yScale, yTicks: niceTicks(minY, maxY, 5) }
  }, [years.length, percentiles, deterministic, plotWidth, plotHeight])

  /** lower境界を左→右、upper境界を右→左でたどって囲む帯領域のpathを作る */
  const bandPath = (lower: number[], upper: number[]): string => {
    const forward = lower.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')
    const backward = upper
      .map((v, i) => `L ${x(i)} ${y(v)}`)
      .reverse()
      .join(' ')
    return `${forward} ${backward} Z`
  }

  const linePath = (values: number[]): string =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')

  const xTickEvery = Math.max(1, Math.ceil(years.length / 8))
  const hovered = hoverIndex !== null ? hoverIndex : null

  return (
    <div className="viz-root">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="世帯の純資産推移の確率分布(ファンチャート)"
        className="w-full"
        onMouseLeave={() => setHoverIndex(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const relX = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left
          const idx = Math.round((relX / plotWidth) * (years.length - 1))
          setHoverIndex(Math.min(years.length - 1, Math.max(0, idx)))
        }}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {/* gridlines + y axis labels */}
          {yTicks.map((t) => (
            <g key={t}>
              <line
                x1={0}
                x2={plotWidth}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-hairline)"
                strokeWidth={1}
              />
              <text x={-10} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted text-[11px] tabular">
                {formatManYen(t)}
              </text>
            </g>
          ))}

          {/* zero baseline, emphasized */}
          {minY < 0 && maxY > 0 && (
            <line x1={0} x2={plotWidth} y1={y(0)} y2={y(0)} stroke="var(--color-hairline-strong)" strokeWidth={1.5} />
          )}

          {/* p10-p90 band */}
          <path d={bandPath(percentiles[10], percentiles[90])} fill="var(--color-amber-100)" />
          {/* p25-p75 band */}
          <path d={bandPath(percentiles[25], percentiles[75])} fill="var(--color-amber-300)" />

          {/* deterministic reference line */}
          <path d={linePath(deterministic)} fill="none" stroke="var(--color-ink-secondary)" strokeWidth={1.5} strokeDasharray="4 3" />

          {/* median (p50) */}
          <path d={linePath(percentiles[50])} fill="none" stroke="var(--color-amber-700)" strokeWidth={2.5} strokeLinecap="round" />

          {/* x axis */}
          {years.map((yr, i) =>
            i % xTickEvery === 0 ? (
              <text key={yr} x={x(i)} y={plotHeight + 20} textAnchor="middle" className="fill-ink-muted text-[11px] tabular">
                {yr}
              </text>
            ) : null
          )}

          {/* hover layer */}
          {hovered !== null && (
            <g>
              <line x1={x(hovered)} x2={x(hovered)} y1={0} y2={plotHeight} stroke="var(--color-ink-muted)" strokeWidth={1} />
              {[percentiles[10][hovered], percentiles[50][hovered], percentiles[90][hovered], deterministic[hovered]].map(
                (v, i) =>
                  v !== undefined && (
                    <circle key={i} cx={x(hovered)} cy={y(v)} r={3} fill="var(--color-amber-700)" stroke="white" strokeWidth={1} />
                  )
              )}
            </g>
          )}

          <rect x={0} y={0} width={plotWidth} height={plotHeight} fill="transparent" />
        </g>
      </svg>

      {hovered !== null && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-hairline pt-2 text-sm">
          <span className="font-medium text-ink tabular">{years[hovered]}年</span>
          <TooltipStat label="p10" value={percentiles[10][hovered]} swatch="var(--color-amber-100)" />
          <TooltipStat label="p50(中央値)" value={percentiles[50][hovered]} swatch="var(--color-amber-700)" />
          <TooltipStat label="p90" value={percentiles[90][hovered]} swatch="var(--color-amber-100)" />
          <TooltipStat label="決定論パス" value={deterministic[hovered]} swatch="var(--color-ink-secondary)" dashed />
        </div>
      )}

      <Legend />
    </div>
  )
}

function TooltipStat({
  label,
  value,
  swatch,
  dashed = false,
}: {
  label: string
  value: number | undefined
  swatch: string
  dashed?: boolean
}) {
  if (value === undefined) return null
  return (
    <span className="inline-flex items-center gap-1.5 text-ink-secondary">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: dashed ? 'transparent' : swatch, border: dashed ? `1.5px dashed ${swatch}` : 'none' }}
      />
      {label}
      <span className="tabular font-medium text-ink">{formatManYen(value)}</span>
    </span>
  )
}

function Legend() {
  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-secondary">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" /> p10–p90
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-300" /> p25–p75
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3.5 rounded-full bg-amber-700" /> 中央値(p50)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-0 w-3.5 border-t-[1.5px] border-dashed border-ink-secondary" /> 決定論パス
      </span>
    </div>
  )
}
