// @vitest-environment jsdom
import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import type { ReactNode } from 'react'
import { NumberInput, TextInput } from '../fields'
import { numberRules, requiredTextRules } from '../../../lib/validation'

afterEach(cleanup)

interface FormValues {
  label: string
  monthly: number
}

/**
 * 各入力は register() の展開で name を受け取り、FormProvider から自分のエラーを
 * 自分で引く。呼び出し側で errors を配線しない設計なので、この仕組みが壊れると
 * 106箇所すべての検証表示が黙って消える。
 */
function Harness({ children }: { children: (form: ReturnType<typeof useForm<FormValues>>) => ReactNode }) {
  const form = useForm<FormValues>({ defaultValues: { label: '食費', monthly: 1000 } })
  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(() => {})}>
        {children(form)}
        <button type="submit">送信</button>
      </form>
    </FormProvider>
  )
}

describe('フィールドのエラー表示', () => {
  test('必須テキストを空にして送信するとエラーが出る', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        {(form) => <TextInput label="項目名" {...form.register('label', requiredTextRules)} />}
      </Harness>
    )

    await user.clear(screen.getByLabelText('項目名'))
    await user.click(screen.getByRole('button', { name: '送信' }))

    expect(await screen.findByText('入力してください')).toBeDefined()
  })

  test('数値を空にすると「数値を入力してください」が出る(NaNをrequiredが素通しする問題の回帰)', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        {(form) => <NumberInput label="月額" {...form.register('monthly', numberRules({ min: 0 }))} />}
      </Harness>
    )

    await user.clear(screen.getByLabelText('月額'))
    await user.click(screen.getByRole('button', { name: '送信' }))

    expect(await screen.findByText('数値を入力してください')).toBeDefined()
  })

  test('下限を下回るとその旨が出る', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        {(form) => <NumberInput label="月額" {...form.register('monthly', numberRules({ min: 0 }))} />}
      </Harness>
    )

    const input = screen.getByLabelText('月額')
    await user.clear(input)
    await user.type(input, '-5')
    await user.click(screen.getByRole('button', { name: '送信' }))

    expect(await screen.findByText('0以上で入力してください')).toBeDefined()
  })

  test('エラーが無いときは hint が出る', () => {
    render(
      <Harness>
        {(form) => <TextInput label="項目名" hint="表示名として使われます" {...form.register('label')} />}
      </Harness>
    )

    expect(screen.getByText('表示名として使われます')).toBeDefined()
  })

  test('エラーが出ると hint はエラーに置き換わる', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        {(form) => (
          <TextInput label="項目名" hint="表示名として使われます" {...form.register('label', requiredTextRules)} />
        )}
      </Harness>
    )

    // hint も同じ <label> の中にあるため、アクセシブル名は「項目名 …」になる。
    // 現状のマークアップに合わせて部分一致で引く。
    await user.clear(screen.getByRole('textbox', { name: /項目名/ }))
    await user.click(screen.getByRole('button', { name: '送信' }))

    await waitFor(() => expect(screen.getByText('入力してください')).toBeDefined())
    expect(screen.queryByText('表示名として使われます')).toBeNull()
  })

  test('明示的な error プロパティはフォーム状態より優先される', () => {
    render(
      <Harness>
        {(form) => <TextInput label="項目名" error="外から渡したエラー" {...form.register('label')} />}
      </Harness>
    )

    expect(screen.getByText('外から渡したエラー')).toBeDefined()
  })

  test('エラーは該当フィールドにだけ出る(他フィールドに漏れない)', async () => {
    const user = userEvent.setup()
    render(
      <Harness>
        {(form) => (
          <>
            <TextInput label="項目名" {...form.register('label', requiredTextRules)} />
            <NumberInput label="月額" {...form.register('monthly', numberRules({ min: 0 }))} />
          </>
        )}
      </Harness>
    )

    await user.clear(screen.getByLabelText('項目名'))
    await user.click(screen.getByRole('button', { name: '送信' }))

    await waitFor(() => expect(screen.getAllByText('入力してください')).toHaveLength(1))
  })
})
