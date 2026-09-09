// What implement is the app ASSUMING, and does the exercise's own name say so?
//
// ── The bug this exists for ────────────────────────────────────────────────
// A member started a Workout Now session, searched "rear delt fly", tapped the
// one result, and the live screen asked for "Weight per DB (lbs)" and told them
// 47.5 was "= 95 lbs total". Nothing on that screen contained the word
// dumbbell. The catalog's `rear-delt-fly` carries equipment ['dumbbell'], so
// lib/workout/dumbbellWeight.ts correctly applied the per-dumbbell convention
// — but a rear delt fly is a movement with a machine, a cable and a dumbbell
// way of doing it, and the app picked one silently. If you are on the rear delt
// machine, "= 95 lbs total" is not merely unhelpful, it is a wrong number.
//
// The catalog's equipment is a reasonable DEFAULT and should stay one. What was
// missing is that the default was invisible and uncorrectable in the moment. So:
//
//   1. Say what is being assumed, but only when the name does not already say
//      it. "Dumbbell Bench Press" needs no chip; "Rear Delt Fly" does.
//   2. Offer the same movement's other-equipment siblings right there, so one
//      tap moves you onto Rear Delt Fly Machine and every metric follows.
//
// Pure module — no React, no mongoose, no fetch. Safe on both sides.

import { sharesMovementFamily } from '../exerciseMovementFamily'

/**
 * The implement class that actually changes how a set is logged or loaded.
 * Deliberately coarser than the `Equipment` enum in models/Exercise: a leg
 * press, a pec deck and a rear delt machine are all "Machine" to a lifter
 * deciding whether the app guessed right.
 */
export type LoadStyle = 'dumbbell' | 'kettlebell' | 'barbell' | 'cable' | 'machine' | 'band' | 'bodyweight'

/**
 * Equipment values that classify. Anything absent is SUPPORT, not load — a
 * bench, a rack, a mat, a box — and must not answer "what am I lifting?".
 * Cardio machines are absent on purpose: they carry no weight input, so
 * announcing "Machine" on a treadmill walk is noise, not intelligence.
 */
const EQUIPMENT_LOAD_STYLE: Record<string, LoadStyle> = {
  // Free weights
  barbell: 'barbell',
  ez_bar: 'barbell',
  trap_bar: 'barbell',
  safety_squat_bar: 'barbell',
  dumbbell: 'dumbbell',
  kettlebell: 'kettlebell',
  // Cable stack
  cable: 'cable',
  // Plate-loaded / selectorized
  leg_press: 'machine',
  leg_extension: 'machine',
  leg_curl: 'machine',
  hack_squat: 'machine',
  chest_press_machine: 'machine',
  shoulder_press_machine: 'machine',
  lat_pulldown: 'machine',
  seated_row_machine: 'machine',
  low_row_machine: 'machine',
  pec_deck: 'machine',
  hip_abduction_machine: 'machine',
  hip_adduction_machine: 'machine',
  calf_raise_machine: 'machine',
  preacher_curl_machine: 'machine',
  belt_squat_machine: 'machine',
  lateral_raise_machine: 'machine',
  rear_delt_machine: 'machine',
  smith_machine: 'machine',
  glute_ham_raise: 'machine',
  back_extension: 'machine',
  sled: 'machine',
  // Elastic
  resistance_band: 'band',
  // Nothing external
  bodyweight: 'bodyweight',
}

const LOAD_STYLE_LABELS: Record<LoadStyle, string> = {
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  barbell: 'Barbell',
  cable: 'Cable',
  machine: 'Machine',
  band: 'Band',
  bodyweight: 'Bodyweight',
}

/**
 * Words in an exercise NAME that state the implement outright. Matched on word
 * boundaries so "Band" never fires on "Banded Abduction"'s neighbours and
 * "db" never fires inside another word.
 *
 * Machine is the loose one on purpose: a lifter reading "Leg Press", "Pec
 * Deck" or "Lat Pulldown" already knows it is a machine, so those names are
 * self-disclosing and get no chip. That is the whole test — "would this name
 * surprise me?" — not "does this name contain the literal equipment token?".
 */
const NAME_LOAD_STYLE: Array<{ style: LoadStyle; re: RegExp }> = [
  { style: 'kettlebell', re: /\bkettlebells?\b|\bkbs?\b/i },
  { style: 'dumbbell', re: /\bdumbbells?\b|\bdbs?\b/i },
  {
    style: 'barbell',
    re: /\bbarbells?\b|\bbbs?\b|\bez[- ]?bar\b|\btrap[- ]?bar\b|\bhex[- ]?bar\b|\bsafety[- ]?(?:squat[- ]?)?bar\b|\bssb\b/i,
  },
  { style: 'cable', re: /\bcables?\b|\bpulley\b|\bcrossover\b/i },
  {
    style: 'machine',
    re: /\bmachines?\b|\bsmith\b|\bpec[- ]?deck\b|\bleg[- ]?press\b|\bhack[- ]?squat\b|\bpulldown\b|\bpull[- ]?down\b|\bsled\b|\blever\b|\bselectorized\b|\bplate[- ]?loaded\b|\bhammer[- ]?strength\b|\bpendulum\b/i,
  },
  { style: 'band', re: /\bbands?\b|\bbanded\b|\btubing\b/i },
  { style: 'bodyweight', re: /\bbodyweight\b|\bbody[- ]?weight\b/i },
]

