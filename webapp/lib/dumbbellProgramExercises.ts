// The dumbbell-only program's exercises, as their own catalog rows.
//
// Card: "We need to have support for our dumbbell only program. When I
// searched the exercise in the admin portal, none of the exercises pop up.
// Instead, what they do is get added under like a similar name. I honestly
// don't like that. We use DB for those exercises and I'd rather switch them
// all to just say dumbbell. But the main thing is that dumbbell overhead
// tricep press and all of the exercises needs to appear on admin portal."
//
// And the comment that pins the rule: "We need crunch and dumbbell crunch to
// be separate because they are two different exercises. One is with weight
// the other is without." Plus: "If the exercise already exists let it be. I
// need to be able to upload videos to every exercise."
//
// ── What was actually wrong ─────────────────────────────────────────────────
//
// Nothing was dangling: every `exerciseSlug` in every program owns a row, and
// `scripts/repair-program-exercises.ts` exists to keep it that way. The way
// that gets achieved is by resolving a program's wording onto the nearest
// existing exercise and recording the wording on it as an alias — which is the
// right move when the two really are one exercise ("DB Hammer Curl" is the
// catalog's Hammer Curl, video included) and the wrong move when they are not.
// In the two dumbbell-only programs it was the wrong move nine times, and the
// alias left behind on each generic row is the receipt
// (webapp/scripts/seed_exercises.mjs is where those alias lists were written):
//
//   program says            resolved to            whose equipment is
//   ──────────────────────  ─────────────────────  ────────────────────────
//   DB Crunch × 20          crunch                 bodyweight
//   Russian Twists (with    russian-twist          bodyweight
//     DB) × 40
//   DB Woodchoppers × 15    cable-woodchopper      cable
//     per side
//   DB Romanian Deadlift    romanian-deadlift      barbell
//   DB Hip Thrust           hip-thrust             barbell + flat bench
//   DB Skull Crushers       skull-crusher          EZ bar + flat bench
//   DB Step-Ups             step-up                box
//   DB Calf Raises          standing-calf-raise    calf raise machine
//   Dumbbell Push Press     push-press             barbell
//
// So a member on the dumbbell-only program was shown a barbell hip thrust and
// a cable woodchopper, "dumbbell crunch" found nothing in the admin portal
// (the substring is not in "Crunch" and not in "DB Crunch × 20"), and there
// was nowhere to upload a dumbbell demo to — the video slot belongs to the
// barbell row that four other programs also point at. That is the whole card.
//
// ── The fix ────────────────────────────────────────────────────────────────
//
//   1. SPLIT — nine new catalog rows, one per line above, spelled "Dumbbell
//      X", loading a dumbbell, tracked as weight where the generic row is
//      tracked as bodyweight. The alias that caused the fold is handed OVER to
//      the new row rather than copied, so exactly one row answers to "Dumbbell
//      Crunch" and the generic row goes back to meaning what its name says.
//      The two are cross-linked as variations of each other.
//
//   2. REPOINT — only the dumbbell-only programs move. `romanian-deadlift` is
//      also in four barbell programs and it stays there: this table is keyed
//      by (program_id, slug), not by slug, because "the dumbbell program's RDL
//      is a dumbbell RDL" says nothing about anybody else's.
//
//   3. SPELL "DB" IN FULL — "I'd rather switch them all to just say dumbbell",
//      applied to every name and alias in the catalog as a mechanical token
//      rewrite (`spellDumbbellInFull`). Nothing is lost by dropping the
//      shorthand: lib/exerciseAbbreviations.ts already expands db → dumbbell
//      on both sides of every search and every program-save resolution, so
//      "DB Curls" still finds Dumbbell Curl with no alias saying "DB".
//
// Nothing here renames or deletes an existing exercise, and nothing here
// touches a program that is not a dumbbell-only program — "if the exercise
// already exists let it be".
//
// ── Why splitting also stops this recurring ─────────────────────────────────
//
// lib/exerciseNameMatch.ts resolves in three layers and its layer 3 strips
// equipment words, so "Dumbbell Crunch" reduces to "crunch" — which is how the
// fold happened. A key claimed by two different exercises is dropped as
// ambiguous rather than guessed at, so the moment `dumbbell-crunch` exists
// alongside `crunch` that layer goes quiet and layer 2 answers exactly:
// "DB Crunch" → tokens [db, crunch] → [dumbbell, crunch] → Dumbbell Crunch.
// tests/unit/dumbbellProgramExercises.test.ts pins that end to end.
//
// Consumed by scripts/repair-dumbbell-program-exercises.ts. Kept in lib/ so
// the invariants are unit-tested rather than discovered during a production run.

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
} from '../models/Exercise'

