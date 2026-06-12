"use client"

// THE app-standard segmented control (timeline Day/Week/Month, recipes
// Recipes/Favorites, etc). Bordered full-width strip, black active segment.
// Use this instead of hand-rolling the pattern.

import type { LucideIcon } from 'lucide-react'

export interface Segment<T extends string> {
  value: T
  label: string
  Icon?: LucideIcon
}

export default function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className = '',
}: {
  segments: Segment<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`inline-flex w-full rounded-xl border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900 ${className}`}>
      {segments.map(({ value: v, label, Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors sm:text-sm ${
            value === v
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-black'
              : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}
        >
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </button>
      ))}
    </div>
  )
}
