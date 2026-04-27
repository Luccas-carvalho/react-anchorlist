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
  const onAnchorRestored = useCallback(() => {
    setAnchorTick((t) => t + 1)
  }, [])

  const { prepareAnchor } = useScrollAnchor({
    scrollerRef: engine.scrollerRef,
    itemCount: items.length,
    captureAnchorSnapshot: engine.captureAnchorSnapshot,
    resolveAnchorTop: engine.resolveAnchorTop,
    stateMachine: engine.stateMachine,
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
  useEffect(() => { onStartReachedRef.current = onStartReached })
  const onEndReachedRef = useRef(onEndReached)
  useEffect(() => { onEndReachedRef.current = onEndReached })

  // startReached: fire when close to top, then disarm until user scrolls
  // past the rearm zone. Prevents cascading fires when newly-prepended
  // items leave scrollTop inside the threshold band.
  const startInFlight = useRef(false)
  const startArmed = useRef(initialAlignment === "top")
  useEffect(() => {
    const el = engine.scrollerRef.current
    if (!el || !onStartReachedRef.current) return

    const rearmZone = startReachedThreshold * 2

    const handler = () => {
      if (!onStartReachedRef.current) return
      const top = el.scrollTop

      if (!startArmed.current) {
        const conversationTooShort = el.scrollHeight <= el.clientHeight + startReachedThreshold
        if (conversationTooShort || top > rearmZone) {
          startArmed.current = true
        }
      }

      if (!startArmed.current) return

      if (top <= startReachedThreshold && !startInFlight.current) {
        startInFlight.current = true
        startArmed.current = false
        Promise.resolve(onStartReachedRef.current()).finally(() => {
          startInFlight.current = false
        })
      }
    }

    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, startReachedThreshold, initialAlignment])

  // endReached: same rearm pattern at the bottom edge.
  const endInFlight = useRef(false)
  const endArmed = useRef(initialAlignment === "bottom")
  useEffect(() => {
    const el = engine.scrollerRef.current
    if (!el || !onEndReachedRef.current) return

    const rearmZone = endReachedThreshold * 2

    const handler = () => {
      if (!onEndReachedRef.current) return
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight

      if (!endArmed.current) {
        const conversationTooShort = el.scrollHeight <= el.clientHeight + endReachedThreshold
        if (conversationTooShort || dist > rearmZone) {
          endArmed.current = true
        }
      }

      if (!endArmed.current) return

      if (dist <= endReachedThreshold && !endInFlight.current) {
        endInFlight.current = true
        endArmed.current = false
        Promise.resolve(onEndReachedRef.current()).finally(() => {
          endInFlight.current = false
        })
      }
    }
    el.addEventListener("scroll", handler, { passive: true })
    handler()
    return () => el.removeEventListener("scroll", handler)
  }, [engine.scrollerRef, endReachedThreshold, initialAlignment])

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
