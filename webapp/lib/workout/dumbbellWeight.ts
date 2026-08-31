// Per-implement weight convention for dumbbell/kettlebell work: the number a
// member types is the load of ONE dumbbell/kettlebell, not the combined
// total — saying "I dumbbell benched 180" is awkward when what happened was
// two 90s. `equipment` (not the exercise name) is the source of truth,
// because only a fraction of the catalog literally says "dumbbell" in its
// name — a Chest-Supported Row is a dumbbell exercise; nothing in its name
// says so, and it used to fall through to plain "Weight (lbs)" and barbell
// plate-math quick-picks. The name/alias match is kept only as a fallback
// for exercises with no equipment metadata (e.g. a member's own custom
// exercise created before this shipped).

export type BellStyle = 'dumbbell' | 'kettlebell' | null

export interface BellWeightInfo {
  style: BellStyle
  /**
   * Whether the logged number is one of a simultaneously-loaded PAIR, so
   * doubling it into a "= X total" hint is meaningful. False for movements
   * that only ever load a single implement at a time — a goblet hold, a
   * carry, or unilateral/alternating single-arm work — where showing "x2"
   * would overstate the load actually moved on that rep.
   */
  showTotal: boolean
}

interface BellExerciseInput {
  name?: string
  aliases?: string[]
  equipment?: string[]
  laterality?: string
  movementPatterns?: string[]
}

const SINGLE_IMPLEMENT_NAME = /\bgoblet\b/i
const PAIRED_KETTLEBELL_NAME = /\bdouble\b|\bpair(?:ed)?\b/i
const NAME_FALLBACK = /\bkettlebell\b|\bkb\b/i
const NAME_FALLBACK_DB = /\bdumbbell\b|\bdb\b/i

/**
 * Resolve the per-implement weight display for an exercise. Prefers the
 * catalog's `equipment` list; falls back to matching the name/aliases when
 * equipment metadata isn't available.
 */
export function getBellWeightInfo(exercise: BellExerciseInput | null | undefined): BellWeightInfo {
  if (!exercise) return { style: null, showTotal: false }

  const equipment = (exercise.equipment || []).map((e) => e.toLowerCase())
  const haystack = [exercise.name, ...(exercise.aliases || [])].filter(Boolean).join(' ').toLowerCase()

  let style: BellStyle = null
  if (equipment.includes('dumbbell')) style = 'dumbbell'
  else if (equipment.includes('kettlebell')) style = 'kettlebell'
  else if (NAME_FALLBACK.test(haystack)) style = 'kettlebell'
  else if (NAME_FALLBACK_DB.test(haystack)) style = 'dumbbell'

  if (!style) return { style: null, showTotal: false }

  const isCarry = (exercise.movementPatterns || []).includes('carry')
  const isSingleImplementByName = SINGLE_IMPLEMENT_NAME.test(haystack)
  const isSingleSided = exercise.laterality === 'unilateral' || exercise.laterality === 'alternating'

  const showTotal = style === 'kettlebell'
    // Kettlebells are conventionally a single implement (goblet squat, swings,
    // single-arm/Turkish work) unless the exercise is explicitly a two-bell variant.
    ? PAIRED_KETTLEBELL_NAME.test(haystack)
    : !isCarry && !isSingleImplementByName && !isSingleSided

  return { style, showTotal }
}

/** The input label for this style, e.g. "Weight per DB (lbs)". */
export function bellWeightLabel(style: BellStyle): string {
  if (style === 'dumbbell') return 'Weight per DB (lbs)'
  if (style === 'kettlebell') return 'Weight per KB (lbs)'
  return 'Weight (lbs)'
}

/**
 * Quick-pick loads for the weight input, keyed to what's actually being
 * loaded — a dumbbell/kettlebell increments in 5s/10s per hand; a barbell
 * moves in 45lb-plate jumps. The old buttons were always the barbell set
 * (45/95/135/185/225), which is nonsensical per-hand dumbbell math.
 */
export function weightQuickPicks(style: BellStyle): number[] {
  if (style === 'dumbbell') return [10, 20, 30, 40, 50]
  if (style === 'kettlebell') return [18, 26, 35, 44, 53]
  return [45, 95, 135, 185, 225]
}
