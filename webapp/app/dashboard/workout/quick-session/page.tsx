'use client'

// Overview ("regular view") for a one-off / generated quick session — the screen
// that was missing: Start session used to jump straight to the live view, so the
// session had no resting place, no Share button, and vanished on close. This
// reads the persisted draft (localStorage) and offers Share + Start live, and is
// reachable again after closing the live view.

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Play, Dumbbell, CalendarClock, Check, Pencil } from 'lucide-react'
import ExerciseAccordion from '@/components/ExerciseAccordion'
import ShareButton from '@/components/share/ShareButton'
import PageTransition from '@/components/PageTransition'
import SessionEditor from '@/components/workout/SessionEditor'
import {
  readQuickSession,
  updateQuickSession,
  quickSessionLiveHref,
  type StoredQuickSession,
} from '@/lib/quickSession/store'
import { FOCUS_DEFS, type DraftExercise } from '@/lib/quickSession/types'

// Local YYYY-MM-DD (not UTC) so the date picker + max match the user's day.
function localDateStr(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const firstInt = (s?: string): number | undefined => {
  const m = s ? String(s).match(/\d+/) : null
  return m ? parseInt(m[0], 10) : undefined
}

// Turn the planned session into a log: every planned set carries its prescribed
// reps (or duration for time-based work). `done` marks the sets completed —
// true when logging a past/today session, false when planning a future one.
function buildLoggedExercises(exercises: DraftExercise[], done: boolean) {
  return exercises.map((ex) => {
    const nSets = Math.max(1, Number(ex.sets) || 1)
    const reps = firstInt(ex.reps)
    const durSec = firstInt(ex.duration)
    return {
      name: ex.name,
      ...(ex.exerciseSlug && { exerciseSlug: ex.exerciseSlug }),
      sets: Array.from({ length: nSets }, (_, i) => ({
        setNumber: i + 1,
        ...(reps != null && { reps }),
        ...(durSec != null && { duration: durSec }),
        completed: done,
      })),
    }
  })
}

export default function QuickSessionOverviewPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session') || ''
  // This session already exists server-side under this exact id (a planned
  // session opened from the hub), so edits write back to that log. For a plain
  // draft they must not, or saving would insert a log nobody asked for.
  const isSaved = params.get('saved') === '1'
  const [session, setSession] = useState<StoredQuickSession | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [logOpen, setLogOpen] = useState(false)
  const [logDate, setLogDate] = useState(localDateStr())
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  // Future date = planning ahead (saved incomplete); past/today = logging done.
  const isFutureDate = logDate > localDateStr()

  const logAsDone = async () => {
    if (!session) return
    setLogging(true)
    setLogError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const done = !isFutureDate
      const exercises = buildLoggedExercises(session.exercises, done)
      const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0)
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({
          kind: 'quick',
          sessionId: session.sessionId,
          title: session.title,
          ...(session.focus && { focus: session.focus }),
          exercises,
          completed: done,
          ...(done && { duration: Math.max(1, Math.round(totalSets * 1.5)) }),
          performedAt: logDate,
          tz: new Date().getTimezoneOffset(),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to save session')
      router.push(done ? '/dashboard/history' : '/dashboard/workout/hub?tab=sessions')
    } catch (e) {
      setLogError(e instanceof Error ? e.message : 'Failed to save session')
      setLogging(false)
    }
  }

  // Apply an edit: always update the local stash (that is what Start workout and
  // "Log it" read), and additionally write back to the server log when this
  // session already exists there.
  const saveEdit = async ({ title, exercises }: { title: string; exercises: DraftExercise[] }) => {
    if (!session) return
    setSavingEdit(true)
    setEditError(null)
    const next = updateQuickSession(session.sessionId, { title, exercises })
    try {
      if (isSaved) {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        const res = await fetch('/api/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({
            kind: 'quick',
            sessionId: session.sessionId,
            title,
            ...(session.focus && { focus: session.focus }),
            // Still a plan, not a performed workout — no performedAt, so the
            // route leaves the scheduled date exactly where it was.
            exercises: buildLoggedExercises(exercises, false),
            completed: false,
            tz: new Date().getTimezoneOffset(),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to save changes')
      }
      setSession(next ?? { ...session, title, exercises })
      setEditing(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save changes')
    } finally {
      setSavingEdit(false)
    }
  }

  // Client-only read of the persisted draft (localStorage is unavailable during
  // SSR). Legitimate sync-to-param effect.
  useEffect(() => {
    setSession(sessionId ? readQuickSession(sessionId) : null)
  }, [sessionId])

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
    <PageTransition className="pb-44">
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={() => router.back()} className="flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditing((v) => !v)
                setLogOpen(false)
              }}
              aria-expanded={editing}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                editing
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <Pencil className="h-4 w-4" /> Edit
            </button>
            <button
              onClick={() => setLogOpen((v) => !v)}
              aria-expanded={logOpen}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                logOpen
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              <CalendarClock className="h-4 w-4" /> Log or plan
            </button>
            <ShareButton
              kind="session"
              session={{ title: session.title, focus: session.focus, exercises: session.exercises }}
              label="Share"
            />
          </div>
        </div>

        {/* Log / plan date panel — revealed by the header button. Past date =
            logs it done; future date = plans it. */}
        {logOpen && !editing && (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {isFutureDate ? 'Plan this session for' : 'When did you do this?'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
              <button
                onClick={logAsDone}
                disabled={logging}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
              >
                <Check className="h-4 w-4" /> {logging ? 'Saving…' : isFutureDate ? 'Plan it' : 'Log it'}
              </button>
            </div>
            {logError && <p className="mt-1.5 text-xs text-red-500">{logError}</p>}
          </div>
        )}

        {/* Title */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            {isSaved || session.source === 'saved' ? 'Saved session' : 'Generated session'}
            {focusLabel ? ` · ${focusLabel}` : ''}
          </p>
          {/* Hidden while editing — the editor owns the name field, and two
              titles on screen reads as a bug. */}
          {!editing && (
            <>
              <h1 className="mt-1 text-2xl font-bold text-zinc-900 dark:text-white">{session.title}</h1>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{session.exercises.length} exercises</p>
            </>
          )}
        </div>

        {/* Exercises — read-only, or the editor when editing */}
        {editing ? (
          <SessionEditor
            title={session.title}
            exercises={session.exercises}
            onSave={saveEdit}
            onCancel={() => {
              setEditing(false)
              setEditError(null)
            }}
            saving={savingEdit}
            error={editError}
          />
        ) : (
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
                  // Timed work has no reps — without this a 45-second plank
                  // renders as "45 reps".
                  ...(!ex.reps && ex.duration ? { repsUnit: 'sec' } : {}),
                  rest: ex.rest,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Start CTA — pinned above the floating BottomNav (bottom-28 contract).
          Hidden while editing so it can't sit on top of the editor's Save row. */}
      <div className={`fixed bottom-28 left-0 right-0 z-30 px-4 ${editing ? 'hidden' : ''}`}>
        <button
          onClick={() => router.push(quickSessionLiveHref(session.sessionId))}
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3 text-sm font-semibold text-white shadow-lg shadow-green-600/25 transition-all hover:from-green-700 hover:to-green-600"
        >
          <Play className="h-4 w-4 fill-current" /> Start workout
        </button>
      </div>
    </PageTransition>
  )
}
