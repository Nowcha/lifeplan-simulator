/**
 * チャートのレスポンシブ方針を1箇所に集約する。
 *
 * SVGの viewBox は実ピクセル幅と1:1にする前提。固定幅のviewBoxを縮小表示すると
 * 軸ラベルまで一緒に縮み、375px幅では実効3.3pxになって読めなくなるため。
 * 幅に応じて余白・高さ・目盛り本数を切り替える判断をここで持つ。
 */

export interface ChartMargin {
  top: number
  right: number
  bottom: number
  left: number
}

/** これ以下を「狭い画面」として扱う */
export const NARROW_BREAKPOINT = 560

/** 計測前(width=0)や極端に狭いコンテナでも破綻しないための下限 */
export const MIN_CHART_WIDTH = 280

export interface TimeSeriesChartLayout {
  width: number
  height: number
  margin: ChartMargin
  isNarrow: boolean
  /** y軸の目盛り本数の目安(niceTicks に渡す) */
  yTickCount: number
  /** x軸に出すラベルの最大本数 */
  xTickCount: number
}

/** 折れ線・帯グラフ(ファンチャート / シナリオ比較)の寸法 */
export function timeSeriesChartLayout(containerWidth: number): TimeSeriesChartLayout {
  const width = Math.max(MIN_CHART_WIDTH, containerWidth)
  const isNarrow = width < NARROW_BREAKPOINT
  return {
    width,
    height: isNarrow ? 260 : 380,
    margin: isNarrow
      ? { top: 12, right: 8, bottom: 28, left: 48 }
      : { top: 16, right: 16, bottom: 32, left: 72 },
    isNarrow,
    yTickCount: isNarrow ? 4 : 5,
    xTickCount: isNarrow ? 4 : 8
  }
}

export interface TornadoChartLayout {
  width: number
  margin: ChartMargin
  rowHeight: number
  isNarrow: boolean
}

/**
 * トルネードチャートの寸法。狭い画面では要因名を棒の左に置けない
 * (左余白140pxを確保すると棒がほとんど残らない)ため、名前を棒の上・
 * 金額を棒の下に積む縦積みへ切り替える。行の高さが変わるのはそのため。
 */
export function tornadoChartLayout(containerWidth: number): TornadoChartLayout {
  const width = Math.max(MIN_CHART_WIDTH, containerWidth)
  const isNarrow = width < NARROW_BREAKPOINT
  return {
    width,
    margin: isNarrow
      ? { top: 8, right: 8, bottom: 28, left: 8 }
      : { top: 8, right: 16, bottom: 28, left: 140 },
    rowHeight: isNarrow ? 68 : 44,
    isNarrow
  }
}

/**
 * 目盛りとして「切りのいい」値を返す。刻み幅は 1/2/5/10 × 10^n から選ぶ。
 * `count` は本数の目安であって厳密な本数ではない(切りのよさを優先する)。
 */
export function niceTicks(min: number, max: number, count: number): number[] {
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

/** 何本おきにx軸ラベルを出すか(全部出すと狭い画面で重なるため間引く) */
export function xTickInterval(pointCount: number, maxLabels: number): number {
  return Math.max(1, Math.ceil(pointCount / maxLabels))
}
