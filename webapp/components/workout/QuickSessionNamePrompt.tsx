'use client'

import { FormEvent, useEffect, useId, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { isDefaultQuickSessionName } from '@/lib/quickSession/naming'

interface QuickSessionNamePromptProps {
  initialName?: string
  confirmLabel: string
  tone?: 'surface' | 'dark'
  onConfirm: (title: string) => void | Promise<void>
  onCancel: () => void
}

export default function QuickSessionNamePrompt({
  initialName = '',
  confirmLabel,
  tone = 'surface',
  onConfirm,
  onCancel,
}: QuickSessionNamePromptProps) {
  // Default product copy is not a useful editable starting value. An already
  // meaningful name is retained for defensive reuse of this component.
  const [title, setTitle] = useState(() => isDefaultQuickSessionName(initialName) ? '' : initialName.trim())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()
  const inputId = useId()
  const dark = tone === 'dark'

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel, saving])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next || isDefaultQuickSessionName(next) || saving) return
    setSaving(true)
    setError(null)
    try {
      await onConfirm(next)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the workout name')
      setSaving(false)
    }
  }

  const panel = dark
    ? 'border-zinc-800 bg-zinc-950 text-white'
    : 'border-zinc-200 bg-white text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white'
  const muted = dark ? 'text-zinc-400' : 'text-zinc-600 dark:text-zinc-400'
  const input = dark
    ? 'border-zinc-700 bg-zinc-900 text-white placeholder:text-zinc-600'
    : 'border-zinc-300 bg-white text-zinc-950 placeholder:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white dark:placeholder:text-zinc-500'

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6 ${panel}`}
      >
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
          <Dumbbell className="h-5 w-5" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-500">
          Save for next time
        </p>
        <h2 id={headingId} className="mt-1 text-xl font-bold tracking-tight">
          Name this workout
        </h2>
        <p className={`mt-1.5 text-sm leading-5 ${muted}`}>
          Give this session a name you&apos;ll recognize in your workout history.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold">
              Workout name
            </label>
            <input
              id={inputId}
              autoFocus
              maxLength={80}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Thursday Push"
              className={`w-full rounded-xl border px-3.5 py-3 text-base font-semibold outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 ${input}`}
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={!title.trim() || isDefaultQuickSessionName(title) || saving}
              className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : confirmLabel}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={onCancel}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                dark
                  ? 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
              }`}
            >
              Back
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
