// The reviewed decision for each program exercise that was pointing at
// nothing when the "Exercise do not exist in our data base" card was filed.
//
// Thirty-six distinct references across the nine live programs named an
// `exerciseSlug` no document owned (see lib/exerciseAutoCatalog.ts for how
// they got there). They are not one problem but two:
//
//   RELINK — the exercise already exists under another name. "DB Squat
//            Press" is the catalog's Dumbbell Thruster, "Rowing Sprints" is
//            Rowing Machine Sprint, "Preacher Curl (Plate-Loaded)" is
//            Preacher Curl. This is Jon's second comment on the card:
//            "Some exercises already exist but are for different names."
//            Relinking is strictly better than minting a lookalike — the
//            existing row usually already has the video on it, and the
//            program keeps its own display name either way (hydrateExercise
//            treats the program's `name` as an override).
//
//   CREATE — the exercise genuinely is not in the catalog. Four of them:
//            Rest, Up-Downs, Ab Circuit, Sled Push.
//
// lib/exerciseNameMatch.ts resolves a good share of the relinks on its own,
// and scripts/repair-program-exercises.ts falls back to it. This table is
// consulted FIRST anyway, because a one-off write across production programs
// should be a list somebody read, not the output of a heuristic. Where a
// judgement was involved it is written down in `note`.
//
// Consumed by scripts/repair-program-exercises.ts. Kept in lib/ so the
// invariants are unit-tested (tests/unit/programExerciseRepairs.test.ts)
// rather than discovered during a production run.

import type { InferredExerciseFields } from './exerciseInference'

export interface ProgramExerciseCreate extends InferredExerciseFields {
  name: string
  aliases: string[]
  description: string
  instructions: string[]
  cues: string[]
  commonMistakes: string[]
}

export interface ProgramExerciseRepair {
  /** The dangling `exerciseSlug` as stored in the program. */
  slug: string
  /** The program's display name for it — the evidence the decision rests on. */
  label: string
  /** An existing catalog slug to point the program at instead. */
  relinkTo?: string
  /** A new catalog row, when nothing existing is the same movement. */
  create?: ProgramExerciseCreate
  note?: string
}

const REST: ProgramExerciseCreate = {
  name: 'Rest',
  aliases: ['Rest Period', 'Programmed Rest'],
  description:
    'A programmed pause between sets, rounds or intervals. Nothing to perform — the block is there so the rest itself is written down and timed rather than guessed at.',
  instructions: [
    'Stop working and let your breathing settle.',
    'Stay on your feet if you can — walking or standing clears fatigue faster than sitting down.',
    'Set up the next exercise while the clock runs.',
    'Start the next set when the prescribed rest has elapsed, not when you feel ready.',
  ],
  cues: [
    'Breathe in through the nose and out slowly — it brings the heart rate down quicker than gasping.',
    'Rest is part of the session, not a gap in it: cutting it short changes what the set trains.',
  ],
  commonMistakes: [
    'Scrolling through the whole rest and then adding two more minutes.',
    'Cutting rest short on a heavy strength set, which turns it into conditioning.',
  ],
  category: 'cooldown',
  mechanics: 'n/a',
  role: 'accessory',
  movementPatterns: ['n/a'],
  laterality: 'n/a',
  difficulty: 'beginner',
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: ['none'],
  trackingType: 'none',
  bodyRegion: 'full_body',
}

const UP_DOWNS: ProgramExerciseCreate = {
  name: 'Up-Downs',
  aliases: ['Up Downs', 'Up-Down', 'Football Up-Downs'],
  description:
    'A conditioning drill: run in place, drop your chest to the floor, and get straight back up. Programmed here in 30 seconds on / 15 seconds off intervals alongside mountain climbers and high knees.',
  instructions: [
    'Start jogging on the spot with short, fast steps.',
    'Drop your hands to the floor and lower your chest to the ground.',
    'Push straight back up and return to the jog in place.',
    'Keep the cycle going for the whole work interval.',
  ],
  cues: [
    'Land on the balls of your feet — quiet feet, not stamping.',
    'Get the hands down early; reaching for the floor from upright is what wrenches the lower back.',
    'Pace it. This is an interval, not a sprint to failure in the first ten seconds.',
  ],
  commonMistakes: [
    'Dropping to the knees instead of hinging down through the hands.',
    'Letting the hips sag on the way down, which loads the lower back.',
    'Going flat out for the first interval and stalling for the rest.',
  ],
  category: 'conditioning',
  mechanics: 'compound',
  role: 'secondary',
  movementPatterns: ['n/a'],
  laterality: 'bilateral',
  difficulty: 'beginner',
  primaryMuscles: ['full_body'],
  secondaryMuscles: ['quads', 'abs', 'front_delts'],
  equipment: ['bodyweight'],
  trackingType: 'reps_only',
  bodyRegion: 'full_body',
}

