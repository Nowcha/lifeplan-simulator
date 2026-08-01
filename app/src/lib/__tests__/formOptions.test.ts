import { describe, expect, test } from 'vitest'
import {
  DRAWDOWN_STRATEGY_HELP,
  EMPLOYMENT_TYPE_HELP,
  EMPLOYMENT_TYPE_OPTIONS,
} from '../formOptions'

describe('未対応機能の表示', () => {
  test('自営業の選択肢に未対応であることを表示する', () => {
    const selfEmployed = EMPLOYMENT_TYPE_OPTIONS.find((option) => option.value === 'self-employed')

    expect(selfEmployed?.label).toContain('未対応')
    expect(EMPLOYMENT_TYPE_HELP).toContain('計算できません')
  })

  test('取り崩し方式と値が現在の計算では未使用であることを表示する', () => {
    expect(DRAWDOWN_STRATEGY_HELP).toContain('現在の計算では使用しません')
  })
})
