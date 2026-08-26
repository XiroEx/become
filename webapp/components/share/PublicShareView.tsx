'use client'

// Public, read-only render of a shared program / workout / session. Lives OUTSIDE
// /dashboard so AuthGuard never runs. Any interaction (start, swap, log) opens a
// "Log in to Become to continue" gate. Reuses the pure ExerciseAccordion so the
// exercise rows look exactly like the app.

import { useState } from 'react'
import Link from 'next/link'
import ExerciseAccordion from '@/components/ExerciseAccordion'
import type { Program, Workout, Phase } from '@/lib/data/programs'

export interface SharePayloadData {
  kind: 'program' | 'workout' | 'session'
  title: string
  subtitle?: string
  ownerName?: string
  payload: { program?: Program; workout?: Workout; programName?: string; phaseLabel?: string }
  sourceProgramId?: string
}

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Become'

function ExerciseList({ exercises }: { exercises: Workout['exercises'] }) {
  return (
    <div className="space-y-2">
      {exercises.map((ex, i) => (
        <ExerciseAccordion key={`${ex.exerciseSlug ?? ex.name}-${i}`} exercise={ex} index={i} isInGroup={!!ex.groupId} />
      ))}
    </div>
  )
}

export default function PublicShareView({ share }: { share: SharePayloadData }) {
  const [gateOpen, setGateOpen] = useState(false)
  const program = share.payload?.program
  const workout = share.payload?.workout

  // Program view: phase + day selection (view-only, no auth needed).
  const phases: Phase[] = program?.phases ?? []
  const [phaseIdx, setPhaseIdx] = useState(0)
  const phase = phases[phaseIdx]
  const workouts = phase?.workouts ?? []
  const [dayIdx, setDayIdx] = useState(0)
  const currentWorkout = workouts[dayIdx]

  const openGate = () => setGateOpen(true)

  return (
    // Own scroll container (h-dvh + overflow) so the page scrolls in in-app
    // browsers / PWAs regardless of any body-level overflow lock.
    <div className="h-dvh overflow-y-auto overscroll-contain bg-zinc-50 pb-28 dark:bg-zinc-950">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
        <span className="text-lg font-black tracking-tight text-zinc-900 dark:text-white">{APP_NAME.toUpperCase()}</span>
        <Link href="/login" className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-black">
          Log in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 py-5 space-y-5">
        {/* Title block */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {share.kind === 'program' ? 'Shared program' : 'Shared workout'}
            {share.ownerName ? ` · from ${share.ownerName}` : ''}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">{share.title}</h1>
          {share.subtitle && <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{share.subtitle}</p>}
        </div>

        {/* Read-only banner */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-900/15 dark:text-emerald-300">
          You&apos;re viewing a shared {share.kind === 'program' ? 'program' : 'workout'}. <button onClick={openGate} className="font-semibold underline underline-offset-2">Log in to {APP_NAME}</button> to start it, track sets, and save your progress.
        </div>

        {program ? (
          <>
            {program.description && <p className="text-sm text-zinc-600 dark:text-zinc-300">{program.description}</p>}
            {/* Phase tabs */}
            {phases.length > 1 && (
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
                {phases.map((ph, i) => (
                  <button
                    key={ph.phase + i}
                    onClick={() => { setPhaseIdx(i); setDayIdx(0) }}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${i === phaseIdx ? 'bg-zinc-900 text-white dark:bg-white dark:text-black' : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}`}
                  >
                    {ph.phase}
                  </button>
                ))}
              </div>
            )}
            {phase?.focus && <p className="text-xs text-zinc-500 dark:text-zinc-400">{phase.focus}{phase.weeks ? ` · weeks ${phase.weeks}` : ''}</p>}
            {/* Day tabs */}
            {workouts.length > 0 && (
              <div className="flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
                {workouts.map((w, i) => (
                  <button
                    key={w.day + i}
                    onClick={() => setDayIdx(i)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${i === dayIdx ? 'bg-emerald-600 text-white' : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'}`}
                  >
                    {w.day}
                  </button>
                ))}
              </div>
            )}
            {currentWorkout && (
              <div>
                <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">{currentWorkout.title}</h2>
                <ExerciseList exercises={currentWorkout.exercises} />
              </div>
            )}
          </>
        ) : workout ? (
          <div>
            <h2 className="mb-2 text-lg font-bold text-zinc-900 dark:text-white">{workout.title}</h2>
            <ExerciseList exercises={workout.exercises} />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">Nothing to show.</p>
        )}

        {/* Start CTA — gated */}
        <button
          onClick={openGate}
          className="w-full rounded-xl bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {share.kind === 'program' ? 'Start this program' : 'Do this workout'}
        </button>
      </main>

      {/* Sticky login CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <button onClick={openGate} className="mx-auto block w-full max-w-2xl rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700">
          Log in to {APP_NAME} to continue
        </button>
      </div>

      {/* Login gate */}
      {gateOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={() => setGateOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 text-center shadow-2xl dark:border-zinc-800 dark:bg-zinc-900" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Continue in {APP_NAME}</h2>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Log in or create a free account to start this {share.kind === 'program' ? 'program' : 'workout'}, track your sets, and save your progress.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/login" className="rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-black">Log in</Link>
              <Link href="/login?register" className="rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">Create account</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
