import { describe, it, expect, vi } from "vitest"
import { SizeCache } from "../sizeCache"

describe("SizeCache", () => {
  describe("basic operations", () => {
    it("starts empty", () => {
      const c = new SizeCache()
      expect(c.size).toBe(0)
      expect(c.get("a")).toBeUndefined()
      expect(c.has("a")).toBe(false)
    })

    it("set and get a value", () => {
      const c = new SizeCache()
      c.set("a", 42)
      expect(c.get("a")).toBe(42)
      expect(c.has("a")).toBe(true)
      expect(c.size).toBe(1)
    })

    it("set overwrites existing value", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("a", 20)
      expect(c.get("a")).toBe(20)
      expect(c.size).toBe(1)
    })

    it("supports numeric keys", () => {
      const c = new SizeCache()
      c.set(1, 100)
      c.set(2, 200)
      expect(c.get(1)).toBe(100)
      expect(c.get(2)).toBe(200)
    })

    it("delete removes a key", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.delete("a")
      expect(c.has("a")).toBe(false)
      expect(c.size).toBe(0)
    })

    it("delete on a missing key is a no-op", () => {
      const c = new SizeCache()
      c.delete("missing")
      expect(c.size).toBe(0)
    })

    it("clear removes all entries", () => {
      const c = new SizeCache()
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      c.clear()
      expect(c.size).toBe(0)
      expect(c.has("a")).toBe(false)
    })
  })

  describe("LRU eviction", () => {
    it("evicts oldest entry when exceeding maxEntries", () => {
      const c = new SizeCache(3)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      c.set("d", 4) // evicts "a"
      expect(c.size).toBe(3)
      expect(c.has("a")).toBe(false)
      expect(c.has("b")).toBe(true)
      expect(c.has("c")).toBe(true)
      expect(c.has("d")).toBe(true)
    })

    it("re-setting an existing key promotes it to most recent", () => {
      const c = new SizeCache(3)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      c.set("a", 10) // promotes "a" to tail
      c.set("d", 4)  // should evict "b" (now oldest), not "a"
      expect(c.has("a")).toBe(true)
      expect(c.get("a")).toBe(10)
      expect(c.has("b")).toBe(false)
      expect(c.has("c")).toBe(true)
      expect(c.has("d")).toBe(true)
    })

    it("get does NOT promote — eviction order is by insertion", () => {
      const c = new SizeCache(3)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      c.get("a") // would promote in classic LRU, but we don't
      c.set("d", 4)
      expect(c.has("a")).toBe(false) // still evicted as oldest insertion
    })

    it("default maxEntries is 2000", () => {
      const c = new SizeCache()
      for (let i = 0; i < 2000; i++) c.set(i, i)
      expect(c.size).toBe(2000)
      c.set(2000, 2000)
      expect(c.size).toBe(2000)
      expect(c.has(0)).toBe(false)
      expect(c.has(2000)).toBe(true)
    })
  })

  describe("bulkSet", () => {
    it("inserts multiple entries preserving order", () => {
      const c = new SizeCache()
      c.bulkSet([["a", 1], ["b", 2], ["c", 3]])
      expect(c.size).toBe(3)
      expect(c.get("a")).toBe(1)
      expect(c.get("b")).toBe(2)
      expect(c.get("c")).toBe(3)
    })

    it("evicts oldest entries when bulk exceeds maxEntries", () => {
      const c = new SizeCache(3)
      c.bulkSet([["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5]])
      expect(c.size).toBe(3)
      expect(c.has("a")).toBe(false)
      expect(c.has("b")).toBe(false)
      expect(c.has("c")).toBe(true)
      expect(c.has("d")).toBe(true)
      expect(c.has("e")).toBe(true)
    })

    it("handles empty input", () => {
      const c = new SizeCache()
      c.bulkSet([])
      expect(c.size).toBe(0)
    })

    it("re-setting via bulk promotes existing keys", () => {
      const c = new SizeCache(3)
      c.set("a", 1)
      c.set("b", 2)
      c.set("c", 3)
      c.bulkSet([["a", 10], ["d", 4]]) // a promoted, then d added evicts b
      expect(c.has("a")).toBe(true)
      expect(c.get("a")).toBe(10)
      expect(c.has("b")).toBe(false)
      expect(c.has("c")).toBe(true)
      expect(c.has("d")).toBe(true)
    })
  })

  describe("getAverage", () => {
    it("returns null when empty", () => {
      const c = new SizeCache()
      expect(c.getAverage()).toBeNull()
    })

    it("returns the value itself for one entry", () => {
      const c = new SizeCache()
      c.set("a", 50)
      expect(c.getAverage()).toBe(50)
    })

    it("returns the arithmetic mean for multiple entries", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("b", 20)
      c.set("c", 30)
      expect(c.getAverage()).toBe(20)
    })

    it("returns null after clear", () => {
      const c = new SizeCache()
      c.set("a", 100)
      c.clear()
      expect(c.getAverage()).toBeNull()
    })
  })

  describe("getRecentAverage", () => {
    it("returns null when empty", () => {
      const c = new SizeCache()
      expect(c.getRecentAverage()).toBeNull()
      expect(c.getRecentAverage(10)).toBeNull()
    })

    it("returns mean of last `window` entries when window < size", () => {
      const c = new SizeCache()
      // Insert 10 items: sizes 1..10
      for (let i = 1; i <= 10; i++) c.set(i, i)
      // Last 3 = 8, 9, 10 → mean 9
      expect(c.getRecentAverage(3)).toBe(9)
    })

    it("returns global mean when window >= size", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("b", 20)
      c.set("c", 30)
      expect(c.getRecentAverage(3)).toBe(20)
      expect(c.getRecentAverage(100)).toBe(20)
    })

    it("returns mean of all entries when window equals size", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("b", 30)
      expect(c.getRecentAverage(2)).toBe(20)
    })

    it("default window is 50", () => {
      const c = new SizeCache()
      // Insert 60 items, sizes 1..60
      for (let i = 1; i <= 60; i++) c.set(i, i)
      // Last 50 = 11..60 → sum = (11+60)*50/2 = 1775 → mean = 35.5
      expect(c.getRecentAverage()).toBeCloseTo(35.5)
    })

    it("set re-inserts existing key at tail (slides the window)", () => {
      const c = new SizeCache()
      c.set("a", 100)
      c.set("b", 1)
      c.set("c", 1)
      // Last 2 = b, c → mean 1
      expect(c.getRecentAverage(2)).toBe(1)
      // Touch "a": now order is b, c, a → last 2 = c, a → mean (1+100)/2 = 50.5
      c.set("a", 100)
      expect(c.getRecentAverage(2)).toBe(50.5)
    })

    it("get does NOT slide the window", () => {
      const c = new SizeCache()
      c.set("a", 100)
      c.set("b", 1)
      c.set("c", 1)
      c.get("a") // should not move "a" to tail
      // Last 2 still = b, c → mean 1
      expect(c.getRecentAverage(2)).toBe(1)
    })
  })

  describe("applyToOffsetIndex", () => {
    it("calls setSize for each key present in keyToIndex", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("b", 20)
      c.set("c", 30)
      const setSize = vi.fn().mockReturnValue(true)
      const offsetIndex = { setSize }
      const keyToIndex = new Map<string | number, number>([
        ["a", 0],
        ["b", 1],
        ["c", 2],
      ])
      c.applyToOffsetIndex(offsetIndex, keyToIndex)
      expect(setSize).toHaveBeenCalledTimes(3)
      expect(setSize).toHaveBeenCalledWith(0, 10)
      expect(setSize).toHaveBeenCalledWith(1, 20)
      expect(setSize).toHaveBeenCalledWith(2, 30)
    })

    it("skips keys missing from keyToIndex", () => {
      const c = new SizeCache()
      c.set("a", 10)
      c.set("b", 20) // not in map
      c.set("c", 30)
      const setSize = vi.fn().mockReturnValue(true)
      const offsetIndex = { setSize }
      const keyToIndex = new Map<string | number, number>([
        ["a", 0],
        ["c", 2],
      ])
      c.applyToOffsetIndex(offsetIndex, keyToIndex)
      expect(setSize).toHaveBeenCalledTimes(2)
      expect(setSize).toHaveBeenCalledWith(0, 10)
      expect(setSize).toHaveBeenCalledWith(2, 30)
    })

    it("does nothing on empty cache", () => {
      const c = new SizeCache()
      const setSize = vi.fn().mockReturnValue(true)
      const offsetIndex = { setSize }
      c.applyToOffsetIndex(offsetIndex, new Map())
      expect(setSize).not.toHaveBeenCalled()
    })

    it("works with numeric keys", () => {
      const c = new SizeCache()
      c.set(1, 100)
      c.set(2, 200)
      const setSize = vi.fn().mockReturnValue(true)
      const offsetIndex = { setSize }
      const keyToIndex = new Map<string | number, number>([
        [1, 5],
        [2, 6],
      ])
      c.applyToOffsetIndex(offsetIndex, keyToIndex)
      expect(setSize).toHaveBeenCalledWith(5, 100)
      expect(setSize).toHaveBeenCalledWith(6, 200)
    })
  })
})
