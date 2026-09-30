import { z } from 'zod';
import {
  ExerciseRoleSchema,
  ExerciseVideoFramingSchema,
  ExerciseVideoTrimSchema,
} from './programs';

// ===========================================================================
// EXERCISES — the wire contract for the exercise catalogue surface (NP-020).
//
// Re-aligned against the LIVE routes. What was here before was a single
// `AlternativeCandidateSchema` carrying six fields (slug, name, score, reasons,
// equipment, category) for ONE of eight routes; every other field the swap
// picker needs — `trackingType`, `laterality`, `movementPatterns` — rode
// through `.passthrough()` untyped, and search, variations, the custom-exercise
// CRUD, the quick-session hydrate call and the demo-video list had no schema at
// all.
//
// The routes covered here, each named on the schema that mirrors it:
//
//   GET    /api/exercises/alternatives          swap suggestions (scored)
//   GET    /api/exercises/search                name/alias/muscle search
//   GET    /api/exercises/variations            the same movement, other kit
//   GET    /api/exercises/custom                the caller's own exercises
//   POST   /api/exercises/custom                create one (quota-gated)
//   DELETE /api/exercises/custom?slug=…         delete one (+ its blob)
//   PATCH  /api/exercises/custom/[slug]         edit one
//   POST   /api/exercises/custom/[slug]/submit  ask admins to publish it
//   DELETE /api/exercises/custom/[slug]/submit  withdraw that request
//   POST   /api/exercises/hydrate               video fields for N slugs
//   GET    /api/exercise-videos                 the name-keyed demo list
//
// Three rules travel with this domain and are asserted by
// webapp/tests/unit/contract/np020Exercises.test.ts:
//
//   1. A SWAP CANDIDATE MUST CARRY ITS OWN LOGGING METADATA. Replacing an
//      exercise mid-session re-derives the per-set inputs from `trackingType`,
//      the per-side split from `laterality` and the weight convention from
//      `movementPatterns` + `equipment`. A picker row without them cannot log
//      the replacement, which is why those four are typed here rather than
//      left to `.passthrough()`.
//   2. A MONGO READ CARRIES `_id`. Every route that answers with `.lean()`
//      documents (search, custom, exercise-videos) sends `_id` — an inclusion
//      projection does not remove it — so `_id` is DECLARED. `/api/exercise-videos`
//      answers with whole documents and therefore sends `__v`, `createdAt` and
//      `updatedAt` too. Leaving them undeclared is what makes the contract
//      harness fail on a body it should accept.
//   3. `/api/exercises/hydrate` IS INDEX-ALIGNED. It answers with exactly one
//      entry per requested exercise, in the order asked, and an exercise with
//      no video at all is `{}` — not a null, and not a dropped element. The
//      caller merges BY INDEX (webapp/lib/quickSession/hydrateVideos.ts).
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a rename from sliding through that tolerance.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary — the closed enums webapp/models/Exercise.ts enforces.
//
// These are the values a catalogue document can hold, so a response can only
// carry one of them. They are typed as enums (not bare strings) because the
// native picker BRANCHES on them; each use site is `.catch()`-guarded so a
// catalogue that grows a value cannot make a shipped build drop the whole
// response. `trackingType` is the deliberate exception — see below.
// ---------------------------------------------------------------------------

/** `laterality` — how the two sides are loaded. Drives the per-side inputs. */
export const ExerciseLateralitySchema = z.enum([
  'bilateral',
  'unilateral',
  'alternating',
  'n/a',
]);

export const EXERCISE_LATERALITIES = ExerciseLateralitySchema.options;

/** `difficulty` — the four levels, in order. */
export const ExerciseDifficultySchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);

export const EXERCISE_DIFFICULTIES = ExerciseDifficultySchema.options;

/** `bodyRegion` — what the swap/variation filters group by. */
export const ExerciseBodyRegionSchema = z.enum([
  'upper_body',
  'lower_body',
  'core',
  'full_body',
]);

export const EXERCISE_BODY_REGIONS = ExerciseBodyRegionSchema.options;

