import type * as React from "react"

interface VirtualScrollerProps {
  scrollerRef: React.RefObject<HTMLDivElement>
  totalSize: number
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/** Scrollable container. Inner div has the virtual total height. */
export function VirtualScroller({
  scrollerRef,
  totalSize,
  children,
  className,
  style,
}: VirtualScrollerProps) {
  return (
    <div
      ref={scrollerRef}
      className={className}
      style={{ overflow: "auto", height: "100%", position: "relative", ...style }}
    >
      <div style={{ height: totalSize, position: "relative", width: "100%" }}>
        {children}
      </div>
    </div>
  )
}
