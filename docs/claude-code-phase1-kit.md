# lifeplan-sim フェーズ1 着手キット

構成: ①リポジトリに置く `CLAUDE.md` ②Claude Codeに貼るフェーズ1プロンプト ③実行手順

---

## ① プロジェクトCLAUDE.md(リポジトリ直下に配置)

````markdown
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
````

---

## ② フェーズ1 キックオフプロンプト(Claude Codeに貼る)

````text
フェーズ1「手取りエンジン + 決定論キャッシュフロー表 + ゴールデンテスト」を実装してください。
設計書 docs/lifeplan-schema-design.md を必ず最初に全文読み、§2(共通型)、§3(Household)、§6(RuleSet)、§7(AnnualRow)、§8(パイプライン手順1-6)、§9(テスト戦略)に厳密に従ってください。

## スコープ

含む:
1. リポジトリ初期化: TypeScript(strict) + Vitest + ESLint。設計書§1のディレクトリ構成
2. engine/types/: 設計書§2〜§7の型定義を TypeScript で完全に写す(フェーズ2以降の型も定義だけは作る)
3. engine/tax/: 手取りエンジン
   - 給与所得控除 → 所得控除(社保実額・iDeCo・基礎・配偶者)→ 累進所得税 + 復興特別所得税
   - 社会保険料: 標準報酬月額の等級表マッピング、健保(協会けんぽ東京 or 組合料率)、40歳以上介護保険、厚生年金、雇用保険。賞与は標準賞与額で別計算(健保年度573万・厚年月150万の上限)
   - 住民税: 前年課税所得ベース(所得割10% + 均等割・森林環境税、基礎控除43万)。シミュレーション初年度は「前年所得=初年度と同じ」と仮定するフラグを設ける
   - ふるさと納税限度額の算出(副産物)
4. engine/income/: incomeCurve の年齢補間 + indexation 適用(フェーズ1では wageGrowth は決定論の固定値)
5. engine/expenses/: BaseExpenseItem の展開のみ(イベント修飾子はフェーズ2)
6. engine/pipeline.ts: 設計書§8の手順1-6を月次内部計算・年次集計で実装。手順3(給付金)はフェーズ2までスタブ(空配列を返す)。手順7-9(ローン・投資)もスタブとし、cashBalance は単純累積
7. rules/2026.json: 上記に必要な全パラメータを、一次情報をWeb検索して確定値で埋める。各値に _source(URL・確認日)を付与
8. profile.sample/: 動作確認用サンプル世帯(夫婦・子なし・賃貸)
9. ゴールデンテスト: 設計書§9の通り
   - 年収400/600/800/1000/1500万の給与所得者(東京・協会けんぽ・40歳未満・独身)について所得税・住民税・社保・手取りを検証。期待値は国税庁の計算方法から自分で導出し、根拠と計算過程をテストコメントに記載。許容誤差±1000円
   - 配偶者控除ありのケースを1件追加
   - 標準報酬月額の境界値テスト(等級の上限・下限)
10. エンジン純粋性のESLint強制(CLAUDE.md記載のルール)

含まない(実装しない):
- 給付金・教育費(フェーズ2)、住宅ローン(フェーズ3)、NISA・モンテカルロ(フェーズ4)、UI(フェーズ5)

## 進め方

1. まず設計書を読み、実装計画(ファイル一覧と着手順)を提示して私の承認を待つ
2. rules/2026.json の数値確定は独立ステップとして実施し、出典一覧を提示してから次に進む
3. 型定義 → tax(テスト同時) → income/expenses → pipeline の順
4. 各ステップ完了ごとに npm test を実行し、結果を報告してからコミット

## 受け入れ基準

- npm test 全件グリーン、ゴールデンテスト±1000円以内
- rules/2026.json の全数値に _source があり、一次情報のみ
- engine/ 配下に Date.now / Math.random / window 参照がない(lintで検証)
- profile.sample の世帯で pipeline を実行し、30年分の AnnualRow が出力されるデモスクリプト(scripts/demo.ts)が動く
- README に「本ツールは税務相談・投資助言ではない」免責を記載
````

---

## ③ 実行手順(PowerShell)

```powershell
mkdir lifeplan-sim; cd lifeplan-sim
git init
mkdir docs
# 設計書とCLAUDE.mdを配置
Copy-Item <ダウンロード先>\lifeplan-schema-design.md docs\
# CLAUDE.md は上記①の内容で作成
# .gitignore に profile/ と node_modules/ を追加
claude   # Claude Code起動 → 上記②のプロンプトを貼る
```

## 運用メモ

- **rules値の確定ステップは必ず出典レビューを挟む**(プロンプトの進め方2で強制済み)。児童手当・出生後休業支援給付・住宅ローン控除の子育て特例あたりは改正が続いているので、フェーズ2・3の着手時にも再確認させる
- ゴールデンテストの期待値をClaude Code自身に導出させる構成なので、最初のテストレビュー時に**1ケースだけ手元の給与明細や市販計算機と突合**しておくと土台の信頼性が固まる
- フェーズ2以降のプロンプトは、フェーズ1完了後のコード実態(モジュール境界・命名)を見てから書く方が精度が高いので、その時点で改めて作成を依頼のこと
