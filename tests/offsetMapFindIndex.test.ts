import { describe, it, expect } from "vitest"
import { OffsetMap } from "../src/core/offsetMap"

describe("OffsetMap.findIndexAtOffset", () => {
  it("returns 0 for empty map", () => {
    const om = new OffsetMap(0, 50)
    expect(om.findIndexAtOffset(100)).toBe(0)
  })

  it("returns 0 for negative offset", () => {
    const om = new OffsetMap(5, 50)
    expect(om.findIndexAtOffset(-10)).toBe(0)
  })

  it("returns last index for offset >= totalSize", () => {
    const om = new OffsetMap(5, 50)
    expect(om.findIndexAtOffset(300)).toBe(4)
  })

  it("uniform sizes — finds correct index", () => {
    const om = new OffsetMap(5, 50)
    // offsets: 0, 50, 100, 150, 200
    expect(om.findIndexAtOffset(0)).toBe(0)
    expect(om.findIndexAtOffset(49)).toBe(0)
    expect(om.findIndexAtOffset(50)).toBe(1)
    expect(om.findIndexAtOffset(99)).toBe(1)
    expect(om.findIndexAtOffset(100)).toBe(2)
    expect(om.findIndexAtOffset(199)).toBe(3)
    expect(om.findIndexAtOffset(200)).toBe(4)
  })

  it("variable sizes after setSize", () => {
    const om = new OffsetMap(4, 50)
    om.setSize(1, 100)
    // offsets: 0, 50, 150, 200
    expect(om.findIndexAtOffset(0)).toBe(0)
    expect(om.findIndexAtOffset(50)).toBe(1)
    expect(om.findIndexAtOffset(149)).toBe(1)
    expect(om.findIndexAtOffset(150)).toBe(2)
    expect(om.findIndexAtOffset(200)).toBe(3)
  })

  it("consistent with getOffset — for all positions", () => {
    const om = new OffsetMap(10, 40)
    om.setSize(2, 80)
    om.setSize(5, 120)
    for (let i = 0; i < om.count; i++) {
      const off = om.getOffset(i)
      expect(om.findIndexAtOffset(off)).toBe(i)
    }
  })
})
