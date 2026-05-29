'use client'

import Link from 'next/link'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import type {
  Suggestion,
  SuggestionSeverity,
} from '@/lib/suggestions/types'

export interface SuggestionCardProps {
  suggestion: Suggestion
  /** Optional override — useful for tests / Storybook to bypass the real
   *  /api/suggestions/dismiss POST. */
  onDismiss?: (id: string) => Promise<void> | void
  className?: string
}

const SEVERITY_STYLES: Record<
  SuggestionSeverity,
  { wrapper: string; badge: string; label: string }
> = {
  info: {
    wrapper: 'bg-zinc-900/60 ring-zinc-500/30',
    badge: 'bg-zinc-700 text-zinc-100',
    label: 'Info',
  },
  nudge: {
    wrapper: 'bg-amber-950/40 ring-amber-500/40',
    badge: 'bg-amber-500 text-amber-950',
    label: 'Nudge',
  },
  warning: {
    wrapper: 'bg-rose-950/40 ring-rose-500/40',
    badge: 'bg-rose-500 text-rose-950',
    label: 'Warning',
  },
  celebration: {
    wrapper: 'bg-emerald-950/40 ring-emerald-500/40',
    badge: 'bg-emerald-400 text-emerald-950',
    label: 'Celebration',
  },
}

async function defaultDismiss(id: string): Promise<void> {
  const token =
    typeof window !== 'undefined' ? window.localStorage?.getItem('token') : null
  await fetch('/api/suggestions/dismiss', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ id }),
  })
}

export function SuggestionCard({
  suggestion,
  onDismiss,
  className,
}: SuggestionCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const styles = SEVERITY_STYLES[suggestion.severity]

  if (dismissed) return null

  async function handleDismiss() {
    // Optimistic hide — restore only if the network call fails.
    setDismissed(true)
    try {
      await (onDismiss ?? defaultDismiss)(suggestion.id)
    } catch (err) {
      console.error('SuggestionCard: dismiss failed', err)
      setDismissed(false)
    }
  }

  return (
    <article
      role="region"
      aria-label={`${styles.label} suggestion: ${suggestion.title}`}
      data-testid="suggestion-card"
      data-suggestion-id={suggestion.id}
      data-severity={suggestion.severity}
      className={cn(
        'rounded-xl ring-1 p-3',
        styles.wrapper,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center gap-2">
            <span
              data-testid="suggestion-badge"
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                styles.badge,
              )}
            >
              {styles.label}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-100">
            {suggestion.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-300">{suggestion.body}</p>
          {suggestion.primaryAction && (
            <Link
              href={suggestion.primaryAction.href}
              data-testid="suggestion-primary-action"
              className="mt-2 inline-block rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-900 hover:bg-white"
            >
              {suggestion.primaryAction.label}
            </Link>
          )}
        </div>
        {suggestion.dismissible && (
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="suggestion-dismiss"
            aria-label={`Dismiss ${suggestion.title}`}
            className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
      </div>
    </article>
  )
}
