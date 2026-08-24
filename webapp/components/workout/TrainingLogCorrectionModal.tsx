'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, Check, Pencil, X } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'

export interface EditableWorkoutSet {
  setNumber: number
  reps: number | null
  weight: number | null
  duration: number | null
  distance: number | null
  speed: number | null
  completed: boolean
}

export interface EditableWorkoutExercise {
  name: string
  slug?: string
  sets: EditableWorkoutSet[]
}

export interface EditableWorkout {
  rawDate: string
  date: string
  kind: 'program' | 'quick'
  sessionId?: string
  programId?: string
  day: string
  title?: string
  duration?: number
  notes?: string
  exercises: EditableWorkoutExercise[]
}

type NumericField = 'reps' | 'weight' | 'duration' | 'distance' | 'speed'

const FIELD_LABELS: Record<NumericField, string> = {
  reps: 'reps',
  weight: 'weight',
  duration: 'duration',
  distance: 'distance',
  speed: 'speed',
}

const FIELD_UNITS: Partial<Record<NumericField, string>> = {
  weight: 'lb',
  duration: 'sec',
  distance: 'm',
  speed: 'mph',
}

function cloneWorkout(workout: EditableWorkout): EditableWorkout {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({ ...set })),
    })),
  }
}

function displayValue(value: number | null, field: NumericField): string {
  if (value === null) return 'empty'
  return `${value}${FIELD_UNITS[field] ? ` ${FIELD_UNITS[field]}` : ''}`
}

