import { useCallback, useRef } from "react"
import type { OffsetMap } from "../core/offsetMap"
import type { ScrollToIndexOpts } from "../types"

/**
 * Programmatic scroll to item index.
 * Supports both signatures for backward compatibility:
 * 1) scrollToIndex(index, opts?)
 * 2) scrollToIndex({ index, align, behavior, offset })
 */
export function useScrollToIndex(
  scrollerRef: React.RefObject<HTMLDivElement>,
  offsetMapRef: React.MutableRefObject<OffsetMap | null>,
  innerRef?: React.RefObject<HTMLDivElement>,
  options?: { reconcile?: boolean }
): (index: number, opts?: ScrollToIndexOpts) => void {
  const reconcileEnabled = options?.reconcile ?? true
  const reconcileRafRef = useRef<number | null>(null)

  return useCallback(
    ((indexOrOpts: number | ({ index: number } & ScrollToIndexOpts), opts?: ScrollToIndexOpts) => {
      const el = scrollerRef.current
      const om = offsetMapRef.current
      if (!el || !om) return

      if (reconcileRafRef.current !== null) {
        cancelAnimationFrame(reconcileRafRef.current)
        reconcileRafRef.current = null
      }

      let index: number
      let resolvedOpts: ScrollToIndexOpts | undefined

      // Back-compat with Virtuoso-like signature: scrollToIndex({ index, ...opts })
      if (typeof indexOrOpts === "object" && indexOrOpts !== null) {
        index = indexOrOpts.index
        resolvedOpts = {
          align: indexOrOpts.align,
          behavior: indexOrOpts.behavior,
          offset: indexOrOpts.offset,
        }
      } else {
        index = indexOrOpts
        resolvedOpts = opts
      }

      if (!Number.isFinite(index)) return

      const clampedIndex = Math.max(0, Math.min(Math.floor(index), om.count - 1))
      const itemOffset = om.getOffset(clampedIndex)
      const itemSize = om.getSize(clampedIndex)
      const align = resolvedOpts?.align ?? "start"
      const behavior = resolvedOpts?.behavior ?? "auto"
      const extraOffset = resolvedOpts?.offset ?? 0

      const resolveTarget = (): number => {
        const nextOm = offsetMapRef.current
        const nextEl = scrollerRef.current
        if (!nextOm || !nextEl) return 0
        const currentInnerOffset = innerRef?.current?.offsetTop ?? 0
        const dynamicItemOffset = nextOm.getOffset(clampedIndex)
        const dynamicItemSize = nextOm.getSize(clampedIndex)
        if (align === "start") {
          return currentInnerOffset + dynamicItemOffset + extraOffset
        }
        if (align === "center") {
          return currentInnerOffset + dynamicItemOffset - nextEl.clientHeight / 2 + dynamicItemSize / 2 + extraOffset
        }
        return currentInnerOffset + dynamicItemOffset - nextEl.clientHeight + dynamicItemSize + extraOffset
      }

      const top = resolveTarget()
      const applyTop = (nextTop: number, nextBehavior: ScrollBehavior) => {
        if (typeof el.scrollTo === "function") {
          el.scrollTo({ top: nextTop, behavior: nextBehavior })
        } else {
          el.scrollTop = nextTop
        }
      }

      applyTop(Math.max(0, top), behavior)

      if (!reconcileEnabled) return

      const start = performance.now()
      let frames = 0
      const MAX_FRAMES = 12
      const MAX_TIME_MS = 300
      const EPSILON = 1

      const reconcile = () => {
        reconcileRafRef.current = null
        const nextEl = scrollerRef.current
        if (!nextEl) return
        const target = Math.max(0, resolveTarget())
        const diff = Math.abs(nextEl.scrollTop - target)
        const timedOut = performance.now() - start >= MAX_TIME_MS
        const maxFramesReached = frames >= MAX_FRAMES
        if (diff <= EPSILON || timedOut || maxFramesReached) return

        if (typeof nextEl.scrollTo === "function") {
          nextEl.scrollTo({ top: target, behavior: "auto" })
        } else {
          nextEl.scrollTop = target
        }
        frames += 1
        reconcileRafRef.current = requestAnimationFrame(reconcile)
      }

      reconcileRafRef.current = requestAnimationFrame(reconcile)
    }) as (index: number, opts?: ScrollToIndexOpts) => void,
    [scrollerRef, offsetMapRef, innerRef, reconcileEnabled]
  )
}
