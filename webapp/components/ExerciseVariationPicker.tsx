'use client'

// A small "pick a variation" chip row — the same idea the Swap Exercise
// modal already offers (Machine Chest Press / Dumbbell Bench Press / ...),
// surfaced wherever an exercise gets *added* rather than swapped: the quick
// "Add an exercise" sheet and the program builders. Given the slug someone
// just picked, it asks the catalog for sibling variations (same movement
// pattern + primary muscles + body region, or explicitly linked) and lets
// them switch to the exact equipment/style variant before committing.
//
// Renders nothing until there's more than one variation — a single-result
// exercise has nothing to "pick" between.

import { useEffect, useRef, useState } from 'react'

export interface ExerciseVariation {
  slug: string
  name: string
  equipment: string[]
  laterality: string
  difficulty: string
  trackingType: string
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function formatEquipment(eq: string): string {
  return eq.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export interface ExerciseVariationPickerProps {
  /** Slug to fetch sibling variations for. Nothing renders while this is empty. */
  slug: string | null | undefined
  /** Which variation is currently highlighted — defaults to `slug` itself. */
  selectedSlug?: string | null
  onSelect: (variation: ExerciseVariation) => void
  dark?: boolean
  className?: string
}

export default function ExerciseVariationPicker({
  slug,
  selectedSlug,
  onSelect,
  dark = false,
  className = '',
}: ExerciseVariationPickerProps) {
  const [variations, setVariations] = useState<ExerciseVariation[] | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const mine = ++seq.current
    // Defer the reset to the next tick to avoid cascading renders inside an effect
    const resetTimer = setTimeout(() => {
      if (mine === seq.current) setVariations(null)
    }, 0)
    if (!slug) return () => clearTimeout(resetTimer)

    fetch(`/api/exercises/variations?slug=${encodeURIComponent(slug)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { variations?: ExerciseVariation[] } | null) => {
        if (mine === seq.current) setVariations(data?.variations ?? null)
      })
      .catch(() => {
        if (mine === seq.current) setVariations(null)
      })
    return () => clearTimeout(resetTimer)
  }, [slug])

  if (!variations || variations.length < 2) return null

  const active = selectedSlug ?? slug
  const muted = dark ? 'text-white/50' : 'text-zinc-500 dark:text-zinc-400'

  return (
    <div className={className}>
      <p className={`mb-1.5 text-[11px] font-semibold uppercase tracking-wide ${muted}`}>
        Pick a variation
      </p>
      <div className="flex flex-wrap gap-1.5">
        {variations.map((v) => (
          <button
            key={v.slug}
            type="button"
            onClick={() => onSelect(v)}
            data-testid={`variation-picker-chip-${v.slug}`}
            className={`rounded-lg border px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
              v.slug === active
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-900/20 dark:text-blue-400'
                : dark
                  ? 'border-white/10 bg-white/5 text-white/80 hover:border-white/20'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600'
            }`}
          >
            <span className="block max-w-[160px] truncate">{v.name}</span>
            {v.equipment.filter((eq) => eq !== 'none' && eq !== 'bodyweight').length > 0 && (
              <span className="block max-w-[160px] truncate text-[10px] opacity-70">
                {v.equipment.filter((eq) => eq !== 'none' && eq !== 'bodyweight').map(formatEquipment).join(', ')}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
