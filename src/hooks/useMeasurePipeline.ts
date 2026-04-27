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

// iOS Safari does not reliably honour scrollBy() while momentum scroll is in progress.
// Detect once and cache — UA string is stable for the session.
const _isMobileSafari =
  typeof navigator !== "undefined" &&
  /iP(ad|od|hone)/i.test(navigator.userAgent) &&
  /WebKit/i.test(navigator.userAgent) &&
  !/CriOS|FxiOS/.test(navigator.userAgent)

/**
 * Batches ResizeObserver measurements into a single RAF flush.
 *
 * Problem solved: the old synchronous measureItem applied scroll compensation
 * per-item. With 20+ items measuring simultaneously (initial render, font load,
 * image decode), that triggered 20+ synchronous scrollTop writes, each forcing
 * a layout and potentially fighting the anchor restoration.
 *
 * Solution: accumulate all measurements in a Map, flush in one RAF with a
 * single scroll correction = sum of all deltas above the viewport.
 *
 * Scroll correction uses scrollBy() (relative, atomic) instead of scrollTop +=
 * (read-modify-write, prone to races with the browser's scroll handling).
 * On mobile Safari during active momentum scroll, we use a CSS deviation
 * (translateY on the inner container) which is reset once scrolling stops.
 */
export function useMeasurePipeline(options: MeasurePipelineOptions) {
  const { offsetMapRef, sizeCacheRef, keyIndexRef, scrollerRef, innerRef, stateMachine, onBatchFlushed } = options

  const pendingRef = useRef(new Map<string | number, number>())
  const rafRef = useRef<number | null>(null)
  // CSS deviation applied to innerRef on mobile Safari during active scroll
  const deviationRef = useRef(0)
  // Whether the scroll container is currently mid-momentum (touchmove / wheel inertia)
  const isScrollingRef = useRef(false)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track scroll activity so we can choose the right compensation strategy.
  // We attach this listener lazily when the element is available.
  const attachScrollTrackerIfNeeded = useCallback(() => {
    const el = scrollerRef.current
    if (!el || (el as HTMLElement & { __anchorScrollTracked?: boolean }).__anchorScrollTracked) return
    ;(el as HTMLElement & { __anchorScrollTracked?: boolean }).__anchorScrollTracked = true

    const onScroll = () => {
      isScrollingRef.current = true
      if (scrollEndTimerRef.current !== null) clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        isScrollingRef.current = false
        scrollEndTimerRef.current = null

        // Flush any pending deviation accumulated during mobile Safari scroll
        if (_isMobileSafari && deviationRef.current !== 0 && innerRef.current) {
          const accumulated = deviationRef.current
          deviationRef.current = 0
          innerRef.current.style.transform = ""
          el.scrollBy({ top: accumulated })
        }
      }, 150)
    }

    el.addEventListener("scroll", onScroll, { passive: true })
  }, [scrollerRef, innerRef])

  const flush = useCallback(() => {
    rafRef.current = null
    const pending = pendingRef.current
    if (pending.size === 0) return
    pendingRef.current = new Map()

    attachScrollTrackerIfNeeded()

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

      // Accumulate compensation only for items above the viewport top.
      // Skip during anchor restore AND during initial settling animation —
      // both states own scrollTop and must not be interfered with.
      const state = stateMachine.getState()
      if (el && state !== "restoring" && state !== "animating") {
        const itemTop = om.getOffset(index) + innerOffset
        if (itemTop < el.scrollTop) {
          scrollDelta += size - oldSize
        }
      }
    }

    if (el && scrollDelta !== 0 && !stateMachine.isRestoring()) {
      if (_isMobileSafari && isScrollingRef.current) {
        // Mobile Safari: accumulate deviation as CSS transform on the inner container.
        // scrollBy() is silently ignored during momentum scroll on iOS.
        // The deviation is converted to a real scrollBy() once scrolling stops.
        deviationRef.current += scrollDelta
        if (innerRef.current) {
          innerRef.current.style.transform = `translateY(${-deviationRef.current}px)`
        }
      } else {
        // Desktop / non-Safari: scrollBy is atomic and safe during scroll events.
        el.scrollBy({ top: scrollDelta })
      }
    }

    if (changed) onBatchFlushed()
  }, [offsetMapRef, sizeCacheRef, keyIndexRef, scrollerRef, innerRef, stateMachine, onBatchFlushed, attachScrollTrackerIfNeeded])

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
