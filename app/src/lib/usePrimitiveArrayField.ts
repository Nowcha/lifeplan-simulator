/**
 * react-hook-form の useFieldArray はオブジェクト配列専用(内部でid付与が必要)。
 * string[] / number[][] のようなプリミティブ配列は useWatch + setValue で
 * 手動管理する — このフックはその共通ロジックをまとめたもの。
 *
 * TItem は呼び出し側で明示指定する: 判別共用体のイベント配列を経由するパス
 * (formPath.tsのeventPath)は型が Path<T> に消去されるため、要素型を自動推論
 * できない。
 */
import { useCallback, useRef } from 'react'
import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form'

export interface PrimitiveArrayField<TItem> {
  value: TItem[]
  append: (item: TItem) => void
  remove: (index: number) => void
  update: (index: number, item: TItem) => void
}

export function usePrimitiveArrayField<TFieldValues extends FieldValues, TItem>(
  control: Control<TFieldValues>,
  name: Path<TFieldValues>,
  setValue: (name: Path<TFieldValues>, value: TItem[]) => void
): PrimitiveArrayField<TItem> {
  const watched = useWatch({ control, name })
  const value = (watched ?? []) as TItem[]
  const valueRef = useRef(value)
  const setValueRef = useRef(setValue)
  valueRef.current = value
  setValueRef.current = setValue

  const append = useCallback((item: TItem): void => {
    setValueRef.current(name, [...valueRef.current, item])
  }, [name])
  const remove = useCallback((index: number): void => {
    setValueRef.current(name, valueRef.current.filter((_, i) => i !== index))
  }, [name])
  const update = useCallback(
    (index: number, item: TItem): void => {
      setValueRef.current(name, valueRef.current.map((valueItem, i) => (i === index ? item : valueItem)))
    },
    [name]
  )

  return { value, append, remove, update }
}
