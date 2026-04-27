import { useCallback, useLayoutEffect, useRef } from "react"
import { resolveAnchorTargetFromSnapshot } from "../core/scrollAnchor"
import type { ScrollStateMachine } from "./useScrollStateMachine"
import type { AnchorSnapshot } from "../types"

const LOG = (...args: unknown[]) => console.log("[anchorlist:anchor]", ...args)

// Re-export for backward compat
export { resolveAnchorTargetFromSnapshot } from "../core/scrollAnchor"

interface UseScrollAnchorOptions {
  scrollerRef: React.RefObject<HTMLDivElement>
  itemCount: number
  captureAnchorSnapshot: () => AnchorSnapshot | null
  resolveAnchorTop: (key: string | number, offsetWithinItem: number) => number | null
  stateMachine: ScrollStateMachine
  flushPendingMeasures?: () => void
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
    flushPendingMeasures,
    onRestored,
  } = options

  const savedSnapshotRef = useRef<AnchorSnapshot | null>(null)
  const anchorPending = useRef(false)
  // itemCount at the moment prepareAnchor() was called — restore only fires after
  // itemCount actually grows (i.e. after prependMessages), preventing premature
  // restores triggered by unrelated re-renders (e.g. setLoading state updates).
  const capturedItemCountRef = useRef<number | null>(null)
  // Always-current itemCount for the prepareAnchor closure (no dep needed).
  const itemCountRef = useRef(itemCount)
  itemCountRef.current = itemCount

  const prepareAnchor = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return

    const snapshot = captureAnchorSnapshot()
    LOG("⚓ prepareAnchor captured", {
      key: snapshot?.key,
      offsetWithinItem: snapshot?.offsetWithinItem,
      candidatesCount: snapshot?.candidates?.length,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      capturedItemCount: itemCountRef.current,
    })
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
    // Guard: only restore AFTER items were actually prepended (itemCount grew).
    // Without this, any re-render between prepareAnchor() and prependMessages()
    // would prematurely consume anchorPending and prevent the real restore.
    if (capturedItemCountRef.current !== null && itemCount <= capturedItemCountRef.current) {
      LOG("⚓ anchor restore DEFERRED — itemCount not grown yet", {
        itemCount,
        capturedItemCount: capturedItemCountRef.current,
      })
      return
    }
    const el = scrollerRef.current
    const snapshot = savedSnapshotRef.current
    if (!el || !snapshot) return

    anchorPending.current = false
    capturedItemCountRef.current = null

    // Flush all pending ResizeObserver measurements synchronously BEFORE computing
    // the anchor target. VirtualItem useLayoutEffects (children) already ran and
    // populated pendingRef with real getBoundingClientRect sizes. Applying them now
    // gives accurate offsets in the first target calculation → pixel-perfect restore.
    flushPendingMeasures?.()

    const getTarget = () =>
      resolveAnchorTargetFromSnapshot({
        snapshot,
        currentScrollHeight: el.scrollHeight,
        resolveAnchorTop,
      })

    // Initial synchronous restore
    const initialTarget = getTarget()
    LOG("🔁 anchor restore START", {
      itemCount,
      snapshotKey: snapshot.key,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      initialTarget,
      diff: Number.isFinite(initialTarget) ? Math.abs(el.scrollTop - initialTarget) : "n/a",
    })
    if (Number.isFinite(initialTarget) && Math.abs(el.scrollTop - initialTarget) > 1) {
      el.scrollTop = initialTarget
      LOG("🔁 scrollTop set to", initialTarget)
    } else {
      LOG("🔁 scrollTop already correct or target invalid, skipping set")
    }

    // Block measurement compensation for the duration of settling.
    // Window is extended per frame while target is still moving; hard cap at 800ms.
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
        LOG("🔁 settle: el gone, ending restore")
        stateMachine.endRestore()
        onRestored?.()
        return
      }

      // Flush any measurements that arrived asynchronously after last frame
      // (e.g. ResizeObserver firing for late-mounted items, image decoding).
      flushPendingMeasures?.()

      const target = getTarget()
      const diff = Math.abs(nextEl.scrollTop - target)
      const elapsed = performance.now() - startedAt
      frames++

      LOG(`🔁 settle frame ${frames}`, {
        scrollTop: nextEl.scrollTop,
        target,
        diff,
        elapsed: Math.round(elapsed),
        scrollHeight: nextEl.scrollHeight,
      })

      if (diff > STABLE_THRESHOLD_PX) {
        // Target still moving — re-apply and continue
        nextEl.scrollTop = target
      }

      if (frames >= MAX_SETTLE_FRAMES || elapsed >= MAX_SETTLE_MS) {
        // Safety valve: stop regardless of convergence
        LOG("🔁 settle DONE", { frames, elapsed: Math.round(elapsed), finalScrollTop: nextEl.scrollTop })
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
