import { describe, expect, test } from 'vitest'
import type { FieldErrors } from 'react-hook-form'
import { collectErrorPaths, fieldErrorMessage } from '../fieldError'

/** RHFのerrorsツリーを模したもの(配列フィールドは添字キーを持つ配列になる) */
const errors = {
  household: {
    municipality: { type: 'validate', message: '入力してください' },
    persons: [
      { birthYearMonth: { type: 'validate', message: 'YYYY-MM の形式で入力してください' } },
      undefined,
      { retirementAge: { type: 'validate', message: '数値を入力してください' } },
    ],
  },
  assumptions: {
    simulation: { paths: { type: 'validate', message: '1以上で入力してください' } },
  },
} as unknown as FieldErrors

describe('fieldErrorMessage', () => {
  test('ネストしたパスのメッセージを引ける', () => {
    expect(fieldErrorMessage(errors, 'household.municipality')).toBe('入力してください')
    expect(fieldErrorMessage(errors, 'assumptions.simulation.paths')).toBe('1以上で入力してください')
  })

  test('配列の添字を含むパスを引ける', () => {
    expect(fieldErrorMessage(errors, 'household.persons.0.birthYearMonth')).toBe('YYYY-MM の形式で入力してください')
    expect(fieldErrorMessage(errors, 'household.persons.2.retirementAge')).toBe('数値を入力してください')
  })

  test('エラーの無いパスはundefined', () => {
    expect(fieldErrorMessage(errors, 'household.persons.1.birthYearMonth')).toBeUndefined()
    expect(fieldErrorMessage(errors, 'household.children.0.birthYearMonth')).toBeUndefined()
    expect(fieldErrorMessage(errors, 'events.0.type')).toBeUndefined()
  })

  test('途中がオブジェクトでないパスでも例外を投げない', () => {
    expect(fieldErrorMessage(errors, 'household.municipality.message.deeper')).toBeUndefined()
  })

  test('errorsが空なら常にundefined', () => {
    expect(fieldErrorMessage({}, 'household.municipality')).toBeUndefined()
  })
})

describe('collectErrorPaths', () => {
  test('エラーのある葉のパスをすべて列挙する', () => {
    expect(collectErrorPaths(errors).sort()).toEqual(
      [
        'assumptions.simulation.paths',
        'household.municipality',
        'household.persons.0.birthYearMonth',
        'household.persons.2.retirementAge',
      ].sort()
    )
  })

  test('エラーが無ければ空配列', () => {
    expect(collectErrorPaths({})).toEqual([])
  })

  test('葉に到達したらそれ以上潜らない(message配下を列挙しない)', () => {
    const paths = collectErrorPaths(errors)

    expect(paths.some((p) => p.includes('.message'))).toBe(false)
    expect(paths.some((p) => p.includes('.type'))).toBe(false)
  })
})
