/**
 * Bidirectional key↔index mapping.
 * Extracted from useVirtualEngine so hooks can share a typed, testable module.
 */
export class KeyIndex {
  private keyToIndex = new Map<string | number, number>()
  private indexToKey: (string | number)[] = []

  get count(): number {
    return this.indexToKey.length
  }

  rebuild(keys: (string | number)[]): void {
    this.indexToKey = keys
    this.keyToIndex = new Map(keys.map((k, i) => [k, i]))
  }

  getIndex(key: string | number): number | undefined {
    return this.keyToIndex.get(key)
  }

  getKey(index: number): string | number | undefined {
    return this.indexToKey[index]
  }

  getKeys(): (string | number)[] {
    return this.indexToKey
  }

  has(key: string | number): boolean {
    return this.keyToIndex.has(key)
  }
}
