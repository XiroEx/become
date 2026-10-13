'use client'

// A plain "are you sure" for the workout views.
//
// Used where a tap during a session throws work away — removing an exercise
// that already has sets logged against it. Anything that costs nothing to undo
// should not come through here; a confirm on every tap trains people to tap
// through confirms.

import { AlertTriangle } from 'lucide-react'

export interface ConfirmModalProps {
  open: boolean
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  tone?: 'dark' | 'app'
  /** Red confirm button for a destructive action. */
  destructive?: boolean
}

export default function ConfirmModal({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  tone = 'app',
  destructive = false,
}: ConfirmModalProps) {
  if (!open) return null
  const dark = tone === 'dark'
  const surface = dark
    ? 'bg-zinc-950 text-white ring-1 ring-white/10'
    : 'bg-white text-zinc-900 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-white dark:ring-zinc-800'
  const muted = dark ? 'text-white/60' : 'text-zinc-500 dark:text-zinc-400'
  const ghost = dark
    ? 'bg-white/10 text-white hover:bg-white/20'
    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700'
  const confirm = destructive
    ? 'bg-red-500 text-white hover:bg-red-600'
    : 'bg-green-500 text-white hover:bg-green-600'

  return (
    <div className="fixed inset-0 z-[85] flex items-end justify-center sm:items-center" data-testid="confirm-modal">
      <button aria-label={cancelLabel} onClick={onCancel} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className={`relative w-full rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-w-sm sm:rounded-3xl ${surface}`}>
        <div className="mb-4 flex items-start gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${destructive ? 'bg-red-500/15 text-red-500' : 'bg-amber-500/15 text-amber-500'}`}>
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">{title}</h2>
            {body && <p className={`mt-1 text-sm leading-snug ${muted}`}>{body}</p>}
          </div>
        </div>
        <button
          onClick={onConfirm}
          data-testid="confirm-modal-confirm"
          className={`mb-2 w-full rounded-xl py-3 text-sm font-bold transition-colors ${confirm}`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          data-testid="confirm-modal-cancel"
          className={`w-full rounded-xl py-3 text-sm font-semibold transition-colors ${ghost}`}
        >
          {cancelLabel}
        </button>
      </div>
    </div>
  )
}
