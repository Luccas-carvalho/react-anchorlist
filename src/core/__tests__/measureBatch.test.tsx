import * as React from "react"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, act } from "@testing-library/react"
import { useMeasureBatch, type MeasureBatchController, type MeasureBatchItem } from "../measureBatch"

type Item = { id: string; text: string }

type ControllerSlot = { current: MeasureBatchController<Item> | null }

/**
 * jsdom returns 0 for getBoundingClientRect().height by default. We mock it
 * to return a deterministic height encoded into the data-key attribute so we
 * can assert the controller wires up the measurement path correctly.
 */
function mockBoundingRectByKey(heightForKey: (key: string) => number) {
  const original = HTMLElement.prototype.getBoundingClientRect
  HTMLElement.prototype.getBoundingClientRect = function () {
    const key = this.getAttribute?.("data-key")
    const height = key ? heightForKey(key) : 0
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height,
      toJSON() {
        return this
      },
    } as DOMRect
  }
  return () => {
    HTMLElement.prototype.getBoundingClientRect = original
  }
}

/**
 * Test harness: instantiates the hook and writes the controller into a slot
 * via a layout effect (writing during render is unsafe in StrictMode/concurrent).
 * Renders the hidden Renderer.
 */
function Harness({
  slot,
  itemContent = (_, item: Item) => <div>{item.text}</div>,
  containerWidth = 600,
}: {
  slot: ControllerSlot
  itemContent?: (index: number, data: Item) => React.ReactNode
  containerWidth?: number | string
}) {
  const controller = useMeasureBatch<Item>()
  // Write during render (cheap, idempotent — same controller object across
  // renders since useCallback memoizes its members) so tests can grab the
  // controller right after `render()` returns.
  slot.current = controller
  return (
    <div data-testid="harness-root">
      <controller.Renderer itemContent={itemContent} containerWidth={containerWidth} />
    </div>
  )
}

