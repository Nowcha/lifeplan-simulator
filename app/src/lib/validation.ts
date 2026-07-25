/**
 * プロフィール編集フォームの入力検証ルール。
 *
 * 重要: `valueAsNumber` を付けた数値入力は、空にすると `undefined` ではなく **NaN** に
 * なる。RHFの `required` はNaNを「入力あり」と見なして素通しするため、必須の数値は
 * `validate` で明示的に有限数かどうかを見る必要がある。これを怠ると、空欄のまま
 * 送信できてしまい、エンジン側の厳密な数値パースで初めて落ちる(= 生のエラーが出る)。
 */

export const EMPTY_MESSAGE = '入力してください'
export const NOT_A_NUMBER_MESSAGE = '数値を入力してください'
export const YEAR_MONTH_FORMAT_MESSAGE = 'YYYY-MM の形式で入力してください'

export interface NumberRuleOptions {
  min?: number
  max?: number
  integer?: boolean
}

/** 未入力(空欄)を表す値。数値入力の空欄はNaN、未登録フィールドはundefinedになる。 */
function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'number') return Number.isNaN(value)
  return typeof value === 'string' && value.trim() === ''
}

export function validateNumber(value: unknown, options: NumberRuleOptions = {}): true | string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return NOT_A_NUMBER_MESSAGE
  if (options.integer === true && !Number.isInteger(value)) return '整数で入力してください'
  if (options.min !== undefined && value < options.min) return `${options.min}以上で入力してください`
  if (options.max !== undefined && value > options.max) return `${options.max}以下で入力してください`
  return true
}

export function validateOptionalNumber(value: unknown, options: NumberRuleOptions = {}): true | string {
  return isBlank(value) ? true : validateNumber(value, options)
}

export function validateYearMonth(value: unknown): true | string {
  if (isBlank(value)) return EMPTY_MESSAGE
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return YEAR_MONTH_FORMAT_MESSAGE
  return true
}

export function validateOptionalYearMonth(value: unknown): true | string {
  return isBlank(value) ? true : validateYearMonth(value)
}

export function validateRequiredText(value: unknown): true | string {
  return isBlank(value) ? EMPTY_MESSAGE : true
}

/* --- register() に渡すルールオブジェクト --- */

export function numberRules(options: NumberRuleOptions = {}) {
  return { valueAsNumber: true, validate: (value: unknown) => validateNumber(value, options) }
}

export function optionalNumberRules(options: NumberRuleOptions = {}) {
  return { valueAsNumber: true, validate: (value: unknown) => validateOptionalNumber(value, options) }
}

export const yearMonthRules = { validate: (value: unknown) => validateYearMonth(value) }
export const optionalYearMonthRules = { validate: (value: unknown) => validateOptionalYearMonth(value) }
export const requiredTextRules = { validate: (value: unknown) => validateRequiredText(value) }
