"use client"

import { useRef, useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Camera, Loader2, RotateCcw, Plus, Check, ImagePlus, PencilLine, Send, BookmarkPlus, MessageSquare, ChevronDown } from 'lucide-react'
import { resizeImageToBlob } from '@/lib/imageResize'
import { blobToDataUrl } from '@/lib/blobToBase64'
import {
  plateEstimator,
  PlateUnavailableError,
} from '@/lib/nutrition/aiEngine'
import type { PlateEstimate, EstimatedPlateItem } from '@/lib/nutrition/aiSeams'
import { getToken } from '@/lib/clientAuth'
import { Toast } from '@/components/ui'
import { useToast } from '@/hooks/useToast'
import { useLockScroll } from '@/lib/useLockScroll'
import FoodItemRow from '@/components/nutrition/FoodItemRow'
import FoodSearchModal from '@/components/nutrition/FoodSearchModal'
import type { IFoodEntry } from '@/lib/nutritionTypes'
import ServingQuantityControls from '@/components/nutrition/ServingQuantityControls'
import type { QuantityPickerVariant } from '@/components/nutrition/QuantityPicker'
import { scalingFactor, nutritionForQuantity } from '@/lib/foodMath'
import { variantForServingChoice, buildServingChoiceGroups, type ServingChoice } from '@/lib/nutrition/servingOptions'
import type { Unit } from '@/lib/units'
import type { ServingUnit } from '@/models/Food'

// ── Types ────────────────────────────────────────────────────────────────────

interface SnapPlateModalProps {
  open: boolean
  /** Initially-selected meal (default; the user can change it in the review). */
  tag: string
  /** Meal options to choose from when logging (defaults to the 4 standard meals). */
  tagOptions?: string[]
  /** YYYY-MM-DD or an ISO string used for loggedAt stamping. Pass the page's
   *  selectedDate formatted param so the log lands on the right day. */
  dateKey: string
  onClose: () => void
  /** Called after items are successfully POSTed to /api/meal-logs. */
  onLogged: () => void
  /** Which surface to open on. 'describe' jumps straight to the text flow;
   *  'compose' opens directly on a pre-selected image (see initialImage);
   *  default 'idle' shows the snap/upload/describe chooser. */
  initialPhase?: 'idle' | 'describe' | 'compose' | 'review'
  /** A data-URL image to open straight into the compose step (used when the
   *  caller — dash/search hub — already captured the photo via its own input). */
  initialImage?: string | null
  /** Prefill text for the describe flow (used when the user typed in the search
   *  box and hit the describe-send button). Implies initialPhase 'describe'. */
  initialDescribe?: string | null
  /** Pre-loaded items to open straight into the review step — used when
   *  re-opening a saved scan from history to edit before re-logging. Each item
   *  carries per-serving nutrition + servings (+ optional brand/foodId/match). */
  initialReview?: Array<{
    foodId?: string
    name: string
    brand?: string
    estimatedServing?: string
    servingSize?: number
    servingUnit?: string
    servings?: number
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
    confidence?: number
    matchKind?: 'food' | 'meal' | 'recipe'
  }> | null
  /** Full-res image URL of a re-opened saved scan (served via /api/blob). Shown
   *  as the review image so re-opening history shows the real photo. */
  initialImageUrl?: string | null
  /** When re-opening a saved estimate from history, its id — so edits/logs update
   *  that record in place instead of creating a duplicate. */
  initialScanId?: string | null
}

const STANDARD_MEALS = ['breakfast', 'lunch', 'dinner', 'snack']

/** A confident match against something we already have in the DB. */
interface DbMatch {
  kind: 'food' | 'meal' | 'recipe'
  id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  nutrition: { calories: number; protein: number; carbs: number; fats: number }
  source: string
  confidence: number
  /** Bridges + friendly label for unit-accurate alignment of the AI quantity. */
  gramsPerServing?: number
  mlPerServing?: number
  displayLabel?: string
  /** The food's named alternate servings — feeds the serving-size dropdown. */
  alternateServings?: Array<{ label: string; multiplier: number }>
}

interface ReviewItem extends EstimatedPlateItem {
  /** Amount eaten = `multiplier` of `unitLabel` (e.g. 2 kiwis, 150 g). `nutrition`
   *  is per ONE `unitLabel`. We show real amounts, never an abstract "× serving". */
  multiplier: number
  /** The natural unit a count is expressed in: a household unit (kiwi, bottle,
   *  bite, slice, cup, tbsp) or a mass/volume unit (g, ml, oz). */
  unitLabel: string
  /** Excluded by the user before logging. */
  removed: boolean
  /** Brand, when we matched the item to a branded DB food. */
  brand?: string
  /** Set once we've reconciled this item against the DB (foods/meals/recipes). */
  matchChecked?: boolean
  /** The DB item this maps to, or null when it's genuinely new (AI estimate). */
  match?: DbMatch | null
  /** A freeform friendly label the user typed (overrides the computed amount).
   *  Cleared when the user changes the count, so it never goes stale. */
  labelOverride?: string
  /** True when the matched food's serving could be reconciled with the AI's
   *  unit (real unit math, not a calorie-ratio fallback). When false, the food's
   *  serving shape is NOT trustworthy for unit conversions, so the dropdown is
   *  anchored to the AI estimate instead. */
  matchServingReliable?: boolean
  /** The serving-size dropdown choice the user picked (id from the matched
   *  food's serving options). Drives the Serving Size box selection. */
  servingChoiceId?: string
  /** The per-serving label for the picked choice ("1 cup (240 g)") — combined
   *  with the quantity to form the stored serving label. */
  servingLabelBase?: string
  /** Snapshot of the item's original (estimate/match) serving so the dropdown's
   *  always-present "current" option can restore it after the user tries other
   *  units — the friendly serving never disappears from the menu. */
  origServing?: {
    nutrition: { calories: number; protein: number; carbs: number; fats: number }
    unitLabel: string
    multiplier: number
    label: string
  }
}

type ModalState =
  | { phase: 'idle' }
  | { phase: 'describe' }
  | { phase: 'compose'; dataUrl: string }
  | { phase: 'loading'; loadingMsg: string }
  | { phase: 'error'; message: string; hint?: string }
  | { phase: 'review'; items: ReviewItem[]; imageThumb: string }
  | { phase: 'logging' }

// ── Helpers ──────────────────────────────────────────────────────────────────

function scaledNutrition(item: EstimatedPlateItem, multiplier: number) {
  const n = item.nutrition
  return {
    calories: Math.round((n.calories ?? 0) * multiplier),
    protein: Math.round((n.protein ?? 0) * multiplier * 10) / 10,
    carbs: Math.round((n.carbs ?? 0) * multiplier * 10) / 10,
    fats: Math.round((n.fats ?? 0) * multiplier * 10) / 10,
  }
}

function runningTotal(items: ReviewItem[]) {
  let calories = 0, protein = 0, carbs = 0, fats = 0
  for (const it of items) {
    if (it.removed) continue
    const s = scaledNutrition(it, it.multiplier)
    calories += s.calories
    protein += s.protein
    carbs += s.carbs
    fats += s.fats
  }
  return {
    calories: Math.round(calories),
    protein: Math.round(protein * 10) / 10,
    carbs: Math.round(carbs * 10) / 10,
    fats: Math.round(fats * 10) / 10,
  }
}

/** The model occasionally returns confidence on a 1-5 scale instead of 0-1. */
function normalizeConfidence(c: unknown): number {
  const n = typeof c === 'number' && isFinite(c) ? c : 0
  const v = n > 1 ? n / 5 : n
  return Math.max(0, Math.min(1, v))
}

