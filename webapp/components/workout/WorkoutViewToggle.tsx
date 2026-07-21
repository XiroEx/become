"use client"

import { useRouter } from "next/navigation"

/**
 * Segmented Track | Live toggle shown at the top of a quick-session workout, so the
 * user can flip between the form (Track) and the immersive (Live) view. Uses
 * router.replace so switching swaps the current view in history instead of stacking
 * it (no back-loop, matches the quick-session close behaviour). Progress is shared
 * across the two views via lib/quickSession/progress, so flipping never loses data.
 */
export default function WorkoutViewToggle({
  active,
  trackHref,
  liveHref,
  onDark = false,
}: {
  active: "track" | "live"
  trackHref: string
  liveHref: string
  onDark?: boolean
}) {
  const router = useRouter()
  const go = (href: string, isActive: boolean) => {
    if (!isActive) router.replace(href)
  }

  const wrap = onDark ? "bg-white/10" : "bg-zinc-100 dark:bg-zinc-800"
  const activeCls = onDark
    ? "bg-white text-black"
    : "bg-zinc-900 text-white dark:bg-white dark:text-black"
  const idleCls = onDark
    ? "text-white/70 hover:text-white"
    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
  const btn = "rounded-full px-3 py-1 text-xs font-semibold transition-colors"

  return (
    <div className={`inline-flex items-center gap-0.5 rounded-full p-0.5 ${wrap}`} role="tablist" aria-label="Workout view">
      <button
        type="button"
        role="tab"
        aria-selected={active === "track"}
        onClick={() => go(trackHref, active === "track")}
        className={`${btn} ${active === "track" ? activeCls : idleCls}`}
      >
        Track
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "live"}
        onClick={() => go(liveHref, active === "live")}
        className={`${btn} ${active === "live" ? activeCls : idleCls}`}
      >
        Live
      </button>
    </div>
  )
}
