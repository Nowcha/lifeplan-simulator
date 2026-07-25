import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { UndoContext } from './undoContext'

/**
 * 直前の取り消し可能な操作(削除・参照の一括更新など)を1件だけ戻せるようにする。
 *
 * フォーム全体をスナップショットして reset() で戻す方式は実装が簡単だが、
 * 削除後に別の編集をしてから取り消すとその編集まで巻き戻る。ここでは
 * 「削除された要素を元の位置に差し戻す」関数を呼び出し側から受け取り、
 * 取り消しの影響を削除した項目だけに閉じる。
 */

interface UndoEntry {
  message: string
  undo: () => void
}

/** 取り消しの申し出を出しておく時間。長く残すとフォームの状態と食い違いやすい。 */
const UNDO_TIMEOUT_MS = 12_000

export function UndoProvider({ children }: { children: (banner: ReactNode) => ReactNode }) {
  const [entry, setEntry] = useState<UndoEntry | null>(null)

  const pushUndo = useCallback((message: string, undo: () => void) => {
    setEntry({ message, undo })
  }, [])

  useEffect(() => {
    if (entry === null) return
    const id = setTimeout(() => setEntry(null), UNDO_TIMEOUT_MS)
    return () => clearTimeout(id)
  }, [entry])

  const value = useMemo(() => ({ pushUndo }), [pushUndo])

  const banner =
    entry === null ? null : (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm border border-hairline-strong bg-surface-2 px-4 py-3 text-sm"
      >
        <span className="text-ink-secondary">{entry.message}</span>
        <button
          type="button"
          onClick={() => {
            entry.undo()
            setEntry(null)
          }}
          className="min-h-11 rounded-sm border border-hairline-strong px-3 py-1 text-sm text-ink hover:border-amber-500 hover:text-amber-700 sm:min-h-0"
        >
          元に戻す
        </button>
      </div>
    )

  return <UndoContext.Provider value={value}>{children(banner)}</UndoContext.Provider>
}
