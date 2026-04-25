import { useEffect, useRef, useState } from "react"
import type { AtBottomHysteresis } from "../types"
import { resolveAtBottomState } from "../core/atBottom"

// Re-export for backward compat
export { resolveAtBottomState } from "../core/atBottom"
export type { AtBottomStateInput } from "../core/atBottom"

/** Returns true when the scroll container is near the bottom. */
export function useAtBottom(
  scrollerRef: React.RefObject<HTMLDivElement>,
  params: number | { threshold?: number; hysteresis?: AtBottomHysteresis }
): boolean {
  const threshold = typeof params === "number" ? params : (params.threshold ?? 200)
  const hysteresis = typeof params === "number" ? undefined : params.hysteresis
  const [isAtBottom, setIsAtBottom] = useState(true)
  const rafRef = useRef<number | null>(null)
  const isAtBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const check = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      const next = resolveAtBottomState({
        previous: isAtBottomRef.current,
        distanceFromBottom: dist,
        threshold,
        hysteresis,
      })
      isAtBottomRef.current = next
      setIsAtBottom(next)
    }

    const handler = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(check)
    }

    el.addEventListener("scroll", handler, { passive: true })
    check()

    return () => {
      el.removeEventListener("scroll", handler)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [scrollerRef, threshold, hysteresis?.enter, hysteresis?.leave])

  return isAtBottom
}
