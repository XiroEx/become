// The dumbbell version of a movement is its own exercise, with its own row.
//
// Card: "We need to have support for our dumbbell only program. When I
// searched the exercise in the admin portal, none of the exercises pop up.
// Instead, what they do is get added under like a similar name. I honestly
// don't like that. We use DB for those exercises and I'd rather switch them
// all to just say dumbbell. But the main thing is that dumbbell overhead
// tricep press and all of the exercises needs to appear on admin portal."
//
// Comments: "Go through the whole program and make sure all of the exercises
// exist in the admin portal." / "We need crunch and dumbbell crunch to be
// separate because they are two different exercises. One is with weight the
// other is without." / "Please make sure all exercises are accounted for. If
// the exercise already exists let it be. I need to be able to upload videos
// to every exercise."
//
// And, after the first round shipped: "You didn't change anything. The
// exercises still read with a DB. The exercises still don't exist in the admin
// portal." / "Ensure all of these exercises exist in the admin portal NOT AS
// ALIAS. ACTUAL EXERCISES. I need to upload the video. For example a dumbbell
// row is not a dumbbell bent over row. They should be two separate."
//
// Both of those are answered elsewhere and both matter more than the table:
//
//   * "You didn't change anything" was TRUE. The first round wrote this table,
//     the repo's catalog fixture and a script — and a script nobody runs
//     changes nothing in the database the admin portal reads. The writer is now
//     `app/api/cron/sync-exercise-catalog`, called by
//     `.github/workflows/sync-exercise-catalog.yml` on every push to `main` and
//     daily after that, so shipping IS applying. lib/dumbbellCatalogSync.ts is
//     the one code path both it and the script use.
//
//   * "a dumbbell row is not a dumbbell bent over row" is a thirteenth row in
//     the table below, and it is the same defect as the other nine: the
//     two-arm bent-over row was living as an ALIAS on `dumbbell-row`, whose
//     recorded demo is `/exercises/db-single-arm-row.mov` and whose default
//     prescription is "8-12 per side" — i.e. the row that existed was always
//     the SINGLE-ARM row.
//
// ── What was actually wrong ────────────────────────────────────────────────
// The two dumbbell-only programs (`db-only-total-transformation` and
// `program_5`, the 30-Minute Dumbbell-Only Program) were imported by name.
// Where the catalog had no dumbbell row for a movement, the importer attached
// the program's wording to the nearest row it could find AS AN ALIAS and
// pointed the program at it. So the catalog holds:
//
//   Crunch               bodyweight   alias "DB Crunch × 20"
//   Russian Twist        bodyweight   alias "Russian Twists (with DB) × 40"
//   Standing Calf Raise  machine      alias "Standing Calf Raise (with DBs)"
//   Hip Thrust           barbell      alias "DB Hip Thrust"
//   Step-Up              box          alias "DB Step-Ups"
//   Romanian Deadlift    barbell      alias "DB Romanian Deadlift"
//   Push Press           barbell      alias "Dumbbell Push Press"
//   Skull Crusher        ez_bar       alias "DB Skull Crushers"
//   Cable Woodchopper    cable        alias "DB Woodchoppers × 15 per side"
//
// Nine dumbbell exercises with no row of their own: nothing in the admin
// portal called any of them, searching for one returned the barbell/machine/
// bodyweight row instead, and a video uploaded there is the video the barbell
// program shows. That is the whole of "none of the exercises pop up. Instead,
// what they do is get added under like a similar name."
//
// lib/workout/dumbbellWeight.ts already documents the downstream damage from
// the same aliases (the two most-logged lifts in the app were labelled
// "Weight per DB"); it stopped reading them. This fixes the cause.
//
// ── The three things this table says ──────────────────────────────────────
//
//   SPLIT   — the dumbbell version becomes its own row, the alias that named
//             it is REMOVED from the host, and the dumbbell-only program's
//             reference is repointed at the new row. Removing the alias is
//             not cosmetic: lib/exerciseNameMatch.ts drops a key two
//             exercises claim, so leaving "DB Hip Thrust" on the barbell row
//             would make "Dumbbell Hip Thrust" resolve to NOTHING.
//
//             A split keeps its host's classification — category, mechanics,
//             role, movement patterns, muscles, body region — and changes
//             only what the implement changes: the name, the aliases, the
//             equipment, and the tracking type where the host was
//             bodyweight. That is Jon's crunch example exactly: "One is with
//             weight the other is without" (`reps_bodyweight` →
//             `reps_weight`). Nothing else about the movement is re-guessed.
//
//   ADD     — a movement the dumbbell-only program names inside a protocol
//             block (EMOM / AMRAP / DB complex) that has no catalog row at
//             all. Three of them: Dumbbell Swing, Dumbbell Hang Clean,
//             Jumping Lunge.
//
//   RENAME  — "dumbbell overhead tricep press", the exercise the card names
//             as "the main thing". It DOES exist and it IS the dumbbell one
//             (equipment `['dumbbell']`) — it is just called Overhead Tricep
//             Extension, so searching the portal for Jon's wording found
//             nothing. "If the exercise already exists let it be": the row
//             stays, the name spells out the implement, and the coach's
//             wording is added as an alias.
//
// Every new row ships with NO video, deliberately: that is what lists it in
// the admin portal's "No Video" tab, which is the queue of exercises waiting
// for Jon to record something (see lib/exerciseAutoCatalog.ts).
//
// Consumed by scripts/dumbbell-catalog.ts. Kept in lib/ so the invariants are
// unit-tested (tests/unit/dumbbellCatalog.test.ts) rather than discovered
// during a production run.