/** `category` — the kind of activity. Hydrated onto a program as `type`. */
export const ExerciseCategorySchema = z.enum([
  'strength',
  'power',
  'cardio',
  'plyometric',
  'calisthenics',
  'olympic',
  'strongman',
  'flexibility',
  'mobility',
  'warmup',
  'cooldown',
  'conditioning',
  'protocol',
]);

export const EXERCISE_CATEGORIES = ExerciseCategorySchema.options;

/** `mechanics` — joint count, anatomical fact. */
export const ExerciseMechanicsSchema = z.enum([
  'compound',
  'isolation',
  'n/a',
]);

export const EXERCISE_MECHANICS = ExerciseMechanicsSchema.options;

/**
 * `movementPatterns` — the ten fundamental patterns, their core-stability and
 * accessory sub-patterns, and the `'n/a'` placeholder. An exercise can hold
 * several (a trap-bar deadlift is hinge + squat).
 */
export const MovementPatternSchema = z.enum([
  'squat',
  'hinge',
  'lunge',
  'horizontal_push',
  'horizontal_pull',
  'vertical_push',
  'vertical_pull',
  'carry',
  'rotation',
  'anti_rotation',
  'anti_extension',
  'anti_lateral_flexion',
  'knee_extension',
  'knee_flexion',
  'hip_extension',
  'horizontal_adduction',
  'shoulder_abduction',
  'shoulder_flexion',
  'elbow_flexion',
  'elbow_extension',
  'ankle_flexion',
  'scapular_retraction',
  'triple_extension',
  'gait',
  'n/a',
]);

export const MOVEMENT_PATTERNS = MovementPatternSchema.options;

/** Where a custom exercise's "Submit to Universal" request sits. */
export const ExerciseReviewStatusSchema = z.enum([
  'none',
  'pending',
  'approved',
  'rejected',
]);

export const EXERCISE_REVIEW_STATUSES = ExerciseReviewStatusSchema.options;

/**
 * `exercise_videos.status`. `retired` means an admin took the video off the
 * exercise, and is NOT the same as `pending` (never had one) — the name-keyed
 * fallback skips retired rows.
 */
export const ExerciseVideoStatusSchema = z.enum([
  'pending',
  'active',
  'failed',
  'retired',
]);

export const EXERCISE_VIDEO_STATUSES = ExerciseVideoStatusSchema.options;

export type ExerciseLaterality = z.infer<typeof ExerciseLateralitySchema>;
export type ExerciseDifficulty = z.infer<typeof ExerciseDifficultySchema>;
export type ExerciseBodyRegion = z.infer<typeof ExerciseBodyRegionSchema>;
export type ExerciseCategory = z.infer<typeof ExerciseCategorySchema>;
export type ExerciseMechanics = z.infer<typeof ExerciseMechanicsSchema>;
export type MovementPattern = z.infer<typeof MovementPatternSchema>;
export type ExerciseReviewStatus = z.infer<typeof ExerciseReviewStatusSchema>;
export type ExerciseVideoStatus = z.infer<typeof ExerciseVideoStatusSchema>;

/**
 * The fields every catalogue row in this file shares, so search, variations,
 * customs and swap candidates can never drift into describing the same
 * document differently.
 *
 * `trackingType` is a plain STRING on purpose (the same call the hydrated
 * `ProgramExerciseSchema` makes): expo/lib/live/trackingInputs.ts resolves it
 * by substring precisely so a catalogue that grows a tracking type cannot make
 * a shipped build drop the whole workout. `TRACKING_TYPES` (./programs) is the
 * list to narrow against.
 *
 * `equipment` and the muscle arrays are strings for the same reason with a
 * bigger list: ~60 equipment ids and ~40 muscle groups, both of which grow
 * whenever the catalogue does, and nothing branches on an unrecognised one — it
 * is rendered as a label.
 */
