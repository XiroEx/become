// ---------------------------------------------------------------------------
// usdaSynthMerge — at search time, consolidate same-`groupKey` non-Branded
// USDA results into a single synthetic entry with multiple variants. Mirrors
// what `importFromUSDA` will eventually do server-side once the background
// import runs, so a user's FIRST search of "coffee" sees one consolidated
// "Coffee" row instead of 10 fragmented "Beverages, coffee, *" rows.
//
// Only a presentation-time pass — nothing is persisted from here. The
// background import in the search route still walks every member fdcId so
// the persisted Food doc matches what we showed.
// ---------------------------------------------------------------------------

import { MappedFoodResult } from '@/lib/usda'
import { baseGroupKey, prettifyGroupKey } from '@/lib/foodGrouping'
import {
  deriveVariantName,
  MAX_VARIANTS_PER_FOOD,
} from '@/lib/foodImport'

// Same regex `importFromUSDA` uses to pull the trailing prep-state qualifier
// off the canonical name ("Bananas, raw" → "Bananas"). Inlined here so a
// single source of truth isn't required across files — both call sites are
// now in sync.
const TRAILING_QUALIFIER_RE = /,\s*[a-z][a-z\s\-/]*$/i

function strippedName(name: string): string {
  return (name || '').replace(TRAILING_QUALIFIER_RE, '').trim() || name
}

/** Variant payload mirroring the shape of `IFoodVariant` that
 *  `flattenFoodForResponse` emits in the `variants` field. Synthetic entries
 *  build these in-memory so the client picker treats them identically to
 *  real persisted variants. */
export interface SynthVariant {
  name: string
  isDefault: boolean
  servingSize: number
  servingUnit: string
  displayLabel?: string
  alternateServings?: { label: string; multiplier: number }[]
  nutrition: MappedFoodResult['nutrition']
  gramsPerServing?: number
  mlPerServing?: number
  externalId?: string
  externalDataType?: string
}

/**
 * The shape we return from the synth pass. It's a `MappedFoodResult` (so
 * downstream ranking / sort / filter code keeps working) with an optional
 * `variants` array attached for the consolidated case.
 */
export type SynthMergedResult = MappedFoodResult & {
  variants?: SynthVariant[]
  /** Human-friendly displayLabel for the synthetic primary's row. */
  displayLabel?: string
}

export interface SynthMergeOutput {
  /** Entries to surface in the search response, in the same order as input. */
  entries: SynthMergedResult[]
  /** Member fdcIds that were folded into a synthetic primary. The route
   *  passes these to the background import queue so every member gets
   *  imported (and merged via importFromUSDA's groupKey logic) into the
   *  same parent the user just saw. */
  additionalFdcIds: string[]
}

function fdcIdOf(r: MappedFoodResult): string | null {
  if (typeof r._id !== 'string' || !r._id.startsWith('usda-')) return null
  const fdcId = r._id.slice('usda-'.length)
  return fdcId || null
}

/**
 * Consolidate same-groupKey non-Branded USDA results into one synthetic Food
 * with multiple variants. Single-member groups + Branded products + tiny
 * groupKeys pass through unchanged.
 *
 * @param results - Results from `searchUSDA(query)`.
 * @param knownVariantExternalIds - fdcIds we already have persisted (as
 *   variants of an existing parent Food). Members in this set are dropped
 *   before merging — the existing parent will surface via customFoods.
 */
