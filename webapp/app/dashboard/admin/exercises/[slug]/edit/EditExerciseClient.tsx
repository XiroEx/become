'use client'

import { useEffect, useState } from 'react'
import ExerciseForm, { ExerciseFormValue, EMPTY_EXERCISE } from '../../_form/ExerciseForm'

export default function EditExerciseClient({ slug }: { slug: string }) {
  const [initial, setInitial] = useState<ExerciseFormValue | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return <ExerciseForm mode="edit" originalSlug={slug} initialValue={initial} />
}
