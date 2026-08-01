// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AddButton, HelpBadge } from '../fields'
import { MaterialIcon } from '../MaterialIcon'

afterEach(cleanup)

describe('MaterialIcon', () => {
  test('Google FontsのMaterial Symbolsクラスで装飾アイコンを描画する', () => {
    render(<MaterialIcon name="add" />)

    const icon = screen.getByText('add')
    expect(icon.classList.contains('material-symbols-outlined')).toBe(true)
    expect(icon.getAttribute('aria-hidden')).toBe('true')
  })

  test('追加ボタンは文字記号ではなくaddアイコンを使う', () => {
    render(<AddButton label="費目を追加" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: '費目を追加' })).toBeDefined()
    expect(screen.getByText('add').classList.contains('material-symbols-outlined')).toBe(true)
  })

  test('ヘルプボタンはhelpアイコンを使い、説明文をアクセシブル名に保つ', () => {
    render(<HelpBadge text="入力方法" />)

    expect(screen.getByRole('button', { name: '入力方法について説明を表示' })).toBeDefined()
    expect(screen.getByText('help').classList.contains('material-symbols-outlined')).toBe(true)
  })
})
