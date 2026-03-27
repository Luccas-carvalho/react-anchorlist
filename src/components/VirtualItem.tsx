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
 */
export function VirtualItemComponent({
  virtualItem,
  measureItem,
  children,
}: VirtualItemProps) {
  const ref = useRef<HTMLDivElement>(null)
  const measuredRef = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measuredRef.current = false
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        measuredRef.current = true
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
        // transform instead of top: avoids reflow, uses GPU compositor layer
        transform: `translateY(${virtualItem.start}px)`,
        width: "100%",
        // Only reserve estimated height before first measurement.
        // After measurement, let the item take its natural height so
        // ResizeObserver can accurately report the real size.
        // Without this, items can never be smaller than estimatedItemSize,
        // which distorts offsets and total height.
        minHeight: measuredRef.current ? undefined : virtualItem.size,
      }}
    >
      {children}
    </div>
  )
}
