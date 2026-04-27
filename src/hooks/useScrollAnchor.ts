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
  /**
   * Sync flush of any pending ResizeObserver measurements. Called at the start
   * of the restore layoutEffect AND on every settle frame so the offsetMap is
   * up-to-date before computing the anchor target.
   */
  flushPendingMeasures?: () => void
  onRestored?: () => void
}

/**
 * Keeps viewport anchored when items are prepended.
 *
 * Flow:
 *   1. prepareAnchor() captures current snapshot just before mutation.
 *   2. After mutation commits and itemCount grows, useLayoutEffect fires.
 *   3. flushPendingMeasures applies all newly-measured items synchronously
 *      (children's useLayoutEffect ran first → real sizes already in pending).
 *   4. Compute target via key-based resolution; fallback to scrollHeight delta.
 *   5. Set scrollTop = target. Schedule settle loop (up to MAX_SETTLE_FRAMES)
 *      to absorb late-arriving measurements (image decode, etc.).
 *   6. State machine blocks measurement-pipeline scrollBy compensation during
 *      the restore window so it doesn't fight with the loop.
 *
 * The capturedItemCountRef guard defers restoration until itemCount actually
 * grew. Without it, unrelated re-renders between prepareAnchor() and the
 * actual prepend would consume `anchorPending` and prevent restoration.
 */
export function useScrollAnchor(options: UseScrollAnchorOptions): { prepareAnchor: () => void } {
  const {
    scrollerRef,
    itemCount,
    captureAnchorSnapshot,
    resolveAnchorTop,
    stateMachine,
    flushPendingMeasures,
    onRestored,
  } = options

  const savedSnapshotRef = useRef<AnchorSnapshot | null>(null)
  const anchorPending = useRef(false)
  const capturedItemCountRef = useRef<number | null>(null)
  const itemCountRef = useRef(itemCount)
  itemCountRef.current = itemCount

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
    capturedItemCountRef.current = itemCountRef.current
    anchorPending.current = true
  }, [scrollerRef, captureAnchorSnapshot])

  useLayoutEffect(() => {
    if (!anchorPending.current) return
    if (capturedItemCountRef.current !== null && itemCount <= capturedItemCountRef.current) {
      return
    }
    const el = scrollerRef.current
    const snapshot = savedSnapshotRef.current
    if (!el || !snapshot) return

    anchorPending.current = false
    capturedItemCountRef.current = null

    flushPendingMeasures?.()

    const getTarget = () =>
      resolveAnchorTargetFromSnapshot({
        snapshot,
        currentScrollHeight: el.scrollHeight,
        resolveAnchorTop,
      })

    const initialTarget = getTarget()
    if (Number.isFinite(initialTarget) && Math.abs(el.scrollTop - initialTarget) > 1) {
      el.scrollTop = initialTarget
    }

    const MAX_SETTLE_FRAMES = 4
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

      flushPendingMeasures?.()

      const target = getTarget()
      const diff = Math.abs(nextEl.scrollTop - target)
      const elapsed = performance.now() - startedAt
      frames++

      if (diff > STABLE_THRESHOLD_PX) {
        nextEl.scrollTop = target
      }

      if (frames >= MAX_SETTLE_FRAMES || elapsed >= MAX_SETTLE_MS) {
        stateMachine.endRestore()
        onRestored?.()
        return
      }

      rafId = requestAnimationFrame(settle)
    }

    rafId = requestAnimationFrame(settle)

    return () => {
      cancelAnimationFrame(rafId)
      stateMachine.endRestore()
    }
  }, [itemCount, scrollerRef, resolveAnchorTop, stateMachine, onRestored, flushPendingMeasures])

  return { prepareAnchor }
}
