/** 比較用に名前を付けて保存するプロフィールのスナップショット群。localStorageに永続化する。 */
import type { EditableProfile } from './profileStorage'

const STORAGE_KEY = 'lifeplan-sim:scenarios:v1'

export interface Scenario {
  id: string
  name: string
  profile: EditableProfile
}

export function listScenarios(): Scenario[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Scenario[]
  } catch {
    return []
  }
}

function writeScenarios(scenarios: Scenario[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios))
}

export function saveScenario(name: string, profile: EditableProfile): Scenario {
  const scenarios = listScenarios()
  const scenario: Scenario = { id: `scenario-${Date.now()}`, name, profile: structuredClone(profile) }
  writeScenarios([...scenarios, scenario])
  return scenario
}

export function deleteScenario(id: string): void {
  writeScenarios(listScenarios().filter((s) => s.id !== id))
}
