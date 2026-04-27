/**
 * OffsetIndex — Fenwick BIT (Binary Indexed Tree) backed offset index.
 *
 * Maps 0-based item indices to cumulative pixel offsets in the document flow.
 * Used to compute paddingTop of the rendered range, total content height, and
 * to locate the item at a given pixel offset via O(log n) binary descent.
 *
 * Complexity (n = item count):
 *   getSize(i)            O(1)        direct array read
 *   setSize(i, sz)        O(log n)    BIT point update
 *   setSizes(map)         O(k log n)  k = map.size; full rebuild if k > n / 2
 *   getOffset(i)          O(log n)    BIT prefix query
 *   totalSize()           O(log n)    BIT full prefix query
 *   findIndexAtOffset(px) O(log n)    BIT binary descent
 *   prepend(k)            O(n)        full rebuild — acceptable, rare
 *   append(k)             O(k log n)  incremental BIT updates
 *   resize(n)             O(n) shrink / O(k log n) grow
 */
export class OffsetIndex {
  private sizes: number[]
  /** 1-indexed Fenwick tree; bit[0] unused. */
  private bit: number[]
  private readonly defaultSize: number

  constructor(count: number, defaultSize: number) {
    if (count < 0) throw new RangeError(`OffsetIndex: count must be >= 0, got ${count}`)
    this.defaultSize = defaultSize
    this.sizes = count > 0 ? (Array(count).fill(defaultSize) as number[]) : []
    this.bit = Array(count + 1).fill(0) as number[]
    if (count > 0) this.rebuildBIT()
  }

  get count(): number {
    return this.sizes.length
  }

  // ── Fenwick internals ────────────────────────────────────────────────────

  private rebuildBIT(): void {
    const n = this.sizes.length
    this.bit = Array(n + 1).fill(0) as number[]
    for (let i = 0; i < n; i++) {
      this.bitUpdate(i + 1, this.sizes[i] ?? this.defaultSize)
    }
  }

  private bitUpdate(i: number, delta: number): void {
    if (delta === 0) return
    const n = this.sizes.length
    for (; i <= n; i += i & -i) {
      this.bit[i] = (this.bit[i] ?? 0) + delta
    }
  }

  /** Prefix sum of sizes[0..i-1] (i is 1-based count). */
  private bitQuery(i: number): number {
    let sum = 0
    for (; i > 0; i -= i & -i) sum += this.bit[i] ?? 0
    return sum
  }

