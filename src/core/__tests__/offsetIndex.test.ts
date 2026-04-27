import { describe, it, expect } from "vitest"
import { OffsetIndex } from "../offsetIndex"

describe("OffsetIndex — construction", () => {
  it("constructs empty index with count=0", () => {
    const idx = new OffsetIndex(0, 40)
    expect(idx.count).toBe(0)
    expect(idx.totalSize()).toBe(0)
  })

  it("constructs with count>0 using uniform default size", () => {
    const idx = new OffsetIndex(3, 40)
    expect(idx.count).toBe(3)
    expect(idx.getSize(0)).toBe(40)
    expect(idx.getSize(1)).toBe(40)
    expect(idx.getSize(2)).toBe(40)
    expect(idx.totalSize()).toBe(120)
  })

  it("throws on negative count", () => {
    expect(() => new OffsetIndex(-1, 40)).toThrow(RangeError)
  })
})

describe("OffsetIndex — getSize / setSize", () => {
  it("getSize returns default for uniform initial state", () => {
    const idx = new OffsetIndex(5, 50)
    for (let i = 0; i < 5; i++) expect(idx.getSize(i)).toBe(50)
  })

  it("setSize updates sizes and downstream offsets", () => {
    const idx = new OffsetIndex(4, 50)
    expect(idx.setSize(1, 100)).toBe(true)
    expect(idx.getSize(1)).toBe(100)
    expect(idx.getOffset(2)).toBe(150) // 50 + 100
    expect(idx.getOffset(3)).toBe(200) // 50 + 100 + 50
    expect(idx.totalSize()).toBe(250)
  })

  it("setSize returns false when value unchanged", () => {
    const idx = new OffsetIndex(3, 50)
    expect(idx.setSize(0, 50)).toBe(false)
  })

  it("setSize returns true when value changed", () => {
    const idx = new OffsetIndex(3, 50)
    expect(idx.setSize(0, 80)).toBe(true)
  })

  it("getSize throws on out-of-range index", () => {
    const idx = new OffsetIndex(3, 40)
    expect(() => idx.getSize(-1)).toThrow(RangeError)
    expect(() => idx.getSize(3)).toThrow(RangeError)
  })

  it("setSize throws on out-of-range index", () => {
    const idx = new OffsetIndex(3, 40)
    expect(() => idx.setSize(-1, 50)).toThrow(RangeError)
    expect(() => idx.setSize(3, 50)).toThrow(RangeError)
  })
})

describe("OffsetIndex — getOffset / totalSize with mixed sizes", () => {
  it("getOffset(0) is always 0", () => {
    const idx = new OffsetIndex(5, 50)
    expect(idx.getOffset(0)).toBe(0)
  })

  it("getOffset accumulates mixed sizes correctly", () => {
    const idx = new OffsetIndex(4, 10)
    idx.setSize(0, 30)
    idx.setSize(1, 20)
    idx.setSize(2, 50)
    idx.setSize(3, 15)
    expect(idx.getOffset(0)).toBe(0)
    expect(idx.getOffset(1)).toBe(30)
    expect(idx.getOffset(2)).toBe(50)
    expect(idx.getOffset(3)).toBe(100)
    expect(idx.totalSize()).toBe(115)
  })

  it("getOffset(count) equals totalSize", () => {
    const idx = new OffsetIndex(4, 50)
    idx.setSize(2, 70)
    expect(idx.getOffset(idx.count)).toBe(idx.totalSize())
  })

  it("totalSize equals count * defaultSize for uniform heights", () => {
    const idx = new OffsetIndex(5, 40)
    expect(idx.totalSize()).toBe(200)
  })
})

