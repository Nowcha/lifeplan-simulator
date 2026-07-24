/**
 * react-hook-form の useFieldArray はオブジェクト配列専用(内部でid付与が必要)。
 * string[] / number[][] のようなプリミティブ配列は useWatch + setValue で
 * 手動管理する — このフックはその共通ロジックをまとめたもの。
 *
 * TItem は呼び出し側で明示指定する: 判別共用体のイベント配列を経由するパス
 * (formPath.tsのeventPath)は型が Path<T> に消去されるため、要素型を自動推論
 * できない。
 */
import { useCallback } from 'react'
import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form'

export function usePrimitiveArrayField<TFieldValues extends FieldValues, TItem>(
  control: Control<TFieldValues>,
  name: Path<TFieldValues>,
  setValue: (name: Path<TFieldValues>, value: TItem[]) => void
) {
  const watched = useWatch({ control, name })
  const value = (watched ?? []) as TItem[]

  const append = useCallback((item: TItem) => setValue(name, [...value, item]), [name, setValue, value])
  const remove = useCallback((index: number) => setValue(name, value.filter((_, i) => i !== index)), [name, setValue, value])
  const update = useCallback(
    (index: number, item: TItem) => setValue(name, value.map((v, i) => (i === index ? item : v))),
    [name, setValue, value]
  )

  return { value, append, remove, update }
}
