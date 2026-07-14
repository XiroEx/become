'use client'

import Link from 'next/link'
import { useState } from 'react'
import { X } from 'lucide-react'
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
  // Every severity needs BOTH a light and a dark treatment. These used to carry
  // only the dark values (e.g. `bg-amber-950/40`), which in light mode rendered a
  // translucent near-black amber — the muddy brown card with barely-legible text.
  info: {
    wrapper: 'bg-zinc-100 ring-zinc-300 dark:bg-zinc-900/60 dark:ring-zinc-500/30',
    badge: 'bg-zinc-700 text-white dark:bg-zinc-700 dark:text-zinc-100',
    label: 'Info',
  },
  nudge: {
    wrapper: 'bg-amber-50 ring-amber-300 dark:bg-amber-950/40 dark:ring-amber-500/40',
    badge: 'bg-amber-500 text-amber-950',
    label: 'Nudge',
  },
  warning: {
    wrapper: 'bg-rose-50 ring-rose-300 dark:bg-rose-950/40 dark:ring-rose-500/40',
    badge: 'bg-rose-500 text-white dark:text-rose-950',
    label: 'Warning',
  },
  celebration: {
    wrapper: 'bg-emerald-50 ring-emerald-300 dark:bg-emerald-950/40 dark:ring-emerald-500/40',
    badge: 'bg-emerald-500 text-white dark:bg-emerald-400 dark:text-emerald-950',
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
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {suggestion.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{suggestion.body}</p>
          {suggestion.primaryAction && (
            <Link
              href={suggestion.primaryAction.href}
              data-testid="suggestion-primary-action"
              className="mt-2 inline-block rounded-full bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {suggestion.primaryAction.label}
            </Link>
          )}
        </div>
        {suggestion.dismissible && (
          // Was a bare "×" glyph at text-zinc-400 with p-1: no button affordance,
          // a ~24px target, and effectively invisible against the card in light
          // mode. Now a real chip — filled circle + ring, contrast in both themes,
          // and a 36px tap target.
          <button
            type="button"
            onClick={handleDismiss}
            data-testid="suggestion-dismiss"
            aria-label={`Dismiss ${suggestion.title}`}
            className="-mr-1 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900/5 text-zinc-500 ring-1 ring-zinc-900/10 transition-colors hover:bg-zinc-900/10 hover:text-zinc-900 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/20 dark:hover:bg-white/20 dark:hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={2.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  )
}