describe("OffsetIndex — findIndexAtOffset edge cases", () => {
  it("returns 0 when count=0 regardless of px", () => {
    const idx = new OffsetIndex(0, 40)
    expect(idx.findIndexAtOffset(0)).toBe(0)
    expect(idx.findIndexAtOffset(123)).toBe(0)
  })

  it("returns 0 when px=0", () => {
    const idx = new OffsetIndex(5, 50)
    expect(idx.findIndexAtOffset(0)).toBe(0)
  })

  it("returns last index when px >= totalSize", () => {
    const idx = new OffsetIndex(5, 50) // total = 250
    expect(idx.findIndexAtOffset(250)).toBe(4)
    expect(idx.findIndexAtOffset(9999)).toBe(4)
  })

  it("returns correct index for px between item starts", () => {
    const idx = new OffsetIndex(5, 50) // boundaries: 0, 50, 100, 150, 200, 250
    expect(idx.findIndexAtOffset(25)).toBe(0) // inside item 0
    expect(idx.findIndexAtOffset(75)).toBe(1) // inside item 1
    expect(idx.findIndexAtOffset(199)).toBe(3) // inside item 3
  })

  it("returns next index when px sits exactly on a boundary", () => {
    const idx = new OffsetIndex(5, 50)
    // Boundary px = 50 belongs to item 1 ([50, 100) range)
    expect(idx.findIndexAtOffset(50)).toBe(1)
    expect(idx.findIndexAtOffset(100)).toBe(2)
    expect(idx.findIndexAtOffset(200)).toBe(4)
  })

  it("clamps negative px to 0", () => {
    const idx = new OffsetIndex(3, 50)
    expect(idx.findIndexAtOffset(-10)).toBe(0)
  })

  it("works correctly with mixed sizes", () => {
    const idx = new OffsetIndex(4, 10)
    idx.setSize(0, 30) // [0, 30)
    idx.setSize(1, 20) // [30, 50)
    idx.setSize(2, 50) // [50, 100)
    idx.setSize(3, 15) // [100, 115)
    expect(idx.findIndexAtOffset(0)).toBe(0)
    expect(idx.findIndexAtOffset(29)).toBe(0)
    expect(idx.findIndexAtOffset(30)).toBe(1)
    expect(idx.findIndexAtOffset(49)).toBe(1)
    expect(idx.findIndexAtOffset(50)).toBe(2)
    expect(idx.findIndexAtOffset(99)).toBe(2)
    expect(idx.findIndexAtOffset(100)).toBe(3)
    expect(idx.findIndexAtOffset(114)).toBe(3)
    expect(idx.findIndexAtOffset(115)).toBe(3)
  })
})

describe("OffsetIndex — prepend", () => {
  it("prepend with no size argument uses defaultSize", () => {
    const idx = new OffsetIndex(2, 50)
    idx.prepend(3)
    expect(idx.count).toBe(5)
    expect(idx.getOffset(0)).toBe(0)
    expect(idx.getOffset(3)).toBe(150) // first original
    expect(idx.totalSize()).toBe(250)
  })

  it("prepend with uniform numeric size", () => {
    const idx = new OffsetIndex(2, 50)
    idx.prepend(2, 80)
    expect(idx.count).toBe(4)
    expect(idx.getSize(0)).toBe(80)
    expect(idx.getSize(1)).toBe(80)
    expect(idx.getSize(2)).toBe(50)
    expect(idx.totalSize()).toBe(260) // 80+80+50+50
  })

  it("prepend with array of exact length", () => {
    const idx = new OffsetIndex(2, 50)
    idx.prepend(3, [10, 20, 30])
    expect(idx.count).toBe(5)
    expect(idx.getSize(0)).toBe(10)
    expect(idx.getSize(1)).toBe(20)
    expect(idx.getSize(2)).toBe(30)
    expect(idx.getSize(3)).toBe(50)
    expect(idx.totalSize()).toBe(160)
  })

  it("prepend with array shorter than count — pads with default", () => {
    const idx = new OffsetIndex(1, 50)
    idx.prepend(4, [10, 20])
    expect(idx.count).toBe(5)
    expect(idx.getSize(0)).toBe(10)
    expect(idx.getSize(1)).toBe(20)
    expect(idx.getSize(2)).toBe(50) // padded
    expect(idx.getSize(3)).toBe(50) // padded
    expect(idx.getSize(4)).toBe(50) // original
  })

  it("prepend with array longer than count — extras ignored", () => {
    const idx = new OffsetIndex(1, 50)
    idx.prepend(2, [10, 20, 30, 40])
    expect(idx.count).toBe(3)
    expect(idx.getSize(0)).toBe(10)
    expect(idx.getSize(1)).toBe(20)
    expect(idx.getSize(2)).toBe(50)
  })

  it("prepend(0) is a no-op", () => {
    const idx = new OffsetIndex(3, 50)
    idx.prepend(0)
    expect(idx.count).toBe(3)
    expect(idx.totalSize()).toBe(150)
  })

  it("prepend throws on negative count", () => {
    const idx = new OffsetIndex(2, 50)
    expect(() => idx.prepend(-1)).toThrow(RangeError)
  })
})

