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
 */
export function useScrollStateMachine(): ScrollStateMachine {
  const stateRef = useRef<ScrollState>("idle")
  const restoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearRestoreTimer = () => {
    if (restoreTimerRef.current !== null) {
      clearTimeout(restoreTimerRef.current)
      restoreTimerRef.current = null
    }
  }

  const getState = useCallback(() => stateRef.current, [])

  const transition = useCallback((next: ScrollState) => {
    if (next !== "restoring") clearRestoreTimer()
    stateRef.current = next
  }, [])

  const beginRestore = useCallback((durationMs = 150) => {
    clearRestoreTimer()
    stateRef.current = "restoring"
    restoreTimerRef.current = setTimeout(() => {
      restoreTimerRef.current = null
      if (stateRef.current === "restoring") stateRef.current = "idle"
    }, durationMs)
  }, [])

  const endRestore = useCallback(() => {
    clearRestoreTimer()
    if (stateRef.current === "restoring") stateRef.current = "idle"
  }, [])

  const isRestoring = useCallback(() => stateRef.current === "restoring", [])

  return { getState, transition, beginRestore, endRestore, isRestoring }
}
