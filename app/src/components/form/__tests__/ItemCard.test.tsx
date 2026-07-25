// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ItemCard } from '../fields'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** window.confirm の応答を固定し、渡された文面を記録する */
function stubConfirm(answer: boolean): { messages: string[] } {
  const messages: string[] = []
  vi.spyOn(window, 'confirm').mockImplementation((message?: string) => {
    messages.push(message ?? '')
    return answer
  })
  return { messages }
}

describe('ItemCard の削除確認', () => {
  test('確認でOKすると削除が実行される', async () => {
    stubConfirm(true)
    const onRemove = vi.fn()
    render(
      <ItemCard title="本人1" onRemove={onRemove}>
        <p>中身</p>
      </ItemCard>
    )

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  test('確認でキャンセルすると削除されない', async () => {
    stubConfirm(false)
    const onRemove = vi.fn()
    render(
      <ItemCard title="本人1" onRemove={onRemove}>
        <p>中身</p>
      </ItemCard>
    )

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(onRemove).not.toHaveBeenCalled()
  })

  test('確認文にカードの見出しと「元に戻せない」旨が入る', async () => {
    const confirmStub = stubConfirm(false)
    render(
      <ItemCard title="費目3" onRemove={vi.fn()}>
        <p>中身</p>
      </ItemCard>
    )

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(confirmStub.messages[0]).toContain('「費目3」を削除します')
    expect(confirmStub.messages[0]).toContain('元に戻せません')
  })

  test('参照がある場合は警告が確認文に足される', async () => {
    const confirmStub = stubConfirm(false)
    render(
      <ItemCard
        title="本人1"
        onRemove={vi.fn()}
        getRemoveWarning={() => 'この項目は次の1箇所から参照されています。\n\n・ライフイベント「出産1」の育休プラン1'}
      >
        <p>中身</p>
      </ItemCard>
    )

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(confirmStub.messages[0]).toContain('ライフイベント「出産1」の育休プラン1')
    expect(confirmStub.messages[0]).toContain('削除しますか?')
  })

  test('警告は削除ボタンを押したときに初めて評価される(常時計算しない)', async () => {
    stubConfirm(false)
    const getRemoveWarning = vi.fn(() => undefined)
    render(
      <ItemCard title="本人1" onRemove={vi.fn()} getRemoveWarning={getRemoveWarning}>
        <p>中身</p>
      </ItemCard>
    )

    // 描画しただけでは呼ばれない。全カードで常時走らせるとフォーム全体の
    // 走査が入力のたびに発生するため。
    expect(getRemoveWarning).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: '削除' }))

    expect(getRemoveWarning).toHaveBeenCalledTimes(1)
  })

  test('onRemove が無ければ削除ボタン自体を出さない', () => {
    render(
      <ItemCard title="本人1">
        <p>中身</p>
      </ItemCard>
    )

    expect(screen.queryByRole('button', { name: '削除' })).toBeNull()
  })
})
