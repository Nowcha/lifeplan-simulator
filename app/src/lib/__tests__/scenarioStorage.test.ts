import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { EditableProfile } from '../profileStorage'
import { deleteScenario, listScenarios, saveScenario } from '../scenarioStorage'

const STORAGE_KEY = 'lifeplan-sim:scenarios:v1'

/** node環境にはlocalStorageが無いため、テスト用の最小実装を差し込む */
function createLocalStorageStub(): Storage {
  const store = new Map<string, string>()
  return {
    get length() {
      return store.size
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => [...store.keys()][index] ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  }
}

/** 構造だけ合っていれば十分なのでプロフィールはキャストで最小化する */
function profileStub(monthly: number): EditableProfile {
  return { household: { baseExpenses: [{ monthly }] }, events: [], assumptions: {} } as unknown as EditableProfile
}

beforeEach(() => {
  globalThis.localStorage = createLocalStorageStub()
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'localStorage')
})

describe('listScenarios', () => {
  test('保存が無いときは空配列', () => {
    expect(listScenarios()).toEqual([])
  })

  test('壊れたJSONが入っていても例外を投げず空配列を返す', () => {
    localStorage.setItem(STORAGE_KEY, '{壊れたJSON')

    expect(listScenarios()).toEqual([])
  })
})

describe('saveScenario', () => {
  test('名前付きで保存し、一覧から読み戻せる', () => {
    saveScenario('現状維持', profileStub(250000))

    const scenarios = listScenarios()
    expect(scenarios).toHaveLength(1)
    expect(scenarios[0]?.name).toBe('現状維持')
    expect(scenarios[0]?.profile.household.baseExpenses[0]?.monthly).toBe(250000)
  })

  test('保存後に元プロフィールを書き換えても、保存済みスナップショットは変わらない', () => {
    const profile = profileStub(250000)
    saveScenario('現状維持', profile)

    profile.household.baseExpenses[0]!.monthly = 999999

    expect(listScenarios()[0]?.profile.household.baseExpenses[0]?.monthly).toBe(250000)
  })

  test('既存のシナリオを消さずに追記する', () => {
    saveScenario('A', profileStub(1))
    saveScenario('B', profileStub(2))

    expect(listScenarios().map((s) => s.name)).toEqual(['A', 'B'])
  })

  test('連続保存でもIDが衝突しない', () => {
    // 同一ミリ秒内に2件保存してもIDが重複しないこと(重複するとReactのkey衝突と
    // 「1件削除したつもりが2件消える」削除バグを同時に引き起こす)
    const first = saveScenario('A', profileStub(1))
    const second = saveScenario('B', profileStub(2))

    expect(second.id).not.toBe(first.id)
  })
})

describe('deleteScenario', () => {
  test('指定したIDのシナリオだけを削除する', () => {
    const a = saveScenario('A', profileStub(1))
    saveScenario('B', profileStub(2))

    deleteScenario(a.id)

    expect(listScenarios().map((s) => s.name)).toEqual(['B'])
  })

  test('存在しないIDの削除は何も起こさない', () => {
    saveScenario('A', profileStub(1))

    deleteScenario('scenario-does-not-exist')

    expect(listScenarios()).toHaveLength(1)
  })
})
