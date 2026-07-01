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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Pencil } from 'lucide-react'
import {
  type Unit,
  convert,
  convertWithBridge,
  familyOf,
  unitLabel,
  parseQuantityString,
  prettifyUnitCodes,
  suggestedToggleUnit,
  formatQuantity,
} from '@/lib/units'
import {
  buildServingChoiceGroups,
  findBestBridgeForUnit,
  type ServingChoice,
  variantForServingChoice,
} from '@/lib/nutrition/servingOptions'
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
  /** Effective bridge used for this choice, including label-derived bridges. */
  gramsPerServing?: number
  mlPerServing?: number
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
  /** `inline` renders a quiet amount field + custom unit dropdown instead of preset chips. */
  layout?: 'chips' | 'inline'
  /** Optional className passthrough for outer wrapper. */
  className?: string
}

type UnitMenuPosition = {
  left: number
  top: number
  width: number
  maxHeight: number
}

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
  if (isPrimary && displayLabel) return prettifyUnitCodes(displayLabel)
  return formatQuantity(quantity, unit)
}

// Pattern matching a parenthesized weight/volume in a label, e.g. "(28 g)".
const PARENS_WEIGHT_RE = /\(\s*\d+(?:\.\d+)?\s*(?:g|grams?|ml|millilitres?|milliliters?|oz|ounces?|fl\s*oz)\s*\)/i
// Matches a bare gram/ml number anywhere in the label, e.g. "38 g" or "240 ml".
// Used to skip the bridge suffix when the label already conveys the same info.
const BARE_MASS_RE = /\b(\d+(?:\.\d+)?)\s*(g|grams?|ml|millilitres?|milliliters?)\b/i

/**
 * If `label` is a human serving name without an embedded gram/ml suffix
 * ("12 chips") and we know the gram weight, append it as "(28 g)". Same for
 * ml when the variant is volume-native. Returns the label untouched when:
 *   - the label already mentions a gram/ml value in parens
 *   - we have nothing to append
 *   - the resolved value is the trivial "100 g" sentinel (per-100g foods
 *     where the bridge equals storage size — no signal to add)
 */
function enrichLabelWithBridge(
  label: string,
  variant: Pick<QuantityPickerVariant, 'servingSize' | 'servingUnit' | 'gramsPerServing' | 'mlPerServing'>,
): string {
  if (!label) return label
  if (PARENS_WEIGHT_RE.test(label)) return label

  // If the label already says e.g. "38 g" inline, skip the bridge suffix when
  // it would just repeat the same number (no "(38 g)" tacked onto "38 g").
  const bareMatch = BARE_MASS_RE.exec(label)

  const unit = variant.servingUnit as Unit
  const family = familyOf(unit)

  // Resolve a gram value to append. Prefer gramsPerServing (the bridge);
  // otherwise compute from servingSize when the variant is mass-native.
  let grams: number | null = null
  if (variant.gramsPerServing != null && variant.gramsPerServing > 0) {
    grams = variant.gramsPerServing
  } else if (family === 'mass') {
    try {
      grams = convert(variant.servingSize, unit, 'g')
    } catch {
      grams = null
    }
  }
  if (grams != null) {
    // Avoid the trivial "(100 g)" tail when the storage size already implies it.
    if (Math.abs(grams - 100) < 0.5 && Math.abs(variant.servingSize - 100) < 0.5 && unit === 'g') {
      return label
    }
    // If the label already mentions the same gram number inline, don't double up.
    if (bareMatch && /^g/i.test(bareMatch[2]) && Math.abs(Number(bareMatch[1]) - grams) < 0.5) {
      return label
    }
    return `${label} (${roundReadable(grams)} g)`
  }

  let ml: number | null = null
  if (variant.mlPerServing != null && variant.mlPerServing > 0) {
    ml = variant.mlPerServing
  } else if (family === 'volume') {
    try {
      ml = convert(variant.servingSize, unit, 'ml')
    } catch {
      ml = null
    }
  }
  if (ml != null) {
    if (bareMatch && /^m/i.test(bareMatch[2]) && Math.abs(Number(bareMatch[1]) - ml) < 0.5) {
      return label
    }
    return `${label} (${roundReadable(ml)} ml)`
  }

  return label
}

