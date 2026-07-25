import { createContext, useContext } from 'react'

/**
 * 直前の削除を1件だけ取り消すための受け口。Provider 本体(undo.tsx)とは
 * ファイルを分けている — コンポーネントとフックを同じファイルからexportすると
 * Fast Refresh が効かなくなり、編集のたびにフックの順序不一致が起きるため。
 */
export interface UndoContextValue {
  /** 削除の直後に呼ぶ。`undo` は削除した要素を元の位置に差し戻す関数。 */
  pushUndo: (label: string, undo: () => void) => void
}

export const UndoContext = createContext<UndoContextValue | null>(null)

/** Provider の外で使われた場合は no-op を返す(削除自体は成立させる) */
export function useUndo(): UndoContextValue {
  return useContext(UndoContext) ?? { pushUndo: () => {} }
}