export function synthMergeUsdaResults(
  results: MappedFoodResult[],
  knownVariantExternalIds: Set<string>,
): SynthMergeOutput {
  const additionalFdcIds: string[] = []

  // Pre-filter: drop entries that are already represented as variants on an
  // existing Food. (The route's downstream filter does this too, but doing
  // it here means we don't accidentally synth-merge around an entry that
  // was going to be removed anyway.)
  const filtered: MappedFoodResult[] = []
  for (const r of results) {
    const fdc = fdcIdOf(r)
    if (fdc && knownVariantExternalIds.has(fdc)) continue
    filtered.push(r)
  }

  // Group the eligible (non-Branded, real groupKey) results by groupKey.
  // Track ineligible entries (Branded, no-groupKey) by ORIGINAL position so
  // we can re-emit them in their original order alongside the merged groups.
  type Position = { index: number }
  const ineligible: Array<MappedFoodResult & Position> = []
  const groups = new Map<string, Array<MappedFoodResult & Position>>()
  // First-occurrence index for each groupKey — used to keep merged entries
  // in their original position relative to ineligibles in the output.
  const groupFirstIndex = new Map<string, number>()

  filtered.forEach((r, index) => {
    const isBranded = r.dataType === 'Branded'
    const sname = strippedName(r.name)
    const groupKey = baseGroupKey(sname)
    if (isBranded || !groupKey || groupKey.length < 2) {
      ineligible.push(Object.assign({}, r, { index }))
      return
    }
    const arr = groups.get(groupKey)
    if (arr) {
      arr.push(Object.assign({}, r, { index }))
    } else {
      groups.set(groupKey, [Object.assign({}, r, { index })])
      groupFirstIndex.set(groupKey, index)
    }
  })

  // Emit pass — collect merged group entries and ineligible singletons
  // into one list keyed by their original index, then sort. This preserves
  // the input ordering (which has already been ranked by USDA / dataType).
  type Emitted = { index: number; entry: SynthMergedResult }
  const emitted: Emitted[] = []

  // Singletons (groups of size 1) → pass through unchanged.
  for (const [groupKey, members] of groups.entries()) {
    if (members.length < 2) {
      const m = members[0]
      const singletonEntry: SynthMergedResult = {
        _id: m._id,
        name: m.name,
        brand: m.brand,
        category: m.category,
        servingSize: m.servingSize,
        servingUnit: m.servingUnit,
        displayLabel: m.displayLabel,
        alternateServings: m.alternateServings,
        nutrition: m.nutrition,
        gramsPerServing: m.gramsPerServing,
        mlPerServing: m.mlPerServing,
        source: m.source,
        dataType: m.dataType,
      }
      emitted.push({ index: m.index, entry: singletonEntry })
      continue
    }

    // Multi-member group → consolidate.
    // Pick "best" representative deterministically — same heuristic as the
    // backfill (lowest fdcId).
    const sorted = [...members].sort((a, b) => {
      const aId = parseInt(fdcIdOf(a) ?? '0', 10) || 0
      const bId = parseInt(fdcIdOf(b) ?? '0', 10) || 0
      if (aId !== bId) return aId - bId
      return a.index - b.index
    })

    const cap = MAX_VARIANTS_PER_FOOD
    const merged = sorted.slice(0, cap)
    const overflow = sorted.slice(cap)

    const primaryFdc = fdcIdOf(merged[0])
    const prettyName = prettifyGroupKey(groupKey)

    const variants: SynthVariant[] = merged.map((m, i) => {
      const memberFdc = fdcIdOf(m)
      const variantName = deriveVariantName(m.name, prettyName)
      return {
        name: variantName,
        isDefault: i === 0,
        servingSize: m.servingSize,
        servingUnit: m.servingUnit,
        displayLabel: m.displayLabel,
        alternateServings: m.alternateServings,
        nutrition: m.nutrition,
        gramsPerServing: m.gramsPerServing,
        mlPerServing: m.mlPerServing,
        externalId: memberFdc ?? undefined,
        externalDataType: m.dataType,
      }
    })

    // Record the secondary fdcIds for the background queue. The PRIMARY's
    // fdcId is already on the wire as the synth entry's _id so the route's
    // existing background-import will pick it up; we just need the rest.
    for (let i = 1; i < merged.length; i++) {
      const fdc = fdcIdOf(merged[i])
      if (fdc) additionalFdcIds.push(fdc)
    }

    const primary = merged[0]
    const synthEntry: SynthMergedResult = {
      _id: primaryFdc ? `usda-${primaryFdc}` : primary._id,
      name: prettyName,
      brand: primary.brand,
      category: primary.category,
      servingSize: primary.servingSize,
      servingUnit: primary.servingUnit,
      displayLabel: primary.displayLabel,
      alternateServings: primary.alternateServings,
      nutrition: primary.nutrition,
      gramsPerServing: primary.gramsPerServing,
      mlPerServing: primary.mlPerServing,
      source: primary.source,
      dataType: primary.dataType,
      variants,
    }
    const emitIndex = groupFirstIndex.get(groupKey) ?? primary.index
    emitted.push({ index: emitIndex, entry: synthEntry })

    // Overflow members emit as standalone single-variant entries — keeps
    // them findable while honoring the per-Food variant cap.
    for (const o of overflow) {
      emitted.push({
        index: o.index,
        entry: {
          _id: o._id,
          name: o.name,
          brand: o.brand,
          category: o.category,
          servingSize: o.servingSize,
          servingUnit: o.servingUnit,
          displayLabel: o.displayLabel,
          alternateServings: o.alternateServings,
          nutrition: o.nutrition,
          gramsPerServing: o.gramsPerServing,
          mlPerServing: o.mlPerServing,
          source: o.source,
          dataType: o.dataType,
        },
      })
    }
  }

  // Ineligible (Branded / no-groupKey) singletons — pass through unchanged.
  for (const r of ineligible) {
    emitted.push({
      index: r.index,
      entry: {
        _id: r._id,
        name: r.name,
        brand: r.brand,
        category: r.category,
        servingSize: r.servingSize,
        servingUnit: r.servingUnit,
        displayLabel: r.displayLabel,
        alternateServings: r.alternateServings,
        nutrition: r.nutrition,
        gramsPerServing: r.gramsPerServing,
        mlPerServing: r.mlPerServing,
        source: r.source,
        dataType: r.dataType,
      },
    })
  }

  emitted.sort((a, b) => a.index - b.index)
  return {
    entries: emitted.map(e => e.entry),
    additionalFdcIds,
  }
}
