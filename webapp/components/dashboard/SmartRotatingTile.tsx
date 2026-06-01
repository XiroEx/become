'use client'

// Smart-rotating tile — auto-cycles through ALL available dashboard cards
// (every stat tile + every resolved metric), one at a time, on a timer, and
// can be swiped left/right to step through them manually. It is not a card
// "type" of its own; it's a rotating window onto the other cards.
//
// Rendering reuses the exact same renderers the grid uses for fixed tiles
// (TILE_DEFS[id].render for stats, MetricTileCard for metrics) so a rotated
// card is visually identical to a pinned one. A subtle "live" dot marks it.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
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
// How long to pause auto-rotation after a manual swipe.
const MANUAL_PAUSE_MS = 12000
// Swipe past this distance (px) or velocity steps a card.
const SWIPE_DISTANCE = 48
const SWIPE_VELOCITY = 400

// Directional slide variants. `direction` is +1 (advancing → new card enters
// from the right) or -1 (going back → new card enters from the left).
const slideVariants = {
  enter: (direction: number) => ({ x: direction >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction >= 0 ? '-100%' : '100%', opacity: 0 }),
}

export function SmartRotatingTile({ items, size, intervalMs = DEFAULT_INTERVAL, startIndex = 0 }: SmartRotatingTileProps) {
  // Track an unbounded index + the direction of the last change so the slide
  // animates the correct way for both auto-rotate and manual swipe.
  const [[index, direction], setState] = useState<[number, number]>([startIndex, 1])
  const pausedUntilRef = useRef(0)

  const count = items.length
  const safeIndex = count > 0 ? ((index % count) + count) % count : 0

  const step = useCallback((dir: number, manual: boolean) => {
    if (manual) pausedUntilRef.current = Date.now() + MANUAL_PAUSE_MS
    setState(([i]) => [i + dir, dir])
  }, [])

  useEffect(() => {
    if (count <= 1) return
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduce) return
    const t = setInterval(() => {
      // Skip auto-advance while the user is actively browsing via swipe.
      if (Date.now() < pausedUntilRef.current) return
      setState(([i]) => [i + 1, 1])
    }, intervalMs)
    return () => clearInterval(t)
  }, [count, intervalMs])

  const handleDragEnd = useCallback(
    (_e: unknown, info: PanInfo) => {
      const { offset, velocity } = info
      if (offset.x <= -SWIPE_DISTANCE || velocity.x <= -SWIPE_VELOCITY) step(1, true)
      else if (offset.x >= SWIPE_DISTANCE || velocity.x >= SWIPE_VELOCITY) step(-1, true)
    },
    [step],
  )

  if (count === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-zinc-200 bg-white p-3 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500">
        Keep logging — smart tile coming
      </div>
    )
  }

  const item = items[safeIndex]
  return (
    // overflow-hidden so the sliding cards clip to the tile bounds; inner layers
    // are absolutely stacked so outgoing + incoming cards share the box.
    <div className="relative h-full w-full touch-pan-y overflow-hidden rounded-xl">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.div
          key={item.key}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ x: { type: 'spring', stiffness: 320, damping: 34 }, opacity: { duration: 0.18 } }}
          drag={count > 1 ? 'x' : false}
          dragSnapToOrigin
          dragElastic={0.18}
          dragConstraints={{ left: 0, right: 0 }}
          onDragEnd={handleDragEnd}
        >
          {item.render(size)}
        </motion.div>
      </AnimatePresence>
      {/* "Live/rotating" affordance — small pulsing dot. Above the sliding
          layers so it stays put; non-interactive so it never blocks a swipe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-2 z-10 flex h-1.5 w-1.5"
        title="Smart tile — swipe to browse"
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
