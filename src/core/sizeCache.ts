type Key = string | number

interface OffsetIndexLike {
  setSize(index: number, size: number): boolean
}

const DEFAULT_MAX_ENTRIES = 2000
const DEFAULT_RECENT_WINDOW = 50

/**
 * LRU size cache for a flow-layout virtual list.
 *
 * Backs prepend estimates and post-mutation rebuilds. Entries are stored in
 * insertion order; on `set()`, an existing key is deleted and re-inserted so
 * the most recently written keys live at the tail. `get()` does NOT promote —
 * recency here means recent INSERTIONS, since those are what reflect the
 * current message-type distribution for chat prepend estimation.
 *
 * When `cache.size > maxEntries`, the oldest entry (head of the Map) is
 * evicted to keep memory bounded across long sessions.
 */
export class SizeCache {
  private cache: Map<Key, number> = new Map()
  private readonly maxEntries: number

  constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries
  }

  set(key: Key, size: number): void {
    if (this.cache.has(key)) this.cache.delete(key)
    this.cache.set(key, size)
    if (this.cache.size > this.maxEntries) {
      // Evict oldest (first entry in insertion-order Map)
      const oldest = this.cache.keys().next().value as Key | undefined
      if (oldest !== undefined) this.cache.delete(oldest)
    }
  }

  get(key: Key): number | undefined {
    return this.cache.get(key)
  }

  has(key: Key): boolean {
    return this.cache.has(key)
  }

  delete(key: Key): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  bulkSet(entries: Array<[Key, number]>): void {
    for (const [key, size] of entries) {
      this.set(key, size)
    }
  }

  /** Total entries currently cached. */
  get size(): number {
    return this.cache.size
  }

  /** Mean of all cached sizes; null if empty. */
  getAverage(): number | null {
    if (this.cache.size === 0) return null
    let sum = 0
    for (const v of this.cache.values()) sum += v
    return sum / this.cache.size
  }

  /**
   * Mean of the last `window` insertion-ordered entries (default 50).
   * Returns null if empty. Window slides on every `set()` call (which
   * re-inserts existing keys at the tail), NOT on `get()`.
   */
  getRecentAverage(window: number = DEFAULT_RECENT_WINDOW): number | null {
    const n = this.cache.size
    if (n === 0) return null
    const take = Math.min(window, n)
    if (take <= 0) return null

    // Iterate from the tail backwards. Map has no reverse iterator, so we
    // grab values() (insertion order) and skip to the last `take` entries.
    const skip = n - take
    let i = 0
    let sum = 0
    for (const v of this.cache.values()) {
      if (i >= skip) sum += v
      i++
    }
    return sum / take
  }

  /**
   * Convenience: re-applies cached sizes to an OffsetIndex via a key→index
   * map. Used after rebuild on mutation.
   */
  applyToOffsetIndex(
    offsetIndex: OffsetIndexLike,
    keyToIndex: Map<Key, number>
  ): void {
    for (const [key, size] of this.cache) {
      const index = keyToIndex.get(key)
      if (index !== undefined) {
        offsetIndex.setSize(index, size)
      }
    }
  }
}
