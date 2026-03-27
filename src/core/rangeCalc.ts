export interface RenderRange {
  start: number
  end: number
}

/** Applies overscan buffer to the visible range, clamped to [0, itemCount-1] */
export function calcRenderRange(params: {
  firstVisible: number
  lastVisible: number
  itemCount: number
  overscan: number
}): RenderRange {
  const { firstVisible, lastVisible, itemCount, overscan } = params
  if (itemCount === 0) return { start: 0, end: -1 }
  return {
    start: Math.max(0, firstVisible - overscan),
    end: Math.min(itemCount - 1, lastVisible + overscan),
  }
}
