'use client'

// Lightweight read-only summary of a completed quick session — the exact
// exercises + logged sets. Self-fetches by sessionId. Shown as a bottom sheet
// from the calendar / history.

import { useEffect, useState } from 'react'
import { X, Sparkles, Clock, Calendar } from 'lucide-react'

interface SessionSet {
  setNumber?: number
  reps?: number | null
  weight?: number | null
  duration?: number | null
  completed?: boolean
}
interface SessionExercise { name: string; sets: SessionSet[] }
interface QuickSession {
  title: string
  date: string
  completed: boolean
  duration?: number
  exercises: SessionExercise[]
}

function setLabel(s: SessionSet): string {
  const parts: string[] = []
  if (s.reps != null) parts.push(`${s.reps} reps`)
  if (s.weight != null && s.weight > 0) parts.push(`${s.weight} lb`)
  if (s.duration != null && s.duration > 0) parts.push(`${s.duration}s`)
  return parts.length ? parts.join(' · ') : '—'
}

export default function QuickSessionSummary({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [session, setSession] = useState<QuickSession | null | undefined>(undefined)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/workouts/session?id=${encodeURIComponent(sessionId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        const data = res.ok ? await res.json() : null
        if (alive) setSession(data?.session ?? null)
      } catch {
        if (alive) setSession(null)
      }
    })()
    return () => { alive = false }
  }, [sessionId])

  const totalSets = session?.exercises.reduce((n, e) => n + e.sets.filter((s) => s.completed).length, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 pb-8 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-base font-bold text-zinc-900 dark:text-white">{session?.title ?? 'Session'}</h3>
              {session && (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <span>{totalSets} sets logged</span>
                  {session.duration ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{session.duration} min</span> : null}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-full bg-zinc-100 p-1.5 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        {session === undefined ? (
          <p className="py-6 text-center text-sm text-zinc-400">Loading…</p>
        ) : session === null ? (
          <p className="py-6 text-center text-sm text-zinc-400">This session isn&apos;t available.</p>
        ) : (
          <div className="space-y-3">
            {session.exercises.map((ex, i) => (
              <div key={i} className="rounded-xl border border-zinc-100 p-3 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{ex.name}</p>
                <div className="mt-1.5 space-y-1">
                  {ex.sets.map((s, j) => (
                    <div key={j} className="flex items-center justify-between text-xs">
                      <span className="text-zinc-400">Set {s.setNumber ?? j + 1}</span>
                      <span className={s.completed ? 'font-medium text-zinc-700 dark:text-zinc-300' : 'text-zinc-400 line-through'}>{setLabel(s)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
