import type { ReactElement } from 'react'

export type MaterialIconName = 'add' | 'arrow_back' | 'close' | 'delete' | 'help'

interface MaterialIconProps {
  name: MaterialIconName
  className?: string
}

/** Google Fonts の Material Symbols を装飾アイコンとして描画する。 */
export function MaterialIcon({ name, className = '' }: MaterialIconProps): ReactElement {
  return (
    <span aria-hidden="true" className={`material-symbols-outlined ${className}`.trim()}>
      {name}
    </span>
  )
}