// ── Amount/unit helpers — show real servings, never an abstract "× serving" ────
const MASS_UNITS = new Set(['g', 'ml', 'oz', 'kg', 'lb', 'mg', 'l'])
function normUnit(u: string): string {
  const x = u.trim().toLowerCase()
  if (x === 'gram' || x === 'grams') return 'g'
  if (x === 'milliliter' || x === 'milliliters' || x === 'millilitre' || x === 'millilitres') return 'ml'
  if (x === 'ounce' || x === 'ounces') return 'oz'
  if (x === 'liter' || x === 'liters' || x === 'litre') return 'l'
  return x
}
/** Parse an AI serving string ("1 kiwi", "6 bites", "~150 g", "1 cup (240 g)") → count + unit. */
function parseServing(s?: string): { qty: number; unit: string } {
  const str = (s || '').trim()
  const m = str.match(/^~?\s*([\d.]+)\s*(.*)$/)
  if (!m) return { qty: 1, unit: str ? normUnit(str) : 'serving' }
  const qty = parseFloat(m[1]) || 1
  let unit = normUnit(m[2].replace(/\([^)]*\)/g, '').trim()) // drop "(240 g)" parentheticals
  if (!unit) unit = 'serving'
  // Singularize simple count plurals so it reads right at any count.
  if (!MASS_UNITS.has(unit) && unit.length > 2 && unit.endsWith('s')) unit = unit.slice(0, -1)
  return { qty, unit }
}
/** "1 kiwi", "2 kiwis", "150 g", "6 bites" */
function formatAmount(qty: number, unit: string): string {
  const n = Math.round(qty * 100) / 100
  if (MASS_UNITS.has(unit)) return `${n} ${unit}`
  const label = n === 1 ? unit : (unit.endsWith('s') ? unit : `${unit}s`)
  return `${n} ${label}`
}
function stepForUnit(unit: string): number {
  if (unit === 'g' || unit === 'ml') return 10
  // 0.5 so a fractional AI estimate (0.5) walks through whole numbers:
  // 0.5 → 1 → 1.5 → 2 (was 1, which stepped 0.5 → 1.5 → 2.5, skipping wholes).
  return 0.5
}
function floorForUnit(unit: string): number {
  return MASS_UNITS.has(unit) ? stepForUnit(unit) : 0.5
}
type Macros = { calories: number; protein: number; carbs: number; fats: number }
/** Per-ONE-unit macros, given the macros for the whole `qty`-unit portion. */
function perUnitNutrition(total: Macros, qty: number): Macros {
  const q = qty > 0 ? qty : 1
  return {
    calories: (total.calories ?? 0) / q,
    protein: (total.protein ?? 0) / q,
    carbs: (total.carbs ?? 0) / q,
    fats: (total.fats ?? 0) / q,
  }
}

// ── Phase 2: align the AI's quantity to the matched food's REAL serving ───────
const DISCRETE_FOOD_UNITS = new Set<Unit>(['each', 'slice', 'scoop', 'serving'])
/** Map a parsed AI unit string to a known mass/volume Unit, or null if it's a
 *  household/count word ("kiwi", "bite") we can't convert dimensionally. */
function toKnownUnit(u: string): Unit | null {
  switch (u) {
    case 'g': return 'g'
    case 'ml': return 'ml'
    case 'oz': return 'oz'
    case 'lb': case 'pound': return 'lb'
    case 'cup': return 'cup'
    case 'tbsp': case 'tablespoon': return 'tbsp'
    case 'tsp': case 'teaspoon': return 'tsp'
    case 'fl_oz': case 'floz': return 'fl_oz'
    default: return null
  }
}
/**
 * How many of the matched food's servings the AI portion (`qty` of `aiUnit`)
 * equals — using real-unit math, NOT the calorie ratio. Returns null when the
 * units can't be reconciled (caller falls back to the calorie estimate).
 *  - mass/volume AI unit → scalingFactor (same family, or via gram/ml bridge)
 *  - household/count AI unit → align by count if the food's serving is discrete
 */
function alignedServingsOfFood(qty: number, aiUnit: string, m: DbMatch): number | null {
  const known = toKnownUnit(aiUnit)
  if (known) {
    try {
      const f = scalingFactor(
        { servingSize: m.servingSize, servingUnit: m.servingUnit as ServingUnit, nutrition: m.nutrition, gramsPerServing: m.gramsPerServing, mlPerServing: m.mlPerServing },
        qty,
        known,
      )
      return Number.isFinite(f) && f > 0 ? f : null
    } catch {
      return null // unit not reconcilable with this food (no bridge)
    }
  }
  // Count word ("1 kiwi", "6 bites") → align to a discrete-serving food by count.
  if (DISCRETE_FOOD_UNITS.has(m.servingUnit as Unit) && m.servingSize > 0) {
    return qty / m.servingSize
  }
  return null
}

/** A matched DB food → the serving-basis variant the serving-size dropdown and
 *  per-serving math run on. Returns null when there's no matched food. */
function variantFromMatch(m: DbMatch | null | undefined): QuantityPickerVariant | null {
  if (!m) return null
  return {
    servingSize: m.servingSize,
    servingUnit: m.servingUnit as ServingUnit,
    displayLabel: m.displayLabel,
    alternateServings: m.alternateServings,
    nutrition: m.nutrition,
    gramsPerServing: m.gramsPerServing,
    mlPerServing: m.mlPerServing,
  }
}

/** Every review item gets a serving-basis variant so EVERY row shows a serving
 *  dropdown — not just matched foods. For an unmatched AI item we synthesize a
 *  one-unit variant from its own estimate: when its unit is a real mass/volume
 *  unit (g, tbsp, cup…) the dropdown can offer accurate same-family conversions;
 *  a count word ("bite", "kiwi") maps to a discrete `each` so it still gets a
 *  dropdown (just its own unit). `nutrition` is per ONE unit, matching how
 *  ReviewItem stores it, so the math stays accurate to that food. */
function buildVariantForItem(item: ReviewItem): QuantityPickerVariant {
  // Use the matched food's full serving shape ONLY when it reconciled with the
  // AI's unit — otherwise its grams/serving are unreliable and the conversions
  // come out wrong (e.g. a blueberry food stored at 317 cal/100g). In that case,
  // and for unmatched items, synthesize a one-unit variant anchored to the AI's
  // own (correct) per-unit estimate so every unit scales sensibly.
  if (item.match && item.matchServingReliable) {
    const matched = variantFromMatch(item.match)
    if (matched) return matched
  }
  const known = toKnownUnit(item.unitLabel)
  return {
    servingSize: 1,
    servingUnit: (known ?? 'each') as ServingUnit,
    displayLabel: formatAmount(1, item.unitLabel),
    nutrition: item.nutrition,
  }
}

/** Which dropdown choice the item's current (quantity, unit) matches — so the
 *  serving-size dropdown checks the right row. A serving matches when BOTH its
 *  quantity and unit line up; otherwise the measurable unit row matches; else we
 *  fall back to the primary serving so the Servings section always shows one. */
function matchingChoiceId(item: ReviewItem): string | undefined {
  const groups = buildServingChoiceGroups(buildVariantForItem(item))
  const s = groups.servings.find((c) => String(c.unit) === item.unitLabel && Math.abs(c.quantity - item.multiplier) < 0.01)
  if (s) return s.id
  const u = [...groups.weight, ...groups.volume].find((c) => String(c.unit) === item.unitLabel)
  if (u) return u.id
  return groups.servings[0]?.id
}

/** Combine a per-serving label with a count: "1 cup (240 g)" + 2 → "2 × 1 cup (240 g)". */
function combinedServingLabel(base: string, count: number): string {
  const n = Math.round(count * 100) / 100
  return n === 1 ? base : `${n} × ${base}`
}

