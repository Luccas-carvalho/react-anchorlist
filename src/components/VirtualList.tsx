import * as React from "react"
import { useVirtualEngine } from "../hooks/useVirtualEngine"
import { VirtualItemComponent } from "./VirtualItem"
import {
  buildReachedRootMargin,
  getThresholdPixels,
  parseReachedThreshold,
} from "../core/reachedThreshold"
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

  const endSentinelRef = React.useRef<HTMLDivElement>(null)
  const onEndReachedRef = React.useRef(onEndReached)
  React.useEffect(() => {
    onEndReachedRef.current = onEndReached
  }, [onEndReached])
  const inFlightRef = React.useRef(false)
  const triggeredRef = React.useRef(false)

  React.useEffect(() => {
    const el = scrollerRef.current
    const sentinel = endSentinelRef.current
    if (!el || !sentinel || !onEndReachedRef.current) return

    triggeredRef.current = false
    const threshold = parseReachedThreshold(endReachedThreshold, 300)

    const trigger = () => {
      const callback = onEndReachedRef.current
      if (!callback || inFlightRef.current) return
      inFlightRef.current = true
      Promise.resolve(callback()).finally(() => {
        inFlightRef.current = false
      })
    }

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          if (!entry.isIntersecting) {
            triggeredRef.current = false
            return
          }
          if (triggeredRef.current || inFlightRef.current) return
          triggeredRef.current = true
          trigger()
        },
        {
          root: el,
          rootMargin: buildReachedRootMargin(threshold, "end"),
          threshold: 0,
        }
      )

      observer.observe(sentinel)
      return () => observer.disconnect()
    }

    const handler = () => {
      const thresholdPx = getThresholdPixels(threshold, el.clientHeight)
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearEnd = dist <= thresholdPx

      if (!nearEnd) {
        triggeredRef.current = false
        return
      }
      if (triggeredRef.current || inFlightRef.current) return
      triggeredRef.current = true
      trigger()
    }

    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [scrollerRef, onEndReached, endReachedThreshold, data.length])

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
      <div
        ref={endSentinelRef}
        aria-hidden="true"
        style={{ position: "relative", width: "100%", height: 1, pointerEvents: "none" }}
      />
    </div>
  )
}
