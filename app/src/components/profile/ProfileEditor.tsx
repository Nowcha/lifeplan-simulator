import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { EditableProfile } from '../../lib/profileStorage'
import { sanitizeFormValue } from '../../lib/sanitizeFormValue'
import { saveScenario } from '../../lib/scenarioStorage'
import { HouseholdBasicsForm } from './HouseholdBasicsForm'
import { HouseholdFinanceForm } from './HouseholdFinanceForm'
import { EventsForm } from './EventsForm'
import { AssumptionsForm } from './AssumptionsForm'

interface ProfileEditorProps {
  initialProfile: EditableProfile
  onApply: (profile: EditableProfile) => void
  onReset: () => void
  onScenarioSaved: (name: string) => void
}

const CATEGORIES = [
  { key: 'basics', label: '世帯構成' },
  { key: 'finance', label: '支出・資産' },
  { key: 'events', label: 'ライフイベント' },
  { key: 'assumptions', label: '前提条件' }
] as const

type Category = (typeof CATEGORIES)[number]['key']

export function ProfileEditor({ initialProfile, onApply, onReset, onScenarioSaved }: ProfileEditorProps) {
  const { control, register, setValue, handleSubmit, getValues } = useForm<EditableProfile>({
    defaultValues: initialProfile
  })
  const [scenarioName, setScenarioName] = useState('')
  const [category, setCategory] = useState<Category>('basics')

  function handleSaveScenario(): void {
    const name = scenarioName.trim()
    if (!name) return
    saveScenario(name, sanitizeFormValue(getValues()))
    setScenarioName('')
    onScenarioSaved(name)
  }

  return (
    <form onSubmit={handleSubmit(onApply)}>
      <nav className="sticky top-0 z-10 -mx-6 flex gap-2 border-b border-hairline bg-page/95 px-6 py-3 backdrop-blur-sm">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            className={`rounded-sm border px-4 py-1.5 text-sm ${
              category === c.key
                ? 'border-ink bg-ink text-page'
                : 'border-hairline-strong text-ink-secondary hover:border-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </nav>

      <div className={category === 'basics' ? '' : 'hidden'}>
        <HouseholdBasicsForm control={control} register={register} />
      </div>
      <div className={category === 'finance' ? '' : 'hidden'}>
        <HouseholdFinanceForm control={control} register={register} setValue={setValue} />
      </div>
      <div className={category === 'events' ? '' : 'hidden'}>
        <EventsForm control={control} register={register} setValue={setValue} />
      </div>
      <div className={category === 'assumptions' ? '' : 'hidden'}>
        <AssumptionsForm control={control} register={register} setValue={setValue} />
      </div>

      <div className="sticky bottom-0 mt-8 flex flex-wrap items-center gap-4 border-t border-hairline bg-page py-4">
        <button type="submit" className="rounded-sm bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700">
          保存して再計算
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-sm border border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-critical hover:text-critical"
        >
          サンプルに戻す
        </button>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="シナリオ名(例: 転職した場合)"
            className="rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-sm text-ink outline-none focus:border-amber-500"
          />
          <button
            type="button"
            onClick={handleSaveScenario}
            disabled={!scenarioName.trim()}
            className="rounded-sm border border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-amber-500 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            シナリオとして保存
          </button>
        </div>
      </div>
    </form>
  )
}
