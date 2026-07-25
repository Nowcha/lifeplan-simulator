import { createContext, useContext } from 'react'

/**
 * 直前の削除を1件だけ取り消すための受け口。Provider 本体(undo.tsx)とは
 * ファイルを分けている — コンポーネントとフックを同じファイルからexportすると
 * Fast Refresh が効かなくなり、編集のたびにフックの順序不一致が起きるため。
 */
export interface UndoContextValue {
  /**
   * 取り消せる操作の直後に呼ぶ。`message` は「何が起きたか」の一文をそのまま渡す
   * (削除以外にも使うため、文言の組み立ては呼び出し側の責務)。
   * `undo` はその操作を打ち消す関数。
   */
  pushUndo: (message: string, undo: () => void) => void
}

export const UndoContext = createContext<UndoContextValue | null>(null)

/** Provider の外で使われた場合は no-op を返す(削除自体は成立させる) */
export function useUndo(): UndoContextValue {
  return useContext(UndoContext) ?? { pushUndo: () => {} }
}
