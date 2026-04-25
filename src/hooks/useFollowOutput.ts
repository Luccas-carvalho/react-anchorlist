import { useLayoutEffect, useRef } from "react"
import type { ScrollToIndexOpts } from "../types"

/**
 * Auto-follow output ONLY for appends at the end.
 *
 * Important behavior:
 * - Appends (new message at bottom) + isAtBottom => follow
 * - Prepends (older messages at top) => NEVER follow
 */
export function useFollowOutput(params: {
  itemCount: number
  firstKey: string | number | null
  lastKey: string | number | null
  isAtBottom: boolean
  scrollerRef: React.RefObject<HTMLDivElement>
  mode: "auto" | "smooth" | false
}): void {
  const { itemCount, firstKey, lastKey, isAtBottom, scrollerRef, mode } = params

  const prevCountRef = useRef(itemCount)
  const prevFirstKeyRef = useRef<string | number | null>(firstKey)
  const prevLastKeyRef = useRef<string | number | null>(lastKey)

  useLayoutEffect(() => {
    if (!mode) {
      prevCountRef.current = itemCount
      prevFirstKeyRef.current = firstKey
      prevLastKeyRef.current = lastKey
      return
    }

    const prevCount = prevCountRef.current
    const prevFirst = prevFirstKeyRef.current
    const prevLast = prevLastKeyRef.current

    const countIncreased = itemCount > prevCount
    const firstUnchanged = firstKey === prevFirst
    const lastChanged = lastKey !== prevLast

    // append heuristic: count increased, first key unchanged, last key changed
    const isAppend = countIncreased && firstUnchanged && lastChanged

    if (isAppend && isAtBottom && itemCount > 0) {
      const el = scrollerRef.current
      if (el) {
        // Use scrollHeight directly — avoids blink from estimated offsets being
        // wrong on first frame, corrected only after ResizeObserver fires.
        if (mode === "smooth") {
          el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
        } else {
          el.scrollTop = el.scrollHeight
          // One follow-up frame: catches ResizeObserver corrections for async
          // content (images, embeds) that inflate scrollHeight after first paint.
          requestAnimationFrame(() => {
            if (el.isConnected && el.scrollHeight > el.scrollTop + el.clientHeight + 4) {
              el.scrollTop = el.scrollHeight
            }
          })
        }
      }
    }

    prevCountRef.current = itemCount
    prevFirstKeyRef.current = firstKey
    prevLastKeyRef.current = lastKey
  }, [itemCount, firstKey, lastKey, isAtBottom, scrollerRef, mode])
}
