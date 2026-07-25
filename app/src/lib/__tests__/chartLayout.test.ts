import { describe, expect, test } from 'vitest'
import {
  MIN_CHART_WIDTH,
  NARROW_BREAKPOINT,
  niceTicks,
  timeSeriesChartLayout,
  tornadoChartLayout,
  xTickInterval,
} from '../chartLayout'

describe('timeSeriesChartLayout', () => {
  test('viewBoxの幅はコンテナの実幅と1:1にする', () => {
    // 縮小表示すると軸ラベルまで縮んで読めなくなるため、等倍が前提
    expect(timeSeriesChartLayout(920).width).toBe(920)
    expect(timeSeriesChartLayout(375).width).toBe(375)
  })

  test('計測前(0)や極端に狭い場合は下限で止める', () => {
    expect(timeSeriesChartLayout(0).width).toBe(MIN_CHART_WIDTH)
    expect(timeSeriesChartLayout(100).width).toBe(MIN_CHART_WIDTH)
  })

  test('ブレークポイント境界: 未満は狭い、ちょうどは広い', () => {
    expect(timeSeriesChartLayout(NARROW_BREAKPOINT - 1).isNarrow).toBe(true)
    expect(timeSeriesChartLayout(NARROW_BREAKPOINT).isNarrow).toBe(false)
  })

  test('狭い画面は高さを詰め、左余白も削る', () => {
    const narrow = timeSeriesChartLayout(375)
    const wide = timeSeriesChartLayout(920)

    expect(narrow.height).toBeLessThan(wide.height)
    expect(narrow.margin.left).toBeLessThan(wide.margin.left)
  })

  test('狭い画面では目盛りを減らす(重なりを避ける)', () => {
    const narrow = timeSeriesChartLayout(375)
    const wide = timeSeriesChartLayout(920)

    expect(narrow.yTickCount).toBeLessThan(wide.yTickCount)
    expect(narrow.xTickCount).toBeLessThan(wide.xTickCount)
  })

  test('描画領域は下限幅でも正の値を保つ', () => {
    const layout = timeSeriesChartLayout(0)
    const plotWidth = layout.width - layout.margin.left - layout.margin.right

    expect(plotWidth).toBeGreaterThan(0)
    expect(layout.height - layout.margin.top - layout.margin.bottom).toBeGreaterThan(0)
  })
})

describe('tornadoChartLayout', () => {
  test('広い画面は要因名を棒の左に置くための余白を確保する', () => {
    expect(tornadoChartLayout(920).margin.left).toBe(140)
  })

  test('狭い画面は左余白を削り、行を高くして縦積みにする', () => {
    const narrow = tornadoChartLayout(375)
    const wide = tornadoChartLayout(920)

    expect(narrow.margin.left).toBeLessThan(wide.margin.left)
    expect(narrow.rowHeight).toBeGreaterThan(wide.rowHeight)
  })

  test('狭い画面でも棒を描く幅が残る(左余白140pxのままだと潰れる)', () => {
    const layout = tornadoChartLayout(375)
    const plotWidth = layout.width - layout.margin.left - layout.margin.right

    expect(plotWidth).toBeGreaterThan(300)
  })

  test('時系列チャートと同じブレークポイントで切り替わる', () => {
    expect(tornadoChartLayout(NARROW_BREAKPOINT - 1).isNarrow).toBe(true)
    expect(tornadoChartLayout(NARROW_BREAKPOINT).isNarrow).toBe(false)
  })
})

describe('niceTicks', () => {
  test('切りのいい刻みを返す', () => {
    expect(niceTicks(0, 100, 5)).toEqual([0, 20, 40, 60, 80, 100])
  })

  test('目盛りはすべて範囲内に収まる', () => {
    const ticks = niceTicks(-1_400_000, 297_000_000, 4)

    for (const tick of ticks) {
      expect(tick).toBeGreaterThanOrEqual(-1_400_000)
      expect(tick).toBeLessThanOrEqual(297_000_000)
    }
  })

  test('負から正にまたがる範囲でも0を含む', () => {
    expect(niceTicks(-50, 50, 4)).toContain(0)
  })

  test('min===max は1本だけ返す(0除算やゼロ幅レンジで壊れない)', () => {
    expect(niceTicks(42, 42, 5)).toEqual([42])
  })

  test('count を増やすと目盛りは減らない', () => {
    const few = niceTicks(0, 1000, 3)
    const many = niceTicks(0, 1000, 10)

    expect(many.length).toBeGreaterThanOrEqual(few.length)
  })

  test('狭い画面の実データ相当で2本まで減らない(帯が読めなくなる)', () => {
    // 実測時に count=3 だと 0 と 2億 の2本しか出ずスカスカだったため 4 にした経緯がある
    const layout = timeSeriesChartLayout(375)
    const ticks = niceTicks(-14_000_000, 297_000_000, layout.yTickCount)

    expect(ticks.length).toBeGreaterThanOrEqual(3)
  })
})

describe('xTickInterval', () => {
  test('本数が上限以下ならすべて出す', () => {
    expect(xTickInterval(4, 8)).toBe(1)
    expect(xTickInterval(8, 8)).toBe(1)
  })

  test('上限を超えたら間引く', () => {
    // 31年分を狭い画面(最大4本)に出すなら8年おき
    expect(xTickInterval(31, 4)).toBe(8)
    expect(xTickInterval(31, 8)).toBe(4)
  })

  test('0件でも1以上を返す(剰余演算の除数に使うため)', () => {
    expect(xTickInterval(0, 4)).toBe(1)
  })
})
