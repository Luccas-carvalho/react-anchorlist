import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createDeviationController } from "../deviation"

const FRAME = 16 // sinon/vitest fake-timers schedules RAF at 16ms intervals

function makeEls() {
  const scroller = document.createElement("div")
  const inner = document.createElement("div")
  scroller.appendChild(inner)
  document.body.appendChild(scroller)
  // jsdom doesn't implement scrollBy; spy with a writable stub.
  scroller.scrollBy = vi.fn() as unknown as typeof scroller.scrollBy
  return { scroller, inner }
}

/** Advance one animation frame's worth of time so any pending RAF fires. */
function nextFrame() {
  vi.advanceTimersByTime(FRAME)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"] })
})

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ""
})

describe("createDeviationController", () => {
  it("attaches without crashing and exposes current = 0", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    expect(() => ctrl.attach(inner, scroller)).not.toThrow()
    expect(ctrl.current).toBe(0)
    ctrl.detach()
  })

  it("schedule(0) is a no-op", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(0)
    vi.runAllTimers()

    expect(inner.style.transform).toBe("")
    expect(scroller.scrollBy).not.toHaveBeenCalled()
    expect(ctrl.current).toBe(0)
  })

  it("schedule(N) applies transform first, then scrollBy on next RAF, then resets", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(50)
    // Before any RAF: nothing applied yet — schedule() defers everything to
    // the next frame so we can coalesce multiple synchronous calls.
    expect(inner.style.transform).toBe("")
    expect(scroller.scrollBy).not.toHaveBeenCalled()

    // First RAF: transform applied, scrollBy NOT called yet.
    nextFrame()
    expect(inner.style.transform).toBe("translateY(-50px)")
    expect(scroller.scrollBy).not.toHaveBeenCalled()
    expect(ctrl.current).toBe(50)

    // Second RAF: scrollBy fires and transform collapses back to 0.
    nextFrame()
    expect(scroller.scrollBy).toHaveBeenCalledTimes(1)
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 50 })
    expect(ctrl.current).toBe(0)

    // Third RAF: defensive cleanup leaves transform empty.
    nextFrame()
    expect(inner.style.transform).toBe("")
  })

  it("multiple schedule() calls before next RAF accumulate into one scrollBy", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(20)
    ctrl.schedule(30)
    ctrl.schedule(10)

    nextFrame()
    expect(inner.style.transform).toBe("translateY(-60px)")
    expect(ctrl.current).toBe(60)

    nextFrame()
    expect(scroller.scrollBy).toHaveBeenCalledTimes(1)
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 60 })
    expect(ctrl.current).toBe(0)
  })

  it("supports negative amounts (items above shrank)", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(-25)
    nextFrame()
    expect(inner.style.transform).toBe("translateY(25px)")
    expect(ctrl.current).toBe(-25)

    nextFrame()
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: -25 })
    expect(ctrl.current).toBe(0)
  })

  it("detach cancels pending RAFs and resets state", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(40)
    ctrl.detach()

    // Run all timers — nothing scheduled before detach should now fire.
    vi.runAllTimers()
    expect(scroller.scrollBy).not.toHaveBeenCalled()
    expect(inner.style.transform).toBe("")
    expect(ctrl.current).toBe(0)
  })

  it("detach mid-cycle (after first RAF, before second) cancels remaining RAFs", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(40)
    nextFrame() // first RAF — transform applied
    expect(inner.style.transform).toBe("translateY(-40px)")

    ctrl.detach()
    vi.runAllTimers()

    // No scrollBy because the RAF that would issue it was cancelled, and the
    // inner was cleaned up by detach().
    expect(scroller.scrollBy).not.toHaveBeenCalled()
    expect(inner.style.transform).toBe("")
    expect(ctrl.current).toBe(0)
  })

  it("flushSync applies pending deviation immediately, no RAF needed", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    ctrl.schedule(75)
    expect(scroller.scrollBy).not.toHaveBeenCalled()

    ctrl.flushSync()

    expect(scroller.scrollBy).toHaveBeenCalledTimes(1)
    expect(scroller.scrollBy).toHaveBeenCalledWith({ top: 75 })
    // Net deviation is 0 after flushSync — visual shift was applied and
    // immediately undone by the scrollBy in the same synchronous call.
    expect(ctrl.current).toBe(0)
  })

  it("flushSync without pending amount is a safe no-op", () => {
    const { scroller, inner } = makeEls()
    const ctrl = createDeviationController()
    ctrl.attach(inner, scroller)

    expect(() => ctrl.flushSync()).not.toThrow()
    expect(scroller.scrollBy).not.toHaveBeenCalled()
  })

  it("schedule before attach is ignored (no crash)", () => {
    const ctrl = createDeviationController()
    expect(() => ctrl.schedule(50)).not.toThrow()
    vi.runAllTimers()
    expect(ctrl.current).toBe(0)
  })

  it("re-attaching detaches the previous nodes first", () => {
    const { scroller: s1, inner: i1 } = makeEls()
    const { scroller: s2, inner: i2 } = makeEls()
    const ctrl = createDeviationController()

    ctrl.attach(i1, s1)
    ctrl.schedule(20)
    // Re-attach before the RAF resolves.
    ctrl.attach(i2, s2)

    vi.runAllTimers()

    // The first scroller should never have received scrollBy because the
    // pending RAF was cancelled by detach() inside re-attach.
    expect(s1.scrollBy).not.toHaveBeenCalled()
    expect(s2.scrollBy).not.toHaveBeenCalled()
    expect(i1.style.transform).toBe("")
  })
})
