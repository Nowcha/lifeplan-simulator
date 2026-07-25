import { describe, expect, test } from 'vitest'
import {
  EMPTY_MESSAGE,
  NOT_A_NUMBER_MESSAGE,
  YEAR_MONTH_FORMAT_MESSAGE,
  numberRules,
  optionalNumberRules,
  validateNumber,
  validateOptionalNumber,
  validateOptionalYearMonth,
  validateRequiredText,
  validateYearMonth,
} from '../validation'

describe('validateNumber', () => {
  test('有限数は通す', () => {
    expect(validateNumber(0)).toBe(true)
    expect(validateNumber(-1.5)).toBe(true)
  })

  test('空欄の数値入力(NaN)を弾く', () => {
    // valueAsNumber を付けた input を空にするとNaNになる。RHFの required は
    // これを素通しするため、ここで止められないと空欄のまま送信できてしまう
    expect(validateNumber(Number.NaN)).toBe(NOT_A_NUMBER_MESSAGE)
  })

  test('undefined・文字列・Infinityを弾く', () => {
    expect(validateNumber(undefined)).toBe(NOT_A_NUMBER_MESSAGE)
    expect(validateNumber('100')).toBe(NOT_A_NUMBER_MESSAGE)
    expect(validateNumber(Number.POSITIVE_INFINITY)).toBe(NOT_A_NUMBER_MESSAGE)
  })

  test('min / max の境界は含む', () => {
    expect(validateNumber(0, { min: 0 })).toBe(true)
    expect(validateNumber(-1, { min: 0 })).toBe('0以上で入力してください')
    expect(validateNumber(120, { max: 120 })).toBe(true)
    expect(validateNumber(121, { max: 120 })).toBe('120以下で入力してください')
  })

  test('integer指定で小数を弾く', () => {
    expect(validateNumber(30, { integer: true })).toBe(true)
    expect(validateNumber(30.5, { integer: true })).toBe('整数で入力してください')
  })
})

describe('validateOptionalNumber', () => {
  test('空欄(NaN・undefined)は許可する', () => {
    expect(validateOptionalNumber(Number.NaN)).toBe(true)
    expect(validateOptionalNumber(undefined)).toBe(true)
  })

  test('入力があるときは範囲を検証する', () => {
    expect(validateOptionalNumber(-1, { min: 0 })).toBe('0以上で入力してください')
    expect(validateOptionalNumber(5, { min: 0 })).toBe(true)
  })
})

describe('validateYearMonth', () => {
  test('YYYY-MM 形式を通す', () => {
    expect(validateYearMonth('2026-01')).toBe(true)
    expect(validateYearMonth('1990-12')).toBe(true)
  })

  test('空欄は未入力エラー', () => {
    expect(validateYearMonth('')).toBe(EMPTY_MESSAGE)
    expect(validateYearMonth('   ')).toBe(EMPTY_MESSAGE)
    expect(validateYearMonth(undefined)).toBe(EMPTY_MESSAGE)
  })

  test('月が範囲外・桁数違いは形式エラー', () => {
    expect(validateYearMonth('2026-00')).toBe(YEAR_MONTH_FORMAT_MESSAGE)
    expect(validateYearMonth('2026-13')).toBe(YEAR_MONTH_FORMAT_MESSAGE)
    expect(validateYearMonth('2026-1')).toBe(YEAR_MONTH_FORMAT_MESSAGE)
    expect(validateYearMonth('2026/01')).toBe(YEAR_MONTH_FORMAT_MESSAGE)
  })
})

describe('validateOptionalYearMonth', () => {
  test('空欄は許可し、入力があれば形式を見る', () => {
    expect(validateOptionalYearMonth('')).toBe(true)
    expect(validateOptionalYearMonth('2026-01')).toBe(true)
    expect(validateOptionalYearMonth('2026-13')).toBe(YEAR_MONTH_FORMAT_MESSAGE)
  })
})

describe('validateRequiredText', () => {
  test('空文字・空白のみを弾く', () => {
    expect(validateRequiredText('')).toBe(EMPTY_MESSAGE)
    expect(validateRequiredText('  ')).toBe(EMPTY_MESSAGE)
  })

  test('文字が入っていれば通す', () => {
    expect(validateRequiredText('食費')).toBe(true)
  })
})

describe('register用ルールオブジェクト', () => {
  test('numberRules は valueAsNumber を必ず立てる', () => {
    // これが無いと文字列のまま渡り、validateNumber が常に失敗する
    expect(numberRules().valueAsNumber).toBe(true)
    expect(optionalNumberRules().valueAsNumber).toBe(true)
  })

  test('numberRules の validate に options が反映される', () => {
    expect(numberRules({ min: 0 }).validate(-1)).toBe('0以上で入力してください')
  })
})
