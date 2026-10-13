'use client'

// "Finish with two exercises?"
//
// Build-as-you-go makes it easy to start a session with one movement and add
// the rest as you find the machines free — which also makes it easy to call it
// a workout after two. This asks once, on the way out, and offers the thing the
// member probably wanted: one more exercise rather than an early finish.
//
// It never blocks. Finish anyway is right there, and once it is used the
// session stops asking.

import { AlertTriangle, Plus, Check } from 'lucide-react'
import { RECOMMENDED_MIN_EXERCISES } from '@/lib/workout/buildAsYouGo'

export interface ThinSessionModalProps {
  open: boolean
  exerciseCount: number
  onAddExercise: () => void
  onFinishAnyway: () => void
  onClose: () => void
  tone?: 'dark' | 'app'
}

export default function ThinSessionModal({
  open,
  exerciseCount,
  onAddExercise,
  onFinishAnyway,
  onClose,
  tone = 'app',
}: ThinSessionModalProps) {
  if (!open) return null
  const dark = tone === 'dark'
  const surface = dark
    ? 'bg-zinc-950 text-white ring-1 ring-white/10'
    : 'bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-white dark:ring-zinc-800'
  const muted = dark ? 'text-white/60' : 'text-zinc-500 dark:text-zinc-400'
  const ghost = dark
    ? 'bg-white/10 text-white hover:bg-white/20'
    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" data-testid="thin-session-modal">
      <button aria-label="Keep going" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative w-full rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl ${surface}`}>
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              Finish with {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}?
            </h2>
            <p className={`mt-1 text-sm leading-snug ${muted}`}>
              Most sessions run {RECOMMENDED_MIN_EXERCISES} or more. You can add one more before you call it —
              it only takes a moment.
            </p>
          </div>
        </div>

        <button
          onClick={onAddExercise}
          data-testid="thin-session-add"
          className="mb-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 py-3 text-sm font-bold text-white transition-colors hover:bg-green-600"
        >
          <Plus className="h-4 w-4" />
          Add an exercise
        </button>
        <button
          onClick={onFinishAnyway}
          data-testid="thin-session-finish"
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-colors ${ghost}`}
        >
          <Check className="h-4 w-4" />
          Finish anyway
        </button>
      </div>
    </div>
  )
}
