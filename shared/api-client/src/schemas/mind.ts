import { z } from 'zod';

// ===========================================================================
// MIND — the wire contract for /api/mind/* (NP-037)
//
// Before this file the shared client knew ONE thing about Mind: the dashboard
// mood scale in ./mood.ts. Every Mind screen the native app draws would have
// been untyped, and a web change to any of these responses would have broken it
// in silence — `grep -rnE "/api/mind/" expo shared/api-client/src` found
// nothing but the `mind` entry in the date-scoped prefix list in src/tz.ts.
//
// Every schema below names the route it mirrors and nothing here describes a
// response no handler sends. The routes are the ones with a live web caller;
// the legacy surfaces (`/api/mind/content/daily`, `/api/mind/progress/xp`,
// `/api/mind/progress/levelup`, `/api/journal`, `/api/meditation`,
// `/api/sleep`) are DELIBERATELY absent — see the note at the bottom of this
// file, which webapp/tests/unit/contract/np037Mind.test.ts asserts.
//
// FIVE RULES TRAVEL WITH THIS DOMAIN, and every one of them is asserted by
// webapp/tests/unit/contract/np037Mind.test.ts:
//
//   1. `POST /api/mind/session` takes `{ tz: <minutes west of UTC>, moves: [{ kind }] }`
//      and `PUT /api/mind/session` takes `{ seed, plan, tz }`. The day the
//      completion is stamped with comes from `tz` and from nothing else
//      (`readTzOffsetFromBody` in webapp/lib/dayWindow.ts). The web sends
//      `tzOffset` on the POST, which that reader IGNORES, so the web's own
//      completions are stamped with the UTC day — NP-031 fixes the web; the
//      native app must send `tz` from day one. `apiFetch` already does.
//   2. BOTH of those methods answer a locked member with the canonical 403 gate
//      body (`MindGatePayloadSchema`, `feature: 'mind-sessions'`,
//      `requiresTier: 'plus'`). The PUT gates the START of a session on
//      purpose: refusing only at the payoff walks somebody through a whole
//      session for nothing.
//   3. A `dateKey` is the member's LOCAL day as YYYY-MM-DD. Every `*At`
//      NUMBER on the session/progress responses is an epoch-milliseconds
//      INSTANT (the routes call `.getTime()` on them); every `*At` STRING is an
//      ISO instant straight off a Mongo document. They are not interchangeable.
//   4. `mainSessionCount` is CHAPTER PROGRESS in units of main sessions, not a
//      session count: it legitimately carries the intake / self-declare / admin
//      head start (webapp/models/MindProgress.ts). The number of sessions a
//      member has actually completed is `sessionsUsed` on
//      `GET /api/mind/session`, which is what the free allowance meters.
//   5. `locked` (the plan wall) and `mainSessionAvailable` (the 20h cooldown)
//      are orthogonal. `locked` never lifts on its own; the cooldown always
//      does. A client that conflates them either hides a session forever or
//      offers one the server will refuse.
//
// Response schemas are `.passthrough()` on purpose: a shipped store build has
// to survive a server that grew a field. The webapp contract harness is what
// stops a RENAME from sliding through that tolerance.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The four canonical states webapp/models/StateLog.ts enforces. */
export const MIND_STATES = [
  'stressed',
  'distracted',
  'low_energy',
  'locked_in',
] as const;

export const MindStateSchema = z.enum(MIND_STATES);

/**
 * Move kinds, as `MoveKind` in webapp/lib/mind/moves.ts lists them.
 *
 * Exported as a list so a client can name one, but the plan schema below types
 * `kind` as a plain STRING: a composer that grows a new beat must not make a
 * whole session unplayable on a build that shipped before it existed.
 */
export const MIND_MOVE_KINDS = [
  'state-check',
  'breath',
  'identity',
  'win',
  'challenge',
  'mission',
  'vision',
  'antisabotage',
  'social',
  'mirror',
  'choice',
  'type',
  'speak',
  'assemble',
  'compose',
  'acknowledge',
  'interrogative',
  'contrast',
] as const;

export const MindMoveKindSchema = z.enum(MIND_MOVE_KINDS);

/** `startingPoint` on webapp/models/IdentityProfile.ts. */
export const MIND_STARTING_POINTS = [
  'lost',
  'stuck',
  'building',
  'leveling_up',
] as const;

export const MindStartingPointSchema = z.enum(MIND_STARTING_POINTS);

/** `primaryObstacle` on webapp/models/IdentityProfile.ts. */
export const MIND_PRIMARY_OBSTACLES = [
  'clarity',
  'discipline',
  'motivation',
  'environment',
] as const;

export const MindPrimaryObstacleSchema = z.enum(MIND_PRIMARY_OBSTACLES);

export type MindState = z.infer<typeof MindStateSchema>;
export type MindMoveKind = z.infer<typeof MindMoveKindSchema>;
export type MindStartingPoint = z.infer<typeof MindStartingPointSchema>;
export type MindPrimaryObstacle = z.infer<typeof MindPrimaryObstacleSchema>;

/** `tz` is minutes WEST of UTC, a NUMBER — see src/tz.ts, rule 1 above. */
const writeTzFields = {
  tz: z.number().int().optional(),
  tzZone: z.string().optional(),
} as const;

/**
 * The two Mongoose bookkeeping keys every `.lean()` document carries onto the
 * wire. Declared rather than tolerated: the contract harness fails on any key
 * a response carries that the schema does not name, at every depth.
 */
const mongoDocFields = {
  _id: z.string().optional(),
  userId: z.string().optional(),
  __v: z.number().optional(),
} as const;

