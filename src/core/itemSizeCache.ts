import type { OffsetMap } from "./offsetMap"

/**
 * Persists measured item heights by key.
 * Survives re-renders and item reordering — heights are re-applied whenever
 * the OffsetMap is rebuilt.
 */
export class ItemSizeCache {
  private cache: Map<string | number, number> = new Map()

  get(key: string | number): number | undefined {
    return this.cache.get(key)
  }

  set(key: string | number, size: number): void {
    this.cache.set(key, size)
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

  /** Re-applies all cached sizes to the OffsetMap using a key→index map */
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
