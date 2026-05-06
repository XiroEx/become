'use client'

import { useEffect, useState } from 'react'
import ProgramCreator from '../../_editors/ProgramCreator'
import type { Phase, TargetUserLevel } from '@/lib/data/programs'

interface InitialProgram {
  name: string
  description: string
  duration_weeks: number
  training_days_per_week: number
  goal: string
  target_user: TargetUserLevel
  equipment: string[]
  phases: Phase[]
}

interface RawProgram {
  name?: string
  description?: string
  duration_weeks?: number
  training_days_per_week?: number
  goal?: string
  target_user?: string
  equipment?: string[]
  phases?: Phase[]
}

export default function EditProgramClient({ programId }: { programId: string }) {
  const [initial, setInitial] = useState<InitialProgram | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
        if (!res.ok) {
          throw new Error(`Failed to load program (${res.status})`)
        }
        const data = (await res.json()) as RawProgram
        if (cancelled) return
        setInitial({
          name: data.name ?? '',
          description: data.description ?? '',
          duration_weeks: data.duration_weeks ?? 4,
          training_days_per_week: data.training_days_per_week ?? 4,
          goal: data.goal ?? '',
          target_user: (data.target_user as TargetUserLevel) ?? 'Intermediate',
          equipment: data.equipment ?? [],
          phases: data.phases ?? [],
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [programId])

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

  return <ProgramCreator mode="edit" programId={programId} initialProgram={initial} />
}
