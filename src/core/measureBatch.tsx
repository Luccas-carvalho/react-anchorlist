import * as React from "react"

export interface MeasureBatchItem<T> {
  key: string | number
  index: number
  data: T
}

export interface MeasureBatchController<T> {
  /** Mount items in hidden container, return measurements after one paint frame. */
  measure(items: MeasureBatchItem<T>[]): Promise<Map<string | number, number>>
  /** Returns the JSX element to mount inside the scroller (renders nothing if no pending). */
  Renderer: React.FC<{
    itemContent: (index: number, data: T) => React.ReactNode
    /** Width of the hidden container; should match the actual rendered list width for accurate measurement. */
    containerWidth: number | string
  }>
  /** Cleanup pending state. */
  reset(): void
}

const HIDDEN_STYLE: React.CSSProperties = {
  position: "absolute",
  visibility: "hidden",
  pointerEvents: "none",
  top: -99999,
  left: 0,
  width: "100%", // overridden by containerWidth prop
  zIndex: -1,
}

/**
 * Hidden measure pass: mount items off-screen briefly so we can read their
 * exact heights via getBoundingClientRect, then unmount.
 *
 * Useful when a chat virtualizer prepends items that fall outside the render
 * window — those items never trigger ResizeObserver, so without a real
 * measurement the anchor restore drifts by (estimate error × count).
 *
 * Concurrency: a second `measure()` call while the first is still pending
 * REPLACES the first batch. The first promise will never resolve. Callers
 * should await sequentially or use `reset()` between batches.
 */
export function useMeasureBatch<T>(): MeasureBatchController<T> {
  const [pending, setPending] = React.useState<MeasureBatchItem<T>[] | null>(null)
  const resolverRef = React.useRef<((m: Map<string | number, number>) => void) | null>(null)
  const rendererRef = React.useRef<HTMLDivElement>(null)

  const measure = React.useCallback((items: MeasureBatchItem<T>[]) => {
    return new Promise<Map<string | number, number>>((resolve) => {
      if (items.length === 0) {
        resolve(new Map())
        return
      }
      resolverRef.current = resolve
      setPending(items)
    })
  }, [])

  const reset = React.useCallback(() => {
    setPending(null)
    resolverRef.current = null
  }, [])

  // Read sizes after paint, then resolve & unmount.
  React.useLayoutEffect(() => {
    if (!pending || !rendererRef.current) return

    const sizes = new Map<string | number, number>()
    const children = rendererRef.current.children
    for (let i = 0; i < children.length && i < pending.length; i++) {
      const el = children[i] as HTMLElement
      const item = pending[i]!
      const rect = el.getBoundingClientRect()
      sizes.set(item.key, rect.height)
    }

    const resolve = resolverRef.current
    resolverRef.current = null
    setPending(null)
    resolve?.(sizes)
  }, [pending])

  const Renderer: MeasureBatchController<T>["Renderer"] = React.useCallback(
    ({ itemContent, containerWidth }) => {
      if (!pending) return null
      return (
        <div ref={rendererRef} style={{ ...HIDDEN_STYLE, width: containerWidth }}>
          {pending.map((item) => (
            <div key={item.key} data-key={item.key}>
              {itemContent(item.index, item.data)}
            </div>
          ))}
        </div>
      )
    },
    [pending]
  )

  return { measure, Renderer, reset }
}
