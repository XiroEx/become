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
  coverParallax?: boolean
  coverZoom?: number
  coverPositionX?: number
  coverPositionY?: number
}

function CoverImageEditor({
  programId,
  initialUrl,
  initialParallax,
  initialZoom,
  initialPositionX,
  initialPositionY,
}: {
  programId: string
  initialUrl?: string
  initialParallax?: boolean
  initialZoom?: number
  initialPositionX?: number
  initialPositionY?: number
}) {
  const [coverUrl, setCoverUrl] = useState<string | undefined>(initialUrl)
  const [parallax, setParallax] = useState<boolean>(!!initialParallax)
  const [parallaxSaving, setParallaxSaving] = useState(false)
  const [zoom, setZoom] = useState<number>(initialZoom ?? 1)
  const [posX, setPosX] = useState<number>(initialPositionX ?? 50)
  const [posY, setPosY] = useState<number>(initialPositionY ?? 50)
  const [framingSaving, setFramingSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const framingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function toggleParallax(next: boolean) {
    setParallax(next)
    setParallaxSaving(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ coverParallax: next }),
      })
      if (!res.ok) {
        const parsed = await res.json().catch(() => ({}))
        throw new Error(parsed.error || `Save failed (HTTP ${res.status})`)
      }
    } catch (err) {
      setParallax(!next) // revert
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setParallaxSaving(false)
    }
  }

  // Debounced PATCH of zoom + position (sliders fire constantly during drag)
  function scheduleFramingSave(next: { zoom: number; x: number; y: number }) {
    if (framingTimer.current) clearTimeout(framingTimer.current)
    framingTimer.current = setTimeout(async () => {
      setFramingSaving(true)
      setError(null)
      try {
        const token = localStorage.getItem('token')
        const res = await fetch(`/api/programs/${encodeURIComponent(programId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            coverZoom: next.zoom,
            coverPositionX: next.x,
            coverPositionY: next.y,
          }),
        })
        if (!res.ok) {
          const parsed = await res.json().catch(() => ({}))
          throw new Error(parsed.error || `Save failed (HTTP ${res.status})`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setFramingSaving(false)
      }
    }, 400)
  }

  function resetFraming() {
    setZoom(1); setPosX(50); setPosY(50)
    scheduleFramingSave({ zoom: 1, x: 50, y: 50 })
  }

  async function handleUpload(file: File) {
    if (file.size === 0) {
      setError('That file is empty (0 bytes). Pick a different image.')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      setError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 25MB.`)
      return
    }
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
      // Server may return non-JSON on framework errors — parse defensively.
      const text = await res.text()
      let parsed: { error?: string; coverImage?: string } = {}
      try { parsed = JSON.parse(text) } catch { /* ignore */ }
      if (!res.ok) {
        throw new Error(parsed.error || `Upload failed (HTTP ${res.status})`)
      }
      if (parsed.coverImage) setCoverUrl(parsed.coverImage)
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

      {/* Preview — reflects current zoom/position so the admin can frame it
          before saving. Aspect ratio matches the program hero (roughly). */}
      <div
        className="relative mb-4 flex h-56 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-100 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600"
        onClick={() => inputRef.current?.click()}
      >
        {coverUrl ? (
          <>
            <img
              src={coverUrl}
              alt="Program cover"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: `${posX}% ${posY}%`,
                objectPosition: `${posX}% ${posY}%`,
              }}
            />
            <div className="absolute inset-0 bg-black/20" />
            <span className="relative rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">Click to replace</span>
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

      {/* Framing controls — only meaningful when an image is set */}
      {coverUrl && (
        <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/50">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white">
              Framing {framingSaving && <span className="ml-1 text-xs font-normal text-zinc-400">saving…</span>}
            </div>
            <button
              type="button"
              onClick={resetFraming}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              Reset
            </button>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Zoom</span>
              <span className="font-mono tabular-nums">{zoom.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min={1}
              max={2.5}
              step={0.05}
              value={zoom}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setZoom(v)
                scheduleFramingSave({ zoom: v, x: posX, y: posY })
              }}
              className="w-full accent-zinc-900 dark:accent-white"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Horizontal</span>
              <span className="font-mono tabular-nums">{Math.round(posX)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={posX}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setPosX(v)
                scheduleFramingSave({ zoom, x: v, y: posY })
              }}
              className="w-full accent-zinc-900 dark:accent-white"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-400">
              <span>Vertical</span>
              <span className="font-mono tabular-nums">{Math.round(posY)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={posY}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                setPosY(v)
                scheduleFramingSave({ zoom, x: posX, y: v })
              }}
              className="w-full accent-zinc-900 dark:accent-white"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 border-t border-zinc-200 pt-3 dark:border-zinc-700">
            <input
              type="checkbox"
              checked={parallax}
              disabled={parallaxSaving}
              onChange={(e) => toggleParallax(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-zinc-900 dark:accent-white"
            />
            <div>
              <div className="text-sm font-medium text-zinc-900 dark:text-white">
                Parallax scroll {parallaxSaving && <span className="ml-1 text-xs text-zinc-400">saving…</span>}
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                The cover image drifts at a different speed as the user scrolls down the program page.
              </div>
            </div>
          </label>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  )
}

export default function EditProgramClient({ programId }: { programId: string }) {
  const [initial, setInitial] = useState<InitialProgram | null>(null)
  const [coverImage, setCoverImage] = useState<string | undefined>(undefined)
  const [coverParallax, setCoverParallax] = useState<boolean>(false)
  const [coverZoom, setCoverZoom] = useState<number>(1)
  const [coverPositionX, setCoverPositionX] = useState<number>(50)
  const [coverPositionY, setCoverPositionY] = useState<number>(50)
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
        setCoverParallax(!!data.coverParallax)
        setCoverZoom(typeof data.coverZoom === 'number' ? data.coverZoom : 1)
        setCoverPositionX(typeof data.coverPositionX === 'number' ? data.coverPositionX : 50)
        setCoverPositionY(typeof data.coverPositionY === 'number' ? data.coverPositionY : 50)
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
      <CoverImageEditor
        programId={programId}
        initialUrl={coverImage}
        initialParallax={coverParallax}
        initialZoom={coverZoom}
        initialPositionX={coverPositionX}
        initialPositionY={coverPositionY}
      />
      <ProgramCreator mode="edit" programId={programId} initialProgram={initial} />
    </>
  )
}
