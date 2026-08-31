'use client'

// Edit a saved / drafted session: rename it, retune sets and reps, reorder,
// remove, and add exercises. Sessions were previously read-only once created —
// the only way to change one was to throw it away and generate another.
//
// Deliberately edits a LOCAL copy and hands the result back on Save, so Cancel
// is a real cancel and the caller owns persistence (localStorage for a draft,
// plus the server for a session that already exists there).

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Layers, Plus, Search, Trash2, Unlink, X } from 'lucide-react'
import type { DraftExercise } from '@/lib/quickSession/types'
import { groupIndexes, sanitizeGroups, ungroupAt } from '@/lib/workout/buildAsYouGo'
import { setUnitLabel } from '@/lib/workout/tracking'

interface SearchExercise {
  slug: string
  name: string
  trackingType: string
  /** Drives per-DB/KB weight logging once added — see lib/workout/dumbbellWeight.ts. */
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
}

export interface SessionEditorProps {
  title: string
  exercises: DraftExercise[]
  onSave: (next: { title: string; exercises: DraftExercise[] }) => void | Promise<void>
  onCancel: () => void
  /** Shown under the buttons — e.g. "Saved to your plan". */
  saveLabel?: string
  saving?: boolean
  error?: string | null
}

function stripGroup(ex: DraftExercise): DraftExercise {
  const next = { ...ex }
  delete next.groupId
  delete next.groupType
  delete next.groupLabel
  delete next.groupRest
  delete next.groupRounds
  return next
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SessionEditor({
  title,
  exercises,
  onSave,
  onCancel,
  saveLabel = 'Save changes',
  saving = false,
  error = null,
}: SessionEditorProps) {
  const [draftTitle, setDraftTitle] = useState(title)
  const [rows, setRows] = useState<DraftExercise[]>(exercises)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchExercise[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState(false)
  const searchSeq = useRef(0)

  // Debounced exercise search for the "add" picker. The sequence guard drops a
  // slow response that resolves after a newer query has already landed.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    const seq = ++searchSeq.current
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`, {
          headers: authHeaders(),
        })
        const data = (await res.json()) as { exercises?: SearchExercise[] }
        if (seq === searchSeq.current) setResults(data.exercises ?? [])
      } catch {
        if (seq === searchSeq.current) setResults([])
      } finally {
        if (seq === searchSeq.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  const patchRow = (i: number, patch: Partial<DraftExercise>) =>
    setRows((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex)))

  const removeRow = (i: number) =>
    setRows((prev) => {
      const gid = prev[i]?.groupId
      const next = prev.filter((_, idx) => idx !== i)
      // A superset of one is not a superset.
      if (gid && next.filter((e) => e.groupId === gid).length < 2) {
        return next.map((e) => (e.groupId === gid ? stripGroup(e) : e))
      }
      return next
    })

  /** Superset this exercise with the one below it — or break the group up. */
  const toggleGroup = (i: number) =>
    setRows((prev) => {
      const row = prev[i]
      if (!row) return prev
      if (row.groupId) return ungroupAt(prev, i).exercises
      if (i + 1 >= prev.length) return prev
      return groupIndexes(prev, [i, i + 1], 'superset').exercises
    })

  const moveRow = (i: number, delta: number) =>
    setRows((prev) => {
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      // Reordering can carry an exercise out of its superset — a group whose
      // members are no longer neighbours is not a group any more.
      return sanitizeGroups(next)
    })

  const addExercise = (ex: SearchExercise) => {
    const isTime = ex.trackingType === 'time'
    setRows((prev) => [
      ...prev,
      {
        exerciseSlug: ex.slug,
        name: ex.name,
        trackingType: ex.trackingType,
        sets: 3,
        reps: isTime ? '' : '8-12',
        ...(isTime ? { duration: '30' } : {}),
        ...(ex.equipment && { equipment: ex.equipment }),
        ...(ex.laterality && { laterality: ex.laterality }),
        ...(ex.movementPatterns && { movementPatterns: ex.movementPatterns }),
      },
    ])
    setQuery('')
    setResults([])
    setAdding(false)
  }

  const canSave = draftTitle.trim().length > 0 && rows.length > 0 && !saving

  return (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label
          htmlFor="session-title"
          className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400"
        >
          Session name
        </label>
        <input
          id="session-title"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base font-semibold text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
        />
      </div>

      {/* Exercises */}
      <div className="space-y-2">
        {rows.map((ex, i) => {
          const isTime = ex.trackingType === 'time'
          return (
            <div
              key={`${ex.exerciseSlug || ex.name}-${i}`}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                  {ex.groupId && (
                    <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                      {ex.groupLabel || 'Superset'}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {(ex.groupId || i + 1 < rows.length) && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(i)}
                      aria-label={ex.groupId ? `Break up the group containing ${ex.name}` : `Superset ${ex.name} with the next exercise`}
                      data-testid={`editor-group-toggle-${i}`}
                      className={`rounded-lg p-1.5 ${ex.groupId ? 'text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/40' : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800'}`}
                    >
                      {ex.groupId ? <Unlink className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => moveRow(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move ${ex.name} up`}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveRow(i, 1)}
                    disabled={i === rows.length - 1}
                    aria-label={`Move ${ex.name} down`}
                    className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    aria-label={`Remove ${ex.name}`}
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {setUnitLabel(ex.trackingType, ex.sets)}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    inputMode="numeric"
                    value={ex.sets}
                    onChange={(e) =>
                      patchRow(i, { sets: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })
                    }
                    aria-label={`${setUnitLabel(ex.trackingType, ex.sets)} for ${ex.name}`}
                    className="w-14 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                </label>
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {isTime ? 'Seconds' : 'Reps'}
                  <input
                    value={isTime ? (ex.duration ?? '') : ex.reps}
                    onChange={(e) =>
                      patchRow(i, isTime ? { duration: e.target.value } : { reps: e.target.value })
                    }
                    placeholder={isTime ? '30' : '8-12'}
                    aria-label={`${isTime ? 'Seconds' : 'Reps'} for ${ex.name}`}
                    className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                  />
                </label>
              </div>
            </div>
          )
        })}

        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
            No exercises left. Add at least one to save.
          </p>
        )}
      </div>

      {/* Add exercise */}
      {adding ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-zinc-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none dark:text-white"
            />
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setQuery('')
              }}
              aria-label="Cancel adding an exercise"
              className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {searching && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Searching…</p>}
          {!searching && query.trim().length >= 2 && results.length === 0 && (
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No matches.</p>
          )}
          <div className="mt-2 space-y-1">
            {results.map((r) => (
              <button
                key={r.slug}
                type="button"
                onClick={() => addExercise(r)}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0 truncate">{r.name}</span>
                <Plus className="h-4 w-4 shrink-0 text-zinc-400" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
        >
          <Plus className="h-4 w-4" /> Add exercise
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      {/* Save / cancel */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSave({ title: draftTitle.trim(), exercises: rows })}
          disabled={!canSave}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          <Check className="h-4 w-4" /> {saving ? 'Saving…' : saveLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 disabled:opacity-50 dark:bg-zinc-800 dark:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
