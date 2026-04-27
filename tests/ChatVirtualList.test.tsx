import * as React from "react"
import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ChatVirtualList } from "../src/components/ChatVirtualList"
import type { ChatVirtualListHandle } from "../src/types"

// Mock ResizeObserver — not available in jsdom
beforeEach(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
})

type Item = { id: string; text: string }

const makeItems = (n: number): Item[] =>
  Array.from({ length: n }, (_, i) => ({ id: `msg-${i}`, text: `Message ${i}` }))

describe("ChatVirtualList", () => {
  it("renders without errors with empty data", () => {
    const { container } = render(
      <ChatVirtualList
        data={[]}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    expect(container).toBeTruthy()
  })

  it("renders EmptyPlaceholder when data is empty and component provided", () => {
    render(
      <ChatVirtualList
        data={[]}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        components={{ EmptyPlaceholder: () => <div>No messages</div> }}
      />
    )
    expect(screen.getByText("No messages")).toBeTruthy()
  })

  it("does not show EmptyPlaceholder when data has items", () => {
    render(
      <ChatVirtualList
        data={makeItems(3)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        components={{ EmptyPlaceholder: () => <div>No messages</div> }}
      />
    )
    expect(screen.queryByText("No messages")).toBeNull()
  })

  it("renders Header when provided", () => {
    render(
      <ChatVirtualList
        data={makeItems(3)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        components={{ Header: () => <div data-testid="header">Header</div> }}
      />
    )
    expect(screen.getByTestId("header")).toBeTruthy()
  })

  it("renders Footer when provided", () => {
    render(
      <ChatVirtualList
        data={makeItems(3)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        components={{ Footer: () => <div data-testid="footer">Footer</div> }}
      />
    )
    expect(screen.getByTestId("footer")).toBeTruthy()
  })

  it("exposes ref handle methods", () => {
    const ref = React.createRef<ChatVirtualListHandle>()
    render(
      <ChatVirtualList
        ref={ref}
        data={makeItems(5)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    expect(typeof ref.current?.scrollToBottom).toBe("function")
    expect(typeof ref.current?.scrollToIndex).toBe("function")
    expect(typeof ref.current?.scrollToKey).toBe("function")
    expect(typeof ref.current?.getScrollTop).toBe("function")
    expect(typeof ref.current?.isAtBottom).toBe("function")
    expect(typeof ref.current?.prepareAnchor).toBe("function")
  })

  it("isAtBottom returns a boolean", () => {
    const ref = React.createRef<ChatVirtualListHandle>()
    render(
      <ChatVirtualList
        ref={ref}
        data={makeItems(3)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    expect(typeof ref.current?.isAtBottom()).toBe("boolean")
  })

  it("getScrollTop returns a number", () => {
    const ref = React.createRef<ChatVirtualListHandle>()
    render(
      <ChatVirtualList
        ref={ref}
        data={makeItems(3)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    expect(typeof ref.current?.getScrollTop()).toBe("number")
  })

  it("accepts scrollModifier and atBottomHysteresis props", () => {
    const { container } = render(
      <ChatVirtualList
        data={makeItems(4)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        atBottomHysteresis={{ enter: 80, leave: 160 }}
        scrollModifier={{ id: "append-1", type: "append", behavior: "auto" }}
      />
    )
    expect(container).toBeTruthy()
  })

  it("disables native overflow anchoring on scroller", () => {
    const { container } = render(
      <ChatVirtualList
        data={makeItems(4)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    const scroller = container.firstElementChild as HTMLDivElement | null
    expect(scroller).toBeTruthy()
    expect(scroller?.style.overflowAnchor).toBe("none")
  })

  it("mounts without errors with preMeasureMode='aggressive'", () => {
    const { container } = render(
      <ChatVirtualList
        data={makeItems(50)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        preMeasureMode="aggressive"
      />
    )
    expect(container).toBeTruthy()
  })

  it("renders identically with preMeasureMode='lazy' (default)", () => {
    const { container: lazy } = render(
      <ChatVirtualList
        data={makeItems(5)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        preMeasureMode="lazy"
      />
    )
    const { container: defaultMode } = render(
      <ChatVirtualList
        data={makeItems(5)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
      />
    )
    expect(lazy.innerHTML).toBe(defaultMode.innerHTML)
  })

  it("fires onStartReached for short conversations initialized at bottom", async () => {
    const onStartReached = vi.fn()
    const { container } = render(
      <ChatVirtualList
        data={makeItems(1)}
        computeItemKey={(_, item: Item) => item.id}
        itemContent={(_, item: Item) => <div>{item.text}</div>}
        initialAlignment="bottom"
        startReachedThreshold={300}
        onStartReached={onStartReached}
      />
    )

    const scroller = container.querySelector(".scroll, div") as HTMLDivElement
    Object.defineProperty(scroller, "scrollTop", { value: 0, writable: true })
    Object.defineProperty(scroller, "clientHeight", { value: 500, writable: true })
    Object.defineProperty(scroller, "scrollHeight", { value: 100, writable: true })
    scroller.dispatchEvent(new Event("scroll"))

    await waitFor(() => {
      expect(onStartReached).toHaveBeenCalled()
    })
  })
})
