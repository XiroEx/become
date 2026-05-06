'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

interface VideoDoc {
  _id: string
  exerciseName: string
  videoUrl: string
  thumbnailUrl?: string | null
  isPlaceholder?: boolean
}

interface Props {
  /** The exercise's display name. ExerciseVideos key on `exerciseName`. */
  exerciseName: string
  /** Slug for filtered list lookup (matches videos by exact name + aliases). */
  exerciseSlug: string
}

export default function VideosEditor({ exerciseName, exerciseSlug }: Props) {
  const [videos, setVideos] = useState<VideoDoc[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ videoUrl: '', thumbnailUrl: '', isPlaceholder: true })
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams()
      if (exerciseSlug) params.set('exercise', exerciseSlug)
      const res = await fetch(`/api/exercise-videos?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        const data = (await res.json()) as { videos?: VideoDoc[] }
        setVideos(data.videos ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [exerciseSlug])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleAdd() {
    if (!draft.videoUrl.trim()) {
      setError('Video URL is required')
      return
    }
    if (!exerciseName.trim()) {
      setError('Exercise must have a name before adding a video')
      return
    }
    setAdding(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/exercise-videos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          exerciseName,
          videoUrl: draft.videoUrl.trim(),
          thumbnailUrl: draft.thumbnailUrl.trim() || null,
          isPlaceholder: draft.isPlaceholder,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Failed to add video')
      }
      setDraft({ videoUrl: '', thumbnailUrl: '', isPlaceholder: true })
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add video')
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this video?')) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/exercise-videos/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (res.ok) {
        setVideos((prev) => prev.filter((v) => v._id !== id))
      }
    } catch {
      // ignore
    }
  }

  return (
    <div>
      <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">
        Videos are stored in the separate <code>exercise_videos</code> collection and resolved by{' '}
        <code>exerciseName</code>. The primary video on the exercise itself takes priority for the
        workout UI.
      </p>

      {loading ? (
        <div className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
      ) : videos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          No linked videos yet.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {videos.map((v) => (
            <li key={v._id} className="flex items-center gap-3 bg-white px-3 py-2 dark:bg-zinc-900">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-zinc-900 dark:text-zinc-100">{v.videoUrl}</p>
                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {v.exerciseName}
                  {v.isPlaceholder ? ' · placeholder' : ''}
                  {v.thumbnailUrl ? ` · thumb: ${v.thumbnailUrl}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(v._id)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950 dark:hover:text-red-400"
                title="Delete video"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="mb-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">Add a video</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={draft.videoUrl}
            onChange={(e) => setDraft((d) => ({ ...d, videoUrl: e.target.value }))}
            placeholder="Video URL *"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <input
            type="text"
            value={draft.thumbnailUrl}
            onChange={(e) => setDraft((d) => ({ ...d, thumbnailUrl: e.target.value }))}
            placeholder="Thumbnail URL (optional)"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
          />
          <label className="col-span-full inline-flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={draft.isPlaceholder}
              onChange={(e) => setDraft((d) => ({ ...d, isPlaceholder: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300"
            />
            Placeholder (will be replaced once we capture a real demo)
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Plus className="h-3.5 w-3.5" />
            {adding ? 'Adding…' : 'Add video'}
          </button>
        </div>
      </div>
    </div>
  )
}