const catalogueFields = {
  /** Rule 1: the live screen picks its per-set inputs off this. */
  trackingType: z.string().optional(),
  /** Rule 1: bilateral vs unilateral decides whether sides are logged apart. */
  laterality: ExerciseLateralitySchema.catch('n/a').optional(),
  /** Rule 1: with `equipment`, this is the per-implement weight convention. */
  movementPatterns: z.array(MovementPatternSchema.catch('n/a')).optional(),
  /** Rule 1: equipment ids (`barbell`, `leg_press`), not display labels. */
  equipment: z.array(z.string()).optional(),
  primaryMuscles: z.array(z.string()).optional(),
  difficulty: ExerciseDifficultySchema.catch('intermediate').optional(),
  category: ExerciseCategorySchema.catch('strength').optional(),
  bodyRegion: ExerciseBodyRegionSchema.catch('full_body').optional(),
  role: ExerciseRoleSchema.catch('accessory').optional(),
} as const;

// ---------------------------------------------------------------------------
// GET /api/exercises/alternatives?slug=… — the swap picker's shortlist.
// Mirrors webapp/app/api/exercises/alternatives/route.ts and the
// `AlternativeCandidate` rows webapp/lib/exerciseAlternatives.ts scores.
// ---------------------------------------------------------------------------

/**
 * One scored replacement.
 *
 * Only `slug` and `name` are required: the picker MERGES this list with rows it
 * builds itself from GET /api/exercises/search and GET /api/exercises/custom
 * (webapp/components/ExerciseSwapModal.tsx does exactly that), and those rows
 * legitimately carry less. What the route itself sends is pinned by
 * webapp/tests/unit/contract/np020Exercises.test.ts, not by making fields
 * required here and breaking every caller that builds a row by hand.
 */
export const AlternativeCandidateSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    /** 0–100, normalised against the maximum the scorer can award. */
    score: z.number().optional(),
    /** Human reasons ("Same movement pattern"), already ordered. */
    reasons: z.array(z.string()).optional(),
    ...catalogueFields,
    /** True when the catalogue already links the two exercises. Sorts first. */
    isExplicitAlternative: z.boolean().optional(),
    /** True for the caller's own exercise — drives the badge and the video. */
    isCustom: z.boolean().optional(),
    /**
     * A custom exercise keeps its demo on its own document rather than in
     * `exercise_videos`, so the URL has to travel with the row. `null` for a
     * catalogue exercise whose video has not been uploaded.
     */
    videoUrl: z.string().nullable().optional(),
  })
  .passthrough();

/**
 * `source` — the exercise being replaced, as the route echoes it back. Richer
 * than the `{ slug, name }` this schema used to allow: the picker renders the
 * source's muscles and pattern beside the candidates it is comparing.
 */
export const ExerciseAlternativeSourceSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    primaryMuscles: z.array(z.string()).optional(),
    movementPatterns: z.array(MovementPatternSchema.catch('n/a')).optional(),
    equipment: z.array(z.string()).optional(),
    bodyRegion: ExerciseBodyRegionSchema.catch('full_body').optional(),
    role: ExerciseRoleSchema.catch('accessory').optional(),
    category: ExerciseCategorySchema.catch('strength').optional(),
  })
  .passthrough();

export const ExerciseAlternativesResponseSchema = z
  .object({
    source: ExerciseAlternativeSourceSchema.optional(),
    alternatives: z.array(AlternativeCandidateSchema).default([]),
    total: z.number().optional(),
  })
  .passthrough();

/**
 * The query the route reads. `equipment` and `workoutSlugs` are
 * COMMA-SEPARATED strings, not repeated params — the handler splits on ','.
 * `limit` is clamped to 50 server-side.
 */
