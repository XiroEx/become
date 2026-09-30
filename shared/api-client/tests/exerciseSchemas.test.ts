// Run with: npx tsx --test tests/exerciseSchemas.test.ts
//
// NP-020 — the exercise catalogue domain, re-aligned with the live routes.
//
// These are HAND-WRITTEN fixtures shaped from the beta channel's responses, so
// they agree with the schemas by construction and prove only that the shapes
// are internally coherent: that a swap candidate's `trackingType`, `laterality`
// and `movementPatterns` are TYPED rather than passthrough extras, that the
// hydrate answer is index-aligned, and that the demo-video list's two different
// envelopes are both describable. What the routes ACTUALLY send is checked by
// webapp/tests/unit/contract/np020Exercises.test.ts, which calls the real
// handlers against a real database. Both exist on purpose; neither replaces the
// other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AlternativeCandidateSchema,
  CustomExerciseDeleteResponseSchema,
  CustomExerciseResponseSchema,
  CustomExerciseSubmitResponseSchema,
  CustomExerciseWriteRequestSchema,
  CustomExercisesResponseSchema,
  EXERCISE_BODY_REGIONS,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_HYDRATE_MAX,
  EXERCISE_LATERALITIES,
  EXERCISE_REVIEW_STATUSES,
  EXERCISE_VIDEO_STATUSES,
  ExerciseAlternativesQuerySchema,
  ExerciseAlternativesResponseSchema,
  ExerciseHydrateRequestSchema,
  ExerciseHydrateResponseSchema,
  ExerciseSearchResponseSchema,
  ExerciseVariationsResponseSchema,
  ExerciseVideoResponseSchema,
  ExerciseVideosResponseSchema,
  MOVEMENT_PATTERNS,
  TRACKING_TYPES,
  type ExerciseBodyRegion,
  type ExerciseDifficulty,
  type ExerciseLaterality,
  type MovementPattern,
} from '../src/index';

// ---------------------------------------------------------------------------
// GET /api/exercises/alternatives?slug=barbell-back-squat, as beta answers it.
//
// Field for field from webapp/lib/exerciseAlternatives.ts#findAlternatives (the
// rows) and the `source` projection in
// webapp/app/api/exercises/alternatives/route.ts. The second candidate is one
// of the caller's own custom exercises, which is how `isCustom` and a row-local
// `videoUrl` reach the picker.
// ---------------------------------------------------------------------------

const BETA_ALTERNATIVES = {
  source: {
    slug: 'barbell-back-squat',
    name: 'Barbell Back Squat',
    primaryMuscles: ['quads', 'glutes'],
    movementPatterns: ['squat'],
    equipment: ['barbell', 'squat_rack'],
    bodyRegion: 'lower_body',
    role: 'compound',
    category: 'strength',
  },
  alternatives: [
    {
      slug: 'goblet-squat',
      name: 'Goblet Squat',
      score: 78,
      reasons: ['Same movement pattern: squat', 'Trains quads, glutes'],
      equipment: ['kettlebell'],
      primaryMuscles: ['quads', 'glutes'],
      movementPatterns: ['squat'],
      difficulty: 'beginner',
      category: 'strength',
      bodyRegion: 'lower_body',
      role: 'secondary',
      trackingType: 'reps_weight',
      laterality: 'bilateral',
      isExplicitAlternative: true,
      isCustom: false,
      videoUrl: null,
    },
    {
      slug: 'custom-7f3a91-bulgarian-box-squat-1781500000000',
      name: 'Bulgarian Box Squat',
      score: 61,
      reasons: ['Same body region: lower body'],
      equipment: ['dumbbell', 'box'],
      primaryMuscles: ['quads'],
      movementPatterns: ['lunge', 'squat'],
      difficulty: 'intermediate',
      category: 'strength',
      bodyRegion: 'lower_body',
      role: 'accessory',
      trackingType: 'reps_weight',
      // The reason this ticket exists: a unilateral replacement is logged per
      // side, and the schema used to drop the field that says so.
      laterality: 'unilateral',
      isExplicitAlternative: false,
      isCustom: true,
      videoUrl: 'https://cdn.become.test/custom/bulgarian-box-squat.mp4',
    },
  ],
  total: 2,
};

