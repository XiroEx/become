"use client"

// ---------------------------------------------------------------------------
// ServingQuantityControls — the two-box "serving size + quantity" editor used
// on each AI-estimate review row (snap / upload / describe → "Your plate").
//
// Layout (matches the reference design):
//
//   ┌─────────────────────────┐  ┌───────────────┐
//   │ 1 cup (240 g)        ▾  │  │  −   2   +     │
//   └─────────────────────────┘  └───────────────┘
//      Serving Size                 Quantity
//
//   • Serving Size — a dropdown of the serving choices DERIVED FROM THE FOOD'S
//     stored data (its named servings + the weight/volume units it can resolve),
//     built by `buildServingChoiceGroups`. Only matched foods (those we have in
//     the DB) get the rich dropdown; an unmatched AI item falls back to a small
//     freeform text field so the user can still relabel it ("1 handful").
//   • Quantity — how many of that serving, a simple stepper.
//
// This component is presentational: it reports a picked ServingChoice or a
// quantity delta upward; the parent owns the nutrition math.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import { ChevronDown, Minus, Plus } from 'lucide-react'
import {
  buildServingChoiceGroups,
  servingChoiceDisplayLabel,
  type ServingChoice,
} from '@/lib/nutrition/servingOptions'
import { formatQuantity } from '@/lib/units'
import type { QuantityPickerVariant } from '@/components/nutrition/QuantityPicker'

/** A weight/volume choice is stored at quantity 1 with a bare unit label ("g").
 *  Render it as "1 g" so the dropdown reads like the reference design; named
 *  servings keep their friendly label as-is — except a serving collapsed from
 *  a measurable unit ("3/4 cup" -> quantity 1, unit 'serving'), where the
 *  label's own count no longer matches the quantity box next to it. That case
 *  shows the generic word "serving" — with the real amount named in parens,
 *  e.g. "serving (3/4 cup)" — instead of a bare noun that could be mistaken
 *  for a literal amount (see `measurableAsServing` on ServingChoice). */
function optionLabel(c: ServingChoice): string {
  if (c.group !== 'servings') return formatQuantity(c.quantity, c.unit)
  return servingChoiceDisplayLabel(c)
}

function round(n: number, dp = 3): number {
  const f = 10 ** dp
  return Math.round((n ?? 0) * f) / f
}

export interface ServingQuantityControlsProps {
  /** The matched food's serving basis. `null` for an unmatched AI item — then
   *  the serving box is a freeform text field instead of a dropdown. */
  variant: QuantityPickerVariant | null
  /** Which serving choice is selected (matches a choice id from the variant). */
  servingChoiceId?: string
  /** What the serving box shows when no DB choice is selected yet (the AI's
   *  own amount, e.g. "6 bites") — also the freeform value for unmatched items. */
  servingLabel: string
  /** The item's ORIGINAL friendly serving — shown as a persistent "current"
   *  option so it never disappears from the menu after the user tries a unit. */
  originalLabel?: string
  /** Current quantity (count of the selected serving). */
  count: number
  stepDelta?: number
  stepFloor?: number
  disabled?: boolean
  /** A DB serving choice was picked from the dropdown. */
  onSelectServing: (choice: ServingChoice) => void
  /** The user re-picked the original serving (the "current" option). */
  onResetToOriginal?: () => void
  /** Quantity stepper. */
  onStep: (delta: number) => void
  /** Freeform relabel (unmatched items only). */
  onFreeformLabel?: (label: string) => void
}

export default function ServingQuantityControls({
  variant,
  servingChoiceId,
  servingLabel,
  count,
  stepDelta = 1,
  stepFloor = 0.5,
  disabled,
  onSelectServing,
  onStep,
  onFreeformLabel,
}: ServingQuantityControlsProps) {
  const groups = useMemo(() => (variant ? buildServingChoiceGroups(variant) : null), [variant])
  const hasChoices = !!groups && groups.all.length > 0

  return (
    <div className={`mt-2 flex items-start gap-2 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      {/* ── Serving Size ── */}
      <div className="min-w-0 flex-[2]">
        {hasChoices ? (
          <div className="relative">
            <select
              aria-label="Serving size"
              value={servingChoiceId ?? groups!.servings[0]?.id ?? groups!.all[0]?.id ?? ''}
              onChange={(e) => {
                const choice = groups!.all.find((c) => c.id === e.target.value)
                if (choice) onSelectServing(choice)
              }}
              className="w-full appearance-none truncate rounded-lg border border-zinc-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-zinc-900 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:[color-scheme:dark]"
            >
              {/* Servings first — cosmetic shortcuts (picking one fills quantity +
                  unit, and shows checked when the two inputs match it). Always ≥1.
                  Then the measurable units grouped by Weight / Volume. */}
              <optgroup label="Servings">
                {groups!.servings.map((c) => (
                  <option key={c.id} value={c.id}>{optionLabel(c)}</option>
                ))}
              </optgroup>
              {/* Unit group matching the food's own dimension comes first. */}
              {(groups!.primaryFamily === 'volume'
                ? [['Volume', groups!.volume], ['Weight', groups!.weight]] as const
                : [['Weight', groups!.weight], ['Volume', groups!.volume]] as const
              ).map(([title, list]) => list.length > 0 && (
                <optgroup key={title} label={title}>
                  {list.map((c) => (
                    <option key={c.id} value={c.id}>{optionLabel(c)}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          </div>
        ) : onFreeformLabel ? (
          <FreeformServing value={servingLabel} onCommit={onFreeformLabel} />
        ) : (
          <div className="truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            {servingLabel}
          </div>
        )}
        <p className="mt-1 pl-0.5 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Serving Size</p>
      </div>

      {/* ── Quantity ── */}
      <div className="flex-1">
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-1 py-1 dark:border-zinc-700 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => onStep(-stepDelta)}
            disabled={count <= stepFloor}
            aria-label="Decrease quantity"
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[2.5rem] px-1 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-white">
            {round(count)}
          </span>
          <button
            type="button"
            onClick={() => onStep(stepDelta)}
            aria-label="Increase quantity"
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500">Quantity</p>
      </div>
    </div>
  )
}

/** Tap-to-edit freeform serving for unmatched AI items (no DB serving data). */
function FreeformServing({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    const v = draft.trim()
    if (v) onCommit(v)
    setEditing(false)
  }
  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="e.g. 1 handful"
        className="w-full rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 focus:outline-none dark:border-emerald-700 dark:bg-zinc-900 dark:text-white"
      />
    )
  }
  return (
    <button
      type="button"
      onClick={() => { setDraft(value); setEditing(true) }}
      className="w-full truncate rounded-lg border border-zinc-200 bg-white px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
    >
      {value || 'Set amount'}
    </button>
  )
}
