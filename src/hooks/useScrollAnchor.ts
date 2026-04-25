import { useCallback, useLayoutEffect, useRef } from "react"
import { resolveAnchorTargetFromSnapshot } from "../core/scrollAnchor"
import type { ScrollStateMachine } from "./useScrollStateMachine"
import type { AnchorSnapshot } from "../types"

// Re-export for backward compat
export { resolveAnchorTargetFromSnapshot } from "../core/scrollAnchor"

interface UseScrollAnchorOptions {
  scrollerRef: React.RefObject<HTMLDivElement>
  itemCount: number
  captureAnchorSnapshot: () => AnchorSnapshot | null
  resolveAnchorTop: (key: string | number, offsetWithinItem: number) => number | null
  stateMachine: ScrollStateMachine
  onRestored?: () => void
}

/**
 * Keeps viewport anchored when items are prepended.
 *
 * v1 change: replaces the 3-pass + setTimeout(90ms) restore with a single
 * synchronous restore guarded by the scroll state machine. The state machine
 * blocks ResizeObserver compensation during the restore window, eliminating
 * the race condition between measurement and anchor.
 */
export function useScrollAnchor(options: UseScrollAnchorOptions): { prepareAnchor: () => void } {
  const {
    scrollerRef,
    itemCount,
    captureAnchorSnapshot,
    resolveAnchorTop,
    stateMachine,
    onRestored,
  } = options

  const savedSnapshotRef = useRef<AnchorSnapshot | null>(null)
  const anchorPending = useRef(false)

  const prepareAnchor = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return

    const snapshot = captureAnchorSnapshot()
    savedSnapshotRef.current = snapshot ?? {
      key: null,
      offsetWithinItem: 0,
      candidates: [],
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

    // Block measurement compensation while restoring
    stateMachine.beginRestore(150)

    const target = resolveAnchorTargetFromSnapshot({
      snapshot,
      currentScrollHeight: el.scrollHeight,
      resolveAnchorTop,
    })

    if (Number.isFinite(target) && Math.abs(el.scrollTop - target) > 1) {
      el.scrollTop = target
    }

    // One follow-up frame — items may have measured during the layout pass
    // and shifted offsets slightly. One extra frame is enough; no timeout needed.
    const rafId = requestAnimationFrame(() => {
      const nextEl = scrollerRef.current
      if (!nextEl) { stateMachine.endRestore(); return }

      const nextTarget = resolveAnchorTargetFromSnapshot({
        snapshot,
        currentScrollHeight: nextEl.scrollHeight,
        resolveAnchorTop,
      })
      if (Number.isFinite(nextTarget) && Math.abs(nextEl.scrollTop - nextTarget) > 1) {
        nextEl.scrollTop = nextTarget
      }

      stateMachine.endRestore()
      onRestored?.()
    })

    return () => {
      cancelAnimationFrame(rafId)
      stateMachine.endRestore()
    }
  }, [itemCount, scrollerRef, resolveAnchorTop, stateMachine, onRestored])

  return { prepareAnchor }
}