// ---------------------------------------------------------------------------
// The canonical 403 — rule 2.
// Mirrors webapp/lib/entitlements.ts#GatePayload / gateResponse().
// ---------------------------------------------------------------------------

/**
 * The plan gate, as every gate in the app sends it.
 *
 * `errors.ts#planGateFrom` is what the app CLASSIFIES a refusal with (it takes
 * `unknown` and is deliberately permissive about the tier vocabulary). This is
 * the same body as a schema, so a contract test can hold the route to it:
 * `error` is the server's wording rendered verbatim, `feature` is the gated
 * feature and `requiresTier` is the tier that lifts the wall.
 */
export const MindGatePayloadSchema = z
  .object({
    /** The server owns the wording; the upgrade sheet renders it verbatim. */
    error: z.string().min(1),
    feature: z.string(),
    requiresTier: z.string(),
    limit: z.number().optional(),
    remaining: z.number().optional(),
    resetsAt: z.string().nullish(),
    window: z.string().optional(),
  })
  .passthrough();

export type MindGatePayload = z.infer<typeof MindGatePayloadSchema>;

/** The feature name a Mind-session gate names. */
export const MIND_SESSIONS_FEATURE = 'mind-sessions';

// ---------------------------------------------------------------------------
// MindSessionPlan — webapp/lib/mind/moves.ts, the shape a session IS.
//
// It travels in both directions: the PUT sends the composed plan up so leaving
// mid-session and coming back returns the SAME session, and GET hands it back
// under `resume.plan`.
// ---------------------------------------------------------------------------

/** `options` on a `choice` move: a pick, with the reframe shown on picking it. */
export const MindMoveOptionSchema = z
  .object({
    label: z.string(),
    response: z.string().optional(),
  })
  .passthrough();

/**
 * `compose`: a mostly-written affirmation with `{0}`,`{1}`… blanks and the
 * positive word choices for each. Every option is valid — there are no wrong
 * answers, it just personalises the line.
 */
export const MindMoveComposeSchema = z
  .object({
    template: z.string(),
    blanks: z.array(z.array(z.string())).default([]),
  })
  .passthrough();

const moveShape = {
  id: z.string(),
  /**
   * A `MoveKind` (see MIND_MOVE_KINDS) but typed as a string on purpose: a new
   * beat on the server must not make a shipped build drop the whole session.
   */
  kind: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  /** breath → a key in `BREATH_PROTOCOLS` ('auto' = resolve from live state). */
  protocolId: z.string().optional(),
  /** identity/mirror/type/speak → the affirmation to recite. */
  statement: z.string().optional(),
  /** win → the reflection prompt. */
  prompt: z.string().optional(),
  options: z.array(MindMoveOptionSchema).optional(),
  compose: MindMoveComposeSchema.optional(),
  /** Attribution when the line came from the content library (e.g. a book). */
  source: z.string().optional(),
  /** Display only — the server is the source of truth for XP. */
  xp: z.number(),
} as const;

/** A move with no adaptive swap of its own. */
export const MindMoveBaseSchema = z.object(moveShape).passthrough();

/**
 * One full-screen beat of a session.
 *
 * `altPositive` is the adaptive swap: when the live state-check comes back
 * `locked_in` the player runs THIS move instead, so a good mood is not forced
 * into a breath. It is set on the opening beat only (`blueprints.ts`,
 * `aiEngine.ts`) and the move it points at never carries one itself, which is
 * why this nests exactly one level rather than recursing.
 */
export const MindMoveSchema = z
  .object({
    ...moveShape,
    altPositive: MindMoveBaseSchema.optional(),
  })
  .passthrough();

