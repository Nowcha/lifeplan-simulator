/**
 * react-hook-form は未入力の任意項目(YearMonthや数値)を空文字列/NaNとして保持する
 * (RHFの内部仕様上、undefinedを直接扱えないため)。エンジンは "YYYY-MM" 形式や
 * 数値を厳密に要求するので、送信直前に空文字列・NaNをundefinedへ変換して取り除く。
 */
export function sanitizeFormValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFormValue(item)).filter((item) => item !== undefined) as unknown as T
  }

  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const sanitized = sanitizeFormValue(raw)
      if (sanitized !== undefined) result[key] = sanitized
    }
    return result as T
  }

  if (typeof value === 'string' && value.trim() === '') return undefined as unknown as T
  if (typeof value === 'number' && Number.isNaN(value)) return undefined as unknown as T
  return value
}
