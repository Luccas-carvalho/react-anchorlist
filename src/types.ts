import type * as React from "react"
import type { ScrollStateMachine } from "./hooks/useScrollStateMachine"

export interface VirtualItem<T = unknown> {
  key: string | number
  index: number
  /** Y position (top) in pixels */
  start: number
  /** Current height — estimated until measured */
  size: number
  data: T
}

export interface ScrollToIndexOpts {
  align?: "start" | "center" | "end"
  behavior?: ScrollBehavior
  /** Additional pixel offset after alignment */
  offset?: number
}

export interface AtBottomHysteresis {
  /**
   * Distance (px) required to ENTER bottom state.
   * Smaller value = stricter re-entry.
   */
  enter: number
  /**
   * Distance (px) allowed to remain in bottom state.
   * Must be >= enter.
   */
  leave: number
}

export type ChatScrollModifier =
  | { id: string | number; type: "prepend" }
  | {
    id: string | number
    type: "append"
    behavior?: "auto" | "smooth"
    ifAtBottomOnly?: boolean
  }
  | { id: string | number; type: "items-change" }
  | {
    id: string | number
    type: "jump-to-key"
    key: string | number
    align?: "start" | "center" | "end"
    behavior?: ScrollBehavior
  }

export interface AnchorSnapshot {
  key: string | number | null
  offsetWithinItem: number
  /**
   * Additional visible-item candidates captured in viewport order.
   * Used when the primary key is no longer resolvable after list mutation.
   */
  candidates?: Array<{
    key: string | number
    offsetWithinItem: number
  }>
  scrollTop: number
  scrollHeight: number
}

export interface VirtualListComponents<T = unknown> {
  Header?: React.ComponentType
  Footer?: React.ComponentType
  EmptyPlaceholder?: React.ComponentType
  ScrollSeekPlaceholder?: React.ComponentType<{ index: number; data: T }>
}

export interface PaginationResult<T> {
  data: T[]
  hasNextPage: boolean
  hasPrevPage: boolean
  currentPage: number
  totalPages?: number
}

export interface UsePaginationOptions<T> {
  fetcher: (page: number) => Promise<PaginationResult<T>>
  initialPage?: number
  pageSize?: number
  direction?: "append" | "prepend" | "bidirectional"
  getKey?: (item: T) => string | number
  onPageLoaded?: (page: number, items: T[]) => void
  onError?: (error: Error) => void
}

export interface UsePaginationReturn<T> {
  items: T[]
  loadNextPage: () => Promise<void>
  loadPrevPage: () => Promise<void>
  hasNextPage: boolean
  hasPrevPage: boolean
  loading: boolean
  loadingMore: boolean
  refresh: () => Promise<void>
  reset: () => void
  currentPage: number
}

export interface ChatVirtualListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void
  scrollToIndex: (index: number, opts?: ScrollToIndexOpts) => void
  scrollToKey: (key: string | number, opts?: ScrollToIndexOpts) => void
  getScrollTop: () => number
  isAtBottom: () => boolean
  /** @deprecated Use `scrollModifier={{ id, type: "prepend" }}` */
  prepareAnchor: () => void
}

export interface ChatVirtualListProps<T> {
  data: T[]
  itemContent: (index: number, item: T) => React.ReactNode
  computeItemKey: (index: number, item: T) => string | number
  estimatedItemSize?: number
  overscan?: number
  followOutput?: "auto" | "smooth" | false
  atBottomThreshold?: number
  atBottomHysteresis?: AtBottomHysteresis
  initialAlignment?: "top" | "bottom"
  scrollModifier?: ChatScrollModifier | null
  onStartReached?: () => void | Promise<void>
  onEndReached?: () => void | Promise<void>
  startReachedThreshold?: number
  endReachedThreshold?: number
  /** @deprecated Prefer `scrollModifier={{ id, type: "jump-to-key", key }}` */
  scrollToMessageKey?: string | number | null
  /** @deprecated Prefer command id tracking on `scrollModifier` */
  onScrollToMessageComplete?: () => void
  onAtBottomChange?: (isAtBottom: boolean) => void
  components?: VirtualListComponents<T>
  className?: string
  style?: React.CSSProperties
  context?: unknown
}

export interface VirtualListProps<T> {
  data: T[]
  itemContent: (index: number, item: T) => React.ReactNode
  computeItemKey: (index: number, item: T) => string | number
  estimatedItemSize?: number
  overscan?: number
  onEndReached?: () => void | Promise<void>
  endReachedThreshold?: number
  components?: VirtualListComponents<T>
  className?: string
  style?: React.CSSProperties
}

export interface UseVirtualEngineReturn<T> {
  scrollerRef: React.RefObject<HTMLDivElement>
  innerRef: React.RefObject<HTMLDivElement>
  virtualItems: VirtualItem<T>[]
  totalSize: number
  measureItem: (key: string | number, size: number) => void
  scrollToIndex: (index: number, opts?: ScrollToIndexOpts) => void
  scrollToOffset: (offset: number, behavior?: ScrollBehavior) => void
  captureAnchorSnapshot: () => AnchorSnapshot | null
  resolveAnchorTop: (key: string | number, offsetWithinItem: number) => number | null
  isAtTop: boolean
  isAtBottom: boolean
  scrollTop: number
  stateMachine: ScrollStateMachine
}

export interface RenderRange {
  start: number
  end: number
}

export interface UseChatVirtualizerReturn<T> {
  scrollerRef: React.RefObject<HTMLDivElement>
  innerRef: React.RefObject<HTMLDivElement>
  virtualItems: VirtualItem<T>[]
  totalSize: number
  measureItem: (key: string | number, size: number) => void
  scrollToIndex: (index: number, opts?: ScrollToIndexOpts) => void
  scrollToBottom: (behavior?: ScrollBehavior) => void
  scrollToKey: (key: string | number, opts?: ScrollToIndexOpts) => void
  isAtBottom: boolean
  /** @deprecated Use `scrollModifier={{ id, type: "prepend" }}` */
  prepareAnchor: () => void
}
