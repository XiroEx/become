'use client'

// Overview ("regular view") for a one-off / generated quick session — the screen
// that was missing: Start session used to jump straight to the live view, so the
// session had no resting place, no Share button, and vanished on close. This
// reads the persisted draft (localStorage) and offers Share + Start live, and is
// reachable again after closing the live view.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Play, Dumbbell } from 'lucide-react'
import ExerciseAccordion from '@/components/ExerciseAccordion'
import ShareButton from '@/components/share/ShareButton'
import PageTransition from '@/components/PageTransition'
import { readQuickSession, quickSessionLiveHref, type StoredQuickSession } from '@/lib/quickSession/store'
import { FOCUS_DEFS } from '@/lib/quickSession/types'

export default function QuickSessionOverviewPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session') || ''
  const [session, setSession] = useState<StoredQuickSession | null | undefined>(undefined)

  // Client-only read of the persisted draft (localStorage is unavailable during
  // SSR). Legitimate sync-to-param effect.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSession(sessionId ? readQuickSession(sessionId) : null)
  }, [sessionId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (session === undefined) {
    return <div className="flex min-h-[60vh] items-center justify-center text-sm text-zinc-400">Loading…</div>
  }

  if (!session) {
    return (
      <PageTransition>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
          <Dumbbell className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white">This session isn&apos;t available anymore</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Generate a new one to get going.</p>
          <button onClick={() => router.push('/dashboard/workout/hub')} className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black">
            Back to workouts
          </button>
        </div>
      </PageTransition>
    )
  }

  const focusLabel = session.focus ? FOCUS_DEFS[session.focus]?.label : undefined

  return (
    <PageTransition className="pb-28">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => router.back()} className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <ShareButton
            kind="session"
            session={{ title: session.title, focus: session.focus, exercises: session.exercises }}
            label="Share"
          />
        </div>

        {/* Title */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            Generated session{focusLabel ? ` · ${focusLabel}` : ''}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">{session.title}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{session.exercises.length} exercises</p>
        </div>

        {/* Exercises */}
        <div className="space-y-2">
          {session.exercises.map((ex, i) => (
            <ExerciseAccordion
              key={`${ex.exerciseSlug || ex.name}-${i}`}
              index={i}
              exercise={{
                exerciseSlug: ex.exerciseSlug,
                name: ex.name,
                sets: ex.sets,
                reps: ex.reps || ex.duration,
                rest: ex.rest,
              }}
            />
          ))}
        </div>
      </div>

      {/* Start CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <button
          onClick={() => router.push(quickSessionLiveHref(session.sessionId))}
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-600"
        >
          <Play className="h-4 w-4 fill-current" /> Start workout
        </button>
      </div>
    </PageTransition>
  )
}
