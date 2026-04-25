export type ListMutation =
  | { type: "initial" }
  | { type: "cleared" }
  | { type: "prepend"; count: number }
  | { type: "append"; count: number }
  | { type: "mixed" }

/**
 * Detects how a list mutated between two key snapshots.
 * O(1) for the common cases (append/prepend/clear/initial).
 * Falls back to "mixed" for arbitrary reorders or splices.
 */
export function detectMutation(
  prevKeys: (string | number)[],
  nextKeys: (string | number)[]
): ListMutation {
  const prevN = prevKeys.length
  const nextN = nextKeys.length

  if (prevN === 0 && nextN === 0) return { type: "cleared" }
  if (prevN === 0) return { type: "initial" }
  if (nextN === 0) return { type: "cleared" }

  if (nextN > prevN) {
    const delta = nextN - prevN
    // Pure prepend: prev[0] appears at nextKeys[delta]
    if (nextKeys[delta] === prevKeys[0]) {
      // Verify suffix matches (spot-check last key)
      if (nextKeys[nextN - 1] === prevKeys[prevN - 1]) {
        return { type: "prepend", count: delta }
      }
    }
    // Pure append: prev[0] still at nextKeys[0]
    if (nextKeys[0] === prevKeys[0] && nextKeys[prevN - 1] === prevKeys[prevN - 1]) {
      return { type: "append", count: delta }
    }
    return { type: "mixed" }
  }

  if (nextN < prevN) {
    // Items removed — treat as mixed (scroll anchor may need resetting)
    return { type: "mixed" }
  }

  // Same length — could be a no-op or full replace; not tracked here
  return { type: "mixed" }
}
