// What we can say about an exercise from its name alone.
//
// Card: "Put as much data as possible for them and flag what needs to be
// flagged." When a program is saved with an exercise the catalog has never
// heard of and lib/exerciseNameMatch.ts can't resolve it, a row gets created
// so the entry exists, is editable and can take a video. A row created with
// nothing but a name is a shell — it can't be filtered by body part, can't
// join a variation family, and tells a member nothing. Gym names are
// descriptive ("Bent-Over Cable Kickback", "Seated Calf Raise"), so most of
// the classification is sitting in the words.
//
// This is a FLOOR, not a verdict: every row it produces carries the
// `needs-review` tag and no video, which is what puts it in front of an admin
// in the portal's "No Video" tab. An admin's edit always wins — nothing here
// ever runs again over a row that already exists.
//
// Deliberately conservative. An unrecognised name yields category 'strength'
// with no muscles and no patterns rather than a guess: a wrong muscle tag
// propagates into the variation picker and the body-part search, where it is
// much harder to notice than a blank field.

import type {
  BodyRegion,
  Difficulty,
  Equipment,
  ExerciseCategory,
  ExerciseRole,
  Laterality,
  MechanicsType,
  MovementPattern,
  MuscleGroup,
  TrackingType,
} from '@/models/Exercise'
import { expandAbbreviations } from './exerciseAbbreviations'
import { tokenizeExerciseName } from './exerciseMovementFamily'

export interface InferredExerciseFields {
  category: ExerciseCategory
  mechanics: MechanicsType
  role: ExerciseRole
  movementPatterns: MovementPattern[]
  laterality: Laterality
  difficulty: Difficulty
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  equipment: Equipment[]
  trackingType: TrackingType
  bodyRegion: BodyRegion
}

/** A movement the name can name, and what it tells us. Order matters: the
 *  first entry whose phrase appears wins, so narrow phrases ("leg curl")
 *  are listed above the broad ones they contain ("curl"). */
interface MovementProfile {
  /** Token sequences, any one of which identifies this movement. */
  phrases: string[]
  patterns: MovementPattern[]
  primary: MuscleGroup[]
  secondary?: MuscleGroup[]
  category?: ExerciseCategory
  tracking?: TrackingType
  /** Multi-joint unless stated — drives mechanics and role. */
  isolation?: boolean
}

