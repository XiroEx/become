'use client'

// The streak tile — every streak you are running, one page at a time.
//
// A super streak (all three pillars, every day) is the rarest thing on the
// dashboard, so when there is one it leads and its number pulses orange.
// Swipe (or tap the dots) to page through the rest; the tile also advances
// itself gently until you touch it. Tapping anywhere else opens the Streaks
// page — a swipe never navigates.

import { useCallback, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Flame, Dumbbell, UtensilsCrossed, Brain } from 'lucide-react'
import FireNumber from '@/components/streaks/FireNumber'
import { PILLAR, STREAK_INK } from '@/lib/pillarColors'
import { Card, type StatTileSize } from '@/components/ui'
import { streakPages, type StreakPage, type StreakPageId, type StreaksLite } from '@/lib/streaks/tile'

const ICON: Record<StreakPageId, typeof Flame> = {
  super: Flame, overall: Flame, workout: Dumbbell, nutrition: UtensilsCrossed, mindset: Brain,
}
const INK: Record<StreakPageId, { badge: string; bar: string }> = {
  super: STREAK_INK.super,
  overall: STREAK_INK.day,
  workout: PILLAR.training,
  nutrition: PILLAR.fuel,
  mindset: PILLAR.mind,
}

export default function StreakTile({ streaks, size = '1x1', loading }: { streaks: StreaksLite | null; size?: StatTileSize; loading?: boolean }) {
  const reduced = !!useReducedMotion()
  const pages = streakPages(streaks)
  const leadId = pages[0]?.id
  // Which page is showing, keyed by the lead streak: when the pages change
  // (the payload lands, or a super streak appears) the tile resets to the lead
  // without an effect writing state.
  const [nav, setNav] = useState<{ lead: string | undefined; i: number }>({ lead: leadId, i: 0 })
  const i = nav.lead === leadId ? Math.min(nav.i, Math.max(0, pages.length - 1)) : 0
  const [dir, setDir] = useState(1)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const wide = size === '2x1'

  // The tile RESTS on the most important streak — a super streak if there is
  // one, else the day streak — and only moves when the member moves it. An
  // auto-rotation would carry the rarest number off screen seconds after they
  // glanced at it, which is the opposite of the point.
  const goTo = useCallback((next: number, d: number) => {
    if (!pages.length) return
    setDir(d)
    setNav({ lead: leadId, i: ((next % pages.length) + pages.length) % pages.length })
  }, [pages.length, leadId])

  if (loading || !streaks || pages.length === 0) {
    return (
      <Card variant="compact" className="h-full" aria-hidden="true">
        <div className="flex h-full flex-col justify-center gap-2">
          <div className="flex items-center gap-3">
            <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-5 w-1/2 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            </div>
          </div>
          <div className="h-1 w-full animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </Card>
    )
  }

  const p: StreakPage = pages[Math.min(i, pages.length - 1)]
  const Icon = ICON[p.id]

  return (
    <Card
      as={Link}
      href="/dashboard/streaks"
      variant="compact"
      className="relative block h-full touch-pan-y overflow-hidden transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
      data-testid="streak-tile"
      data-page={p.id}
      draggable={false}
      onDragStart={(e: React.DragEvent) => e.preventDefault()}
      onPointerDown={(e: React.PointerEvent) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
        // Own the gesture: without capture the scroller can steal a horizontal
        // drag on a link and the pointerup never carries the delta.
        try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId) } catch { /* not capturable */ }
      }}
      onPointerMove={(e: React.PointerEvent) => { const d = drag.current; if (d && (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6)) d.moved = true }}
      onPointerUp={(e: React.PointerEvent) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy)) { goTo(i + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1) }
        else drag.current = null
        // Keep `moved` for the click that follows a real drag, then clear it.
        window.setTimeout(() => { drag.current = null }, 0)
      }}
      onPointerCancel={() => { drag.current = null }}
      onClick={(e: React.MouseEvent) => { if (drag.current?.moved) { e.preventDefault(); e.stopPropagation() } }}
    >
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={p.id}
          custom={dir}
          initial={reduced ? { opacity: 0 } : { opacity: 0, x: dir * 18 }}
          animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, x: -dir * 18 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex h-full flex-col justify-center gap-2"
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`relative flex shrink-0 items-center justify-center rounded-full ${wide ? 'h-11 w-11' : 'h-9 w-9'} ${INK[p.id].badge} ${p.doneToday || p.emphasis ? '' : 'opacity-60'}`}
            >
              {/* No glow on the badge either: the number is the only thing
                  burning, and a halo here read as a smudge on a white card. */}
              <Icon className={`relative ${wide ? 'h-5 w-5' : 'h-4 w-4'}`} />
            </span>

            <div className="min-w-0 flex-1">
              <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{p.label}</span>
              <div className={`mt-0.5 flex items-baseline gap-1 ${p.emphasis ? (wide ? 'text-4xl' : 'text-3xl') : (wide ? 'text-3xl' : 'text-2xl')} font-extrabold leading-none tracking-tight`}>
                {p.emphasis ? (
                  <span data-testid="streak-super-value"><FireNumber>{p.value}</FireNumber></span>
                ) : (
                  <span className="text-zinc-900 dark:text-white">{p.value}</span>
                )}
                {p.unit && <span className="text-[13px] font-semibold text-zinc-400 dark:text-zinc-500">{p.unit}</span>}
              </div>
            </div>
          </div>

          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full rounded-full ${INK[p.id].bar} transition-all duration-500`} style={{ width: `${p.pct}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[11px] leading-tight text-zinc-400 dark:text-zinc-500">{p.footer}</p>
              {pages.length > 1 && (
                <span className="flex shrink-0 items-center gap-[3px]" data-testid="streak-tile-dots">
                  {pages.map((pg, idx) => (
                    <button
                      key={pg.id}
                      type="button"
                      aria-label={pg.fullLabel}
                      aria-current={idx === i}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(idx, idx > i ? 1 : -1) }}
                      className={`h-1 rounded-full transition-all ${idx === i ? `w-2.5 ${pg.id === 'super' ? 'bg-orange-500' : 'bg-zinc-400 dark:bg-zinc-500'}` : 'w-1 bg-zinc-200 dark:bg-zinc-700'}`}
                    />
                  ))}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

    </Card>
  )
}
