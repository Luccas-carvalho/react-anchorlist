import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { OffsetMap } from "../core/offsetMap"
import { ItemSizeCache } from "../core/itemSizeCache"
import { findFirstVisibleIndex, findLastVisibleIndex } from "../core/binarySearch"
import { calcRenderRange } from "../core/rangeCalc"
import { useScrollToIndex } from "./useScrollToIndex"
import type { AnchorSnapshot, UseVirtualEngineReturn, VirtualItem } from "../types"

/**
 * Core virtual engine — v0.4.0
 *
 * Key change from v0.3: scroll compensation is applied SYNCHRONOUSLY
 * inside measureItem instead of being batched via rAF. This eliminates
 * the one-frame delay that caused visible flicker/drift during scroll
 * and after prepend anchor restoration.
 */
export function useVirtualEngine<T>(options: {
  items: T[]
  getKey: (item: T, index: number) => string | number
  estimatedItemSize: number
  overscan: number
  initialAlignment: "top" | "bottom"
}): UseVirtualEngineReturn<T> {
  const { items, getKey, estimatedItemSize, overscan, initialAlignment } = options

  const scrollerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const offsetMapRef = useRef<OffsetMap | null>(null)
  const sizeCacheRef = useRef(new ItemSizeCache())

  const prevKeysRef = useRef<(string | number)[]>([])
  const keyToIndexRef = useRef(new Map<string | number, number>())

  const prevItemsLenRef = useRef(items.length)
  const prevFirstKeyRef = useRef<string | number | null>(null)
  const prevLastKeyRef = useRef<string | number | null>(null)

  const initialScrollDone = useRef(false)
  const scrollTopRef = useRef(0)
  const containerHeightRef = useRef(0)
  const rafIdRef = useRef<number | null>(null)

  const settlingRef = useRef(false)
  const settlingRafRef = useRef<number | null>(null)

  const [, setTick] = useState(0)
  const forceRender = useCallback(() => setTick((t) => t + 1), [])

  if (!offsetMapRef.current) {
    offsetMapRef.current = new OffsetMap(items.length, estimatedItemSize)
  }

  const firstKey = items.length > 0 ? getKey(items[0] as T, 0) : null
  const lastKey = items.length > 0
    ? getKey(items[items.length - 1] as T, items.length - 1)
    : null

  const itemsChanged = items.length !== prevItemsLenRef.current ||
    firstKey !== prevFirstKeyRef.current ||
    lastKey !== prevLastKeyRef.current

  if (itemsChanged) {
    const om = offsetMapRef.current!
    const newKeys = items.map((item, i) => getKey(item, i))
    const prevKeys = prevKeysRef.current
    const prevCount = prevKeys.length
    const newCount = newKeys.length

    if (newCount === 0) {
      om.resize(0)
    } else if (prevCount === 0) {
      om.resize(newCount)
    } else if (newCount > prevCount) {
      const prependOffset = newCount - prevCount
      const isPrepend =
        prevKeys.length > 0 &&
        prependOffset >= 0 &&
        newKeys[prependOffset] === prevKeys[0]
      if (isPrepend) {
        om.prepend(prependOffset)
      } else {
        om.resize(newCount)
      }
    } else if (newCount < prevCount) {
      om.resize(newCount)
    } else {
      om.resize(newCount)
    }

    const nextKeyToIndex = new Map<string | number, number>()
    newKeys.forEach((k, i) => nextKeyToIndex.set(k, i))
    keyToIndexRef.current = nextKeyToIndex
    sizeCacheRef.current.applyToOffsetMap(om, nextKeyToIndex)

    prevKeysRef.current = newKeys
    prevItemsLenRef.current = items.length
    prevFirstKeyRef.current = firstKey
    prevLastKeyRef.current = lastKey
  }

  // Scroll handler — rAF throttled
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const handler = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        scrollTopRef.current = el.scrollTop
        containerHeightRef.current = el.clientHeight
        forceRender()
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
      if (settlingRafRef.current !== null) cancelAnimationFrame(settlingRafRef.current)

      const startedAt = performance.now()
      let stableFrames = 0
      let previousScrollHeight = el.scrollHeight

      const settleBottom = () => {
        if (!settlingRef.current) {
          settlingRafRef.current = null
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
          return
        }

        settlingRafRef.current = requestAnimationFrame(settleBottom)
      }

      settlingRafRef.current = requestAnimationFrame(settleBottom)
    }

    initialScrollDone.current = true
  }, [initialAlignment, items.length])

  // Reset when items go to 0
  useEffect(() => {
    if (items.length !== 0) return
    initialScrollDone.current = false
    settlingRef.current = false
    if (settlingRafRef.current !== null) {
      cancelAnimationFrame(settlingRafRef.current)
      settlingRafRef.current = null
    }
  }, [items.length])

  /**
   * measureItem — SYNCHRONOUS scroll compensation.
   *
   * When an item above the viewport changes size, we adjust scrollTop
   * immediately (no rAF delay). This prevents the one-frame visual
   * jump that occurs when offsets change in one frame but scrollTop
   * only catches up in the next.
   */
  const measureItem = useCallback((key: string | number, size: number) => {
    const om = offsetMapRef.current
    if (!om) return

    const prevSize = sizeCacheRef.current.get(key)
    if (prevSize === size) return
    sizeCacheRef.current.set(key, size)

    const index = keyToIndexRef.current.get(key)
    if (index === undefined) return

    const oldSize = om.getSize(index)
    const delta = size - oldSize

    // Apply scroll compensation SYNCHRONOUSLY before updating the offset map.
    // Only compensate if the item's TOP edge is above the viewport top.
    // Using the top edge (not bottom) prevents false positives for items
    // that just appeared at the bottom (appended messages).
    const el = scrollerRef.current
    if (el && !settlingRef.current && delta !== 0) {
      const itemTop =
        om.getOffset(index) + (innerRef.current?.offsetTop ?? 0)
      if (itemTop < el.scrollTop) {
        el.scrollTop += delta
        scrollTopRef.current = el.scrollTop
      }
    }

    const changed = om.setSize(index, size)
    if (changed) forceRender()
  }, [forceRender])

  const scrollToOffset = useCallback(
    (offset: number, behavior: ScrollBehavior = "auto") => {
      scrollerRef.current?.scrollTo({ top: offset, behavior })
    },
    []
  )

  const scrollToIndex = useScrollToIndex(scrollerRef, offsetMapRef, innerRef, {
    reconcile: true,
  })

  const captureAnchorSnapshot = useCallback((): AnchorSnapshot | null => {
    const el = scrollerRef.current
    const om = offsetMapRef.current
    if (!el || !om || om.count === 0) return null

    const innerOffset = innerRef.current?.offsetTop ?? 0
    const adjustedScrollTop = Math.max(0, el.scrollTop - innerOffset)
    const offsets = om.getOffsets()
    const firstVisible = findFirstVisibleIndex(offsets, adjustedScrollTop)
    const key = prevKeysRef.current[firstVisible] ?? null
    const candidates: NonNullable<AnchorSnapshot["candidates"]> = []

    for (let i = firstVisible; i < Math.min(om.count, firstVisible + 6); i++) {
      const candidateKey = prevKeysRef.current[i] ?? null
      if (candidateKey === null) continue
      candidates.push({
        key: candidateKey,
        offsetWithinItem: adjustedScrollTop - om.getOffset(i),
      })
    }

    return {
      key,
      offsetWithinItem: adjustedScrollTop - om.getOffset(firstVisible),
      candidates,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
    }
  }, [])

  const resolveAnchorTop = useCallback(
    (key: string | number, offsetWithinItem: number): number | null => {
      const om = offsetMapRef.current
      if (!om) return null
      const index = keyToIndexRef.current.get(key)
      if (index === undefined) return null
      const innerOffset = innerRef.current?.offsetTop ?? 0
      return innerOffset + om.getOffset(index) + offsetWithinItem
    },
    []
  )

  // Compute virtual items — during render, always fresh
  const om = offsetMapRef.current
  const totalSize = om ? om.totalSize() : 0

  const el = scrollerRef.current
  const currentScrollTop = el?.scrollTop ?? scrollTopRef.current
  const currentContainerHeight = el?.clientHeight ?? containerHeightRef.current
  const innerOffset = innerRef.current?.offsetTop ?? 0
  const adjustedScrollTop = Math.max(0, currentScrollTop - innerOffset)

  const virtualItems: VirtualItem<T>[] = []

  if (om && om.count > 0 && currentContainerHeight > 0) {
    const offsets = om.getOffsets()
    const sizes = om.getSizes()
    const firstVisible = findFirstVisibleIndex(offsets, adjustedScrollTop)
    const lastVisible = findLastVisibleIndex(
      offsets,
      sizes,
      adjustedScrollTop + currentContainerHeight
    )
    const range = calcRenderRange({
      firstVisible,
      lastVisible,
      itemCount: om.count,
      overscan,
    })

    for (let i = range.start; i <= range.end && i < items.length; i++) {
      virtualItems.push({
        key: prevKeysRef.current[i] ?? getKey(items[i]!, i),
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
        key: prevKeysRef.current[i] ?? getKey(items[i]!, i),
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
    captureAnchorSnapshot,
    resolveAnchorTop,
    isAtTop: currentScrollTop <= 1,
    isAtBottom: distFromBottom <= 1,
    scrollTop: currentScrollTop,
  }
}
