// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { UndoProvider } from '../undo'
import { useUndo } from '../undoContext'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function Harness({ onUndo }: { onUndo: () => void }) {
  return (
    <UndoProvider>
      {(banner) => (
        <>
          {banner}
          <Trigger onUndo={onUndo} />
        </>
      )}
    </UndoProvider>
  )
}

function Trigger({ onUndo }: { onUndo: () => void }) {
  const { pushUndo } = useUndo()
  return (
    <button type="button" onClick={() => pushUndo('「本人2」を削除しました。', onUndo)}>
      削除する
    </button>
  )
}

describe('UndoProvider', () => {
  test('何も起きていなければバナーは出ない', () => {
    render(<Harness onUndo={vi.fn()} />)

    expect(screen.queryByRole('status')).toBeNull()
  })

  test('pushUndo で渡したメッセージがそのまま出る', async () => {
    render(<Harness onUndo={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(screen.getByRole('status').textContent).toContain('「本人2」を削除しました。')
  })

  test('「元に戻す」で渡した関数が呼ばれ、バナーが消える', async () => {
    const onUndo = vi.fn()
    render(<Harness onUndo={onUndo} />)

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    await userEvent.click(screen.getByRole('button', { name: '元に戻す' }))

    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('一定時間で申し出は取り下げられる(フォームの状態と食い違わせないため)', async () => {
    // setTimeout/clearTimeout だけを差し替える。全タイマーを偽装すると React の
    // スケジューラ(MessageChannel)まで止まり、描画が進まなくなる。
    // クリックも userEvent ではなく fireEvent を使う(userEvent は内部で
    // 独自のディレイを挟むため、偽タイマー下で噛み合わない)。
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const onUndo = vi.fn()
    render(<Harness onUndo={onUndo} />)

    fireEvent.click(screen.getByRole('button', { name: '削除する' }))
    expect(screen.getByRole('status')).toBeDefined()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(13_000)
    })

    expect(screen.queryByRole('status')).toBeNull()
    expect(onUndo).not.toHaveBeenCalled()
  })

  test('新しい操作は前の申し出を置き換える(戻せるのは常に直前の1件)', async () => {
    render(<Harness onUndo={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))
    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  test('Provider の外では pushUndo が no-op(削除自体は成立させる)', async () => {
    const onUndo = vi.fn()
    render(<Trigger onUndo={onUndo} />)

    await userEvent.click(screen.getByRole('button', { name: '削除する' }))

    expect(screen.queryByRole('status')).toBeNull()
  })
})
