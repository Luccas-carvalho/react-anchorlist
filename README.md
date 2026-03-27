# react-anchorlist

**Lista virtualizada de alta performance para React, pensada para interfaces com muitos itens (como chat).**

Sem flicker ao carregar itens anteriores. Scroll fluido. Paginação nativa.

```bash
npm install react-anchorlist
```

---

## O que é

`react-anchorlist` é uma biblioteca para renderizar listas grandes com boa performance.
Ela mantém a navegação suave mesmo com histórico extenso, reduzindo custo de renderização e melhorando a experiência do usuário.

---

## Para que serve

Use quando você precisa de:

- **Renderização eficiente** em listas longas
- **Scroll estável** ao adicionar itens no topo (padrão chat)
- **Paginação incremental** ao chegar no início/fim da lista
- **Comportamento previsível** para “seguir no final” quando chegam novos itens

---

## Como funciona (alto nível)

- Renderiza principalmente os itens visíveis (com pequeno overscan)
- Mede altura real dos itens para manter posicionamento correto
- Preserva âncora de scroll quando itens são inseridos no topo
- Dispara callbacks ao aproximar do topo/fim para buscar mais dados

---

## Quick start

### Lista genérica (tickets, contatos, feed)

```tsx
import { VirtualList } from 'react-anchorlist'

<VirtualList
  data={tickets}
  computeItemKey={(index, item) => item.id}
  itemContent={(index, item) => <TicketRow ticket={item} />}
  onEndReached={loadMore}
  style={{ height: '100%' }}
/>
```

### Lista de chat (mensagens com paginação)

```tsx
import { ChatVirtualList } from 'react-anchorlist'
import type { ChatVirtualListHandle } from 'react-anchorlist'

const listRef = useRef<ChatVirtualListHandle>(null)

<ChatVirtualList
  ref={listRef}
  data={messages}
  computeItemKey={(index, item) => item._id}
  itemContent={(index, item) => <Message data={item} />}
  // Paginação — dispara ao chegar no topo
  onStartReached={() => {
    setScrollModifier({ id: `prepend-${Date.now()}`, type: 'prepend' })
    loadOlderMessages()
  }}
  // API declarativa para operações de scroll
  scrollModifier={scrollModifier}
  // Mantém no final quando chegam novas mensagens
  followOutput="auto"
  // Informa ao componente pai se está no final
  onAtBottomChange={setIsAtBottom}
  components={{
    Header: () => loading ? <Spinner /> : null,
    Footer: () => <QueueMessages />,
  }}
  style={{ height: '100%' }}
/>
```

---

## ChatVirtualList props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `T[]` | required | Array de itens |
| `itemContent` | `(index, item) => ReactNode` | required | Função de renderização |
| `computeItemKey` | `(index, item) => string \| number` | required | Chave estável por item |
| `estimatedItemSize` | `number` | `80` | Estimativa inicial de altura (px) |
| `overscan` | `number` | `20` | Itens renderizados além da área visível |
| `followOutput` | `"auto" \| "smooth" \| false` | `"auto"` | Seguir no final ao entrar item novo |
| `atBottomThreshold` | `number` | `200` | Distância (px) para considerar “no final” |
| `atBottomHysteresis` | `{ enter: number; leave: number }` | `{ enter: 80, leave: 160 }` | Evita alternância excessiva do estado "at bottom" |
| `initialAlignment` | `"top" \| "bottom"` | `"bottom"` | Posição inicial do scroll |
| `scrollModifier` | `ChatScrollModifier` | `null` | Comando declarativo para prepend/append/jump |
| `onStartReached` | `() => void \| Promise<void>` | — | Dispara ao aproximar do topo |
| `onEndReached` | `() => void \| Promise<void>` | — | Dispara ao aproximar do fim |
| `startReachedThreshold` | `number` | `300` | Distância (px) do topo para disparar callback |
| `endReachedThreshold` | `number` | `300` | Distância (px) do fim para disparar callback |
| `onAtBottomChange` | `(isAtBottom: boolean) => void` | — | Mudança de estado “no final” |
| `scrollToMessageKey` | `string \| number \| null` | — | **Deprecated**. Use `scrollModifier` com `type: "jump-to-key"` |
| `onScrollToMessageComplete` | `() => void` | — | **Deprecated** |
| `components` | `{ Header, Footer, EmptyPlaceholder }` | — | Slots opcionais |
| `className` | `string` | — | Classe CSS do container |
| `style` | `CSSProperties` | — | Estilo inline do container |

