/**
 * Deviation controller — pixel-perfect scroll compensation.
 *
 * When content above the viewport changes height (prepend, late image load,
 * ResizeObserver delta), the browser keeps `scrollTop` constant which makes
 * the visible content appear to jump. The deviation pattern fixes this by
 * mirroring react-virtuoso's `upwardScrollFixSystem`:
 *
 *   1. Same paint frame: apply `transform: translateY(-deviation)` on the
 *      inner container — the visual shift cancels the apparent jump.
 *   2. Next animation frame: call `scrollerEl.scrollBy({ top: amount })` to
 *      advance the underlying scroll position.
 *   3. Frame after that: reset the transform to 0.
 *
 * The dual-RAF sequence is crucial — without it the `scrollBy` could land
 * before the transform had a chance to paint, producing a single-frame flash.
 *
 * Mobile Safari special case: while a momentum scroll is in progress, Safari
 * silently ignores `scrollBy`. We instead accumulate the deviation as a
 * persistent visual shift and flush it (via scrollBy) once the user stops
 * scrolling — either on `scrollend` or after a 150 ms idle timeout.
 */
export interface DeviationController {
  /** Currently applied visual deviation in pixels. */
  readonly current: number

  /** Attach to DOM. Must be called before {@link DeviationController.schedule}. */
  attach(innerEl: HTMLElement, scrollerEl: HTMLElement): void

  /** Detach. Cancels any pending RAFs and resets state. */
  detach(): void

  /**
   * Schedule a scroll adjustment of `amount` pixels.
   * Positive amount = items above viewport grew; we compensate by shifting the
   * inner container then advancing scrollTop.
   * Negative amount = items above shrank.
   * Multiple `schedule()` calls before the next RAF are accumulated.
   */
  schedule(amount: number): void

  /** Force-flush any pending deviation immediately (no RAF). For test/cleanup. */
  flushSync(): void
}

const SAFARI_FLUSH_TIMEOUT_MS = 150

function detectMobileSafari(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent
  return (
    /iP(ad|od|hone)/i.test(ua) &&
    /WebKit/i.test(ua) &&
    !/CriOS|FxiOS/.test(ua)
  )
}

