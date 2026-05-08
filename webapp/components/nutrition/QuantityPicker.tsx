"use client"

// ---------------------------------------------------------------------------
// QuantityPicker — the unit-aware "how much did you eat" subcomponent shared
// by the food search modal, the edit-food modal, and the food-log sheet.
//
// Rendering modes
//   1. Quick mode: up to 3 chips (1×, ½× / first alternate, 2×) + a "Custom"
//      button. The chip whose (quantity, unit) matches the live selection is
//      highlighted.
//   2. Custom mode: a freeform numeric input + a unit dropdown limited to the
//      variant's domain (its own family, plus the cross-family if a bridge is
//      declared). Paste of "240ml" auto-promotes the selected unit.
//
// Math
//   Every state change resolves a `QuantityPickerSelection` via
//   `nutritionForQuantity` and emits it through `onChange`. Callers don't do
//   their own scaling — they just consume `selection.nutrition` and
//   `selection.multiplier` for the submit shape.
//
// SSR
//   No top-level browser APIs; all state lives inside the component.
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import {
  type Unit,
  familyOf,
  unitLabel,
  parseQuantityString,
  suggestedToggleUnit,
  formatQuantity,
} from '@/lib/units'
// Note: nutritionForQuantity covers the canonical math; scalingFactor is used
// directly so we can short-circuit on non-finite results without throwing.
import { nutritionForQuantity, scalingFactor, type VariantForMath } from '@/lib/foodMath'
import type { IFoodVariant, IFoodNutrition } from '@/models/Food'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type QuantityPickerSelection = {
  /** What the user picked. 0 means "no valid amount". */
  quantity: number
  unit: Unit
  /** Scaled nutrition for `(quantity, unit)`. Zero when the input is invalid. */
  nutrition: IFoodNutrition
  /**
   * Stable factor: `nutrition / variant.nutrition`. Useful to pass through
   * to the legacy log shape (`servings × multiplier` math). Zero when invalid.
   */
  multiplier: number
}

/**
 * Caller-friendly variant shape. We intentionally widen `alternateServings`
 * to optional and keep the field set small so the picker can be fed from
 * either an `IFoodVariant` (server doc) or a flattened search-result variant
 * (which marks several fields optional).
 */
export interface QuantityPickerVariant {
  servingSize: IFoodVariant['servingSize']
  servingUnit: IFoodVariant['servingUnit']
  displayLabel?: IFoodVariant['displayLabel']
  alternateServings?: IFoodVariant['alternateServings']
  nutrition: IFoodVariant['nutrition']
  gramsPerServing?: IFoodVariant['gramsPerServing']
  mlPerServing?: IFoodVariant['mlPerServing']
}

