import { describe, it, expect } from "vitest"
import { calcRenderRange } from "../src/core/rangeCalc"

describe("calcRenderRange", () => {
  it("returns {start:0, end:-1} for empty list", () => {
    const range = calcRenderRange({ firstVisible: 0, lastVisible: 0, itemCount: 0, overscan: 3 })
    expect(range).toEqual({ start: 0, end: -1 })
  })

  it("applies overscan to both ends", () => {
    const range = calcRenderRange({ firstVisible: 5, lastVisible: 10, itemCount: 20, overscan: 3 })
    expect(range.start).toBe(2)   // 5 - 3
    expect(range.end).toBe(13)    // 10 + 3
  })

  it("clamps start to 0 when overscan would go negative", () => {
    const range = calcRenderRange({ firstVisible: 1, lastVisible: 5, itemCount: 20, overscan: 5 })
    expect(range.start).toBe(0)   // max(0, 1-5) = 0
  })

  it("clamps end to itemCount-1", () => {
    const range = calcRenderRange({ firstVisible: 15, lastVisible: 18, itemCount: 20, overscan: 5 })
    expect(range.end).toBe(19)    // min(19, 18+5) = 19
  })

  it("handles single item list", () => {
    const range = calcRenderRange({ firstVisible: 0, lastVisible: 0, itemCount: 1, overscan: 3 })
    expect(range.start).toBe(0)
    expect(range.end).toBe(0)
  })

  it("handles all items visible", () => {
    const range = calcRenderRange({ firstVisible: 0, lastVisible: 9, itemCount: 10, overscan: 2 })
    expect(range.start).toBe(0)
    expect(range.end).toBe(9)
  })

  it("with overscan=0 returns exact visible range", () => {
    const range = calcRenderRange({ firstVisible: 3, lastVisible: 7, itemCount: 20, overscan: 0 })
    expect(range.start).toBe(3)
    expect(range.end).toBe(7)
  })
})