export const ExerciseAlternativesQuerySchema = z.object({
  slug: z.string(),
  /** Equipment ids the member has, comma separated. Empty = no filter. */
  equipment: z.string().optional(),
  /** Slugs already in this session, comma separated. Heavily penalised. */
  workoutSlugs: z.string().optional(),
  /** The role the exercise plays HERE, overriding the catalogue default. */
  programRole: ExerciseRoleSchema.optional(),
  workoutFocus: ExerciseBodyRegionSchema.optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export type AlternativeCandidate = z.infer<typeof AlternativeCandidateSchema>;
export type ExerciseAlternativeSource = z.infer<
  typeof ExerciseAlternativeSourceSchema
>;
export type ExerciseAlternativesResponse = z.infer<
  typeof ExerciseAlternativesResponseSchema
>;
export type ExerciseAlternativesQuery = z.infer<
  typeof ExerciseAlternativesQuerySchema
>;

// ---------------------------------------------------------------------------
// GET /api/exercises/search?q=…&limit=… — the catalogue search every
// "add exercise" and "swap exercise" flow reads.
// Mirrors webapp/app/api/exercises/search/route.ts.
// ---------------------------------------------------------------------------

/**
 * One search hit. The route projects exactly these fields, so `_id` rides
 * along (rule 2) and the classification half is complete enough for the swap
 * modal to build a picker row from it with no second round-trip.
 */
export const ExerciseSearchResultSchema = z
  .object({
    /** Rule 2: a projected `.lean()` read still carries `_id`. */
    _id: z.string().optional(),
    slug: z.string(),
    name: z.string(),
    /** Alternate names the query matched on ("RDL", "romanian deadlift"). */
    aliases: z.array(z.string()).optional(),
    ...catalogueFields,
    secondaryMuscles: z.array(z.string()).optional(),
    videoUrl: z.string().nullable().optional(),
    isCustom: z.boolean().optional(),
  })
  .passthrough();

/**
 * `{ exercises: [...] }`, ranked by webapp/lib/exerciseSearchRanking.ts.
 *
 * The route answers 200 with an EMPTY list for a query under two characters
 * and for its own internal errors — a bad `$regex` must read as "no matches"
 * rather than taking the caller's add/swap flow down with a 500. So an empty
 * array never means "the search failed".
 */
export const ExerciseSearchResponseSchema = z
  .object({
    exercises: z.array(ExerciseSearchResultSchema).default([]),
  })
  .passthrough();

/** `q` under 2 characters answers `{ exercises: [] }`; `limit` clamps to 20. */
export const ExerciseSearchQuerySchema = z.object({
  q: z.string(),
  limit: z.number().int().min(1).max(20).optional(),
});

export type ExerciseSearchResult = z.infer<typeof ExerciseSearchResultSchema>;
export type ExerciseSearchResponse = z.infer<
  typeof ExerciseSearchResponseSchema
>;
export type ExerciseSearchQuery = z.infer<typeof ExerciseSearchQuerySchema>;

// ---------------------------------------------------------------------------
// GET /api/exercises/variations?slug=… — the same movement, other equipment.
// Mirrors webapp/app/api/exercises/variations/route.ts.
// ---------------------------------------------------------------------------

/**
 * One variation. The route builds these BY HAND (it does not answer with the
 * raw documents), so the field set is closed and there is no `_id`: slug, name,
 * equipment, laterality, difficulty, trackingType, category and
 * movementPatterns, every one of them needed to switch a variation in as the
 * live exercise.
 */
export const ExerciseVariationSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    equipment: z.array(z.string()).default([]),
    laterality: ExerciseLateralitySchema.catch('n/a'),
    difficulty: ExerciseDifficultySchema.catch('intermediate'),
    /** Rule 1. */
    trackingType: z.string(),
    /** Written onto the live exercise's `type` when the variation is swapped in. */
    category: ExerciseCategorySchema.catch('strength'),
    movementPatterns: z.array(MovementPatternSchema.catch('n/a')).default([]),
  })
  .passthrough();

/**
 * `{ variations, sourceSlug }`. The SOURCE EXERCISE IS THE FIRST ENTRY of
 * `variations` — the list is "this movement's family", not "other options" —
 * and `sourceSlug` names it so a caller can tell which row it is standing on.
 */
export const ExerciseVariationsResponseSchema = z
  .object({
    variations: z.array(ExerciseVariationSchema).default([]),
    sourceSlug: z.string(),
  })
  .passthrough();

export const ExerciseVariationsQuerySchema = z.object({
  slug: z.string(),
});

export type ExerciseVariation = z.infer<typeof ExerciseVariationSchema>;
export type ExerciseVariationsResponse = z.infer<
  typeof ExerciseVariationsResponseSchema
>;
export type ExerciseVariationsQuery = z.infer<
  typeof ExerciseVariationsQuerySchema
