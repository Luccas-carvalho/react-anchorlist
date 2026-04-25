/**
 * OffsetMap — Fenwick BIT (Binary Indexed Tree) backed offset index.
 *
 * Complexity (n = item count):
 *   getOffset(i)        O(log n)   via BIT prefix query
 *   getSize(i)          O(1)       direct array read
 *   setSize(i, sz)      O(log n)   BIT point update
 *   totalSize()         O(log n)   BIT full prefix query
 *   findIndexAtOffset   O(log n)   BIT binary descent
 *   prepend(k)          O(n)       full rebuild — acceptable, rare
 *   append(k)           O(k log n) incremental BIT updates
 *   resize(n)           O(n)       rebuild when shrinking; append when growing
 */
export class OffsetMap {
  private sizes: number[]
  /** 1-indexed Fenwick tree; bit[0] unused */
  private bit: number[]
  private defaultSize: number

  constructor(count: number, defaultSize: number) {
    this.defaultSize = defaultSize
    this.sizes = count > 0 ? (Array(count).fill(defaultSize) as number[]) : []
    this.bit = Array(count + 1).fill(0) as number[]
    if (count > 0) this._buildBIT()
  }

  // ── Fenwick internals ────────────────────────────────────────────────────

  private _buildBIT(): void {
    const n = this.sizes.length
    this.bit = Array(n + 1).fill(0) as number[]
    for (let i = 0; i < n; i++) {
      this._bitUpdate(i + 1, this.sizes[i] ?? this.defaultSize)
    }
  }

  private _bitUpdate(i: number, delta: number): void {
    const n = this.sizes.length
    for (; i <= n; i += i & -i) {
      this.bit[i] = (this.bit[i] ?? 0) + delta
    }
  }

  /** Prefix sum of sizes[0..i-1] (i is 1-based count). */
  private _bitQuery(i: number): number {
    let sum = 0
    for (; i > 0; i -= i & -i) sum += this.bit[i] ?? 0
    return sum
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Top pixel of item at 0-based index. O(log n). */
  getOffset(index: number): number {
    if (index <= 0) return 0
    return this._bitQuery(index)
  }

  getSize(index: number): number {
    return this.sizes[index] ?? this.defaultSize
  }

  /** Returns true if the value changed. O(log n). */
  setSize(index: number, size: number): boolean {
    const current = this.sizes[index] ?? this.defaultSize
    if (current === size) return false
    const delta = size - current
    this.sizes[index] = size
    this._bitUpdate(index + 1, delta)
    return true
  }

  prepend(count: number): void {
    const newSizes = Array(count).fill(this.defaultSize) as number[]
    this.sizes = [...newSizes, ...this.sizes]
    this._buildBIT()
  }

  append(count: number): void {
    for (let i = 0; i < count; i++) this.sizes.push(this.defaultSize)
    this._buildBIT()
  }

  resize(newCount: number): void {
    const current = this.sizes.length
    if (newCount > current) {
      this.append(newCount - current)
    } else if (newCount < current) {
      this.sizes = this.sizes.slice(0, newCount)
      this._buildBIT()
    }
  }

  totalSize(): number {
    const n = this.sizes.length
    if (n === 0) return 0
    return this._bitQuery(n)
  }

  /**
   * O(log n) binary descent on BIT.
   * Returns 0-based index of the item whose range contains pixel offset `px`.
   */
  findIndexAtOffset(px: number): number {
    const n = this.sizes.length
    if (n === 0) return 0
    if (px <= 0) return 0
    const total = this._bitQuery(n)
    if (px >= total) return n - 1

    let idx = 0
    let remaining = px
    // Highest power of 2 <= n
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

  get count(): number {
    return this.sizes.length
  }

  getSizes(): number[] {
    return this.sizes
  }

  /**
   * Returns a computed offsets array for backward-compat with binary search helpers.
   * O(n) — prefer findIndexAtOffset when possible.
   */
  getOffsets(): number[] {
    const n = this.sizes.length
    const out = new Array<number>(n)
    let acc = 0
    for (let i = 0; i < n; i++) {
      out[i] = acc
      acc += this.sizes[i] ?? this.defaultSize
    }
    return out
  }
}
