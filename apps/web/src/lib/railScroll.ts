/** Pixels of leftover scroll treated as "at the end" (subpixel / rounding). */
export const RAIL_OVERFLOW_EPSILON_PX = 2;

export type RailOverflowState = {
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

/** Whether a horizontal rail can still move in either direction. */
export function railOverflowState(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  epsilon = RAIL_OVERFLOW_EPSILON_PX,
): RailOverflowState {
  return {
    canScrollLeft: scrollLeft > epsilon,
    canScrollRight: scrollLeft + clientWidth < scrollWidth - epsilon,
  };
}

/**
 * Distance to move for one rail "page": one card + gap, or ~80% of the
 * viewport when item metrics are unknown.
 */
export function railScrollStep(
  clientWidth: number,
  itemWidth?: number,
  gap = 16,
): number {
  if (itemWidth != null && itemWidth > 0) {
    return itemWidth + gap;
  }
  return Math.max(clientWidth * 0.8, 280);
}