>;

// ---------------------------------------------------------------------------
// /api/exercises/custom — the member's own exercises.
// Mirrors webapp/app/api/exercises/custom/route.ts (GET, POST, DELETE) and
// webapp/app/api/exercises/custom/[slug]/route.ts (PATCH).
//
// CREATE is QUOTA-gated (free tier: three owned custom exercises); every other
// verb is FEATURE-gated, so a member sitting at 3/3 can still fix, re-record
// and delete what they already have. A refusal is the ordinary entitlement
// envelope — see ./entitlements and `classifyApiResponse` in ../errors.
// ---------------------------------------------------------------------------

/**
 * A custom exercise as GET /api/exercises/custom lists it: the projected
 * document, so `_id` (rule 2) and the media + review fields ride along. The
 * media fields are what make a custom exercise's own demo render everywhere a
 * catalogue one does.
 */
export const CustomExerciseSchema = z
  .object({
    /** Rule 2. */
    _id: z.string().optional(),
    slug: z.string(),
    name: z.string(),
    ...catalogueFields,
    secondaryMuscles: z.array(z.string()).optional(),
    stabilizers: z.array(z.string()).optional(),
    mechanics: ExerciseMechanicsSchema.catch('n/a').optional(),
    /** Prescription defaults; absent unless the member set them. */
    defaultSets: z.number().optional(),
    /** Free text: "5", "8-12", "AMRAP". */
    defaultReps: z.string().optional(),
    defaultDuration: z.string().optional(),
    /** Search keywords, rebuilt from the classification on every edit. */
    tags: z.array(z.string()).optional(),
    videoUrl: z.string().nullable().optional(),
    thumbnailUrl: z.string().nullable().optional(),
    videoWidth: z.number().nullable().optional(),
    videoHeight: z.number().nullable().optional(),
    videoFraming: ExerciseVideoFramingSchema.nullable().optional(),
    videoTrim: ExerciseVideoTrimSchema.nullable().optional(),
    /** An instant, not a day marker. */
    createdAt: z.string().optional(),
    /**
     * The actual visibility gate: true only once an admin approved it.
     * `reviewStatus` merely tracks where the request sits, and editing an
     * approved exercise resets BOTH back to private.
     */
    isUniversal: z.boolean().optional(),
    reviewStatus: ExerciseReviewStatusSchema.catch('none').optional(),
    submittedAt: z.string().nullable().optional(),
    /** The admin's reason, or the auto-flag note on a likely duplicate. */
    reviewNote: z.string().nullable().optional(),
  })
  .passthrough();

export const CustomExercisesResponseSchema = z
  .object({
    exercises: z.array(CustomExerciseSchema).default([]),
  })
  .passthrough();

/**
 * POST /api/exercises/custom and PATCH /api/exercises/custom/[slug] take the
 * SAME body — the handlers share lib/customExerciseFields so create and edit
 * can never drift into accepting different shapes.
 *
 * `name` and `trackingType` are the only required fields: everything else is
 * resolved server-side (an unknown value falls back to the catalogue default,
 * it is not a 400). `muscleGroup` is the coarse picker the form offers;
 * `primaryMuscles` is the exact list, and wins when both are sent.
 */
export const CustomExerciseWriteRequestSchema = z.object({
  name: z.string().min(1),
  /** One of TRACKING_TYPES (./programs). An invalid value is a 400. */
  trackingType: z.string(),
  /** The coarse "chest"/"back" picker; expanded server-side. */
  muscleGroup: z.string().optional(),
  /** The exact muscle list. Overrides `muscleGroup` when present. */
  primaryMuscles: z.array(z.string()).optional(),
  secondaryMuscles: z.array(z.string()).optional(),
  stabilizers: z.array(z.string()).optional(),
  equipment: z.array(z.string()).optional(),
  movementPatterns: z.array(z.string()).optional(),
  laterality: z.string().optional(),
  mechanics: z.string().optional(),
  difficulty: z.string().optional(),
  category: z.string().optional(),
  role: z.string().optional(),
  /**
   * Accepted as a string or a number — the handlers run them through
   * `parseInt`/`String`, and a falsy value clears the default rather than
   * storing 0.
   */
  defaultSets: z.union([z.number(), z.string()]).optional(),
  defaultReps: z.union([z.number(), z.string()]).optional(),
  /** Extra keywords folded into `tags`. POST only; PATCH rebuilds tags. */
  tags: z.array(z.string()).optional(),
});