import type { MuscleGroup } from '@/models/Exercise'
import type { InferredExerciseFields } from './exerciseInference'

/** The two programs this card is about, by `program_id`. */
export const DUMBBELL_ONLY_PROGRAM_IDS: readonly string[] = [
  'db-only-total-transformation',
  'program_5', // 30-Minute Dumbbell-Only Program
]

/**
 * A demo that has ALREADY been recorded for this exact movement, reachable
 * today only through the host row's shorthand alias. Splitting the row without
 * carrying it would make an existing recording harder to reach, not easier.
 *
 * `source` names the `exercisevideos` row(s) it came from, so the claim is
 * checkable. Everything the table creates without one ships with no video on
 * purpose — that is what puts it in the admin portal's "No Video" tab, which
 * is the queue Jon records from.
 */
export interface DumbbellExistingVideo {
  videoUrl: string
  thumbnailUrl: string
  source: string
}

/** A full catalog row, minus the fields the schema defaults. */
export interface DumbbellExerciseCreate extends InferredExerciseFields {
  name: string
  aliases: string[]
  description: string
  instructions: string[]
  cues: string[]
  commonMistakes: string[]
  stabilizers: MuscleGroup[]
  tags: string[]
  /** The other exercises a member would recognise as the same movement. */
  variations: string[]
  defaultSets?: number
  defaultReps?: string
  defaultRest?: string
  video?: DumbbellExistingVideo
}

/**
 * Which of a program's references to the host row really mean the new one.
 *
 * `'all'` (the default) is right when the host is a different IMPLEMENT — a
 * dumbbell-only program can never mean the barbell hip thrust, so every
 * reference moves.
 *
 * `'both-arms'` is for the one split where host and new row are both dumbbell
 * exercises and the prescription is the only evidence: `dumbbell-row` is the
 * single-arm row (its demo is `db-single-arm-row.mov`, its default is "8-12 per
 * side"), so a reference prescribing "12 per arm" or "12/side" STAYS and a
 * reference prescribing plain reps is the two-arm bent-over row.
 */
export type DumbbellRepointScope = 'all' | 'both-arms'

/** A per-side prescription — "12 per arm", "10/side", "12 each leg". */
const PER_SIDE_PRESCRIPTION = /\b(?:per|each)\s+(?:side|arm|leg)\b|\/\s*(?:side|arm|leg)\b/i

/**
 * True when a program entry's rep prescription is written per side, which is
 * what distinguishes a single-arm row from a two-arm one in the only place the
 * program records the difference.
 */
export function isPerSidePrescription(reps: unknown): boolean {
  return typeof reps === 'string' && PER_SIDE_PRESCRIPTION.test(reps)
}

/** A dumbbell exercise that was living as an alias on another row. */
export interface DumbbellSplit {
  /** The new row. */
  slug: string
  /** The row it was hiding on. */
  from: string
  /**
   * Aliases to REMOVE from `from` — the ones that named the dumbbell version.
   * Without this the new row's name is ambiguous and resolves to nothing.
   */
  movedAliases: string[]
  /** `program_id`s whose reference to `from` is really this exercise. */
  repoint: readonly string[]
  /** Which references inside those programs move. Defaults to `'all'`. */
  repointScope?: DumbbellRepointScope
  create: DumbbellExerciseCreate
  note: string
}

/** A movement the dumbbell-only program names that has no row at all. */
export interface DumbbellAddition {
  slug: string
  create: DumbbellExerciseCreate
  note: string
}

/** An existing row whose NAME does not say which implement it is. */
export interface DumbbellRename {
  slug: string
  /** The name as it stands, so the migration can tell "done" from "moved on". */
  from: string
  to: string
  /** Added to `aliases`, including `from` so nothing that resolved by the old
   *  name stops resolving. */
  addAliases: string[]
  note: string
}

// ─── SPLIT ──────────────────────────────────────────────────────────────────

