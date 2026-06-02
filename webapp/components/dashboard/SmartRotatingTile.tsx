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
import type { StatTileId } from '@/lib/dashboardLayout/defaults'
import { rankedRotationKeys, type TileEngagement } from '@/lib/dashboardTiles/smartRotation'

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
  /** Fired with the item key when a card is tapped (not dragged) — feeds the
   *  adaptive engagement signal. */
  onTap?: (key: string) => void
}

// A drag that moves less than this many px is treated as a tap.
const TAP_SLOP = 6

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

export function SmartRotatingTile({ items, size, intervalMs = DEFAULT_INTERVAL, startIndex = 0, onTap }: SmartRotatingTileProps) {
  // Track an unbounded index + the direction of the last change so the slide
  // animates the correct way for both auto-rotate and manual swipe.
  const [[index, direction], setState] = useState<[number, number]>([startIndex, 1])
  const pausedUntilRef = useRef(0)
  const draggedRef = useRef(false)

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
      if (Math.abs(offset.x) > TAP_SLOP) draggedRef.current = true
      if (offset.x <= -SWIPE_DISTANCE || velocity.x <= -SWIPE_VELOCITY) step(1, true)
      else if (offset.x >= SWIPE_DISTANCE || velocity.x >= SWIPE_VELOCITY) step(-1, true)
    },
    [step],
  )

  const handleClick = useCallback(
    (key: string) => {
      // A drag fires onDragEnd before click; ignore the click that follows a drag.
      if (draggedRef.current) {
        draggedRef.current = false
        return
      }
      onTap?.(key)
    },
    [onTap],
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
          onDragStart={() => { draggedRef.current = false }}
          onDragEnd={handleDragEnd}
          onClick={() => handleClick(item.key)}
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

export interface BuildRotationOptions {
  /** Cards already pinned on the grid — excluded so the smart tile doesn't repeat them. */
  excludeKeys?: ReadonlySet<string>
  /** Adaptive tap history (engagement boost). */
  engagement?: TileEngagement[]
  /** Injected `now` for deterministic relevance ordering. */
  now?: Date
  /**
   * Allowed card keys for THIS smart tile (from its settings.pool). When
   * provided, only these keys are eligible (still minus pinned). When omitted,
   * all stats + all resolved metrics are eligible (legacy behavior). The
   * grid passes the user's chosen pool, defaulting to the original stat cards.
   */
  poolKeys?: ReadonlySet<string>
}

/**
 * Build the rotation pool, ORDERED BY RELEVANCE (not a fixed linear cycle):
 * eligible stat cards (rendered from live statContext) plus eligible metric
 * cards, EXCLUDING anything already pinned. Eligibility is the smart tile's
 * configured `poolKeys` when given (defaults to all). Stats are scored by
 * actionability and metrics by incoming rank (see lib/dashboardTiles/
 * smartRotation). Item keys are `stat:<id>` / `metric:<id>`; the caller supplies
 * a metric renderer so this module stays free of the metric-card implementation.
 */
export function buildRotationItems(
  statContext: DashboardTileContext,
  metricIds: string[],
  renderMetric: (id: string, size: DashboardTileSize) => ReactNode,
  opts: BuildRotationOptions = {},
): SmartRotatingItem[] {
  const { excludeKeys, engagement, now, poolKeys } = opts
  const exclude = excludeKeys ?? new Set<string>()
  const allowed = (key: string) => (poolKeys ? poolKeys.has(key) : true)

  const statIds = (ALL_TILE_IDS as DashboardTileId[]).filter(
    (id) => !exclude.has(`stat:${id}`) && allowed(`stat:${id}`),
  ) as unknown as StatTileId[]
  const metrics = metricIds.filter(
    (id) => !exclude.has(`metric:${id}`) && allowed(`metric:${id}`),
  )

  // Relevance-ordered keys (with adaptive engagement boost); renderers keyed
  // off the id prefix.
  const order = rankedRotationKeys({ statIds, metricIds: metrics, ctx: statContext, engagement, now })
  return order.map((key) => {
    if (key.startsWith('stat:')) {
      const id = key.slice(5) as DashboardTileId
      return { key, render: () => TILE_DEFS[id].render(statContext) }
    }
    const id = key.slice(7) // 'metric:'.length
    return { key, render: (size: DashboardTileSize) => renderMetric(id, size) }
  })
}

export default SmartRotatingTile
