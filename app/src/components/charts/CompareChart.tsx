import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { formatAxisYen, formatManYen } from '../../lib/format'
import { useContainerWidth } from '../../lib/useContainerWidth'
import { niceTicks, timeSeriesChartLayout, xTickInterval } from '../../lib/chartLayout'

export interface CompareSeries {
  id: string
  name: string
  color: string
  years: number[]
  netWorthByYear: number[]
}

interface CompareChartProps {
  series: CompareSeries[]
}

export function CompareChart({ series }: CompareChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [containerRef, containerWidth] = useContainerWidth<HTMLDivElement>()
  const years = series[0]?.years ?? []

  const { width: WIDTH, height: HEIGHT, margin: MARGIN, isNarrow, yTickCount, xTickCount } =
    timeSeriesChartLayout(containerWidth)
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom

  const { minY, maxY, x, y, yTicks } = useMemo(() => {
    const allValues = series.flatMap((s) => s.netWorthByYear).concat(0)
    const dataMin = Math.min(...allValues)
    const dataMax = Math.max(...allValues)
    const pad = (dataMax - dataMin) * 0.05 || 1
    const minY = dataMin - pad
    const maxY = dataMax + pad

    const xScale = (i: number): number => (years.length <= 1 ? 0 : (i / (years.length - 1)) * plotWidth)
    const yScale = (v: number): number => plotHeight - ((v - minY) / (maxY - minY)) * plotHeight

    return { minY, maxY, x: xScale, y: yScale, yTicks: niceTicks(minY, maxY, yTickCount) }
  }, [series, years.length, plotWidth, plotHeight, yTickCount])

  const linePath = (values: number[]): string => values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ')

  const xTickEvery = xTickInterval(years.length, xTickCount)
  const hovered = hoverIndex

  /** マウスはホバー、タッチはタップ/横スクラブ(縦スクロールは pan-y で維持) */
  function updateIndexFrom(e: ReactPointerEvent<SVGSVGElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH - MARGIN.left
    const idx = Math.round((relX / plotWidth) * (years.length - 1))
    setHoverIndex(Math.min(years.length - 1, Math.max(0, idx)))
  }

  if (series.length === 0) return <p className="text-sm text-ink-muted">比較するシナリオを選んでください。</p>

  return (
    <div className="viz-root" ref={containerRef}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="シナリオ間の純資産推移比較"
        className="w-full touch-pan-y"
        onPointerLeave={() => setHoverIndex(null)}
        onPointerDown={updateIndexFrom}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' || e.buttons > 0) updateIndexFrom(e)
        }}
      >
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={0} x2={plotWidth} y1={y(t)} y2={y(t)} stroke="var(--color-hairline)" strokeWidth={1} />
              <text x={-8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted text-[11px] tabular">
                {formatAxisYen(t, isNarrow)}
              </text>
            </g>
          ))}

          {minY < 0 && maxY > 0 && (
            <line x1={0} x2={plotWidth} y1={y(0)} y2={y(0)} stroke="var(--color-hairline-strong)" strokeWidth={1.5} />
          )}

          {series.map((s) => (
            <path key={s.id} d={linePath(s.netWorthByYear)} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinecap="round" />
          ))}

          {years.map((yr, i) =>
            i % xTickEvery === 0 ? (
              <text key={yr} x={x(i)} y={plotHeight + 20} textAnchor="middle" className="fill-ink-muted text-[11px] tabular">
                {yr}
              </text>
            ) : null
          )}

          {hovered !== null && (
            <g>
              <line x1={x(hovered)} x2={x(hovered)} y1={0} y2={plotHeight} stroke="var(--color-ink-muted)" strokeWidth={1} />
              {series.map((s) => {
                const v = s.netWorthByYear[hovered]
                if (v === undefined) return null
                return <circle key={s.id} cx={x(hovered)} cy={y(v)} r={3.5} fill={s.color} stroke="white" strokeWidth={1} />
              })}
            </g>
          )}

          <rect x={0} y={0} width={plotWidth} height={plotHeight} fill="transparent" />
        </g>
      </svg>

      {hovered !== null && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 border-t border-hairline pt-2 text-sm">
          <span className="font-medium text-ink tabular">{years[hovered]}年</span>
          {series.map((s) => {
            const v = s.netWorthByYear[hovered]
            if (v === undefined) return null
            return (
              <span key={s.id} className="inline-flex items-center gap-1.5 text-ink-secondary">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.name}
                <span className="tabular font-medium text-ink">{formatManYen(v)}</span>
              </span>
            )
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-secondary">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ background: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}