/** Create and edit both answer `{ exercise }` with the same field set. */
export const CustomExerciseResponseSchema = z
  .object({
    exercise: CustomExerciseSchema,
  })
  .passthrough();

/** DELETE /api/exercises/custom?slug=… — `{ ok: true }`, and the blob is reaped. */
export const CustomExerciseDeleteResponseSchema = z
  .object({
    ok: z.boolean(),
  })
  .passthrough();

/**
 * POST /api/exercises/custom/[slug]/submit — ask admins to publish it.
 * Answers with the two fields it changed, NOT the whole exercise. Submitting
 * grants no visibility on its own: `isUniversal` flips only on approval.
 * Already pending, or already approved, is a 409.
 */
export const CustomExerciseSubmitResponseSchema = z
  .object({
    reviewStatus: ExerciseReviewStatusSchema.catch('none'),
    /** An instant. Present on submit; `null` again after a withdrawal. */
    submittedAt: z.string().nullable().optional(),
  })
  .passthrough();

export type CustomExercise = z.infer<typeof CustomExerciseSchema>;
export type CustomExercisesResponse = z.infer<
  typeof CustomExercisesResponseSchema
>;
export type CustomExerciseWriteRequest = z.infer<
  typeof CustomExerciseWriteRequestSchema
>;
export type CustomExerciseResponse = z.infer<
  typeof CustomExerciseResponseSchema
>;
export type CustomExerciseDeleteResponse = z.infer<
  typeof CustomExerciseDeleteResponseSchema
>;
export type CustomExerciseSubmitResponse = z.infer<
  typeof CustomExerciseSubmitResponseSchema
>;

// ---------------------------------------------------------------------------
// POST /api/exercises/hydrate — video fields for a quick session's slugs.
// Mirrors webapp/app/api/exercises/hydrate/route.ts + the caller,
// webapp/lib/quickSession/hydrateVideos.ts.
//
// A program is hydrated server-side before the client ever sees it; a
// quick/custom session has no program to hydrate through, so it asks for the
// same slug → video mapping once per session load.
// ---------------------------------------------------------------------------

/** At most 60 per call — the route SILENTLY TRUNCATES the rest. */
export const EXERCISE_HYDRATE_MAX = 60;

/**
 * One exercise to resolve. `exerciseSlug` is the real key; `name` is the
 * legacy by-name fallback for a stash entry that never had a slug. Sending
 * neither yields an empty entry rather than an error.
 */
export const ExerciseHydrateItemSchema = z.object({
  exerciseSlug: z.string().optional(),
  name: z.string().optional(),
});

export const ExerciseHydrateRequestSchema = z.object({
  exercises: z.array(ExerciseHydrateItemSchema).max(EXERCISE_HYDRATE_MAX),
});

/**
 * The video half of a hydrated exercise — and ONLY the video half: this route
 * answers with no slug, name or classification, because the caller already has
 * those and merges these fields onto them by index (rule 3).
 *
 * Every field is optional and an exercise with no demo is `{}`.
 */
export const ExerciseHydrateVideoFieldsSchema = z
  .object({
    videoUrl: z.string().optional(),
    thumbnailUrl: z.string().optional(),
    videoWidth: z.number().nullable().optional(),
    videoHeight: z.number().nullable().optional(),
    videoFraming: ExerciseVideoFramingSchema.nullable().optional(),
    videoTrim: ExerciseVideoTrimSchema.nullable().optional(),
  })
  .passthrough();

/**
 * `{ exercises: [...] }` — rule 3: one entry per requested exercise, in the
 * order asked. An empty request answers `{ exercises: [] }`.
 */
export const ExerciseHydrateResponseSchema = z
  .object({
    exercises: z.array(ExerciseHydrateVideoFieldsSchema).default([]),
  })
  .passthrough();

