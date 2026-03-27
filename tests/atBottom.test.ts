import { describe, expect, it } from "vitest"
import { resolveAtBottomState } from "../src/hooks/useAtBottom"

describe("resolveAtBottomState", () => {
  it("uses threshold mode when hysteresis is not provided", () => {
    expect(resolveAtBottomState({ previous: true, distanceFromBottom: 100, threshold: 120 }))
      .toBe(true)
    expect(resolveAtBottomState({ previous: true, distanceFromBottom: 130, threshold: 120 }))
      .toBe(false)
  })

  it("uses hysteresis enter/leave thresholds when provided", () => {
    // stays true until it crosses 'leave'
    expect(resolveAtBottomState({
      previous: true,
      distanceFromBottom: 150,
      threshold: 200,
      hysteresis: { enter: 80, leave: 160 },
    })).toBe(true)

    expect(resolveAtBottomState({
      previous: true,
      distanceFromBottom: 161,
      threshold: 200,
      hysteresis: { enter: 80, leave: 160 },
    })).toBe(false)

    // once false, only becomes true again when <= 'enter'
    expect(resolveAtBottomState({
      previous: false,
      distanceFromBottom: 100,
      threshold: 200,
      hysteresis: { enter: 80, leave: 160 },
    })).toBe(false)

    expect(resolveAtBottomState({
      previous: false,
      distanceFromBottom: 80,
      threshold: 200,
      hysteresis: { enter: 80, leave: 160 },
    })).toBe(true)
  })
})