test('the beta alternatives fixture parses with trackingType, laterality and movementPatterns TYPED', () => {
  const parsed = ExerciseAlternativesResponseSchema.parse(BETA_ALTERNATIVES);

  assert.equal(parsed.alternatives.length, 2);
  const [goblet, custom] = parsed.alternatives;
  assert.ok(goblet && custom);

  // Typed, not passthrough: these are annotated from the inferred types, so a
  // field the schema stops declaring fails to COMPILE here rather than reading
  // as `undefined` on a device.
  const trackingType: string | undefined = goblet.trackingType;
  const laterality: ExerciseLaterality | undefined = goblet.laterality;
  const patterns: MovementPattern[] | undefined = goblet.movementPatterns;
  const difficulty: ExerciseDifficulty | undefined = goblet.difficulty;
  const bodyRegion: ExerciseBodyRegion | undefined = goblet.bodyRegion;

  assert.equal(trackingType, 'reps_weight');
  assert.equal(laterality, 'bilateral');
  assert.deepEqual(patterns, ['squat']);
  assert.equal(difficulty, 'beginner');
  assert.equal(bodyRegion, 'lower_body');
  assert.ok(TRACKING_TYPES.includes('reps_weight'));

  // The unilateral custom row: laterality is what decides per-side logging,
  // and `videoUrl`/`isCustom` ride with the row because a custom exercise's
  // demo lives on its own document.
  assert.equal(custom.laterality, 'unilateral');
  assert.deepEqual(custom.movementPatterns, ['lunge', 'squat']);
  assert.equal(custom.isCustom, true);
  assert.equal(custom.videoUrl, 'https://cdn.become.test/custom/bulgarian-box-squat.mp4');
  assert.equal(custom.isExplicitAlternative, false);

  // `source` is the richer echo, not the old `{ slug, name }`.
  assert.deepEqual(parsed.source?.primaryMuscles, ['quads', 'glutes']);
  assert.deepEqual(parsed.source?.movementPatterns, ['squat']);
  assert.equal(parsed.source?.bodyRegion, 'lower_body');
  assert.equal(parsed.total, 2);
});

test('an unknown laterality or movement pattern degrades instead of dropping the picker', () => {
  // A shipped store build outlives the catalogue it was written against. A
  // value it has never heard of must not take the whole swap list down with it.
  const parsed = ExerciseAlternativesResponseSchema.parse({
    alternatives: [
      {
        slug: 'zercher-good-morning',
        name: 'Zercher Good Morning',
        laterality: 'contralateral-and-new',
        movementPatterns: ['hinge', 'some_future_pattern'],
        difficulty: 'olympian',
      },
    ],
  });
  const row = parsed.alternatives[0];
  assert.ok(row);
  assert.equal(row.laterality, 'n/a');
  assert.deepEqual(row.movementPatterns, ['hinge', 'n/a']);
  assert.equal(row.difficulty, 'intermediate');
});

test('only slug and name are required of a picker row', () => {
  // The picker MERGES the scored shortlist with rows it builds itself from
  // search and from the member's own customs, and those carry less.
  assert.equal(
    AlternativeCandidateSchema.safeParse({ slug: 'dips', name: 'Dips' }).success,
    true,
  );
  assert.equal(AlternativeCandidateSchema.safeParse({ name: 'No slug' }).success, false);
  // `alternatives` defaults, so an empty answer needs no special case.
  assert.deepEqual(ExerciseAlternativesResponseSchema.parse({}).alternatives, []);
});

