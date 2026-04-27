import type { AnchorSnapshot } from "../types"
import type { OffsetMap } from "./offsetMap"

/**
 * Pure: resolves the scrollTop target after a prepend, given a saved snapshot.
 * Tries logical key anchor first, falls back to scrollHeight delta.
 */
export function resolveAnchorTargetFromSnapshot(params: {
  snapshot: AnchorSnapshot
  currentScrollHeight: number
  resolveAnchorTop: (key: string | number, offsetWithinItem: number) => number | null
}): number {
  const { snapshot, currentScrollHeight, resolveAnchorTop } = params

  if (snapshot.key !== null) {
    const primary = resolveAnchorTop(snapshot.key, snapshot.offsetWithinItem)
    if (primary !== null) return primary
  }

  if (snapshot.candidates?.length) {
    for (const candidate of snapshot.candidates) {
      const target = resolveAnchorTop(candidate.key, candidate.offsetWithinItem)
      if (target !== null) return target
    }
  }

  return snapshot.scrollTop + (currentScrollHeight - snapshot.scrollHeight)
}

/**
 * Pure: captures anchor snapshot from current DOM + offset state.
 * Scans up to `candidateLookahead` items from first visible.
 */
export function captureAnchorSnapshot(params: {
  scrollTop: number
  scrollHeight: number
  innerOffset: number
  offsetMap: OffsetMap
  keys: (string | number)[]
  candidateLookahead?: number
}): AnchorSnapshot | null {
  const { scrollTop, scrollHeight, innerOffset, offsetMap, keys, candidateLookahead = 6 } = params
  if (offsetMap.count === 0) return null

  const adjustedScrollTop = Math.max(0, scrollTop - innerOffset)
  const firstVisible = offsetMap.findIndexAtOffset(adjustedScrollTop)
  const key = keys[firstVisible] ?? null

  const candidates: NonNullable<AnchorSnapshot["candidates"]> = []
  const end = Math.min(offsetMap.count, firstVisible + candidateLookahead)
  for (let i = firstVisible; i < end; i++) {
    const candidateKey = keys[i] ?? null
    if (candidateKey === null) continue
    candidates.push({
      key: candidateKey,
      offsetWithinItem: adjustedScrollTop - offsetMap.getOffset(i),
    })
  }

  return {
    key,
    offsetWithinItem: adjustedScrollTop - offsetMap.getOffset(firstVisible),
    candidates,
    scrollTop,
    scrollHeight,
  }
}
