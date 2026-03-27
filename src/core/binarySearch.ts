/** O(log n) — finds index of first item whose top edge is >= scrollTop */
export function findFirstVisibleIndex(offsets: number[], scrollTop: number): number {
  if (offsets.length === 0) return 0
  let lo = 0
  let hi = offsets.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((offsets[mid] ?? 0) < scrollTop) lo = mid + 1
    else hi = mid
  }
  // Step back one — the item that starts just before scrollTop is still partially visible
  return Math.max(0, lo > 0 && (offsets[lo] ?? 0) > scrollTop ? lo - 1 : lo)
}

/** O(log n) — finds the last item whose top edge is < scrollBottom */
export function findLastVisibleIndex(
  offsets: number[],
  _sizes: number[],
  scrollBottom: number
): number {
  if (offsets.length === 0) return 0
  let lo = 0
  let hi = offsets.length - 1
  let result = 0

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if ((offsets[mid] ?? 0) < scrollBottom) {
      result = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }

  return result
}
