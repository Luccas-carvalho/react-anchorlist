import { useEffect, useLayoutEffect, useRef } from "react"
import type { VirtualItem } from "../types"

interface VirtualItemProps {
  virtualItem: VirtualItem<unknown>
  measureItem: (key: string | number, size: number) => void
  children: React.ReactNode
}

/**
 * Wrapper for a single virtualized item.
 * - Positioned with CSS transform (GPU compositor — no layout reflow)
 * - useLayoutEffect: synchronous measure before paint → eliminates 1-frame flash of estimated sizes
 * - ResizeObserver: continuous measurement using borderBoxSize (includes padding, more accurate)
 * - NO minHeight — absolutely positioned items don't affect siblings
 */
export function VirtualItemComponent({
  virtualItem,
  measureItem,
  children,
}: VirtualItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Synchronous measurement before paint. Eliminates the 1-frame flash where
  // estimated sizes are used before ResizeObserver fires asynchronously.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const size = Math.round(el.getBoundingClientRect().height)
    if (size > 0) measureItem(virtualItem.key, size)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      // borderBoxSize includes padding — more accurate than contentRect.
      // Falls back to contentRect for older browsers.
      const size =
        entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height
      measureItem(virtualItem.key, Math.round(size))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [virtualItem.key, measureItem])

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        top: 0,
        transform: `translateY(${virtualItem.start}px)`,
        width: "100%",
        // Promote each item to its own compositor layer so translateY
        // updates bypass main-thread layout and paint.
        willChange: "transform",
        // Contain layout so ResizeObserver changes don't propagate upward.
        contain: "layout",
      }}
    >
      {children}
    </div>
  )
}
