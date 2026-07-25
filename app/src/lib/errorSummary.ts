/**
 * プロフィール編集フォームは4カテゴリのうち3つをタブで隠しているため、
 * 隠れたフィールドのエラーで送信がブロックされると原因が画面に見えない。
 * エラーパスをカテゴリ単位に集計し、送信ボタン付近に要約を出すために使う。
 */

export type ProfileCategory = 'basics' | 'finance' | 'events' | 'assumptions'

/** 前方一致でカテゴリを決める。より限定的なプレフィックスを先に置くこと。 */
const CATEGORY_PREFIXES: readonly { prefix: string; category: ProfileCategory }[] = [
  { prefix: 'household.persons', category: 'basics' },
  { prefix: 'household.children', category: 'basics' },
  { prefix: 'household.municipality', category: 'basics' },
  { prefix: 'household', category: 'finance' },
  { prefix: 'events', category: 'events' },
  { prefix: 'assumptions', category: 'assumptions' }
]

export function categoryOfErrorPath(path: string): ProfileCategory | undefined {
  return CATEGORY_PREFIXES.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}.`))?.category
}

export interface CategoryErrorCount {
  category: ProfileCategory
  count: number
}

/** カテゴリごとのエラー件数。件数0のカテゴリは含めない。並び順はCATEGORY_PREFIXESの定義順。 */
export function summarizeErrorCategories(paths: readonly string[]): CategoryErrorCount[] {
  const counts = new Map<ProfileCategory, number>()
  for (const path of paths) {
    const category = categoryOfErrorPath(path)
    if (category === undefined) continue
    counts.set(category, (counts.get(category) ?? 0) + 1)
  }

  const order: ProfileCategory[] = ['basics', 'finance', 'events', 'assumptions']
  return order.flatMap((category) => {
    const count = counts.get(category)
    return count === undefined ? [] : [{ category, count }]
  })
}
