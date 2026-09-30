'use client'

import { FormEvent, useCallback, useEffect, useId, useState } from 'react'
import { Dumbbell, X } from 'lucide-react'
import { isDefaultQuickSessionName } from '@/lib/quickSession/naming'

interface QuickSessionNamePromptProps {
  initialName?: string
  confirmLabel: string
  tone?: 'surface' | 'dark'
  /**
   * The name to save under when the member exits without typing one — the day
   * the work was actually done, e.g. "9/9/26 workout" (see
   * `fallbackQuickSessionName`). Supplied together with `onSkip`; with neither,
   * the prompt keeps its older shape where the only way past it is a name.
   */
  fallbackName?: string
  onConfirm: (title: string) => void | Promise<void>
  /**
   * Finish exactly as `onConfirm` would, but under `fallbackName`. Wired to the
   * close button and to Escape, because "let me out of this box" has to still
   * save the workout — being trapped here was losing finished sessions.
   */
  onSkip?: (title: string) => void | Promise<void>
  onCancel: () => void
}

export default function QuickSessionNamePrompt({
  initialName = '',
  confirmLabel,
  tone = 'surface',
  fallbackName,
  onConfirm,
  onSkip,
  onCancel,
}: QuickSessionNamePromptProps) {
  // Default product copy is not a useful editable starting value. An already
  // meaningful name is retained for defensive reuse of this component.
  const [title, setTitle] = useState(() => isDefaultQuickSessionName(initialName) ? '' : initialName.trim())
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()
  const inputId = useId()
  const dark = tone === 'dark'
  const busy = saving || skipping
  const canSkip = Boolean(onSkip && fallbackName)

  const skip = useCallback(async () => {
    if (!onSkip || !fallbackName || busy) return
    setSkipping(true)
    setError(null)
    try {
      await onSkip(fallbackName)
    } catch (cause) {
      // Only on failure: a success unmounts this, and clearing the flag first
      // would flash the buttons back to life on the way out.
      setError(cause instanceof Error ? cause.message : 'Could not save the workout')
      setSkipping(false)
    }
  }, [busy, fallbackName, onSkip])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return
      // Escape means "get me out of here". When there is a name to fall back
      // on that exit still finishes the workout; otherwise it is the old
      // return-to-the-workout.
      if (canSkip) void skip()
      else onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [busy, canSkip, onCancel, skip])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const next = title.trim()
    if (!next || isDefaultQuickSessionName(next) || busy) return
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
  const secondary = dark
    ? 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-4 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`relative w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6 ${panel}`}
      >
        {canSkip && (
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            aria-label={`Close and save as ${fallbackName}`}
            className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full transition disabled:opacity-50 ${muted} hover:bg-black/10 dark:hover:bg-white/10`}
          >
            <X className="h-5 w-5" />
          </button>
        )}
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
              disabled={!title.trim() || isDefaultQuickSessionName(title) || busy}
              className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : confirmLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className={`rounded-xl px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${secondary}`}
            >
              Back
            </button>
          </div>

          {canSkip && (
            <button
              type="button"
              disabled={busy}
              onClick={skip}
              className={`w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${muted} hover:underline`}
            >
              {skipping ? 'Saving…' : `Skip, save as “${fallbackName}”`}
            </button>
          )}
        </form>
      </section>
    </div>
  )
}