const MOVEMENTS: MovementProfile[] = [
  // ── Rest / recovery ──────────────────────────────────────────────────────
  { phrases: ['rest'], patterns: ['n/a'], primary: [], category: 'cooldown', tracking: 'none' },
  { phrases: ['stretch', 'stretching', 'cool down', 'cooldown'], patterns: ['n/a'], primary: [], category: 'cooldown', tracking: 'time' },
  { phrases: ['foam roll', 'foam rolling'], patterns: ['n/a'], primary: [], category: 'cooldown', tracking: 'time' },
  { phrases: ['mobility', 'warm up', 'warmup', 'dynamic warm up'], patterns: ['n/a'], primary: [], category: 'warmup', tracking: 'time' },

  // ── Conditioning formats ────────────────────────────────────────────────
  { phrases: ['amrap', 'emom', 'tabata', 'circuit', 'finisher', 'interval'], patterns: ['n/a'], primary: ['full_body'], category: 'conditioning', tracking: 'intervals' },

  // ── Hinge ───────────────────────────────────────────────────────────────
  { phrases: ['romanian deadlift', 'stiff leg deadlift'], patterns: ['hinge'], primary: ['hamstrings', 'glutes'], secondary: ['erector_spinae', 'grip'] },
  { phrases: ['deadlift'], patterns: ['hinge'], primary: ['hamstrings', 'glutes', 'erector_spinae'], secondary: ['quads', 'traps', 'grip'] },
  { phrases: ['good morning'], patterns: ['hinge'], primary: ['hamstrings', 'erector_spinae'], secondary: ['glutes'] },
  { phrases: ['swing'], patterns: ['hinge', 'triple_extension'], primary: ['glutes', 'hamstrings'], secondary: ['erector_spinae'], category: 'power' },
  { phrases: ['hip thrust', 'glute bridge', 'back extension', 'hyperextension'], patterns: ['hip_extension'], primary: ['glutes'], secondary: ['hamstrings', 'erector_spinae'] },

  // ── Squat / lunge ───────────────────────────────────────────────────────
  { phrases: ['wall sit'], patterns: ['squat'], primary: ['quads'], secondary: ['glutes'], tracking: 'time' },
  { phrases: ['leg press'], patterns: ['squat'], primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  { phrases: ['squat jump', 'jump squat'], patterns: ['squat', 'triple_extension'], primary: ['quads', 'glutes'], category: 'plyometric' },
  { phrases: ['squat'], patterns: ['squat'], primary: ['quads', 'glutes'], secondary: ['hamstrings', 'erector_spinae'] },
  { phrases: ['lunge', 'split squat', 'step up'], patterns: ['lunge'], primary: ['quads', 'glutes'], secondary: ['hamstrings'] },

  // ── Push ────────────────────────────────────────────────────────────────
  { phrases: ['push up', 'pushup'], patterns: ['horizontal_push'], primary: ['chest'], secondary: ['triceps', 'front_delts', 'abs'], category: 'calisthenics', tracking: 'reps_bodyweight' },
  { phrases: ['bench press', 'chest press', 'floor press'], patterns: ['horizontal_push'], primary: ['chest'], secondary: ['triceps', 'front_delts'] },
  { phrases: ['overhead press', 'shoulder press', 'military press', 'push press', 'arnold press', 'pike press'], patterns: ['vertical_push'], primary: ['front_delts'], secondary: ['triceps', 'side_delts'] },
  { phrases: ['dip'], patterns: ['horizontal_push', 'elbow_extension'], primary: ['triceps'], secondary: ['chest', 'front_delts'], tracking: 'reps_bodyweight' },
  { phrases: ['thruster'], patterns: ['squat', 'vertical_push'], primary: ['quads', 'glutes', 'front_delts'], secondary: ['triceps'] },
  { phrases: ['fly', 'pec deck'], patterns: ['horizontal_adduction'], primary: ['chest'], secondary: ['front_delts'], isolation: true },
  { phrases: ['pullover'], patterns: ['vertical_pull'], primary: ['lats'], secondary: ['chest', 'triceps'], isolation: true },

  // ── Pull ────────────────────────────────────────────────────────────────
  { phrases: ['pull up', 'pullup', 'chin up', 'chinup'], patterns: ['vertical_pull'], primary: ['lats'], secondary: ['biceps', 'upper_back', 'grip'], tracking: 'reps_bodyweight' },
  { phrases: ['pulldown', 'pull down'], patterns: ['vertical_pull'], primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  { phrases: ['face pull', 'band pull apart', 'pull apart'], patterns: ['scapular_retraction'], primary: ['rear_delts'], secondary: ['traps', 'rhomboids'], isolation: true },
  { phrases: ['row'], patterns: ['horizontal_pull'], primary: ['lats', 'mid_back'], secondary: ['biceps', 'rear_delts'] },
  { phrases: ['shrug'], patterns: ['scapular_retraction'], primary: ['traps'], secondary: ['grip'], isolation: true },
  { phrases: ['dead hang', 'hang'], patterns: ['n/a'], primary: ['grip'], secondary: ['lats'], tracking: 'time' },

  // ── Arms ────────────────────────────────────────────────────────────────
  { phrases: ['leg curl', 'hamstring curl'], patterns: ['knee_flexion'], primary: ['hamstrings'], secondary: ['calves'], isolation: true },
  { phrases: ['hammer curl'], patterns: ['elbow_flexion'], primary: ['brachialis', 'biceps'], secondary: ['forearms'], isolation: true },
  { phrases: ['reverse curl'], patterns: ['elbow_flexion'], primary: ['forearms', 'brachialis'], secondary: ['biceps'], isolation: true },
  { phrases: ['curl'], patterns: ['elbow_flexion'], primary: ['biceps'], secondary: ['forearms', 'brachialis'], isolation: true },
  { phrases: ['leg extension', 'knee extension'], patterns: ['knee_extension'], primary: ['quads'], isolation: true },
  { phrases: ['pushdown', 'pressdown', 'press down', 'skull crusher', 'tricep extension', 'triceps extension', 'kickback'], patterns: ['elbow_extension'], primary: ['triceps'], isolation: true },

  // ── Delts / calves ──────────────────────────────────────────────────────
  { phrases: ['lateral raise', 'side raise'], patterns: ['shoulder_abduction'], primary: ['side_delts'], isolation: true },
  { phrases: ['front raise'], patterns: ['shoulder_flexion'], primary: ['front_delts'], isolation: true },
  { phrases: ['rear delt fly', 'reverse fly', 'rear delt'], patterns: ['scapular_retraction'], primary: ['rear_delts'], secondary: ['rhomboids'], isolation: true },
  { phrases: ['calf raise', 'heel raise'], patterns: ['ankle_flexion'], primary: ['calves'], isolation: true },

  // ── Core ────────────────────────────────────────────────────────────────
  { phrases: ['side plank'], patterns: ['anti_lateral_flexion'], primary: ['obliques'], secondary: ['abs'], tracking: 'time', isolation: true },
  { phrases: ['plank', 'hollow hold', 'dead bug', 'ab wheel', 'rollout'], patterns: ['anti_extension'], primary: ['abs'], secondary: ['transverse_abdominis'], tracking: 'time', isolation: true },
  { phrases: ['russian twist', 'woodchopper', 'twist'], patterns: ['rotation'], primary: ['obliques'], secondary: ['abs'], isolation: true },
  { phrases: ['pallof'], patterns: ['anti_rotation'], primary: ['obliques'], secondary: ['abs'], isolation: true },
  { phrases: ['crunch', 'sit up', 'situp', 'v up', 'toe touch', 'heel tap', 'flutter kick', 'leg raise', 'knee raise'], patterns: ['anti_extension'], primary: ['abs'], secondary: ['hip_flexors', 'obliques'], isolation: true },

  // ── Carries / strongman ─────────────────────────────────────────────────
  { phrases: ['sled push', 'sled pull', 'sled drag', 'prowler'], patterns: ['gait'], primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], category: 'strongman', tracking: 'time_distance' },
  { phrases: ['carry', 'farmer walk', "farmer's walk"], patterns: ['carry'], primary: ['grip', 'traps'], secondary: ['abs', 'obliques'], category: 'strongman', tracking: 'time_distance' },

  // ── Conditioning movements ──────────────────────────────────────────────
  { phrases: ['burpee', 'up down', 'mountain climber', 'bear crawl', 'battle rope'], patterns: ['n/a'], primary: ['full_body'], category: 'conditioning', tracking: 'reps_only' },
  { phrases: ['jumping jack', 'high knee', 'butt kick', 'skater', 'box jump', 'jump rope', 'skip'], patterns: ['triple_extension'], primary: ['calves', 'quads'], secondary: ['glutes'], category: 'plyometric', tracking: 'reps_only' },
  { phrases: ['sprint', 'run', 'jog', 'walk', 'bike', 'cycle', 'row machine', 'rowing', 'elliptical', 'stair', 'treadmill', 'assault bike'], patterns: ['gait'], primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], category: 'cardio', tracking: 'time_distance' },
]

