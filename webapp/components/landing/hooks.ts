"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(REDUCED_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/**
 * framer's own `useReducedMotion` reads the media query during hydration while
 * the server rendered `false`, which trips React's hydration check and logs a
 * pageerror. `useSyncExternalStore` with an explicit server snapshot hydrates
 * with `false` and then re-renders, which is the supported path.
 */
export function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  )
}

/**
 * Counts from 0 to `target` once `active` flips true. Under
 * prefers-reduced-motion the final value is rendered immediately.
 */
export function useCountUp(target: number, active: boolean, duration = 1100): number {
  const reduced = useReducedMotionSafe()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!active || reduced) return
    let frame = 0
    const started = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(target * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, target, duration, reduced])

  if (!active) return 0
  return reduced ? target : value
}
