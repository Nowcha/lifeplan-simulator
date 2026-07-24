import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-ink-secondary">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-muted">{hint}</span>}
      {error && <span className="text-xs text-critical">{error}</span>}
    </label>
  )
}

const inputClass =
  'w-full rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-ink outline-none focus:border-amber-500'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error}>
      <input ref={ref} className={`${inputClass} ${className ?? ''}`} {...props} />
    </Field>
  )
})

type NumberInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  suffix?: string
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, hint, error, suffix, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input ref={ref} type="number" className={`${inputClass} ${className ?? ''}`} {...props} />
        {suffix && <span className="shrink-0 text-xs text-ink-muted">{suffix}</span>}
      </div>
    </Field>
  )
})

type SelectInputProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  hint?: string
  error?: string
  options: { value: string; label: string }[]
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, hint, error, options, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error}>
      <select ref={ref} className={`${inputClass} ${className ?? ''}`} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </Field>
  )
})

type CheckboxInputProps = InputHTMLAttributes<HTMLInputElement> & { label: string }

export const CheckboxInput = forwardRef<HTMLInputElement, CheckboxInputProps>(function CheckboxInput(
  { label, className, ...props },
  ref
) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink-secondary">
      <input ref={ref} type="checkbox" className={`h-4 w-4 accent-amber-500 ${className ?? ''}`} {...props} />
      {label}
    </label>
  )
})

interface SectionProps {
  title: string
  note?: string
  children: ReactNode
  actions?: ReactNode
}

export function Section({ title, note, children, actions }: SectionProps) {
  return (
    <section className="border-t border-hairline py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-medium text-ink">{title}</h3>
          {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  )
}

interface ItemCardProps {
  title: string
  onRemove?: () => void
  children: ReactNode
}

export function ItemCard({ title, onRemove, children }: ItemCardProps) {
  return (
    <div className="rounded-sm border border-hairline bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-medium text-ink">{title}</h4>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-xs text-ink-muted hover:text-critical"
          >
            削除
          </button>
        )}
      </div>
      {children}
    </div>
  )
}

export function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-sm border border-dashed border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-amber-500 hover:text-amber-700"
    >
      + {label}
    </button>
  )
}
