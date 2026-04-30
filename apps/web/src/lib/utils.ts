import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Keyboard focus: lime ring + page-colored offset (high contrast on secondary/ghost/nav). */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"

/** For wrappers that show focus when a child control is focused (search field, select, deal card). */
export const focusRingWithin =
  "outline-none focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background"

/** Inset ring — avoids clipping inside `overflow-hidden` parents (e.g. mobile nav drawer). */
export const focusRingInset =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
