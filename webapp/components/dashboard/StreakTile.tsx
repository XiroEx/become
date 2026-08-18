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
import { Flame, Sparkles, Dumbbell, UtensilsCrossed, Brain } from 'lucide-react'
import { Card, type StatTileSize } from '@/components/ui'
import { streakPages, type StreakPage, type StreakPageId, type StreaksLite } from '@/lib/streaks/tile'

const ICON: Record<StreakPageId, typeof Flame> = {
  super: Sparkles, overall: Flame, workout: Dumbbell, nutrition: UtensilsCrossed, mindset: Brain,
}
const BADGE: Record<StreakPageId, string> = {
  super: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300',
  overall: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300',
  workout: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  nutrition: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300',
  mindset: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300',
}
const BAR: Record<StreakPageId, string> = {
  super: 'bg-orange-500', overall: 'bg-amber-500', workout: 'bg-green-500', nutrition: 'bg-red-500', mindset: 'bg-purple-500',
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
          className="flex h-full flex-col justify-center gap-1.5"
        >
          <div className="flex items-center gap-3">
            <motion.span
              className={`flex shrink-0 items-center justify-center rounded-full ${wide ? 'h-11 w-11' : 'h-9 w-9'} ${BADGE[p.id]} ${p.doneToday ? '' : 'opacity-60'}`}
              animate={p.emphasis && !reduced ? { scale: [1, 1.08, 1] } : { scale: 1 }}
              transition={p.emphasis && !reduced ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
            >
              <Icon className={wide ? 'h-5 w-5' : 'h-4 w-4'} />
            </motion.span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{p.label}</div>
              <div className={`${wide ? 'text-3xl' : 'text-2xl'} font-extrabold leading-none tracking-tight ${p.emphasis ? 'text-orange-500 dark:text-orange-400' : 'text-zinc-900 dark:text-white'}`}>
                {p.emphasis && !reduced ? (
                  <motion.span
                    className="inline-block"
                    data-testid="streak-super-value"
                    animate={{ opacity: [1, 0.55, 1], textShadow: ['0 0 0px rgba(249,115,22,0)', '0 0 14px rgba(249,115,22,0.65)', '0 0 0px rgba(249,115,22,0)'] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    {p.value}
                  </motion.span>
                ) : (
                  <span data-testid={p.emphasis ? 'streak-super-value' : undefined}>{p.value}</span>
                )}
                {p.unit && <span className="ml-1 text-sm font-semibold text-zinc-400 dark:text-zinc-500">{p.unit}</span>}
              </div>
            </div>
          </div>
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className={`h-full rounded-full ${BAR[p.id]} transition-all duration-500`} style={{ width: `${p.pct}%` }} />
            </div>
            <p className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-600">{p.footer}</p>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Page dots — tap to jump, and the affordance that says "there is more". */}
      {pages.length > 1 && (
        <div className="absolute right-2 top-2 flex items-center gap-1" data-testid="streak-tile-dots">
          {pages.map((pg, idx) => (
            <button
              key={pg.id}
              type="button"
              aria-label={pg.label}
              onPointerDown={e => e.stopPropagation()}
              onClick={e => { e.preventDefault(); e.stopPropagation(); goTo(idx, idx > i ? 1 : -1) }}
              className={`h-1.5 rounded-full transition-all ${idx === i ? `w-3 ${pg.id === 'super' ? 'bg-orange-500' : 'bg-zinc-400 dark:bg-zinc-500'}` : 'w-1.5 bg-zinc-200 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