const AB_CIRCUIT: ProgramExerciseCreate = {
  name: 'Ab Circuit',
  aliases: ['Core Circuit', 'Abs Circuit'],
  description:
    'A short block of core exercises run back to back, a set of each with little or no rest, repeated for the prescribed rounds.',
  instructions: [
    'Pick three or four core exercises that train different jobs — a flexion movement, a rotation, an anti-extension hold.',
    'Work through them back to back with as little rest as the quality of the movement allows.',
    'Rest a minute between rounds.',
    'Repeat for the prescribed rounds.',
  ],
  cues: [
    'Quality beats speed: a slow rep you feel in the abs is worth five you feel in the hip flexors.',
    'Breathe out as you brace — holding your breath through a whole round is what makes the last one fall apart.',
  ],
  commonMistakes: [
    'Racing the reps until the hip flexors take over from the abs.',
    'Choosing four versions of the same movement, so nothing but the upper abs gets trained.',
  ],
  category: 'conditioning',
  mechanics: 'n/a',
  role: 'accessory',
  movementPatterns: ['anti_extension'],
  laterality: 'bilateral',
  difficulty: 'beginner',
  primaryMuscles: ['abs'],
  secondaryMuscles: ['obliques', 'hip_flexors'],
  equipment: ['exercise_mat'],
  trackingType: 'intervals',
  bodyRegion: 'core',
}

const SLED_PUSH: ProgramExerciseCreate = {
  name: 'Sled Push',
  aliases: ['Prowler Push', 'Sled Drive', 'Sled Push (Moderate)'],
  description:
    'Driving a loaded sled across the floor. All concentric — nothing lowers under load — so it builds leg drive and conditioning with very little soreness the next day.',
  instructions: [
    'Set the handles at chest height for an upright push, or low for a harder drive.',
    'Take a long body angle: arms locked, hips and shoulders in one line behind the sled.',
    'Drive through the ball of the foot, one leg at a time, with short punchy steps.',
    'Push for the prescribed distance or time, then reset and walk back.',
  ],
  cues: [
    'Lean into it — the further forward the body angle, the more the legs do the work.',
    'Arms stay locked. Bending them turns a leg exercise into a chest one.',
    'Short steps, high turnover. Long strides stall the sled.',
  ],
  commonMistakes: [
    'Standing too upright, which makes it a grind rather than a drive.',
    'Loading it so heavily that it turns into a stalled push instead of continuous steps.',
  ],
  category: 'strongman',
  mechanics: 'compound',
  role: 'compound',
  movementPatterns: ['gait', 'horizontal_push'],
  laterality: 'alternating',
  difficulty: 'intermediate',
  primaryMuscles: ['quads', 'glutes'],
  secondaryMuscles: ['calves', 'hamstrings', 'abs'],
  equipment: ['sled'],
  trackingType: 'time_distance',
  bodyRegion: 'lower_body',
}

/**
 * One entry per dangling reference found in production on 2026-09-18, plus
 * the ones a later card named (`leg-curl-machine`, 2026-09-25 — a reference
 * with no `name` on it, which the first sweep could only match by name).
 *
 * Where a program entry offers a choice ("Chest Press Machine or DB Flat
 * Press", "Row (Seated Cable Row / Dual-Cable Row / Chest-Supported T-Bar)")
 * the FIRST option named is the one linked: it is the coach's default, the
 * rest are stated alternatives, and the program's own display name still
 * lists all of them.
 */
