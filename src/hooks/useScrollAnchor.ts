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
 * v2: replaces the single-RAF follow-up with a frame-settling loop (up to
 * MAX_SETTLE_FRAMES) that keeps re-applying the anchor target until the
 * computed target is stable. This handles large prepends (30+ items) where
 * ResizeObserver measurements continue to arrive for multiple frames after
 * the initial restore, shifting the correct anchor position.
 *
 * The state machine blocks measurement compensation during the restore window,
 * so the loop converges without fighting the pipeline.
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

    const getTarget = () =>
      resolveAnchorTargetFromSnapshot({
        snapshot,
        currentScrollHeight: el.scrollHeight,
        resolveAnchorTop,
      })

    // Initial synchronous restore
    const initialTarget = getTarget()
    if (Number.isFinite(initialTarget) && Math.abs(el.scrollTop - initialTarget) > 1) {
      el.scrollTop = initialTarget
    }

    // Block measurement compensation for the duration of settling.
    // Window is extended per frame while target is still moving; hard cap at 800ms.
    const MAX_SETTLE_FRAMES = 8
    const MAX_SETTLE_MS = 800
    const STABLE_THRESHOLD_PX = 1
    const startedAt = performance.now()
    let frames = 0
    let rafId: number

    stateMachine.beginRestore(MAX_SETTLE_MS)

    const settle = () => {
      const nextEl = scrollerRef.current
      if (!nextEl) {
        stateMachine.endRestore()
        onRestored?.()
        return
      }

      const target = getTarget()
      const diff = Math.abs(nextEl.scrollTop - target)
      const elapsed = performance.now() - startedAt
      frames++

      if (diff > STABLE_THRESHOLD_PX) {
        // Target still moving — re-apply and continue
        nextEl.scrollTop = target
      }

      if (frames >= MAX_SETTLE_FRAMES || elapsed >= MAX_SETTLE_MS) {
        // Safety valve: stop regardless of convergence
        stateMachine.endRestore()
        onRestored?.()
        return
      }

      // Continue settling next frame
      rafId = requestAnimationFrame(settle)
    }

    rafId = requestAnimationFrame(settle)

    return () => {
      cancelAnimationFrame(rafId)
      stateMachine.endRestore()
    }
  }, [itemCount, scrollerRef, resolveAnchorTop, stateMachine, onRestored])

  return { prepareAnchor }
}
