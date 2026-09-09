'use client'

// "This is being logged as a Dumbbell — switch if you're on the machine."
//
// The card: a Workout Now session on "Rear Delt Fly" asked for "Weight per DB
// (lbs)" and reported "= 95 lbs total". The catalog entry is the dumbbell one,
// so the number was right for a dumbbell and wrong for the rear delt machine —
// and nothing on screen said which the app had picked, nor offered the other.
//
// So this renders two things, and only when they are worth rendering:
//
//   1. The assumption, when the exercise's own name does not already state it
//      (lib/workout/equipmentVariant.ts). "Dumbbell Bench Press" gets nothing;
//      "Rear Delt Fly" gets a Dumbbell chip.
//   2. The same movement on other equipment, one tap each. Filtered to genuine
//      equipment swaps — a Face Pull is a fine rear-delt exercise but it is not
//      "this movement, other equipment", and offering it here would be a
//      different promise than the label makes.
//
// The switch is withheld (`canSwitch`) once a set has been logged against the
// exercise, because swapping clears that exercise's logged sets. Losing two
// finished sets is a fine price for a deliberate trip through the Swap
// Exercise modal and a bad one for a mis-tap on a small chip. The DISCLOSURE
// stays either way — that half is never destructive and is most wanted exactly
// when someone is staring at "Weight per DB" mid-set.
//
// Fails quiet: a failed or empty variations fetch leaves the assumption chip
// standing on its own, which is still strictly more than the screen said before.

import { useEffect, useRef, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import {
  equipmentAssumption,
  equipmentVariantsOf,
  loadStyleLabel,
  loadStyleOf,
} from '@/lib/workout/equipmentVariant'

/** The shape `/api/exercises/variations` returns, and what `onPick` hands back. */
export interface EquipmentVariation {
  slug: string
  name: string
  equipment: string[]
  laterality: string
  difficulty: string
  trackingType: string
  category: string
  movementPatterns: string[]
}

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export interface EquipmentAssumptionRowProps {
  /** Catalog slug — nothing is fetched without one (custom exercises included). */
  slug?: string | null
  name?: string
  equipment?: string[]
  /** Swap the live exercise for this variation. */
  onPick: (variation: EquipmentVariation) => void
  /**
   * May the member switch equipment from here? False once sets are logged
   * against this exercise — a swap resets them, and a chip is too easy to
   * mis-tap for that. The assumption chip still renders.
   */
  canSwitch?: boolean
  /** Live workout renders on video; the hub and builders render on paper. */
  dark?: boolean
  className?: string
}

export default function EquipmentAssumptionRow({
  slug,
  name,
  equipment,
  onPick,
  canSwitch = true,
  dark = false,
  className = '',
}: EquipmentAssumptionRowProps) {
  const [variants, setVariants] = useState<EquipmentVariation[]>([])
  const seq = useRef(0)

  const assumption = equipmentAssumption({ name, equipment })

  useEffect(() => {
    const mine = ++seq.current
    setVariants([])
    if (!slug || !assumption.assumed || !canSwitch) return

    fetch(`/api/exercises/variations?slug=${encodeURIComponent(slug)}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { variations?: EquipmentVariation[] } | null) => {
        if (mine !== seq.current) return
        setVariants(equipmentVariantsOf({ slug, name, equipment }, data?.variations ?? []))
      })
      .catch(() => {
        if (mine === seq.current) setVariants([])
      })
    // `name`/`equipment` travel with the slug — a slug change is the only thing
    // that can change the answer, and depending on the array identity would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, assumption.assumed, canSwitch])

  if (!assumption.assumed || !assumption.label) return null

  const chip = dark
    ? 'bg-white/10 text-white/70'
    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  const variantChip = dark
    ? 'border-white/15 bg-white/5 text-white/80 hover:border-white/30 hover:bg-white/10 active:bg-white/20'
    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'

  return (
    <div data-testid="equipment-assumption-row" className={`mt-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          data-testid="equipment-assumption-chip"
          title={`Logged as ${assumption.label}. This exercise's name doesn't say which equipment it uses, so the catalog default is being used.`}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${chip}`}
        >
          <Dumbbell className="h-3 w-3" aria-hidden />
          Logging as {assumption.label}
        </span>
        {variants.map((v) => {
          const style = loadStyleOf(v.equipment)
          const label = style ? loadStyleLabel(style) : v.name
          return (
            <button
              key={v.slug}
              type="button"
              onClick={() => onPick(v)}
              data-testid={`equipment-variant-${v.slug}`}
              aria-label={`Switch to ${v.name}`}
              className={`rounded-full border px-2.5 py-1 text-left text-[11px] font-medium transition-colors ${variantChip}`}
            >
              <span className="block">{label}</span>
              <span className="block max-w-[140px] truncate text-[10px] opacity-60">{v.name}</span>
            </button>
          )
        })}
      </div>
      {variants.length > 0 && (
        <p className={`mt-1 text-[10px] ${dark ? 'text-white/40' : 'text-zinc-400 dark:text-zinc-500'}`}>
          On something else? Tap to switch — the weight fields follow.
        </p>
      )}
    </div>
  )
}
