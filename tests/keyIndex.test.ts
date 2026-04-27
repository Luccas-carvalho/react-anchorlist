import { describe, it, expect } from "vitest"
import { KeyIndex } from "../src/core/keyIndex"

describe("KeyIndex", () => {
  it("starts empty", () => {
    const ki = new KeyIndex()
    expect(ki.count).toBe(0)
    expect(ki.getIndex("a")).toBeUndefined()
    expect(ki.getKey(0)).toBeUndefined()
  })

  it("rebuild populates both directions", () => {
    const ki = new KeyIndex()
    ki.rebuild(["a", "b", "c"])
    expect(ki.count).toBe(3)
    expect(ki.getIndex("a")).toBe(0)
    expect(ki.getIndex("b")).toBe(1)
    expect(ki.getIndex("c")).toBe(2)
    expect(ki.getKey(0)).toBe("a")
    expect(ki.getKey(2)).toBe("c")
  })

  it("has() returns correct boolean", () => {
    const ki = new KeyIndex()
    ki.rebuild([1, 2, 3])
    expect(ki.has(1)).toBe(true)
    expect(ki.has(9)).toBe(false)
  })

  it("rebuild replaces previous state", () => {
    const ki = new KeyIndex()
    ki.rebuild(["x", "y"])
    ki.rebuild(["a", "b", "c"])
    expect(ki.count).toBe(3)
    expect(ki.has("x")).toBe(false)
    expect(ki.has("a")).toBe(true)
  })

  it("getKeys returns current key array", () => {
    const ki = new KeyIndex()
    ki.rebuild([10, 20, 30])
    expect(ki.getKeys()).toEqual([10, 20, 30])
  })
})
