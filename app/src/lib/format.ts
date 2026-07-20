/** 円額を万円単位の読みやすい表記に変換する(大きな金額が並ぶダッシュボード向け) */
export function formatManYen(yen: number): string {
  const negative = yen < 0;
  const man = Math.round(Math.abs(yen) / 10000);
  const formatted = `${man.toLocaleString("ja-JP")}万円`;
  return negative ? `-${formatted}` : formatted;
}

/** 正確な円額(桁区切りのみ)。テーブルやツールチップなど精度が重要な箇所向け */
export function formatYen(yen: number): string {
  return `${Math.round(yen).toLocaleString("ja-JP")}円`;
}

export function formatPercent(rate: number, fractionDigits = 1): string {
  return `${(rate * 100).toFixed(fractionDigits)}%`;
}
