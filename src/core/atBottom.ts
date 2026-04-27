import type { AtBottomHysteresis } from "../types"

export interface AtBottomStateInput {
  previous: boolean
  distanceFromBottom: number
  threshold: number
  hysteresis?: AtBottomHysteresis
}

/**
 * Pure: resolves whether the viewport is "at bottom" given current state.
 * Hysteresis prevents flickering: tighter threshold to enter, looser to leave.
 */
export function resolveAtBottomState(input: AtBottomStateInput): boolean {
  const { previous, distanceFromBottom, threshold, hysteresis } = input
  if (!hysteresis) return distanceFromBottom <= threshold

  const enter = Math.max(0, hysteresis.enter)
  const leave = Math.max(enter, hysteresis.leave)
  if (previous) return distanceFromBottom <= leave
  return distanceFromBottom <= enter
}
