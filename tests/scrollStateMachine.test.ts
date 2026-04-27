import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useScrollStateMachine } from "../src/hooks/useScrollStateMachine"

describe("useScrollStateMachine", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("starts idle", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    expect(result.current.getState()).toBe("idle")
    expect(result.current.isRestoring()).toBe(false)
  })

  it("transition changes state", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    act(() => result.current.transition("scrolling"))
    expect(result.current.getState()).toBe("scrolling")
  })

  it("beginRestore sets restoring state", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    act(() => result.current.beginRestore(200))
    expect(result.current.getState()).toBe("restoring")
    expect(result.current.isRestoring()).toBe(true)
  })

  it("auto-returns to idle after duration", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    act(() => result.current.beginRestore(100))
    expect(result.current.isRestoring()).toBe(true)
    act(() => vi.advanceTimersByTime(100))
    expect(result.current.getState()).toBe("idle")
    expect(result.current.isRestoring()).toBe(false)
  })

  it("endRestore returns to idle early", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    act(() => result.current.beginRestore(500))
    act(() => result.current.endRestore())
    expect(result.current.getState()).toBe("idle")
  })

  it("beginRestore resets timer on repeat call", () => {
    const { result } = renderHook(() => useScrollStateMachine())
    act(() => result.current.beginRestore(100))
    act(() => vi.advanceTimersByTime(80))
    act(() => result.current.beginRestore(100))
    act(() => vi.advanceTimersByTime(80))
    // Still restoring — timer was reset
    expect(result.current.isRestoring()).toBe(true)
    act(() => vi.advanceTimersByTime(20))
    expect(result.current.isRestoring()).toBe(false)
  })
})