/**
 * The implement class an exercise's catalog metadata says it uses, or null
 * when nothing in its equipment list classifies (support gear only, cardio
 * kit, or no metadata at all — every custom exercise created before an
 * equipment picker existed).
 *
 * Order within the list is the tie-break, which matches how the catalog is
 * written: the loaded implement first, the bench or rack it rests on after.
 */
export function loadStyleOf(equipment: string[] | undefined | null): LoadStyle | null {
  for (const item of equipment ?? []) {
    const style = EQUIPMENT_LOAD_STYLE[String(item).toLowerCase()]
    if (style) return style
  }
  return null
}

/** The implement class the NAME itself states, or null when it says nothing. */
export function nameStatesLoadStyle(name: string | undefined | null, aliases?: string[]): LoadStyle | null {
  const haystack = [name, ...(aliases ?? [])].filter(Boolean).join(' ')
  if (!haystack.trim()) return null
  for (const { style, re } of NAME_LOAD_STYLE) {
    if (re.test(haystack)) return style
  }
  return null
}

/** Human label for a load style, e.g. 'dumbbell' → "Dumbbell". */
export function loadStyleLabel(style: LoadStyle): string {
  return LOAD_STYLE_LABELS[style]
}

/**
 * Display label for whatever an exercise is loaded with, or null when its
 * equipment says nothing that changes the lift ("Rear Delt Fly" → "Dumbbell").
 * Used where exercises are LISTED — a search result, a session draft — so the
 * implement is visible at pick time and not only once the set screen has
 * already chosen a weight convention.
 */
export function implementLabel(equipment: string[] | undefined | null): string | null {
  const style = loadStyleOf(equipment)
  return style ? loadStyleLabel(style) : null
}

export interface EquipmentAssumptionInput {
  name?: string
  /** Resolve-only. Never counts as the app having DISCLOSED anything — see below. */
  aliases?: string[]
  equipment?: string[]
}

export interface EquipmentAssumption {
  /** The implement the app is going to log this exercise as, if it knows one. */
  style: LoadStyle | null
  /** Display label for `style`, or null when there is no style. */
  label: string | null
  /**
   * True when the app is applying an implement the exercise's own name does
   * NOT state — i.e. the moment the guess becomes invisible to the member and
   * has to be shown. Also true when name and metadata DISAGREE ("Cable Rear
   * Delt Fly" tagged ['dumbbell']), which is a data error the member should
   * be able to route around rather than a subtlety to hide.
   */
  assumed: boolean
}

/**
 * Is the app silently choosing an implement for this exercise?
 *
 * Judged on the DISPLAYED NAME ONLY — deliberately, and aliases are excluded
 * even though `nameStatesLoadStyle` accepts them. `rear-delt-fly` carries the
 * alias "Dumbbell Rear Delt Fly", which is exactly the kind of metadata that
 * makes this look already-solved: the catalog knows it is a dumbbell exercise
 * and can even spell it out. The member was shown "Rear Delt Fly". An alias
 * nobody can see cannot be what stops the app from having to say so.
 *
 * Bodyweight is never "assumed": there is no external load to get wrong and
 * no weight input to mislabel, so a chip there is pure chrome.
 */
export function equipmentAssumption(exercise: EquipmentAssumptionInput | null | undefined): EquipmentAssumption {
  // Resolution order mirrors getBellWeightInfo's: the equipment list first, and
  // the name/aliases only when it names no load at all. It has to — an
  // implement inferred from an alias is applied to the weight fields exactly
  // like one read off the metadata, so it is exactly as invisible and exactly
  // as much in need of a chip.
  const style = loadStyleOf(exercise?.equipment) ?? nameStatesLoadStyle(exercise?.name, exercise?.aliases)
  if (!style) return { style: null, label: null, assumed: false }

  const stated = nameStatesLoadStyle(exercise?.name)
  return {
    style,
    label: loadStyleLabel(style),
    assumed: style !== 'bodyweight' && stated !== style,
  }
}

export interface EquipmentVariantCandidate {
  slug: string
  name: string
  equipment?: string[]
}

/**
 * Keep only the candidates that are THIS movement done on other equipment.
 *
 * `/api/exercises/variations` is already narrowed to the same body region and
 * a shared primary muscle, which is what makes a name-family check safe on top
 * of it (see lib/exerciseMovementFamily.ts). Both guards are needed here:
 *
 *   - Without the family check, Rear Delt Fly's variations include Face Pull —
 *     a fine rear-delt exercise, but offering it under "same movement, other
 *     equipment" is a different promise than the one being made.
 *   - Without the differing-style check, the list would offer swaps that
 *     change nothing about how the set is logged.
 *
 * The source exercise itself is excluded by slug: the variations endpoint
 * always returns it first, and "switch to what you are already doing" is not
 * an option.
 */
export function equipmentVariantsOf<T extends EquipmentVariantCandidate>(
  source: { slug?: string; name?: string; equipment?: string[] },
  candidates: T[],
): T[] {
  const sourceStyle = loadStyleOf(source.equipment)
  const sourceName = source.name ?? ''
  if (!sourceName) return []

  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    if (!candidate?.slug || candidate.slug === source.slug) return false
    if (seen.has(candidate.slug)) return false
    const style = loadStyleOf(candidate.equipment)
    if (!style || style === sourceStyle) return false
    if (!sharesMovementFamily(sourceName, candidate.name ?? '')) return false
    seen.add(candidate.slug)
    return true
  })
}
