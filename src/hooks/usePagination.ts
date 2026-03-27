import { useCallback, useRef, useState } from "react"
import type { UsePaginationOptions, UsePaginationReturn } from "../types"

/**
 * Manages paginated data with deduplication.
 * Supports append, prepend, and bidirectional loading.
 * Compatible with any fetcher (SWR, TanStack, raw fetch, etc.).
 */
export function usePagination<T>(options: UsePaginationOptions<T>): UsePaginationReturn<T> {
  const {
    fetcher,
    initialPage = 1,
    direction = "append",
    getKey,
    onPageLoaded,
    onError,
  } = options

  const [items, setItems] = useState<T[]>([])
  const [currentPage, setCurrentPage] = useState(initialPage)
  const [hasNextPage, setHasNextPage] = useState(true)
  const [hasPrevPage, setHasPrevPage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const seenKeys = useRef(new Set<string | number>())
  const inFlight = useRef(false)

  const dedupe = useCallback(
    (newItems: T[]): T[] => {
      if (!getKey) return newItems
      return newItems.filter((item) => {
        const key = getKey(item)
        if (seenKeys.current.has(key)) return false
        seenKeys.current.add(key)
        return true
      })
    },
    [getKey]
  )

  const loadNextPage = useCallback(async () => {
    if (inFlight.current || !hasNextPage) return
    inFlight.current = true
    setLoadingMore(true)
    try {
      const nextPage = currentPage + 1
      const result = await fetcher(nextPage)
      const deduped = dedupe(result.data)
      setItems((prev) =>
        direction === "prepend" ? [...deduped, ...prev] : [...prev, ...deduped]
      )
      setCurrentPage(nextPage)
      setHasNextPage(result.hasNextPage)
      setHasPrevPage(result.hasPrevPage)
      onPageLoaded?.(nextPage, deduped)
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoadingMore(false)
      inFlight.current = false
    }
  }, [currentPage, hasNextPage, fetcher, dedupe, direction, onPageLoaded, onError])

  const loadPrevPage = useCallback(async () => {
    if (inFlight.current || !hasPrevPage) return
    inFlight.current = true
    setLoadingMore(true)
    try {
      const prevPage = currentPage - 1
      const result = await fetcher(prevPage)
      const deduped = dedupe(result.data)
      // Prev page always prepends
      setItems((prev) => [...deduped, ...prev])
      setCurrentPage(prevPage)
      setHasPrevPage(result.hasPrevPage)
      setHasNextPage(result.hasNextPage)
      onPageLoaded?.(prevPage, deduped)
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoadingMore(false)
      inFlight.current = false
    }
  }, [currentPage, hasPrevPage, fetcher, dedupe, onPageLoaded, onError])

  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setLoading(true)
    try {
      const result = await fetcher(initialPage)
      const incoming = result.data
      if (getKey) {
        const newKeySet = new Set(incoming.map(getKey))
        // Mark incoming as seen
        incoming.forEach((item) => seenKeys.current.add(getKey(item)))
        setItems((prev) => {
          // Keep existing items that aren't in the new batch (real-time msgs)
          const existingNotInNew = prev.filter((item) => !newKeySet.has(getKey(item)))
          return direction === "prepend"
            ? [...incoming, ...existingNotInNew]
            : [...existingNotInNew, ...incoming]
        })
      } else {
        setItems(incoming)
      }
      setCurrentPage(initialPage)
      setHasNextPage(result.hasNextPage)
      setHasPrevPage(result.hasPrevPage)
      onPageLoaded?.(initialPage, incoming)
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
      inFlight.current = false
    }
  }, [fetcher, initialPage, getKey, direction, onPageLoaded, onError])

  const reset = useCallback(() => {
    setItems([])
    setCurrentPage(initialPage)
    setHasNextPage(true)
    setHasPrevPage(false)
    setLoading(false)
    setLoadingMore(false)
    seenKeys.current.clear()
    inFlight.current = false
  }, [initialPage])

  return {
    items,
    loadNextPage,
    loadPrevPage,
    hasNextPage,
    hasPrevPage,
    loading,
    loadingMore,
    refresh,
    reset,
    currentPage,
  }
}