describe("OffsetIndex — append", () => {
  it("append adds items at end with defaultSize", () => {
    const idx = new OffsetIndex(2, 50)
    idx.append(2)
    expect(idx.count).toBe(4)
    expect(idx.getOffset(2)).toBe(100)
    expect(idx.getOffset(3)).toBe(150)
    expect(idx.totalSize()).toBe(200)
  })

  it("append preserves existing sizes (BIT stays consistent)", () => {
    const idx = new OffsetIndex(3, 50)
    idx.setSize(0, 80)
    idx.setSize(2, 30)
    idx.append(1)
    // sizes: 80, 50, 30, 50
    expect(idx.totalSize()).toBe(210)
    expect(idx.getOffset(3)).toBe(160)
    expect(idx.getSize(3)).toBe(50)
  })

  it("append(0) is a no-op", () => {
    const idx = new OffsetIndex(3, 50)
    idx.append(0)
    expect(idx.count).toBe(3)
    expect(idx.totalSize()).toBe(150)
  })

  it("append from empty starts the BIT correctly", () => {
    const idx = new OffsetIndex(0, 40)
    idx.append(3)
    expect(idx.count).toBe(3)
    expect(idx.totalSize()).toBe(120)
    expect(idx.getOffset(2)).toBe(80)
  })

  it("append throws on negative count", () => {
    const idx = new OffsetIndex(2, 50)
    expect(() => idx.append(-1)).toThrow(RangeError)
  })
})

describe("OffsetIndex — resize", () => {
  it("resize up adds items with default size", () => {
    const idx = new OffsetIndex(2, 50)
    idx.resize(5)
    expect(idx.count).toBe(5)
    expect(idx.totalSize()).toBe(250)
  })

  it("resize down truncates from the end", () => {
    const idx = new OffsetIndex(5, 50)
    idx.setSize(0, 80)
    idx.setSize(4, 999)
    idx.resize(2)
    expect(idx.count).toBe(2)
    expect(idx.getSize(0)).toBe(80)
    expect(idx.getSize(1)).toBe(50)
    expect(idx.totalSize()).toBe(130)
  })

  it("resize to same count is a no-op", () => {
    const idx = new OffsetIndex(3, 50)
    idx.resize(3)
    expect(idx.count).toBe(3)
    expect(idx.totalSize()).toBe(150)
  })

  it("resize to 0 empties the index", () => {
    const idx = new OffsetIndex(4, 50)
    idx.resize(0)
    expect(idx.count).toBe(0)
    expect(idx.totalSize()).toBe(0)
  })

  it("resize throws on negative count", () => {
    const idx = new OffsetIndex(3, 50)
    expect(() => idx.resize(-1)).toThrow(RangeError)
  })
})

