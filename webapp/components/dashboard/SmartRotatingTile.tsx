'use client'

// Smart-rotating tile — auto-cycles through ALL available dashboard cards
// (every stat tile + every resolved metric), one at a time, on a timer. It is
// not a card "type" of its own; it's a rotating window onto the other cards.
//
// Rendering reuses the exact same renderers the grid uses for fixed tiles
// (TILE_DEFS[id].render for stats, MetricTileCard for metrics) so a rotated
// card is visually identical to a pinned one. A subtle "live" dot marks it.

import { useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ALL_TILE_IDS, TILE_DEFS, type DashboardTileContext, type DashboardTileId } from '@/lib/dashboardTiles'
import type { DashboardTileSize } from '@/lib/dashboardLayout/types'

export interface SmartRotatingItem {
  key: string
  render: (size: DashboardTileSize) => ReactNode
}

export interface SmartRotatingTileProps {
  /** Pool of cards to rotate through, in display order. */
  items: SmartRotatingItem[]
  size: DashboardTileSize
  /** Cycle interval in ms. */
  intervalMs?: number
  /** Initial offset so multiple smart tiles don't all show the same card. */
  startIndex?: number
}

const DEFAULT_INTERVAL = 6000

export function SmartRotatingTile({ items, size, intervalMs = DEFAULT_INTERVAL, startIndex = 0 }: SmartRotatingTileProps) {
  const [index, setIndex] = useState(startIndex)

  // Clamp when the pool size changes (data loads in).
  const safeIndex = items.length > 0 ? ((index % items.length) + items.length) % items.length : 0

  useEffect(() => {
    if (items.length <= 1) return
    // Respect users who prefer no motion — don't auto-cycle.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce) return
    const t = setInterval(() => setIndex((i) => i + 1), intervalMs)
    return () => clearInterval(t)
  }, [items.length, intervalMs])

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-zinc-200 bg-white p-3 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        Keep logging — smart tile coming
      </div>
    )
  }

  const item = items[safeIndex]
  return (
    // overflow-hidden so the sliding cards are clipped to the tile bounds; the
    // inner layers are absolutely stacked so the outgoing + incoming cards
    // occupy the same box during the cross-slide.
    <div className="relative h-full w-full overflow-hidden rounded-xl">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.div
          key={item.key}
          className="absolute inset-0"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={{ x: { type: 'spring', stiffness: 320, damping: 34 }, opacity: { duration: 0.18 } }}
        >
          {item.render(size)}
        </motion.div>
      </AnimatePresence>
      {/* "Live/rotating" affordance — small pulsing dot, non-interactive. Sits
          above the sliding layers so it stays put while cards move under it. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 z-10 flex h-1.5 w-1.5"
        title="Smart tile — rotating"
      >
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-indigo-500" />
      </span>
    </div>
  )
}

/**
 * Build the rotation pool: every stat card (rendered from live statContext) plus
 * every resolved metric card. Caller supplies a renderer for metrics so this
 * module stays free of the metric-card implementation.
 */
export function buildRotationItems(
  statContext: DashboardTileContext,
  metricIds: string[],
  renderMetric: (id: string, size: DashboardTileSize) => ReactNode,
): SmartRotatingItem[] {
  const items: SmartRotatingItem[] = []
  for (const id of ALL_TILE_IDS as DashboardTileId[]) {
    items.push({ key: `stat:${id}`, render: () => TILE_DEFS[id].render(statContext) })
  }
  for (const id of metricIds) {
    items.push({ key: `metric:${id}`, render: (size) => renderMetric(id, size) })
  }
  return items
}

export default SmartRotatingTile