// ─── The programs this card is about ────────────────────────────────────────

/**
 * `program_id` of every dumbbell-only program. Both are "DB Only" in the
 * coach's wording — `db-only-total-transformation` is the 4-week, 4×/week
 * one and `program_5` is the 30-minute one (see tests/helpers/program-actions.ts).
 */
export const DUMBBELL_ONLY_PROGRAM_IDS = [
  'db-only-total-transformation',
  'program_5',
] as const

// ─── New catalog rows ───────────────────────────────────────────────────────

export interface DumbbellVariantExercise {
  slug: string
  name: string
  aliases: string[]
  description: string
  category: ExerciseCategory
  mechanics: MechanicsType
  role: ExerciseRole
  movementPatterns: MovementPattern[]
  laterality: Laterality
  difficulty: Difficulty
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
  stabilizers: MuscleGroup[]
  equipment: Equipment[]
  optionalEquipment: Equipment[]
  trackingType: TrackingType
  defaultSets?: number
  defaultReps?: string
  defaultRest?: string
  instructions: string[]
  cues: string[]
  commonMistakes: string[]
  prerequisites: string[]
  variations: string[]
  alternatives: string[]
  tags: string[]
  bodyRegion: BodyRegion
  isActive: boolean
  isCustom: boolean
}

const variantDefaults = {
  category: 'strength' as ExerciseCategory,
  isActive: true,
  isCustom: false,
  prerequisites: [] as string[],
  alternatives: [] as string[],
  commonMistakes: [] as string[],
}

/**
 * One row per fold in the table at the top of this file. Muscles, patterns,
 * laterality and rep defaults are inherited from the generic row the entry was
 * being folded into — the movement is the same, the implement is not — with
 * two deliberate departures:
 *
 *   `equipment: ['dumbbell']`, because that is the whole point, and because
 *   lib/workout/dumbbellWeight.ts reads `equipment` (not the name) to decide
 *   whether to label the weight field "Weight per DB (lbs)" and offer
 *   per-hand quick picks instead of barbell plate math.
 *
 *   `trackingType: 'reps_weight'` on the crunch and the Russian twist, where
 *   the generic row is `reps_bodyweight`. That is Jon's sentence — "one is
 *   with weight the other is without" — expressed in the only field that
 *   decides whether a member gets a weight box to log into.
 *
 * No `videoUrl`: a row with no video is what the admin portal's "No Video" tab
 * lists, and that tab is the queue of exercises waiting for Jon to record one.
 * "I need to be able to upload videos to every exercise" is satisfied by the
 * row existing, not by guessing a file onto it.
 */
