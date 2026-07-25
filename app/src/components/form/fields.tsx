import { forwardRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { useFormState } from 'react-hook-form'
import { fieldErrorMessage } from '../../lib/fieldError'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  /** ラベル横に "?" アイコンを出し、クリックで補足説明を表示する */
  help?: string
  /**
   * register() が展開する name。渡すと、そのフィールドのバリデーションエラーを
   * FormProvider から自分で取りに行く(呼び出し側でerrorsを配線しなくてよい)。
   */
  name?: string
  children: ReactNode
}

export function Field({ label, hint, error, help, name, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1.5 text-ink-secondary">
        {label}
        {help && <HelpBadge text={help} />}
      </span>
      {children}
      {/* name の有無でフックの呼び出し有無が変わらないよう、別コンポーネントに分ける */}
      {name === undefined ? (
        <FieldFeedback hint={hint} error={error} />
      ) : (
        <BoundFieldFeedback name={name} hint={hint} error={error} />
      )}
    </label>
  )
}

function FieldFeedback({ hint, error }: { hint?: string; error?: string }) {
  if (error !== undefined) return <span className="text-xs text-critical">{error}</span>
  if (hint !== undefined) return <span className="text-xs text-ink-muted">{hint}</span>
  return null
}

/** フォーム状態から自分のエラーだけを購読する(name指定なので他フィールドの変化では再描画されない) */
function BoundFieldFeedback({ name, hint, error }: { name: string; hint?: string; error?: string }) {
  const { errors } = useFormState({ name: name as never })
  return <FieldFeedback hint={hint} error={error ?? fieldErrorMessage(errors, name)} />
}

export function HelpBadge({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        onBlur={() => setOpen(false)}
        aria-label={`${text}について説明を表示`}
        aria-expanded={open}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[10px] leading-none text-ink-muted hover:border-amber-500 hover:text-amber-700"
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-20 mt-1.5 w-56 -translate-x-1/2 rounded-sm border border-hairline-strong bg-surface p-2.5 text-xs leading-relaxed font-normal text-ink-secondary shadow-md"
        >
          {text}
        </span>
      )}
    </span>
  )
}

/**
 * text-base(16px)→sm:text-sm(14px) の順は意図的。iOS Safari はフォントサイズが
 * 16px 未満の入力にフォーカスするとページを自動ズームするため、モバイルでは
 * 16px を維持する。高さもタップ領域の目安44pxに合わせ、広い画面で従来の詰まった
 * 見た目に戻す。
 */
const inputClass =
  'w-full min-h-11 rounded-sm border border-hairline-strong bg-surface px-3 py-1.5 text-base text-ink outline-none focus:border-amber-500 sm:min-h-0 sm:text-sm'

type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  help?: string
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, help, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} help={help} name={props.name}>
      <input ref={ref} className={`${inputClass} ${className ?? ''}`} {...props} />
    </Field>
  )
})

type MonthInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'placeholder'> & {
  label: string
  hint?: string
  error?: string
  help?: string
}

/** YearMonth("YYYY-MM")用のネイティブ月選択(カレンダーUI)。ブラウザ標準のtype="month"を使う。 */
export const MonthInput = forwardRef<HTMLInputElement, MonthInputProps>(function MonthInput(
  { label, hint, error, help, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} help={help} name={props.name}>
      <input ref={ref} type="month" className={`${inputClass} ${className ?? ''}`} {...props} />
    </Field>
  )
})

type NumberInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
  error?: string
  help?: string
  suffix?: string
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, hint, error, help, suffix, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} help={help} name={props.name}>
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
  help?: string
  options: { value: string; label: string }[]
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, hint, error, help, options, className, ...props },
  ref
) {
  return (
    <Field label={label} hint={hint} error={error} help={help} name={props.name}>
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
  /**
   * 削除確認に追記する警告(他から参照されている等)。全カードで常時計算すると
   * 入力のたびにフォーム全体を走査することになるため、クリック時に評価する。
   */
  getRemoveWarning?: () => string | undefined
  children: ReactNode
}

/**
 * 人物・費目・資産・イベントなど「まとまり」1件を表すカード。削除は取り消せず、
 * 入力済みの内容がまとめて消えるため確認を挟む(シナリオ削除・サンプル復帰と
 * 同じ扱いに揃える)。収入カーブの1行のようなサブ行はこの限りではない。
 */
export function ItemCard({ title, onRemove, getRemoveWarning, children }: ItemCardProps) {
  return (
    <div className="rounded-sm border border-hairline bg-surface p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="text-sm font-medium text-ink">{title}</h4>
        {onRemove && (
          <button
            type="button"
            onClick={() => {
              const warning = getRemoveWarning?.()
              const base = `「${title}」を削除します。入力した内容は元に戻せません。`
              const message = warning === undefined ? `${base}よろしいですか?` : `${base}\n\n${warning}\n\n削除しますか?`
              if (window.confirm(message)) onRemove()
            }}
            className="-my-2 shrink-0 px-2 py-2 text-xs text-ink-muted hover:text-critical"
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
