import { describe, expect, it } from "vitest"
import {
  buildReachedRootMargin,
  getThresholdPixels,
  parseReachedThreshold,
} from "../src/core/reachedThreshold"

describe("reachedThreshold utils", () => {
  it("parses numeric threshold as pixels for backward compatibility", () => {
    expect(parseReachedThreshold(240, 300)).toEqual({ unit: "px", value: 240 })
  })

  it("parses px and percent strings", () => {
    expect(parseReachedThreshold("120px", 300)).toEqual({ unit: "px", value: 120 })
    expect(parseReachedThreshold("35%", 300)).toEqual({ unit: "percent", value: 35 })
  })

  it("falls back to default px when format is invalid", () => {
    expect(parseReachedThreshold("invalid", 300)).toEqual({ unit: "px", value: 300 })
  })

  it("converts percent thresholds to pixels based on container height", () => {
    const parsed = parseReachedThreshold("25%", 300)
    expect(getThresholdPixels(parsed, 800)).toBe(200)
  })

  it("builds start and end rootMargin values", () => {
    expect(buildReachedRootMargin({ unit: "px", value: 180 }, "start"))
      .toBe("180px 0px 0px 0px")
    expect(buildReachedRootMargin({ unit: "percent", value: 20 }, "end"))
      .toBe("0px 0px 20% 0px")
  })
})