export const DUMBBELL_VARIANT_EXERCISES: DumbbellVariantExercise[] = [
  {
    ...variantDefaults,
    slug: 'dumbbell-crunch',
    name: 'Dumbbell Crunch',
    aliases: ['Dumbbell Crunches', 'Weighted Crunch', 'Dumbbell Crunch × 20'],
    description:
      'A crunch performed holding a dumbbell against the chest or overhead, so the abs work against added load instead of bodyweight alone. A different exercise from the bodyweight crunch, not a heavier version of it: the load changes the rep range and it is logged with a weight.',
    mechanics: 'isolation',
    role: 'accessory',
    movementPatterns: ['anti_extension'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['abs'],
    secondaryMuscles: ['obliques'],
    stabilizers: [],
    equipment: ['dumbbell'],
    optionalEquipment: ['exercise_mat'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '15-20',
    defaultRest: '30 sec',
    instructions: [
      'Lie on your back with your knees bent and your feet flat on the floor.',
      'Hold one dumbbell against your chest with both hands, or pressed straight over your chest.',
      'Curl your ribs towards your hips, lifting your shoulder blades off the floor.',
      'Lower under control until your shoulder blades touch down, and go again.',
    ],
    cues: [
      'Shorten the distance between ribs and hips — that is the whole rep. Do not sit all the way up.',
      'Breathe out as you curl up; holding your breath is what makes the neck take over.',
      'Keep the dumbbell still against your chest. Throwing it forward for momentum takes the abs out of it.',
    ],
    commonMistakes: [
      'Pulling on the neck or letting the chin drop to the chest.',
      'Going heavy enough that the reps turn into a sit-up driven by the hip flexors.',
    ],
    variations: ['crunch'],
    tags: ['core', 'weighted', 'isolation'],
    bodyRegion: 'core',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-russian-twist',
    name: 'Dumbbell Russian Twist',
    aliases: ['Dumbbell Russian Twists', 'Weighted Russian Twist', 'Russian Twists (with Dumbbell) × 40'],
    description:
      'A seated rotation with a dumbbell held at the chest, turning the torso side to side while the hips stay put. The loaded version of the Russian twist — same movement, logged with a weight.',
    mechanics: 'compound',
    role: 'accessory',
    movementPatterns: ['rotation'],
    laterality: 'alternating',
    difficulty: 'intermediate',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['abs', 'hip_flexors'],
    stabilizers: [],
    equipment: ['dumbbell'],
    optionalEquipment: ['exercise_mat'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '20 per side',
    defaultRest: '60 sec',
    instructions: [
      'Sit on the floor with your knees bent and your heels lightly touching down.',
      'Hold one dumbbell at chest height with both hands and lean back slightly.',
      'Rotate your shoulders and the dumbbell to one side until the weight is beside your hip.',
      'Rotate through to the other side. That is one rep per side.',
    ],
    cues: [
      'Turn the shoulders, not just the arms — if the dumbbell moves and your chest does not, nothing is being trained.',
      'Keep the chest tall and the lower back long; rounding over collapses the rotation.',
      'Move at a speed you can stop at. Swinging through the middle is momentum, not obliques.',
    ],
    commonMistakes: [
      'Letting the knees swing with the weight so the hips do the rotating.',
      'Racing the count until the range shrinks to nothing.',
    ],
    variations: ['russian-twist'],
    tags: ['core', 'rotation', 'weighted'],
    bodyRegion: 'core',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-woodchopper',
    name: 'Dumbbell Woodchopper',
    aliases: ['Dumbbell Woodchoppers', 'Dumbbell Woodchoppers × 15 per side'],
    description:
      'A diagonal chop driven by the torso, taking a single dumbbell from above one shoulder down past the opposite hip. The dumbbell version of the cable woodchopper: the resistance drops away at the bottom instead of staying constant, so the top half of the range is where the work is.',
    mechanics: 'compound',
    role: 'accessory',
    movementPatterns: ['rotation'],
    laterality: 'unilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['obliques'],
    secondaryMuscles: ['abs', 'front_delts'],
    stabilizers: ['hip_flexors', 'glutes'],
    equipment: ['dumbbell'],
    optionalEquipment: ['medicine_ball'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '12-15 per side',
    defaultRest: '60 sec',
    instructions: [
      'Stand with your feet a little wider than your hips, holding one dumbbell in both hands.',
      'Lift the dumbbell up and across to above one shoulder, turning your chest with it.',
      'Chop down and across to the outside of the opposite knee, pivoting the back foot and letting the hips turn.',
      'Return along the same line under control, and finish all the reps on that side before switching.',
    ],
    cues: [
      'The arms carry the dumbbell; the torso does the chopping.',
      'Let the back heel turn. Fighting the hips to stay square is what loads the lower back.',
      'Control the way back up — the eccentric is half the exercise.',
    ],
    commonMistakes: [
      'Chopping with the arms only while the chest stays facing forward.',
      'Going so heavy the last third of the range disappears.',
    ],
    variations: ['cable-woodchopper'],
    tags: ['core', 'rotation', 'functional'],
    bodyRegion: 'core',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-romanian-deadlift',
    name: 'Dumbbell Romanian Deadlift',
    aliases: ['Dumbbell RDL'],
    description:
      'A hip hinge with a dumbbell in each hand, lowering them down the front of the legs with the knees barely bending until the hamstrings are stretched, then driving the hips forward to stand. The dumbbells travel closer to the body than a barbell can and each side has to hold its own load.',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['hinge'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['hamstrings'],
    secondaryMuscles: ['glutes', 'lower_back'],
    stabilizers: ['abs', 'grip'],
    equipment: ['dumbbell'],
    optionalEquipment: ['kettlebell'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '8-12',
    defaultRest: '2 min',
    instructions: [
      'Stand tall with a dumbbell in each hand, arms straight, feet hip width.',
      'Push your hips back and let the dumbbells slide down the front of your thighs, knees only softly bent.',
      'Stop when you feel the hamstrings stretch and your back is about to round — for most people that is mid-shin.',
      'Drive the hips forward to stand up, squeezing the glutes at the top without leaning back.',
    ],
    cues: [
      'Hips back, not down. This is a hinge, not a squat.',
      'Keep the dumbbells brushing the legs — the further out they drift, the more the lower back takes.',
      'Long spine the whole way. The set ends when the back rounds, not when the dumbbells hit the floor.',
    ],
    commonMistakes: [
      'Bending the knees until it becomes a squat and the hamstrings stop working.',
      'Chasing depth past the point the back stays flat.',
    ],
    variations: ['romanian-deadlift', 'stiff-leg-deadlift', 'single-leg-rdl'],
    tags: ['hinge', 'posterior_chain'],
    bodyRegion: 'lower_body',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-hip-thrust',
    name: 'Dumbbell Hip Thrust',
    aliases: ['Dumbbell Hip Thrusts'],
    description:
      'A hip thrust loaded with a dumbbell held across the hips instead of a barbell. Same glute drive, far quicker to set up — which is why it is the version the dumbbell-only program uses.',
    mechanics: 'compound',
    role: 'secondary',
    movementPatterns: ['hinge'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings'],
    stabilizers: ['abs'],
    equipment: ['dumbbell'],
    optionalEquipment: ['flat_bench', 'exercise_mat'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '10-15',
    defaultRest: '90 sec',
    instructions: [
      'Sit on the floor with your upper back against a bench, or lie flat if you have no bench.',
      'Rest one dumbbell across the front of your hips and hold it there with both hands.',
      'Plant your feet flat, shins roughly vertical, and drive your hips up until your body is in a straight line from knees to shoulders.',
      'Lower until your hips are just off the floor, then drive up again.',
    ],
    cues: [
      'Finish the rep with the glutes, not by arching the lower back.',
      'Tuck the chin slightly and keep the ribs down — that keeps the work in the hips.',
      'Push the floor away through the whole foot, not just the toes.',
    ],
    commonMistakes: [
      'Letting the feet drift too far forward, which turns it into a hamstring exercise.',
      'Hyperextending the back at the top instead of locking the hips out.',
    ],
    variations: ['hip-thrust', 'glute-bridge'],
    tags: ['glute_builder', 'hinge'],
    bodyRegion: 'lower_body',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-skull-crusher',
    name: 'Dumbbell Skull Crusher',
    aliases: ['Dumbbell Skull Crushers'],
    description:
      'A lying triceps extension with a dumbbell in each hand. Working one dumbbell per arm lets the elbows sit where they want to and takes the wrist strain out of a fixed EZ bar.',
    mechanics: 'isolation',
    role: 'accessory',
    movementPatterns: ['elbow_extension'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
    stabilizers: ['front_delts'],
    equipment: ['dumbbell'],
    optionalEquipment: ['flat_bench', 'exercise_mat'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '10-12',
    defaultRest: '60 sec',
    instructions: [
      'Lie on a bench or the floor with a dumbbell in each hand, arms straight up over your chest, palms facing each other.',
      'Keeping the upper arms still, bend at the elbows and lower the dumbbells towards your ears.',
      'Stop when your forearms are just past parallel to the floor.',
      'Straighten the elbows to press back up without letting the upper arms drift.',
    ],
    cues: [
      'Only the forearm moves. The moment the elbows travel backwards it becomes a pullover.',
      'Elbows point at the ceiling and stay there, roughly shoulder width.',
      'Lower slowly — this is where the long head of the triceps earns its money.',
    ],
    commonMistakes: [
      'Flaring the elbows out so the chest and shoulders take the load.',
      'Going heavy enough that the upper arms swing to get the dumbbells moving.',
    ],
    variations: ['skull-crusher', 'overhead-tricep-extension'],
    tags: ['arms', 'triceps', 'isolation'],
    bodyRegion: 'upper_body',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-step-up',
    name: 'Dumbbell Step-Up',
    aliases: ['Dumbbell Step-Ups', 'Dumbbell Box Step-Up'],
    description:
      'A step-up onto a box or bench with a dumbbell in each hand. One leg does the work, the load hangs at the sides, and the grip and trunk have to hold it together — the dumbbell-only program uses it as its main unilateral leg builder.',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['lunge'],
    laterality: 'unilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings'],
    stabilizers: ['abs', 'calves', 'grip'],
    equipment: ['dumbbell', 'box'],
    optionalEquipment: ['flat_bench'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '10-12 per side',
    defaultRest: '90 sec',
    instructions: [
      'Hold a dumbbell in each hand and stand facing a box or bench about knee height.',
      'Place one whole foot on the box and drive through that leg to stand up on top.',
      'Bring the trailing foot up to meet it, or leave it hanging if you want the working leg to keep the tension.',
      'Lower back down under control on the same leg, and finish all the reps before switching.',
    ],
    cues: [
      'Push the box away with the top leg instead of pushing off the floor with the bottom one.',
      'Whole foot on the box. A heel hanging off turns it into a calf raise.',
      'Step down slowly — dropping off is where the knee gets a bad rep.',
    ],
    commonMistakes: [
      'Using a box so high the hips have to twist to get on top of it.',
      'Bouncing off the back foot so the working leg barely does anything.',
    ],
    variations: ['step-up', 'bulgarian-split-squat'],
    tags: ['lunge', 'unilateral', 'functional'],
    bodyRegion: 'lower_body',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-calf-raise',
    name: 'Dumbbell Calf Raise',
    aliases: ['Dumbbell Calf Raises', 'Dumbbell Standing Calf Raise', 'Standing Calf Raise (with Dumbbells)'],
    description:
      'A standing calf raise loaded with a dumbbell in each hand rather than a machine. The load is limited by grip long before it is limited by the calves, so it runs in higher rep ranges than the machine version.',
    mechanics: 'isolation',
    role: 'accessory',
    movementPatterns: ['ankle_flexion'],
    laterality: 'bilateral',
    difficulty: 'beginner',
    primaryMuscles: ['calves'],
    secondaryMuscles: [],
    stabilizers: ['grip'],
    equipment: ['dumbbell'],
    optionalEquipment: ['box'],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '15-20',
    defaultRest: '60 sec',
    instructions: [
      'Stand tall with a dumbbell in each hand, arms relaxed at your sides.',
      'Rise onto the balls of your feet as high as you can.',
      'Hold the top for a beat.',
      'Lower your heels slowly until you feel the calves stretch, then go again.',
    ],
    cues: [
      'All the way up, all the way down. A half rep trains nothing.',
      'Pause at the top — the squeeze is the exercise, the bounce is not.',
      'Stand on a step if the floor cuts the stretch short.',
    ],
    commonMistakes: [
      'Bouncing through the reps on tendon rebound.',
      'Letting the ankles roll out to the little toe under load.',
    ],
    variations: ['standing-calf-raise', 'seated-calf-raise'],
    tags: ['calves', 'isolation'],
    bodyRegion: 'lower_body',
  },
  {
    ...variantDefaults,
    slug: 'dumbbell-push-press',
    name: 'Dumbbell Push Press',
    aliases: ['Dumbbell Push-Press'],
    description:
      'An overhead press with dumbbells started by a short dip and drive of the legs, so more weight gets overhead than a strict press allows. Each arm presses its own dumbbell, so nothing hides a weak side.',
    mechanics: 'compound',
    role: 'compound',
    movementPatterns: ['vertical_push', 'triple_extension'],
    laterality: 'bilateral',
    difficulty: 'intermediate',
    primaryMuscles: ['front_delts', 'side_delts'],
    secondaryMuscles: ['triceps', 'quads', 'glutes'],
    stabilizers: ['abs'],
    equipment: ['dumbbell'],
    optionalEquipment: [],
    trackingType: 'reps_weight',
    defaultSets: 3,
    defaultReps: '8-10',
    defaultRest: '90 sec',
    instructions: [
      'Stand with a dumbbell at each shoulder, palms facing forward or in, feet hip width.',
      'Dip at the knees a few inches, keeping your torso upright.',
      'Drive out of the dip and use that momentum to press the dumbbells overhead until the arms lock out.',
      'Lower them back to the shoulders under control before the next rep.',
    ],
    cues: [
      'Short dip, fast drive. A slow dip leaks all the help the legs were giving.',
      'Stay upright through the dip — leaning forward turns it into an incline press.',
      'Finish with the dumbbells over the middle of your head, not out in front.',
    ],
    commonMistakes: [
      'Dipping deep enough that it becomes a thruster.',
      'Pressing before the legs have finished driving, so the two never connect.',
    ],
    variations: ['push-press', 'dumbbell-shoulder-press', 'dumbbell-thruster'],
    tags: ['press', 'overhead', 'explosive'],
    bodyRegion: 'upper_body',
  },
]

// ─── Splits: which fold each new row undoes ─────────────────────────────────

export interface DumbbellVariantSplit {
  /** The generic catalog slug the dumbbell variant was folded into. */
  from: string
  /** That row's catalog name — the evidence for what a member is shown today. */
  fromName: string
  /** The new row, created from DUMBBELL_VARIANT_EXERCISES. */
  to: string
  /**
   * Alias strings to MOVE off `from`. These are the coach's own dumbbell
   * wording, recorded on the generic row when the programs were imported, and
   * they are the reason the fold keeps happening — leaving them behind would
   * mean two rows answer to one name and lib/exerciseNameMatch drops the key
   * as ambiguous instead of resolving it either way.
   */
  handOverAliases: string[]
  /** `program_id`s whose reference to `from` becomes a reference to `to`. */
  programs: string[]
  reason: string
}

export const DUMBBELL_VARIANT_SPLITS: DumbbellVariantSplit[] = [
  {
    from: 'crunch',
    fromName: 'Crunch',
    to: 'dumbbell-crunch',
    handOverAliases: ['DB Crunch × 20'],
    programs: ['db-only-total-transformation'],
    reason:
      'Jon\'s own example: "We need crunch and dumbbell crunch to be separate because they are two different exercises. One is with weight the other is without." The catalog had one bodyweight Crunch whose only alias was the dumbbell-only program\'s wording, and that program is the only one that references it.',
  },
  {
    from: 'russian-twist',
    fromName: 'Russian Twist',
    to: 'dumbbell-russian-twist',
    handOverAliases: ['Russian Twists (with DB) × 40', 'Dumbbell Russian Twist'],
    programs: ['db-only-total-transformation', 'program_5'],
    reason:
      'The generic row carries BOTH "Russian Twists × 40" and "Russian Twists (with DB) × 40" as aliases, i.e. the unweighted and weighted versions of the same name from different programs. The unweighted one stays on the bodyweight row (the at-home program uses it); the weighted one becomes its own exercise.',
  },
  {
    from: 'cable-woodchopper',
    fromName: 'Cable Woodchopper',
    to: 'dumbbell-woodchopper',
    handOverAliases: ['DB Woodchoppers × 15 per side'],
    programs: ['db-only-total-transformation'],
    reason:
      'A cable row whose only alias is a dumbbell exercise, referenced by exactly one program — the dumbbell-only one, which has no cable machine in its equipment list. The member is being shown a cable demo for a dumbbell movement.',
  },
  {
    from: 'romanian-deadlift',
    fromName: 'Romanian Deadlift',
    to: 'dumbbell-romanian-deadlift',
    handOverAliases: ['Dumbbell RDL', 'DB Romanian Deadlift', 'Dumbbell Romanian Deadlift'],
    programs: ['db-only-total-transformation', 'program_5'],
    reason:
      'The barbell RDL stays exactly as it is for the four barbell programs that use it, including its "RDL" and "RDL (Barbell or Dumbbell)" aliases. Only the two dumbbell-only programs move.',
  },
  {
    from: 'hip-thrust',
    fromName: 'Hip Thrust',
    to: 'dumbbell-hip-thrust',
    handOverAliases: ['DB Hip Thrust', 'Dumbbell Hip Thrust'],
    programs: ['db-only-total-transformation', 'program_5'],
    reason:
      'Jon has filmed this under both his own spellings — "DB Hip Thrust" and "Dumbbell Hip Thrust" are both in the exercisevideos collection — and both spellings ended up as aliases on the BARBELL row, which is where its video lives. The barbell row keeps "Barbell Hip Thrust" and the 30-Day Shred.',
  },
  {
    from: 'skull-crusher',
    fromName: 'Skull Crusher',
    to: 'dumbbell-skull-crusher',
    handOverAliases: ['DB Skull Crushers'],
    programs: ['db-only-total-transformation'],
    reason:
      'The generic row is an EZ-bar movement and the Circuit & Superset Shred arm triset keeps it. The dumbbell-only program\'s "DB Skull Crushers" is a different setup with a different video.',
  },
  {
    from: 'step-up',
    fromName: 'Step-Up',
    to: 'dumbbell-step-up',
    handOverAliases: ['DB Step-Ups'],
    programs: ['db-only-total-transformation'],
    reason:
      'Two other programs prescribe the unloaded box step-up and keep the generic row (and its "Box Step-Ups" alias). The dumbbell-only program loads it.',
  },
  {
    from: 'standing-calf-raise',
    fromName: 'Standing Calf Raise',
    to: 'dumbbell-calf-raise',
    handOverAliases: ['Standing Calf Raise (with DBs)', 'DB Calf Raises'],
    programs: ['db-only-total-transformation', 'program_5'],
    reason:
      'The generic row is the calf raise MACHINE and Strength & Size 2.0 uses it as such. "Standing or Seated Calf Raise" stays on it; the two dumbbell wordings move.',
  },
  {
    from: 'push-press',
    fromName: 'Push Press',
    to: 'dumbbell-push-press',
    handOverAliases: ['Dumbbell Push Press'],
    programs: ['program_5'],
    reason:
      'The barbell push press stays for the 30-Day Shred, which programs it at 4×6 off a rack. The 30-minute dumbbell program has no barbell.',
  },
]

// ─── Aliases to add: wording the coach searches with ────────────────────────

export interface DumbbellAliasAddition {
  slug: string
  aliases: string[]
  reason: string
}

/**
 * Not a split — these rows are already dumbbell exercises with dumbbell
 * equipment, so "if the exercise already exists let it be" applies. What they
 * lacked is the words Jon types. The admin catalog list matches a query as a
 * substring of the name, the slug or an alias, so a row can be sitting right
 * there and still not come up.
 */
export const DUMBBELL_ALIAS_ADDITIONS: DumbbellAliasAddition[] = [
  {
    slug: 'overhead-tricep-extension',
    aliases: ['Dumbbell Overhead Tricep Press', 'Dumbbell Overhead Triceps Press'],
    reason:
      'The exercise named in the card title. The row already loads a dumbbell and already answers to "Overhead Tricep Extension" and "DB Overhead Tricep Extension" — but Jon calls it a PRESS, and no substring of "extension" contains "press". Adding the wording is the whole fix; renaming the row would change what four other programs display, and three of them are not dumbbell programs.',
  },
]

// ─── "DB" → "Dumbbell" ─────────────────────────────────────────────────────

const DB_TOKEN = /\bdbs?\b/gi

/**
 * "I'd rather switch them all to just say dumbbell."
 *
 * Rewrites the standalone token `DB`/`DBs` (any case) to `Dumbbell`/`Dumbbells`
 * and leaves everything else byte for byte — including the separator, so
 * "Bench Press (DB/bar)" becomes "Bench Press (Dumbbell/bar)" and a word that
 * merely starts with those letters ("DBell") is untouched.
 *
 * Safe to run twice: the output contains no `DB` token to rewrite again.
 */
export function spellDumbbellInFull(text: string): string {
  return text.replace(DB_TOKEN, (match) => (match.length === 3 ? 'Dumbbells' : 'Dumbbell'))
}

/** True if `text` still uses the shorthand. */
export function usesDumbbellShorthand(text: string): boolean {
  DB_TOKEN.lastIndex = 0
  return DB_TOKEN.test(text)
}

// ─── The per-row edit ───────────────────────────────────────────────────────

export interface DumbbellRowFix {
  slug: string
  reason: string
  /** Aliases handed over to a new dumbbell row — removed from this one. */
  removeAliases: string[]
  /** Aliases to add (deduped, case-insensitively). */
  addAliases: string[]
  /** Slugs to append to `variations` (deduped, additive — never removes). */
  addVariations: string[]
}

/**
 * The curated edits, keyed by slug: one per split (hand the alias over, link
 * the new row as a variation) plus the alias additions. Derived rather than
 * written out a second time so the two can never disagree.
 */
export function dumbbellRowFixes(): Map<string, DumbbellRowFix> {
  const fixes = new Map<string, DumbbellRowFix>()

  const ensure = (slug: string, reason: string): DumbbellRowFix => {
    const existing = fixes.get(slug)
    if (existing) return existing
    const fresh: DumbbellRowFix = { slug, reason, removeAliases: [], addAliases: [], addVariations: [] }
    fixes.set(slug, fresh)
    return fresh
  }

  for (const split of DUMBBELL_VARIANT_SPLITS) {
    const fix = ensure(split.from, split.reason)
    fix.removeAliases.push(...split.handOverAliases)
    fix.addVariations.push(split.to)
  }
  for (const addition of DUMBBELL_ALIAS_ADDITIONS) {
    const fix = ensure(addition.slug, addition.reason)
    fix.addAliases.push(...addition.aliases)
  }

  return fixes
}

export interface DumbbellRowState {
  name: string
  aliases: string[]
  variations: string[]
}

export interface DumbbellRowDiff extends DumbbellRowState {
  slug: string
  changed: boolean
  nameChanged: boolean
  aliasesChanged: boolean
  variationsChanged: boolean
  reason: string
}

const key = (value: string) => value.trim().toLowerCase()

/**
 * The next state of one catalog row: the curated fix (if there is one for this
 * slug) followed by the "DB" → "Dumbbell" spelling pass, which runs on EVERY
 * row whether or not it has a fix.
 *
 * Order matters. Aliases are handed over first, so `hip-thrust` loses both
 * "DB Hip Thrust" and "Dumbbell Hip Thrust" rather than having the first
 * rewritten into a duplicate of the second and then kept.
 *
 * The alias list is deduped case-insensitively against itself and against the
 * name, because the spelling pass creates collisions: "DB Bench Press" spelled
 * out IS the Dumbbell Bench Press's own name. The dedupe is not restricted to
 * collisions the pass caused — it also drops a handful of pre-existing ones
 * (`push-up` carries both "Push-Ups" and "Push-ups"; `cable-tricep-pushdown`
 * carries an alias identical to its name). That is deliberate and safe: both
 * lib/exerciseNameMatch.ts and the admin list's search lowercase before they
 * compare, so a case-insensitive duplicate cannot affect a single resolution
 * or a single search result. It only shortens the list on the admin row.
 *
 * Idempotent: running it on its own output reports `changed: false`.
 */
export function computeDumbbellRowDiff(
  current: DumbbellRowState,
  fix?: DumbbellRowFix,
): DumbbellRowDiff {
  const removed = new Set((fix?.removeAliases ?? []).map(key))

  const nextName = spellDumbbellInFull(current.name)

  const aliases: string[] = []
  const seen = new Set<string>([key(nextName)])
  for (const raw of [...current.aliases.filter((a) => !removed.has(key(a))), ...(fix?.addAliases ?? [])]) {
    if (typeof raw !== 'string' || !raw.trim()) continue
    const spelled = spellDumbbellInFull(raw).trim()
    const k = key(spelled)
    // An alias that now reads exactly like the name (or like an alias already
    // kept) carries no information — "DB Hip Thrust" spelled out IS
    // "Dumbbell Hip Thrust".
    if (seen.has(k)) continue
    seen.add(k)
    aliases.push(spelled)
  }

  const existingVariations = new Set(current.variations)
  const missingVariations = (fix?.addVariations ?? []).filter((slug) => !existingVariations.has(slug))
  const variations = missingVariations.length > 0
    ? [...current.variations, ...missingVariations]
    : current.variations

  const nameChanged = nextName !== current.name
  const aliasesChanged =
    aliases.length !== current.aliases.length || aliases.some((a, i) => a !== current.aliases[i])
  const variationsChanged = missingVariations.length > 0

  return {
    slug: fix?.slug ?? '',
    changed: nameChanged || aliasesChanged || variationsChanged,
    nameChanged,
    aliasesChanged,
    variationsChanged,
    name: nextName,
    aliases,
    variations,
    reason: fix?.reason ?? 'spell the DB shorthand out in full',
  }
}

// ─── Lookups ───────────────────────────────────────────────────────────────

/**
 * The dumbbell slug a program's reference should point at, or `undefined` when
 * this program is not one of the dumbbell-only ones or this slug is not folded.
 * Keyed by BOTH, which is the point: the barbell programs keep their RDL.
 */
export function dumbbellRepointFor(programId: string, slug: string): string | undefined {
  return DUMBBELL_VARIANT_SPLITS.find((s) => s.from === slug && s.programs.includes(programId))?.to
}

/** The new row for a slug, if this table creates it. */
export function dumbbellVariantFor(slug: string): DumbbellVariantExercise | undefined {
  return DUMBBELL_VARIANT_EXERCISES.find((e) => e.slug === slug)
}