export interface QuantityPickerProps {
  variant: QuantityPickerVariant
  /** User's mass-unit preference. Drives the default unit in custom mode for
   *  mass-family variants. Defaults to `'lbs'` to match the User model. */
  weightPref?: 'kg' | 'lbs'
  /** Initial quantity + unit (used when editing an existing log entry). */
  initial?: { quantity: number; unit: Unit }
  /** Called whenever the resolved selection changes (every keystroke / chip). */
  onChange: (sel: QuantityPickerSelection) => void
  /** Optional className passthrough for outer wrapper. */
  className?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MASS_FAMILY_UNITS: Unit[] = ['g', 'oz', 'lb']
const VOLUME_FAMILY_UNITS: Unit[] = ['ml', 'fl_oz', 'cup', 'tbsp', 'tsp']

// ---------------------------------------------------------------------------
// Quick-option construction
// ---------------------------------------------------------------------------

interface QuickOption {
  id: string
  label: string
  quantity: number
  unit: Unit
}

/**
 * Discrete units format as bare numbers / fractions when the value !== 1; the
 * unit only renders alongside non-1 counts ("2 servings"). This matches the
 * UNITS_AND_SERVINGS_PLAN §4.3 row.
 */
function labelForQuantity(quantity: number, unit: Unit, displayLabel?: string, isPrimary?: boolean): string {
  if (isPrimary && displayLabel) return displayLabel
  return formatQuantity(quantity, unit)
}

function buildQuickOptions(variant: QuantityPickerVariant): QuickOption[] {
  const unit = variant.servingUnit as Unit
  const size = variant.servingSize

  const primary: QuickOption = {
    id: 'primary',
    label: labelForQuantity(size, unit, variant.displayLabel, true),
    quantity: size,
    unit,
  }

  // Prefer the variant's first alternateServing as the "second chip" when one
  // exists — it carries authored knowledge ("1 medium banana"). Otherwise fall
  // back to the synthetic "half" option.
  const alternates = variant.alternateServings ?? []
  let middle: QuickOption
  if (alternates.length > 0) {
    const alt = alternates[0]
    const altQty = size * alt.multiplier
    middle = {
      id: 'alt-0',
      label: alt.label || labelForQuantity(altQty, unit),
      quantity: altQty,
      unit,
    }
  } else {
    const halfQty = size / 2
    middle = {
      id: 'half',
      label: labelForQuantity(halfQty, unit),
      quantity: halfQty,
      unit,
    }
  }

  const doubleQty = size * 2
  const doubleOption: QuickOption = {
    id: 'double',
    label: labelForQuantity(doubleQty, unit),
    quantity: doubleQty,
    unit,
  }

  return [primary, middle, doubleOption]
}

// ---------------------------------------------------------------------------
// Custom-mode unit list
// ---------------------------------------------------------------------------

function unitsForCustomDropdown(variant: QuantityPickerVariant): Unit[] {
  const native = variant.servingUnit as Unit
  const family = familyOf(native)

  const out: Unit[] = []

  if (family === 'mass') {
    out.push(...MASS_FAMILY_UNITS)
    if (variant.mlPerServing != null) out.push(...VOLUME_FAMILY_UNITS)
  } else if (family === 'volume') {
    out.push(...VOLUME_FAMILY_UNITS)
    if (variant.gramsPerServing != null) out.push(...MASS_FAMILY_UNITS)
  } else {
    // discrete: include the variant's own discrete unit; if a bridge exists,
    // also include the corresponding family.
    out.push(native)
    if (variant.gramsPerServing != null) out.push(...MASS_FAMILY_UNITS)
    if (variant.mlPerServing != null) out.push(...VOLUME_FAMILY_UNITS)
  }

  return out
}

function defaultCustomUnit(variant: QuantityPickerVariant, weightPref: 'kg' | 'lbs'): Unit {
  const suggested = suggestedToggleUnit(variant.servingUnit as Unit, weightPref)
  if (suggested) return suggested
  return variant.servingUnit as Unit
}

// ---------------------------------------------------------------------------
// Match initial → quick option
// ---------------------------------------------------------------------------

const QTY_EPSILON = 0.001

function matchOption(options: QuickOption[], qty: number, unit: Unit): QuickOption | null {
  for (const opt of options) {
    if (opt.unit === unit && Math.abs(opt.quantity - qty) < QTY_EPSILON) {
      return opt
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function QuantityPicker({
  variant,
  weightPref = 'lbs',
  initial,
  onChange,
  className,
}: QuantityPickerProps) {
  const quickOptions = useMemo(() => buildQuickOptions(variant), [variant])
  const dropdownUnits = useMemo(() => unitsForCustomDropdown(variant), [variant])

  // ── Initial state derivation ──────────────────────────────────────────
  // If `initial` matches one of the quick chips, start in chip mode; otherwise
  // start in custom mode pre-filled with the initial values.
  const initialMatch = initial ? matchOption(quickOptions, initial.quantity, initial.unit) : null
  const startMode: 'quick' | 'custom' = initial ? (initialMatch ? 'quick' : 'custom') : 'quick'

  const [mode, setMode] = useState<'quick' | 'custom'>(startMode)
  const [activeOptionId, setActiveOptionId] = useState<string>(
    () => initialMatch?.id ?? quickOptions[0]?.id ?? 'primary'
  )

  const [customValue, setCustomValue] = useState<string>(() => {
    if (initial && !initialMatch) {
      // Render the unbridged number portion only — the unit dropdown holds the unit.
      return formatNumberForInput(initial.quantity)
    }
    return ''
  })

  const [customUnit, setCustomUnit] = useState<Unit>(() => {
    if (initial) return initial.unit
    return defaultCustomUnit(variant, weightPref)
  })

  // Reset state when the variant identity changes. Callers swap variants by
  // re-rendering with a different `variant` prop; we key on the storage
  // signature so unrelated re-renders (parent state churn) don't blow away
  // the picker selection.
  const variantKey = `${variant.servingSize}-${variant.servingUnit}-${variant.gramsPerServing ?? ''}-${variant.mlPerServing ?? ''}`
  const lastVariantKey = useRef(variantKey)
  useEffect(() => {
    if (lastVariantKey.current === variantKey) return
    lastVariantKey.current = variantKey

    setMode('quick')
    setActiveOptionId(quickOptions[0]?.id ?? 'primary')
    setCustomValue('')
    setCustomUnit(defaultCustomUnit(variant, weightPref))
  }, [variant, variantKey, quickOptions, weightPref])

  // ── Resolve selection ─────────────────────────────────────────────────
  const variantForMath: VariantForMath = {
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    nutrition: variant.nutrition,
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  }

  const resolved = useMemo<QuantityPickerSelection>(() => {
    if (mode === 'quick') {
      const opt = quickOptions.find(o => o.id === activeOptionId) ?? quickOptions[0]
      if (!opt) return zeroSelection(quickOptions[0]?.unit ?? (variant.servingUnit as Unit))
      return resolve(variantForMath, opt.quantity, opt.unit)
    }
    // custom
    const numeric = parseLeadingNumber(customValue)
    if (numeric == null || numeric <= 0 || !Number.isFinite(numeric)) {
      return zeroSelection(customUnit)
    }
    return resolve(variantForMath, numeric, customUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    activeOptionId,
    customValue,
    customUnit,
    quickOptions,
    variant.servingSize,
    variant.servingUnit,
    variant.gramsPerServing,
    variant.mlPerServing,
    variant.nutrition.calories,
  ])

  // ── Emit upstream ─────────────────────────────────────────────────────
  // Stringify-as-key avoids re-emitting on identical floats from re-renders.
  const lastEmittedRef = useRef<string>('')
  useEffect(() => {
    const key = `${resolved.quantity}|${resolved.unit}|${resolved.multiplier}`
    if (key === lastEmittedRef.current) return
    lastEmittedRef.current = key
    onChange(resolved)
  }, [resolved, onChange])

  // ── Custom-mode: paste-of-string handling ─────────────────────────────
  const onCustomValueChange = (value: string) => {
    setCustomValue(value)
    const parsed = parseQuantityString(value)
    if (parsed && dropdownUnits.includes(parsed.unit)) {
      // User pasted "240ml": auto-promote the unit dropdown AND retain the
      // numeric portion in the input. Strip the unit from the visible text
      // so the field doesn't read "240ml ml" after re-render.
      setCustomUnit(parsed.unit)
      setCustomValue(formatNumberForInput(parsed.value))
    }
  }

  const onCustomBlur = () => {
    // On blur, if the field starts with garbage but has a parseable trailing
    // unit, normalize it. This is a safety net for keystrokes that arrived
    // mid-stream and weren't caught by `onCustomValueChange`.
    const parsed = parseQuantityString(customValue)
    if (parsed && dropdownUnits.includes(parsed.unit)) {
      setCustomUnit(parsed.unit)
      setCustomValue(formatNumberForInput(parsed.value))
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={className}>
      {mode === 'quick' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {quickOptions.map(opt => {
            const isActive = opt.id === activeOptionId
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setActiveOptionId(opt.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setMode('custom')}
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            <Pencil className="h-3 w-3" />
            Custom
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={customValue}
              onChange={(e) => onCustomValueChange(e.target.value)}
              onBlur={onCustomBlur}
              placeholder="Amount"
              autoFocus
              className="w-24 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-zinc-500"
            />
            <select
              value={customUnit}
              onChange={(e) => setCustomUnit(e.target.value as Unit)}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white"
            >
              {dropdownUnits.map(u => (
                <option key={u} value={u}>{unitLabel(u)}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setMode('quick')
              setActiveOptionId(quickOptions[0]?.id ?? 'primary')
              setCustomValue('')
            }}
            className="text-[11px] font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            ← Back to presets
          </button>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render a number for the custom input: pretty for whole numbers, up to 3
 * decimals otherwise, no trailing zeros.
 */
function formatNumberForInput(n: number): string {
  if (!Number.isFinite(n)) return ''
  if (Number.isInteger(n)) return String(n)
  const rounded = Math.round(n * 1000) / 1000
  return String(rounded)
}

/**
 * Pull a number out of the start of a custom-mode input string. Permissive:
 * "1.5", ".5", "1/2", "1 1/2", "1½" all parse. Returns null when nothing
 * leading is numeric.
 *
 * We deliberately do NOT use `parseQuantityString` here because the unit
 * is held by the dropdown — the value field is just a number. Paste of
 * "240ml" is handled separately by `onCustomValueChange`.
 */
function parseLeadingNumber(s: string): number | null {
  if (!s) return null
  const trimmed = s.trim()
  if (!trimmed) return null

  // Try the full quantity parser first — handles "1½", "1 1/2", "½".
  const q = parseQuantityString(trimmed + ' g') // append a known unit so the parser succeeds
  if (q && Number.isFinite(q.value)) return q.value

  // Fallback: bare decimal/integer.
  const m = trimmed.match(/^(\d*\.?\d+)/)
  if (!m) return null
  const v = parseFloat(m[1])
  return Number.isFinite(v) ? v : null
}

function zeroSelection(unit: Unit): QuantityPickerSelection {
  return {
    quantity: 0,
    unit,
    multiplier: 0,
    nutrition: { calories: 0, protein: 0, carbs: 0, fats: 0 },
  }
}

function resolve(variantForMath: VariantForMath, quantity: number, unit: Unit): QuantityPickerSelection {
  try {
    const factor = scalingFactor(variantForMath, quantity, unit)
    if (!Number.isFinite(factor) || factor < 0) return zeroSelection(unit)
    const nutrition = nutritionForQuantity(variantForMath, quantity, unit)
    return { quantity, unit, multiplier: factor, nutrition }
  } catch {
    // The picker's UI restricts unit choices to ones the variant can handle;
    // if we somehow get here, surface zero rather than crash.
    return zeroSelection(unit)
  }
}
