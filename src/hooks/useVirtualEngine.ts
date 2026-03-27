import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { OffsetMap } from "../core/offsetMap"
import { ItemSizeCache } from "../core/itemSizeCache"
import { findFirstVisibleIndex, findLastVisibleIndex } from "../core/binarySearch"
import { calcRenderRange } from "../core/rangeCalc"
import { useScrollToIndex } from "./useScrollToIndex"
import type { AnchorSnapshot, UseVirtualEngineReturn, VirtualItem } from "../types"

/**
 * Core virtual engine — v0.3.0
 *
 * Key behavior:
 * - Jump correction is accumulated and flushed once per frame.
 * - Logical anchor snapshot (key + intra-item offset) is supported.
 * - Settling on initial bottom align stops by stability condition.
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

  // Jump correction pipeline
  const jumpRef = useRef(0)
  const pendingJumpRef = useRef(0)
  const flushedJumpRef = useRef(0)
  const jumpFlushRafRef = useRef<number | null>(null)
  const jumpAwaitingAckRef = useRef(false)

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
      // Same length but identity changed (swap/edit/replace)
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

  const flushJump = useCallback(() => {
    if (jumpFlushRafRef.current !== null) return
    jumpFlushRafRef.current = requestAnimationFrame(() => {
      jumpFlushRafRef.current = null
      const el = scrollerRef.current
      if (!el) return

      const jump = jumpRef.current
      if (Math.abs(jump) < 0.01) return

      jumpRef.current = 0
      pendingJumpRef.current += jump
      flushedJumpRef.current += jump
      el.scrollTop += jump
      scrollTopRef.current = el.scrollTop
      jumpAwaitingAckRef.current = true
      forceRender()
    })
  }, [forceRender])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const handler = () => {
      if (rafIdRef.current !== null) return
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null
        scrollTopRef.current = el.scrollTop
        containerHeightRef.current = el.clientHeight

        if (jumpAwaitingAckRef.current) {
          // Jump was flushed in the previous frame and now reflected in scroll.
          jumpAwaitingAckRef.current = false
          pendingJumpRef.current = 0
          flushedJumpRef.current = 0
        }

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
      if (jumpFlushRafRef.current !== null) {
        cancelAnimationFrame(jumpFlushRafRef.current)
        jumpFlushRafRef.current = null
      }
    }
  }, [forceRender])

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

  useEffect(() => {
    if (items.length !== 0) return
    initialScrollDone.current = false
    settlingRef.current = false
    if (settlingRafRef.current !== null) {
      cancelAnimationFrame(settlingRafRef.current)
      settlingRafRef.current = null
    }
  }, [items.length])

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

    const el = scrollerRef.current
    if (el && !settlingRef.current && delta !== 0) {
      const itemBottom =
        om.getOffset(index) + oldSize + (innerRef.current?.offsetTop ?? 0)
      if (itemBottom < el.scrollTop) {
        jumpRef.current += delta
        flushJump()
      }
    }

    const changed = om.setSize(index, size)
    if (changed) forceRender()
  }, [flushJump, forceRender])

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

    return {
      key,
      offsetWithinItem: adjustedScrollTop - om.getOffset(firstVisible),
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
