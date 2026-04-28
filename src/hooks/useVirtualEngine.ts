import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { OffsetMap } from "../core/offsetMap"
import { ItemSizeCache } from "../core/itemSizeCache"
import { KeyIndex } from "../core/keyIndex"
import { detectMutation } from "../core/diff"
import { captureAnchorSnapshot } from "../core/scrollAnchor"
import { calcRenderRange } from "../core/rangeCalc"
import { useScrollToIndex } from "./useScrollToIndex"
import { useScrollStateMachine } from "./useScrollStateMachine"
import { useMeasurePipeline } from "./useMeasurePipeline"
import type { MeasureBatchController } from "../core/measureBatch"
import type { AnchorSnapshot, UseVirtualEngineReturn, VirtualItem } from "../types"

// Schedules a callback for an idle browser frame. Falls back to setTimeout(16)
// in browsers without requestIdleCallback (Safari < 17). 200ms timeout caps
// waiting — aggressive convergence for pre-measure under user load.
function scheduleIdle(cb: () => void): void {
  if (typeof window === "undefined") return
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
  }
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(cb, { timeout: 200 })
  } else {
    setTimeout(cb, 16)
  }
}

export function useVirtualEngine<T>(options: {
  items: T[]
  getKey: (item: T, index: number) => string | number
  estimatedItemSize: number
  overscan: number
  initialAlignment: "top" | "bottom"
  getItemEstimate?: (item: T, index: number) => number
  measureBatch?: MeasureBatchController<T>
  preMeasureMode?: "lazy" | "aggressive"
}): UseVirtualEngineReturn<T> {
  const {
    items,
    getKey,
    estimatedItemSize,
    overscan,
    initialAlignment,
    getItemEstimate,
    measureBatch,
    preMeasureMode = "lazy",
  } = options

  const scrollerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const offsetMapRef = useRef<OffsetMap | null>(null)
  const sizeCacheRef = useRef(new ItemSizeCache())
  const keyIndexRef = useRef(new KeyIndex())

  const prevKeysRef = useRef<(string | number)[]>([])

  const initialScrollDone = useRef(false)
  const scrollTopRef = useRef(0)
  const containerHeightRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  const settlingRef = useRef(false)
  const settlingRafRef = useRef<number | null>(null)

  const prevRangeRef = useRef<{ start: number; end: number } | null>(null)

  // Set when a prepend mutation just happened — forces the next render to include
  // ALL prepended items in the virtualItems output (in addition to the normal
  // overscan range). This guarantees those items mount, get measured via
  // useLayoutEffect+ResizeObserver, and have real sizes in the offsetMap BEFORE
  // useScrollAnchor's anchor-restore layoutEffect runs (children-before-parent).
  // Cleared by clearJustPrepended() invoked from onRestored, then a re-render
  // shrinks back to the normal range.
  const justPrependedCountRef = useRef(0)

  const [, setTick] = useState(0)
  const forceRender = useCallback(() => setTick((t) => t + 1), [])

  const stateMachine = useScrollStateMachine()

  if (!offsetMapRef.current) {
    offsetMapRef.current = new OffsetMap(items.length, estimatedItemSize)
  }

  const newKeys = items.map((item, i) => getKey(item, i))
  const prevKeys = prevKeysRef.current
  const keysChanged =
    newKeys.length !== prevKeys.length ||
    newKeys[0] !== prevKeys[0] ||
    newKeys[newKeys.length - 1] !== prevKeys[prevKeys.length - 1]

  if (keysChanged) {
    const om = offsetMapRef.current!
    const mutation = detectMutation(prevKeys, newKeys)

    switch (mutation.type) {
      case "initial":
        om.resize(newKeys.length)
        break
      case "cleared":
        om.resize(0)
        break
      case "prepend": {
        if (getItemEstimate) {
          const perItemSizes: number[] = []
          for (let i = 0; i < mutation.count; i++) {
            perItemSizes.push(getItemEstimate(items[i] as T, i))
          }
          om.prepend(mutation.count, perItemSizes)
        } else {
          const avgSize = sizeCacheRef.current.getAverageSize() ?? estimatedItemSize
          om.prepend(mutation.count, Math.round(avgSize))
        }
        justPrependedCountRef.current = mutation.count
        break
      }
      case "append":
        om.append(mutation.count)
        break
      default:
        om.resize(newKeys.length)
    }

    keyIndexRef.current.rebuild(newKeys)
    sizeCacheRef.current.applyToOffsetMap(om, new Map(newKeys.map((k, i) => [k, i])))
    prevKeysRef.current = newKeys
    prevRangeRef.current = null
  }

  const { measureItem, flushPendingSync } = useMeasurePipeline({
    offsetMapRef,
    sizeCacheRef,
    keyIndexRef,
    scrollerRef,
    innerRef,
    stateMachine,
    onBatchFlushed: forceRender,
  })

  // Imperative clear used by useScrollAnchor's onRestored callback:
  // releases the expanded render range so the next render shrinks back
  // to the normal overscan window.
  const clearJustPrepended = useCallback(() => {
    if (justPrependedCountRef.current > 0) {
      justPrependedCountRef.current = 0
      forceRender()
    }
  }, [forceRender])

  // Aggressive pre-measure: schedules unmeasured items to be rendered in a
  // hidden container during idle frames, so their real heights populate the
  // sizeCache + offsetMap BEFORE the user scrolls past them. Eliminates the
  // residual flick caused by estimate error in items the user has not yet
  // entered the render window for.
  useEffect(() => {
    if (preMeasureMode !== "aggressive") return
    if (!measureBatch) return
    const om = offsetMapRef.current
    if (!om || om.count === 0) return

    const cached = sizeCacheRef.current
    const unmeasured: Array<{ key: string | number; index: number; data: T }> = []
    for (let i = 0; i < items.length; i++) {
      const key = keyIndexRef.current.getKey(i)
      if (key === undefined || key === null) continue
      if (cached.has(key)) continue
      unmeasured.push({ key, index: i, data: items[i]! })
    }

    if (unmeasured.length === 0) return

    let cancelled = false
    const BATCH_SIZE = 30

    const measureNextBatch = () => {
      if (cancelled) return
      const batch = unmeasured.splice(0, BATCH_SIZE)
      if (batch.length === 0) return

      measureBatch.measure(batch).then((sizes) => {
        if (cancelled) return
        const omNow = offsetMapRef.current
        if (!omNow) return
        for (const [key, size] of sizes) {
          if (size <= 0) continue
          cached.set(key, size)
          const idx = keyIndexRef.current.getIndex(key)
          if (idx !== undefined) omNow.setSize(idx, size)
        }
        forceRender()

        if (unmeasured.length > 0) scheduleIdle(measureNextBatch)
      })
    }

    scheduleIdle(measureNextBatch)

    return () => {
      cancelled = true
    }
  }, [items, preMeasureMode, measureBatch, forceRender])

  // Scroll handler — rAF throttled + flushSync
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const handler = () => {
      scrollTopRef.current = el.scrollTop

      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null

        const nextScrollTop = el.scrollTop
        const nextHeight = el.clientHeight

        const om = offsetMapRef.current
        if (om && om.count > 0) {
          const innerOffset = innerRef.current?.offsetTop ?? 0
          const adjustedTop = Math.max(0, nextScrollTop - innerOffset)
          const newStart = om.findIndexAtOffset(adjustedTop)
          const newEnd = om.findIndexAtOffset(adjustedTop + nextHeight)
          const prev = prevRangeRef.current
          if (prev && prev.start === newStart && prev.end === newEnd) return
          prevRangeRef.current = { start: newStart, end: newEnd }
        }

        scrollTopRef.current = nextScrollTop
        containerHeightRef.current = nextHeight

        flushSync(forceRender)
      })
    }

    el.addEventListener("scroll", handler, { passive: true })
    return () => {
      el.removeEventListener("scroll", handler)
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [forceRender])

  // Container resize
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    containerHeightRef.current = el.clientHeight
    scrollTopRef.current = el.scrollTop

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      containerHeightRef.current = entry.contentRect.height
      prevRangeRef.current = null
      forceRender()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [forceRender])

  // Initial alignment
  useLayoutEffect(() => {
    if (initialScrollDone.current || items.length === 0) return
    const el = scrollerRef.current
    if (!el) return

    if (initialAlignment === "bottom") {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
      containerHeightRef.current = el.clientHeight

      settlingRef.current = true
      stateMachine.transition("animating")
      if (settlingRafRef.current !== null) cancelAnimationFrame(settlingRafRef.current)

      const startedAt = performance.now()
      let stableFrames = 0
      let previousScrollHeight = el.scrollHeight

      const settleBottom = () => {
        if (!settlingRef.current) {
          settlingRafRef.current = null
          stateMachine.transition("idle")
          return
        }

        const nextScrollHeight = el.scrollHeight
        const delta = Math.abs(nextScrollHeight - previousScrollHeight)
        previousScrollHeight = nextScrollHeight

        if (delta < 1) stableFrames += 1
        else stableFrames = 0

        el.scrollTop = el.scrollHeight
        scrollTopRef.current = el.scrollTop

        const elapsed = performance.now() - startedAt
        if (stableFrames >= 3 || elapsed >= 500) {
          settlingRef.current = false
          settlingRafRef.current = null
          stateMachine.transition("idle")
          return
        }

        settlingRafRef.current = requestAnimationFrame(settleBottom)
      }

      settlingRafRef.current = requestAnimationFrame(settleBottom)
    }

    initialScrollDone.current = true
  }, [initialAlignment, items.length])

  // Reset when items cleared
  useEffect(() => {
    if (items.length !== 0) return
    initialScrollDone.current = false
    settlingRef.current = false
    prevRangeRef.current = null
    stateMachine.transition("idle")
    if (settlingRafRef.current !== null) {
      cancelAnimationFrame(settlingRafRef.current)
      settlingRafRef.current = null
    }
  }, [items.length, stateMachine])

  // Imperative API
  const scrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = "auto") => {
      scrollerRef.current?.scrollTo({ top: offset, behavior })
    },
    []
  )

  const scrollToIndex = useScrollToIndex(scrollerRef, offsetMapRef, innerRef, {
    reconcile: true,
  })

  const captureAnchorSnapshotCb = useCallback((): AnchorSnapshot | null => {
    const el = scrollerRef.current
    const om = offsetMapRef.current
    if (!el || !om) return null
    return captureAnchorSnapshot({
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      innerOffset: innerRef.current?.offsetTop ?? 0,
      offsetMap: om,
      keys: keyIndexRef.current.getKeys(),
    })
  }, [])

  const resolveAnchorTop = useCallback(
    (key: string | number, offsetWithinItem: number): number | null => {
      const om = offsetMapRef.current
      if (!om) return null
      const index = keyIndexRef.current.getIndex(key)
      if (index === undefined) return null
      const innerOffset = innerRef.current?.offsetTop ?? 0
      return innerOffset + om.getOffset(index) + offsetWithinItem
    },
    []
  )

  // Virtual items computation
  const om = offsetMapRef.current
  const totalSize = om ? om.totalSize() : 0

  const el = scrollerRef.current
  const currentScrollTop = el?.scrollTop ?? scrollTopRef.current
  const currentContainerHeight = el?.clientHeight ?? containerHeightRef.current
  const innerOffset = innerRef.current?.offsetTop ?? 0
  const adjustedScrollTop = Math.max(0, currentScrollTop - innerOffset)

  const virtualItems: VirtualItem<T>[] = []
  const renderedIndices = new Set<number>()

  if (om && om.count > 0 && currentContainerHeight > 0) {
    const firstVisible = om.findIndexAtOffset(adjustedScrollTop)
    const lastVisible = om.findIndexAtOffset(adjustedScrollTop + currentContainerHeight)
    const range = calcRenderRange({
      firstVisible,
      lastVisible,
      itemCount: om.count,
      overscan,
    })

    for (let i = range.start; i <= range.end && i < items.length; i++) {
      renderedIndices.add(i)
    }

    // Just-prepended expansion: include indices 0..count-1 so they get measured.
    // Skipped the first time the prepended count exceeds the configured ceiling
    // (1000 items) — at that scale, force-rendering all is too expensive.
    const prepCount = justPrependedCountRef.current
    if (prepCount > 0 && prepCount <= 1000) {
      for (let i = 0; i < prepCount && i < items.length; i++) {
        renderedIndices.add(i)
      }
    }
  } else if (om && om.count > 0) {
    const batchSize = Math.min(items.length, overscan * 2 + 1)
    const startIdx = initialAlignment === "bottom"
      ? Math.max(0, items.length - batchSize)
      : 0
    const endIdx = startIdx + batchSize - 1
    for (let i = startIdx; i <= endIdx; i++) {
      renderedIndices.add(i)
    }
  }

  if (om) {
    const sortedIndices = [...renderedIndices].sort((a, b) => a - b)
    for (const i of sortedIndices) {
      virtualItems.push({
        key: keyIndexRef.current.getKey(i) ?? getKey(items[i]!, i),
        index: i,
        start: om.getOffset(i),
        size: om.getSize(i),
        data: items[i]!,
      })
    }
  }

  const distFromBottom = el
    ? el.scrollHeight - el.scrollTop - el.clientHeight
    : Infinity

  return {
    scrollerRef,
    innerRef,
    virtualItems,
    totalSize,
    measureItem,
    scrollToIndex,
    scrollToOffset,
    captureAnchorSnapshot: captureAnchorSnapshotCb,
    resolveAnchorTop,
    isAtTop: currentScrollTop <= 1,
    isAtBottom: distFromBottom <= 1,
    scrollTop: currentScrollTop,
    stateMachine,
    flushPendingSync,
    clearJustPrepended,
  } as UseVirtualEngineReturn<T> & { clearJustPrepended: () => void }
}