export const DUMBBELL_SPLITS: DumbbellSplit[] = [
  {
    slug: 'dumbbell-bent-over-row',
    from: 'dumbbell-row',
    movedAliases: ['Dumbbell Bent-Over Row', 'Dumbbell Bent Over Row'],
    repoint: ['db-only-total-transformation', 'program_5'],
    repointScope: 'both-arms',
    note: 'Jon\'s follow-up, verbatim: "a dumbbell row is not a dumbbell bent over row. They should be two separate." `dumbbell-row` was carrying BOTH — aliases "Dumbbell Bent-Over Row" and "Dumbbell Single-Arm Row" on one row — and the evidence says the row that exists is the single-arm one: its recorded demo is `/exercises/db-single-arm-row.mov`, its `laterality` is `unilateral` and its default prescription is "8-12 per side". So the two-arm bent-over row is the one with no row and nowhere to upload a video to. The dumbbell-only programs prescribe both: "4 × 8" and "3 × 12" are the two-arm row, "12 per arm" and "12/side" are the single-arm one, which is why this is the only split that repoints by prescription rather than wholesale.',
    create: {
      name: 'Dumbbell Bent-Over Row',
      aliases: ['Dumbbell Bent-Over Rows', 'Bent-Over Dumbbell Row', 'Two-Arm Dumbbell Row'],
      description:
        'Both dumbbells rowed at the same time from a hinged-over torso, elbows driving back past the ribs. The two-arm half of the pair — the one-arm-at-a-time version, braced on a bench, is Dumbbell Row.',
      instructions: [
        'Stand with feet hip width, a dumbbell in each hand, knees slightly soft.',
        'Hinge at the hips until your torso is somewhere near 45° or lower, back flat, arms hanging straight down.',
        'Row both dumbbells to the sides of your ribcage, leading with the elbows.',
        'Squeeze the shoulder blades together at the top, then lower under control until the arms are straight again.',
      ],
      cues: [
        'Set the torso angle before the first rep and do not let it rise as the set gets hard.',
        'Elbows past the ribs, not out wide — that is the difference between back work and rear-delt work.',
        'Let the arms hang fully at the bottom. A row that never straightens is half a rep.',
      ],
      commonMistakes: [
        'Standing up a little on every rep, which turns it into a shrug.',
        'Rounding the lower back to chase heavier dumbbells.',
        'Jerking the weight with the hips instead of pulling with the back.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['horizontal_pull'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['lats', 'mid_back'],
      secondaryMuscles: ['biceps', 'rear_delts'],
      stabilizers: ['abs', 'erector_spinae', 'grip'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'upper_body',
      tags: ['pull', 'back', 'dumbbell'],
      variations: ['dumbbell-row', 'barbell-row', 'dumbbell-underhand-row'],
      defaultSets: 4,
      defaultReps: '8-12',
      defaultRest: '90 sec',
    },
  },
  {
    slug: 'dumbbell-crunch',
    from: 'crunch',
    movedAliases: ['DB Crunch × 20'],
    repoint: ['db-only-total-transformation'],
    note: 'Jon\'s own example: "We need crunch and dumbbell crunch to be separate because they are two different exercises. One is with weight the other is without." `crunch` is the only reference in any program that came from the DB-only program, and its sole alias was "DB Crunch × 20" — so the bodyweight row WAS the dumbbell one.',
    create: {
      name: 'Dumbbell Crunch',
      aliases: ['Dumbbell Crunches', 'Weighted Crunch'],
      description:
        'A crunch performed holding a dumbbell at the chest or overhead, so the abs work against load rather than bodyweight alone. The weighted half of the pair — the unloaded version is Crunch.',
      instructions: [
        'Lie on your back with your knees bent and feet flat.',
        'Hold one dumbbell against your chest with both hands, or pressed straight up over your shoulders.',
        'Curl your shoulder blades off the floor by shortening the distance between your ribs and hips.',
        'Pause at the top, then lower under control without letting your shoulders rest between reps.',
      ],
      cues: [
        'Ribs towards hips — it is a short movement, not a sit-up.',
        'Breathe the air out as you curl up; the abs cannot shorten fully on a full chest.',
        'Keep the dumbbell still relative to your chest. If it swings, it is doing the rep for you.',
      ],
      commonMistakes: [
        'Pulling on the neck, or letting the dumbbell drag the head forward.',
        'Going so heavy that the hips start swinging and the movement becomes a sit-up.',
        'Bouncing off the floor instead of stopping short of it.',
      ],
      category: 'strength',
      mechanics: 'isolation',
      role: 'accessory',
      movementPatterns: ['n/a'],
      laterality: 'bilateral',
      difficulty: 'beginner',
      primaryMuscles: ['abs'],
      secondaryMuscles: [],
      stabilizers: [],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'core',
      tags: ['core', 'dumbbell', 'isolation'],
      variations: ['crunch'],
      defaultSets: 3,
      defaultReps: '15-20',
      defaultRest: '30 sec',
    },
  },
  {
    slug: 'dumbbell-russian-twist',
    from: 'russian-twist',
    movedAliases: ['Russian Twists (with DB) × 40', 'Dumbbell Russian Twist'],
    repoint: ['db-only-total-transformation', 'program_5'],
    note: 'The bodyweight Russian Twist stays — it is what the At-Home and Circuit & Superset programs prescribe. The two aliases that said "with DB" came from the dumbbell-only programs, and those two references move.',
    create: {
      name: 'Dumbbell Russian Twist',
      aliases: ['Dumbbell Russian Twists', 'Weighted Russian Twist'],
      description:
        'Seated rotation of the torso from side to side holding a dumbbell, feet on or just off the floor. The loaded version of the Russian Twist.',
      instructions: [
        'Sit on the floor with your knees bent, heels down or hovering.',
        'Hold one dumbbell at your chest with both hands and lean back until you feel your abs engage.',
        'Rotate your ribcage to one side and tap the dumbbell down beside your hip.',
        'Rotate through to the other side. One rep per side unless the program says "total".',
      ],
      cues: [
        'Turn the ribs, not just the arms — if only the dumbbell moves, the obliques are not working.',
        'Keep the chest tall through the whole set; rounding forward turns it into a hip-flexor hold.',
        'Slow the turn down. Speed here comes from momentum, not from the obliques.',
      ],
      commonMistakes: [
        'Swinging the dumbbell across the body while the torso stays square.',
        'Letting the lower back round until it is taking the load instead of the core.',
        'Counting each side as a full rep when the program asked for reps per side.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'accessory',
      movementPatterns: ['rotation'],
      laterality: 'alternating',
      difficulty: 'intermediate',
      primaryMuscles: ['obliques'],
      secondaryMuscles: ['abs', 'hip_flexors'],
      stabilizers: [],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'core',
      tags: ['core', 'rotation', 'dumbbell'],
      variations: ['russian-twist'],
      defaultSets: 3,
      defaultReps: '20 total',
      defaultRest: '45 sec',
    },
  },
  {
    slug: 'dumbbell-calf-raise',
    from: 'standing-calf-raise',
    movedAliases: ['Standing Calf Raise (with DBs)', 'DB Calf Raises'],
    repoint: ['db-only-total-transformation', 'program_5'],
    note: 'Standing Calf Raise is the calf-raise MACHINE, which is what Strength & Size 2.0 prescribes. A dumbbell-only program cannot use it, and the program\'s own wording was "Standing Calf Raise (with DBs)".',
    create: {
      name: 'Dumbbell Calf Raise',
      aliases: ['Standing Dumbbell Calf Raise', 'Standing Calf Raise (with Dumbbells)'],
      description:
        'Standing calf raise holding dumbbells at your sides, one or both feet on the floor or on a step for extra range. The dumbbell way of doing what the calf-raise machine does.',
      instructions: [
        'Stand tall holding a dumbbell in each hand at your sides.',
        'Put the balls of your feet on the floor or on the edge of a step, heels free.',
        'Rise as high onto your toes as you can and hold for a beat at the top.',
        'Lower until you feel a stretch through the calf, then go again.',
      ],
      cues: [
        'All the way up, all the way down — calves respond to range, not to load you cannot control.',
        'Pause at the top. A bouncing calf raise is the tendon working, not the muscle.',
        'Stay tall: no bending the knees to help the heels up.',
      ],
      commonMistakes: [
        'Short, fast reps that never reach a full stretch or a full contraction.',
        'Bending the knees and turning it into a quarter squat.',
        'Grip failing before the calves do — use straps or a wall for balance and heavier bells.',
      ],
      category: 'strength',
      mechanics: 'isolation',
      role: 'accessory',
      movementPatterns: ['ankle_flexion'],
      laterality: 'bilateral',
      difficulty: 'beginner',
      primaryMuscles: ['calves'],
      secondaryMuscles: [],
      stabilizers: ['grip'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'lower_body',
      tags: ['calves', 'isolation', 'dumbbell'],
      variations: ['standing-calf-raise', 'seated-calf-raise'],
      defaultSets: 3,
      defaultReps: '15-20',
      defaultRest: '45 sec',
    },
  },
  {
    slug: 'dumbbell-hip-thrust',
    from: 'hip-thrust',
    movedAliases: ['DB Hip Thrust', 'Dumbbell Hip Thrust'],
    repoint: ['db-only-total-transformation', 'program_5'],
    note: 'Hip Thrust is equipment `[barbell, flat_bench]` and keeps its "Barbell Hip Thrust" alias for the 30-Day Shred. The dumbbell version rests the bell across the hips and is a different setup and a different load.',
    create: {
      name: 'Dumbbell Hip Thrust',
      aliases: ['Dumbbell Hip Thrusts', 'Weighted Hip Thrust'],
      description:
        'Shoulders on a bench or the floor, one dumbbell resting across the hips, driving the hips up to full extension. The dumbbell way of loading a hip thrust when there is no barbell.',
      instructions: [
        'Sit on the floor with your upper back against a bench, or lie flat if you have no bench.',
        'Rest one dumbbell across the crease of your hips and hold it there with both hands.',
        'Plant your feet flat, about shoulder width, heels under your knees.',
        'Drive through the heels and squeeze the glutes until hips, knees and shoulders are in line.',
        'Lower until your hips are just off the floor and go again without resting the weight down.',
      ],
      cues: [
        'Finish with the glutes, not the lower back — ribs down, chin tucked at the top.',
        'Push the floor away through the heels rather than pulling with the toes.',
        'Pad the dumbbell with a towel or mat; it is the bar bruise that ends most sets early.',
      ],
      commonMistakes: [
        'Arching the lower back at the top instead of finishing with the glutes.',
        'Feet too far forward, which turns it into a hamstring exercise.',
        'Letting the dumbbell drift up the stomach so the drive goes nowhere.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'secondary',
      movementPatterns: ['hinge'],
      laterality: 'bilateral',
      difficulty: 'beginner',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings'],
      stabilizers: ['abs'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'lower_body',
      tags: ['glute_builder', 'hinge', 'dumbbell'],
      variations: ['hip-thrust', 'glute-bridge'],
      defaultSets: 3,
      defaultReps: '12-15',
      defaultRest: '60 sec',
      video: {
        videoUrl: '/exercises/dumbbell-hip-thrust.mov',
        thumbnailUrl: '/icons/icon-192.png',
        source: 'exercisevideos rows "Dumbbell Hip Thrust" and "DB Hip Thrust" — the demo was recorded, and was only reachable through the barbell row\'s alias',
      },
    },
  },
  {
    slug: 'dumbbell-step-up',
    from: 'step-up',
    movedAliases: ['DB Step-Ups'],
    repoint: ['db-only-total-transformation'],
    note: 'Step-Up is equipment `[box]` and keeps "Step Ups" and "Box Step-Ups" for the BECOME and Circuit & Superset programs, where the load is not stated. Only the reference that came in as "DB Step-Ups" moves.',
    create: {
      name: 'Dumbbell Step-Up',
      aliases: ['Dumbbell Step-Ups', 'Loaded Step-Up'],
      description:
        'Stepping up onto a box or bench holding a dumbbell in each hand, driving through the lead leg. One leg does the work, so the load needed is modest.',
      instructions: [
        'Hold a dumbbell in each hand at your sides and stand facing a box around knee height.',
        'Plant the whole of one foot on the box.',
        'Drive through that leg to stand up tall on the box — no pushing off the back foot.',
        'Lower yourself back down under control and repeat on the same leg for the prescribed reps.',
      ],
      cues: [
        'Whole foot on the box, knee tracking over the middle of the foot.',
        'Stand up with the top leg. If the bottom foot is pushing off, the box is too high or the weight too heavy.',
        'Control the way down — that is where the quad and glute actually get worked.',
      ],
      commonMistakes: [
        'Bouncing off the trailing foot to get up.',
        'A box so high the hip has to hitch to reach it.',
        'Dropping down instead of lowering, which wastes the hardest half of the rep.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['lunge'],
      laterality: 'unilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['quads', 'glutes'],
      secondaryMuscles: ['hamstrings'],
      stabilizers: ['abs', 'calves'],
      equipment: ['dumbbell', 'box'],
      trackingType: 'reps_weight',
      bodyRegion: 'lower_body',
      tags: ['lunge', 'unilateral', 'dumbbell'],
      variations: ['step-up'],
      defaultSets: 3,
      defaultReps: '12 per leg',
      defaultRest: '60 sec',
    },
  },
  {
    slug: 'dumbbell-romanian-deadlift',
    from: 'romanian-deadlift',
    movedAliases: ['Dumbbell RDL', 'DB Romanian Deadlift', 'Dumbbell Romanian Deadlift'],
    repoint: ['db-only-total-transformation', 'program_5'],
    note: 'Romanian Deadlift is the barbell lift six other programs prescribe; it keeps "RDL" and "RDL (Barbell or Dumbbell)" — the first implement named is the one linked, the convention lib/programExerciseRepairs.ts already uses. The three aliases that say dumbbell outright move to the new row.',
    create: {
      name: 'Dumbbell Romanian Deadlift',
      aliases: ['Dumbbell RDL', 'Dumbbell Romanian Deadlifts'],
      description:
        'A hip hinge holding a dumbbell in each hand, lowering the bells down the front of the legs until the hamstrings are stretched, then standing back up. The dumbbell version of the RDL.',
      instructions: [
        'Stand with feet hip width, a dumbbell in each hand in front of your thighs.',
        'Soften the knees slightly and keep them there — this is a hinge, not a squat.',
        'Push the hips back and let the dumbbells travel down the front of your legs.',
        'Stop when you feel the hamstrings stretch and your back is still flat.',
        'Drive the hips forward to stand tall, squeezing the glutes at the top.',
      ],
      cues: [
        'Hips back, not knees forward.',
        'Keep the dumbbells brushing the legs; letting them drift forward is what loads the lower back.',
        'Long spine from the tailbone to the crown — the back never rounds to get lower.',
      ],
      commonMistakes: [
        'Turning it into a squat by letting the knees travel forward.',
        'Chasing depth past the point the hamstrings can hold a flat back.',
        'Yanking the top of the rep with the lower back instead of finishing with the glutes.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['hinge'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['hamstrings'],
      secondaryMuscles: ['glutes', 'lower_back'],
      stabilizers: ['abs', 'grip'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'lower_body',
      tags: ['hinge', 'posterior_chain', 'dumbbell'],
      variations: ['romanian-deadlift', 'single-leg-rdl', 'dumbbell-deadlift'],
      defaultSets: 3,
      defaultReps: '10-12',
      defaultRest: '90 sec',
      video: {
        videoUrl: '/exercises/dumbbell-rdl.mov',
        thumbnailUrl: '/icons/icon-192.png',
        source: 'exercisevideos rows "Dumbbell RDL" and "DB Romanian Deadlift" — the demo was recorded, and was only reachable through the barbell row\'s alias',
      },
    },
  },
  {
    slug: 'dumbbell-push-press',
    from: 'push-press',
    movedAliases: ['Dumbbell Push Press'],
    repoint: ['program_5'],
    note: 'Push Press is the barbell lift the 30-Day Shred prescribes at 4×6. The 30-Minute Dumbbell-Only Program\'s Day 4 push press is the dumbbell one, and so is the "DB Push Press" named in the DB-only program\'s EMOM, complex and Tabata blocks.',
    create: {
      name: 'Dumbbell Push Press',
      aliases: ['Dumbbell Push-Press'],
      description:
        'An overhead press driven off a short dip of the knees, with a dumbbell in each hand. The leg drive is what lets you press more than a strict shoulder press.',
      instructions: [
        'Stand with a dumbbell at each shoulder, elbows in front of the bells.',
        'Dip the knees a few inches, keeping your torso upright.',
        'Drive the floor away and let that momentum start the dumbbells overhead.',
        'Finish the press with the shoulders and triceps until your arms are locked out.',
        'Lower the dumbbells back to the shoulders under control and reset before the next rep.',
      ],
      cues: [
        'Dip straight down, not forward — a forward dip sends the dumbbells away from you.',
        'One dip per rep. Two is a thruster with extra steps.',
        'Finish with the bells stacked over the shoulders, not out in front.',
      ],
      commonMistakes: [
        'Dipping so deep it becomes a squat.',
        'Leaning back to get under the weight instead of pressing it up.',
        'Pressing before the leg drive has done anything, which makes it a strict press with a wobble.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['vertical_push'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['front_delts', 'side_delts'],
      secondaryMuscles: ['triceps', 'quads', 'glutes'],
      stabilizers: ['abs'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'upper_body',
      tags: ['press', 'overhead', 'dumbbell', 'explosive'],
      variations: ['push-press', 'dumbbell-shoulder-press', 'dumbbell-thruster'],
      defaultSets: 3,
      defaultReps: '8-10',
      defaultRest: '90 sec',
    },
  },
  {
    slug: 'dumbbell-skull-crusher',
    from: 'skull-crusher',
    movedAliases: ['DB Skull Crushers'],
    repoint: ['db-only-total-transformation'],
    note: 'Skull Crusher is equipment `[ez_bar, flat_bench]`, which is what Circuit & Superset Shred prescribes. With dumbbells the wrists are neutral rather than fixed by a bar, which is the point of doing it this way.',
    create: {
      name: 'Dumbbell Skull Crusher',
      aliases: ['Dumbbell Skull Crushers', 'Dumbbell Lying Tricep Extension'],
      description:
        'Lying tricep extension with a dumbbell in each hand, palms facing each other, lowering the bells beside the head. The neutral-grip version of the skull crusher.',
      instructions: [
        'Lie on a bench or the floor with a dumbbell in each hand pressed over your chest, palms facing each other.',
        'Keep the upper arms still and bend at the elbows only.',
        'Lower the dumbbells until they are beside your ears.',
        'Extend back up until the arms are straight, without letting the elbows drift outwards.',
      ],
      cues: [
        'Elbows stay pointed at the ceiling for the whole set — nothing above the elbow moves.',
        'Palms facing each other keeps the wrists and elbows happy; that is why the dumbbells are better than a bar here.',
        'Stop just short of a full lockout to keep the tension on the triceps.',
      ],
      commonMistakes: [
        'Letting the upper arms swing back, which turns it into a pullover.',
        'Flaring the elbows out to move heavier weight.',
        'Clanging the bells together at the top instead of controlling the finish.',
      ],
      category: 'strength',
      mechanics: 'isolation',
      role: 'accessory',
      movementPatterns: ['elbow_extension'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['triceps'],
      secondaryMuscles: [],
      stabilizers: ['front_delts'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'upper_body',
      tags: ['arms', 'triceps', 'isolation', 'dumbbell'],
      variations: ['skull-crusher', 'overhead-tricep-extension'],
      defaultSets: 3,
      defaultReps: '10-12',
      defaultRest: '60 sec',
    },
  },
  {
    slug: 'dumbbell-woodchopper',
    from: 'cable-woodchopper',
    movedAliases: ['DB Woodchoppers × 15 per side'],
    repoint: ['db-only-total-transformation'],
    note: 'Cable Woodchopper needs a cable stack, and `cable-woodchopper` is referenced by exactly one program: the DB-only one, whose only alias on that row was "DB Woodchoppers × 15 per side". The cable row stays for the program builder; the dumbbell-only program gets the dumbbell movement.',
    create: {
      name: 'Dumbbell Woodchopper',
      aliases: ['Dumbbell Woodchoppers', 'Dumbbell Chop'],
      description:
        'A diagonal chop across the body holding one dumbbell in both hands, from above one shoulder down past the opposite hip. The dumbbell way of training rotation when there is no cable stack.',
      instructions: [
        'Stand with feet a little wider than shoulder width, holding one dumbbell in both hands.',
        'Reach the dumbbell up and over one shoulder, letting the torso rotate with it.',
        'Chop down and across to the outside of the opposite hip, pivoting the back foot as you turn.',
        'Reverse the path back to the start under control. Complete all reps on one side, then swap.',
      ],
      cues: [
        'Rotate through the ribs and hips together — the arms are just holding on.',
        'Let the back heel turn. Fighting the rotation at the foot is what tweaks knees.',
        'Move the dumbbell on a diagonal, not a circle.',
      ],
      commonMistakes: [
        'Chopping with the arms while the torso stays square.',
        'Going heavy enough that the lower back does the turning.',
        'Rounding forward at the bottom instead of staying tall through the chest.',
      ],
      category: 'strength',
      mechanics: 'compound',
      role: 'accessory',
      movementPatterns: ['rotation'],
      laterality: 'unilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['obliques'],
      secondaryMuscles: ['abs', 'front_delts'],
      stabilizers: ['hip_flexors', 'glutes'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'core',
      tags: ['core', 'rotation', 'dumbbell'],
      variations: ['cable-woodchopper', 'dumbbell-russian-twist'],
      defaultSets: 3,
      defaultReps: '15 per side',
      defaultRest: '45 sec',
    },
  },
]

// ─── ADD ────────────────────────────────────────────────────────────────────

export const DUMBBELL_ADDITIONS: DumbbellAddition[] = [
  {
    slug: 'dumbbell-swing',
    note: 'Named in the DB-only program\'s Day 2 AMRAP: "10 DB Swings". The catalog has Kettlebell Swing and nothing a dumbbell-only program can use, so there was no row to upload a swing video to.',
    create: {
      name: 'Dumbbell Swing',
      aliases: ['Dumbbell Swings'],
      description:
        'A hip-driven swing holding one dumbbell by the head with both hands, hiked back between the legs and snapped forward to chest height. The dumbbell stand-in for a kettlebell swing.',
      instructions: [
        'Stand with feet a little wider than shoulder width, one dumbbell held vertically by its top head in both hands.',
        'Hinge at the hips and hike the dumbbell back between your legs, above the knees.',
        'Snap the hips forward hard and let that send the dumbbell out to chest height.',
        'Let it fall back into the next hinge and keep the rhythm for the prescribed reps.',
      ],
      cues: [
        'It is a hinge, not a squat, and not a front raise — the arms never lift the weight.',
        'Snap the glutes at the top and stand tall for a split second.',
        'Grip the top head firmly with both hands. A dumbbell is not shaped for this, so lighter than your kettlebell weight.',
      ],
      commonMistakes: [
        'Squatting the weight up and down instead of hinging.',
        'Lifting with the shoulders once the hips run out of drive.',
        'Swinging above chest height with a dumbbell, which is where grip fails.',
      ],
      category: 'power',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['hinge', 'triple_extension'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      primaryMuscles: ['glutes', 'hamstrings'],
      secondaryMuscles: ['erector_spinae', 'front_delts'],
      stabilizers: ['abs', 'grip'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'full_body',
      tags: ['hinge', 'explosive', 'conditioning', 'dumbbell'],
      variations: ['kettlebell-swing'],
      defaultSets: 3,
      defaultReps: '15',
      defaultRest: '45 sec',
    },
  },
  {
    slug: 'dumbbell-hang-clean',
    note: 'Named in the DB-only program\'s Day 3 complex: "5 Dumbbell Hang Cleans". Nothing in the catalog is a clean of any kind, so this had no row and no video.',
    create: {
      name: 'Dumbbell Hang Clean',
      aliases: ['Dumbbell Hang Cleans'],
      description:
        'From a dumbbell in each hand at mid-thigh, an explosive hip extension that pulls the bells up and catches them at the shoulders. The power movement in a dumbbell complex.',
      instructions: [
        'Stand holding a dumbbell in each hand at arm\'s length, just above the knees.',
        'Hinge slightly so the bells sit at mid-thigh, back flat and shoulders over them.',
        'Extend the hips, knees and ankles hard and shrug — the bells travel up close to the body.',
        'Whip the elbows under and catch a dumbbell on each shoulder with the knees slightly bent.',
        'Stand tall, then lower the bells back to mid-thigh for the next rep.',
      ],
      cues: [
        'The jump comes first, the arms second. Pulling early kills the bar speed.',
        'Keep the dumbbells close — a bell that swings out has to be muscled up.',
        'Catch soft: knees bend to receive the weight rather than locking out under it.',
      ],
      commonMistakes: [
        'Reverse-curling the dumbbells up with the arms.',
        'Catching with locked knees, which is how wrists and elbows get jarred.',
        'Rounding the back on the way back down to the start position.',
      ],
      category: 'power',
      mechanics: 'compound',
      role: 'compound',
      movementPatterns: ['hinge', 'triple_extension'],
      laterality: 'bilateral',
      difficulty: 'advanced',
      primaryMuscles: ['glutes', 'hamstrings', 'traps'],
      secondaryMuscles: ['quads', 'front_delts', 'forearms'],
      stabilizers: ['abs', 'erector_spinae'],
      equipment: ['dumbbell'],
      trackingType: 'reps_weight',
      bodyRegion: 'full_body',
      tags: ['explosive', 'power', 'dumbbell', 'full_body'],
      variations: ['dumbbell-snatch', 'dumbbell-push-press'],
      defaultSets: 4,
      defaultReps: '5',
      defaultRest: '2 min',
    },
  },
  {
    slug: 'jumping-lunge',
    note: 'Named in the DB-only program\'s Day 2 AMRAP: "10 Jumping Lunges or Reverse Lunges". Reverse Lunge is in the catalog; the jumping version is not, and it is the first option the coach named.',
    create: {
      name: 'Jumping Lunge',
      aliases: ['Jump Lunge', 'Jumping Lunges', 'Split Jump', 'Alternating Jump Lunge'],
      description:
        'A bodyweight split-stance jump that swaps the legs in the air, landing in a lunge on the other side. The plyometric version of a lunge, programmed here inside an AMRAP.',
      instructions: [
        'Start in a lunge: one foot forward, back knee bent and under your hip.',
        'Push hard through both legs and jump straight up.',
        'Switch your legs in the air and land in a lunge on the other side.',
        'Absorb the landing by letting both knees bend, then go straight into the next jump.',
      ],
      cues: [
        'Land quietly — noise is the landing you did not absorb.',
        'Stay tall through the chest; leaning forward puts it all on the front knee.',
        'Keep the jumps small and controlled once they get sloppy. Sloppy plyos are where knees go.',
      ],
      commonMistakes: [
        'Landing with a locked front leg.',
        'Letting the front knee cave inwards on the landing.',
        'Racing the clock in an AMRAP until the lunge depth disappears.',
      ],
      category: 'plyometric',
      mechanics: 'compound',
      role: 'secondary',
      movementPatterns: ['lunge', 'triple_extension'],
      laterality: 'alternating',
      difficulty: 'intermediate',
      primaryMuscles: ['quads', 'glutes'],
      secondaryMuscles: ['hamstrings', 'calves'],
      stabilizers: ['abs'],
      equipment: ['bodyweight'],
      trackingType: 'reps_only',
      bodyRegion: 'lower_body',
      tags: ['lunge', 'plyometric', 'conditioning', 'bodyweight'],
      variations: ['reverse-lunge', 'split-squat', 'squat-jump'],
      defaultSets: 3,
      defaultReps: '10 per leg',
      defaultRest: '45 sec',
    },
  },
]

// ─── RENAME ─────────────────────────────────────────────────────────────────

export const DUMBBELL_RENAMES: DumbbellRename[] = [
  {
    slug: 'overhead-tricep-extension',
    from: 'Overhead Tricep Extension',
    to: 'Dumbbell Overhead Tricep Extension',
    addAliases: [
      'Dumbbell Overhead Tricep Press',
      'Overhead Tricep Press',
      'Overhead Tricep Extension',
    ],
    note: '"The main thing is that dumbbell overhead tricep press ... needs to appear on admin portal." It already existed and it is already the dumbbell one (equipment `[dumbbell]`) — it was just called Overhead Tricep Extension, so a portal search for Jon\'s wording found nothing. The old name is kept as an alias so everything that resolved by it still does.',
  },
]

// ─── "DB" → "Dumbbell" ──────────────────────────────────────────────────────

/**
 * "We use DB for those exercises and I'd rather switch them all to just say
 * dumbbell." Rewrites the shorthand token in a name or alias, preserving
 * plurality and the rest of the string.
 *
 * Matching is unaffected either way: lib/exerciseAbbreviations.ts already
 * expands `db` → `dumbbell` on both sides of every lookup. This is purely
 * about what the admin portal and the program card SAY.
 */
export function spellOutDumbbell(text: string): string {
  return text.replace(/\bDBs\b/gi, 'Dumbbells').replace(/\bDB\b/gi, 'Dumbbell')
}

/** True if `text` still contains the shorthand. */
export function usesDumbbellShorthand(text: string): boolean {
  return /\bDBs?\b/i.test(text)
}

/**
 * The heading a `__protocol__*` entry shows on the workout card when it carries
 * no `name` of its own — `lib/exerciseAutoCatalog.ts`'s `exerciseNameFromSlug`
 * rule, reimplemented here so this module stays free of the Mongoose model that
 * one imports. `tests/unit/dumbbellCatalog.test.ts` pins the two against each
 * other.
 *
 * It matters because one such slug is `__protocol__db-complex-5-rounds`, which
 * renders as "Db Complex 5 Rounds" — a block of the dumbbell-only program that
 * still reads "DB" with no name anywhere to fix it on.
 */
export function protocolLabelFromSlug(slug: string): string {
  return slug
    .replace(/^__protocol__/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c: string) => c.toUpperCase())
}
