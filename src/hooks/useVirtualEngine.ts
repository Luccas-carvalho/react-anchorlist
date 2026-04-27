import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

const LOG = (...args: unknown[]) => console.log("[anchorlist:engine]", ...args)
import { OffsetMap } from "../core/offsetMap"
import { ItemSizeCache } from "../core/itemSizeCache"
import { KeyIndex } from "../core/keyIndex"
import { detectMutation } from "../core/diff"
import { captureAnchorSnapshot } from "../core/scrollAnchor"
import { calcRenderRange } from "../core/rangeCalc"
import { useScrollToIndex } from "./useScrollToIndex"
import { useScrollStateMachine } from "./useScrollStateMachine"
import { useMeasurePipeline } from "./useMeasurePipeline"
import type { AnchorSnapshot, UseVirtualEngineReturn, VirtualItem } from "../types"

export function useVirtualEngine<T>(options: {
  items: T[]
  getKey: (item: T, index: number) => string | number
  estimatedItemSize: number
  overscan: number
  initialAlignment: "top" | "bottom"
  getItemEstimate?: (item: T, index: number) => number
}): UseVirtualEngineReturn<T> {
  const { items, getKey, estimatedItemSize, overscan, initialAlignment, getItemEstimate } = options

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

  // Track the last rendered virtual range to skip renders when range is unchanged.
  const prevRangeRef = useRef<{ start: number; end: number } | null>(null)

  const [, setTick] = useState(0)
  const forceRender = useCallback(() => setTick((t) => t + 1), [])

  const stateMachine = useScrollStateMachine()

  if (!offsetMapRef.current) {
    offsetMapRef.current = new OffsetMap(items.length, estimatedItemSize)
  }

  // ── Mutation detection & OffsetMap sync ────────────────────────────────
  const newKeys = items.map((item, i) => getKey(item, i))
  const prevKeys = prevKeysRef.current
  const keysChanged =
    newKeys.length !== prevKeys.length ||
    newKeys[0] !== prevKeys[0] ||
    newKeys[newKeys.length - 1] !== prevKeys[prevKeys.length - 1]

  if (keysChanged) {
    const om = offsetMapRef.current!
    const mutation = detectMutation(prevKeys, newKeys)

    LOG("🔑 mutation detected", {
      type: mutation.type,
      count: (mutation as { count?: number }).count,
      prevLen: prevKeys.length,
      newLen: newKeys.length,
      prevFirst: prevKeys[0],
      newFirst: newKeys[0],
      prevLast: prevKeys[prevKeys.length - 1],
      newLast: newKeys[newKeys.length - 1],
    })

    switch (mutation.type) {
      case "initial":
        om.resize(newKeys.length)
        break
      case "cleared":
        om.resize(0)
        break
      case "prepend": {
        // Per-item estimates: most accurate when caller knows item types.
        // Falls back to average of measured items, then estimatedItemSize.
        if (getItemEstimate) {
          const perItemSizes: number[] = []
          for (let i = 0; i < mutation.count; i++) {
            perItemSizes.push(getItemEstimate(items[i] as T, i))
          }
          LOG("📐 prepend per-item estimates", { count: perItemSizes.length, sample: perItemSizes.slice(0, 5) })
          om.prepend(mutation.count, perItemSizes)
        } else {
          const avgSize = sizeCacheRef.current.getAverageSize() ?? estimatedItemSize
          LOG("📐 prepend avgSize", { avgSize, estimated: estimatedItemSize })
          om.prepend(mutation.count, Math.round(avgSize))
        }
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
    // Invalidate range cache so next render recomputes
    prevRangeRef.current = null
  }

  // ── Measure pipeline ────────────────────────────────────────────────────
  const { measureItem, flushPendingSync } = useMeasurePipeline({
    offsetMapRef,
    sizeCacheRef,
    keyIndexRef,
    scrollerRef,
    innerRef,
    stateMachine,
    onBatchFlushed: forceRender,
  })

  // ── Scroll handler — rAF throttled + flushSync ─────────────────────────
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const handler = () => {
      // Update scrollTop immediately (outside RAF) so any in-flight render
      // or measurement can read the freshest position without waiting a frame.
      scrollTopRef.current = el.scrollTop

      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null

        const nextScrollTop = el.scrollTop
        const nextHeight = el.clientHeight

        // Skip render if the visible range hasn't changed.
        // Avoids flushSync overhead for micro-scrolls within item boundaries.
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

        // flushSync forces React to render synchronously within this frame,
        // preventing the 1-frame visual lag seen with async batched updates.
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

  // ── Container resize ───────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    containerHeightRef.current = el.clientHeight
    scrollTopRef.current = el.scrollTop

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      containerHeightRef.current = entry.contentRect.height
      // Invalidate range cache on resize so we recompute
      prevRangeRef.current = null
      forceRender()
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [forceRender])

  // ── Initial alignment ──────────────────────────────────────────────────
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

  // ── Reset when items cleared ───────────────────────────────────────────
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

  // ── Imperative API ─────────────────────────────────────────────────────
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

  // ── Virtual items computation ──────────────────────────────────────────
  const om = offsetMapRef.current
  const totalSize = om ? om.totalSize() : 0

  const el = scrollerRef.current
  const currentScrollTop = el?.scrollTop ?? scrollTopRef.current
  const currentContainerHeight = el?.clientHeight ?? containerHeightRef.current
  const innerOffset = innerRef.current?.offsetTop ?? 0
  const adjustedScrollTop = Math.max(0, currentScrollTop - innerOffset)

  const virtualItems: VirtualItem<T>[] = []

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
      virtualItems.push({
        key: keyIndexRef.current.getKey(i) ?? getKey(items[i]!, i),
        index: i,
        start: om.getOffset(i),
        size: om.getSize(i),
        data: items[i]!,
      })
    }
  } else if (om && om.count > 0) {
    const batchSize = Math.min(items.length, overscan * 2 + 1)
    const startIdx = initialAlignment === "bottom"
      ? Math.max(0, items.length - batchSize)
      : 0
    const endIdx = startIdx + batchSize - 1
    for (let i = startIdx; i <= endIdx; i++) {
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
  }
}
