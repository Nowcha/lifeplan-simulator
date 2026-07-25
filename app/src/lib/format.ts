/** 円額を万円単位の読みやすい表記に変換する(大きな金額が並ぶダッシュボード向け) */
export function formatManYen(yen: number): string {
  const man = Math.round(Math.abs(yen) / 10000);
  // 丸めた結果が0のときは符号を付けない(-3,000円を「-0万円」と表示しないため)
  const negative = yen < 0 && man > 0;
  const formatted = `${man.toLocaleString("ja-JP")}万円`;
  return negative ? `-${formatted}` : formatted;
}

/** 正確な円額(桁区切りのみ)。テーブルやツールチップなど精度が重要な箇所向け */
export function formatYen(yen: number): string {
  // `+ 0` は Math.round が返す -0 を 0 に正規化する(Intlは-0を"-0"と表示するため)
  const rounded = Math.round(yen) + 0;
  return `${rounded.toLocaleString("ja-JP")}円`;
}

export function formatPercent(rate: number, fractionDigits = 1): string {
  return `${(rate * 100).toFixed(fractionDigits)}%`;
}