export default function TrainingLogCorrectionModal({
  workout,
  onClose,
  onSaved,
}: {
  workout: EditableWorkout
  onClose: () => void
  onSaved: () => void | Promise<void>
}) {
  const [draft, setDraft] = useState(() => cloneWorkout(workout))
  const [reviewing, setReviewing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const changes = useMemo(() => {
    const out: string[] = []
    if (workout.kind === 'quick' && (draft.title ?? '').trim() !== (workout.title ?? workout.day).trim()) {
      out.push(`Title: “${workout.title ?? workout.day}” → “${draft.title?.trim() || 'Untitled'}”`)
    }
    if ((draft.duration ?? null) !== (workout.duration ?? null)) {
      out.push(`Duration: ${workout.duration ?? 'empty'} → ${draft.duration ?? 'empty'} min`)
    }
    if ((draft.notes ?? '').trim() !== (workout.notes ?? '').trim()) out.push('Workout notes changed')

    for (let exerciseIndex = 0; exerciseIndex < draft.exercises.length; exerciseIndex += 1) {
      const nextExercise = draft.exercises[exerciseIndex]
      const priorExercise = workout.exercises[exerciseIndex]
      for (let setIndex = 0; setIndex < nextExercise.sets.length; setIndex += 1) {
        const nextSet = nextExercise.sets[setIndex]
        const priorSet = priorExercise.sets[setIndex]
        if (!priorSet) continue
        for (const field of Object.keys(FIELD_LABELS) as NumericField[]) {
          if (nextSet[field] !== priorSet[field]) {
            out.push(`${nextExercise.name} · Set ${setIndex + 1} ${FIELD_LABELS[field]}: ${displayValue(priorSet[field], field)} → ${displayValue(nextSet[field], field)}`)
          }
        }
        if (nextSet.completed !== priorSet.completed) {
          out.push(`${nextExercise.name} · Set ${setIndex + 1}: ${priorSet.completed ? 'counted' : 'not counted'} → ${nextSet.completed ? 'counted' : 'not counted'}`)
        }
      }
    }
    return out
  }, [draft, workout])

  const updateSet = (exerciseIndex: number, setIndex: number, field: NumericField, raw: string) => {
    const value = raw === '' ? null : Number(raw)
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, ei) => ei !== exerciseIndex ? exercise : {
        ...exercise,
        sets: exercise.sets.map((set, si) => si !== setIndex ? set : { ...set, [field]: value }),
      }),
    }))
    setReviewing(false)
    setError(null)
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const token = getToken()
      const locator = workout.kind === 'quick'
        ? { kind: 'quick', sessionId: workout.sessionId, date: workout.rawDate }
        : { kind: 'program', programId: workout.programId, day: workout.day, date: workout.rawDate }
      const response = await fetch('/api/workouts/logs', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          locator,
          correction: {
            ...(workout.kind === 'quick' ? { title: draft.title?.trim() || draft.day } : {}),
            duration: draft.duration,
            notes: draft.notes ?? '',
            exercises: draft.exercises.map((exercise) => ({
              name: exercise.name,
              exerciseSlug: exercise.slug,
              sets: exercise.sets,
            })),
          },
        }),
      })
      const data = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setError(data.error ?? 'Could not save this correction')
        setReviewing(false)
        return
      }
      await onSaved()
    } catch {
      setError('Network error — your original log is unchanged')
      setReviewing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4" onClick={() => !saving && onClose()}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
          <div>
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-green-600 dark:text-green-400" />
              <h2 className="text-base font-bold text-zinc-900 dark:text-white">Correct workout log</h2>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{workout.title || workout.day} · {workout.date}</p>
          </div>
          <button type="button" aria-label="Close correction editor" disabled={saving} onClick={onClose} className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 disabled:opacity-40 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {workout.kind === 'quick' && (
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Session title
                <input value={draft.title ?? draft.day} maxLength={80} onChange={(event) => { setDraft({ ...draft, title: event.target.value }); setReviewing(false) }} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
              </label>
            )}
            <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Duration (minutes)
              <input type="number" inputMode="numeric" min="0" max="1440" value={draft.duration ?? ''} onChange={(event) => { setDraft({ ...draft, duration: event.target.value === '' ? undefined : Number(event.target.value) }); setReviewing(false) }} className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Notes
            <textarea value={draft.notes ?? ''} maxLength={2000} rows={2} onChange={(event) => { setDraft({ ...draft, notes: event.target.value }); setReviewing(false) }} className="mt-1.5 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white" />
          </label>

          <div className="space-y-3">
            {draft.exercises.map((exercise, exerciseIndex) => {
              const hasDuration = exercise.sets.some((set) => set.duration !== null)
              const hasDistance = exercise.sets.some((set) => set.distance !== null)
              const hasSpeed = exercise.sets.some((set) => set.speed !== null)
              const hasReps = exercise.sets.some((set) => set.reps !== null) || (!hasDuration && !hasDistance)
              const hasWeight = exercise.sets.some((set) => set.weight !== null) || hasReps
              const fields = ([hasReps && 'reps', hasWeight && 'weight', hasDuration && 'duration', hasDistance && 'distance', hasSpeed && 'speed'].filter(Boolean)) as NumericField[]
              return (
                <section key={`${exercise.slug ?? exercise.name}-${exerciseIndex}`} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">{exercise.name}</h3>
                  <div className="mt-2 space-y-2">
                    {exercise.sets.map((set, setIndex) => (
                      <div key={setIndex} className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Set {setIndex + 1}</span>
                          <label className="inline-flex min-h-8 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <input type="checkbox" checked={set.completed} onChange={(event) => {
                              setDraft((current) => ({ ...current, exercises: current.exercises.map((item, ei) => ei !== exerciseIndex ? item : { ...item, sets: item.sets.map((entry, si) => si !== setIndex ? entry : { ...entry, completed: event.target.checked }) }) }))
                              setReviewing(false)
                            }} className="h-4 w-4 accent-green-600" />
                            Count set
                          </label>
                        </div>
                        <div className={`grid gap-2 ${fields.length > 2 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2'}`}>
                          {fields.map((field) => (
                            <label key={field} className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              {FIELD_LABELS[field]}{FIELD_UNITS[field] ? ` (${FIELD_UNITS[field]})` : ''}
                              <input type="number" inputMode="decimal" min="0" step={field === 'reps' ? '1' : 'any'} value={set[field] ?? ''} onChange={(event) => updateSet(exerciseIndex, setIndex, field, event.target.value)} className="mt-1 w-full rounded-md border border-zinc-200 bg-white px-2 py-2 text-sm font-medium normal-case text-zinc-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white" />
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )
            })}
          </div>

          {reviewing && changes.length > 0 && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-100">Confirm these corrections</p>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-200">Saving rewrites this workout and recalculates personal records from your completed history.</p>
                </div>
              </div>
              <ul className="mt-2 space-y-1 border-t border-amber-200 pt-2 text-xs text-amber-900 dark:border-amber-800 dark:text-amber-100">
                {changes.slice(0, 6).map((change) => <li key={change}>• {change}</li>)}
                {changes.length > 6 && <li>• Plus {changes.length - 6} more changes</li>}
              </ul>
            </div>
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

          <div className="flex gap-3 pb-[max(0px,env(safe-area-inset-bottom))]">
            <button type="button" disabled={saving} onClick={reviewing ? () => setReviewing(false) : onClose} className="flex-1 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              {reviewing ? 'Keep editing' : 'Cancel'}
            </button>
            <button
              type="button"
              disabled={saving || changes.length === 0}
              onClick={reviewing ? save : () => { setReviewing(true); setError(null) }}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-40 ${reviewing ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {saving ? 'Saving…' : reviewing ? <><Check className="h-4 w-4" /> Confirm & save</> : 'Review correction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