describe("OffsetIndex — setSizes (bulk)", () => {
  it("applies all entries from a small map (point updates)", () => {
    const idx = new OffsetIndex(10, 50)
    idx.setSizes(new Map([[0, 100], [4, 70]]))
    expect(idx.getSize(0)).toBe(100)
    expect(idx.getSize(4)).toBe(70)
    expect(idx.getSize(1)).toBe(50)
    expect(idx.totalSize()).toBe(100 + 50 * 8 + 70)
    expect(idx.getOffset(5)).toBe(100 + 50 * 3 + 70)
  })

  it("applies all entries from a large map (rebuild path)", () => {
    const idx = new OffsetIndex(6, 50)
    const map = new Map<number, number>([
      [0, 10],
      [1, 20],
      [2, 30],
      [3, 40],
      [4, 60],
    ])
    idx.setSizes(map)
    expect(idx.getSize(0)).toBe(10)
    expect(idx.getSize(4)).toBe(60)
    expect(idx.getSize(5)).toBe(50) // untouched
    expect(idx.totalSize()).toBe(10 + 20 + 30 + 40 + 60 + 50)
    expect(idx.getOffset(4)).toBe(100)
  })

  it("empty map is a no-op", () => {
    const idx = new OffsetIndex(3, 50)
    idx.setSizes(new Map())
    expect(idx.totalSize()).toBe(150)
  })

  it("skips entries equal to current value", () => {
    const idx = new OffsetIndex(3, 50)
    idx.setSizes(new Map([[0, 50], [1, 80]]))
    expect(idx.getSize(0)).toBe(50)
    expect(idx.getSize(1)).toBe(80)
    expect(idx.totalSize()).toBe(180)
  })

  it("throws on out-of-range index in map", () => {
    const idx = new OffsetIndex(3, 50)
    expect(() => idx.setSizes(new Map([[5, 100]]))).toThrow(RangeError)
  })
})

describe("OffsetIndex — count=1 (degenerate)", () => {
  it("supports all operations on a single-item index", () => {
    const idx = new OffsetIndex(1, 50)
    expect(idx.count).toBe(1)
    expect(idx.getSize(0)).toBe(50)
    expect(idx.getOffset(0)).toBe(0)
    expect(idx.totalSize()).toBe(50)
    expect(idx.findIndexAtOffset(0)).toBe(0)
    expect(idx.findIndexAtOffset(25)).toBe(0)
    expect(idx.findIndexAtOffset(50)).toBe(0)

    expect(idx.setSize(0, 80)).toBe(true)
    expect(idx.totalSize()).toBe(80)

    idx.append(1)
    expect(idx.count).toBe(2)
    expect(idx.totalSize()).toBe(130)

    idx.resize(1)
    expect(idx.count).toBe(1)
    expect(idx.getSize(0)).toBe(80)
  })
})

describe("OffsetIndex — performance smoke", () => {
  it("getOffset on 10k items stays well under linear scan time", () => {
    const N = 10_000
    const idx = new OffsetIndex(N, 40)
    // Vary some sizes so the BIT actually has interesting state.
    for (let i = 0; i < N; i += 7) idx.setSize(i, 60 + (i % 25))

    const samples = 5000
    const t0 = performance.now()
    let sink = 0
    for (let i = 0; i < samples; i++) {
      sink ^= idx.getOffset(Math.floor(Math.random() * N))
    }
    const elapsed = performance.now() - t0
    expect(sink).toBeDefined()
    // O(log n): 5k queries on 10k items should comfortably be < 200ms even
    // on slow CI runners. Loose bound — we're guarding against accidental
    // O(n) regressions, not micro-benchmarking.
    expect(elapsed).toBeLessThan(200)
  })

  it("findIndexAtOffset on 10k items is fast", () => {
    const N = 10_000
    const idx = new OffsetIndex(N, 40)
    const total = idx.totalSize()
    const samples = 5000
    const t0 = performance.now()
    for (let i = 0; i < samples; i++) {
      idx.findIndexAtOffset(Math.random() * total)
    }
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