function toReviewItems(est: PlateEstimate): ReviewItem[] {
  return (est.items ?? []).map((item) => {
    const { qty, unit } = parseServing(item.estimatedServing)
    // The AI's nutrition is for the whole portion (qty units) → store per-unit.
    const perUnit = perUnitNutrition(item.nutrition, qty)
    return {
      ...item,
      nutrition: perUnit,
      confidence: normalizeConfidence(item.confidence),
      multiplier: qty,
      unitLabel: unit,
      removed: false,
      matchChecked: false,
      match: null,
      origServing: { nutrition: perUnit, unitLabel: unit, multiplier: qty, label: formatAmount(qty, unit) },
    }
  })
}

/** Build a review row from a food picked in the "Add more" search. It's a real DB
 *  food (foodId + per-serving nutrition), so it comes in pre-matched and logs
 *  exactly like the estimate's own items. `entry.nutrition` is PER-SERVING and
 *  `entry.servings` is the count, so total = nutrition × servings; the review row
 *  stores per-loggedUnit nutrition with the logged quantity as its multiplier. */
function entryToReviewItem(entry: IFoodEntry): ReviewItem {
  const servings = Number(entry.servings) || 1
  const qty = Number(entry.loggedQuantity ?? servings) || 1
  const unit = String(entry.loggedUnit ?? entry.servingUnit ?? 'serving')
  const n = entry.nutrition
  const total = {
    calories: (n.calories || 0) * servings,
    protein: (n.protein || 0) * servings,
    carbs: (n.carbs || 0) * servings,
    fats: (n.fats || 0) * servings,
  }
  const perUnit = perUnitNutrition(total, qty)
  const foodId = entry.foodId ? String(entry.foodId) : ''
  const match: DbMatch | null = foodId
    ? {
        kind: 'food',
        id: foodId,
        name: entry.name,
        brand: entry.brand,
        servingSize: Number(entry.servingSize) || 1,
        servingUnit: String(entry.servingUnit || 'serving'),
        nutrition: { calories: n.calories || 0, protein: n.protein || 0, carbs: n.carbs || 0, fats: n.fats || 0 },
        source: 'db',
        confidence: 1,
        gramsPerServing: entry.loggedGramsPerServing,
        mlPerServing: entry.loggedMlPerServing,
        displayLabel: entry.servingLabel,
      }
    : null
  return {
    name: entry.name,
    brand: entry.brand,
    estimatedServing: entry.servingLabel || formatAmount(qty, unit),
    nutrition: perUnit,
    confidence: 1,
    multiplier: qty,
    unitLabel: unit,
    removed: false,
    matchChecked: true,
    match,
    matchServingReliable: true,
    origServing: { nutrition: perUnit, unitLabel: unit, multiplier: qty, label: formatAmount(qty, unit) },
  }
}

/**
 * Per-unit nutrition, stored EXACTLY as computed.
 *
 * These values are per ONE unit and get multiplied by `servings` later, so any
 * rounding here is multiplied too. Rounding calories to a whole number turned
 * 130 cal / 325 ml = 0.4 into 0, and 0 x 325 is 0 — a coffee logged as 0 cal
 * beside 32.5 g of protein, because the macros kept one decimal and survived
 * while the calories did not.
 *
 * Four decimals was the first fix and it was still wrong in kind: an
 * intermediate value has no business being rounded at all. Precision is free
 * here and the error compounds, so keep the number and round only where a human
 * reads it.
 */