test('the alternatives query sends comma-separated lists, not repeated params', () => {
  const query = ExerciseAlternativesQuerySchema.parse({
    slug: 'barbell-back-squat',
    equipment: 'dumbbell,kettlebell',
    workoutSlugs: 'barbell-bench-press,pull-up',
    programRole: 'compound',
    workoutFocus: 'lower_body',
    limit: 30,
  });
  assert.equal(query.equipment, 'dumbbell,kettlebell');
  // The route clamps at 50; asking for more is a client bug, caught here.
  assert.equal(
    ExerciseAlternativesQuerySchema.safeParse({ slug: 'x', limit: 80 }).success,
    false,
  );
  assert.equal(ExerciseAlternativesQuerySchema.safeParse({}).success, false);
});

// ---------------------------------------------------------------------------
// GET /api/exercises/search?q=rdl&limit=8
// A projected `.lean()` read, so `_id` is on the wire (rule 2).
// ---------------------------------------------------------------------------

const BETA_SEARCH = {
  exercises: [
    {
      _id: '68f1c2a9b4d3e10012ab34cd',
      slug: 'romanian-deadlift',
      name: 'Romanian Deadlift',
      aliases: ['RDL', 'Stiff Leg Deadlift'],
      trackingType: 'reps_weight',
      equipment: ['barbell'],
      laterality: 'bilateral',
      movementPatterns: ['hinge'],
      primaryMuscles: ['hamstrings', 'glutes'],
      secondaryMuscles: ['lower_back', 'grip'],
      category: 'strength',
      bodyRegion: 'lower_body',
      role: 'compound',
      difficulty: 'intermediate',
      videoUrl: 'https://cdn.become.test/catalog/romanian-deadlift.mp4',
      isCustom: false,
    },
  ],
};

test('the beta search fixture parses, _id and all', () => {
  const parsed = ExerciseSearchResponseSchema.parse(BETA_SEARCH);
  const hit = parsed.exercises[0];
  assert.ok(hit);
  assert.equal(hit._id, '68f1c2a9b4d3e10012ab34cd');
  assert.deepEqual(hit.aliases, ['RDL', 'Stiff Leg Deadlift']);
  assert.equal(hit.trackingType, 'reps_weight');
  assert.equal(hit.laterality, 'bilateral');
  assert.deepEqual(hit.movementPatterns, ['hinge']);
  assert.deepEqual(hit.secondaryMuscles, ['lower_back', 'grip']);
  assert.equal(hit.isCustom, false);

  // A query under two characters — and the route's own internal failures —
  // answer 200 with an empty list, so this is a normal parse, not an error.
  assert.deepEqual(ExerciseSearchResponseSchema.parse({ exercises: [] }).exercises, []);
});

// ---------------------------------------------------------------------------
// GET /api/exercises/variations?slug=dumbbell-bench-press
// Hand-built rows: a closed field set, no `_id`, source exercise FIRST.
// ---------------------------------------------------------------------------

const BETA_VARIATIONS = {
  variations: [
    {
      slug: 'dumbbell-bench-press',
      name: 'Dumbbell Bench Press',
      equipment: ['dumbbell', 'flat_bench'],
      laterality: 'bilateral',
      difficulty: 'beginner',
      trackingType: 'reps_weight',
      category: 'strength',
      movementPatterns: ['horizontal_push'],
    },
    {
      slug: 'barbell-bench-press',
      name: 'Barbell Bench Press',
      equipment: ['barbell', 'flat_bench'],
      laterality: 'bilateral',
      difficulty: 'intermediate',
      trackingType: 'reps_weight',
      category: 'strength',
      movementPatterns: ['horizontal_push'],
    },
    {
      slug: 'single-arm-dumbbell-floor-press',
      name: 'Single-Arm Dumbbell Floor Press',
      equipment: ['dumbbell'],
      laterality: 'unilateral',
      difficulty: 'intermediate',
      trackingType: 'reps_weight',
      category: 'strength',
      movementPatterns: ['horizontal_push'],
    },
  ],
  sourceSlug: 'dumbbell-bench-press',
};

