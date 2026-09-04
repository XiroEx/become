'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import ExerciseForm, { ExerciseFormValue, EMPTY_EXERCISE } from '../../_form/ExerciseForm'
import type { ExerciseIssue } from '@/lib/exerciseAudit'

export default function EditExerciseClient({ slug }: { slug: string }) {
  const [initial, setInitial] = useState<ExerciseFormValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issues, setIssues] = useState<ExerciseIssue[]>([])
  const [issuesOpen, setIssuesOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/exercises/${encodeURIComponent(slug)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          throw new Error(`Failed to load exercise (${res.status})`)
        }
        const data = (await res.json()) as { exercise: Partial<ExerciseFormValue> }
        if (cancelled) return
        setInitial({
          ...EMPTY_EXERCISE,
          ...data.exercise,
          // Ensure array fields default to []
          aliases: data.exercise.aliases ?? [],
          movementPatterns: data.exercise.movementPatterns ?? [],
          primaryMuscles: data.exercise.primaryMuscles ?? [],
          secondaryMuscles: data.exercise.secondaryMuscles ?? [],
          stabilizers: data.exercise.stabilizers ?? [],
          equipment: data.exercise.equipment ?? [],
          optionalEquipment: data.exercise.optionalEquipment ?? [],
          instructions: data.exercise.instructions ?? [],
          cues: data.exercise.cues ?? [],
          commonMistakes: data.exercise.commonMistakes ?? [],
          prerequisites: data.exercise.prerequisites ?? [],
          variations: data.exercise.variations ?? [],
          alternatives: data.exercise.alternatives ?? [],
          tags: data.exercise.tags ?? [],
        } as ExerciseFormValue)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [slug])

  // Non-critical — the audit banner explains why this exercise was flagged,
  // it isn't load-bearing for the edit form itself, so a failure here is
  // silently swallowed rather than blocking the page.
  useEffect(() => {
    let cancelled = false
    async function loadIssues() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/admin/exercises/${encodeURIComponent(slug)}/issues`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) return
        const data = (await res.json()) as { issues: ExerciseIssue[] }
        if (!cancelled) setIssues(data.issues ?? [])
      } catch {
        // ignore
      }
    }
    void loadIssues()
    return () => {
      cancelled = true
    }
  }, [slug])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    )
  }

  if (!initial) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
      </div>
    )
  }

  return (
    <>
      {issues.length > 0 && (
        <div className="mx-auto mb-4 max-w-3xl px-4">
          <button
            type="button"
            onClick={() => setIssuesOpen((v) => !v)}
            className="flex w-full items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900/60"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">
              Flagged by the exercise audit — {issues.length} issue{issues.length === 1 ? '' : 's'} found
            </span>
            {issuesOpen ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
          </button>
          {issuesOpen && (
            <ul className="mt-2 space-y-1.5 rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-zinc-900 dark:text-amber-200">
              {issues.map((issue) => (
                <li key={issue.type} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ExerciseForm mode="edit" originalSlug={slug} initialValue={initial} />
    </>
  )
}
