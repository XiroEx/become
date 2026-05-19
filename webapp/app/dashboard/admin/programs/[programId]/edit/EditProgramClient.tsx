'use client'

import { useEffect, useRef, useState } from 'react'
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
  coverImage?: string
}

function CoverImageEditor({ programId, initialUrl }: { programId: string; initialUrl?: string }) {
  const [coverUrl, setCoverUrl] = useState<string | undefined>(initialUrl)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleUpload(file: File) {
    setUploading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const form = new FormData()
      form.append('image', file)
      const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload failed')
      setCoverUrl(data.coverImage)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove() {
    setRemoving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/programs/${encodeURIComponent(programId)}/image`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Remove failed')
      }
      setCoverUrl(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-1 text-base font-semibold text-zinc-900 dark:text-white">Cover Image</h2>
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Displayed as the hero background on the program overview page.
      </p>

      {/* Preview */}
      <div
        className="relative mb-4 flex h-44 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-100 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
        onClick={() => inputRef.current?.click()}
      >
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt="Program cover"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-black/30" />
            <span className="relative text-sm font-medium text-white">Click to replace</span>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400 dark:text-zinc-500">
            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm">Click to upload cover image</span>
            <span className="text-xs">Recommended: 1600×900, JPG/PNG/HEIC</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleUpload(file)
          e.target.value = ''
        }}
      />

      <div className="flex gap-2">
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {uploading ? 'Uploading…' : coverUrl ? 'Replace Image' : 'Upload Image'}
        </button>
        {coverUrl && (
          <button
            onClick={handleRemove}
            disabled={removing}
            className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            {removing ? 'Removing…' : 'Remove'}
          </button>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

export default function EditProgramClient({ programId }: { programId: string }) {
  const [initial, setInitial] = useState<InitialProgram | null>(null)
  const [coverImage, setCoverImage] = useState<string | undefined>(undefined)
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
        setCoverImage(data.coverImage)
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

  return (
    <>
      <CoverImageEditor programId={programId} initialUrl={coverImage} />
      <ProgramCreator mode="edit" programId={programId} initialProgram={initial} />
    </>
  )
}
