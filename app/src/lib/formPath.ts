import type { Path } from 'react-hook-form'
import type { ProfileFormValues } from './profileStorage'

/**
 * events[index] は LifeEvent の判別共用体なので、react-hook-form の Path<T> は
 * 「index番目が特定のバリアントである」ことを静的に表現できない。呼び出し側で
 * event.type を実行時に確認した上でこのヘルパーを使う。
 */
export function eventPath(index: number, key: string): Path<ProfileFormValues> {
  return `events.${index}.${key}` as Path<ProfileFormValues>
}
