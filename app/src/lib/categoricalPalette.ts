/**
 * シナリオ比較チャート用の識別(カテゴリカル)色。dataviz skillの検証済みデフォルト
 * パレットの先頭4色(blue/green/magenta/yellow)— この順序でCVD安全性の全ペア検証
 * (validate_palette.js --pairs all)を本アプリの chart surface(#ffffff)に対して通過済み。
 * 4色を超えるとCVD分離を保証できないため、比較対象は最大4シナリオに制限する。
 */
export const CATEGORICAL_PALETTE = ['#2a78d6', '#008300', '#e87ba4', '#eda100'] as const

export const MAX_COMPARE_SCENARIOS = CATEGORICAL_PALETTE.length
