# lifeplan-sim

高精度ライフプランシミュレーター。設計書は `docs/lifeplan-schema-design.md`(以下「設計書」)。
**すべての実装判断は設計書を正とする。設計書と矛盾する実装をしない。変更が必要なら先に設計書を更新して承認を得る。**

## プロジェクト原則

- **ゼロAPIキー**: 外部APIキー・シークレットを一切導入しない。CI含めsubscription/無料枠のみ
- **エンジン純粋性**: `engine/` 配下はUIとブラウザAPIから完全独立。`window` / `document` / `Date.now()` / `Math.random()` の直接参照禁止(現在日時・乱数は必ず引数で注入)。ESLintの `no-restricted-globals` / `no-restricted-properties` で機械的に強制する
- **金額は整数円**: 丸めは各モジュールで規則を明示(ローン償還は月次円未満切捨て等、実装時にコメントで根拠を残す)
- **個人データ分離**: `profile/` はgitignore。コミット前に個人データが含まれないことを確認。サンプルは `profile.sample/` に置く
- **税制・給付の数値はハードコード禁止**: すべて `rules/<year>.json` に置き、ロジックはパラメータ参照のみ

## 技術スタック

- TypeScript (strict: true)、Node 20+、npm
- テスト: Vitest。UI(フェーズ5)は React + Vite + Tailwind
- Windows / PowerShell 環境。シェルコマンドはPowerShell構文で書く(`&&` 連結や `rm -rf` を使わない。`;` 連結、`Remove-Item -Recurse` を使う)

## テスト規律

- 税・社保・給付・ローンのロジック変更時は必ず対応するテストを先に書くか同時に更新する
- ゴールデンテスト(`engine/tax/__tests__/golden.test.ts`)は**一次情報の根拠URLをテストコード内コメントに残す**
- `npm test` が通らない状態でコミットしない

## rules ファイルの更新規律

- `rules/<year>.json` の数値を追加・変更するときは、一次情報(国税庁・協会けんぽ・厚労省・こども家庭庁・自治体公式)をWebSearch/WebFetchで確認し、各値に `_source` フィールド(URL + 確認日)を付ける
- 二次情報(まとめサイト・ブログ)のみを根拠に数値を書かない

## コミット規約

- Conventional Commits(`feat:` `fix:` `test:` `docs:` `chore:`)
- 1コミット1関心事。rules値の更新は独立コミットにする
