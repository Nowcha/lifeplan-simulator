import { describe, expect, test } from 'vitest'
import type { EditableProfile } from '../profileStorage'
import { describeEventRemoval, describeReferences, findReferences } from '../references'

/** 相互参照だけを持つ最小のプロフィール。他のフィールドは参照解決に関係しない */
const profile = {
  household: {
    persons: [{ id: 'p1' }, { id: 'p2' }],
    children: [
      { id: 'c1', educationPlanRef: 'edu-1' },
      { id: 'c2', educationPlanRef: '' }
    ],
    baseExpenses: [{ label: '住居費(賃貸)' }, { label: '食費' }],
    financialAssets: [{ assetClassId: '世界株式' }, { assetClassId: '債券' }],
    savingsPolicy: { contributions: [{ assetClassId: '世界株式' }] }
  },
  events: [
    {
      id: 'e1',
      type: 'childbirth',
      childId: 'c1',
      leavePlans: [{ personId: 'p2' }, { personId: 'p1' }]
    },
    {
      id: 'e2',
      type: 'housing-purchase',
      terminatesExpenseLabels: ['住居費(賃貸)'],
      loans: [{ loanId: 'loan-1', borrowerPersonId: 'p1' }]
    },
    { id: 'e3', type: 'loan-prepayment', loanId: 'loan-1' },
    { id: 'edu-1', type: 'education', childId: 'c1' }
  ],
  assumptions: { correlationMatrix: { factors: ['世界株式', 'base-rate'] } }
} as unknown as EditableProfile

describe('人物の参照', () => {
  test('育休プランと借入人の両方を拾う', () => {
    expect(findReferences(profile, { kind: 'person', id: 'p1' })).toEqual([
      'ライフイベント「出産1」の育休プラン2',
      'ライフイベント「住宅購入1」のローン1(借入人)'
    ])
  })

  test('参照が1箇所だけの人物', () => {
    expect(findReferences(profile, { kind: 'person', id: 'p2' })).toEqual([
      'ライフイベント「出産1」の育休プラン1'
    ])
  })

  test('どこからも参照されていない人物は空配列', () => {
    expect(findReferences(profile, { kind: 'person', id: 'p9' })).toEqual([])
  })
})

describe('子どもの参照', () => {
  test('出産イベントと教育プランの両方から参照される', () => {
    expect(findReferences(profile, { kind: 'child', id: 'c1' })).toEqual([
      'ライフイベント「出産1」の対象の子ども',
      'ライフイベント「教育プラン1」の対象の子ども'
    ])
  })

  test('参照されていない子ども', () => {
    expect(findReferences(profile, { kind: 'child', id: 'c2' })).toEqual([])
  })
})

describe('教育プラン・ローン・費目名の参照', () => {
  test('教育プランは子どもの educationPlanRef から参照される', () => {
    expect(findReferences(profile, { kind: 'educationPlan', id: 'edu-1' })).toEqual(['子ども1の教育プラン'])
  })

  test('ローンは繰上返済イベントから参照される', () => {
    expect(findReferences(profile, { kind: 'loan', id: 'loan-1' })).toEqual([
      'ライフイベント「ローン繰上返済1」の対象ローン'
    ])
  })

  test('基本生活費は住宅購入の terminatesExpenseLabels から名前で参照される', () => {
    expect(findReferences(profile, { kind: 'expenseLabel', label: '住居費(賃貸)' })).toEqual([
      'ライフイベント「住宅購入1」が終了させる費目'
    ])
    expect(findReferences(profile, { kind: 'expenseLabel', label: '食費' })).toEqual([])
  })
})

describe('資産クラスの参照', () => {
  test('保有資産・積立配分・相関行列の3方向から拾う', () => {
    expect(findReferences(profile, { kind: 'assetClass', id: '世界株式' })).toEqual([
      '保有資産の資産1',
      '積立配分の積立1',
      '相関行列の要因'
    ])
  })

  test('保有資産だけから参照される資産クラス', () => {
    expect(findReferences(profile, { kind: 'assetClass', id: '債券' })).toEqual(['保有資産の資産2'])
  })
})

describe('イベント見出しの採番', () => {
  test('種別ごとに連番を振る(編集フォームのカード見出しと一致させる)', () => {
    const twoBirths = {
      household: {},
      events: [
        { type: 'childbirth', childId: 'c1' },
        { type: 'housing-purchase' },
        { type: 'childbirth', childId: 'c1' }
      ]
    } as unknown as EditableProfile

    expect(findReferences(twoBirths, { kind: 'child', id: 'c1' })).toEqual([
      'ライフイベント「出産1」の対象の子ども',
      'ライフイベント「出産2」の対象の子ども'
    ])
  })
})

describe('describeReferences', () => {
  test('参照が無ければ undefined', () => {
    expect(describeReferences(profile, { kind: 'person', id: 'p9' })).toBeUndefined()
  })

  test('件数と一覧を含む文面を返す', () => {
    const message = describeReferences(profile, { kind: 'person', id: 'p1' })

    expect(message).toContain('次の2箇所から参照されています')
    expect(message).toContain('・ライフイベント「出産1」の育休プラン2')
    expect(message).toContain('・ライフイベント「住宅購入1」のローン1(借入人)')
  })
})

describe('describeEventRemoval', () => {
  test('教育プランを消すと、それを指している子どもを警告する', () => {
    // events[3] = edu-1(子ども1が参照)
    expect(describeEventRemoval(profile, 3)).toContain('子ども1の教育プラン')
  })

  test('住宅購入を消すと、内包するローンを指す繰上返済を警告する', () => {
    // events[1] = 住宅購入1(loan-1 を持ち、events[2] の繰上返済が参照)
    expect(describeEventRemoval(profile, 1)).toContain('ライフイベント「ローン繰上返済1」の対象ローン')
  })

  test('参照されないイベントは警告なし', () => {
    // events[0] = 出産1。子ども自体は残るので参照は切れない
    expect(describeEventRemoval(profile, 0)).toBeUndefined()
    expect(describeEventRemoval(profile, 2)).toBeUndefined()
  })

  test('範囲外の index は undefined', () => {
    expect(describeEventRemoval(profile, 99)).toBeUndefined()
  })
})

describe('壊れた入力への耐性', () => {
  test('配列であるべき箇所が欠けていても例外を投げない', () => {
    const broken = { household: {}, events: undefined } as unknown as EditableProfile

    expect(findReferences(broken, { kind: 'person', id: 'p1' })).toEqual([])
    expect(findReferences(broken, { kind: 'assetClass', id: 'x' })).toEqual([])
  })
})