/** Token → the equipment it names. */
const EQUIPMENT_TOKENS: Readonly<Record<string, Equipment>> = {
  dumbbell: 'dumbbell',
  barbell: 'barbell',
  kettlebell: 'kettlebell',
  cable: 'cable',
  band: 'resistance_band',
  banded: 'resistance_band',
  smith: 'smith_machine',
  sled: 'sled',
  prowler: 'sled',
  box: 'box',
  chair: 'chair',
  bodyweight: 'bodyweight',
  treadmill: 'treadmill',
  elliptical: 'elliptical',
  backpack: 'backpack',
  towel: 'towel',
  mat: 'exercise_mat',
  rope: 'jump_rope',
}

/** Multi-token equipment, checked before the single tokens above. */
const EQUIPMENT_PHRASES: ReadonlyArray<readonly [string, Equipment]> = [
  ['ez bar', 'ez_bar'],
  ['trap bar', 'trap_bar'],
  ['hex bar', 'trap_bar'],
  ['safety squat bar', 'safety_squat_bar'],
  ['pec deck', 'pec_deck'],
  ['leg press', 'leg_press'],
  ['leg extension', 'leg_extension'],
  ['leg curl', 'leg_curl'],
  ['hack squat', 'hack_squat'],
  ['lat pulldown', 'lat_pulldown'],
  ['chest press machine', 'chest_press_machine'],
  ['pull up bar', 'pull_up_bar'],
  ['dip station', 'dip_station'],
  ['foam roller', 'foam_roller'],
  ['medicine ball', 'medicine_ball'],
  ['ab wheel', 'ab_wheel'],
  ['jump rope', 'jump_rope'],
  ['rowing machine', 'rowing_machine'],
  ['assault bike', 'assault_bike'],
  ['stationary bike', 'stationary_bike'],
  ['stair climber', 'stair_climber'],
  ['incline bench', 'incline_bench'],
  ['decline bench', 'decline_bench'],
  ['flat bench', 'flat_bench'],
  ['squat rack', 'squat_rack'],
]

