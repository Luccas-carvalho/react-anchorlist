import type { OffsetMap } from "./offsetMap"

const MAX_ENTRIES = 2000

/**
 * LRU cache of measured item heights keyed by item key.
 * Survives re-renders and item reordering — heights are re-applied whenever
 * the OffsetMap is rebuilt. Evicts oldest entries above MAX_ENTRIES to
 * prevent unbounded growth in long chat sessions.
 */
export class ItemSizeCache {
  private cache: Map<string | number, number> = new Map()

  get(key: string | number): number | undefined {
    const val = this.cache.get(key)
    if (val !== undefined) {
      // LRU promote: move to end
      this.cache.delete(key)
      this.cache.set(key, val)
    }
    return val
  }

  set(key: string | number, size: number): void {
    if (this.cache.has(key)) this.cache.delete(key)
    this.cache.set(key, size)
    if (this.cache.size > MAX_ENTRIES) {
      // Evict oldest (first entry in insertion-order Map)
      this.cache.delete(this.cache.keys().next().value as string | number)
    }
  }

  has(key: string | number): boolean {
    return this.cache.has(key)
  }

  delete(key: string | number): void {
    this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  /**
   * Average size of all measured items. Returns null if no items measured yet.
   * Used to seed prepend estimates instead of the configured estimatedItemSize,
   * which is often too large and causes large anchor-restore jumps.
   */
  getAverageSize(): number | null {
    if (this.cache.size === 0) return null
    let sum = 0
    for (const v of this.cache.values()) sum += v
    return sum / this.cache.size
  }

  /** Re-applies all cached sizes to the OffsetMap using a key→index map. */
  applyToOffsetMap(
    offsetMap: OffsetMap,
    keyToIndex: Map<string | number, number>
  ): void {
    for (const [key, size] of this.cache) {
      const index = keyToIndex.get(key)
      if (index !== undefined) {
        offsetMap.setSize(index, size)
      }
    }
  }
}
