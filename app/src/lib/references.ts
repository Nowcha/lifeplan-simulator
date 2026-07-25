/**
 * 削除しようとしている項目が他から参照されていないかを調べる。
 *
 * プロフィールは id / ラベルによる相互参照を持つ(イベントが人物を借入人として
 * 指す、子どもが教育プランを指す、資産が資産クラスを指す等)。参照先を消しても
 * 参照側は残るため、そのままではエンジンが解決できない宙に浮いた参照になる。
 * 削除前に「どこから参照されているか」をユーザーに見せるために使う。
 *
 * 説明文の項目名は編集フォームのカード見出し(「出産1」「本人2」など)と
 * 同じ付け方に揃える。ユーザーが該当箇所を探せることが目的のため。
 */
import type { EditableProfile } from './profileStorage'

export type ReferenceTarget =
  | { kind: 'person'; id: string }
  | { kind: 'child'; id: string }
  | { kind: 'assetClass'; id: string }
  | { kind: 'loan'; id: string }
  | { kind: 'educationPlan'; id: string }
  | { kind: 'expenseLabel'; label: string }

const EVENT_TYPE_LABELS: Record<string, string> = {
  childbirth: '出産',
  'housing-purchase': '住宅購入',
  'loan-prepayment': 'ローン繰上返済',
  education: '教育プラン',
  recurring: '定期支出',
  'one-time': '単発の収支'
}

type LooseEvent = Record<string, unknown> & { type?: string }

/** イベント配列の各要素に、編集フォームと同じ見出し(種別ごとの連番)を割り当てる */
function eventTitles(events: readonly LooseEvent[]): string[] {
  const counters = new Map<string, number>()
  return events.map((event) => {
    const type = typeof event.type === 'string' ? event.type : 'unknown'
    const next = (counters.get(type) ?? 0) + 1
    counters.set(type, next)
    return `${EVENT_TYPE_LABELS[type] ?? type}${next}`
  })
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function prop(value: unknown, key: string): unknown {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
}

export function findReferences(profile: EditableProfile, target: ReferenceTarget): string[] {
  const events = asArray((profile as unknown as { events?: unknown }).events) as LooseEvent[]
  const titles = eventTitles(events)
  const household = (profile as unknown as { household?: unknown }).household
  const refs: string[] = []

  events.forEach((event, i) => {
    const title = titles[i] ?? `イベント${i + 1}`

    if (target.kind === 'person') {
      asArray(event.leavePlans).forEach((plan, planIndex) => {
        if (prop(plan, 'personId') === target.id) refs.push(`ライフイベント「${title}」の育休プラン${planIndex + 1}`)
      })
      asArray(event.loans).forEach((loan, loanIndex) => {
        if (prop(loan, 'borrowerPersonId') === target.id) refs.push(`ライフイベント「${title}」のローン${loanIndex + 1}(借入人)`)
      })
    }

    if (target.kind === 'child' && event.childId === target.id) {
      refs.push(`ライフイベント「${title}」の対象の子ども`)
    }

    if (target.kind === 'loan' && event.type === 'loan-prepayment' && event.loanId === target.id) {
      refs.push(`ライフイベント「${title}」の対象ローン`)
    }

    if (target.kind === 'expenseLabel') {
      asArray(event.terminatesExpenseLabels).forEach((label) => {
        if (label === target.label) refs.push(`ライフイベント「${title}」が終了させる費目`)
      })
    }
  })

  if (target.kind === 'educationPlan') {
    asArray(prop(household, 'children')).forEach((child, index) => {
      if (prop(child, 'educationPlanRef') === target.id) refs.push(`子ども${index + 1}の教育プラン`)
    })
  }

  if (target.kind === 'assetClass') {
    asArray(prop(household, 'financialAssets')).forEach((asset, index) => {
      if (prop(asset, 'assetClassId') === target.id) refs.push(`保有資産の資産${index + 1}`)
    })
    const contributions = prop(prop(household, 'savingsPolicy'), 'contributions')
    asArray(contributions).forEach((contribution, index) => {
      if (prop(contribution, 'assetClassId') === target.id) refs.push(`積立配分の積立${index + 1}`)
    })
    const factors = prop(prop((profile as unknown as { assumptions?: unknown }).assumptions, 'correlationMatrix'), 'factors')
    if (asArray(factors).includes(target.id)) refs.push('相関行列の要因')
  }

  return refs
}

/**
 * 費目名の変更に追随して、住宅購入イベントの terminatesExpenseLabels を書き換える。
 *
 * この参照だけが名前ベース(他は全てid参照)なので、参照先の表示名を変えると
 * 参照が黙って切れる。リネームを検知して参照側も同時に更新するために使う。
 */
export function renameExpenseLabelReferences<T>(
  events: readonly T[],
  oldLabel: string,
  newLabel: string
): { events: T[]; changed: number } {
  if (oldLabel === '' || oldLabel === newLabel) return { events: [...events], changed: 0 }

  let changed = 0
  const updated = events.map((event) => {
    const labels = prop(event, 'terminatesExpenseLabels')
    if (prop(event, 'type') !== 'housing-purchase' || !Array.isArray(labels)) return event
    if (!labels.includes(oldLabel)) return event

    const nextLabels = labels.map((label) => {
      if (label !== oldLabel) return label
      changed += 1
      return newLabel
    })
    return { ...(event as object), terminatesExpenseLabels: nextLabels } as T
  })

  return { events: updated, changed }
}

function formatWarning(refs: readonly string[]): string | undefined {
  if (refs.length === 0) return undefined
  return `この項目は次の${refs.length}箇所から参照されています。削除すると参照先が失われ、計算できなくなることがあります。\n\n・${refs.join('\n・')}`
}

/** 確認ダイアログに足す一文。参照が無ければ undefined(通常の確認文だけ出す) */
export function describeReferences(profile: EditableProfile, target: ReferenceTarget): string | undefined {
  return formatWarning(findReferences(profile, target))
}

/**
 * イベント1件を削除するときの警告。イベントは自身が参照される(教育プラン)ほか、
 * 内包するローンが繰上返済イベントから参照されるため、まとめて集約する。
 */
export function describeEventRemoval(profile: EditableProfile, index: number): string | undefined {
  const events = asArray((profile as unknown as { events?: unknown }).events) as LooseEvent[]
  const event = events[index]
  if (event === undefined) return undefined

  const refs: string[] = []
  if (event.type === 'education' && typeof event.id === 'string') {
    refs.push(...findReferences(profile, { kind: 'educationPlan', id: event.id }))
  }
  if (event.type === 'housing-purchase') {
    for (const loan of asArray(event.loans)) {
      const loanId = prop(loan, 'loanId')
      if (typeof loanId === 'string') refs.push(...findReferences(profile, { kind: 'loan', id: loanId }))
    }
  }
  return formatWarning(refs)
}