function roundReadable(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n))
  return (Math.round(n * 10) / 10).toString()
}

function buildQuickOptions(variant: QuantityPickerVariant): QuickOption[] {
  const unit = variant.servingUnit as Unit
  const size = variant.servingSize

  // For per-100g (or per-100ml) imports — common for OpenFoodFacts foods —
  // the variant's storage `servingSize` is the canonical-math reference (100)
  // and the actual user-facing serving is in `gramsPerServing`/`mlPerServing`.
  // The primary chip must represent "1 serving as the food defines it", so
  // when those bridges exist and differ from the storage size, use them.
  let primaryQty = size
  if (unit === 'g' && variant.gramsPerServing != null && variant.gramsPerServing > 0 && Math.abs(variant.gramsPerServing - size) > 0.001) {
    primaryQty = variant.gramsPerServing
  } else if (unit === 'ml' && variant.mlPerServing != null && variant.mlPerServing > 0 && Math.abs(variant.mlPerServing - size) > 0.001) {
    primaryQty = variant.mlPerServing
  }

  const baseLabel = labelForQuantity(primaryQty, unit, variant.displayLabel, true)
  const primary: QuickOption = {
    id: 'primary',
    label: enrichLabelWithBridge(baseLabel, variant),
    quantity: primaryQty,
    unit,
  }

  // Prefer the variant's first alternateServing as the "second chip" when one
  // exists AND it doesn't render to the same chip as the primary (same label
  // OR same effective quantity). Otherwise fall back to the synthetic "half"
  // option so the row stays useful.
  const alternates = variant.alternateServings ?? []
  let middle: QuickOption | null = null
  if (alternates.length > 0) {
    const alt = alternates[0]
    const altQty = size * alt.multiplier
    const rawAltLabel = alt.label ? prettifyUnitCodes(alt.label) : labelForQuantity(altQty, unit)
    const altLabel = enrichLabelWithBridge(rawAltLabel, variant)
    const dupQty = Math.abs(altQty - primaryQty) < 0.001
    const dupLabel = altLabel.trim() === primary.label.trim()
    if (!dupQty && !dupLabel) {
      middle = {
        id: 'alt-0',
        label: altLabel,
        quantity: altQty,
        unit,
      }
    }
  }

  if (!middle) {
    const halfQty = primaryQty / 2
    middle = {
      id: 'half',
      label: labelForQuantity(halfQty, unit),
      quantity: halfQty,
      unit,
    }
  }

  const doubleQty = primaryQty * 2
  const doubleOption: QuickOption = {
    id: 'double',
    label: labelForQuantity(doubleQty, unit),
    quantity: doubleQty,
    unit,
  }

  return [primary, middle, doubleOption]
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
  layout = 'chips',
  className,
}: QuantityPickerProps) {
  const quickOptions = useMemo(() => buildQuickOptions(variant), [variant])
  const choiceGroups = useMemo(() => buildServingChoiceGroups(variant), [variant])
  const dropdownChoices = choiceGroups.all
  const isInline = layout === 'inline'
  const primaryOption = quickOptions[0]
  const inlineDefaultChoice = choiceGroups.servings[0] ?? null

  // ── Initial state derivation ──────────────────────────────────────────
  // If `initial` matches one of the quick chips, start in chip mode; otherwise
  // start in custom mode pre-filled with the initial values.
  const initialMatch = initial ? matchOption(quickOptions, initial.quantity, initial.unit) : null
  const startMode: 'quick' | 'custom' = isInline ? 'custom' : (initial ? (initialMatch ? 'quick' : 'custom') : 'quick')

  const [mode, setMode] = useState<'quick' | 'custom'>(startMode)
  const [activeOptionId, setActiveOptionId] = useState<string>(
    () => initialMatch?.id ?? quickOptions[0]?.id ?? 'primary'
  )

  const [customValue, setCustomValue] = useState<string>(() => {
    if (initial && !initialMatch) {
      // Render the unbridged number portion only — the unit dropdown holds the unit.
      return formatNumberForInput(initial.quantity)
    }
    if (isInline) return formatNumberForInput(inlineDefaultChoice?.quantity ?? primaryOption?.quantity ?? variant.servingSize)
    return ''
  })

  const [customUnit, setCustomUnit] = useState<Unit>(() => {
    if (initial) return initial.unit
    if (isInline) return inlineDefaultChoice?.unit ?? primaryOption?.unit ?? (variant.servingUnit as Unit)
    return defaultCustomUnit(variant, weightPref)
  })
  const [selectedInlineChoiceId, setSelectedInlineChoiceId] = useState(() => isInline ? (inlineDefaultChoice?.id ?? '') : '')
  const [unitMenuOpen, setUnitMenuOpen] = useState(false)
  const unitButtonRef = useRef<HTMLButtonElement>(null)
  const [unitMenuPosition, setUnitMenuPosition] = useState<UnitMenuPosition | null>(null)
  const updateUnitMenuPosition = useCallback(() => {
    const button = unitButtonRef.current
    if (!button || typeof window === 'undefined') return

    const rect = button.getBoundingClientRect()
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    const viewportOffsetLeft = window.visualViewport?.offsetLeft ?? 0
    const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0
    const margin = 8
    const gap = 4
    const desiredWidth = 208
    const width = Math.min(desiredWidth, viewportWidth - margin * 2)
    const left = Math.max(
      viewportOffsetLeft + margin,
      Math.min(
        viewportOffsetLeft + viewportWidth - margin - width,
        rect.right + viewportOffsetLeft - width,
      ),
    )
    const below = viewportOffsetTop + viewportHeight - rect.bottom - gap - margin
    const above = rect.top - viewportOffsetTop - gap - margin
    const openUp = below < 180 && above > below
    const available = openUp ? above : below
    const maxHeight = Math.max(136, Math.min(256, available))
    const top = openUp
      ? Math.max(viewportOffsetTop + margin, rect.top + viewportOffsetTop - gap - maxHeight)
      : Math.min(
          viewportOffsetTop + viewportHeight - margin - maxHeight,
          rect.bottom + viewportOffsetTop + gap,
        )

    setUnitMenuPosition({ left, top, width, maxHeight })
  }, [])
  const selectedChoice = useMemo(() => {
    const numeric = parseLeadingNumber(customValue)
    const explicit = dropdownChoices.find(choice => choice.id === selectedInlineChoiceId)
    if (explicit && explicit.unit === customUnit) {
      if (explicit.group !== 'servings') return explicit
      if (numeric != null && Math.abs(explicit.quantity - numeric) < QTY_EPSILON) return explicit
    }

    if (numeric != null) {
      const servingChoice = choiceGroups.servings.find(choice =>
        choice.unit === customUnit && Math.abs(choice.quantity - numeric) < QTY_EPSILON
      )
      if (servingChoice) return servingChoice
    }

    return dropdownChoices.find(choice => choice.group !== 'servings' && choice.unit === customUnit) ?? null
  }, [choiceGroups.servings, customUnit, customValue, dropdownChoices, selectedInlineChoiceId])
  const selectedChoiceId = selectedChoice?.id ?? ''
  // Servings are SHORTCUTS, not a selected "unit" — the unit button always shows
  // the real measurable unit (g / cup / …). Picking a serving fills the amount
  // and this unit; the serving itself just shows a ✓ in the menu when they match.
  const unitButtonLabel = unitLabel(customUnit)

  useEffect(() => {
    if (!unitMenuOpen) return
    updateUnitMenuPosition()

    const viewport = window.visualViewport
    window.addEventListener('resize', updateUnitMenuPosition)
    window.addEventListener('scroll', updateUnitMenuPosition, true)
    viewport?.addEventListener('resize', updateUnitMenuPosition)
    viewport?.addEventListener('scroll', updateUnitMenuPosition)
    return () => {
      window.removeEventListener('resize', updateUnitMenuPosition)
      window.removeEventListener('scroll', updateUnitMenuPosition, true)
      viewport?.removeEventListener('resize', updateUnitMenuPosition)
      viewport?.removeEventListener('scroll', updateUnitMenuPosition)
    }
  }, [unitMenuOpen, updateUnitMenuPosition])

  // Reset state when the variant identity changes. Callers swap variants by
  // re-rendering with a different `variant` prop; we key on the storage
  // signature so unrelated re-renders (parent state churn) don't blow away
  // the picker selection.
  const variantKey = `${variant.servingSize}-${variant.servingUnit}-${variant.gramsPerServing ?? ''}-${variant.mlPerServing ?? ''}`
  const lastVariantKey = useRef(variantKey)
  useEffect(() => {
    if (lastVariantKey.current === variantKey) return
    lastVariantKey.current = variantKey

    setMode(isInline ? 'custom' : 'quick')
    setActiveOptionId(quickOptions[0]?.id ?? 'primary')
    setCustomValue(isInline ? formatNumberForInput(inlineDefaultChoice?.quantity ?? quickOptions[0]?.quantity ?? variant.servingSize) : '')
    setCustomUnit(isInline ? (inlineDefaultChoice?.unit ?? quickOptions[0]?.unit ?? (variant.servingUnit as Unit)) : defaultCustomUnit(variant, weightPref))
    setSelectedInlineChoiceId(isInline ? (inlineDefaultChoice?.id ?? '') : '')
    setUnitMenuOpen(false)
  }, [variant, variantKey, quickOptions, weightPref, isInline, inlineDefaultChoice])

  // ── Resolve selection ─────────────────────────────────────────────────
  const variantForMath = useMemo<VariantForMath>(() => ({
    servingSize: variant.servingSize,
    servingUnit: variant.servingUnit,
    nutrition: variant.nutrition,
    gramsPerServing: variant.gramsPerServing,
    mlPerServing: variant.mlPerServing,
  }), [variant])
  const activeBridge = useMemo(
    () => findBestBridgeForUnit(choiceGroups, customUnit),
    [choiceGroups, customUnit],
  )
  const customVariantForMath = useMemo(
    () => variantForServingChoice(variantForMath, activeBridge),
    [variantForMath, activeBridge],
  )

  const resolved = useMemo<QuantityPickerSelection>(() => {
    if (!isInline && mode === 'quick') {
      const opt = quickOptions.find(o => o.id === activeOptionId) ?? quickOptions[0]
      if (!opt) return zeroSelection(quickOptions[0]?.unit ?? (variant.servingUnit as Unit))
      return resolve(variantForMath, opt.quantity, opt.unit)
    }
    // custom
    const numeric = parseLeadingNumber(customValue)
    if (numeric == null || numeric <= 0 || !Number.isFinite(numeric)) {
      return zeroSelection(customUnit)
    }
    return resolve(customVariantForMath, numeric, customUnit)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    activeOptionId,
    customValue,
    customUnit,
    isInline,
    quickOptions,
    variant.servingSize,
    variant.servingUnit,
    variant.gramsPerServing,
    variant.mlPerServing,
    variant.nutrition.calories,
    activeBridge,
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
    setSelectedInlineChoiceId('')
    setCustomValue(value)
    const parsed = parseQuantityString(value)
    if (parsed && dropdownChoices.some(choice => choice.unit === parsed.unit)) {
      // User pasted "240ml": auto-promote the unit dropdown AND retain the
      // numeric portion in the input. Strip the unit from the visible text
      // so the field doesn't read "240ml ml" after re-render.
      setCustomUnit(parsed.unit)
      setSelectedInlineChoiceId(
        dropdownChoices.find(choice => choice.group !== 'servings' && choice.unit === parsed.unit)?.id ?? ''
      )
      setCustomValue(formatNumberForInput(parsed.value))
    }
  }

  const onCustomBlur = () => {
    // On blur, if the field starts with garbage but has a parseable trailing
    // unit, normalize it. This is a safety net for keystrokes that arrived
    // mid-stream and weren't caught by `onCustomValueChange`.
    const parsed = parseQuantityString(customValue)
    if (parsed && dropdownChoices.some(choice => choice.unit === parsed.unit)) {
      setCustomUnit(parsed.unit)
      setSelectedInlineChoiceId(
        dropdownChoices.find(choice => choice.group !== 'servings' && choice.unit === parsed.unit)?.id ?? ''
      )
      setCustomValue(formatNumberForInput(parsed.value))
    }
  }

  const onInlineChoiceSelect = (choice: ServingChoice) => {
    setSelectedInlineChoiceId(choice.id)
    if (choice.group === 'servings') {
      setCustomValue(formatNumberForInput(choice.quantity))
      setCustomUnit(choice.unit)
      setUnitMenuOpen(false)
      return
    }

    const nextUnit = choice.unit
    const numeric = parseLeadingNumber(customValue)
    if (numeric != null && numeric > 0 && Number.isFinite(numeric) && nextUnit !== customUnit) {
      const bridge = choice.gramsPerServing != null || choice.mlPerServing != null
        ? choice
        : activeBridge
      const converted = convertWithBridge(numeric, customUnit, nextUnit, {
        servingSize: variant.servingSize,
        servingUnit: variant.servingUnit as Unit,
        gramsPerServing: bridge?.gramsPerServing ?? variant.gramsPerServing,
        mlPerServing: bridge?.mlPerServing ?? variant.mlPerServing,
      })
      if (converted != null && Number.isFinite(converted) && converted > 0) {
        setCustomValue(formatNumberForInput(converted))
      }
    }
    setCustomUnit(nextUnit)
    setUnitMenuOpen(false)
  }

  const openUnitMenu = () => {
    updateUnitMenuPosition()
    setUnitMenuOpen(v => !v)
  }

  const inlineUnitMenu = unitMenuOpen && unitMenuPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          role="listbox"
          className="fixed z-[9999] overflow-y-auto overflow-x-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{
            left: unitMenuPosition.left,
            top: unitMenuPosition.top,
            width: unitMenuPosition.width,
            maxHeight: unitMenuPosition.maxHeight,
          }}
        >
          <ChoiceSection title="Servings" choices={choiceGroups.servings} selectedChoiceId={selectedChoiceId} activeUnit={customUnit} onSelect={onInlineChoiceSelect} />
          {/* Unit group matching the food's own dimension comes first. */}
          {choiceGroups.primaryFamily === 'volume' ? (
            <>
              <ChoiceSection title="Volume" choices={choiceGroups.volume} selectedChoiceId={selectedChoiceId} activeUnit={customUnit} onSelect={onInlineChoiceSelect} />
              <ChoiceSection title="Weight" choices={choiceGroups.weight} selectedChoiceId={selectedChoiceId} activeUnit={customUnit} onSelect={onInlineChoiceSelect} />
            </>
          ) : (
            <>
              <ChoiceSection title="Weight" choices={choiceGroups.weight} selectedChoiceId={selectedChoiceId} activeUnit={customUnit} onSelect={onInlineChoiceSelect} />
              <ChoiceSection title="Volume" choices={choiceGroups.volume} selectedChoiceId={selectedChoiceId} activeUnit={customUnit} onSelect={onInlineChoiceSelect} />
            </>
          )}
        </div>,
        document.body,
      )
    : null

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className={className}>
      {isInline ? (
        <div className={`relative flex items-stretch gap-2 overflow-visible ${unitMenuOpen ? 'z-[90]' : ''}`}>
          <input
            type="text"
            inputMode="decimal"
            value={customValue}
            onChange={(e) => onCustomValueChange(e.target.value)}
            onBlur={onCustomBlur}
            placeholder={primaryOption?.label ?? 'Amount'}
            className="min-w-0 flex-[2] appearance-none rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm font-medium tabular-nums text-zinc-900 placeholder-zinc-400 outline-none transition-colors focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-400/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-500 dark:focus:border-zinc-500 dark:focus:bg-zinc-950 dark:[-webkit-text-fill-color:#f4f4f5] dark:[color-scheme:dark]"
          />
          <div className="relative min-w-[88px] flex-1 overflow-visible">
            <button
              ref={unitButtonRef}
              type="button"
              onClick={openUnitMenu}
              className="flex h-full w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-white/70 px-3 py-2 text-sm font-semibold text-zinc-800 outline-none transition-colors hover:bg-white focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/10 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900 dark:focus:border-zinc-500 dark:[color-scheme:dark]"
              aria-haspopup="listbox"
              aria-expanded={unitMenuOpen}
            >
              <span className="truncate">{unitButtonLabel}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${unitMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {inlineUnitMenu}
          </div>
        </div>
      ) : mode === 'quick' ? (
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
              className="w-24 appearance-none rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder-zinc-500 dark:[-webkit-text-fill-color:#f4f4f5] dark:[color-scheme:dark]"
            />
            <select
              value={selectedChoiceId}
              onChange={(e) => {
                const choice = dropdownChoices.find(c => c.id === e.target.value)
                if (choice) onInlineChoiceSelect(choice)
              }}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-600 dark:bg-zinc-950 dark:text-zinc-100 dark:[color-scheme:dark]"
            >
              {choiceGroups.servings.length > 0 && (
                <optgroup label="Servings">
                  {choiceGroups.servings.map(choice => (
                    <option key={choice.id} value={choice.id}>{choice.label}</option>
                  ))}
                </optgroup>
              )}
              {/* Unit group matching the food's own dimension comes first. */}
              {(choiceGroups.primaryFamily === 'volume'
                ? [['Volume', choiceGroups.volume], ['Weight', choiceGroups.weight]] as const
                : [['Weight', choiceGroups.weight], ['Volume', choiceGroups.volume]] as const
              ).map(([title, list]) => list.length > 0 && (
                <optgroup key={title} label={title}>
                  {list.map(choice => (
                    <option key={choice.id} value={choice.id}>{choice.label}</option>
                  ))}
                </optgroup>
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
    return {
      quantity,
      unit,
      multiplier: factor,
      nutrition,
      gramsPerServing: variantForMath.gramsPerServing,
      mlPerServing: variantForMath.mlPerServing,
    }
  } catch {
    // The picker's UI restricts unit choices to ones the variant can handle;
    // if we somehow get here, surface zero rather than crash.
    return zeroSelection(unit)
  }
}

function ChoiceSection({
  title,
  choices,
  selectedChoiceId,
  activeUnit,
  onSelect,
}: {
  title: string
  choices: ServingChoice[]
  selectedChoiceId: string
  /** The unit currently in the unit box — so the matching measurable row shows
   *  a ✓ too (e.g. "fl oz" when the amount is 12 fl oz), alongside the serving. */
  activeUnit?: Unit
  onSelect: (choice: ServingChoice) => void
}) {
  if (choices.length === 0) return null

  return (
    <div className="py-1">
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {title}
      </div>
      {choices.map(choice => {
        const checked = selectedChoiceId === choice.id
          || (choice.group !== 'servings' && activeUnit != null && choice.unit === activeUnit)
        return (
          <button
            key={choice.id}
            type="button"
            role="option"
            aria-selected={checked}
            onClick={() => onSelect(choice)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-800 transition-colors hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            <Check className={`h-4 w-4 shrink-0 ${checked ? 'opacity-100' : 'opacity-0'}`} />
            <span className="min-w-0 truncate">{choice.label}</span>
          </button>
        )
      })}
    </div>
  )
}
