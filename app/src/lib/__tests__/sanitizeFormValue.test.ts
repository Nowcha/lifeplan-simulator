import { describe, expect, test } from 'vitest'
import { sanitizeFormValue } from '../sanitizeFormValue'

describe('sanitizeFormValue', () => {
  test('空文字列はundefinedになり、オブジェクトのキーごと落ちる', () => {
    const result = sanitizeFormValue({ label: '食費', activeFrom: '' })

    expect(result).toEqual({ label: '食費' })
    expect('activeFrom' in result).toBe(false)
  })

  test('空白のみの文字列も未入力として扱う', () => {
    expect(sanitizeFormValue({ note: '   ' })).toEqual({})
  })

  test('NaNはundefinedになり、キーごと落ちる', () => {
    const result = sanitizeFormValue({ label: '教育費', monthly: Number.NaN })

    expect(result).toEqual({ label: '教育費' })
    expect('monthly' in result).toBe(false)
  })

  test('0・false・空文字でない文字列は有効な入力として残す', () => {
    // 0 と false を falsy として落とすと、意図的な「0円」「無効化」設定が消えてしまう
    expect(sanitizeFormValue({ monthly: 0, enabled: false, label: '0' })).toEqual({
      monthly: 0,
      enabled: false,
      label: '0',
    })
  })

  test('nullはそのまま残す(未入力ではなく明示的な値として扱う)', () => {
    expect(sanitizeFormValue({ override: null })).toEqual({ override: null })
  })

  test('ネストしたオブジェクト・配列を再帰的に処理する', () => {
    const input = {
      household: {
        persons: [
          { name: '本人', birthMonth: '1990-04' },
          { name: '配偶者', birthMonth: '' },
        ],
      },
    }

    expect(sanitizeFormValue(input)).toEqual({
      household: { persons: [{ name: '本人', birthMonth: '1990-04' }, { name: '配偶者' }] },
    })
  })

  test('配列内の空文字列要素は要素ごと取り除かれ、詰められる', () => {
    // 資産取り崩し順(string[])で未入力行が残ると、エンジンのID解決が空文字で失敗する
    expect(sanitizeFormValue(['cash', '', 'nisa'])).toEqual(['cash', 'nisa'])
  })

  test('数値の二次元配列(相関行列)はNaN要素だけが取り除かれる', () => {
    expect(sanitizeFormValue([[1, Number.NaN], [Number.NaN, 1]])).toEqual([[1], [1]])
  })

  test('実際にクラッシュを起こした形 — 未編集の任意項目が空文字で残った基本支出', () => {
    // RHFは未入力の任意項目を空文字列で保持するため、初回保存時にエンジンの
    // 厳密な YearMonth パースが落ちていた(このケースがsanitize導入の理由)
    const baseExpenses = [
      { label: '生活費', monthly: 250000, indexation: 'inflation', activeFrom: '', activeTo: '' },
    ]

    expect(sanitizeFormValue(baseExpenses)).toEqual([
      { label: '生活費', monthly: 250000, indexation: 'inflation' },
    ])
  })

  test('プリミティブはそのまま返す', () => {
    expect(sanitizeFormValue('2026-04')).toBe('2026-04')
    expect(sanitizeFormValue(42)).toBe(42)
    expect(sanitizeFormValue(undefined)).toBeUndefined()
  })

  test('入力オブジェクトを破壊せず、新しいオブジェクトを返す', () => {
    const input = { label: '食費', activeFrom: '' }
    const result = sanitizeFormValue(input)

    expect(input).toEqual({ label: '食費', activeFrom: '' })
    expect(result).not.toBe(input)
  })
})