export const PROGRAM_EXERCISE_REPAIRS: ProgramExerciseRepair[] = [
  // ── Created: genuinely not in the catalog ──────────────────────────────
  { slug: 'rest', label: 'Rest', create: REST },
  { slug: 'up-downs', label: 'Up-downs', create: UP_DOWNS, note: 'Programmed in a 30s-on/15s-off block with mountain climbers and high knees, so it is read as the athletic up-down (drop to the floor, pop up), not a plank up-down. Needs a video either way.' },
  { slug: 'ab-circuit', label: 'Ab Circuit', create: AB_CIRCUIT },
  { slug: 'sled-push', label: 'Sled Push', create: SLED_PUSH },

  // ── Relinked: already in the catalog under another name ────────────────
  { slug: 'rowing-sprints', label: 'Rowing Sprints', relinkTo: 'rowing-machine-sprint' },
  { slug: 'russian-deadlift', label: 'Russian Deadlift', relinkTo: 'romanian-deadlift', note: '"Russian deadlift" is a common misnaming of the Romanian deadlift, and this one sits in a light-weight hinge circuit. The program keeps its own label; the demo video it gains is an RDL, which is the movement being asked for.' },
  { slug: 'slow-v-ups', label: 'Slow V-ups', relinkTo: 'v-up' },
  { slug: 'db-squat-press', label: 'DB Squat Press', relinkTo: 'dumbbell-thruster', note: 'A squat into an overhead press with dumbbells is a thruster.' },
  { slug: 'db-hammer-curl', label: 'DB Hammer Curl', relinkTo: 'hammer-curl' },
  { slug: 'treadmill', label: 'Treadmill', relinkTo: 'treadmill-run', note: 'Programmed as "5 min warm up, 3.5" — a treadmill block with no modality of its own in the catalog.' },
  { slug: 'squat', label: 'Squat', relinkTo: 'barbell-back-squat', note: 'An unqualified "Squat" on a gym day is the back squat.' },
  { slug: 'warm-up', label: 'Warm-Up', relinkTo: 'dynamic-stretch', note: 'The catalog entry that already carries the aliases "Dynamic Warm-up" and "Mobility Flow".' },
  { slug: 'dumbbell-press', label: 'Dumbbell Press', relinkTo: 'dumbbell-bench-press' },
  { slug: 'bicep-curls', label: 'Bicep Curls', relinkTo: 'dumbbell-curl' },
  { slug: 'chest-press-machine-or-db-flat-press', label: 'Chest Press Machine or DB Flat Press', relinkTo: 'machine-chest-press' },
  { slug: 'incline-db-press-15-30', label: 'Incline DB Press (15-30°)', relinkTo: 'incline-dumbbell-press' },
  { slug: 'chest-fly-machine-or-db', label: 'Chest Fly (Machine or DB)', relinkTo: 'machine-fly' },
  { slug: 'row-seated-cable-row-dual-cable-row-chest-supported-t-bar', label: 'Row (Seated Cable Row / Dual-Cable Row / Chest-Supported T-Bar)', relinkTo: 'cable-row' },
  { slug: 'lat-pulldown-or-single-arm-lat-pulldown', label: 'Lat Pulldown or Single-Arm Lat Pulldown', relinkTo: 'lat-pulldown' },
  { slug: 'rear-delt-machine-or-face-pull', label: 'Rear Delt Machine or Face Pull', relinkTo: 'rear-delt-fly-machine' },
  { slug: 'seated-db-shoulder-press-or-arnold-press', label: 'Seated DB Shoulder Press or Arnold Press', relinkTo: 'dumbbell-shoulder-press' },
  { slug: 'db-or-plate-shrug', label: 'DB or Plate Shrug', relinkTo: 'dumbbell-shrug' },
  { slug: 'cable-lateral-raise-1-arm', label: 'Cable Lateral Raise (1 Arm)', relinkTo: 'cable-lateral-raise' },
  { slug: 'reverse-pec-deck-or-face-pull', label: 'Reverse Pec Deck or Face Pull', relinkTo: 'rear-delt-fly-machine', note: 'A reverse pec deck IS the rear delt machine — the catalog\'s "Machine Fly" is the forward, chest version.' },
  { slug: 'long-rope-triceps-pulldown-or-rope-pushdown', label: 'Long Rope Triceps Pulldown or Rope Pushdown', relinkTo: 'cable-tricep-pushdown' },
  { slug: 'bent-over-cable-kickbacks', label: 'Bent-Over Cable Kickbacks', relinkTo: 'tricep-cable-kickback', note: 'Sits between an overhead triceps extension and a preacher curl in an arm block, so it is the triceps kickback, not the glute one.' },
  { slug: 'preacher-curl-plate-loaded', label: 'Preacher Curl (Plate-Loaded)', relinkTo: 'preacher-curl' },
  { slug: 'hammer-curl-db-or-rope', label: 'Hammer Curl (DB or Rope)', relinkTo: 'hammer-curl' },
  { slug: 'hip-thrust-plate-loaded', label: 'Hip Thrust (Plate-Loaded)', relinkTo: 'hip-thrust' },
  { slug: 'chest-press-machine-or-db-press', label: 'Chest Press Machine or DB Press', relinkTo: 'machine-chest-press' },
  { slug: '1-arm-seated-cable-row', label: '1-Arm Seated Cable Row', relinkTo: 'single-arm-cable-row' },
  { slug: 'finisher-kb-farmer-s-carry-or-sled-push', label: "Finisher: KB Farmer's Carry or Sled Push", relinkTo: 'farmer-carry' },
  { slug: 'leg-press-feet-slightly-high', label: 'Leg Press (Feet Slightly High)', relinkTo: 'leg-press' },
  { slug: 'hamstring-curl-machine', label: 'Hamstring Curl Machine', relinkTo: 'seated-leg-curl', note: 'The catalog entry that already carries the alias "Leg Curl Machine".' },
  { slug: 'leg-curl-machine', label: 'Leg Curl Machine', relinkTo: 'seated-leg-curl', note: 'Card: "Leg curl machine is not in our data base please fix so I can upload the video." The same machine as hamstring-curl-machine above, written the other way round, and the same target: Seated Leg Curl already carries "Leg Curl Machine" as an alias. The reference carries no name of its own — the slug text is the whole label, which is why it was not on the 2026-09-18 sweep: that sweep only name-matched references that had a name.' },
  { slug: 'long-rope-triceps-pulldown-arm-pump', label: 'Long Rope Triceps Pulldown (Arm Pump)', relinkTo: 'cable-tricep-pushdown' },
  { slug: 'cable-or-ez-bar-curl-arm-pump', label: 'Cable or EZ-Bar Curl (Arm Pump)', relinkTo: 'cable-curl' },
]

/** The repair for a dangling slug, if one was written down for it. */
export function repairFor(slug: string): ProgramExerciseRepair | undefined {
  return PROGRAM_EXERCISE_REPAIRS.find((r) => r.slug === slug)
}
