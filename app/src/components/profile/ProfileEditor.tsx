import { useState } from 'react'
import { FormProvider, useForm } from 'react-hook-form'
import type { EditableProfile } from '../../lib/profileStorage'
import { sanitizeFormValue } from '../../lib/sanitizeFormValue'
import { saveScenario } from '../../lib/scenarioStorage'
import { collectErrorPaths } from '../../lib/fieldError'
import { summarizeErrorCategories } from '../../lib/errorSummary'
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
  const form = useForm<EditableProfile>({ defaultValues: initialProfile })
  const { control, register, setValue, handleSubmit, getValues, formState, trigger } = form
  const [scenarioName, setScenarioName] = useState('')
  const [category, setCategory] = useState<Category>('basics')

  const errorPaths = collectErrorPaths(formState.errors)
  const errorCategories = summarizeErrorCategories(errorPaths)

  /** 不正な値のままシナリオを保存すると、比較実行時にエンジンが落ちるので先に検証する */
  async function handleSaveScenario(): Promise<void> {
    const name = scenarioName.trim()
    if (!name) return
    if (!(await trigger())) return
    saveScenario(name, sanitizeFormValue(getValues()))
    setScenarioName('')
    onScenarioSaved(name)
  }

  return (
    <FormProvider {...form}>
    <form onSubmit={handleSubmit(onApply)}>
      <nav className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto border-b border-hairline bg-page/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCategory(c.key)}
            aria-current={category === c.key ? 'true' : undefined}
            className={`min-h-11 shrink-0 rounded-sm border px-4 py-1.5 text-sm sm:min-h-0 ${
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

      <div className="sticky bottom-0 mt-8 border-t border-hairline bg-page py-4">
        {errorCategories.length > 0 && (
          <div role="alert" className="mb-3 rounded-sm border border-critical/40 bg-critical/5 px-4 py-3 text-sm">
            <span className="text-critical">
              入力に{errorPaths.length}件の問題があります。該当タブを開いて赤字の項目を直してください。
            </span>
            <span className="mt-2 flex flex-wrap gap-2">
              {errorCategories.map(({ category: c, count }) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className="rounded-sm border border-critical/40 px-2.5 py-1 text-xs text-critical hover:bg-critical/10"
                >
                  {CATEGORIES.find((x) => x.key === c)?.label}({count}件)
                </button>
              ))}
            </span>
          </div>
        )}

        {/* 狭い画面では主操作を1行目、シナリオ保存を2行目に分ける(横並びだと折返しで潰れる) */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <div className="flex gap-3">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-sm bg-amber-500 px-5 py-2 text-sm font-medium text-white hover:bg-amber-700 sm:min-h-0 sm:flex-initial"
            >
              保存して再計算
            </button>
            <button
              type="button"
              onClick={onReset}
              className="min-h-11 shrink-0 rounded-sm border border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-critical hover:text-critical sm:min-h-0"
            >
              サンプルに戻す
            </button>
          </div>
          <div className="flex gap-2 sm:ml-auto sm:items-center">
            <input
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              placeholder="シナリオ名(例: 転職した場合)"
              aria-label="シナリオ名"
              className="min-h-11 w-full min-w-0 rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-base text-ink outline-none focus:border-amber-500 sm:min-h-0 sm:w-auto sm:text-sm"
            />
            <button
              type="button"
              onClick={() => void handleSaveScenario()}
              disabled={!scenarioName.trim()}
              className="min-h-11 shrink-0 rounded-sm border border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-amber-500 hover:text-amber-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
            >
              シナリオとして保存
            </button>
          </div>
        </div>
      </div>
    </form>
    </FormProvider>
  )
}
