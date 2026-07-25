// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import type { ProfileFormValues } from '../../../lib/profileStorage'
import { ExpenseLabelPicker } from '../pickers'

afterEach(cleanup)

/** 基本生活費だけを持つ最小フォームで、ピッカーの選択肢の作られ方を見る */
function Harness({
  labels,
  value,
  onChange
}: {
  labels: string[]
  value: string
  onChange: (v: string) => void
}) {
  const { control } = useForm({
    defaultValues: {
      household: { baseExpenses: labels.map((label) => ({ label })) }
    } as unknown as ProfileFormValues
  })
  return <ExpenseLabelPicker control={control} label="終了する費目" value={value} onChange={onChange} />
}

function optionTexts(): string[] {
  return [...screen.getByRole('combobox').querySelectorAll('option')].map((o) => o.textContent ?? '')
}

describe('ExpenseLabelPicker', () => {
  test('現在の費目名が選択肢になる', () => {
    render(<Harness labels={['住居費', '食費']} value="" onChange={vi.fn()} />)

    expect(optionTexts()).toEqual(['(選択してください)', '住居費', '食費'])
  })

  test('一覧に無い値は消さずに「存在しません」と明示して残す', () => {
    // 名前ベース参照なので、リネーム漏れや過去データで一覧外の値が残りうる。
    // 黙って選択解除すると参照が消えたことに気づけない。
    render(<Harness labels={['住居費', '食費']} value="旧・家賃" onChange={vi.fn()} />)

    expect(optionTexts()).toContain('旧・家賃(この費目は存在しません)')
    expect(screen.getByRole('combobox')).toHaveProperty('value', '旧・家賃')
  })

  test('一覧にある値なら「存在しません」は出ない', () => {
    render(<Harness labels={['住居費', '食費']} value="食費" onChange={vi.fn()} />)

    expect(optionTexts().some((t) => t.includes('存在しません'))).toBe(false)
  })

  test('同名の費目が複数あっても選択肢は重複しない', () => {
    render(<Harness labels={['住居費', '住居費', '食費']} value="" onChange={vi.fn()} />)

    expect(optionTexts()).toEqual(['(選択してください)', '住居費', '食費'])
  })

  test('名前が空の費目は選択肢に出さない', () => {
    render(<Harness labels={['住居費', '', '食費']} value="" onChange={vi.fn()} />)

    expect(optionTexts()).toEqual(['(選択してください)', '住居費', '食費'])
  })

  test('選択すると選んだ費目名を返す', async () => {
    const onChange = vi.fn()
    render(<Harness labels={['住居費', '食費']} value="" onChange={onChange} />)

    await userEvent.selectOptions(screen.getByRole('combobox'), '食費')

    expect(onChange).toHaveBeenCalledWith('食費')
  })
})
