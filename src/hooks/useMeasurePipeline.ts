import { useCallback, useEffect, useRef } from "react"
import type { OffsetMap } from "../core/offsetMap"
import type { ItemSizeCache } from "../core/itemSizeCache"
import type { KeyIndex } from "../core/keyIndex"
import type { ScrollStateMachine } from "./useScrollStateMachine"
import { createDeviationController, type DeviationController } from "../core/deviation"

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
 * Strategy:
 *   - Each VirtualItemComponent calls measureItem(key, size) on every observed
 *     resize. We accumulate in pendingRef until the next animation frame.
 *   - flush() applies all sizes to the offsetMap, then for items whose ITEM_TOP
 *     was above the scroll position (i.e. above the viewport), accumulates a
 *     scrollDelta — the visual shift the user would see if we did nothing.
 *   - The DeviationController applies that delta as a CSS transform first
 *     (instant, frame-coalesced) and then scrollBy on the next RAF, eliminating
 *     the single-frame visible jump that scrollBy alone produces. On mobile
 *     Safari mid-momentum, it falls back to pure marginTop accumulation since
 *     scrollBy is silently dropped during touch-driven scroll.
 *   - Compensation is suppressed while the state machine is in `restoring`
 *     (anchor restore owns scrollTop) or `animating` (initial alignment).
 *
 * flushPendingSync exists for useScrollAnchor's restore: it applies pending
 * measurements to the offsetMap WITHOUT touching scroll, since the restore
 * computes its own target.
 */
export function useMeasurePipeline(options: MeasurePipelineOptions) {
  const { offsetMapRef, sizeCacheRef, keyIndexRef, scrollerRef, innerRef, stateMachine, onBatchFlushed } = options

  const pendingRef = useRef(new Map<string | number, number>())
  const rafRef = useRef<number | null>(null)
  const deviationRef = useRef<DeviationController | null>(null)
  if (deviationRef.current === null) {
    deviationRef.current = createDeviationController()
  }

  // Attach DeviationController as soon as both refs resolve.
  useEffect(() => {
    const inner = innerRef.current
    const scroller = scrollerRef.current
    const dev = deviationRef.current
    if (!inner || !scroller || !dev) return
    dev.attach(inner, scroller)
    return () => dev.detach()
  }, [innerRef, scrollerRef])

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

      const oldSize = sizeCacheRef.current.get(key) ?? om.getSize(index)
      const didChange = om.setSize(index, size)
      if (!didChange) continue
      changed = true
      sizeCacheRef.current.set(key, size)

      const state = stateMachine.getState()
      if (el && state !== "restoring" && state !== "animating") {
        const itemTop = om.getOffset(index) + innerOffset
        if (itemTop < el.scrollTop) {
          scrollDelta += size - oldSize
        }
      }
    }

    if (el && scrollDelta !== 0 && !stateMachine.isRestoring()) {
      deviationRef.current?.schedule(scrollDelta)
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

  const flushPendingSync = useCallback(() => {
    const pending = pendingRef.current
    if (pending.size === 0) return

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    pendingRef.current = new Map()

    const om = offsetMapRef.current
    if (!om) return

    for (const [key, size] of pending) {
      const index = keyIndexRef.current.getIndex(key)
      if (index === undefined) continue
      const didChange = om.setSize(index, size)
      if (didChange) sizeCacheRef.current.set(key, size)
    }
  }, [offsetMapRef, sizeCacheRef, keyIndexRef])

  return { measureItem, flushPendingSync }
}
