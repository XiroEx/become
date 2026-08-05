'use client'

/**
 * Protocol unlock moment.
 *
 * Every arsenal segment opens its protocols progressively — `1 + reps` of them
 * are available, so each rep you put in unlocks the next one. That worked, but
 * it happened in total silence: the card simply stopped being greyed out, and
 * the only way to notice was to scroll the list and spot it. Members were
 * reaching the reward without ever being told they'd earned it.
 *
 * This turns the crossing into a moment. The hook detects the boundary being
 * crossed *during this visit* — never on first load, or opening the tab would
 * congratulate you for protocols you unlocked weeks ago.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, type LucideIcon } from 'lucide-react'

export interface UnlockableProtocol {
  id: string
  title: string
  blurb: string
  Icon: LucideIcon
}

/** How many protocols are open at a given rep count. */
export function openCount(reps: number, total: number): number {
  return Math.max(0, Math.min(1 + reps, total))
}

/**
 * Watch `reps` and report protocols that cross from locked to unlocked.
 *
 * `reps` is null until the segment's data has loaded. That distinction matters:
 * treating the pre-load 0 as a real value would make every page open look like
 * a jump from 1 unlocked protocol to N, firing a bogus celebration each visit.
 */
export function useProtocolUnlocks<T extends UnlockableProtocol>(
  protocols: T[],
  reps: number | null,
): { unlocked: T[]; dismiss: () => void } {
  const baseline = useRef<number | null>(null)
  const [unlocked, setUnlocked] = useState<T[]>([])

  useEffect(() => {
    if (reps === null) return // not loaded yet — no baseline, no comparison
    const open = openCount(reps, protocols.length)
    const before = baseline.current
    baseline.current = open
    if (before === null || open <= before) return // first load, or nothing new
    setUnlocked(protocols.slice(before, open))
  }, [reps, protocols])

  return { unlocked, dismiss: () => setUnlocked([]) }
}

export default function ProtocolUnlockModal({
  unlocked,
  onDismiss,
  accent = 'text-blue-500',
}: {
  unlocked: UnlockableProtocol[]
  onDismiss: () => void
  /** Segment accent, e.g. "text-blue-500" — matches the dashboard it fires in. */
  accent?: string
}) {
  const many = unlocked.length > 1

  return (
    <AnimatePresence>
      {unlocked.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, y: 16, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 240, damping: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white p-6 text-center shadow-2xl dark:bg-zinc-900"
          >
            <motion.span
              initial={{ scale: 0.5, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/15"
            >
              <Sparkles className="h-7 w-7 text-amber-500" />
            </motion.span>

            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-amber-500">
              {many ? `${unlocked.length} protocols unlocked` : 'Protocol unlocked'}
            </p>
            <h2 className="mt-1.5 text-xl font-extrabold text-zinc-900 dark:text-white">
              {many ? 'Your reps paid off' : unlocked[0].title}
            </h2>
            {!many && (
              <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{unlocked[0].blurb}</p>
            )}

            {many && (
              <div className="mt-4 space-y-2 text-left">
                {unlocked.map((p, i) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.09 }}
                    className="flex items-center gap-3 rounded-xl bg-zinc-100 px-3.5 py-2.5 dark:bg-zinc-800"
                  >
                    <p.Icon className={`h-4 w-4 shrink-0 ${accent}`} />
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {p.title}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
              Keep putting in reps to open the rest.
            </p>

            <button
              onClick={onDismiss}
              className="mt-5 w-full rounded-2xl bg-zinc-900 py-3.5 text-base font-bold text-white transition-transform active:scale-95 dark:bg-white dark:text-black"
            >
              Let&apos;s go
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
