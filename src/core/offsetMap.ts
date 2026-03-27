export class OffsetMap {
  private offsets: number[]
  private sizes: number[]
  private defaultSize: number

  constructor(count: number, defaultSize: number) {
    this.defaultSize = defaultSize
    this.sizes = count > 0 ? (Array(count).fill(defaultSize) as number[]) : []
    this.offsets = count > 0 ? (Array(count).fill(0) as number[]) : []
    if (count > 0) this._recalcFrom(0)
  }

  private _recalcFrom(startIndex: number): void {
    for (let i = startIndex; i < this.sizes.length; i++) {
      this.offsets[i] =
        i === 0
          ? 0
          : (this.offsets[i - 1] ?? 0) + (this.sizes[i - 1] ?? this.defaultSize)
    }
  }

  getOffset(index: number): number {
    return this.offsets[index] ?? 0
  }

  getSize(index: number): number {
    return this.sizes[index] ?? this.defaultSize
  }

  /** Returns true if the value changed */
  setSize(index: number, size: number): boolean {
    if (this.sizes[index] === size) return false
    this.sizes[index] = size
    this._recalcFrom(index + 1)
    return true
  }

  prepend(count: number): void {
    const newSizes = Array(count).fill(this.defaultSize) as number[]
    this.sizes = [...newSizes, ...this.sizes]
    this.offsets = Array(this.sizes.length).fill(0) as number[]
    this._recalcFrom(0)
  }

  append(count: number): void {
    const start = this.sizes.length
    for (let i = 0; i < count; i++) {
      this.sizes.push(this.defaultSize)
      this.offsets.push(0)
    }
    this._recalcFrom(start)
  }

  resize(newCount: number): void {
    const current = this.sizes.length
    if (newCount > current) {
      this.append(newCount - current)
    } else if (newCount < current) {
      this.sizes = this.sizes.slice(0, newCount)
      this.offsets = this.offsets.slice(0, newCount)
    }
  }

  totalSize(): number {
    if (this.sizes.length === 0) return 0
    const last = this.sizes.length - 1
    return (this.offsets[last] ?? 0) + (this.sizes[last] ?? this.defaultSize)
  }

  get count(): number {
    return this.sizes.length
  }

  getOffsets(): number[] {
    return this.offsets
  }

  getSizes(): number[] {
    return this.sizes
  }
}