/** `MindSessionPlan` in webapp/lib/mind/moves.ts. */
export const MindSessionPlanSchema = z
  .object({
    intro: z
      .object({ title: z.string(), subtitle: z.string() })
      .passthrough(),
    moves: z.array(MindMoveSchema).default([]),
    /** Flat XP for the day's first completion. Granted server-side. */
    rewardXp: z.number(),
    /** The blueprint's own finish line; absent on one-move arsenal plans. */
    doneText: z.string().optional(),
    /** Which shape produced this session, e.g. "open-one-point/commit". */
    blueprintId: z.string().optional(),
    /** Which STATE opening is running. The live check-in swaps ONLY this. */
    openingId: z.string().optional(),
    /** The arsenal segment the session leads into, with a second-person reason. */
    cta: z
      .object({ system: z.string(), reason: z.string() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type MindMoveOption = z.infer<typeof MindMoveOptionSchema>;
export type MindMoveCompose = z.infer<typeof MindMoveComposeSchema>;
export type MindMove = z.infer<typeof MindMoveSchema>;
export type MindSessionPlan = z.infer<typeof MindSessionPlanSchema>;

// ---------------------------------------------------------------------------
// Progression vocabulary, shared by /api/mind/progress, /api/mind/session and
// /api/mind/summary. Mirrors webapp/lib/mindXP.ts.
// ---------------------------------------------------------------------------

/** One entry of `CHAPTERS`. The tailwind class names come down the wire too. */
export const MindChapterSchema = z
  .object({
    id: z.number(),
    name: z.string(),
    theme: z.string(),
    description: z.string(),
    color: z.string(),
    bg: z.string(),
    border: z.string(),
    /** The system ids this chapter ADDS, not the cumulative unlocked set. */
    systems: z.array(z.string()).default([]),
  })
  .passthrough();

/** `getLevelProgress()` — the level bar. Uncapped. */
export const MindLevelProgressSchema = z
  .object({
    level: z.number(),
    intoLevel: z.number(),
    span: z.number(),
    pct: z.number(),
    xpToNext: z.number(),
  })
  .passthrough();

/** `sessionsIntoChapter()` — main sessions done / needed inside the chapter. */
export const MindChapterSessionsSchema = z
  .object({
    done: z.number(),
    needed: z.number(),
    toNext: z.number(),
  })
  .passthrough();

/** `getXpToNextChapter()`. Null at the last chapter. */
export const MindChapterXpProgressSchema = z
  .object({
    needed: z.number(),
    current: z.number(),
    pct: z.number(),
  })
  .passthrough();

/** An `XP_MILESTONES` entry — post-chapter-5 progression. */
export const MindXpMilestoneSchema = z
  .object({
    xp: z.number(),
    label: z.string(),
    message: z.string(),
  })
  .passthrough();

/** One `chapterHistory` row. Entry 0 is the PLACEMENT, not an earned unlock. */
export const MindChapterHistoryEntrySchema = z
  .object({
    chapter: z.number(),
    unlockedAt: z.string(),
    _id: z.string().optional(),
  })
  .passthrough();

export type MindChapter = z.infer<typeof MindChapterSchema>;
export type MindLevelProgress = z.infer<typeof MindLevelProgressSchema>;
export type MindChapterSessions = z.infer<typeof MindChapterSessionsSchema>;
export type MindXpMilestone = z.infer<typeof MindXpMilestoneSchema>;

// ---------------------------------------------------------------------------
// The Vision document, shared by /api/mind/progress and /api/mind/vision.
// Mirrors `IVision` in webapp/models/MindProgress.ts.
// ---------------------------------------------------------------------------

export const MindVisionAlignmentEntrySchema = z
  .object({
    /** YYYY-MM-DD, the member's local day. */
    date: z.string(),
    /** 1–5. */
    score: z.number(),
  })
  .passthrough();

export const MindVisionSchema = z
  .object({
    habits: z.string().optional(),
    mind: z.string().optional(),
    body: z.string().optional(),
    relationships: z.string().optional(),
    environment: z.string().optional(),
    identityStatement: z.string().optional(),
    /** ISO instants. `completedAt` is set once, on the first complete vision. */
    completedAt: z.string().nullish(),
    updatedAt: z.string().nullish(),
    alignmentHistory: z.array(MindVisionAlignmentEntrySchema).default([]),
  })
  .passthrough();

export type MindVision = z.infer<typeof MindVisionSchema>;

// ---------------------------------------------------------------------------
// GET /api/mind/progress
// Mirrors webapp/app/api/mind/progress/route.ts.
//
// NOT a cheap read: it runs the level/chapter migrations and upserts on every
// call. The dashboard reads GET /api/mind/summary instead.
// ---------------------------------------------------------------------------

export const MindProgressResponseSchema = z
  .object({
    /** Derived: never below the stored chapter. 1–5. */
    chapter: z.number(),
    /** Legacy progression XP — what chapters used to be gated on. */
    xp: z.number(),
    /** Lifetime "Becoming score". Never decreases. */
    xpBank: z.number(),
    xpProgress: MindChapterXpProgressSchema.nullable(),
    readyToLevelUp: z.boolean(),
    canSelfDeclare: z.boolean(),
    selfDeclaredChapters: z.array(z.number()).default([]),
    /** The cumulative unlocked set for `chapter`. */
    unlockedSystems: z.array(z.string()).default([]),
    currentChapter: MindChapterSchema,
    nextChapter: MindChapterSchema.nullable(),
    vision: MindVisionSchema.nullable(),
    /** ISO instant here (straight off the document), unlike on the session read. */
    lastBreathAt: z.string().nullish(),
    chapterHistory: z.array(MindChapterHistoryEntrySchema).default([]),
    currentMilestone: MindXpMilestoneSchema.nullable(),
    nextMilestone: MindXpMilestoneSchema.nullable(),
    /** LEVEL: uncapped, driven by levelXp. */
    levelXp: z.number(),
    level: z.number(),
    levelProgress: MindLevelProgressSchema,
    /** CHAPTER PROGRESS — rule 4. NOT a session count. */
    mainSessionCount: z.number(),
    sessionsIntoChapter: MindChapterSessionsSchema,
    /** Tools whose one-time intro is done. Unlocked ≠ introduced. */
    introducedSystems: z.array(z.string()).default([]),
    /** The 20h cooldown — rule 5. Epoch ms instants. */
    mainSessionAvailable: z.boolean(),
    lastMainSessionAt: z.number().nullish(),
    nextMainSessionAt: z.number().nullish(),
  })
  .passthrough();

export type MindProgressResponse = z.infer<typeof MindProgressResponseSchema>;

// ---------------------------------------------------------------------------
// POST /api/mind/progress/introduce — mark a tool's one-time intro done.
// Mirrors webapp/app/api/mind/progress/introduce/route.ts. Idempotent.
// ---------------------------------------------------------------------------

export const MindIntroduceRequestSchema = z.object({
  /** One of the arsenal system ids (`SYSTEM_INFO`); anything else is a 400. */
  system: z.string(),
  ...writeTzFields,
});

export const MindIntroduceResponseSchema = z
  .object({
    introduced: z.boolean(),
    introducedSystems: z.array(z.string()).default([]),
  })
  .passthrough();

export type MindIntroduceRequest = z.infer<typeof MindIntroduceRequestSchema>;
export type MindIntroduceResponse = z.infer<typeof MindIntroduceResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/mind/session — everything the hub needs BEFORE Begin.
// Mirrors webapp/app/api/mind/session/route.ts (GET).
// ---------------------------------------------------------------------------

/** Why a stored session was thrown away — `StaleReason` in lib/mind/activeSession.ts. */
export const MIND_RESUME_DROPPED_REASONS = [
  'new_day',
  'workout_logged',
  'meal_logged',
] as const;

export const MindResumeDroppedReasonSchema = z.enum(
  MIND_RESUME_DROPPED_REASONS,
);

/** The unfinished session, handed back so Begin picks up where it left off. */
export const MindSessionResumeSchema = z
  .object({
    seed: z.number(),
    plan: MindSessionPlanSchema,
  })
  .passthrough();

export const MindSessionStateResponseSchema = z
  .object({
    /** The member's LOCAL day, from `tz` — rule 3. */
    dateKey: z.string(),
    completedToday: z.boolean(),
    streak: z.number(),
    /** Epoch ms — rule 3. Spaces breath work out across sessions. */
    lastBreathAt: z.number().nullish(),
    /** Effective move kinds from the last session, minus 'state-check'. */
    recentKinds: z.array(z.string()).default([]),
    /** The 20h cooldown — rule 5. */
    mainSessionAvailable: z.boolean(),
    lastMainSessionAt: z.number().nullish(),
    /** Null while a main session is available. */
    nextMainSessionAt: z.number().nullish(),
    resume: MindSessionResumeSchema.nullable(),
    resumeDropped: MindResumeDroppedReasonSchema.nullish(),
    /** The plan wall — rule 5. Never lifts on its own. */
    locked: z.boolean(),
    lockReason: z.literal('tier').nullish(),
    requiresTier: z.literal('plus').nullish(),
    /** Completed main sessions, clamped to the limit — rule 4. */
    sessionsUsed: z.number(),
    /** Null when access is UNCAPPED, which is not a limit of zero. */
    sessionsLimit: z.number().nullish(),
  })
  .passthrough();

export type MindSessionResume = z.infer<typeof MindSessionResumeSchema>;
export type MindSessionStateResponse = z.infer<
  typeof MindSessionStateResponseSchema
>;

// ---------------------------------------------------------------------------
// PUT /api/mind/session — remember the composed session. Rule 1 and rule 2.
// ---------------------------------------------------------------------------

export const MindSessionSaveRequestSchema = z.object({
  /** The composer seed, so the same session is reproducible. Must be finite. */
  seed: z.number(),
  plan: MindSessionPlanSchema,
  ...writeTzFields,
});

export const MindSessionSaveResponseSchema = z
  .object({
    ok: z.boolean(),
    /** The local day the session was stamped with — compared on the next load. */
    dateKey: z.string(),
  })
  .passthrough();

export type MindSessionSaveRequest = z.infer<
  typeof MindSessionSaveRequestSchema
>;
export type MindSessionSaveResponse = z.infer<
  typeof MindSessionSaveResponseSchema
>;

// ---------------------------------------------------------------------------
// POST /api/mind/session — the completion. Rule 1 and rule 2.
// ---------------------------------------------------------------------------

/** What the player actually showed, post state-swap. Only `kind` is read. */
export const MindSessionMoveReportSchema = z
  .object({ kind: z.string() })
  .passthrough();

export const MindSessionCompleteRequestSchema = z.object({
  moves: z.array(MindSessionMoveReportSchema).default([]),
  ...writeTzFields,
});

export const MindSessionCompleteResponseSchema = z
  .object({
    /** Completions stacked on this local day. Replays are allowed. */
    completions: z.number(),
    /**
     * Did this land as a real MAIN session? False inside the 20h cooldown,
     * where it still nudges the level but advances no chapter.
     */
    counted: z.boolean(),
    trainingMode: z.boolean(),
    xpAwarded: z.number(),
    levelXp: z.number(),
    level: z.number(),
    previousLevel: z.number(),
    leveledUp: z.boolean(),
    levelProgress: MindLevelProgressSchema,
    chapter: z.number(),
    previousChapter: z.number(),
    chapterAdvanced: z.boolean(),
    /** The systems THIS session opened; empty unless the chapter advanced. */
    newlyUnlocked: z.array(z.string()).default([]),
    unlockedSystems: z.array(z.string()).default([]),
    currentChapter: MindChapterSchema,
    /** Rule 4: chapter progress, not a session count. */
    mainSessionCount: z.number(),
    sessionsIntoChapter: MindChapterSessionsSchema,
    /** Epoch ms — when the next main session unlocks. */
    nextMainSessionAt: z.number(),
    xpBank: z.number(),
    streak: z.number(),
    /** Unlock moments crossed by THIS session, e.g. 'coach' at session 3. */
    featureUnlocks: z.array(z.string()).default([]),
  })
  .passthrough();

export type MindSessionMoveReport = z.infer<
  typeof MindSessionMoveReportSchema
>;
export type MindSessionCompleteRequest = z.infer<
  typeof MindSessionCompleteRequestSchema
>;
export type MindSessionCompleteResponse = z.infer<
  typeof MindSessionCompleteResponseSchema
>;

// ---------------------------------------------------------------------------
// GET|POST /api/mind/state — the check-in.
// Mirrors webapp/app/api/mind/state/route.ts.
// ---------------------------------------------------------------------------

/** A StateLog document, as `.lean()` / `toJSON()` renders it. */
export const MindStateLogSchema = z
  .object({
    ...mongoDocFields,
    state: MindStateSchema,
    /** Free text the member added on a mid-day re-check. */
    note: z.string().optional(),
    previousState: MindStateSchema.optional(),
    /**
     * The FEELING they actually tapped ("Grateful", "Drained"). Twenty feelings
     * collapse onto four states, and the word is what the reply answers.
     */
    feeling: z.string().optional(),
    /** ISO instant. */
    timestamp: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/**
 * Today's DASHBOARD mood (the 1–5 tile), when it was logged recently enough to
 * still be relevant. The session opener reads it so a member who tapped "Bad"
 * on the home screen a minute ago is not asked cold how they feel.
 */
export const MindTodayMoodSchema = z
  .object({
    value: z.number(),
    label: z.string(),
    /** Epoch ms. */
    at: z.number(),
  })
  .passthrough();

export const MindStateResponseSchema = z
  .object({
    /** Newest first. `?limit=` (default 7, max 100). */
    logs: z.array(MindStateLogSchema).default([]),
    todayMood: MindTodayMoodSchema.nullable(),
  })
  .passthrough();

export const MindStateLogRequestSchema = z.object({
  state: MindStateSchema,
  note: z.string().optional(),
  previousState: MindStateSchema.optional(),
  /** The exact word tapped. Stored, and answered in their own language. */
  feeling: z.string().optional(),
  ...writeTzFields,
});

export const MindStateLogResponseSchema = z
  .object({
    log: MindStateLogSchema,
    /** Rotates per check-in, so nobody reads the same line twice in a row. */
    recommendation: z.object({ message: z.string() }).passthrough(),
  })
  .passthrough();

export type MindStateLog = z.infer<typeof MindStateLogSchema>;
export type MindTodayMood = z.infer<typeof MindTodayMoodSchema>;
export type MindStateResponse = z.infer<typeof MindStateResponseSchema>;
export type MindStateLogRequest = z.infer<typeof MindStateLogRequestSchema>;
export type MindStateLogResponse = z.infer<typeof MindStateLogResponseSchema>;

// ---------------------------------------------------------------------------
// GET|PUT|PATCH /api/mind/identity — Self-Image.
// Mirrors webapp/app/api/mind/identity/route.ts.
// ---------------------------------------------------------------------------

/**
 * The IdentityProfile document.
 *
 * Everything but the two statements is optional because PATCH `action: 'edit'`
 * answers with `{ profile: { currentSelf, futureSelf } }` — the same key
 * carrying a two-field projection, not the whole row.
 */
export const MindIdentityProfileSchema = z
  .object({
    ...mongoDocFields,
    currentSelf: z.string(),
    futureSelf: z.string(),
    primaryObstacle: MindPrimaryObstacleSchema.optional(),
    startingPoint: MindStartingPointSchema.optional(),
    onboardingCompleted: z.boolean().optional(),
    /** 0–100, recomputed and persisted on every GET. */
    evolutionScore: z.number().optional(),
    affirmStreak: z.number().optional(),
    longestAffirmStreak: z.number().optional(),
    /** YYYY-MM-DD of the last affirmation, in the member's local day. */
    lastAffirmedKey: z.string().nullish(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/** The daily affirmation streak, with the today-or-yesterday tolerance applied. */
export const MindAffirmViewSchema = z
  .object({
    /** 0 once the day actually lapsed, whatever is stored. */
    streak: z.number(),
    longest: z.number(),
    affirmedToday: z.boolean(),
  })
  .passthrough();

/** Which section to send this member to first, from their obstacle. */
export const MindGuidanceSchema = z
  .object({
    section: z.string(),
    reason: z.string(),
    startWith: z.string(),
  })
  .passthrough();

export const MindEvolutionSchema = z
  .object({
    score: z.number(),
    challengesCompleted: z.number(),
    statesLogged: z.number(),
    hasMission: z.boolean(),
    startingLabel: z.string(),
  })
  .passthrough();

/**
 * `{ profile: null }` on its own is the whole answer for a member who has not
 * done the Mind intake — that is why every key but `profile` is optional.
 */
export const MindIdentityResponseSchema = z
  .object({
    profile: MindIdentityProfileSchema.nullable(),
    evolution: MindEvolutionSchema.optional(),
    guidance: MindGuidanceSchema.optional(),
    affirm: MindAffirmViewSchema.optional(),
  })
  .passthrough();

/** PUT: the intake. All four fields are required or the route answers 400. */
export const MindIdentityPutRequestSchema = z.object({
  currentSelf: z.string().min(1),
  futureSelf: z.string().min(1),
  primaryObstacle: MindPrimaryObstacleSchema,
  startingPoint: MindStartingPointSchema,
  ...writeTzFields,
});

/** PATCH `action: 'affirm'` — idempotent per local day, so it reads `tz`. */
export const MindIdentityAffirmRequestSchema = z.object({
  action: z.literal('affirm'),
  ...writeTzFields,
});

/** PATCH `action: 'edit'` — the two statements only; the streak is untouched. */
export const MindIdentityEditRequestSchema = z.object({
  action: z.literal('edit'),
  currentSelf: z.string().min(1),
  futureSelf: z.string().min(1),
  ...writeTzFields,
});

export const MindIdentityPatchRequestSchema = z.discriminatedUnion('action', [
  MindIdentityAffirmRequestSchema,
  MindIdentityEditRequestSchema,
]);

/** The affirm answer. */
export const MindAffirmResponseSchema = z
  .object({ affirm: MindAffirmViewSchema })
  .passthrough();

export type MindIdentityProfile = z.infer<typeof MindIdentityProfileSchema>;
export type MindAffirmView = z.infer<typeof MindAffirmViewSchema>;
export type MindIdentityResponse = z.infer<typeof MindIdentityResponseSchema>;
export type MindIdentityPutRequest = z.infer<
  typeof MindIdentityPutRequestSchema
>;
export type MindIdentityPatchRequest = z.infer<
  typeof MindIdentityPatchRequestSchema
>;
export type MindAffirmResponse = z.infer<typeof MindAffirmResponseSchema>;

// ---------------------------------------------------------------------------
// GET|PATCH|PUT /api/mind/mission — the why, and the momentum streak.
// Mirrors webapp/app/api/mind/mission/route.ts. Note the verbs: PUT writes the
// mission, PATCH takes the daily forward move.
// ---------------------------------------------------------------------------

export const MindMissionSchema = z
  .object({
    ...mongoDocFields,
    purpose: z.string(),
    whyItMatters: z.string(),
    dailyAction: z.string(),
    momentumStreak: z.number().optional(),
    longestMomentumStreak: z.number().optional(),
    /** YYYY-MM-DD of the last forward move, local day. */
    lastMovedKey: z.string().nullish(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

/** Same today-or-yesterday tolerance as the affirmation streak. */
export const MindMomentumViewSchema = z
  .object({
    streak: z.number(),
    longest: z.number(),
    movedToday: z.boolean(),
  })
  .passthrough();

export const MindMissionResponseSchema = z
  .object({
    mission: MindMissionSchema.nullable(),
    momentum: MindMomentumViewSchema.optional(),
  })
  .passthrough();

export const MindMissionPutRequestSchema = z.object({
  purpose: z.string().min(1),
  whyItMatters: z.string().min(1),
  dailyAction: z.string().min(1),
  ...writeTzFields,
});

/** "I moved forward today." Idempotent per local day, so it reads `tz`. */
export const MindMissionMoveRequestSchema = z.object({
  action: z.literal('move'),
  ...writeTzFields,
});

export const MindMomentumResponseSchema = z
  .object({ momentum: MindMomentumViewSchema })
  .passthrough();

export type MindMission = z.infer<typeof MindMissionSchema>;
export type MindMomentumView = z.infer<typeof MindMomentumViewSchema>;
export type MindMissionResponse = z.infer<typeof MindMissionResponseSchema>;
export type MindMissionPutRequest = z.infer<
  typeof MindMissionPutRequestSchema
>;
export type MindMissionMoveRequest = z.infer<
  typeof MindMissionMoveRequestSchema
>;
export type MindMomentumResponse = z.infer<typeof MindMomentumResponseSchema>;

// ---------------------------------------------------------------------------
// GET|POST|PATCH /api/mind/vision — Vision, a BINARY Plus feature.
// Mirrors webapp/app/api/mind/vision/route.ts.
//
// `FREE_LIMITS.vision.limit` is 0, so POST and PATCH answer a free member with
// the gate body above (`feature: 'vision'`). GET stays OPEN on purpose: the
// teaser wants the real shape, and a member who wrote a vision before the gate
// existed must still be able to read it.
// ---------------------------------------------------------------------------

/** The 1–5 daily alignment check, over a 7-day window. */
export const MindVisionAlignmentSchema = z
  .object({
    avg7: z.number(),
    entries7: z.number(),
    todayScore: z.number().nullish(),
    checkedToday: z.boolean(),
  })
  .passthrough();

export const MindVisionResponseSchema = z
  .object({
    vision: MindVisionSchema.nullable(),
    alignment: MindVisionAlignmentSchema,
  })
  .passthrough();

/** Every field is a partial update; sending all six completes the vision. */
export const MindVisionPostRequestSchema = z.object({
  habits: z.string().optional(),
  mind: z.string().optional(),
  body: z.string().optional(),
  relationships: z.string().optional(),
  environment: z.string().optional(),
  identityStatement: z.string().optional(),
  ...writeTzFields,
});

export const MindVisionSaveResponseSchema = z
  .object({
    vision: MindVisionSchema.nullable(),
    /** 75 for the first complete vision, 15 for an update. */
    xpGained: z.number(),
    xp: z.number(),
  })
  .passthrough();

/** PATCH `action: 'align'` — today's 1–5, idempotent per local day. */
export const MindVisionAlignRequestSchema = z.object({
  action: z.literal('align'),
  score: z.number().int().min(1).max(5),
  ...writeTzFields,
});

export const MindVisionAlignResponseSchema = z
  .object({ alignment: MindVisionAlignmentSchema })
  .passthrough();

export type MindVisionAlignment = z.infer<typeof MindVisionAlignmentSchema>;
export type MindVisionResponse = z.infer<typeof MindVisionResponseSchema>;
export type MindVisionPostRequest = z.infer<
  typeof MindVisionPostRequestSchema
>;
export type MindVisionSaveResponse = z.infer<
  typeof MindVisionSaveResponseSchema
>;
export type MindVisionAlignRequest = z.infer<
  typeof MindVisionAlignRequestSchema
>;
export type MindVisionAlignResponse = z.infer<
  typeof MindVisionAlignResponseSchema
>;

// ---------------------------------------------------------------------------
// GET|POST /api/mind/discipline — today's challenge.
// Mirrors webapp/app/api/mind/discipline/route.ts. The GET UPSERTS the day's
// row, so it is a read that writes.
// ---------------------------------------------------------------------------

export const MindDisciplineChallengeSchema = z
  .object({
    ...mongoDocFields,
    /** A 00:00Z day MARKER for the member's local day, not an instant. */
    date: z.string(),
    challenge: z.string(),
    completed: z.boolean(),
    excuse: z.string().optional(),
    /** The line that comes back at an excuse. Server-owned wording. */
    excuseResponse: z.string().optional(),
    /** ISO instant. */
    completedAt: z.string().nullish(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const MindDisciplineResponseSchema = z
  .object({
    /**
     * Null from the POST when no row exists for the day yet: neither action
     * upserts, so a `complete` that never had a GET before it finds nothing.
     */
    challenge: MindDisciplineChallengeSchema.nullable(),
    excuseResponse: z.string().optional(),
  })
  .passthrough();

/** `complete` closes the day out; `excuse` records the story and gets answered. */
export const MindDisciplineActionRequestSchema = z.object({
  action: z.enum(['complete', 'excuse']),
  /** Required (≥ 5 characters) for `excuse`, ignored for `complete`. */
  excuse: z.string().optional(),
  ...writeTzFields,
});

export type MindDisciplineChallenge = z.infer<
  typeof MindDisciplineChallengeSchema
>;
export type MindDisciplineResponse = z.infer<
  typeof MindDisciplineResponseSchema
>;
export type MindDisciplineActionRequest = z.infer<
  typeof MindDisciplineActionRequestSchema
>;

// ---------------------------------------------------------------------------
// GET|POST|PATCH /api/mind/non-negotiables — the standing standards.
// Mirrors webapp/app/api/mind/non-negotiables/route.ts.
// ---------------------------------------------------------------------------

/**
 * A non-negotiable as the GET PROJECTS it — `id`, not `_id`, and no `userId`.
 * The route builds this by hand; it does not hand the document back.
 */
export const MindNonNegotiableSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    /** 0 once the streak broke, until it is checked again. */
    currentStreak: z.number(),
    longestStreak: z.number(),
    checkedToday: z.boolean(),
  })
  .passthrough();

export const MindNonNegotiablesResponseSchema = z
  .object({ items: z.array(MindNonNegotiableSchema).default([]) })
  .passthrough();

/** POST: create one. Seven active maximum — the eighth is a 400. */
export const MindNonNegotiableCreateRequestSchema = z.object({
  text: z.string().min(1),
  ...writeTzFields,
});

/** And the POST answers with the two fields it just wrote, nothing more. */
export const MindNonNegotiableCreateResponseSchema = z
  .object({ id: z.string(), text: z.string() })
  .passthrough();

export const MindNonNegotiablePatchRequestSchema = z.object({
  id: z.string(),
  action: z.enum(['check', 'deactivate', 'edit']),
  /** Required for `edit`. */
  text: z.string().optional(),
  ...writeTzFields,
});

/**
 * `check` answers with the streak; `deactivate` and `edit` answer `{ ok: true }`.
 * One schema, because a client does know which action it sent and a union here
 * would buy nothing but a cast.
 */
export const MindNonNegotiablePatchResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    currentStreak: z.number().optional(),
    longestStreak: z.number().optional(),
    checkedToday: z.boolean().optional(),
  })
  .passthrough();

export type MindNonNegotiable = z.infer<typeof MindNonNegotiableSchema>;
export type MindNonNegotiablesResponse = z.infer<
  typeof MindNonNegotiablesResponseSchema
>;
export type MindNonNegotiableCreateRequest = z.infer<
  typeof MindNonNegotiableCreateRequestSchema
>;
export type MindNonNegotiableCreateResponse = z.infer<
  typeof MindNonNegotiableCreateResponseSchema
>;
export type MindNonNegotiablePatchRequest = z.infer<
  typeof MindNonNegotiablePatchRequestSchema
>;
export type MindNonNegotiablePatchResponse = z.infer<
  typeof MindNonNegotiablePatchResponseSchema
>;

// ---------------------------------------------------------------------------
// GET|POST /api/mind/wins — the daily win log.
// Mirrors webapp/app/api/mind/wins/route.ts. Multiple wins a day are allowed.
// ---------------------------------------------------------------------------

export const MindWinSchema = z
  .object({
    ...mongoDocFields,
    /** A 00:00Z day MARKER for the member's local day. */
    date: z.string(),
    win: z.string(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const MindWinsResponseSchema = z
  .object({
    /** Newest first. `?limit=` (default 7, max 100). */
    wins: z.array(MindWinSchema).default([]),
  })
  .passthrough();

export const MindWinCreateRequestSchema = z.object({
  /** Three characters minimum, or the route answers 400. */
  win: z.string().min(3),
  ...writeTzFields,
});

export const MindWinCreateResponseSchema = z
  .object({ win: MindWinSchema })
  .passthrough();

export type MindWin = z.infer<typeof MindWinSchema>;
export type MindWinsResponse = z.infer<typeof MindWinsResponseSchema>;
export type MindWinCreateRequest = z.infer<typeof MindWinCreateRequestSchema>;
export type MindWinCreateResponse = z.infer<
  typeof MindWinCreateResponseSchema
>;

// ---------------------------------------------------------------------------
// GET|POST /api/mind/journal — what a session and every arsenal tool WRITES.
// Mirrors webapp/app/api/mind/journal/route.ts.
//
// This is /api/MIND/journal. The legacy `/api/journal` is a different, older
// route with no live web caller and it has no schema here on purpose.
// ---------------------------------------------------------------------------

export const MindJournalLineSchema = z
  .object({
    prompt: z.string().optional(),
    answer: z.string().optional(),
  })
  .passthrough();

export const MindJournalEntrySchema = z
  .object({
    ...mongoDocFields,
    /** The arsenal system id: 'anti-sabotage', 'vision', 'session', … */
    system: z.string(),
    /** 'protocol' | 'fear-breakdown' | 'pattern-catch' | … */
    kind: z.string(),
    title: z.string(),
    lines: z.array(MindJournalLineSchema).default([]),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough();

export const MindJournalResponseSchema = z
  .object({
    /** Newest first. `?system=` filters, `?limit=` (default 10, max 50). */
    entries: z.array(MindJournalEntrySchema).default([]),
    /** Entry counts per `kind`, for the same filter. */
    counts: z.record(z.string(), z.number()).default({}),
  })
  .passthrough();

/**
 * Writing under a GATED system (`vision`) takes that feature's gate, so this
 * POST can answer with the 403 body above. Every other system is free —
 * including `session`, which is what a completed Mind session writes.
 */
export const MindJournalCreateRequestSchema = z.object({
  system: z.string().min(1),
  kind: z.string().min(1),
  title: z.string().min(1),
  /** Twelve lines maximum; the server truncates rather than refusing. */
  lines: z.array(MindJournalLineSchema).optional(),
  ...writeTzFields,
});

export const MindJournalCreateResponseSchema = z
  .object({ saved: z.boolean(), id: z.string() })
  .passthrough();

export type MindJournalLine = z.infer<typeof MindJournalLineSchema>;
export type MindJournalEntry = z.infer<typeof MindJournalEntrySchema>;
export type MindJournalResponse = z.infer<typeof MindJournalResponseSchema>;
export type MindJournalCreateRequest = z.infer<
  typeof MindJournalCreateRequestSchema
>;
export type MindJournalCreateResponse = z.infer<
  typeof MindJournalCreateResponseSchema
>;

// ---------------------------------------------------------------------------
// POST /api/mind/share — a public, read-only snapshot of composed sessions.
// Mirrors webapp/app/api/mind/share/route.ts. Answers 201.
// ---------------------------------------------------------------------------

export const MindShareSessionSchema = z
  .object({
    title: z.string().optional(),
    plan: MindSessionPlanSchema,
  })
  .passthrough();

/**
 * Either one `plan` or a `sessions` array. A plan is shareable only when it has
 * an `intro` and at least one move; everything invalid is dropped and an empty
 * result is a 400.
 */
export const MindShareRequestSchema = z.object({
  kind: z.enum(['session', 'program']).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  plan: MindSessionPlanSchema.optional(),
  /** Fifty maximum; more than one forces `kind: 'program'`. */
  sessions: z.array(MindShareSessionSchema).optional(),
  sourceSystemId: z.string().optional(),
  programId: z.string().optional(),
  ...writeTzFields,
});

export const MindShareResponseSchema = z
  .object({
    /** URL-safe and unguessable. */
    token: z.string(),
    /** A RELATIVE path — `/share/mind/<token>`, not an absolute URL. */
    url: z.string(),
  })
  .passthrough();

export type MindShareSession = z.infer<typeof MindShareSessionSchema>;
export type MindShareRequest = z.infer<typeof MindShareRequestSchema>;
export type MindShareResponse = z.infer<typeof MindShareResponseSchema>;

// ---------------------------------------------------------------------------
// GET /api/mind/summary — the dashboard's Mindset card.
// Mirrors webapp/app/api/mind/summary/route.ts.
//
// The CHEAP read: it makes the same derivations /api/mind/progress does without
// its migrations and upserts. The widgets feed computes the same numbers
// server-side, so the two must agree.
// ---------------------------------------------------------------------------

/** The most recent check-in, flattened for the card. */
export const MindSummaryLastStateSchema = z
  .object({
    state: z.string(),
    feeling: z.string().nullish(),
    /** Epoch ms. */
    at: z.number(),
  })
  .passthrough();

export const MindSummaryResponseSchema = z
  .object({
    /** The member's local day — every count below is measured against it. */
    todayKey: z.string(),
    level: z.number(),
    /** 0–100 through the current level. */
    levelPct: z.number(),
    chapter: z.number(),
    chapterName: z.string().nullish(),
    sessionsIntoChapter: z.number(),
    sessionsPerChapter: z.number(),
    sessionDoneToday: z.boolean(),
    mainSessionAvailable: z.boolean(),
    sessionsLast7Days: z.number(),
    moodCheckinsLast7Days: z.number(),
    /** The dashboard's 1–5 mood for today, if there is one. */
    todayMood: z.number().nullish(),
    lastState: MindSummaryLastStateSchema.nullable(),
  })
  .passthrough();

export type MindSummaryLastState = z.infer<
  typeof MindSummaryLastStateSchema
>;
export type MindSummaryResponse = z.infer<typeof MindSummaryResponseSchema>;

// ---------------------------------------------------------------------------
// THE ROUTES THAT ARE NOT HERE, AND MUST NOT BE
//
// Adding a schema for a route nothing calls is worse than leaving it out: it
// reads as a supported surface, the native app builds a screen on it, and
// nobody is holding the web to it because the web does not use it either.
//
// webapp/tests/unit/contract/np037Mind.test.ts fails if a schema for any of
// these appears in this package.
// ---------------------------------------------------------------------------

export const MIND_ROUTES_WITHOUT_SCHEMAS: readonly string[] = [
  // Superseded by the composer in webapp/lib/mind/composeSession.ts.
  '/api/mind/content/daily',
  // Superseded by POST /api/mind/session, which grants the XP itself.
  '/api/mind/progress/xp',
  '/api/mind/progress/levelup',
  // The legacy journal, not /api/mind/journal.
  '/api/journal',
  // Neither feature has a live web caller.
  '/api/meditation',
  '/api/sleep',
];
