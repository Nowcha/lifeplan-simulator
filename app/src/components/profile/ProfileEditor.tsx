import { useForm } from 'react-hook-form'
import type { EditableProfile } from '../../lib/profileStorage'
import { HouseholdForm } from './HouseholdForm'
import { EventsForm } from './EventsForm'
import { AssumptionsForm } from './AssumptionsForm'

interface ProfileEditorProps {
  initialProfile: EditableProfile
  onApply: (profile: EditableProfile) => void
  onReset: () => void
}

export function ProfileEditor({ initialProfile, onApply, onReset }: ProfileEditorProps) {
  const { control, register, setValue, handleSubmit } = useForm<EditableProfile>({ defaultValues: initialProfile })

  return (
    <form onSubmit={handleSubmit(onApply)}>
      <HouseholdForm control={control} register={register} setValue={setValue} />
      <EventsForm control={control} register={register} setValue={setValue} />
      <AssumptionsForm control={control} register={register} setValue={setValue} />

      <div className="sticky bottom-0 mt-8 flex items-center gap-4 border-t border-hairline bg-page py-4">
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
      </div>
    </form>
  )
}
