import { defineConfig } from 'vitest/config'

/**
 * UI側(app/)のユニットテスト設定。vite.config.ts とは別ファイルにしてある —
 * ここでテストするのは src/lib/ 配下の純粋ロジックだけで、React も Tailwind も
 * 不要なため、プラグインを読み込まない構成にしてテスト起動を軽く保つ。
 * エンジン本体のテストはリポジトリルートの vitest.config.ts が担当する。
 */
export default defineConfig({
  test: {
    // 既定は node。純粋ロジックのテストはこの方が速く、localStorage が
    // 「存在しない」前提のスタブもそのまま使える。DOMが要るコンポーネントの
    // テストはファイル先頭の `// @vitest-environment jsdom` で個別に切り替える。
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/engine.ts', 'src/lib/simulation.worker.ts'],
    },
  },
})
