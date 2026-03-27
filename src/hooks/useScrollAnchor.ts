import { useCallback, useLayoutEffect, useRef } from "react"
import type { AnchorSnapshot } from "../types"

interface UseScrollAnchorOptions {
  scrollerRef: React.RefObject<HTMLDivElement>
  itemCount: number
  captureAnchorSnapshot: () => AnchorSnapshot | null
  resolveAnchorTop: (key: string | number, offsetWithinItem: number) => number | null
  onRestored?: () => void
}

/**
 * Keeps viewport anchored when items are prepended.
 *
 * Strategy:
 * - Preferred: logical anchor by key + offsetWithinItem
 * - Fallback: scrollHeight delta compensation
 */
export function useScrollAnchor(options: UseScrollAnchorOptions): { prepareAnchor: () => void } {
  const {
    scrollerRef,
    itemCount,
    captureAnchorSnapshot,
    resolveAnchorTop,
    onRestored,
  } = options

  const savedSnapshotRef = useRef<AnchorSnapshot | null>(null)
  const anchorPending = useRef(false)

  const lockRef = useRef<{
    first: number | null
    second: number | null
    timeout: ReturnType<typeof setTimeout> | null
  }>({
    first: null,
    second: null,
    timeout: null,
  })

  const clearLock = useCallback(() => {
    const { first, second, timeout } = lockRef.current
    if (first) cancelAnimationFrame(first)
    if (second) cancelAnimationFrame(second)
    if (timeout) clearTimeout(timeout)
    lockRef.current = { first: null, second: null, timeout: null }
  }, [])

  const prepareAnchor = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return

    const snapshot = captureAnchorSnapshot()
    savedSnapshotRef.current = snapshot ?? {
      key: null,
      offsetWithinItem: 0,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
    }
    anchorPending.current = true
  }, [scrollerRef, captureAnchorSnapshot])

  useLayoutEffect(() => {
    if (!anchorPending.current) return
    const el = scrollerRef.current
    const snapshot = savedSnapshotRef.current
    if (!el || !snapshot) return

    anchorPending.current = false

    const restore = () => {
      let target: number | null = null
      if (snapshot.key !== null) {
        target = resolveAnchorTop(snapshot.key, snapshot.offsetWithinItem)
      }

      if (target === null) {
        target = snapshot.scrollTop + (el.scrollHeight - snapshot.scrollHeight)
      }

      if (Number.isFinite(target) && Math.abs(el.scrollTop - target) > 1) {
        el.scrollTop = target
      }
    }

    clearLock()
    restore()
    onRestored?.()

    lockRef.current.first = requestAnimationFrame(() => {
      lockRef.current.first = null
      restore()
      lockRef.current.second = requestAnimationFrame(() => {
        lockRef.current.second = null
        restore()
      })
    })

    lockRef.current.timeout = setTimeout(() => {
      lockRef.current.timeout = null
      restore()
    }, 90)

    return () => clearLock()
  }, [itemCount, scrollerRef, resolveAnchorTop, clearLock, onRestored])

  return { prepareAnchor }
}
