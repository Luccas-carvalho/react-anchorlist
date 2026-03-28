import { useEffect, useRef } from "react"
import type { VirtualItem } from "../types"

interface VirtualItemProps {
  virtualItem: VirtualItem<unknown>
  measureItem: (key: string | number, size: number) => void
  children: React.ReactNode
}

/**
 * Wrapper for a single virtualized item.
 * - Positioned with CSS transform (GPU compositor — no layout reflow)
 * - ResizeObserver measures real height and reports back to the engine
 * - NO minHeight — items are absolutely positioned so their height
 *   doesn't affect siblings. This ensures a single-pass measurement
 *   (no two-step estimate→real that causes visible blinks).
 */
export function VirtualItemComponent({
  virtualItem,
  measureItem,
  children,
}: VirtualItemProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        measureItem(virtualItem.key, entry.contentRect.height)
      }
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
      }}
    >
      {children}
    </div>
  )
}
