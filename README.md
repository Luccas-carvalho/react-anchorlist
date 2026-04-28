# react-anchorlist

**Pixel-perfect virtualized lists for React.** Built for chat, feeds, and any scroll-anchored UI.

Zero flicker on prepend. Zero hacks. Tested with thousands of items, mixed media types, and high-frequency real-time updates.

```bash
npm install react-anchorlist
```

---

## Why use it

- **Pixel-perfect anchor restore on prepend** — measure-then-commit pattern + force-render-on-prepend + deviation system means the viewport never moves a pixel when older items load above
- Virtualizes large lists (renders only what's visible + overscan)
- Top/bottom pagination callbacks with sentinels (`IntersectionObserver` based, with scroll-math fallback)
- Chat-focused behavior: `followOutput`, declarative `scrollModifier` commands, hysteresis on bottom detection
- Dynamic row heights via `ResizeObserver` + per-type estimate hints
- Imperative `prefetchMeasure` API for the strictest pixel-perfect cases
- TypeScript-first, zero runtime dependencies, tree-shakeable
- React 18 + React 19 compatible

---

## 60-second setup

### Chat list (recommended pattern)

```tsx
import { useState } from "react"
import { ChatVirtualList } from "react-anchorlist"
import type { ChatScrollModifier } from "react-anchorlist"

const [scrollModifier, setScrollModifier] = useState<ChatScrollModifier | null>(null)

<ChatVirtualList
  data={messages}
  computeItemKey={(_, item) => item._id}
  itemContent={(_, item) => <Message data={item} />}
  scrollModifier={scrollModifier}
  followOutput="auto"
  onStartReached={async () => {
    // Just prepend older messages to your state — anchor is captured automatically.
    await loadOlderMessages()
  }}
  onAtBottomChange={setIsAtBottom}
  // Recommended for production:
  preMeasureMode="aggressive"
  getItemEstimate={(item) => ESTIMATES_BY_TYPE[item.type] ?? 80}
  startReachedThreshold={1500}
  style={{ height: "100%" }}
/>
```

### Generic list (non-chat)

```tsx
import { VirtualList } from "react-anchorlist"

<VirtualList
  data={tickets}
  computeItemKey={(_, item) => item.id}
  itemContent={(_, item) => <TicketRow ticket={item} />}
  onEndReached={loadMore}
  style={{ height: "100%" }}
/>
```

---

## How pixel-perfect works (brief)

When older items prepend, three mechanisms work together:

1. **Force-render-on-prepend** — newly prepended items are temporarily included in the render window so their actual heights are measured before the anchor restore runs. They unmount on the next frame, leaving real sizes in the cache.

2. **Aggressive pre-measure (`preMeasureMode="aggressive"`)** — items already in the data array but not in the visible window are measured in idle frames via a hidden DOM container. Heights are populated before the user scrolls past them.

3. **DeviationController** — when measurements arrive late (image decode, font load), the lib applies an instant CSS transform compensation, then reconciles via `scrollBy` on the next animation frame. No visible jump.

Combine with `prefetchMeasure` (below) for the measure-then-commit pattern when you want absolutely zero flicker even under heavy estimate variance.

---

## Pixel-perfect on demand: `prefetchMeasure` (imperative)

For chat apps that fetch the next page reactively, the cleanest pattern is **fetch → measure hidden → commit**:

```tsx
const handleLoadMore = async () => {
  // 1. Fetch next page (don't commit to state yet)
  const olderMessages = await api.fetchOlderPage(ticketId)

  // 2. Pre-measure in hidden container — sizes go into the lib's cache
  await listRef.current?.prefetchMeasure(
    olderMessages.map((m, i) => ({ key: m._id, data: m, index: i }))
  )

  // 3. Now commit to state. Sizes are already cached → anchor restore is exact.
  prependMessages(olderMessages)
}
```

The visible scroll height does not grow during step 2 (items mount in a hidden container). Step 3 is instant because measurements are already done. Result: zero pixel of jump, regardless of item content variance.

Trade-off: ~10–30 ms added between network arrival and visible commit (imperceptible compared to fetch latency).

---

## Core concept: `scrollModifier`

Declarative scroll commands. Set the modifier; the lib reacts:

```ts
type ChatScrollModifier =
  | { id: string | number; type: "prepend" }
  | { id: string | number; type: "append"; behavior?: "auto" | "smooth"; ifAtBottomOnly?: boolean }
  | { id: string | number; type: "items-change" }
  | { id: string | number; type: "jump-to-key"; key: string | number; align?: "start" | "center" | "end"; behavior?: ScrollBehavior }
```

- `id` must be unique per command (used to dedupe).
- `prepend` keeps viewport position stable while older items are added on top.
- `append` auto-scrolls to bottom (with optional `ifAtBottomOnly` guard).
- `items-change` keeps user at bottom if they were already at bottom.
- `jump-to-key` scrolls to a specific item.

For most chat use cases you don't need `scrollModifier` at all — just use `onStartReached` (anchor captured automatically) and `followOutput`.

---

## API reference

### Exports

```ts
import {
  ChatVirtualList,
  VirtualList,
  useChatVirtualizer,
  usePagination,
} from "react-anchorlist"

import type {
  ChatVirtualListProps,
  ChatVirtualListHandle,
  ChatScrollModifier,
  VirtualListProps,
  ReachedThreshold,
  AtBottomHysteresis,
} from "react-anchorlist"
```

### `ChatVirtualList` props

| Prop | Type | Default | Notes |
|---|---|---|---|
| `data` | `T[]` | required | Item array. Use stable references. |
| `itemContent` | `(index, item) => ReactNode` | required | Renderer per item. Keep lightweight. |
| `computeItemKey` | `(index, item) => string \| number` | required | Stable unique key per item. |
| `estimatedItemSize` | `number` | `80` | Fallback height in px. |
| `getItemEstimate` | `(item, index) => number` | — | Per-item height hint. Set this when items vary significantly (text vs image vs video). Reduces flicker before measurement runs. |
| `preMeasureMode` | `"lazy" \| "aggressive"` | `"lazy"` | `"aggressive"` measures unmeasured items in idle frames via hidden container. Recommended for production chat. |
| `overscan` | `number` | `20` | Items rendered above/below viewport. |
| `followOutput` | `"auto" \| "smooth" \| false` | `"auto"` | Auto-scroll on new items at bottom. |
| `initialAlignment` | `"top" \| "bottom"` | `"top"` | Where to start. Use `"bottom"` for chat. |
| `scrollModifier` | `ChatScrollModifier \| null` | `null` | Imperative scroll commands. |
| `onStartReached` | `() => void \| Promise<void>` | — | Fires when user nears top. Anchor captured automatically before callback runs. |
| `onEndReached` | `() => void \| Promise<void>` | — | Fires when user nears bottom. |
| `startReachedThreshold` | `number \| string` | `300` | Distance from top to trigger. Accepts `number` (px), `"30%"`, `"120px"`. **Tip**: set higher (e.g. `1500`) so prefetch has time to complete before user reaches top. |
| `endReachedThreshold` | `number \| string` | `300` | Distance from bottom. |
| `atBottomThreshold` | `number` | `200` | Px from bottom to be considered "at bottom". |
| `atBottomHysteresis` | `{enter, leave}` | `{80, 160}` | Prevents flicker when isAtBottom toggles. |
| `onAtBottomChange` | `(isAtBottom) => void` | — | Fires on transition. |
| `components` | `{Header, Footer, EmptyPlaceholder}` | — | Optional render slots. |
| `className`, `style`, `context` | — | — | Pass-throughs. |

### `VirtualList` props (non-chat)

`data`, `itemContent`, `computeItemKey`, `estimatedItemSize` (default `60`), `overscan` (default `20`), `onEndReached`, `endReachedThreshold` (default `300`), `components`, `className`, `style`.

### `ChatVirtualList` ref handle

```tsx
listRef.current?.scrollToBottom("auto")
listRef.current?.scrollToIndex(42, { align: "center", behavior: "smooth" })
listRef.current?.scrollToKey("msg-123", { align: "center" })
listRef.current?.getScrollTop()
listRef.current?.isAtBottom()

// Imperative pre-measure (measure-then-commit pattern):
await listRef.current?.prefetchMeasure(
  items.map((m, i) => ({ key: m._id, data: m, index: i }))
)
```

---

## Production recipe

For a chat-like app with mixed media and pagination, this is the optimal config:

```tsx
<ChatVirtualList
  data={messages}
  computeItemKey={(_, m) => m._id}
  itemContent={(_, m) => <Message data={m} />}
  initialAlignment="bottom"
  overscan={30}
  estimatedItemSize={80}
  preMeasureMode="aggressive"
  getItemEstimate={(item) => {
    // Per-content-type hints. Tune based on your app.
    switch (item.message?.type) {
      case "image": return 280
      case "video": return 260
      case "audio": return 90
      case "sticker": return 160
      case "file": return 100
      default: return 70 // text
    }
  }}
  startReachedThreshold={1500}    // fires earlier; prefetch has time
  endReachedThreshold={300}
  followOutput="auto"
  onStartReached={loadOlderMessages}
  onAtBottomChange={setIsAtBottom}
  style={{ height: "100%" }}
/>
```

For absolute zero flicker (matters when you can't tune estimates well), wrap your fetch in the measure-then-commit pattern:

```tsx
onStartReached={async () => {
  const olderMessages = await api.fetchOlderPage()
  await listRef.current?.prefetchMeasure(
    olderMessages.map((m, i) => ({ key: m._id, data: m, index: i }))
  )
  // commit to state after measure → pixel-perfect on visible commit
  prependMessages(olderMessages)
}}
```

---

## `usePagination` helper (optional)

```tsx
import { useEffect } from "react"
import { usePagination, ChatVirtualList } from "react-anchorlist"

const { items, hasPrevPage, loadPrevPage, loadingMore, refresh } = usePagination({
  fetcher: async (page) => {
    const res = await api.get(`/messages?page=${page}&per_page=50`)
    return {
      data: res.messages,
      hasNextPage: res.pagination.current_page < res.pagination.last_page,
      hasPrevPage: res.pagination.current_page > 1,
      currentPage: res.pagination.current_page,
    }
  },
  direction: "prepend",
  getKey: (msg) => msg._id,
})

useEffect(() => { refresh() }, [refresh])

<ChatVirtualList
  data={items}
  computeItemKey={(_, item) => item._id}
  itemContent={(_, item) => <Message data={item} />}
  onStartReached={hasPrevPage ? loadPrevPage : undefined}
  components={{ Header: () => loadingMore ? <Spinner /> : null }}
/>
```

---

## Best practices

- **Stable keys.** Always use a stable unique key in `computeItemKey`. Index keys break virtualization.
- **Lightweight `itemContent`.** Heavy components in the row slow scrolling. Memoize.
- **Realistic estimates.** Set `getItemEstimate` per content type for variable-height lists (chat with text + media). Reduces residual flicker before measurement converges.
- **Aggressive pre-measure.** Set `preMeasureMode="aggressive"` for chat. Default `"lazy"` is fine for uniform lists.
- **Earlier sentinel.** Increase `startReachedThreshold` (e.g. to `1500`) so the next page fetches while the user is still scrolling — measurements complete before they reach the top.
- **Avoid deprecated APIs.** Don't use `prepareAnchor()` directly or `scrollToMessageKey`. Prefer `scrollModifier` + automatic anchor capture from `onStartReached`.
- **Page size 30–50.** Larger pages mean fewer fetches but bigger measure batches. 50 is a good default with `startReachedThreshold={1500}`.

---

## Internals (architecture)

| Component | Role |
|---|---|
| `OffsetMap` | Fenwick BIT for O(log n) cumulative offset queries |
| `ItemSizeCache` | LRU cache of measured heights; survives re-renders and item reordering |
| `KeyIndex` | Bidirectional map `key ↔ index` for fast lookups |
| `ScrollStateMachine` | `idle / restoring / animating` states; gates compensation logic |
| `DeviationController` | CSS transform compensation + `scrollBy` reconciliation (Virtuoso-style dual-RAF) |
| `MeasureBatch` | Hidden render container for off-screen measurement (used by `preMeasureMode` and `prefetchMeasure`) |
| `useScrollAnchor` | Captures snapshot before mutation, restores after with settle loop |
| `useMeasurePipeline` | RAF-batched ResizeObserver flush; tracks above-viewport size deltas |

The library is built around the "measure-then-commit" principle: real DOM measurements are guaranteed before the anchor target is computed, eliminating estimate-error drift on prepend.

---

## Migration notes

### `0.4 → 0.5+`
- `prepareAnchor` is deprecated. Anchor capture is automatic before `onStartReached` runs. Remove manual calls.
- Force-render-on-prepend now built in. No config needed.

### `0.5 → 0.6+`
- New: `preMeasureMode` prop. Set to `"aggressive"` for production chat.
- New: `getItemEstimate` callback for per-item height hints.

### `0.6 → 0.7+`
- New: `ref.current.prefetchMeasure(items)` for measure-then-commit pattern.
- API stable. No breaking changes.

---

## Browser compatibility

- Chrome/Edge 88+, Firefox 87+, Safari 14+
- Modern features used: `IntersectionObserver`, `ResizeObserver`, `requestIdleCallback` (with `setTimeout` fallback)
- React 18+ and React 19+

---

## License

MIT
