# react-anchorlist

High-performance virtualized lists for React, optimized for chat and infinite feeds.

No flicker when prepending older messages. Stable scroll. Simple API.

```bash
npm install react-anchorlist
```

## Why use it

- Virtualizes large lists (renders only what is visible + overscan)
- Keeps scroll stable when you prepend items (chat history)
- Supports top/bottom pagination callbacks
- Includes chat-focused behavior like `followOutput` and declarative scroll commands
- Works with dynamic row heights via `ResizeObserver`

## 60-second setup

### Generic list

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
    // 1) tell the list to preserve anchor
    setScrollModifier({ id: `prepend-${Date.now()}`, type: "prepend" })
    // 2) prepend older messages in your state
    await loadOlderMessages()
  }}
  onAtBottomChange={setIsAtBottom}
  style={{ height: "100%" }}
/>
```

## Core concept (important)

When data changes, control scroll behavior with `scrollModifier`:

```ts
type ChatScrollModifier =
  | { id: string | number; type: "prepend" }
  | { id: string | number; type: "append"; behavior?: "auto" | "smooth"; ifAtBottomOnly?: boolean }
  | { id: string | number; type: "items-change" }
  | { id: string | number; type: "jump-to-key"; key: string | number; align?: "start" | "center" | "end"; behavior?: ScrollBehavior }
```

- `id` must be unique for each command.
- `prepend` keeps viewport position stable while older messages are added on top.
- `append` can auto-scroll to bottom.
- `jump-to-key` scrolls to one specific item.

## API quick reference

### Exports

```ts
import {
  ChatVirtualList,
  VirtualList,
  useChatVirtualizer,
  usePagination,
} from "react-anchorlist"
```

### `ChatVirtualList` most-used props

- `data`, `itemContent`, `computeItemKey` (required)
- `scrollModifier` (`ChatScrollModifier | null`)
- `followOutput` (`"auto" | "smooth" | false`, default: `"auto"`)
- `onStartReached`, `onEndReached`
- `startReachedThreshold` and `endReachedThreshold` (default: `300`)
- `onAtBottomChange`
- `estimatedItemSize` (default: `80`)
- `overscan` (default: `20`)

### `VirtualList` most-used props

- `data`, `itemContent`, `computeItemKey` (required)
- `onEndReached`
- `endReachedThreshold` (default: `300`)
- `estimatedItemSize` (default: `60`)
- `overscan` (default: `20`)

### `ChatVirtualList` ref handle

```tsx
listRef.current?.scrollToBottom()
listRef.current?.scrollToIndex(42, { align: "center", behavior: "smooth" })
listRef.current?.scrollToKey("msg-123", { align: "center" })
listRef.current?.getScrollTop()
listRef.current?.isAtBottom()
```

## `usePagination` hook (optional helper)

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

useEffect(() => {
  refresh() // load initial page
}, [refresh])

<ChatVirtualList
  data={items}
  computeItemKey={(_, item) => item._id}
  itemContent={(_, item) => <Message data={item} />}
  onStartReached={hasPrevPage ? loadPrevPage : undefined}
  components={{
    Header: () => (loadingMore ? <Spinner /> : null),
  }}
/>
```

## Best practices

- Always use stable keys in `computeItemKey`.
- Keep `itemContent` lightweight.
- Start with a realistic `estimatedItemSize`.
- Keep `overscan` low unless you need smoother very fast scrolling.
- Prefer `scrollModifier` over deprecated APIs (`prepareAnchor`, `scrollToMessageKey`).

## Internals (simple)

- `OffsetMap`: stores cumulative offsets per item
- Anchor snapshot: keeps visual position stable on prepend
- Per-item `ResizeObserver`: updates real row heights
- Binary search: quickly finds visible range

## Keywords and discoverability

If your goal is npm discovery, keywords belong in `package.json` (not only in README text).

Suggested scope for this lib:
- `react`
- `virtual-list`
- `virtualization`
- `virtual-scroll`
- `chat`
- `infinite-scroll`
- `scroll-anchor`

## Copy-paste AI prompt

Use this prompt in ChatGPT/Claude/Cursor/GitHub Copilot Chat:

```text
You are a senior React engineer. Integrate the npm library `react-anchorlist` into my app.

Context:
- Stack: [React version + framework]
- Data type: [message/ticket/feed item shape]
- Item unique key: [id field]
- List container height strategy: [fixed/flex/full-screen]

Goal:
Implement a production-ready virtualized list with smooth scrolling and correct pagination behavior.

Requirements:
1) Use `ChatVirtualList` for chat-like UX (prepend older items at top).
2) Use stable `computeItemKey`.
3) Use `scrollModifier` commands correctly:
   - before loading older items: `{ id: uniqueId, type: "prepend" }`
   - when appending new realtime items: use append/items-change behavior when appropriate
   - use `jump-to-key` for "scroll to message"
4) Keep `followOutput="auto"` and expose `onAtBottomChange`.
5) Wire `onStartReached` and/or `onEndReached` to my pagination functions.
6) Add proper TypeScript types.
7) Include minimal CSS/container setup so scrolling works (`height` + `overflow`).
8) Avoid deprecated APIs (`prepareAnchor`, `scrollToMessageKey`) unless migration support is explicitly requested.

Deliverables:
- Full component code ready to paste.
- State management for `scrollModifier`.
- Example handlers: `loadOlderMessages`, `loadNewerMessages`.
- Brief explanation of why the scroll stays stable on prepend.
- Optional: a second example using `VirtualList` for non-chat pages.

Project data to use:
- Messages state variable: [name here]
- Pagination function names: [names here]
- Message row component name: [name here]

Return clean, runnable code with no placeholders left.
```

## License

MIT
