import { describe, it, expect } from "vitest"
import { detectMutation } from "../src/core/diff"

describe("detectMutation", () => {
  it("initial — prev empty, next non-empty", () => {
    expect(detectMutation([], [1, 2, 3])).toEqual({ type: "initial" })
  })

  it("cleared — next empty", () => {
    expect(detectMutation([1, 2], [])).toEqual({ type: "cleared" })
  })

  it("cleared — both empty", () => {
    expect(detectMutation([], [])).toEqual({ type: "cleared" })
  })

  it("prepend — new items at start, suffix unchanged", () => {
    expect(detectMutation([3, 4, 5], [1, 2, 3, 4, 5])).toEqual({ type: "prepend", count: 2 })
  })

  it("prepend — single item", () => {
    expect(detectMutation([2, 3], [1, 2, 3])).toEqual({ type: "prepend", count: 1 })
  })

  it("append — new items at end, prefix unchanged", () => {
    expect(detectMutation([1, 2, 3], [1, 2, 3, 4, 5])).toEqual({ type: "append", count: 2 })
  })

  it("append — single item", () => {
    expect(detectMutation([1, 2], [1, 2, 3])).toEqual({ type: "append", count: 1 })
  })

  it("mixed — arbitrary reorder", () => {
    expect(detectMutation([1, 2, 3], [3, 2, 1])).toEqual({ type: "mixed" })
  })

  it("mixed — shrink", () => {
    expect(detectMutation([1, 2, 3], [1, 2])).toEqual({ type: "mixed" })
  })

  it("mixed — same length different keys", () => {
    expect(detectMutation([1, 2, 3], [1, 2, 4])).toEqual({ type: "mixed" })
  })
})
