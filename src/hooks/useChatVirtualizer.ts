import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useVirtualEngine } from "./useVirtualEngine"
import { useScrollAnchor } from "./useScrollAnchor"
import { useAtBottom } from "./useAtBottom"
import { useFollowOutput } from "./useFollowOutput"
import {
  buildReachedRootMargin,
  getThresholdPixels,
  parseReachedThreshold,
} from "../core/reachedThreshold"
import type {
  AtBottomHysteresis,
  ChatScrollModifier,
  ReachedThreshold,
  ScrollToIndexOpts,
  UseChatVirtualizerReturn,
} from "../types"

const LOG = (...args: unknown[]) => console.log("[anchorlist]", ...args)

/**
 * Composites all virtual engine hooks into a single chat-optimized hook.
 */
export function useChatVirtualizer<T>(options: {
  items: T[]
  getKey: (item: T, index: number) => string | number
  estimatedItemSize?: number
  overscan?: number
  atBottomThreshold?: number
  atBottomHysteresis?: AtBottomHysteresis
  followOutput?: "auto" | "smooth" | false
  initialAlignment?: "top" | "bottom"
  scrollModifier?: ChatScrollModifier | null
  onStartReached?: () => void | Promise<void>
  onEndReached?: () => void | Promise<void>
  startReachedThreshold?: ReachedThreshold
  endReachedThreshold?: ReachedThreshold
  /**
   * Per-item estimated size. Use this when items have wildly different sizes
   * (e.g. chat with text + images + videos). Returning accurate estimates here
   * eliminates the visual flicker on prepend/anchor-restore caused by
   * unrendered items above viewport using a single average size.
   */
  getItemEstimate?: (item: T, index: number) => number
  /** @deprecated Prefer `scrollModifier` with `type: "jump-to-key"` */
  scrollToMessageKey?: string | number | null
  /** @deprecated Prefer command id tracking on `scrollModifier` */
  onScrollToMessageComplete?: () => void
}): UseChatVirtualizerReturn<T> {
  const {
    items,
    getKey,
    estimatedItemSize = 80,
    overscan = 20,
    atBottomThreshold = 200,
    atBottomHysteresis,
    followOutput = "auto",
    initialAlignment = "bottom",
    scrollModifier = null,
    onStartReached,
    onEndReached,
    startReachedThreshold = 300,
    endReachedThreshold = 300,
    getItemEstimate,
    scrollToMessageKey,
    onScrollToMessageComplete,
  } = options

  const engine = useVirtualEngine({
    items,
    getKey,
    estimatedItemSize,
    overscan,
    initialAlignment,
    getItemEstimate,
  })

  const isAtBottom = useAtBottom(engine.scrollerRef, {
    threshold: atBottomThreshold,
    hysteresis: atBottomHysteresis ?? { enter: 80, leave: 160 },
  })

  // Force a synchronous re-render after anchor restoration so that
  // virtualItems are recomputed with corrected scrollTop before paint.
  const [, setAnchorTick] = useState(0)
  const onAnchorRestored = useCallback(() => {
    setAnchorTick((t) => t + 1)
  }, [])

  const { prepareAnchor } = useScrollAnchor({
    scrollerRef: engine.scrollerRef,
    itemCount: items.length,
    captureAnchorSnapshot: engine.captureAnchorSnapshot,
    resolveAnchorTop: engine.resolveAnchorTop,
    stateMachine: engine.stateMachine,
    flushPendingMeasures: engine.flushPendingSync,
    onRestored: onAnchorRestored,
  })

  const firstKey = items.length > 0 ? getKey(items[0] as T, 0) : null
  const lastKey = items.length > 0
    ? getKey(items[items.length - 1] as T, items.length - 1)
    : null
  const startSentinelRef = useRef<HTMLDivElement>(null)
  const endSentinelRef = useRef<HTMLDivElement>(null)

  useFollowOutput({
    itemCount: items.length,
    firstKey,
    lastKey,
    isAtBottom,
    scrollerRef: engine.scrollerRef,
    mode: followOutput ?? false,
  })

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "auto") => {
      if (items.length === 0) return
      engine.scrollToIndex(items.length - 1, { align: "end", behavior })
    },
    [items.length, engine]
  )

  const scrollToKey = useCallback(
    (key: string | number, opts?: ScrollToIndexOpts) => {
      const index = items.findIndex((item, i) => getKey(item, i) === key)
      if (index !== -1) engine.scrollToIndex(index, opts)
    },
    [items, getKey, engine]
  )

  // Declarative chat commands.
  const handledModifierIdRef = useRef<string | number | null>(null)
  useLayoutEffect(() => {
    if (!scrollModifier) return
    if (handledModifierIdRef.current === scrollModifier.id) return
    handledModifierIdRef.current = scrollModifier.id

    if (scrollModifier.type === "prepend") {
      prepareAnchor()
      return
    }

    if (scrollModifier.type === "append") {
      if (scrollModifier.ifAtBottomOnly && !isAtBottom) return
      scrollToBottom(scrollModifier.behavior ?? "auto")
      return
    }

    if (scrollModifier.type === "items-change") {
      if (isAtBottom) scrollToBottom("auto")
      return
    }

    // jump-to-key
    scrollToKey(scrollModifier.key, {
      align: scrollModifier.align ?? "center",
      behavior: scrollModifier.behavior ?? "auto",
    })
  }, [scrollModifier, isAtBottom, prepareAnchor, scrollToBottom, scrollToKey])

  // Stable refs so scroll effects don't re-run when callback identity changes.
  const onStartReachedRef = useRef(onStartReached)
  useEffect(() => { onStartReachedRef.current = onStartReached }, [onStartReached])
  const onEndReachedRef = useRef(onEndReached)
  useEffect(() => { onEndReachedRef.current = onEndReached }, [onEndReached])

  // Stable trigger locks prevent rapid duplicate calls while edge sentinels
  // remain visible or while an async callback is still in flight.
  const startInFlight = useRef(false)
  const startTriggeredRef = useRef(false)
  const endInFlight = useRef(false)
  const endTriggeredRef = useRef(false)

  useEffect(() => {
    LOG("🔄 keys/length changed — resetting triggered locks", {
      itemsLength: items.length,
      firstKey,
      lastKey,
      startInFlight: startInFlight.current,
      endInFlight: endInFlight.current,
    })
    startTriggeredRef.current = false
    endTriggeredRef.current = false
  }, [items.length, firstKey, lastKey])

  const triggerStartReached = useCallback(() => {
    const callback = onStartReachedRef.current
    LOG("🚀 triggerStartReached called", {
      hasCallback: !!callback,
      startInFlight: startInFlight.current,
      startTriggered: startTriggeredRef.current,
    })
    if (!callback || startInFlight.current) {
      LOG("⛔ triggerStartReached SKIPPED (no callback or in-flight)")
      return
    }

    // Automatic anchor capture before loading older pages.
    LOG("⚓ prepareAnchor() called from triggerStartReached")
    prepareAnchor()
    startInFlight.current = true
    LOG("✈️ startInFlight = true")
    Promise.resolve(callback()).finally(() => {
      LOG("🏁 startInFlight = false (callback resolved)")
      startInFlight.current = false
    })
  }, [prepareAnchor])

  const triggerEndReached = useCallback(() => {
    const callback = onEndReachedRef.current
    if (!callback || endInFlight.current) return

    endInFlight.current = true
    Promise.resolve(callback()).finally(() => {
      endInFlight.current = false
    })
  }, [])

  // startReached: prefer IntersectionObserver sentinel, fallback to scroll math.
  useEffect(() => {
    const el = engine.scrollerRef.current
    const sentinel = startSentinelRef.current
    if (!el || !sentinel || !onStartReachedRef.current) return

    const threshold = parseReachedThreshold(startReachedThreshold, 300)

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          LOG("👁️ IntersectionObserver (start)", {
            isIntersecting: entry.isIntersecting,
            startTriggered: startTriggeredRef.current,
            startInFlight: startInFlight.current,
            intersectionRatio: entry.intersectionRatio,
          })
          if (!entry.isIntersecting) {
            startTriggeredRef.current = false
            LOG("👁️ sentinel left viewport — startTriggered = false")
            return
          }
          if (startTriggeredRef.current || startInFlight.current) {
            LOG("👁️ sentinel intersecting but SKIPPED (already triggered or in-flight)")
            return
          }
          startTriggeredRef.current = true
          LOG("👁️ sentinel intersecting — calling triggerStartReached")
          triggerStartReached()
        },
        {
          root: el,
          rootMargin: buildReachedRootMargin(threshold, "start"),
          threshold: 0,
        }
      )

      observer.observe(sentinel)
      return () => observer.disconnect()
    }

    const handler = () => {
      if (!onStartReachedRef.current) return
      const thresholdPx = getThresholdPixels(threshold, el.clientHeight)
      const nearStart = el.scrollTop <= thresholdPx

      if (!nearStart) {
        startTriggeredRef.current = false
        return
      }
      if (startTriggeredRef.current || startInFlight.current) return
      startTriggeredRef.current = true
      triggerStartReached()
    }

    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, onStartReached, startReachedThreshold, triggerStartReached])

  // endReached: same strategy as startReached, but observing the bottom edge.
  useEffect(() => {
    const el = engine.scrollerRef.current
    const sentinel = endSentinelRef.current
    if (!el || !sentinel || !onEndReachedRef.current) return

    const threshold = parseReachedThreshold(endReachedThreshold, 300)

    if (typeof IntersectionObserver !== "undefined") {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return
          if (!entry.isIntersecting) {
            endTriggeredRef.current = false
            return
          }
          if (endTriggeredRef.current || endInFlight.current) return
          endTriggeredRef.current = true
          triggerEndReached()
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
      if (!onEndReachedRef.current) return
      const thresholdPx = getThresholdPixels(threshold, el.clientHeight)
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      const nearEnd = dist <= thresholdPx

      if (!nearEnd) {
        endTriggeredRef.current = false
        return
      }
      if (endTriggeredRef.current || endInFlight.current) return
      endTriggeredRef.current = true
      triggerEndReached()
    }

    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, onEndReached, endReachedThreshold, triggerEndReached])

  // Deprecated imperative scroll-to-message-key support.
  const scrolledKeyRef = useRef<string | number | null>(null)
  useEffect(() => {
    if (!scrollToMessageKey) return
    if (scrolledKeyRef.current === scrollToMessageKey) return
    const index = items.findIndex((item, i) => getKey(item, i) === scrollToMessageKey)
    if (index === -1) return
    scrolledKeyRef.current = scrollToMessageKey
    engine.scrollToIndex(index, { align: "center", behavior: "auto" })
    onScrollToMessageComplete?.()
  }, [scrollToMessageKey, items, getKey, engine, onScrollToMessageComplete])

  return {
    scrollerRef: engine.scrollerRef,
    innerRef: engine.innerRef,
    startSentinelRef,
    endSentinelRef,
    virtualItems: engine.virtualItems,
    totalSize: engine.totalSize,
    measureItem: engine.measureItem,
    scrollToIndex: engine.scrollToIndex,
    scrollToBottom,
    scrollToKey,
    isAtBottom,
    prepareAnchor,
  }
}
