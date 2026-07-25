import { useFieldArray, useFormContext, useWatch, type Control, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import type { LifeEvent } from '../../../../engine/types/index.js'
import type { ProfileFormValues } from '../../lib/profileStorage'
import { eventPath } from '../../lib/formPath'
import { AddButton, ItemCard, Section } from '../form/fields'
import { EVENT_TYPE_OPTIONS } from '../../lib/formOptions'
import { describeEventRemoval } from '../../lib/references'
import { useUndo } from '../../lib/undoContext'
import {
  ChildbirthEventFields,
  EducationPlanFields,
  HousingPurchaseEventFields,
  LoanPrepaymentEventFields,
  OneTimeEventFields,
  RecurringModifierEventFields
} from './EventFields'

interface EventsFormProps {
  control: Control<ProfileFormValues>
  register: UseFormRegister<ProfileFormValues>
  setValue: UseFormSetValue<ProfileFormValues>
}

type EventType = (typeof EVENT_TYPE_OPTIONS)[number]['value']

const EVENT_LABELS: Record<EventType, string> = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<EventType, string>

function defaultEventFor(type: EventType, id: string): LifeEvent {
  switch (type) {
    case 'childbirth':
      return { id, type, expectedYearMonth: '2027-01', childId: '', leavePlans: [], deliveryCost: 500000 }
    case 'housing-purchase':
      return {
        id,
        type,
        yearMonth: '2028-04',
        propertyPrice: 0,
        propertyType: 'new-mansion',
        downPayment: 0,
        closingCosts: 0,
        loans: [],
        holdingCosts: { propertyTaxAnnual: 0 },
        terminatesExpenseLabels: [],
        taxCreditEligibility: { eligible: true, category: 'other', hasChildOrYoungCouple: false }
      }
    case 'loan-prepayment':
      return { id, type, loanId: '', yearMonth: '2030-01', amount: 0, method: 'shorten-term' }
    case 'education':
      return {
        id,
        type,
        childId: '',
        stages: {
          nursery: 'hoikuen',
          elementary: 'public',
          juniorHigh: 'public',
          highSchool: 'public',
          university: 'private-liberal',
          universityHousing: 'home'
        }
      }
    case 'recurring':
      return { id, type, label: '新規イベント', startYearMonth: '2026-01', amount: 0, indexation: 'inflation' }
    case 'one-time':
      return { id, type, label: '新規イベント', yearMonth: '2026-01', amount: 0 }
  }
}

function EventItem({ index, control, register, setValue }: EventsFormProps & { index: number }) {
  const type = useWatch({ control, name: eventPath(index, 'type') }) as EventType

  switch (type) {
    case 'childbirth':
      return <ChildbirthEventFields index={index} control={control} register={register} setValue={setValue} />
    case 'housing-purchase':
      return <HousingPurchaseEventFields index={index} control={control} register={register} setValue={setValue} />
    case 'loan-prepayment':
      return <LoanPrepaymentEventFields index={index} control={control} register={register} setValue={setValue} />
    case 'education':
      return <EducationPlanFields index={index} control={control} register={register} setValue={setValue} />
    case 'recurring':
      return <RecurringModifierEventFields index={index} control={control} register={register} setValue={setValue} />
    case 'one-time':
      return <OneTimeEventFields index={index} control={control} register={register} setValue={setValue} />
    default:
      return null
  }
}

export function EventsForm({ control, register, setValue }: EventsFormProps) {
  const events = useFieldArray({ control, name: 'events' })
  const { getValues } = useFormContext<ProfileFormValues>()
  const { pushUndo } = useUndo()

  return (
    <Section
      title="ライフイベント"
      note="出産・住宅購入・教育プランなど、家計に影響する出来事。追加すると一番下に新しい項目が入るので、種類を選んでから内容を入力する。"
    >
      <div className="mb-5 flex flex-wrap gap-2">
        {EVENT_TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => events.append(defaultEventFor(opt.value, `event-${Date.now()}-${events.fields.length}`))}
            className="rounded-sm border border-dashed border-hairline-strong px-3 py-1.5 text-xs text-ink-secondary hover:border-amber-500 hover:text-amber-700"
          >
            + {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {(() => {
          const typeCounters: Partial<Record<EventType, number>> = {}
          return events.fields.map((field, index) => {
            const type = (field as unknown as { type: EventType }).type
            typeCounters[type] = (typeCounters[type] ?? 0) + 1
            return (
              <ItemCard
                key={field.id}
                title={`${EVENT_LABELS[type] ?? type}${typeCounters[type]}`}
                onRemove={() => {
                  const label = `${EVENT_LABELS[type] ?? type}${typeCounters[type] ?? ''}`
                  const removed = getValues(`events.${index}`)
                  events.remove(index)
                  pushUndo(`「${label}」を削除しました。`, () => events.insert(index, removed))
                }}
                getRemoveWarning={() => describeEventRemoval(getValues(), index)}
              >
                <EventItem index={index} control={control} register={register} setValue={setValue} />
              </ItemCard>
            )
          })
        })()}
      </div>

      {events.fields.length === 0 && <AddButton label="イベントを追加" onClick={() => events.append(defaultEventFor('one-time', `event-${Date.now()}`))} />}
    </Section>
  )
}
