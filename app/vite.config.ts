import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // engine/ と rules/, profile.sample/ はリポジトリルート側(app/の外)にあるため、
  // Vite の dev server がそれらを配信できるようにする(エンジン・UI分離を保ったまま
  // app が純粋関数エンジンをライブラリとして直接importするため)。
  server: {
    fs: { allow: ['..'] },
  },
  // GitHub Pagesはプロジェクトページとして https://<user>.github.io/lifeplan-simulator/
  // 配下に配信されるため、CIビルド時のみbaseを切り替える(ローカル開発は"/"のまま)。
  base: process.env.GITHUB_PAGES === 'true' ? '/lifeplan-simulator/' : '/',
})
