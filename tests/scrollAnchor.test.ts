import { describe, expect, it, vi } from "vitest"
import type { AnchorSnapshot } from "../src/types"
import { resolveAnchorTargetFromSnapshot } from "../src/hooks/useScrollAnchor"

describe("resolveAnchorTargetFromSnapshot", () => {
  it("uses candidate keys when primary key cannot be resolved", () => {
    const snapshot: AnchorSnapshot = {
      key: "unstable",
      offsetWithinItem: 8,
      scrollTop: 1000,
      scrollHeight: 5000,
      candidates: [
        { key: "unstable", offsetWithinItem: 8 },
        { key: "stable", offsetWithinItem: -16 },
      ],
    }

    const resolveAnchorTop = vi.fn((key: string | number) => {
      if (key === "stable") return 1640
      return null
    })

    const target = resolveAnchorTargetFromSnapshot({
      snapshot,
      currentScrollHeight: 6200,
      resolveAnchorTop,
    })

    expect(target).toBe(1640)
    expect(resolveAnchorTop).toHaveBeenCalledWith("unstable", 8)
    expect(resolveAnchorTop).toHaveBeenCalledWith("stable", -16)
  })

  it("falls back to scrollHeight delta when no logical key is resolvable", () => {
    const snapshot: AnchorSnapshot = {
      key: "missing",
      offsetWithinItem: 0,
      scrollTop: 1200,
      scrollHeight: 4000,
      candidates: [{ key: "also-missing", offsetWithinItem: 10 }],
    }

    const resolveAnchorTop = vi.fn(() => null)
    const target = resolveAnchorTargetFromSnapshot({
      snapshot,
      currentScrollHeight: 4300,
      resolveAnchorTop,
    })

    expect(target).toBe(1500)
  })
})

