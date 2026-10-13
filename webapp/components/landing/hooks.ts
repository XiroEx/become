"use client"

import { useEffect, useState, useSyncExternalStore } from "react"

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)"
const DARK_QUERY = "(prefers-color-scheme: dark)"

function subscribeReduced(onChange: () => void) {
  const media = window.matchMedia(REDUCED_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

function subscribeTheme(onChange: () => void) {
  const media = window.matchMedia(DARK_QUERY)
  media.addEventListener("change", onChange)
  return () => media.removeEventListener("change", onChange)
}

/**
 * The device theme, read from the same media query the root layout's blocking
 * script uses to put `.light` / `.dark` on <html>. All landing *styling* is
 * keyed off that class in CSS — this hook exists only for the handful of places
 * where a component needs to KNOW the theme (the dashboard flip demo starts on
 * the site's own variant). Server snapshot is "light" so hydration matches the
 * server HTML; the real value lands on the next render, and the subscription
 * keeps it live when the OS theme changes.
 */
export function useSiteTheme(): "light" | "dark" {
  return useSyncExternalStore(
    subscribeTheme,
    () => (window.matchMedia(DARK_QUERY).matches ? "dark" : "light"),
    () => "light" as const,
  )
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
