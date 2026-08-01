// @vitest-environment jsdom
import { useCallback } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useForm, type Path } from 'react-hook-form'
import { describe, expect, test } from 'vitest'
import { usePrimitiveArrayField } from '../usePrimitiveArrayField'

interface FormValues {
  items: string[]
}

describe('usePrimitiveArrayField', () => {
  test('更新関数は再描画後も同一で、常に最新の配列を更新する', async () => {
    const { result } = renderHook(() => {
      const form = useForm<FormValues>({ defaultValues: { items: ['a'] } })
      const setArrayValue = useCallback(
        (name: Path<FormValues>, value: string[]): void => form.setValue(name, value),
        [form]
      )
      const field = usePrimitiveArrayField<FormValues, string>(form.control, 'items', setArrayValue)
      return { field }
    })
    const initialAppend = result.current.field.append
    const initialRemove = result.current.field.remove
    const initialUpdate = result.current.field.update

    act(() => initialAppend('b'))
    await waitFor(() => expect(result.current.field.value).toEqual(['a', 'b']))

    expect(result.current.field.append).toBe(initialAppend)
    expect(result.current.field.remove).toBe(initialRemove)
    expect(result.current.field.update).toBe(initialUpdate)

    act(() => initialAppend('c'))
    await waitFor(() => expect(result.current.field.value).toEqual(['a', 'b', 'c']))
  })
})
