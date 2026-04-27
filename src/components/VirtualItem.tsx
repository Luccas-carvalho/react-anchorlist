import { useEffect, useLayoutEffect, useRef } from "react"
import type { VirtualItem } from "../types"

interface VirtualItemProps {
  virtualItem: VirtualItem<unknown>
  measureItem: (key: string | number, size: number) => void
  children: React.ReactNode
}

/**
 * Wrapper for a single virtualized item.
 * - Positioned absolutely with translateY so each item lives at its own Y inside
 *   the inner container, regardless of sibling render order. This lets the engine
 *   render non-contiguous virtual items (e.g. force-rendered prepended items in
 *   addition to the normal viewport range) without breaking layout.
 * - useLayoutEffect synchronously measures via getBoundingClientRect right after
 *   commit; combined with React's children-before-parent layout-effect order, this
 *   feeds real heights to the offsetMap before anchor-restore runs in the parent.
 * - ResizeObserver with borderBoxSize tracks subsequent height changes (image
 *   decode, font load, content edits).
 * - overflowAnchor: none disables the browser's automatic scroll-anchoring; the
 *   library owns scroll preservation explicitly.
 */
export function VirtualItemComponent({
  virtualItem,
  measureItem,
  children,
}: VirtualItemProps) {
  const ref = useRef<HTMLDivElement>(null)

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
      data-index={virtualItem.index}
      data-known-size={virtualItem.size}
      style={{
        position: "absolute",
        top: 0,
        transform: `translateY(${virtualItem.start}px)`,
        width: "100%",
        willChange: "transform",
        contain: "layout",
        overflowAnchor: "none",
      }}
    >
      {children}
    </div>
  )
}
