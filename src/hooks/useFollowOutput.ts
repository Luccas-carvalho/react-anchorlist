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
  scrollToIndex: (index: number, opts?: ScrollToIndexOpts) => void
  mode: "auto" | "smooth" | false
}): void {
  const { itemCount, firstKey, lastKey, isAtBottom, scrollToIndex, mode } = params

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
      scrollToIndex(itemCount - 1, {
        align: "end",
        behavior: mode === "smooth" ? "smooth" : "auto",
      })
    }

    prevCountRef.current = itemCount
    prevFirstKeyRef.current = firstKey
    prevLastKeyRef.current = lastKey
  }, [itemCount, firstKey, lastKey, isAtBottom, scrollToIndex, mode])
}
