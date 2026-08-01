import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { useFormState } from 'react-hook-form'
import { fieldErrorMessage } from '../../lib/fieldError'
import { MaterialIcon } from './MaterialIcon'

/** Field が入力要素に渡す属性。各入力ラッパーはこれをそのまま展開する。 */
export interface FieldControlAttributes {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

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
  children: (control: FieldControlAttributes) => ReactNode
}

export function Field({ name, ...rest }: FieldProps) {
  // name の有無でフックの呼び出し有無が変わらないよう、別コンポーネントに分ける
  return name === undefined ? <FieldShell {...rest} /> : <BoundField name={name} {...rest} />
}

/** フォーム状態から自分のエラーだけを購読する(name指定なので他フィールドの変化では再描画されない) */
function BoundField({ name, error, ...rest }: FieldProps & { name: string }) {
  const { errors } = useFormState({ name: name as never })
  return <FieldShell {...rest} error={error ?? fieldErrorMessage(errors, name)} />
}

/**
 * ラベル・入力・補足/エラーの土台。
 *
 * 以前は <label> が入力とhint/エラーを丸ごと包んでいたため、それらがすべて
 * 入力のアクセシブル名に連結されていた(「項目名 表示名として使われます」)。
 * 名前は <label htmlFor> だけが与え、hint/エラーは aria-describedby で
 * 「説明」として関連付ける。エラー時は aria-invalid も立てる。
 */
function FieldShell({ label, hint, error, help, children }: Omit<FieldProps, 'name'>) {
  const id = useId()
  const feedbackId = `${id}-feedback`
  const feedback = error ?? hint

  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-1.5 text-ink-secondary">
        <label htmlFor={id}>{label}</label>
        {help && <HelpBadge text={help} />}
      </span>
      {children({
        id,
        'aria-describedby': feedback === undefined ? undefined : feedbackId,
        'aria-invalid': error === undefined ? undefined : true
      })}
      {feedback !== undefined && (
        <span id={feedbackId} className={error === undefined ? 'text-xs text-ink-muted' : 'text-xs text-critical'}>
          {feedback}
        </span>
      )}
    </div>
  )
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
        <MaterialIcon name="help" />
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
      {(control) => <input ref={ref} className={`${inputClass} ${className ?? ''}`} {...props} {...control} />}
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
      {(control) => <input ref={ref} type="month" className={`${inputClass} ${className ?? ''}`} {...props} {...control} />}
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
      {(control) => (
        <div className="flex items-center gap-2">
          <input ref={ref} type="number" className={`${inputClass} ${className ?? ''}`} {...props} {...control} />
          {suffix && <span className="shrink-0 text-xs text-ink-muted">{suffix}</span>}
        </div>
      )}
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
      {(control) => (
        <select ref={ref} className={`${inputClass} ${className ?? ''}`} {...props} {...control}>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}
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
            className="-my-2 inline-flex shrink-0 items-center gap-1 px-2 py-2 text-xs text-ink-muted hover:text-critical"
          >
            <MaterialIcon name="delete" />
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
      className="inline-flex items-center gap-1 rounded-sm border border-dashed border-hairline-strong px-4 py-2 text-sm text-ink-secondary hover:border-amber-500 hover:text-amber-700"
    >
      <MaterialIcon name="add" />
      {label}
    </button>
  )
}