export function createDeviationController(): DeviationController {
  let innerEl: HTMLElement | null = null
  let scrollerEl: HTMLElement | null = null

  /** px value such that the inner is rendered with transform: translateY(-appliedDeviation). */
  let appliedDeviation = 0
  /** Sum of schedule() calls awaiting the next animation frame. */
  let pendingAmount = 0

  /** RAF handle for the deferred flush of pending schedule() calls. */
  let scheduleRaf: number | null = null
  let raf1: number | null = null
  let raf2: number | null = null

  let isMobileSafari = false
  let isScrolling = false
  let safariFlushTimer: ReturnType<typeof setTimeout> | null = null

  function applyTransform(px: number) {
    appliedDeviation = px
    if (!innerEl) return
    if (px === 0) {
      innerEl.style.transform = ""
    } else {
      innerEl.style.transform = `translateY(${-px}px)`
    }
  }

  function cancelRafs() {
    if (scheduleRaf !== null) {
      cancelAnimationFrame(scheduleRaf)
      scheduleRaf = null
    }
    if (raf1 !== null) {
      cancelAnimationFrame(raf1)
      raf1 = null
    }
    if (raf2 !== null) {
      cancelAnimationFrame(raf2)
      raf2 = null
    }
  }

  function clearSafariTimer() {
    if (safariFlushTimer !== null) {
      clearTimeout(safariFlushTimer)
      safariFlushTimer = null
    }
  }

  function performScrollByAndReset(amount: number) {
    // Step 2 (next animation frame): advance the scroll position, then collapse
    // the transform back to where it was before this batch. The two operations
    // happen in the same frame so the user never sees the intermediate state.
    raf1 = requestAnimationFrame(() => {
      raf1 = null
      if (!scrollerEl) return
      scrollerEl.scrollBy({ top: amount })
      applyTransform(appliedDeviation - amount)

      // Step 3 (frame after): defensive cleanup — if we landed on 0, force the
      // inline style off so the element doesn't keep an explicit transform: ""
      // sentinel that future reads might trip over.
      raf2 = requestAnimationFrame(() => {
        raf2 = null
        if (appliedDeviation === 0 && innerEl) {
          innerEl.style.transform = ""
        }
      })
    })
  }

  function flushPending() {
    scheduleRaf = null
    if (pendingAmount === 0 || !scrollerEl || !innerEl) {
      pendingAmount = 0
      return
    }
    const amount = pendingAmount
    pendingAmount = 0

    // Mobile Safari mid-momentum-scroll: scrollBy is ignored. Accumulate the
    // visual shift instead and defer the scrollBy until the user stops.
    if (isMobileSafari && isScrolling) {
      applyTransform(appliedDeviation + amount)
      armSafariFlush()
      return
    }

    // Step 1 (this frame): apply the visual transform to cancel the apparent
    // jump caused by the size change above the viewport.
    applyTransform(appliedDeviation + amount)

    performScrollByAndReset(amount)
  }

  function armSafariFlush() {
    clearSafariTimer()
    safariFlushTimer = setTimeout(() => {
      safariFlushTimer = null
      isScrolling = false
      flushAccumulatedDeviation()
    }, SAFARI_FLUSH_TIMEOUT_MS)
  }

  function flushAccumulatedDeviation() {
    if (appliedDeviation === 0 || !scrollerEl) return
    const amount = appliedDeviation
    // Move scroll position by the accumulated amount, then collapse the
    // transform on the next frame.
    performScrollByAndReset(amount)
  }

  function onScroll() {
    if (!isMobileSafari) return
    isScrolling = true
    armSafariFlush()
  }

  function onScrollEnd() {
    if (!isMobileSafari) return
    isScrolling = false
    clearSafariTimer()
    flushAccumulatedDeviation()
  }

  return {
    get current() {
      return appliedDeviation
    },

    attach(inner, scroller) {
      // Idempotent re-attach: if we were already attached to different nodes,
      // detach first so we don't leak listeners or RAFs.
      if (innerEl !== null || scrollerEl !== null) {
        this.detach()
      }
      innerEl = inner
      scrollerEl = scroller
      isMobileSafari = detectMobileSafari()

      if (isMobileSafari) {
        scrollerEl.addEventListener("scroll", onScroll, { passive: true })
        scrollerEl.addEventListener("scrollend", onScrollEnd)
      }
    },

    detach() {
      cancelRafs()
      clearSafariTimer()
      if (scrollerEl && isMobileSafari) {
        scrollerEl.removeEventListener("scroll", onScroll)
        scrollerEl.removeEventListener("scrollend", onScrollEnd)
      }
      // Reset visual state on the inner before dropping the reference.
      if (innerEl && appliedDeviation !== 0) {
        innerEl.style.transform = ""
      }
      innerEl = null
      scrollerEl = null
      appliedDeviation = 0
      pendingAmount = 0
      isScrolling = false
    },

    schedule(amount) {
      if (amount === 0) return
      if (!innerEl || !scrollerEl) return

      const wasIdle = pendingAmount === 0
      pendingAmount += amount
      if (!wasIdle) return // already scheduled in this frame; just accumulate

      // We coalesce through a microtask-equivalent (a single RAF) so that
      // multiple synchronous schedule() calls — typical of a ResizeObserver
      // batch — apply once.
      scheduleRaf = requestAnimationFrame(flushPending)
    },

    flushSync() {
      // Apply any pending schedule() amounts immediately, bypassing the RAF.
      if (pendingAmount !== 0 && innerEl && scrollerEl) {
        const amount = pendingAmount
        pendingAmount = 0
        applyTransform(appliedDeviation + amount)
        if (!(isMobileSafari && isScrolling)) {
          scrollerEl.scrollBy({ top: amount })
          applyTransform(appliedDeviation - amount)
        }
      }
      // Force-clear any stale RAFs so they don't fire after this synchronous
      // resolution.
      cancelRafs()
    },
  }
}
