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
import QuickSessionNamePrompt from '@/components/workout/QuickSessionNamePrompt'
import {
  clearQuickSession,
  readQuickSession,
  updateQuickSession,
  quickSessionLiveHref,
  type StoredQuickSession,
} from '@/lib/quickSession/store'
import { clearQuickProgress, readQuickProgress } from '@/lib/quickSession/progress'
import { FOCUS_DEFS, type DraftExercise } from '@/lib/quickSession/types'
import { buildLoggedExercises } from '@/lib/quickSession/log'
import { persistSourceQuickSessionRename } from '@/lib/quickSession/rename'
import { shouldPromptForQuickSessionName } from '@/lib/quickSession/naming'
import { localDateStr, logPlanAvailability } from '@/lib/quickSession/logPlanDate'

// YYYY-MM-DD only — guards against a malformed/garbage `date` query param
// silently becoming the pre-filled log date.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export default function QuickSessionOverviewPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('session') || ''
  // This session already exists server-side under this exact id (a planned
  // session opened from the hub), so edits write back to that log. For a plain
  // draft they must not, or saving would insert a log nobody asked for.
  const isSaved = params.get('saved') === '1'
  // `started` is a fallback for browsers where localStorage is unavailable;
  // normal resumes are detected from their shared Track/Live progress draft.
  const startedFromHref = params.get('started') === '1'
  // Pre-filled by the Calendar when this session was started from a specific
  // day — otherwise default to today, as before.
  const dateParam = params.get('date')
  const initialLogDate = dateParam && DATE_RE.test(dateParam) ? dateParam : localDateStr()
  const [session, setSession] = useState<StoredQuickSession | null | undefined>(undefined)
  const [hasStarted, setHasStarted] = useState(startedFromHref)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  // Opens automatically when a specific date was requested — that is the
  // whole reason the Calendar sent the user here.
  const [logOpen, setLogOpen] = useState(!!dateParam)
  const [logDate, setLogDate] = useState(initialLogDate)
  const [logging, setLogging] = useState(false)
  const [logError, setLogError] = useState<string | null>(null)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  // Past days can only be logged, future days can only be planned, today allows both.
  const { canLog, canPlan } = logPlanAvailability(logDate, localDateStr())

  const saveLog = async (title: string, done: boolean) => {
    if (!session) return
    setLogging(true)
    setLogError(null)
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const exercises = buildLoggedExercises(session.exercises, done)
      const totalSets = exercises.reduce((n, e) => n + e.sets.length, 0)
      const res = await fetch('/api/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({
          kind: 'quick',
          sessionId: session.sessionId,
          title,
          needsName: done ? false : shouldPromptForQuickSessionName(session),
          ...(session.focus && { focus: session.focus }),
          ...(session.favorite && { favorite: true }),
          exercises,
          completed: done,
          ...(done && { duration: Math.max(1, Math.round(totalSets * 1.5)) }),
          performedAt: logDate,
          // This screen only ever plans or backfills — the live view is what
          // "starting" means. Marking a not-done save `started: false` keeps
          // a same-day/future plan from showing as an in-progress workout
          // (see IWorkoutLog.startedAt) until it's actually opened live.
          started: done,
          tz: new Date().getTimezoneOffset(),
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to save session')
      if (done) {
        clearQuickProgress(session.sessionId)
        clearQuickSession(session.sessionId)
      }
      router.push(done ? '/dashboard/history' : '/dashboard/workout/hub?tab=sessions')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to save session'
      setLogError(message)
      throw new Error(message)
    } finally {
      setLogging(false)
    }
  }

  const logAsDone = () => {
    if (!session) return
    if (shouldPromptForQuickSessionName(session)) {
      setShowNamePrompt(true)
      return
    }
    void saveLog(session.title, true).catch(() => {})
  }

  const planForLater = () => {
    if (!session) return
    void saveLog(session.title, false).catch(() => {})
  }

  // Apply an edit: always update the local stash (that is what Start workout and
  // "Log it" read), and additionally write back to the server log when this
  // session already exists there.
  const saveEdit = async ({ title, exercises }: { title: string; exercises: DraftExercise[] }) => {
    if (!session) return
    setSavingEdit(true)
    setEditError(null)
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
            needsName: false,
            ...(session.focus && { focus: session.focus }),
            // Still a plan, not a performed workout — no performedAt, so the
            // route leaves the scheduled date exactly where it was.
            exercises: buildLoggedExercises(exercises, false),
            completed: false,
            tz: new Date().getTimezoneOffset(),
          }),
        })
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || 'Failed to save changes')
      } else {
        // A completed session is reopened under a fresh id so starting it again
        // cannot overwrite history. Its source id is retained solely so a
        // rename can update the original log without touching its recorded
        // exercises, date, or completion state.
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        await persistSourceQuickSessionRename({ session, title, token })
      }
      // Commit the local draft only after any required server write succeeds;
      // a failed request must not look saved after a reload.
      const next = updateQuickSession(session.sessionId, { title, exercises })
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
    setHasStarted(startedFromHref || !!(sessionId && readQuickProgress(sessionId)))
  }, [sessionId, startedFromHref])

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

        {/* Log / plan date panel — revealed by the header button. A past date
            can only be logged, a future date can only be planned, and today
            offers both. */}
        {logOpen && !editing && (
          <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {canLog && canPlan ? 'Log or schedule this for' : canPlan ? 'Plan this session for' : 'When did you do this?'}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
              />
              {canLog && (
                <button
                  onClick={logAsDone}
                  disabled={logging}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  <Check className="h-4 w-4" /> {logging ? 'Saving…' : 'Log it'}
                </button>
              )}
              {canPlan && (
                <button
                  onClick={planForLater}
                  disabled={logging}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200"
                >
                  <CalendarClock className="h-4 w-4" /> {logging ? 'Saving…' : 'Plan it'}
                </button>
              )}
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

      {/* Start/continue CTA — pinned above the floating BottomNav (bottom-28 contract).
          Hidden while editing so it can't sit on top of the editor's Save row. */}
      <div className={`fixed bottom-28 left-0 right-0 z-30 px-4 ${editing ? 'hidden' : ''}`}>
        <button
          onClick={() => router.push(quickSessionLiveHref(session.sessionId))}
          className="mx-auto flex w-full max-w-2xl items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3 text-sm font-semibold text-white shadow-lg shadow-green-600/25 transition-all hover:from-green-700 hover:to-green-600"
        >
          <Play className="h-4 w-4 fill-current" /> {hasStarted ? 'Continue workout' : 'Start workout'}
        </button>
      </div>

      {showNamePrompt && (
        <QuickSessionNamePrompt
          initialName={session.title}
          confirmLabel="Save name & log"
          onConfirm={(title) => saveLog(title, true)}
          onCancel={() => setShowNamePrompt(false)}
        />
      )}
    </PageTransition>
  )
}
