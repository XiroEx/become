'use client'

import { CalendarClock } from 'lucide-react'

interface DayChoiceModalProps {
  /** YYYY-MM-DD the workout actually started on. */
  originalKey: string
  /** YYYY-MM-DD "today" is, at the moment of finishing. */
  todayKey: string
  onChoose: (chosenKey: string) => void
}

function labelFor(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  // Noon, local-agnostic: dayKey is already the caller's local calendar day,
  // so there's no timezone left to shift it across when formatting.
  return new Date(y, m - 1, d, 12).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

// Shown once, right at the end of a workout that started on one calendar day
// and is being finished on another — the exact midnight-crossing case. Without
// this the workout silently landed on whichever day the FIRST autosave
// happened to fire on, with no way to say "actually, count this as today."
export default function DayChoiceModal({ originalKey, todayKey, onChoose }: DayChoiceModalProps) {
  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-choice-heading"
        className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950 p-5 text-white shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
          <CalendarClock className="h-5 w-5" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-500">
          You went past midnight
        </p>
        <h2 id="day-choice-heading" className="mt-1 text-xl font-bold tracking-tight">
          Log this workout as which day?
        </h2>
        <p className="mt-1.5 text-sm leading-5 text-zinc-400">
          You started this on {labelFor(originalKey)}. Pick which day it should count toward.
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onChoose(originalKey)}
            className="flex flex-col items-start rounded-xl bg-emerald-600 px-4 py-3 text-left text-sm font-bold text-white transition hover:bg-emerald-500"
          >
            {labelFor(originalKey)}
            <span className="mt-0.5 text-xs font-medium text-emerald-100">When you started</span>
          </button>
          <button
            type="button"
            onClick={() => onChoose(todayKey)}
            className="flex flex-col items-start rounded-xl bg-zinc-900 px-4 py-3 text-left text-sm font-bold text-zinc-100 transition hover:bg-zinc-800"
          >
            {labelFor(todayKey)}
            <span className="mt-0.5 text-xs font-medium text-zinc-400">Today</span>
          </button>
        </div>
      </section>
    </div>
  )
}
