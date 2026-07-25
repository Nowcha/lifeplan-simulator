import { describe, expect, test } from 'vitest'
import { categoryOfErrorPath, summarizeErrorCategories } from '../errorSummary'

describe('categoryOfErrorPath', () => {
  test('人物・子ども・自治体は「世帯構成」', () => {
    expect(categoryOfErrorPath('household.persons.0.birthYearMonth')).toBe('basics')
    expect(categoryOfErrorPath('household.children.1.birthYearMonth')).toBe('basics')
    expect(categoryOfErrorPath('household.municipality')).toBe('basics')
  })

  test('household配下の残り(支出・資産・貯蓄方針)は「支出・資産」', () => {
    expect(categoryOfErrorPath('household.baseExpenses.0.monthly')).toBe('finance')
    expect(categoryOfErrorPath('household.financialAssets.0.balance')).toBe('finance')
    expect(categoryOfErrorPath('household.savingsPolicy.cashBufferMonths')).toBe('finance')
  })

  test('events / assumptions はそれぞれのカテゴリ', () => {
    expect(categoryOfErrorPath('events.2.amount')).toBe('events')
    expect(categoryOfErrorPath('assumptions.simulation.paths')).toBe('assumptions')
  })

  test('プレフィックスは区切り単位で一致させる(householders のような別名を誤判定しない)', () => {
    expect(categoryOfErrorPath('householdExtra.foo')).toBeUndefined()
    expect(categoryOfErrorPath('household.personsExtra.0')).toBe('finance')
  })

  test('どれにも当てはまらないパスはundefined', () => {
    expect(categoryOfErrorPath('unknown.field')).toBeUndefined()
  })
})

describe('summarizeErrorCategories', () => {
  test('カテゴリごとに件数を集計する', () => {
    const paths = [
      'household.persons.0.birthYearMonth',
      'household.persons.1.retirementAge',
      'assumptions.simulation.paths',
    ]

    expect(summarizeErrorCategories(paths)).toEqual([
      { category: 'basics', count: 2 },
      { category: 'assumptions', count: 1 },
    ])
  })

  test('タブの並び順(世帯構成→支出・資産→ライフイベント→前提条件)で返す', () => {
    const paths = ['assumptions.a', 'events.b', 'household.baseExpenses.0.monthly', 'household.persons.0.x']

    expect(summarizeErrorCategories(paths).map((c) => c.category)).toEqual([
      'basics',
      'finance',
      'events',
      'assumptions',
    ])
  })

  test('エラーが無ければ空配列', () => {
    expect(summarizeErrorCategories([])).toEqual([])
  })

  test('分類できないパスは無視する', () => {
    expect(summarizeErrorCategories(['unknown.field'])).toEqual([])
  })
})
