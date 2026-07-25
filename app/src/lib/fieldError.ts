/**
 * react-hook-form の errors ツリーを、register で使うドット区切りパス
 * (例: `household.persons.0.birthYearMonth`)で引くためのヘルパー。
 * RHFはネストしたパス用のgetterを公開していないため自前で持つ。
 */
import type { FieldErrors } from 'react-hook-form'

/** エラーノードらしさの判定: RHFのエラーは { type, message } を持つ葉ノード */
function errorMessageOf(node: unknown): string | undefined {
  if (node === null || typeof node !== 'object') return undefined
  const message = (node as { message?: unknown }).message
  return typeof message === 'string' && message !== '' ? message : undefined
}

/** 指定パスのエラーメッセージ。エラーが無ければ undefined */
export function fieldErrorMessage(errors: FieldErrors, path: string): string | undefined {
  let node: unknown = errors
  for (const key of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[key]
  }
  return errorMessageOf(node)
}

/**
 * エラーツリーを走査して、エラーのあるフィールドのパスを列挙する。
 * カテゴリタブで隠れているフィールドのエラーを送信時に要約表示するために使う。
 */
export function collectErrorPaths(errors: FieldErrors): string[] {
  const paths: string[] = []

  function walk(node: unknown, prefix: string): void {
    if (node === null || typeof node !== 'object') return
    if (errorMessageOf(node) !== undefined) {
      paths.push(prefix)
      return
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      walk(child, prefix === '' ? key : `${prefix}.${key}`)
    }
  }

  walk(errors, '')
  return paths
}
