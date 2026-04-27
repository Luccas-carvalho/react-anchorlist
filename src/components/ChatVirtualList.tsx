import * as React from "react"
import { forwardRef, useImperativeHandle } from "react"
import { useChatVirtualizer } from "../hooks/useChatVirtualizer"
import { VirtualItemComponent } from "./VirtualItem"
import type { ChatVirtualListHandle, ChatVirtualListProps, VirtualItem } from "../types"

function ChatVirtualListInner<T>(
  props: ChatVirtualListProps<T>,
  ref: React.Ref<ChatVirtualListHandle>
) {
  const {
    data,
    itemContent,
    computeItemKey,
    estimatedItemSize = 80,
    overscan = 20,
    followOutput = "auto",
    atBottomThreshold = 200,
    atBottomHysteresis,
    initialAlignment = "bottom",
    scrollModifier,
    onStartReached,
    onEndReached,
    startReachedThreshold = 300,
    endReachedThreshold = 300,
    getItemEstimate,
    preMeasureMode = "lazy",
    scrollToMessageKey,
    onScrollToMessageComplete,
    onAtBottomChange,
    components = {},
    className,
    style,
  } = props

  const {
    scrollerRef,
    innerRef,
    startSentinelRef,
    endSentinelRef,
    virtualItems,
    totalSize,
    measureItem,
    scrollToIndex,
    scrollToBottom,
    scrollToKey,
    isAtBottom,
    prepareAnchor,
    prefetchMeasure,
    MeasureBatchRenderer,
  } = useChatVirtualizer({
    items: data,
    getKey: (item: T, index: number) => computeItemKey(index, item),
    estimatedItemSize,
    overscan,
    atBottomThreshold,
    atBottomHysteresis,
    followOutput,
    initialAlignment,
    scrollModifier,
    onStartReached,
    onEndReached,
    startReachedThreshold,
    endReachedThreshold,
    getItemEstimate,
    preMeasureMode,
    scrollToMessageKey,
    onScrollToMessageComplete,
  })

  // Notify parent of isAtBottom changes
  const prevIsAtBottomRef = React.useRef(isAtBottom)
  React.useEffect(() => {
    if (prevIsAtBottomRef.current !== isAtBottom) {
      prevIsAtBottomRef.current = isAtBottom
      onAtBottomChange?.(isAtBottom)
    }
  }, [isAtBottom, onAtBottomChange])

  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
      scrollToIndex,
      scrollToKey,
      getScrollTop: () => scrollerRef.current?.scrollTop ?? 0,
      isAtBottom: () => isAtBottom,
      prepareAnchor,
      prefetchMeasure: prefetchMeasure as ChatVirtualListHandle["prefetchMeasure"],
    }),
    [scrollToBottom, scrollToIndex, scrollToKey, scrollerRef, isAtBottom, prepareAnchor, prefetchMeasure]
  )

  const { Header, Footer, EmptyPlaceholder } = components

  if (data.length === 0 && EmptyPlaceholder) return <EmptyPlaceholder />

  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{
        overflow: "auto",
        height: "100%",
        position: "relative",
        // Prevent browser native scroll anchoring from fighting
        // the library prepend compensation logic.
        overflowAnchor: "none",
        overscrollBehaviorY: "contain",
        ...style,
      }}
    >
      <div
        ref={startSentinelRef}
        aria-hidden="true"
        style={{ position: "relative", width: "100%", height: 1, pointerEvents: "none" }}
      />

      {/* Header inside scroller so it scrolls with content */}
      {Header && <Header />}

      {/* Virtual container with total height */}
      <div ref={innerRef} style={{ height: totalSize, position: "relative", width: "100%" }}>
        {virtualItems.map((vItem) => (
          <VirtualItemComponent
            key={vItem.key}
            virtualItem={vItem as VirtualItem<unknown>}
            measureItem={measureItem}
          >
            {itemContent(vItem.index, vItem.data)}
          </VirtualItemComponent>
        ))}
      </div>

      {/* Footer inside scroller */}
      {Footer && <Footer />}

      <div
        ref={endSentinelRef}
        aria-hidden="true"
        style={{ position: "relative", width: "100%", height: 1, pointerEvents: "none" }}
      />

      <MeasureBatchRenderer itemContent={itemContent} containerWidth="100%" />
    </div>
  )
}

export const ChatVirtualList = forwardRef(ChatVirtualListInner) as <T>(
  props: ChatVirtualListProps<T> & { ref?: React.Ref<ChatVirtualListHandle> }
) => React.ReactElement