test('the beta variations fixture parses and the source exercise is the first row', () => {
  const parsed = ExerciseVariationsResponseSchema.parse(BETA_VARIATIONS);
  assert.equal(parsed.sourceSlug, 'dumbbell-bench-press');
  assert.equal(parsed.variations[0]?.slug, parsed.sourceSlug);
  // The whole point of the list: switching a variation in needs the category
  // (written onto the live exercise's `type`) and the pattern + equipment pair
  // the weight convention is derived from.
  assert.equal(parsed.variations[0]?.category, 'strength');
  assert.deepEqual(parsed.variations[0]?.movementPatterns, ['horizontal_push']);
  assert.equal(parsed.variations[2]?.laterality, 'unilateral');

  // Every row carries a tracking type — it is required, not optional, because
  // the route builds these by hand off a required catalogue field.
  assert.equal(
    ExerciseVariationsResponseSchema.safeParse({
      variations: [{ slug: 'x', name: 'X', laterality: 'bilateral', difficulty: 'beginner', category: 'strength' }],
      sourceSlug: 'x',
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// /api/exercises/custom — GET, POST, PATCH, DELETE, submit.
// ---------------------------------------------------------------------------

const BETA_CUSTOM_EXERCISE = {
  _id: '68f1c2a9b4d3e10012ab3500',
  slug: 'custom-7f3a91-sandbag-shoulder-carry-1781500000000',
  name: 'Sandbag Shoulder Carry',
  trackingType: 'time_distance',
  primaryMuscles: ['abs', 'traps'],
  secondaryMuscles: ['glutes'],
  stabilizers: ['obliques'],
  mechanics: 'compound',
  movementPatterns: ['carry'],
  laterality: 'unilateral',
  bodyRegion: 'full_body',
  category: 'conditioning',
  defaultSets: 3,
  defaultReps: '40 m',
  equipment: ['backpack'],
  role: 'accessory',
  difficulty: 'intermediate',
  tags: ['conditioning', 'carry', 'abs'],
  videoUrl: null,
  thumbnailUrl: null,
  videoWidth: null,
  videoHeight: null,
  createdAt: '2026-09-12T08:31:04.221Z',
  isUniversal: false,
  reviewStatus: 'none',
  submittedAt: null,
  reviewNote: null,
};

test('the beta custom-exercise list parses with its media and review fields typed', () => {
  const parsed = CustomExercisesResponseSchema.parse({
    exercises: [BETA_CUSTOM_EXERCISE],
  });
  const exercise = parsed.exercises[0];
  assert.ok(exercise);
  assert.equal(exercise.trackingType, 'time_distance');
  assert.equal(exercise.laterality, 'unilateral');
  assert.deepEqual(exercise.movementPatterns, ['carry']);
  assert.equal(exercise.mechanics, 'compound');
  // Media: null rather than absent, because the model defaults them to null.
  assert.equal(exercise.videoUrl, null);
  assert.equal(exercise.videoWidth, null);
  // Review: `isUniversal` is the visibility gate, `reviewStatus` the position.
  assert.equal(exercise.isUniversal, false);
  assert.equal(exercise.reviewStatus, 'none');
  assert.equal(exercise.submittedAt, null);
  assert.deepEqual(CustomExercisesResponseSchema.parse({}).exercises, []);
});

test('create and edit share one request shape, and only name + trackingType are required', () => {
  const body = {
    name: 'Sandbag Shoulder Carry',
    trackingType: 'time_distance',
    muscleGroup: 'core',
    primaryMuscles: ['abs', 'traps'],
    secondaryMuscles: ['glutes'],
    stabilizers: ['obliques'],
    equipment: ['backpack'],
    movementPatterns: ['carry'],
    laterality: 'unilateral',
    mechanics: 'compound',
    difficulty: 'intermediate',
    category: 'conditioning',
    role: 'accessory',
    defaultSets: '3',
    defaultReps: '40 m',
    tags: ['sandbag'],
  };
  assert.equal(CustomExerciseWriteRequestSchema.safeParse(body).success, true);
  assert.equal(
    CustomExerciseWriteRequestSchema.safeParse({ name: 'Minimal', trackingType: 'reps_only' })
      .success,
    true,
  );
  // An empty name is a 400 on both verbs; so is a missing tracking type.
  assert.equal(
    CustomExerciseWriteRequestSchema.safeParse({ name: '', trackingType: 'reps_only' }).success,
    false,
  );
  assert.equal(CustomExerciseWriteRequestSchema.safeParse({ name: 'No type' }).success, false);
  // `defaultSets` arrives as a string from a form and a number from the app.
  assert.equal(
    CustomExerciseWriteRequestSchema.parse({ ...body, defaultSets: 4 }).defaultSets,
    4,
  );
});

test('the write, delete and submit answers parse', () => {
  const created = CustomExerciseResponseSchema.parse({ exercise: BETA_CUSTOM_EXERCISE });
  assert.equal(created.exercise.slug, BETA_CUSTOM_EXERCISE.slug);

  assert.equal(CustomExerciseDeleteResponseSchema.parse({ ok: true }).ok, true);

  const submitted = CustomExerciseSubmitResponseSchema.parse({
    reviewStatus: 'pending',
    submittedAt: '2026-09-30T11:02:44.008Z',
  });
  assert.equal(submitted.reviewStatus, 'pending');
  // Withdrawing answers with the status ALONE — no submittedAt at all.
  assert.equal(
    CustomExerciseSubmitResponseSchema.parse({ reviewStatus: 'none' }).submittedAt,
    undefined,
  );
});

// ---------------------------------------------------------------------------
// POST /api/exercises/hydrate — rule 3, index alignment.
// ---------------------------------------------------------------------------

test('hydrate is index-aligned and an exercise with no demo is an empty object', () => {
  const request = ExerciseHydrateRequestSchema.parse({
    exercises: [
      { exerciseSlug: 'romanian-deadlift', name: 'Romanian Deadlift' },
      { name: 'Something Off The Stash' },
      { exerciseSlug: 'goblet-squat' },
    ],
  });
  assert.equal(request.exercises.length, 3);

  const parsed = ExerciseHydrateResponseSchema.parse({
    exercises: [
      {
        videoUrl: 'https://cdn.become.test/catalog/romanian-deadlift.mp4',
        thumbnailUrl: 'https://cdn.become.test/catalog/romanian-deadlift.jpg',
        videoWidth: 1080,
        videoHeight: 1920,
        videoFraming: { fit: 'cover', positionX: 50, positionY: 30, zoom: 120 },
        videoTrim: { start: 1.5, end: 6 },
      },
      // Rule 3: no video is `{}` — not a null, and not a dropped element, or
      // the caller's merge-by-index lands the wrong video on the wrong lift.
      {},
      { videoUrl: 'https://cdn.become.test/catalog/goblet-squat.mp4' },
    ],
  });
  assert.equal(parsed.exercises.length, request.exercises.length);
  assert.equal(parsed.exercises[0]?.videoFraming?.fit, 'cover');
  assert.equal(parsed.exercises[0]?.videoTrim?.end, 6);
  assert.deepEqual(parsed.exercises[1], {});
  assert.equal(parsed.exercises[2]?.thumbnailUrl, undefined);

  // The route silently truncates past its cap, so asking for more than 60 is a
  // client bug that must not be discovered by a quietly shortened answer.
  assert.equal(
    ExerciseHydrateRequestSchema.safeParse({
      exercises: Array.from({ length: EXERCISE_HYDRATE_MAX + 1 }, () => ({ name: 'x' })),
    }).success,
    false,
  );
  assert.deepEqual(ExerciseHydrateResponseSchema.parse({}).exercises, []);
});

// ---------------------------------------------------------------------------
// GET /api/exercise-videos — whole documents, and TWO envelopes.
// ---------------------------------------------------------------------------

const BETA_DEMO_VIDEO = {
  _id: '68f1c2a9b4d3e10012ab3600',
  slug: 'romanian-deadlift',
  exerciseName: 'Romanian Deadlift',
  videoUrl: 'https://cdn.become.test/catalog/romanian-deadlift.mp4',
  thumbnailUrl: 'https://cdn.become.test/catalog/romanian-deadlift.jpg',
  isPlaceholder: false,
  storageKey: 'exercise-videos/romanian-deadlift.mp4',
  status: 'active',
  sizeBytes: 2_411_003,
  mimeType: 'video/mp4',
  uploadedBy: '6ab0200000000000000f7ee1',
  videoWidth: 1080,
  videoHeight: 1920,
  framing: { fit: 'contain', positionX: 50, positionY: 50, zoom: 100 },
  trim: { start: 0.5, end: 5.25 },
  createdAt: '2026-06-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  __v: 0,
};

test('the beta demo-video list parses, including status, framing and trim', () => {
  const parsed = ExerciseVideosResponseSchema.parse({ videos: [BETA_DEMO_VIDEO] });
  const video = parsed.videos[0];
  assert.ok(video);
  assert.equal(video.status, 'active');
  assert.equal(video.framing?.fit, 'contain');
  assert.equal(video.trim?.start, 0.5);
  // Rule 2: a whole-document read carries `_id`, `__v` and the timestamps.
  assert.equal(video.__v, 0);
  assert.equal(video.createdAt, '2026-06-01T09:00:00.000Z');
  assert.equal(video.updatedAt, '2026-09-01T09:00:00.000Z');

  // An unmigrated row has no `slug` — the `?name=` lookup exists for those.
  const legacy = ExerciseVideosResponseSchema.parse({
    videos: [{ exerciseName: 'Kettlebell Swing', videoUrl: 'https://cdn.become.test/kb.mp4', slug: null }],
  });
  assert.equal(legacy.videos[0]?.slug, null);
  assert.deepEqual(ExerciseVideosResponseSchema.parse({}).videos, []);
});

test('?name= answers a single video, and a miss is { video: null } — not a 404', () => {
  assert.equal(
    ExerciseVideoResponseSchema.parse({ video: BETA_DEMO_VIDEO }).video?.exerciseName,
    'Romanian Deadlift',
  );
  assert.equal(ExerciseVideoResponseSchema.parse({ video: null }).video, null);
  // `video` is not optional: a body without it is not this route's answer.
  assert.equal(ExerciseVideoResponseSchema.safeParse({}).success, false);
});

test('an unknown video status reads as active rather than dropping the row', () => {
  const parsed = ExerciseVideosResponseSchema.parse({
    videos: [{ exerciseName: 'X', videoUrl: 'https://cdn.become.test/x.mp4', status: 'transcoding' }],
  });
  assert.equal(parsed.videos[0]?.status, 'active');
});

// ---------------------------------------------------------------------------
// The vocabularies, as webapp/models/Exercise.ts and models/ExerciseVideo.ts
// enforce them. A value dropped from one of these lists is a value the native
// app stops being able to name.
// ---------------------------------------------------------------------------

test('the exercise vocabularies match the model enums', () => {
  assert.deepEqual([...EXERCISE_LATERALITIES], [
    'bilateral',
    'unilateral',
    'alternating',
    'n/a',
  ]);
  assert.deepEqual([...EXERCISE_DIFFICULTIES], [
    'beginner',
    'intermediate',
    'advanced',
    'expert',
  ]);
  assert.deepEqual([...EXERCISE_BODY_REGIONS], [
    'upper_body',
    'lower_body',
    'core',
    'full_body',
  ]);
  assert.deepEqual([...EXERCISE_REVIEW_STATUSES], [
    'none',
    'pending',
    'approved',
    'rejected',
  ]);
  assert.deepEqual([...EXERCISE_VIDEO_STATUSES], [
    'pending',
    'active',
    'failed',
    'retired',
  ]);
  assert.equal(EXERCISE_CATEGORIES.length, 13);
  // The ten fundamental patterns, their core-stability and accessory
  // sub-patterns, the two explosive/locomotion ones and the placeholder.
  assert.equal(MOVEMENT_PATTERNS.length, 25);
  assert.ok(MOVEMENT_PATTERNS.includes('n/a'));
});
