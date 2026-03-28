import * as React from "react"
import { useVirtualEngine } from "../hooks/useVirtualEngine"
import { VirtualItemComponent } from "./VirtualItem"
import type { VirtualItem, VirtualListProps } from "../types"

/** Simple virtualized list — no chat-specific features. Good for ticket lists, selects, etc. */
export function VirtualList<T>({
  data,
  itemContent,
  computeItemKey,
  estimatedItemSize = 60,
  overscan = 20,
  onEndReached,
  endReachedThreshold = 300,
  components = {},
  className,
  style,
}: VirtualListProps<T>) {
  const { scrollerRef, innerRef, virtualItems, totalSize, measureItem } = useVirtualEngine({
    items: data,
    getKey: (item: T, index: number) => computeItemKey(index, item),
    estimatedItemSize,
    overscan,
    initialAlignment: "top",
  })

  React.useEffect(() => {
    const el = scrollerRef.current
    if (!el || !onEndReached) return
    let inFlight = false
    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist <= endReachedThreshold && !inFlight) {
        inFlight = true
        Promise.resolve(onEndReached()).finally(() => {
          inFlight = false
        })
      }
    }
    el.addEventListener("scroll", handler, { passive: true })
    return () => el.removeEventListener("scroll", handler)
  }, [scrollerRef, onEndReached, endReachedThreshold])

  const { Header, Footer, EmptyPlaceholder } = components

  if (data.length === 0 && EmptyPlaceholder) return <EmptyPlaceholder />

  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{
        overflow: "auto",
        height: "100%",
        position: "relative",
        // Keep scrolling behavior deterministic when items are inserted above.
        overflowAnchor: "none",
        overscrollBehaviorY: "contain",
        ...style,
      }}
    >
      {Header && <Header />}
      <div ref={innerRef} style={{ height: totalSize, position: "relative", width: "100%" }}>
        {virtualItems.map((vItem) => (
          <VirtualItemComponent
            key={vItem.key}
            virtualItem={vItem as VirtualItem<unknown>}
            measureItem={measureItem}
          >
            {itemContent(vItem.index, vItem.data)}
          </VirtualItemComponent>
        ))}
      </div>
      {Footer && <Footer />}
    </div>
  )
}
