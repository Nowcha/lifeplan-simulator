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

/**
 * チャートの軸ラベル用の短縮表記。狭い画面では軸に割ける横幅が小さいため、
 * 1億円以上を「2.0億」に畳んで桁数を抑える(通常幅では「20,000万」のまま)。
 */
export function formatAxisYen(yen: number, compact: boolean): string {
  const negative = yen < 0;
  const abs = Math.abs(yen);
  const oku = 100_000_000;

  let body: string;
  if (compact && abs >= oku) {
    // 1億=10,000万なので、億単位にすると桁が4つ減る
    const value = abs / oku;
    body = `${(Math.round(value * 10) / 10).toLocaleString("ja-JP")}億`;
  } else {
    const man = Math.round(abs / 10000);
    body = `${man.toLocaleString("ja-JP")}万`;
  }

  return negative && body !== "0万" ? `-${body}` : body;
}
