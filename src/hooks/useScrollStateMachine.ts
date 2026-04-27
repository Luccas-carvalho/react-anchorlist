import { useCallback, useRef } from "react"

export type ScrollState = "idle" | "scrolling" | "restoring" | "animating"

export interface ScrollStateMachine {
  getState: () => ScrollState
  transition: (next: ScrollState) => void
  /**
   * Enter `restoring` — blocks measurements from applying scroll compensation.
   * Automatically returns to `idle` after `durationMs` if not manually released.
   */
  beginRestore: (durationMs?: number) => void
  endRestore: () => void
  isRestoring: () => boolean
}

/**
 * Lightweight state machine that serializes scroll operations.
 * Prevents ResizeObserver compensation from fighting anchor restoration.
 *
 * Returns a STABLE object reference (via useRef) so that callers can safely
 * include `stateMachine` in useLayoutEffect/useEffect dependency arrays without
 * triggering spurious re-runs on every render.
 */
export function useScrollStateMachine(): ScrollStateMachine {
  const stateRef = useRef<ScrollState>("idle")
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Create the machine object exactly once — all methods close over the refs above,
  // which are always up-to-date without needing the object to be recreated.
  const machineRef = useRef<ScrollStateMachine | null>(null)
  if (!machineRef.current) {
    const clearRestoreTimer = () => {
      if (restoreTimerRef.current !== null) {
        clearTimeout(restoreTimerRef.current)
        restoreTimerRef.current = null
      }
    }

    machineRef.current = {
      getState: () => stateRef.current,
      transition: (next: ScrollState) => {
        if (next !== "restoring") clearRestoreTimer()
        stateRef.current = next
      },
      beginRestore: (durationMs = 150) => {
        clearRestoreTimer()
        stateRef.current = "restoring"
        restoreTimerRef.current = setTimeout(() => {
          restoreTimerRef.current = null
          if (stateRef.current === "restoring") stateRef.current = "idle"
        }, durationMs)
      },
      endRestore: () => {
        clearRestoreTimer()
        if (stateRef.current === "restoring") stateRef.current = "idle"
      },
      isRestoring: () => stateRef.current === "restoring",
    }
  }

  return machineRef.current
}
