import { describe, expect, test } from 'vitest'
import html from '../../../index.html?raw'

describe('Material Symbols font', () => {
  test('Google Fontsから必要なアイコンだけをblock表示で読み込む', () => {
    expect(html).toContain('fonts.googleapis.com/css2?family=Material+Symbols+Outlined')
    expect(html).toContain('icon_names=add,arrow_back,close,delete,help')
    expect(html).toContain('display=block')
  })
})
