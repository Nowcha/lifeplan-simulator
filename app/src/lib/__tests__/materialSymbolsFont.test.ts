import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, test } from 'vitest'

describe('Material Symbols font', () => {
  test('Google Fontsから必要なアイコンだけをblock表示で読み込む', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

    expect(html).toContain('fonts.googleapis.com/css2?family=Material+Symbols+Outlined')
    expect(html).toContain('icon_names=add,arrow_back,close,delete,help')
    expect(html).toContain('display=block')
  })
})
