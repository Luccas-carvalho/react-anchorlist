import { useCallback, useRef } from "react"
import type { OffsetMap } from "../core/offsetMap"
import type { ItemSizeCache } from "../core/itemSizeCache"
import type { KeyIndex } from "../core/keyIndex"
import type { ScrollStateMachine } from "./useScrollStateMachine"

interface MeasurePipelineOptions {
  offsetMapRef: React.MutableRefObject<OffsetMap | null>
  sizeCacheRef: React.MutableRefObject<ItemSizeCache>
  keyIndexRef: React.MutableRefObject<KeyIndex>
  scrollerRef: React.RefObject<HTMLDivElement>
  innerRef: React.RefObject<HTMLDivElement>
  stateMachine: ScrollStateMachine
  onBatchFlushed: () => void
}

/**
 * Batches ResizeObserver measurements into a single RAF flush.
 *
 * Problem solved: the old synchronous measureItem applied scroll compensation
 * per-item. With 20+ items measuring simultaneously (initial render, font load,
 * image decode), that triggered 20+ synchronous scrollTop writes, each forcing
 * a layout and potentially fighting the anchor restoration.
 *
 * Solution: accumulate all measurements in a Map, flush in one RAF with a
 * single scrollTop correction = sum of all deltas above the viewport.
 */
export function useMeasurePipeline(options: MeasurePipelineOptions) {
  const { offsetMapRef, sizeCacheRef, keyIndexRef, scrollerRef, innerRef, stateMachine, onBatchFlushed } = options

  const pendingRef = useRef(new Map<string | number, number>())
  const rafRef = useRef<number | null>(null)

  const flush = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    if (pending.size === 0) return
    pendingRef.current = new Map()

    const om = offsetMapRef.current
    if (!om) return

    const el = scrollerRef.current
    const innerOffset = innerRef.current?.offsetTop ?? 0
    let scrollDelta = 0
    let changed = false

    for (const [key, size] of pending) {
      const index = keyIndexRef.current.getIndex(key)
      if (index === undefined) continue

      // Capture old size BEFORE setSize so delta is correct
      const oldSize = sizeCacheRef.current.get(key) ?? om.getSize(index)
      const didChange = om.setSize(index, size)
      if (!didChange) continue
      changed = true
      sizeCacheRef.current.set(key, size)

      // Accumulate compensation only for items above the viewport top.
      // Skip during anchor restore AND during initial settling animation —
      // both states own scrollTop and must not be fought.
      const state = stateMachine.getState()
      if (el && state !== "restoring" && state !== "animating") {
        const itemTop = om.getOffset(index) + innerOffset
        if (itemTop < el.scrollTop) {
          scrollDelta += size - oldSize
        }
      }
    }

    if (el && scrollDelta !== 0 && !stateMachine.isRestoring()) {
      el.scrollTop += scrollDelta
    }

    if (changed) onBatchFlushed()
  }, [offsetMapRef, sizeCacheRef, keyIndexRef, scrollerRef, innerRef, stateMachine, onBatchFlushed])

  const measureItem = useCallback((key: string | number, size: number) => {
    const prevSize = sizeCacheRef.current.get(key)
    if (prevSize === size) return

    pendingRef.current.set(key, size)

    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flush)
    }
  }, [sizeCacheRef, flush])

  return { measureItem }
}
