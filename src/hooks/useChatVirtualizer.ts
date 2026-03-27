import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useVirtualEngine } from "./useVirtualEngine"
import { useScrollAnchor } from "./useScrollAnchor"
import { useAtBottom } from "./useAtBottom"
import { useFollowOutput } from "./useFollowOutput"
import type {
  AtBottomHysteresis,
  ChatScrollModifier,
  ScrollToIndexOpts,
  UseChatVirtualizerReturn,
} from "../types"

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
  startReachedThreshold?: number
  endReachedThreshold?: number
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
    scrollToMessageKey,
    onScrollToMessageComplete,
  } = options

  const engine = useVirtualEngine({
    items,
    getKey,
    estimatedItemSize,
    overscan,
    initialAlignment,
  })

  const isAtBottom = useAtBottom(engine.scrollerRef, {
    threshold: atBottomThreshold,
    hysteresis: atBottomHysteresis ?? { enter: 80, leave: 160 },
  })

  // Force a synchronous re-render after anchor restoration so that
  // virtualItems are recomputed with corrected scrollTop before paint.
  const [, setAnchorTick] = useState(0)
  const onAnchorRestored = useCallback(() => setAnchorTick((t) => t + 1), [])
  const { prepareAnchor } = useScrollAnchor({
    scrollerRef: engine.scrollerRef,
    itemCount: items.length,
    captureAnchorSnapshot: engine.captureAnchorSnapshot,
    resolveAnchorTop: engine.resolveAnchorTop,
    onRestored: onAnchorRestored,
  })

  const firstKey = items.length > 0 ? getKey(items[0] as T, 0) : null
  const lastKey = items.length > 0
    ? getKey(items[items.length - 1] as T, items.length - 1)
    : null

  useFollowOutput({
    itemCount: items.length,
    firstKey,
    lastKey,
    isAtBottom,
    scrollToIndex: engine.scrollToIndex,
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

  // startReached: fire when close to top.
  // Arm after user moved away from top once OR when content is too short
  // to ever exceed the threshold.
  const startInFlight = useRef(false)
  const startArmed = useRef(initialAlignment === "top")
  useEffect(() => {
    const el = engine.scrollerRef.current
    if (!el || !onStartReached) return

    const handler = () => {
      const top = el.scrollTop

      if (!startArmed.current) {
        const conversationTooShort = el.scrollHeight <= el.clientHeight + startReachedThreshold
        if (conversationTooShort || top > startReachedThreshold) {
          startArmed.current = true
        }
      }

      if (!startArmed.current) return

      if (top <= startReachedThreshold && !startInFlight.current) {
        startInFlight.current = true
        Promise.resolve(onStartReached()).finally(() => {
          startInFlight.current = false
        })
      }
    }

    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, onStartReached, startReachedThreshold, initialAlignment])

  // endReached: fire when close to bottom.
  const endInFlight = useRef(false)
  useEffect(() => {
    const el = engine.scrollerRef.current
    if (!el || !onEndReached) return
    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      if (dist <= endReachedThreshold && !endInFlight.current) {
        endInFlight.current = true
        Promise.resolve(onEndReached()).finally(() => {
          endInFlight.current = false
        })
      }
    }
    el.addEventListener("scroll", handler, { passive: true })
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, onEndReached, endReachedThreshold])

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
