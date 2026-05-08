"use client"

// ---------------------------------------------------------------------------
// BridgeFieldGroup — shared optional "weight per serving" / "volume per
// serving" inputs.
//
// Used by:
//   - dashboard/foods/[id]      (existing variant editor)
//   - dashboard/foods/new       (custom food creation form)
//   - recipe creators (Meal/Recipe) for the per-serving bridge override
//   - components/nutrition/EditFoodModal (per-log bridge edit, per PR 5 §5)
//
// UX contract
//   - Two freeform text inputs (mass + volume). Each accepts ANY unit in its
//     family ("3.5 oz", "100 g", "1/4 lb"; "1 cup", "240 ml", "8 fl oz").
//   - On blur or Enter, parseQuantityString converts the entry to canonical
//     grams (mass field) or millilitres (volume field). The parsed canonical
//     value is what the parent receives via onChange.
//   - If the user types a wrong-family quantity (e.g. "1 cup" in the weight
//     field), the value is auto-routed to the other field — keeps the picker
//     honest without yelling at the user.
//   - A muted readout below each input shows the canonical equivalent
//     ("= 100 g") so the user can see what's being stored.
//   - When `collapsible` is true, the whole block is wrapped in a chevron
//     toggle. Default-collapsed when both bridges are empty, expanded when
//     either is set.
// ---------------------------------------------------------------------------

import type { ReactElement } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import {
  type Unit,
  convert,
  familyOf,
  parseQuantityString,
} from '@/lib/units'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BridgeValues {
  /** Canonical: grams in one serving. */
  gramsPerServing?: number
  /** Canonical: millilitres in one serving. */
  mlPerServing?: number
}

export interface BridgeFieldGroupProps {
  /** Current canonical values. */
  value: BridgeValues
  /** Called whenever the user commits a change (blur or Enter). */
  onChange: (next: BridgeValues) => void
  /**
   * Optional context: the variant's serving unit. Drives default placeholder
   * units in each field (mass-native variants suggest "oz" for mass, etc).
   */
  servingUnit?: string
  /** Default mass display unit when field is empty. Defaults to 'g'. */
  preferredMassUnit?: 'g' | 'oz' | 'lb'
  /** Default volume display unit when field is empty. Defaults to 'ml'. */
  preferredVolumeUnit?: 'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp'
  /** Render inside a collapsible disclosure (default true). */
  collapsible?: boolean
  className?: string
  /** Optional heading override for the disclosure. */
  title?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MASS_UNIT_LABEL: Record<'g' | 'oz' | 'lb', string> = {
  g: 'g',
  oz: 'oz',
  lb: 'lb',
}
const VOLUME_UNIT_LABEL: Record<'ml' | 'fl_oz' | 'cup' | 'tbsp' | 'tsp', string> = {
  ml: 'ml',
  fl_oz: 'fl oz',
  cup: 'cup',
  tbsp: 'tbsp',
  tsp: 'tsp',
}

function placeholderForMass(servingUnit?: string): string {
  // Mass-native variants benefit from a gram default ("100 g"); volume- or
  // discrete-native ones benefit from an ounce or "3.5 oz" hint that maps to
  // typical food labels.
  const u = (servingUnit ?? '').toLowerCase()
  if (u === 'g') return '100 g'
  if (u === 'oz' || u === 'lb') return '3.5 oz'
  return '3.5 oz'
}

function placeholderForVolume(servingUnit?: string): string {
  const u = (servingUnit ?? '').toLowerCase()
  if (u === 'ml') return '240 ml'
  if (u === 'cup') return '1 cup'
  if (u === 'fl_oz' || u === 'fl oz') return '8 fl oz'
  return '1 cup'
}

/** Pretty-print a canonical value alongside a hint unit. */
function readoutFor(family: 'mass' | 'volume', value: number): string {
  if (!Number.isFinite(value) || value <= 0) return ''
  if (family === 'mass') {
    // Show grams when small/integer, otherwise "100 g". Always grams — that's
    // what's stored — so the user knows the canonical truth.
    return `= ${roundForReadout(value)} g`
  }
  return `= ${roundForReadout(value)} ml`
}

function roundForReadout(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n))
  return (Math.round(n * 10) / 10).toString()
}