describe("useMeasureBatch", () => {
  let restoreRect: (() => void) | null = null

  beforeEach(() => {
    restoreRect = mockBoundingRectByKey((key) => {
      const m = /h(\d+)/.exec(key)
      return m ? Number(m[1]) : 50
    })
  })

  afterEach(() => {
    restoreRect?.()
    restoreRect = null
  })

  it("resolves immediately with empty Map when called with no items", async () => {
    const slot: ControllerSlot = { current: null }
    render(<Harness slot={slot} />)

    const result = await slot.current!.measure([])
    expect(result).toBeInstanceOf(Map)
    expect(result.size).toBe(0)
  })

  it("Renderer returns null when nothing is pending", () => {
    const slot: ControllerSlot = { current: null }
    const { getByTestId } = render(<Harness slot={slot} />)
    const root = getByTestId("harness-root") as HTMLDivElement
    expect(root.children.length).toBe(0)
  })

  it("resolves with N entries containing heights from getBoundingClientRect", async () => {
    const slot: ControllerSlot = { current: null }
    render(<Harness slot={slot} />)

    const items: MeasureBatchItem<Item>[] = [
      { key: "a-h25", index: 0, data: { id: "a", text: "A" } },
      { key: "b-h60", index: 1, data: { id: "b", text: "B" } },
      { key: "c-h120", index: 2, data: { id: "c", text: "C" } },
    ]

    let promise!: Promise<Map<string | number, number>>
    await act(async () => {
      promise = slot.current!.measure(items)
    })
    const result = await promise

    expect(result.size).toBe(3)
    expect(result.get("a-h25")).toBe(25)
    expect(result.get("b-h60")).toBe(60)
    expect(result.get("c-h120")).toBe(120)
  })

  it("unmounts the hidden container after resolving", async () => {
    const slot: ControllerSlot = { current: null }
    const { getByTestId } = render(<Harness slot={slot} />)

    let promise!: Promise<Map<string | number, number>>
    await act(async () => {
      promise = slot.current!.measure([
        { key: "x-h40", index: 0, data: { id: "x", text: "X" } },
      ])
    })
    await promise

    const root = getByTestId("harness-root") as HTMLDivElement
    expect(root.children.length).toBe(0)
  })

  it("applies HIDDEN_STYLE and the provided containerWidth to the hidden container", () => {
    // Disable rect mock so the layout effect resolves with height 0 — but
    // critically, we capture the hidden container's style during the brief
    // render before the effect unmounts it.
    restoreRect?.()
    restoreRect = null

    const slot: ControllerSlot = { current: null }
    let captured: HTMLDivElement | null = null

    function Capture() {
      const ctrl = useMeasureBatch<Item>()
      slot.current = ctrl
      return (
        <ctrl.Renderer
          itemContent={(_, item) => (
            <div
              ref={(node) => {
                if (node && !captured) {
                  // Renderer wraps each item in <div data-key>; the hidden
                  // container is the grandparent.
                  captured = node.parentElement?.parentElement as HTMLDivElement
                }
              }}
            >
              {item.text}
            </div>
          )}
          containerWidth={777}
        />
      )
    }

    render(<Capture />)

    act(() => {
      // Start a measure; the ref-callback fires during commit, before the
      // hook's useLayoutEffect tears it down, capturing the hidden container.
      slot.current!.measure([{ key: "snap", index: 0, data: { id: "snap", text: "S" } }])
    })

    expect(captured).toBeTruthy()
    const style = captured!.style
    expect(style.position).toBe("absolute")
    expect(style.visibility).toBe("hidden")
    expect(style.pointerEvents).toBe("none")
    expect(style.width).toBe("777px")
  })

  it("concurrent measure(): second call replaces the first; first never resolves", async () => {
    restoreRect?.()
    restoreRect = mockBoundingRectByKey(() => 33)

    const slot: ControllerSlot = { current: null }
    render(<Harness slot={slot} />)

    let firstResolved = false
    let p2!: Promise<Map<string | number, number>>

    await act(async () => {
      // Start first measure but don't await; its resolver gets stored.
      const p1 = slot.current!.measure([
        { key: "first", index: 0, data: { id: "first", text: "1" } },
      ])
      p1.then(() => {
        firstResolved = true
      })

      // Synchronously start a second measure: it overwrites resolverRef and
      // replaces pending. The first promise's resolver is dropped on the floor.
      p2 = slot.current!.measure([
        { key: "second", index: 0, data: { id: "second", text: "2" } },
      ])
    })
    const result = await p2

    expect(result.get("second")).toBe(33)
    expect(result.has("first")).toBe(false)
    // Give microtasks a chance — first should still be pending.
    await Promise.resolve()
    expect(firstResolved).toBe(false)
  })

  it("reset() during pending cleans up state and the Renderer becomes null", () => {
    const slot: ControllerSlot = { current: null }
    const { getByTestId } = render(<Harness slot={slot} />)

    let promise!: Promise<Map<string | number, number>>
    act(() => {
      promise = slot.current!.measure([
        { key: "k1", index: 0, data: { id: "k1", text: "1" } },
      ])
      // reset synchronously: overrides pending in the same batch.
      slot.current!.reset()
    })

    // Avoid unhandled rejection warnings from the dropped promise.
    promise.catch(() => {})

    const root = getByTestId("harness-root") as HTMLDivElement
    expect(root.children.length).toBe(0)
  })

  it("uses itemContent to render each item inside the hidden container", async () => {
    const slot: ControllerSlot = { current: null }
    const itemContent = vi.fn((_: number, data: Item) => <div>{data.text}</div>)
    render(<Harness slot={slot} itemContent={itemContent} />)

    let promise!: Promise<Map<string | number, number>>
    await act(async () => {
      promise = slot.current!.measure([
        { key: "1", index: 7, data: { id: "1", text: "Alpha" } },
        { key: "2", index: 8, data: { id: "2", text: "Beta" } },
      ])
    })
    await promise

    expect(itemContent).toHaveBeenCalledWith(7, { id: "1", text: "Alpha" })
    expect(itemContent).toHaveBeenCalledWith(8, { id: "2", text: "Beta" })
  })
})
