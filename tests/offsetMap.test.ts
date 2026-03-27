import { describe, it, expect } from "vitest"
import { OffsetMap } from "../src/core/offsetMap"

describe("OffsetMap", () => {
  it("constructs empty map with count=0", () => {
    const om = new OffsetMap(0, 40)
    expect(om.count).toBe(0)
    expect(om.totalSize()).toBe(0)
  })

  it("constructs map with default sizes", () => {
    const om = new OffsetMap(3, 40)
    expect(om.count).toBe(3)
    expect(om.getSize(0)).toBe(40)
    expect(om.getSize(1)).toBe(40)
    expect(om.getSize(2)).toBe(40)
  })

  it("getOffset(0) is always 0", () => {
    const om = new OffsetMap(5, 50)
    expect(om.getOffset(0)).toBe(0)
  })

  it("getOffset(n) equals sum of all previous sizes", () => {
    const om = new OffsetMap(4, 50)
    expect(om.getOffset(0)).toBe(0)
    expect(om.getOffset(1)).toBe(50)
    expect(om.getOffset(2)).toBe(100)
    expect(om.getOffset(3)).toBe(150)
  })

  it("totalSize equals count * defaultSize for uniform heights", () => {
    const om = new OffsetMap(5, 40)
    expect(om.totalSize()).toBe(200)
  })

  it("setSize updates a single item and recalculates downstream offsets", () => {
    const om = new OffsetMap(4, 50)
    om.setSize(1, 100) // was 50, now 100 — delta +50
    expect(om.getSize(1)).toBe(100)
    expect(om.getOffset(2)).toBe(150) // 50 + 100
    expect(om.getOffset(3)).toBe(200) // 50 + 100 + 50
    expect(om.totalSize()).toBe(250)  // 50+100+50+50
  })

  it("setSize returns false when size unchanged", () => {
    const om = new OffsetMap(3, 50)
    expect(om.setSize(0, 50)).toBe(false)
  })

  it("setSize returns true when size changed", () => {
    const om = new OffsetMap(3, 50)
    expect(om.setSize(0, 80)).toBe(true)
  })

  it("prepend adds items at start and adjusts all offsets", () => {
    const om = new OffsetMap(2, 50)
    om.prepend(3)
    expect(om.count).toBe(5)
    // First 3 are new (50px each), next 2 are original
    expect(om.getOffset(0)).toBe(0)
    expect(om.getOffset(1)).toBe(50)
    expect(om.getOffset(2)).toBe(100)
    expect(om.getOffset(3)).toBe(150) // first original
    expect(om.getOffset(4)).toBe(200)
    expect(om.totalSize()).toBe(250)
  })

  it("append adds items at end", () => {
    const om = new OffsetMap(2, 50)
    om.append(2)
    expect(om.count).toBe(4)
    expect(om.getOffset(2)).toBe(100)
    expect(om.getOffset(3)).toBe(150)
    expect(om.totalSize()).toBe(200)
  })

  it("resize up adds items with default size", () => {
    const om = new OffsetMap(2, 50)
    om.resize(5)
    expect(om.count).toBe(5)
    expect(om.totalSize()).toBe(250)
  })

  it("resize down removes items from end", () => {
    const om = new OffsetMap(5, 50)
    om.resize(2)
    expect(om.count).toBe(2)
    expect(om.totalSize()).toBe(100)
  })

  it("resize to same count is a no-op", () => {
    const om = new OffsetMap(3, 50)
    om.resize(3)
    expect(om.count).toBe(3)
    expect(om.totalSize()).toBe(150)
  })

  it("totalSize stays consistent after multiple operations", () => {
    const om = new OffsetMap(3, 50)
    om.setSize(0, 80)
    om.setSize(2, 30)
    om.append(1)
    // sizes: 80, 50, 30, 50
    expect(om.totalSize()).toBe(210)
    expect(om.getOffset(3)).toBe(160)
  })

  it("getOffsets and getSizes return correct arrays", () => {
    const om = new OffsetMap(3, 40)
    expect(om.getSizes()).toEqual([40, 40, 40])
    expect(om.getOffsets()).toEqual([0, 40, 80])
  })
})
