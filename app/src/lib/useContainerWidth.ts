import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 描画コンテナの実ピクセル幅を購読する。
 *
 * チャートのSVGは viewBox を実ピクセル幅と1:1にしないと、狭い画面で全体が
 * 縮小され軸ラベルが読めなくなる(920px幅のviewBoxを375pxに収めると文字は
 * 実効3.3pxになる)。幅を測ってレイアウトを組み直すためのフック。
 *
 * ResizeObserver に加えて window の resize も見る。ResizeObserver の配信は
 * レンダリングのライフサイクルに紐づくため、フレームを描画していない環境
 * (非表示タブやヘッドレス)では発火しないことがある。画面回転もここで拾える。
 */
export function useContainerWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const nodeRef = useRef<T | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

  const measure = useCallback(() => {
    const node = nodeRef.current
    if (node !== null) setWidth(node.clientWidth)
  }, [])

  const ref = useCallback(
    (node: T | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      nodeRef.current = node
      if (node === null) return

      setWidth(node.clientWidth)
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) setWidth(Math.round(entry.contentRect.width))
      })
      observer.observe(node)
      observerRef.current = observer
    },
    []
  )

  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      observerRef.current?.disconnect()
    }
  }, [measure])

  return [ref, width]
}