/**
 * Format an initial canonical value back into the input field. We display it
 * in canonical units (g / ml) since those are what's stored — keeps the round
 * trip stable.
 */
function formatInitial(family: 'mass' | 'volume', value?: number): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return ''
  const unit = family === 'mass' ? 'g' : 'ml'
  return `${roundForReadout(value)} ${unit}`
}

interface ParseResult {
  /** The canonical mass (g) value if the entry parsed to a mass. */
  grams?: number
  /** The canonical volume (ml) value if the entry parsed to a volume. */
  ml?: number
  /** True when the user typed something but it didn't parse. */
  invalid?: boolean
  /** True when the input is empty. */
  empty?: boolean
}

function parseEntry(input: string): ParseResult {
  const trimmed = input.trim()
  if (!trimmed) return { empty: true }

  const parsed = parseQuantityString(trimmed)
  if (!parsed) return { invalid: true }

  const family = familyOf(parsed.unit)
  if (family === 'mass') {
    return { grams: convert(parsed.value, parsed.unit, 'g') }
  }
  if (family === 'volume') {
    return { ml: convert(parsed.value, parsed.unit, 'ml') }
  }
  // Discrete unit (each/slice/scoop/serving) doesn't make sense for a bridge.
  return { invalid: true }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BridgeFieldGroup({
  value,
  onChange,
  servingUnit,
  collapsible = true,
  className,
  title = 'Optional: weight / volume per serving',
}: BridgeFieldGroupProps): ReactElement {
  // Internal text state — what the user is typing. Canonical commit happens
  // on blur. `value` controls hydration only.
  const [massText, setMassText] = useState<string>(() => formatInitial('mass', value.gramsPerServing))
  const [volText, setVolText] = useState<string>(() => formatInitial('volume', value.mlPerServing))
  const [massError, setMassError] = useState<string | null>(null)
  const [volError, setVolError] = useState<string | null>(null)

  const initiallyHasValue = value.gramsPerServing != null || value.mlPerServing != null
  const [open, setOpen] = useState<boolean>(!collapsible || initiallyHasValue)

  // Re-hydrate when the upstream value changes shape (e.g. parent clears the
  // values). We intentionally do NOT wipe local typing in flight.
  useEffect(() => {
    setMassText(formatInitial('mass', value.gramsPerServing))
    setMassError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.gramsPerServing])
  useEffect(() => {
    setVolText(formatInitial('volume', value.mlPerServing))
    setVolError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.mlPerServing])

  // Live readout (unstored) for what the input currently parses to. Used to
  // render "= 100 g" beneath the field as the user types.
  const livePreview = useMemo<{ grams?: number; ml?: number; massErr?: string; volErr?: string }>(() => {
    const out: { grams?: number; ml?: number; massErr?: string; volErr?: string } = {}
    if (massText.trim()) {
      const r = parseEntry(massText)
      if (r.grams != null) out.grams = r.grams
      else if (r.ml != null) out.ml = r.ml
      else if (r.invalid) out.massErr = 'Include a unit (g, oz, lb, etc.)'
    }
    if (volText.trim()) {
      const r = parseEntry(volText)
      if (r.ml != null) {
        out.ml = r.ml
      } else if (r.grams != null) {
        out.grams = r.grams
      } else if (r.invalid) {
        out.volErr = 'Include a unit (ml, cup, fl oz, etc.)'
      }
    }
    return out
  }, [massText, volText])

  const placeholderMass = placeholderForMass(servingUnit)
  const placeholderVol = placeholderForVolume(servingUnit)

  // Commit handlers: parse + emit upstream, with cross-family routing.
  const commit = (nextMass: string, nextVol: string) => {
    let grams = value.gramsPerServing
    let ml = value.mlPerServing
    let nextMassErr: string | null = null
    let nextVolErr: string | null = null
    let normalizedMass = nextMass
    let normalizedVol = nextVol

    if (nextMass.trim() === '') {
      grams = undefined
    } else {
      const r = parseEntry(nextMass)
      if (r.grams != null) {
        grams = r.grams
        normalizedMass = formatInitial('mass', r.grams)
      } else if (r.ml != null) {
        // Cross-family routing: user typed a volume in the mass field. Move
        // it over rather than rejecting — fewer footguns.
        ml = r.ml
        normalizedMass = ''
        normalizedVol = formatInitial('volume', r.ml)
      } else if (r.invalid) {
        nextMassErr = 'Include a unit (g, oz, lb, etc.)'
      }
    }

    if (nextVol.trim() === '' && normalizedVol === nextVol) {
      // Only clear when the field still equals what we started with — avoids
      // wiping a value we just routed in from the mass field.
      ml = undefined
    } else if (normalizedVol === nextVol) {
      const r = parseEntry(nextVol)
      if (r.ml != null) {
        ml = r.ml
        normalizedVol = formatInitial('volume', r.ml)
      } else if (r.grams != null) {
        grams = r.grams
        normalizedVol = ''
        normalizedMass = formatInitial('mass', r.grams)
      } else if (r.invalid) {
        nextVolErr = 'Include a unit (ml, cup, fl oz, etc.)'
      }
    }

    setMassText(normalizedMass)
    setVolText(normalizedVol)
    setMassError(nextMassErr)
    setVolError(nextVolErr)
    onChange({ gramsPerServing: grams, mlPerServing: ml })
  }

  const handleMassBlur = () => commit(massText, volText)
  const handleVolBlur = () => commit(massText, volText)

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const fields = (
    <div className={`grid gap-3 sm:grid-cols-2 ${className ?? ''}`}>
      {/* Mass field */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Weight per serving <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          type="text"
          value={massText}
          onChange={(e) => setMassText(e.target.value)}
          onBlur={handleMassBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholderMass}
          aria-label="Weight per serving"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
        />
        <p className="mt-1 min-h-[1rem] text-[11px]">
          {massError || livePreview.massErr ? (
            <span className="text-red-500 dark:text-red-400">{massError || livePreview.massErr}</span>
          ) : livePreview.grams != null ? (
            <span className="text-zinc-500 dark:text-zinc-400">{readoutFor('mass', livePreview.grams)}</span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">e.g. {MASS_UNIT_LABEL.g}, {MASS_UNIT_LABEL.oz}, {MASS_UNIT_LABEL.lb}</span>
          )}
        </p>
      </div>

      {/* Volume field */}
      <div>
        <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Volume per serving <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          type="text"
          value={volText}
          onChange={(e) => setVolText(e.target.value)}
          onBlur={handleVolBlur}
          onKeyDown={onKeyDown}
          placeholder={placeholderVol}
          aria-label="Volume per serving"
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder-zinc-500 dark:focus:border-white dark:focus:ring-white/10"
        />
        <p className="mt-1 min-h-[1rem] text-[11px]">
          {volError || livePreview.volErr ? (
            <span className="text-red-500 dark:text-red-400">{volError || livePreview.volErr}</span>
          ) : livePreview.ml != null ? (
            <span className="text-zinc-500 dark:text-zinc-400">{readoutFor('volume', livePreview.ml)}</span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">e.g. {VOLUME_UNIT_LABEL.cup}, {VOLUME_UNIT_LABEL.ml}, {VOLUME_UNIT_LABEL.fl_oz}</span>
          )}
        </p>
      </div>
    </div>
  )

  if (!collapsible) return fields

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-1.5 rounded-md py-1.5 text-left text-xs font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open && <div className="mt-1.5">{fields}</div>}
    </div>
  )
}