function perUnit(value: number | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Map review items → the PlateScan history item shape (used for both the
 *  generation-time save and the on-log update). Excludes removed items. */
function buildScanItems(items: ReviewItem[]) {
  return items.filter((it) => !it.removed).map((it) => {
    const n = it.nutrition
    return {
      ...(it.match?.kind === 'food' ? { foodId: it.match.id } : {}),
      name: it.name,
      ...(it.brand ? { brand: it.brand } : {}),
      estimatedServing: it.labelOverride || formatAmount(it.multiplier, it.unitLabel),
      servingSize: 1,
      servingUnit: it.unitLabel || 'serving',
      servings: it.multiplier,
      nutrition: {
        calories: perUnit(n.calories),
        protein: perUnit(n.protein),
        carbs: perUnit(n.carbs),
        fats: perUnit(n.fats),
      },
      confidence: it.confidence,
      ...(it.match ? { matchKind: it.match.kind } : {}),
    }
  })
}

function buildGenerationFeedbackMetadata(
  items: ReviewItem[],
  imageThumb: string,
  tag: string,
  scanId: string | null,
) {
  const activeItems = items.filter((it) => !it.removed)
  return {
    surface: 'snap_plate_review',
    source: imageThumb ? 'photo' : 'describe',
    tag,
    scanId: scanId ?? undefined,
    totals: runningTotal(activeItems),
    itemCount: activeItems.length,
    removedItemCount: items.length - activeItems.length,
    items: activeItems.map((it) => {
      const total = scaledNutrition(it, it.multiplier)
      return {
        name: it.name,
        brand: it.brand,
        servingLabel: it.labelOverride || formatAmount(it.multiplier, it.unitLabel),
        unitLabel: it.unitLabel,
        multiplier: it.multiplier,
        confidence: it.confidence,
        matchKind: it.match?.kind ?? null,
        matchSource: it.match?.source ?? null,
        nutrition: total,
      }
    }),
  }
}

// Reconcile AI-estimated items against the DB (foods/meals/recipes). Confident
// matches adopt the DB item's canonical name + per-serving macros and link its
// id; the portion is preserved by converting the AI's calorie estimate into a
// serving multiplier of the matched food. Unmatched items are flagged new.
async function reconcileWithDb(items: ReviewItem[]): Promise<ReviewItem[]> {
  try {
    const token = getToken()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch('/api/nutrition/foods/match', {
      method: 'POST',
      headers,
      body: JSON.stringify({ items: items.map((it) => ({ name: it.name, brand: it.brand })) }),
    })
    if (!res.ok) return items.map((it) => ({ ...it, matchChecked: true }))
    const data = await res.json().catch(() => null)
    const matches: Array<DbMatch | null> = Array.isArray(data?.matches) ? data.matches : []
    return items.map((it, i) => {
      const m = matches[i]
      if (!m) return { ...it, matchChecked: true, match: null }
      // Guard: a saved item with empty/broken macros (e.g. a 0-cal "Blueberries")
      // must NOT override a real AI estimate. If the match has no usable nutrition
      // but the AI estimated some, keep the AI estimate (treat as unmatched).
      const matchHasMacros = (m.nutrition?.calories ?? 0) > 0
        || (m.nutrition?.protein ?? 0) > 0 || (m.nutrition?.carbs ?? 0) > 0 || (m.nutrition?.fats ?? 0) > 0
      const aiHasMacros = (it.nutrition?.calories ?? 0) > 0
        || (it.nutrition?.protein ?? 0) > 0 || (it.nutrition?.carbs ?? 0) > 0 || (it.nutrition?.fats ?? 0) > 0
      if (!matchHasMacros && aiHasMacros) return { ...it, matchChecked: true, match: null }
      // Keep the AI's NATURAL portion (e.g. "1 kiwi", "6 bites") and count, but
      // adopt YOUR saved food's macros for it. Phase 2: when the AI's unit can be
      // reconciled with the food's real serving (same family, or via a gram/ml
      // bridge, or a count→discrete-serving match), use that EXACT alignment so
      // all macros come straight from your food. Otherwise fall back to bridging
      // the AI's calorie estimate into a serving multiplier. No "× of 100 g".
      const dbCal = m.nutrition?.calories ?? 0
      const qty = it.multiplier > 0 ? it.multiplier : 1
      const aiTotalCal = (it.nutrition?.calories ?? 0) * qty
      const aligned = alignedServingsOfFood(qty, it.unitLabel, m) // servings of the food, by unit math
      const totalMult = aligned != null
        ? aligned
        : (dbCal > 0 && aiTotalCal > 0 ? aiTotalCal / dbCal : qty)
      const f = totalMult / qty
      const perUnit: Macros = {
        calories: (m.nutrition.calories ?? 0) * f,
        protein: (m.nutrition.protein ?? 0) * f,
        carbs: (m.nutrition.carbs ?? 0) * f,
        fats: (m.nutrition.fats ?? 0) * f,
      }
      return {
        ...it,
        name: m.name,
        brand: m.brand,
        nutrition: perUnit, // per ONE unit, from your saved food
        // unitLabel + multiplier (the AI's natural count) are preserved.
        matchChecked: true,
        match: m,
        // Only trust the food's serving shape for unit conversions when the AI's
        // unit actually reconciled with it (aligned != null). A calorie-ratio
        // fallback means the food's grams/serving don't line up with the
        // description — using them for the dropdown produces nonsense numbers.
        matchServingReliable: aligned != null,
        // Re-snapshot to the matched serving so the dropdown's "current" option
        // restores what the user actually sees after reconcile.
        origServing: { nutrition: perUnit, unitLabel: it.unitLabel, multiplier: qty, label: formatAmount(qty, it.unitLabel) },
      }
    })
  } catch {
    return items.map((it) => ({ ...it, matchChecked: true }))
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SnapPlateModal({
  open,
  tag,
  tagOptions,
  dateKey,
  onClose,
  onLogged,
  initialPhase = 'idle',
  initialImage = null,
  initialDescribe = null,
  initialReview = null,
  initialImageUrl = null,
  initialScanId = null,
}: SnapPlateModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)   // camera (capture)
  const galleryInputRef = useRef<HTMLInputElement>(null) // upload from library (no capture)
  const [state, setState] = useState<ModalState>({ phase: 'idle' })
  const [describeText, setDescribeText] = useState('')
  const [composeNote, setComposeNote] = useState('')
  // Which meal the plate logs into — user-selectable in the review.
  const [selectedTag, setSelectedTag] = useState<string>(tag)
  // The history record id for the current estimate. Set when we first save a
  // freshly generated estimate (or when re-opening one); reused so corrections
  // and logging UPDATE that record instead of creating duplicates.
  const [savedScanId, setSavedScanId] = useState<string | null>(null)
  // The description the user typed for this estimate (describe text or photo
  // note). Kept in a ref so it survives into the background persist without
  // re-running the persist callback, and is saved to history as the scan note.
  const noteRef = useRef('')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [addMoreOpen, setAddMoreOpen] = useState(false)
  const mealOptions = tagOptions && tagOptions.length ? tagOptions : STANDARD_MEALS
  const { toast, showToast } = useToast(3500)

  useLockScroll(open)

  // Reset on close; on open, jump to the requested surface. Legitimate
  // sync-to-prop effect (modal state follows open/initialPhase/initialImage).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) { setState({ phase: 'idle' }); setDescribeText(''); setComposeNote(''); setSavedScanId(null); setFeedbackOpen(false); noteRef.current = '' }
    else {
      setSelectedTag(tag) // default to the page's time-of-day meal on open
      // Re-opening a saved estimate links its record so edits/logs update it;
      // a fresh open starts with no record (the first generation creates one).
      setSavedScanId(initialScanId ?? null)
      if (initialPhase === 'compose' && initialImage) {
        setComposeNote('')
        setState({ phase: 'compose', dataUrl: initialImage })
      } else if (initialPhase === 'review' && initialReview && initialReview.length) {
        // Re-opening a saved scan to edit: rebuild review items from the scan.
        const items: ReviewItem[] = initialReview.map((si) => ({
          name: si.name,
          brand: si.brand,
          estimatedServing: si.estimatedServing || `${si.servings ?? 1} ${si.servingUnit ?? 'serving'}`,
          nutrition: si.nutrition,
          confidence: si.confidence ?? 0.8,
          multiplier: si.servings ?? 1,
          unitLabel: si.servingUnit ?? 'serving',
          removed: false,
          matchChecked: true,
          match: si.matchKind ? {
            kind: si.matchKind,
            id: si.foodId ?? '',
            name: si.name,
            brand: si.brand,
            servingSize: si.servingSize ?? 1,
            servingUnit: si.servingUnit ?? 'serving',
            nutrition: si.nutrition,
            source: si.matchKind,
            confidence: si.confidence ?? 1,
          } : null,
          origServing: {
            nutrition: si.nutrition,
            unitLabel: si.servingUnit ?? 'serving',
            multiplier: si.servings ?? 1,
            label: formatAmount(si.servings ?? 1, si.servingUnit ?? 'serving'),
          },
        }))
        setState({ phase: 'review', items, imageThumb: initialImageUrl || '' })
      } else if (initialPhase === 'describe') {
        setDescribeText(initialDescribe ?? '')
        setState({ phase: 'describe' })
      } else {
        setState({ phase: 'idle' })
      }
    }
  }, [open, tag, initialPhase, initialImage, initialDescribe, initialReview, initialImageUrl, initialScanId])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reconcile new review items against the DB once they land (any source:
  // photo, describe, or a correction). Runs in the background; the row badges
  // update in place when it resolves. A ref guards against double-runs.
  // Save (or update) the current estimate to history. Best-effort — never blocks.
  // Every GENERATED estimate is persisted here, not just logged ones.
  const persistEstimate = useCallback(async (
    items: ReviewItem[],
    imageThumb: string,
    opts?: { mealLogId?: string; loggedAt?: string; imageUrl?: string },
  ) => {
    try {
      const scanItems = buildScanItems(items)
      if (scanItems.length === 0) return
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      // Cheap inline 256px thumbnail (photo estimates only) — no MinIO round-trip.
      let thumb: string | undefined
      if (imageThumb && imageThumb.startsWith('data:image/')) {
        try {
          const blob = await (await fetch(imageThumb)).blob()
          const small = await resizeImageToBlob(blob, { maxDim: 256, quality: 0.5 })
          thumb = await blobToDataUrl(small)
        } catch { /* no thumb */ }
      }
      const imageUrl = opts?.imageUrl || (imageThumb.startsWith('/api/blob/') ? imageThumb : undefined)
      const payload: Record<string, unknown> = {
        source: imageThumb ? 'photo' : 'describe',
        tag: selectedTag,
        items: scanItems,
        ...(noteRef.current ? { note: noteRef.current } : {}),
        ...(thumb ? { thumb } : {}),
        ...(imageUrl ? { imageUrl } : {}),
        ...(opts?.mealLogId ? { mealLogId: opts.mealLogId } : {}),
        ...(opts?.loggedAt ? { loggedAt: opts.loggedAt } : {}),
      }
      if (savedScanId) {
        await fetch(`/api/nutrition/scans/${savedScanId}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
      } else {
        const res = await fetch('/api/nutrition/scans', { method: 'POST', headers, body: JSON.stringify(payload) })
        const j = await res.json().catch(() => null)
        if (j?.scan?._id) setSavedScanId(String(j.scan._id))
      }
    } catch { /* best-effort history */ }
  }, [selectedTag, savedScanId])

  const reconcilingRef = useRef(false)
  useEffect(() => {
    if (state.phase !== 'review') { reconcilingRef.current = false; return }
    if (reconcilingRef.current) return
    if (!state.items.some((it) => !it.matchChecked)) return
    reconcilingRef.current = true
    const thumb = state.imageThumb
    reconcileWithDb(state.items).then((reconciled) => {
      reconcilingRef.current = false
      setState((prev) => (prev.phase === 'review' && prev.imageThumb === thumb
        ? { ...prev, items: reconciled }
        : prev))
      // Persist the freshly generated (now matched) estimate to history. Fresh
      // estimates have unchecked items so this only runs once per generation /
      // correction — re-opened scans (already matched) skip it.
      void persistEstimate(reconciled, thumb)
    })
  }, [state, persistEstimate])

  const pickCamera = () => fileInputRef.current?.click()
  const pickGallery = () => galleryInputRef.current?.click()

  // Shared loading→review/error wrapper for any estimate source.
  //
  // Two different failures used to print the same sentence, and the sentence
  // blamed the member either way:
  //
  //   1. The model answered and found nothing in what they gave us. Asking for
  //      more detail is the right response.
  //   2. Nothing came back at all — the AI backend was down, over its spend cap,
  //      or timed out. Asking for more detail sends someone off rewriting a
  //      perfectly good description against a service that is not answering.
  //
  // Those are distinguishable for free: aiEngine RETURNS `items: []` for (1) and
  // THROWS for (2), because it only throws when no usable response arrived. So
  // the catch branch is the service-fault branch by construction, and it says so.
  //
  // (2) is not hypothetical: on 2026-08-13 the Gemini spend cap was hit and every
  // estimate failed for ~4.5h while telling members their descriptions were the
  // problem.
  const runEstimate = useCallback(async (
    make: () => Promise<PlateEstimate>,
    imageThumb: string,
    failMsg: string,
    loadingMsg = 'Reading your plate…',
    /** Photo-only advice. Must stay off the text path, where it is a non-sequitur. */
    failHint?: string,
  ) => {
    setState({ phase: 'loading', loadingMsg })
    try {
      const estimate = await make()
      if (!estimate.items || estimate.items.length === 0) {
        setState({ phase: 'error', message: failMsg, hint: failHint })
        return
      }
      setState({ phase: 'review', items: toReviewItems(estimate), imageThumb })
    } catch (err) {
      if (!(err instanceof PlateUnavailableError)) console.error('[SnapPlateModal] estimate error', err)
      setState({
        phase: 'error',
        message: "Couldn't reach the food AI just now.",
        hint: 'That one is on our end, not yours. Give it a minute and try again.',
      })
    }
  }, [])

  const handleDescribe = () => {
    const t = describeText.trim()
    if (!t) return
    noteRef.current = t
    runEstimate(
      () => plateEstimator.estimateFromText({ description: t }, { userId: '' }),
      '',
      "Couldn't estimate that. Try adding a little more detail.",
      'Estimating…',
    )
  }

  // Submit the compose phase: photo + optional note → vision estimate.
  const handleComposeEstimate = (dataUrl: string, note: string) => {
    const noteArg = note.trim() || undefined
    noteRef.current = noteArg ?? ''
    runEstimate(
      () => plateEstimator.estimate(dataUrl, { userId: '' }, noteArg),
      dataUrl,
      "Couldn't read that plate.",
      'Reading your plate…',
      'For best results, use good lighting and show the whole plate.',
    )
  }

  // Correct a prior estimate by text. On failure, stays on review + shows a toast.
  // If it came from a PHOTO, re-run the vision pass with the original image + correction
  // as a note (best accuracy). If text-only (no image), refine via the text task.
  const handleCorrect = useCallback(async (priorItems: ReviewItem[], imageThumb: string, correction: string) => {
    const c = correction.trim()
    if (!c) return
    setState({ phase: 'loading', loadingMsg: 'Applying correction…' })
    try {
      let estimate: PlateEstimate
      if (imageThumb.startsWith('data:')) {
        estimate = await plateEstimator.estimate(imageThumb, { userId: '' }, c)
      } else {
        const prior: EstimatedPlateItem[] = priorItems
          .filter((it) => !it.removed)
          .map(({ name, estimatedServing, nutrition, confidence }) => ({ name, estimatedServing, nutrition, confidence }))
        estimate = await plateEstimator.estimateFromText({ priorEstimate: prior, correction: c }, { userId: '' })
      }
      if (!estimate.items || estimate.items.length === 0) {
        // The model answered and could not act on the wording. Rephrasing helps.
        setState({ phase: 'review', items: priorItems, imageThumb })
        showToast("Couldn't apply that. Try rephrasing.", 'error')
        return
      }
      setState({ phase: 'review', items: toReviewItems(estimate), imageThumb })
    } catch (err) {
      if (!(err instanceof PlateUnavailableError)) console.error('[SnapPlateModal] correction error', err)
      // Nothing came back at all. Rephrasing cannot fix a backend that is not
      // answering, so do not ask for it. See runEstimate for the full reasoning.
      setState({ phase: 'review', items: priorItems, imageThumb })
      showToast("Couldn't reach the food AI. Try again in a minute.", 'error')
    }
  }, [showToast])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input value so the same photo can be re-picked if needed.
    e.target.value = ''
    if (!file) {
      // User cancelled the native picker — return to the chooser (don't close).
      setState({ phase: 'idle' })
      return
    }

    // Briefly show loading while resizing, then drop into the compose step.
    setState({ phase: 'loading', loadingMsg: 'Preparing image…' })

    try {
      const resized = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
      const dataUrl = await blobToDataUrl(resized)
      setComposeNote('')
      setState({ phase: 'compose', dataUrl })
    } catch (err) {
      console.error('[SnapPlateModal] image resize error', err)
      setState({ phase: 'error', message: 'Could not load that image. Please try again.' })
    }
  }, [])

  const handleRetry = () => {
    // No chooser anymore — exit so the user re-taps Snap/Upload/Describe (each a
    // direct action). Avoids surfacing an intermediate picker screen.
    onClose()
  }

  const setMultiplier = (idx: number, delta: number) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) => {
        if (i !== idx) return it
        const multiplier = Math.max(floorForUnit(it.unitLabel), parseFloat((it.multiplier + delta).toFixed(2)))
        // When a DB serving is selected, keep the combined "N × serving" label in
        // sync; otherwise clear any stale freeform label.
        const labelOverride = it.servingLabelBase ? combinedServingLabel(it.servingLabelBase, multiplier) : undefined
        return { ...it, multiplier, labelOverride }
      }),
    })
  }

  const setItemLabel = (idx: number, label: string) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) => (i === idx ? { ...it, labelOverride: label } : it)),
    })
  }

  // Restore the item's original serving (the dropdown's persistent "current"
  // option). Lets the user back out of a unit change without losing the
  // friendly serving.
  const resetServing = (idx: number) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) => {
        if (i !== idx || !it.origServing) return it
        const o = it.origServing
        return {
          ...it,
          nutrition: o.nutrition,
          unitLabel: o.unitLabel,
          multiplier: o.multiplier,
          labelOverride: o.label,
          servingChoiceId: undefined,
          servingLabelBase: undefined,
        }
      }),
    })
  }

  // Pick a serving size from the matched food's serving options. Recomputes the
  // item's PER-SERVING nutrition for that choice and resets the count to 1 (one
  // serving), mirroring how the reference UI behaves.
  const setServing = (idx: number, choice: ServingChoice) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) => {
        if (i !== idx) return it
        const variant = buildVariantForItem(it)
        // One "serving" = `choice.quantity` of `choice.unit`. Apply any bridge the
        // choice carries (e.g. a label-derived grams-per-cup) before the math.
        const vForMath = variantForServingChoice({
          servingSize: variant.servingSize,
          servingUnit: variant.servingUnit,
          nutrition: variant.nutrition,
          gramsPerServing: variant.gramsPerServing,
          mlPerServing: variant.mlPerServing,
        }, choice)
        // Servings are SHORTCUTS: picking one fills the Quantity box with the
        // serving's amount and selects its measurable unit (e.g. "1 portion
        // (112 g)" → quantity 112, unit g). We store per-ONE-unit nutrition ×
        // multiplier so the two inputs (quantity + unit) are the real state and
        // a serving shows checked whenever they line up with it.
        let perUnit: Macros
        try {
          perUnit = nutritionForQuantity(vForMath, 1, choice.unit)
        } catch {
          return it // unit not reconcilable with this food — leave unchanged
        }
        const multiplier = choice.quantity > 0 ? choice.quantity : 1
        return {
          ...it,
          nutrition: perUnit,
          unitLabel: String(choice.unit),
          multiplier,
          servingChoiceId: choice.id,
          servingLabelBase: choice.label,
          // Serving picks keep the friendly label; a raw unit pick lets the
          // amount+unit render naturally.
          labelOverride: choice.group === 'servings' ? choice.label : undefined,
        }
      }),
    })
  }

  const toggleRemove = (idx: number) => {
    if (state.phase !== 'review') return
    setState({
      ...state,
      items: state.items.map((it, i) =>
        i === idx ? { ...it, removed: !it.removed } : it
      ),
    })
  }

  const handleLog = async () => {
    if (state.phase !== 'review') return
    // Capture before state transition so we can restore on failure.
    const allItems = state.items
    const imageThumb = state.imageThumb
    const activeItems = allItems.filter((it) => !it.removed)
    if (activeItems.length === 0) {
      showToast('Remove all items? Add at least one to log.', 'error')
      return
    }

    const restoreReview = () => setState({ phase: 'review', items: allItems, imageThumb })

    setState({ phase: 'logging' })

    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      // loggedAt: if dateKey is today use now, otherwise stamp at noon of that date.
      const todayKey = (() => {
        const d = new Date()
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, '0')
        const dy = String(d.getDate()).padStart(2, '0')
        return `${y}-${mo}-${dy}`
      })()
      const loggedAt = dateKey === todayKey
        ? new Date().toISOString()
        : `${dateKey}T12:00:00.000Z`

      // Store PER-SERVING nutrition + servings (the server multiplies the two
      // for totals — storing pre-scaled nutrition AND servings double-counted).
      // Matched items link their DB foodId and carry the DB serving unit.
      const mealItems = activeItems.map((it) => {
        const n = it.nutrition // per ONE unit
        return {
          ...(it.match?.kind === 'food' ? { foodId: it.match.id } : {}),
          name: it.name,
          ...(it.brand ? { brand: it.brand } : {}),
          // Log in the item's natural unit: 1 unit × `servings` count.
          servingSize: 1,
          servingUnit: it.unitLabel || 'serving',
          servingLabel: it.labelOverride || formatAmount(it.multiplier, it.unitLabel),
          servings: it.multiplier,
          nutrition: {
            calories: perUnit(n.calories),
            protein: perUnit(n.protein),
            carbs: perUnit(n.carbs),
            fats: perUnit(n.fats),
          },
        }
      })

      const res = await fetch('/api/meal-logs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: mealItems,
          tags: [selectedTag],
          loggedAt,
          // Capture provenance → day view groups a multi-food capture under a
          // source-colored card. imageThumb covers snap + upload; else describe.
          source: imageThumb ? 'photo' : 'describe',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const msg = data?.error ? `Failed to log: ${data.error}` : 'Failed to log. Please try again.'
        showToast(msg, 'error')
        restoreReview()
        return
      }

      // Update this estimate's history record (created at generation time) with the
      // final items + the meal-log link + a full-res image. Best-effort.
      const logData = await res.json().catch(() => null)
      const mealLogId = logData?.mealLog?._id ?? logData?._id
      // Full-res image → blob storage. On a fresh capture `imageThumb` is a
      // ~1024px data: URL we upload to MinIO; on a re-opened scan it's already
      // an /api/blob URL we reuse.
      let imageUrl: string | undefined
      if (imageThumb && imageThumb.startsWith('/api/blob/')) {
        imageUrl = imageThumb
      } else if (imageThumb && imageThumb.startsWith('data:image/')) {
        try {
          const blob = await (await fetch(imageThumb)).blob()
          const fd = new FormData()
          fd.append('file', new File([blob], 'scan.jpg', { type: blob.type || 'image/jpeg' }))
          const up = await fetch('/api/nutrition/scans/image', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            body: fd,
          })
          if (up.ok) { const j = await up.json().catch(() => null); imageUrl = j?.imageUrl || undefined }
        } catch { /* no full-res — fall back to the inline thumb */ }
      }
      void persistEstimate(activeItems, imageThumb, { mealLogId, loggedAt, imageUrl })

      showToast(`${activeItems.length} item${activeItems.length === 1 ? '' : 's'} logged`, 'success')
      onLogged()
      onClose()
    } catch (err) {
      console.error('[SnapPlateModal] log error', err)
      showToast('Failed to log. Check your connection.', 'error')
      restoreReview()
    }
  }

  // Save the current items as a reusable meal/recipe template (does NOT log).
  // Returns true on success so the footer can collapse its name input.
  const handleSaveRecipe = async (name: string): Promise<boolean> => {
    if (state.phase !== 'review') return false
    const activeItems = state.items.filter((it) => !it.removed)
    if (activeItems.length === 0) {
      showToast('Add at least one item first.', 'error')
      return false
    }
    const items = activeItems.map((it) => {
      const n = it.nutrition // per ONE unit
      return {
        ...(it.match?.kind === 'food' ? { foodId: it.match.id } : {}),
        name: it.name,
        ...(it.brand ? { brand: it.brand } : {}),
        servingSize: 1,
        servingUnit: it.unitLabel || 'serving',
        servings: it.multiplier,
        nutrition: {
          calories: perUnit(n.calories),
          protein: perUnit(n.protein),
          carbs: perUnit(n.carbs),
          fats: perUnit(n.fats),
        },
      }
    })
    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/meals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: name.trim(), items, defaultTag: selectedTag }),
      })
      if (res.status === 402 || res.status === 403) {
        showToast('Saving meals needs a Plus plan.', 'error')
        return false
      }
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        showToast(d?.error ? `Couldn't save: ${d.error}` : "Couldn't save meal.", 'error')
        return false
      }
      const data = await res.json().catch(() => null)
      const mealId = data?.meal?._id
      showToast(`Saved "${name.trim()}" to your meals`, 'success')
      // Take the user straight to the saved meal (where they can also delete it).
      onClose()
      if (mealId) router.push(`/dashboard/meals/${mealId}`)
      return true
    } catch (err) {
      console.error('[SnapPlateModal] save meal error', err)
      showToast("Couldn't save meal. Check your connection.", 'error')
      return false
    }
  }

  if (!open) return null

  return (
    <>
      {/* Hidden inputs — camera (capture) and library upload (no capture). */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-zinc-900 sm:items-center sm:justify-center sm:bg-black/60 sm:backdrop-blur-sm sm:p-4 touch-none"
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="relative flex h-full w-full flex-col sm:h-auto sm:max-h-[85vh] sm:max-w-lg sm:overflow-hidden sm:rounded-2xl sm:bg-white sm:shadow-2xl sm:dark:bg-zinc-900"
            >
              {/* Header */}
              <div className="shrink-0 flex items-center justify-between border-b border-zinc-200 px-4 py-4 dark:border-zinc-800">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    {state.phase === 'describe'
                      ? <PencilLine className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      : <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-zinc-900 dark:text-white">
                      {state.phase === 'describe' ? 'Describe your meal' : 'Your plate'}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {state.phase === 'describe' ? 'Add a photo too, or just use your words' : 'AI estimate — tweak before logging'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* Idle — choose camera, upload, or describe */}
                {state.phase === 'idle' && (
                  <div className="flex flex-col items-center justify-center gap-6 py-16 px-6 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
                      <Camera className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">Snap or upload your plate</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        Take a photo, pick one from your library, or just describe what you ate.
                      </p>
                    </div>
                    <div className="flex w-full max-w-xs flex-col gap-2.5">
                      <button
                        onClick={pickCamera}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
                      >
                        <Camera className="h-4 w-4" />
                        Take photo
                      </button>
                      <button
                        onClick={pickGallery}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <ImagePlus className="h-4 w-4" />
                        Upload photo
                      </button>
                      <button
                        onClick={() => setState({ phase: 'describe' })}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                      >
                        <PencilLine className="h-4 w-4" />
                        Describe it instead
                      </button>
                    </div>
                  </div>
                )}

                {/* Describe — confirm the text, optionally add a photo, estimate. */}
                {state.phase === 'describe' && (
                  <div className="flex flex-col gap-4 px-6 py-10">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
                        <PencilLine className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="font-semibold text-zinc-900 dark:text-white">Describe your meal</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                        In your words — add a photo too, or just estimate from the text.
                      </p>
                    </div>
                    <textarea
                      value={describeText}
                      onChange={(e) => setDescribeText(e.target.value)}
                      autoFocus
                      rows={4}
                      placeholder="Describe your whole meal — the food and portions, plus any sauces, dressings, sides and drinks. e.g. chicken burrito bowl with rice, black beans, guac and salsa, and a large iced tea"
                      className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                    />
                    {/* Optional photo — carries the typed text as the note into the
                        compose/estimate step (the photo + your words together). */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setComposeNote(describeText); pickCamera() }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <Camera className="h-4 w-4" /> Add photo
                      </button>
                      <button
                        onClick={() => { setComposeNote(describeText); pickGallery() }}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        <ImagePlus className="h-4 w-4" /> Upload photo
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={onClose}
                        className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleDescribe}
                        disabled={!describeText.trim()}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Estimate
                      </button>
                    </div>
                  </div>
                )}

                {/* Compose — image preview + optional note before estimating */}
                {state.phase === 'compose' && (
                  <ComposeBody
                    dataUrl={state.dataUrl}
                    note={composeNote}
                    onNoteChange={setComposeNote}
                    onBack={onClose}
                    onEstimate={() => handleComposeEstimate(state.dataUrl, composeNote)}
                  />
                )}

                {/* Loading */}
                {state.phase === 'loading' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-900/20">
                      <Loader2 className="h-7 w-7 animate-spin text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">{state.loadingMsg}</p>
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">This can take up to 30 seconds.</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {state.phase === 'error' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20">
                      <Camera className="h-7 w-7 text-amber-500 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-900 dark:text-white">{state.message}</p>
                      {state.hint && (
                        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{state.hint}</p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={handleRetry}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Try again
                      </button>
                      <button
                        onClick={onClose}
                        className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}

                {/* Review */}
                {state.phase === 'review' && (
                  <ReviewBody
                    items={state.items}
                    imageThumb={state.imageThumb}
                    onSetMultiplier={setMultiplier}
                    onSetLabel={setItemLabel}
                    onSetServing={setServing}
                    onResetServing={resetServing}
                    onToggleRemove={toggleRemove}
                    onCorrect={(text) => handleCorrect(state.items, state.imageThumb, text)}
                    onFeedback={() => setFeedbackOpen(true)}
                    onAddMore={() => setAddMoreOpen(true)}
                  />
                )}

                {state.phase === 'logging' && (
                  <div className="flex flex-col items-center justify-center gap-4 py-20 px-6 text-center">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">Logging&hellip;</p>
                  </div>
                )}
              </div>

              {/* Footer CTA — only on review */}
              {state.phase === 'review' && (
                <ReviewFooter
                  items={state.items}
                  tag={selectedTag}
                  mealOptions={mealOptions}
                  onSelectTag={setSelectedTag}
                  onLog={handleLog}
                  onSaveRecipe={handleSaveRecipe}
                  onRetry={handleRetry}
                />
              )}
            </motion.div>

            {state.phase === 'review' && (
              <GenerationFeedbackModal
                open={feedbackOpen}
                items={state.items}
                imageThumb={state.imageThumb}
                tag={selectedTag}
                scanId={savedScanId}
                onClose={() => setFeedbackOpen(false)}
                onSent={() => showToast('Feedback saved. Thank you.', 'success')}
              />
            )}

            {/* Add more — search + barcode only. Snap/upload/describe are withheld
                because they re-enter the plate estimator (that's the loop this
                mode exists to avoid); a barcode just resolves to one known food.
                The picked food becomes another row on the plate, logged with
                everything else. */}
            <FoodSearchModal
              isOpen={addMoreOpen && state.phase === 'review'}
              searchOnly
              currentTag={selectedTag}
              showTagPicker={false}
              onClose={() => setAddMoreOpen(false)}
              onSelectFood={(entry) => {
                setState((prev) => (prev.phase === 'review'
                  ? { ...prev, items: [...prev.items, entryToReviewItem(entry as IFoodEntry)] }
                  : prev))
                setAddMoreOpen(false)
                showToast('Added to your plate.', 'success')
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <Toast toast={toast} />
    </>
  )
}

// ── ComposeBody ───────────────────────────────────────────────────────────────

interface ComposeBodyProps {
  dataUrl: string
  note: string
  onNoteChange: (v: string) => void
  onBack: () => void
  onEstimate: () => void
}

function ComposeBody({ dataUrl, note, onNoteChange, onBack, onEstimate }: ComposeBodyProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Image preview */}
      <div className="relative overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" style={{ height: 200 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt="Your photo"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
      </div>

      {/* Optional description */}
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Add a note <span className="font-normal text-zinc-400 dark:text-zinc-500">(optional)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          rows={3}
          placeholder="Describe your meal and/or add anything the photo misses — sauces, sides, drinks, portions…"
          className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="inline-flex items-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Back
        </button>
        <button
          onClick={onEstimate}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
        >
          <Camera className="h-4 w-4" />
          Estimate
        </button>
      </div>
    </div>
  )
}

// ── ReviewBody ────────────────────────────────────────────────────────────────

interface ReviewBodyProps {
  items: ReviewItem[]
  imageThumb: string
  onSetMultiplier: (idx: number, delta: number) => void
  onSetLabel: (idx: number, label: string) => void
  onSetServing: (idx: number, choice: ServingChoice) => void
  onResetServing: (idx: number) => void
  onToggleRemove: (idx: number) => void
  onCorrect: (text: string) => void
  onFeedback: () => void
  onAddMore: () => void
}

function ReviewBody({ items, imageThumb, onSetMultiplier, onSetLabel, onSetServing, onResetServing, onToggleRemove, onCorrect, onFeedback, onAddMore }: ReviewBodyProps) {
  const [fix, setFix] = useState('')
  // Serving/quantity boxes collapse by default so more items fit at a glance;
  // tapping a row's amount reveals its two editors.
  const [openRows, setOpenRows] = useState<Set<number>>(new Set())
  const toggleRow = (idx: number) => setOpenRows((prev) => {
    const next = new Set(prev)
    if (next.has(idx)) next.delete(idx); else next.add(idx)
    return next
  })

  const submitFix = () => {
    const t = fix.trim()
    if (!t) return
    setFix('')
    onCorrect(t)
  }

  return (
    <div className="space-y-1 pb-2">
      {/* Thumb — only when this estimate came from a photo. `imageThumb` is a
          data: URL on a fresh capture, or an /api/blob URL on a re-opened scan. */}
      {(imageThumb.startsWith('data:') || imageThumb.startsWith('/api/blob/')) && (
        <div className="relative mx-4 mt-4 mb-2 overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800" style={{ height: 140 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageThumb}
            alt="Your plate"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <p className="absolute bottom-2 left-3 text-xs font-medium text-white/80">
            AI estimate &mdash; adjust if needed
          </p>
        </div>
      )}

      {/* Correct via text */}
      <div className="mx-4 mt-4 mb-1 flex items-center gap-2">
        <input
          value={fix}
          onChange={(e) => setFix(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitFix() }}
          placeholder="Not right? e.g. &quot;it was 6 tacos&quot;"
          className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-400 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
        />
        <button
          onClick={submitFix}
          disabled={!fix.trim()}
          aria-label="Apply correction"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Item rows — each food in its own card so the separation is distinct. */}
      <div className="space-y-2.5 px-4">
        {items.map((item, idx) => {
          const scaled = scaledNutrition(item, item.multiplier)
          const badges = item.match
            ? [{ label: item.match.kind === 'food' ? 'In your foods' : item.match.kind === 'recipe' ? 'Recipe' : 'Your meal', tone: 'green' as const }]
            : item.matchChecked
              ? [{ label: 'New', tone: 'zinc' as const }]
              : []
          // Every item gets a serving-basis variant → every row shows a dropdown.
          const variant = buildVariantForItem(item)
          return (
            <div
              key={idx}
              className={`rounded-2xl border px-3 pt-2 pb-3 transition-colors ${
                item.removed
                  ? 'border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40'
                  : 'border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900'
              }`}
            >
              {/* Header + macros + remove. Serving/quantity editing lives in the
                  two boxes below, so the row itself is display-only. */}
              <FoodItemRow
                layout="review"
                name={item.name}
                brand={item.brand}
                calories={scaled.calories}
                macros={{ protein: scaled.protein, carbs: scaled.carbs, fats: scaled.fats }}
                confidence={item.confidence}
                badges={badges}
                dimmed={item.removed}
                onRemove={() => onToggleRemove(idx)}
              />
              {!item.removed && (() => {
                const open = openRows.has(idx)
                const summary = item.labelOverride || formatAmount(item.multiplier, item.unitLabel)
                return (
                  <>
                    {/* Collapsed by default — tap to reveal the serving + quantity
                        editors so more items are visible at first glance. */}
                    <button
                      type="button"
                      onClick={() => toggleRow(idx)}
                      aria-expanded={open}
                      className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      <span className="truncate">{summary}</span>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <ServingQuantityControls
                        variant={variant}
                        servingChoiceId={matchingChoiceId(item)}
                        servingLabel={summary}
                        originalLabel={item.origServing?.label}
                        count={item.multiplier}
                        stepDelta={stepForUnit(item.unitLabel)}
                        stepFloor={floorForUnit(item.unitLabel)}
                        onSelectServing={(choice) => onSetServing(idx, choice)}
                        onResetToOriginal={() => onResetServing(idx)}
                        onStep={(delta) => onSetMultiplier(idx, delta)}
                        onFreeformLabel={(label) => onSetLabel(idx, label)}
                      />
                    )}
                  </>
                )
              })()}
            </div>
          )
        })}
      </div>

      <div className="mx-4 mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-400">
        <p>
          These foods are a best guess. Check portions before logging, and{' '}
          <button
            type="button"
            onClick={onFeedback}
            className="font-semibold text-emerald-700 underline underline-offset-2 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
          >
            send feedback
          </button>
          {' '}if this estimate missed.
        </p>
      </div>

      {/* Add more — search-only add for a food the estimate missed. Opens the
          regular tracking search minus photo/upload/describe so you can't loop
          back into another AI capture. */}
      <button
        type="button"
        onClick={onAddMore}
        className="mx-4 mt-2 flex w-[calc(100%-2rem)] items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-transparent px-3 py-3 text-sm font-medium text-zinc-600 transition-colors hover:border-emerald-400 hover:text-emerald-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-emerald-500 dark:hover:text-emerald-300"
      >
        <Plus className="h-4 w-4" />
        <span>Missing something? <span className="font-semibold">Add here</span></span>
      </button>
    </div>
  )
}

// ── GenerationFeedbackModal ──────────────────────────────────────────────────

interface GenerationFeedbackModalProps {
  open: boolean
  items: ReviewItem[]
  imageThumb: string
  tag: string
  scanId: string | null
  onClose: () => void
  onSent: () => void
}

function GenerationFeedbackModal({ open, items, imageThumb, tag, scanId, onClose, onSent }: GenerationFeedbackModalProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setMessage('')
        setSending(false)
        setSent(false)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = async () => {
    const text = message.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'nutrition_generation',
          message: text,
          metadata: buildGenerationFeedbackMetadata(items, imageThumb, tag, scanId),
        }),
      })
      if (!res.ok) throw new Error('feedback failed')
      setSent(true)
      onSent()
      setTimeout(onClose, 700)
    } catch {
      setSending(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-[90] flex items-end justify-center bg-black/45 px-4 py-4 backdrop-blur-sm sm:items-center"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            {sent ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                  <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Feedback saved</p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900 dark:text-white">Improve this estimate</h3>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        Tell us what was wrong. We will save it with this generated food list.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label="Close feedback"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  autoFocus
                  placeholder="Example: It was 6 tacos, not 2, and the chips were a small handful."
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500 dark:focus:bg-zinc-800"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-400">{message.length}/2000</span>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!message.trim() || sending}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── ReviewFooter ──────────────────────────────────────────────────────────────

interface ReviewFooterProps {
  items: ReviewItem[]
  tag: string
  mealOptions: string[]
  onSelectTag: (t: string) => void
  onLog: () => void
  onSaveRecipe: (name: string) => Promise<boolean>
  onRetry: () => void
}

function ReviewFooter({ items, tag, mealOptions, onSelectTag, onLog, onSaveRecipe, onRetry }: ReviewFooterProps) {
  const totals = runningTotal(items)
  const activeCount = items.filter((it) => !it.removed).length
  const [saveOpen, setSaveOpen] = useState(false)
  const [recipeName, setRecipeName] = useState('')
  const [saving, setSaving] = useState(false)

  const submitRecipe = async () => {
    if (!recipeName.trim() || saving) return
    setSaving(true)
    const ok = await onSaveRecipe(recipeName)
    setSaving(false)
    if (ok) { setSaveOpen(false); setRecipeName('') }
  }

  return (
    <div className="shrink-0 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
      {/* Meal picker — which meal this plate logs into */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
        {mealOptions.map((m) => {
          const active = m === tag
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSelectTag(m)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                active
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
              }`}
            >
              {m}
            </button>
          )
        })}
      </div>

      {/* Running total */}
      <div className="mb-3 flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {activeCount} item{activeCount === 1 ? '' : 's'}
        </span>
        <div className="text-right">
          <span className="text-sm font-bold tabular-nums text-zinc-900 dark:text-white">{totals.calories} cal</span>
          <span className="ml-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            P {totals.protein}g &middot; C {totals.carbs}g &middot; F {totals.fats}g
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onRetry}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
          aria-label="Take new photo"
          title="Take a new photo"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={onLog}
          disabled={activeCount === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          <Plus className="h-4 w-4" />
          Add to <span className="capitalize">{tag}</span>
        </button>
      </div>

      {/* Save as meal — a reusable named group of foods you can re-log later */}
      {saveOpen ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            value={recipeName}
            onChange={(e) => setRecipeName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitRecipe() }}
            placeholder="Meal name"
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
          />
          <button
            onClick={submitRecipe}
            disabled={!recipeName.trim() || saving}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </button>
          <button
            onClick={() => { setSaveOpen(false); setRecipeName('') }}
            disabled={saving}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setSaveOpen(true)}
          disabled={activeCount === 0}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold text-zinc-500 transition-colors hover:text-zinc-800 disabled:opacity-50 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Save as meal
        </button>
      )}
    </div>
  )
}