export type ExerciseHydrateItem = z.infer<typeof ExerciseHydrateItemSchema>;
export type ExerciseHydrateRequest = z.infer<
  typeof ExerciseHydrateRequestSchema
>;
export type ExerciseHydrateVideoFields = z.infer<
  typeof ExerciseHydrateVideoFieldsSchema
>;
export type ExerciseHydrateResponse = z.infer<
  typeof ExerciseHydrateResponseSchema
>;

// ---------------------------------------------------------------------------
// GET /api/exercise-videos — the demo-video collection.
// Mirrors webapp/app/api/exercise-videos/route.ts + webapp/models/ExerciseVideo.ts.
//
// Three answers from one route, and they are NOT the same shape:
//   ?name=<display name>  → `{ video }`  — ONE row, or `{ video: null }` (200)
//   ?exercise=<slug>      → `{ videos }` — the rows linked to that exercise
//   (no query)            → `{ videos }` — every row
// ---------------------------------------------------------------------------

/**
 * One row of `exercise_videos`.
 *
 * This route answers with WHOLE documents, so rule 2 applies in full: `_id`,
 * `__v`, `createdAt` and `updatedAt` are all on the wire and all declared.
 *
 * `slug` is the canonical link to the exercise and is `null` on unmigrated
 * rows, which is why `exerciseName` is still the key the `?name=` lookup uses
 * (exactly, then case-insensitively).
 */
export const ExerciseDemoVideoSchema = z
  .object({
    /** Rule 2. */
    _id: z.string().optional(),
    /** Mirrors `Exercise.slug`. `null` on a row predating the migration. */
    slug: z.string().nullable().optional(),
    /** The display name this row is keyed by for legacy reads. */
    exerciseName: z.string(),
    videoUrl: z.string(),
    thumbnailUrl: z.string().nullable().optional(),
    /** True for a seeded stand-in rather than a real demo. */
    isPlaceholder: z.boolean().optional(),
    /** The object key in the bucket — the canonical id for the bytes. */
    storageKey: z.string().nullable().optional(),
    status: ExerciseVideoStatusSchema.catch('active').optional(),
    sizeBytes: z.number().nullable().optional(),
    mimeType: z.string().nullable().optional(),
    uploadedBy: z.string().nullable().optional(),
    videoWidth: z.number().nullable().optional(),
    videoHeight: z.number().nullable().optional(),
    /** Per-video framing override; mirrors `Exercise.videoFraming`. */
    framing: ExerciseVideoFramingSchema.nullable().optional(),
    /** Per-video in/out points in seconds; mirrors `Exercise.videoTrim`. */
    trim: ExerciseVideoTrimSchema.nullable().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    /** Rule 2: a whole-document read carries the version key. */
    __v: z.number().optional(),
  })
  .passthrough();

/** `?exercise=<slug>` and the unfiltered list, sorted by `exerciseName`. */
export const ExerciseVideosResponseSchema = z
  .object({
    videos: z.array(ExerciseDemoVideoSchema).default([]),
  })
  .passthrough();

/**
 * `?name=<display name>`. A miss is `{ video: null }` with status 200, NOT a
 * 404 — "this exercise has no demo" is an answer, not an error.
 */
export const ExerciseVideoResponseSchema = z
  .object({
    video: ExerciseDemoVideoSchema.nullable(),
  })
  .passthrough();

/** The two mutually exclusive filters. Neither = the whole list. */
export const ExerciseVideosQuerySchema = z.object({
  /** Exact display name, then case-insensitive. Answers `{ video }`. */
  name: z.string().optional(),
  /** An exercise slug, falling back to its name/aliases. Answers `{ videos }`. */
  exercise: z.string().optional(),
});

export type ExerciseDemoVideo = z.infer<typeof ExerciseDemoVideoSchema>;
export type ExerciseVideosResponse = z.infer<
  typeof ExerciseVideosResponseSchema
>;
export type ExerciseVideoResponse = z.infer<typeof ExerciseVideoResponseSchema>;
export type ExerciseVideosQuery = z.infer<typeof ExerciseVideosQuerySchema>;