const REGION_BY_MUSCLE: Readonly<Record<string, BodyRegion>> = {
  chest: 'upper_body', upper_chest: 'upper_body', lower_chest: 'upper_body',
  lats: 'upper_body', upper_back: 'upper_body', mid_back: 'upper_body',
  rhomboids: 'upper_body', traps: 'upper_body', teres_major: 'upper_body',
  front_delts: 'upper_body', side_delts: 'upper_body', rear_delts: 'upper_body',
  rotator_cuff: 'upper_body', biceps: 'upper_body', triceps: 'upper_body',
  forearms: 'upper_body', brachialis: 'upper_body', grip: 'upper_body',
  abs: 'core', obliques: 'core', transverse_abdominis: 'core',
  hip_flexors: 'core', erector_spinae: 'core', lower_back: 'core',
  quads: 'lower_body', hamstrings: 'lower_body', glutes: 'lower_body',
  calves: 'lower_body', adductors: 'lower_body', abductors: 'lower_body',
  full_body: 'full_body',
}

/** Patterns that are multi-joint by definition — everything else in the
 *  accessory block is single-joint. */
const COMPOUND_PATTERNS = new Set<MovementPattern>([
  'squat', 'hinge', 'lunge', 'horizontal_push', 'horizontal_pull',
  'vertical_push', 'vertical_pull', 'carry', 'triple_extension', 'gait',
])

/** True if `phrase` contains `needle` as a whole token sequence. */
function containsPhrase(phrase: string, needle: string): boolean {
  return new RegExp(`(?:^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`).test(phrase)
}

function inferEquipment(phrase: string, tokens: string[]): Equipment[] {
  const found: Equipment[] = []
  for (const [needle, equipment] of EQUIPMENT_PHRASES) {
    if (containsPhrase(phrase, needle) && !found.includes(equipment)) found.push(equipment)
  }
  for (const token of tokens) {
    const equipment = EQUIPMENT_TOKENS[token]
    if (equipment && !found.includes(equipment)) found.push(equipment)
  }
  // "Machine" on its own names no specific machine in the Equipment enum, so
  // it is left off rather than mapped to something more specific than the
  // name actually says.
  return found
}

function inferLaterality(phrase: string): Laterality {
  if (containsPhrase(phrase, 'alternating')) return 'alternating'
  if (
    containsPhrase(phrase, 'single arm') || containsPhrase(phrase, 'single leg')
    || containsPhrase(phrase, 'one arm') || containsPhrase(phrase, 'one leg')
    || containsPhrase(phrase, 'unilateral')
  ) return 'unilateral'
  return 'bilateral'
}

/**
 * Everything the name gives us. Unrecognised names come back as plain
 * strength work with no muscles and no patterns — see the file header on why
 * that is the right floor.
 */
export function inferExerciseFields(name: string): InferredExerciseFields {
  const tokens = expandAbbreviations(tokenizeExerciseName(name))
  const phrase = tokens.join(' ')

  const movement = MOVEMENTS.find((m) => m.phrases.some((p) => containsPhrase(phrase, p))) ?? null

  const patterns = movement ? movement.patterns : []
  const primaryMuscles = movement ? [...movement.primary] : []
  const secondaryMuscles = movement?.secondary ? [...movement.secondary] : []
  const equipment = inferEquipment(phrase, tokens)

  const isolation = movement?.isolation === true
  const compound = patterns.some((p) => COMPOUND_PATTERNS.has(p))
  const mechanics: MechanicsType = isolation ? 'isolation' : compound ? 'compound' : 'n/a'

  let trackingType: TrackingType = movement?.tracking ?? 'reps_weight'
  if (
    trackingType === 'reps_weight'
    && (equipment.length === 0 || (equipment.length === 1 && equipment[0] === 'bodyweight'))
    && movement?.category === 'calisthenics'
  ) {
    trackingType = 'reps_bodyweight'
  }

  const region = primaryMuscles.length > 0 ? REGION_BY_MUSCLE[primaryMuscles[0]] : undefined
  const allRegions = new Set(primaryMuscles.map((m) => REGION_BY_MUSCLE[m]).filter(Boolean))

  return {
    category: movement?.category ?? 'strength',
    mechanics,
    role: compound ? 'compound' : isolation ? 'accessory' : 'secondary',
    movementPatterns: patterns,
    laterality: movement?.tracking === 'none' ? 'n/a' : inferLaterality(phrase),
    difficulty: 'intermediate' as Difficulty,
    primaryMuscles,
    secondaryMuscles,
    equipment,
    trackingType,
    bodyRegion: allRegions.size > 1 ? 'full_body' : (region ?? 'full_body'),
  }
}