  private assertIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.sizes.length) {
      throw new RangeError(
        `OffsetIndex: index ${index} out of range [0, ${this.sizes.length})`,
      )
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Size of item at 0-based index. */
  getSize(index: number): number {
    this.assertIndex(index)
    return this.sizes[index] ?? this.defaultSize
  }

  /** Returns true if the value changed. */
  setSize(index: number, size: number): boolean {
    this.assertIndex(index)
    const current = this.sizes[index] ?? this.defaultSize
    if (current === size) return false
    this.sizes[index] = size
    this.bitUpdate(index + 1, size - current)
    return true
  }

  /**
   * Bulk set; rebuilds BIT once if entries.size > count / 2 (cheaper than
   * many point updates), otherwise applies each delta in place.
   */
  setSizes(entries: Map<number, number>): void {
    if (entries.size === 0) return
    const n = this.sizes.length

    if (entries.size > n / 2) {
      for (const [index, size] of entries) {
        if (!Number.isInteger(index) || index < 0 || index >= n) {
          throw new RangeError(
            `OffsetIndex.setSizes: index ${index} out of range [0, ${n})`,
          )
        }
        this.sizes[index] = size
      }
      this.rebuildBIT()
      return
    }

    for (const [index, size] of entries) {
      if (!Number.isInteger(index) || index < 0 || index >= n) {
        throw new RangeError(
          `OffsetIndex.setSizes: index ${index} out of range [0, ${n})`,
        )
      }
      const current = this.sizes[index] ?? this.defaultSize
      if (current === size) continue
      this.sizes[index] = size
      this.bitUpdate(index + 1, size - current)
    }
  }

  /** Cumulative offset (top pixel) of item at 0-based index. O(log n). */
  getOffset(index: number): number {
    if (index <= 0) return 0
    if (index > this.sizes.length) {
      throw new RangeError(
        `OffsetIndex: index ${index} out of range [0, ${this.sizes.length}]`,
      )
    }
    return this.bitQuery(index)
  }

  /** Sum of all sizes. O(log n). */
  totalSize(): number {
    const n = this.sizes.length
    if (n === 0) return 0
    return this.bitQuery(n)
  }

  /**
   * Returns 0-based index of the item whose [start, end) range contains px.
   * Clamped: px <= 0 returns 0; px >= total returns count - 1.
   * Returns 0 when count is 0.
   */
  findIndexAtOffset(px: number): number {
    const n = this.sizes.length
    if (n === 0) return 0
    if (px <= 0) return 0
    const total = this.bitQuery(n)
    if (px >= total) return n - 1

    let idx = 0
    let remaining = px
    let pw = 1
    while (pw <= n) pw <<= 1
    pw >>= 1

    for (; pw > 0; pw >>= 1) {
      const next = idx + pw
      if (next <= n && (this.bit[next] ?? 0) <= remaining) {
        idx = next
        remaining -= this.bit[idx] ?? 0
      }
    }
    return Math.min(idx, n - 1)
  }

  /**
   * Prepend `count` items at front.
   * `sizes` may be a number (uniform) or array of length `count` — when the
   * array is shorter or longer than `count`, missing slots fall back to
   * `defaultSize` and extra entries are ignored.
   */
  prepend(count: number, sizes?: number | number[]): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`OffsetIndex.prepend: count must be >= 0, got ${count}`)
    }
    if (count === 0) return

    let head: number[]
    if (Array.isArray(sizes)) {
      head = Array(count).fill(this.defaultSize) as number[]
      const limit = Math.min(count, sizes.length)
      for (let i = 0; i < limit; i++) {
        head[i] = sizes[i] ?? this.defaultSize
      }
    } else {
      const sz = sizes ?? this.defaultSize
      head = Array(count).fill(sz) as number[]
    }
    this.sizes = [...head, ...this.sizes]
    this.rebuildBIT()
  }

  /** Append `count` items at back, all using defaultSize. */
  append(count: number): void {
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError(`OffsetIndex.append: count must be >= 0, got ${count}`)
    }
    for (let k = 0; k < count; k++) {
      // Compute bit[m]'s inherited range sum BEFORE growing the arrays,
      // so bitQuery still reflects the current (pre-append) state.
      const prevN = this.sizes.length // = m - 1 (0-indexed)
      const m = prevN + 1 // 1-indexed position of new item
      const lo = m - (m & -m) // start-1 of bit[m]'s covered range
      const rangeSum = this.bitQuery(prevN) - this.bitQuery(lo)

      this.sizes.push(this.defaultSize)
      this.bit.push(0)

      // Set bit[m] = inherited range sum + new item size
      this.bit[m] = rangeSum + this.defaultSize

      // Propagate new item's contribution to parent BIT nodes
      const n = this.sizes.length
      let p = m + (m & -m)
      while (p <= n) {
        this.bit[p] = (this.bit[p] ?? 0) + this.defaultSize
        p += p & -p
      }
    }
  }

  /** Grow or shrink to `newCount`. */
  resize(newCount: number): void {
    if (!Number.isInteger(newCount) || newCount < 0) {
      throw new RangeError(`OffsetIndex.resize: newCount must be >= 0, got ${newCount}`)
    }
    const current = this.sizes.length
    if (newCount === current) return
    if (newCount > current) {
      this.append(newCount - current)
    } else {
      this.sizes = this.sizes.slice(0, newCount)
      this.rebuildBIT()
    }
  }
}