---

## VirtualList props

| Prop | Type | Default | Description |
|---|---|---|---|
| `data` | `T[]` | required | Array de itens |
| `itemContent` | `(index, item) => ReactNode` | required | Função de renderização |
| `computeItemKey` | `(index, item) => string \| number` | required | Chave estável por item |
| `estimatedItemSize` | `number` | `60` | Estimativa inicial de altura (px) |
| `overscan` | `number` | `20` | Itens renderizados além da área visível |
| `onEndReached` | `() => void \| Promise<void>` | — | Dispara ao aproximar do fim |
| `endReachedThreshold` | `number` | `300` | Distância (px) do fim para disparar callback |
| `components` | `{ Header, Footer, EmptyPlaceholder }` | — | Slots opcionais |
| `className` | `string` | — | Classe CSS do container |
| `style` | `CSSProperties` | — | Estilo inline do container |

---

## Ref handle (ChatVirtualList)

```tsx
const listRef = useRef<ChatVirtualListHandle>(null)

listRef.current?.scrollToBottom()
listRef.current?.scrollToIndex(42, { align: 'center', behavior: 'smooth' })
listRef.current?.scrollToKey('msg-123', { align: 'center' })
listRef.current?.getScrollTop()   // → number
listRef.current?.isAtBottom()     // → boolean
listRef.current?.prepareAnchor()  // deprecated
```

| Method | Description |
|---|---|
| `scrollToBottom(behavior?)` | Vai para o último item |
| `scrollToIndex(index, opts?)` | Vai para item por índice |
| `scrollToKey(key, opts?)` | Vai para item por chave |
| `getScrollTop()` | Posição atual do scroll |
| `isAtBottom()` | Indica se está no final |
| `prepareAnchor()` | **Deprecated**. Use `scrollModifier={{ id, type: 'prepend' }}` |

---

## ChatScrollModifier (API declarativa)

```ts
type ChatScrollModifier =
  | { id: string | number; type: 'prepend' }
  | { id: string | number; type: 'append'; behavior?: 'auto' | 'smooth'; ifAtBottomOnly?: boolean }
  | { id: string | number; type: 'items-change' }
  | { id: string | number; type: 'jump-to-key'; key: string | number; align?: 'start' | 'center' | 'end'; behavior?: ScrollBehavior }
```

- `id` precisa ser único por comando.
- `prepend` prepara e restaura âncora automaticamente no próximo update de dados.
- `jump-to-key` substitui `scrollToMessageKey`.

---

## Migração Rápida (v0.2 -> v0.3)

Antes:

```tsx
listRef.current?.prepareAnchor()
await loadMoreMessages()
```

Depois:

```tsx
setScrollModifier({ id: `prepend-${Date.now()}`, type: 'prepend' })
await loadMoreMessages()
```

---

## usePagination hook

Para paginação orientada ao back-end com deduplicação automática:

```tsx
import { usePagination, ChatVirtualList } from 'react-anchorlist'

const { items, loadPrevPage, hasPrevPage, loadingMore } = usePagination({
  fetcher: async (page) => {
    const res = await api.get(`/messages?page=${page}&per_page=50`)
    return {
      data: res.messages,
      hasNextPage: res.pagination.current_page < res.pagination.last_page,
      hasPrevPage: res.pagination.current_page > 1,
      currentPage: res.pagination.current_page,
    }
  },
  direction: 'prepend',      // novas páginas entram no topo
  getKey: (msg) => msg._id,  // chave para deduplicação
})

<ChatVirtualList
  data={items}
  computeItemKey={(_, item) => item._id}
  itemContent={(_, item) => <Message data={item} />}
  onStartReached={hasPrevPage ? loadPrevPage : undefined}
  components={{
    Header: () => loadingMore ? <Spinner /> : null,
  }}
/>
```

---

## Boas práticas

- Use **chave estável** em `computeItemKey`
- Evite lógica pesada em `itemContent`
- Padronize paginação e ordenação no back-end
- Ajuste `estimatedItemSize` para o tipo de item predominante
- Mantenha `overscan` baixo e só aumente se houver necessidade real

---

## Como funciona internamente

- **OffsetMap:** calcula offsets acumulados por item
- **Âncora de scroll:** preserva posição ao prepend
- **ResizeObserver por item:** mede altura real ao renderizar
- **Busca binária:** encontra faixa visível com eficiência

---

## License

MIT
