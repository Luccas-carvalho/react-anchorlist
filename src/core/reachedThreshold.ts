import type { ReachedThreshold } from "../types"

export type ThresholdUnit = "px" | "percent"

export interface ParsedReachedThreshold {
  unit: ThresholdUnit
  value: number
}

export function parseReachedThreshold(
  threshold: ReachedThreshold,
  fallbackPx: number
): ParsedReachedThreshold {
  if (typeof threshold === "number" && Number.isFinite(threshold)) {
    return {
      unit: "px",
      value: Math.max(0, threshold),
    }
  }

  if (typeof threshold === "string") {
    const normalized = threshold.trim()

    const pxMatch = normalized.match(/^(\d+(?:\.\d+)?)px$/i)
    if (pxMatch) {
      const value = Number.parseFloat(pxMatch[1]!)
      if (Number.isFinite(value)) {
        return {
          unit: "px",
          value: Math.max(0, value),
        }
      }
    }

    const percentMatch = normalized.match(/^(\d+(?:\.\d+)?)%$/)
    if (percentMatch) {
      const value = Number.parseFloat(percentMatch[1]!)
      if (Number.isFinite(value)) {
        return {
          unit: "percent",
          value: Math.max(0, value),
        }
      }
    }
  }

  return {
    unit: "px",
    value: Math.max(0, fallbackPx),
  }
}

export function getThresholdPixels(
  threshold: ParsedReachedThreshold,
  containerHeight: number
): number {
  if (threshold.unit === "px") return threshold.value
  return (containerHeight * threshold.value) / 100
}

export function buildReachedRootMargin(
  threshold: ParsedReachedThreshold,
  edge: "start" | "end"
): string {
  const margin = threshold.unit === "px"
    ? `${threshold.value}px`
    : `${threshold.value}%`

  return edge === "start"
    ? `${margin} 0px 0px 0px`
    : `0px 0px ${margin} 0px`
}
