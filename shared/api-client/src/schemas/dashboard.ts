import { z } from 'zod';

/**
 * THE DASHBOARD DOMAIN (NP-023) — layout, tiles, suggestions, the program
 * nudge, goals and progress.
 *
 * WHY THIS FILE EXISTS. The dashboard is the first screen a member sees and it
 * ran on routes this package did not type at all: `webapp/lib/dashboardLayout/
 * types.ts` even said it mirrored `@become/api-client`'s `schemas/dashboard.ts`
 * — a file that did not exist. Everything the native home screen needs
 * (`GET|PATCH /api/dashboard/layout`, `GET /api/dashboard/tiles`,
 * `POST /api/dashboard/tile-tap`, `POST /api/suggestions/dismiss`,
 * `GET|POST /api/program-nudge`, `GET|PUT /api/goals`, `GET /api/progress`)
 * is described here, and only here.
 *
 * THE TILE VOCABULARY IS DUPLICATED ON PURPOSE, AND PINNED BY A TEST.
 * The webapp cannot import this package — webapp/Dockerfile's build context is
 * `webapp/`, so the sibling package is not in the image — so the tile kinds,
 * sizes, rotation intervals, stat ids and the 20-tile limit exist twice: here,
 * and in `webapp/lib/dashboardLayout/types.ts` + `defaults.ts`. That is only
 * safe while nothing drifts, so two tests compare the two sides and fail on any
 * difference:
 *   - `shared/api-client/tests/webParity.test.ts` reads the web files as TEXT
 *     (this package cannot import the webapp either);
 *   - `webapp/tests/unit/contract/dashboardParity.test.ts` imports both
 *     modules and compares them value for value.
 * Change a constant here and you must change it there in the same commit.
 *
 * TYPES ARE LOOSE ON PROFILE-SOURCED UNIONS, for the reason `schemas/
 * account.ts` gives: a stored profile is read by a build that may be months
 * older than the server, and a new `fitnessGoal` value must not make a whole
 * response unparseable. The server is the only side that validates those.
 *
 * Every response schema is `.passthrough()` — see
 * webapp/tests/unit/contract/_contract.ts for why, and for why "it parses" is
 * not the whole check.
 */

// ===========================================================================
// The tile vocabulary — mirrors webapp/lib/dashboardLayout/types.ts
//                       and webapp/lib/dashboardLayout/defaults.ts
// ===========================================================================

/** Mirrors `TILE_KINDS` in webapp/lib/dashboardLayout/types.ts. */
export const TILE_KINDS = ['stat', 'metric', 'smart-rotating'] as const;
export type DashboardTileKind = (typeof TILE_KINDS)[number];

/** Mirrors `TILE_SIZES` in webapp/lib/dashboardLayout/types.ts. `2x1` is the
 *  full-width "long" tile of the 2-column mobile grid. */
export const TILE_SIZES = ['1x1', '2x1'] as const;
export type DashboardTileSize = (typeof TILE_SIZES)[number];

/** Maximum number of tiles a single layout may contain. PATCH
 *  /api/dashboard/layout rejects a longer list with a 400. */
export const MAX_DASHBOARD_TILES = 20;

/** Allowed rotation intervals (ms) for a smart tile's frequency setting — the
 *  only values the customizer offers, and therefore the only values that reach
 *  the wire. */
export const SMART_INTERVAL_OPTIONS_MS = [4000, 6000, 10000, 30000] as const;
export type SmartIntervalMs = (typeof SMART_INTERVAL_OPTIONS_MS)[number];

/** The interval a smart tile rotates at when `settings.intervalMs` is absent. */
export const DEFAULT_SMART_INTERVAL_MS = 6000;

/** A smart tile's pool may reference at most this many card keys. */
export const MAX_SMART_POOL = 20;

/** The 8 stat cards, mirroring `STAT_TILE_IDS` in
 *  webapp/lib/dashboardLayout/defaults.ts. */
export const STAT_TILE_IDS = [
  'streak',
  'mood',
  'weekly',
  'goal',
  'calories',
  'water',
  'weight',
  'workouts',
] as const;
export type StatTileId = (typeof STAT_TILE_IDS)[number];

/** The id of the default smart-rotating tile (`SMART_ROTATING_TILE_ID`). */
export const SMART_ROTATING_TILE_ID = 'smart';

/**
 * A rotation-pool / engagement card key, e.g. `stat:streak` or `metric:foo`.
 * Mirrors `TILE_KEY_RE` in webapp/lib/dashboardLayout/types.ts — the same
 * pattern POST /api/dashboard/tile-tap validates its `key` against.
 */
export const TILE_KEY_REGEX = /^(stat|metric):[a-zA-Z0-9._-]+$/;

// ===========================================================================
// GET | PATCH /api/dashboard/layout
// ===========================================================================

export const DashboardTileKindSchema = z.enum(TILE_KINDS);
export const DashboardTileSizeSchema = z.enum(TILE_SIZES);
export const StatTileIdSchema = z.enum(STAT_TILE_IDS);

/** One of {@link SMART_INTERVAL_OPTIONS_MS}. Derived from the constant so the
 *  two can never disagree. */
export const SmartIntervalMsSchema = z.literal(SMART_INTERVAL_OPTIONS_MS);

/**
 * Per-tile settings. Optional; most tiles have none. Only the smart-rotating
 * tile uses them today:
 *  - `pool`: the exact card keys it rotates through. Absent ⇒ the default pool
 *    (the original stat cards only — no metrics).
 *  - `intervalMs`: rotation frequency.
 */
export const DashboardTileSettingsSchema = z
  .object({
    pool: z
      .array(z.string().regex(TILE_KEY_REGEX))
      .max(MAX_SMART_POOL)
      .optional(),
    intervalMs: SmartIntervalMsSchema.optional(),
  })
  .passthrough();

export type DashboardTileSettings = z.infer<typeof DashboardTileSettingsSchema>;

/**
 * A single dashboard tile, as persisted on `UserProgress.dashboardLayout` and
 * as sent on the wire.
 *
 * `locked` pins a smart-rotating tile to one card; null/absent = it rotates.
 * The server additionally refuses `locked` on a tile that is not
 * 'smart-rotating' — that cross-field rule is enforced by the route, not here,
 * because a client only ever READS this shape back.
 */
export const DashboardTileSchema = z
  .object({
    id: z.string().min(1),
    kind: DashboardTileKindSchema,
    size: DashboardTileSizeSchema,
    locked: z.string().min(1).nullable().optional(),
    settings: DashboardTileSettingsSchema.optional(),
  })
  .passthrough();

export type DashboardTile = z.infer<typeof DashboardTileSchema>;

/** The full ordered list. At most {@link MAX_DASHBOARD_TILES} tiles. */
export const DashboardLayoutSchema = z
  .array(DashboardTileSchema)
  .max(MAX_DASHBOARD_TILES);

export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

/** GET /api/dashboard/layout — `?statPref=streak,mood,…` migrates a legacy
 *  client on first read; the response is the same either way. */
export const DashboardLayoutResponseSchema = z
  .object({
    layout: DashboardLayoutSchema,
  })
  .passthrough();

export type DashboardLayoutResponse = z.infer<
  typeof DashboardLayoutResponseSchema
>;

/** PATCH /api/dashboard/layout — `layout` is the FULL new ordered list; pin,
 *  unpin, reorder, resize and lock all round-trip through it. */
export const DashboardLayoutPatchRequestSchema = z.object({
  layout: DashboardLayoutSchema,
});

export type DashboardLayoutPatchRequest = z.infer<
  typeof DashboardLayoutPatchRequestSchema
>;

export const DashboardLayoutPatchResponseSchema = z
  .object({
    success: z.boolean(),
    layout: DashboardLayoutSchema,
  })
  .passthrough();

export type DashboardLayoutPatchResponse = z.infer<
  typeof DashboardLayoutPatchResponseSchema
>;

// ===========================================================================
// GET /api/dashboard/tiles — the rotator's picks, plus what they render from
// ===========================================================================

/** Why a candidate scored what it did (rotator's `ScoreBreakdown`). */
export const TileScoreBreakdownSchema = z
  .object({
    freshness: z.number(),
    signalStrength: z.number(),
    recencySinceLastShown: z.number(),
    goalWeight: z.number(),
  })
  .passthrough();

export type TileScoreBreakdown = z.infer<typeof TileScoreBreakdownSchema>;

/**
 * One rotator pick. A discriminated pair in the web's own types: a 'metric'
 * carries `tileId`, a 'suggestion' carries `suggestionId`. Modelled as one
 * object with both optional rather than a zod discriminated union so the
 * contract harness can walk its keys, and so an unknown future `kind` does not
 * make the whole response unparseable on a shipped build.
 */
export const TileCandidateSchema = z
  .object({
    kind: z.enum(['metric', 'suggestion']),
    /** Present when `kind` is 'metric' — the id in `metrics[]`. */
    tileId: z.string().optional(),
    /** Present when `kind` is 'suggestion' — the id in `suggestions[]`. */
    suggestionId: z.string().optional(),
    score: z.number(),
    pinned: z.boolean(),
    breakdown: TileScoreBreakdownSchema,
  })
  .passthrough();

export type TileCandidate = z.infer<typeof TileCandidateSchema>;

/** One point of a metric series. `t` is a Date on the server, an ISO string
 *  on the wire. */
export const DashboardMetricPointSchema = z
  .object({
    t: z.string(),
    value: z.number(),
    label: z.string().optional(),
  })
  .passthrough();

export type DashboardMetricPoint = z.infer<typeof DashboardMetricPointSchema>;

export const DashboardMetricDomainSchema = z.enum([
  'workout',
  'nutrition',
  'mindset',
]);
export type DashboardMetricDomain = z.infer<typeof DashboardMetricDomainSchema>;

export const DashboardMetricTrendDirectionSchema = z.enum([
  'up-good',
  'down-good',
  'neutral',
]);
export type DashboardMetricTrendDirection = z.infer<
  typeof DashboardMetricTrendDirectionSchema
>;

/**
 * A computed metric, ready to chart. `error` is present instead of data when
 * the metric's own `compute()` threw: the route degrades one tile rather than
 * failing the whole dashboard, so a client must expect `latest: null`,
 * `data: []` and a message.
 */
export const DashboardMetricSummarySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unit: z.string(),
    domain: DashboardMetricDomainSchema,
    trendDirection: DashboardMetricTrendDirectionSchema,
    latest: DashboardMetricPointSchema.nullable(),
    data: z.array(DashboardMetricPointSchema),
    error: z.string().optional(),
  })
  .passthrough();

export type DashboardMetricSummary = z.infer<
  typeof DashboardMetricSummarySchema
>;

export const DashboardSuggestionSeveritySchema = z.enum([
  'info',
  'nudge',
  'warning',
  'celebration',
]);
export type DashboardSuggestionSeverity = z.infer<
  typeof DashboardSuggestionSeveritySchema
>;

export const DashboardSuggestionDomainSchema = z.enum([
  'workout',
  'nutrition',
  'mindset',
]);
export type DashboardSuggestionDomain = z.infer<
  typeof DashboardSuggestionDomainSchema
>;

/**
 * Where a suggestion belongs. 'dashboard' (the default) renders in the home
 * rotator; 'exercise' is scoped to one exercise and renders in-context during a
 * session. GET /api/dashboard/tiles FILTERS OUT 'exercise' — it is declared
 * here because the field is on the wire, not because the dashboard shows them.
 */
export const DashboardSuggestionPlacementSchema = z.enum([
  'dashboard',
  'exercise',
]);
export type DashboardSuggestionPlacement = z.infer<
  typeof DashboardSuggestionPlacementSchema
>;

export const DashboardSuggestionActionSchema = z
  .object({
    label: z.string(),
    href: z.string(),
  })
  .passthrough();

export type DashboardSuggestionAction = z.infer<
  typeof DashboardSuggestionActionSchema
>;

export const DashboardSuggestionSchema = z
  .object({
    id: z.string(),
    severity: DashboardSuggestionSeveritySchema,
    title: z.string(),
    body: z.string(),
    placement: DashboardSuggestionPlacementSchema.optional(),
    primaryAction: DashboardSuggestionActionSchema.optional(),
    dismissible: z.boolean(),
    /** A dismissal silences this suggestion for this many days; absent =
     *  dismissed for good. */
    cooldownDays: z.number().optional(),
    source: DashboardSuggestionDomainSchema,
    /** Source-specific payload, e.g. `{ exerciseSlug }`. */
    sourceData: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type DashboardSuggestion = z.infer<typeof DashboardSuggestionSchema>;

/** Per-card tap history — the adaptive signal behind the smart tile's order. */
export const TileEngagementSchema = z
  .object({
    key: z.string(),
    taps: z.number(),
    lastTapAt: z.string().nullable().optional(),
  })
  .passthrough();

export type TileEngagement = z.infer<typeof TileEngagementSchema>;

export const DashboardTilesResponseSchema = z
  .object({
    tiles: z.array(TileCandidateSchema),
    metrics: z.array(DashboardMetricSummarySchema),
    suggestions: z.array(DashboardSuggestionSchema),
    engagement: z.array(TileEngagementSchema),
    /** The server's clock, so a client's recency maths does not depend on the
     *  device's. */
    now: z.string(),
  })
  .passthrough();

export type DashboardTilesResponse = z.infer<
  typeof DashboardTilesResponseSchema
>;

// ===========================================================================
// POST /api/dashboard/tile-tap
// ===========================================================================

/** `key` must match {@link TILE_KEY_REGEX} — the route 400s otherwise. */
export const DashboardTileTapRequestSchema = z.object({
  key: z.string().regex(TILE_KEY_REGEX),
});

export type DashboardTileTapRequest = z.infer<
  typeof DashboardTileTapRequestSchema
>;

export const DashboardTileTapResponseSchema = z
  .object({
    success: z.boolean(),
  })
  .passthrough();

export type DashboardTileTapResponse = z.infer<
  typeof DashboardTileTapResponseSchema
>;

// ===========================================================================
// POST /api/suggestions/dismiss
// ===========================================================================

export const SuggestionDismissRequestSchema = z.object({
  id: z.string().min(1),
});

export type SuggestionDismissRequest = z.infer<
  typeof SuggestionDismissRequestSchema
>;

/** `wasUpdate` is true when the id had already been dismissed and its stamp was
 *  replaced rather than appended — the route is idempotent. */
export const SuggestionDismissResponseSchema = z
  .object({
    success: z.boolean(),
    id: z.string(),
    wasUpdate: z.boolean(),
    count: z.number(),
  })
  .passthrough();

export type SuggestionDismissResponse = z.infer<
  typeof SuggestionDismissResponseSchema
>;

// ===========================================================================
// GET | POST /api/program-nudge
// ===========================================================================

export const PROGRAM_NUDGE_ACTIONS = [
  'shown',
  'dismiss',
  'dismiss_forever',
  'adopt',
] as const;

export type ProgramNudgeAction = (typeof PROGRAM_NUDGE_ACTIONS)[number];
export const ProgramNudgeActionSchema = z.enum(PROGRAM_NUDGE_ACTIONS);

/**
 * POST /api/program-nudge. The counters and stamps are only read for
 * `action: 'adopt'` — the one-time migration of a pre-existing localStorage
 * record onto the account, which may only ADD state, never replace it.
 */
export const ProgramNudgeRequestSchema = z.object({
  action: ProgramNudgeActionSchema,
  dismissCount: z.number().optional(),
  shownCount: z.number().optional(),
  lastDismissedAt: z.string().optional(),
  lastShownAt: z.string().optional(),
  dontShowAgain: z.boolean().optional(),
});

export type ProgramNudgeRequest = z.infer<typeof ProgramNudgeRequestSchema>;

/**
 * The nudge's gating state. `due` is the only field the two failure answers
 * carry: an unauthenticated read and a failed read both answer
 * `{ due: false, reason }` — fail closed, so a broken read cannot spam the
 * member with a modal. `adopted` comes back on POST only.
 *
 * `showings` is read BEFORE this showing is recorded, so the first sighting
 * reports 0 and the second 1; the modal gates its "don't show again" on it.
 */
export const ProgramNudgeResponseSchema = z
  .object({
    due: z.boolean(),
    showings: z.number().optional(),
    dismissCount: z.number().optional(),
    dontShowAgain: z.boolean().optional(),
    hasServerState: z.boolean().optional(),
    adopted: z.boolean().optional(),
    /** 'unauthenticated' | 'error' on the two fail-closed answers. */
    reason: z.string().optional(),
  })
  .passthrough();

export type ProgramNudgeResponse = z.infer<typeof ProgramNudgeResponseSchema>;

// ===========================================================================
// GET | PUT /api/goals — then → now → next, per pillar
//
// Read by the goal stat tile, the check-in's goal line and the Becoming door;
// written by the pace setting in Settings and by onboarding (NP-048, NP-056).
// ===========================================================================

/** A weigh-in on the goal timeline, in the member's own unit. */
export const GoalWeightPointSchema = z
  .object({
    weight: z.number().nullable(),
    date: z.string().nullable(),
  })
  .passthrough();

export type GoalWeightPoint = z.infer<typeof GoalWeightPointSchema>;

/** Today's weigh-in, with the four-week-ago reading for the trend arrow. */
export const GoalNowWeightPointSchema = z
  .object({
    weight: z.number().nullable(),
    date: z.string().nullable(),
    fourWeeksAgo: z.number().nullable(),
  })
  .passthrough();

export type GoalNowWeightPoint = z.infer<typeof GoalNowWeightPointSchema>;

/**
 * The nutrition target. `paceKgPerWeek` is always kg (the stored plan);
 * `pacePerWeek` is the same number in the member's unit, so the UI never has to
 * convert. `bandKg` is how far from the target still reads as "on target".
 */
export const GoalNutritionTargetSchema = z
  .object({
    weight: z.number().nullable(),
    paceKgPerWeek: z.number().nullable(),
    pacePerWeek: z.number().nullable(),
    bandKg: z.number(),
  })
  .passthrough();

export type GoalNutritionTarget = z.infer<typeof GoalNutritionTargetSchema>;

/** `PaceStatus` in @become/core's goals/pace. */
export const PACE_STATUSES = ['ahead', 'on', 'behind', 'done', 'na'] as const;
export const PaceStatusSchema = z.enum(PACE_STATUSES);
export type PaceStatus = z.infer<typeof PaceStatusSchema>;

/**
 * The pace read: today's weight against the plan line from baseline to target.
 * `PaceRead` plus the formatted ETA the UI renders. Null when there is nothing
 * to compare (no target, no weigh-in, or no baseline date).
 */
export const GoalPaceReadSchema = z
  .object({
    status: PaceStatusSchema,
    /** Where the plan says you should be today (kg). */
    expectedKg: z.number().nullable(),
    /** actual − expected, signed in the goal's direction: negative = behind. */
    aheadByKg: z.number(),
    /** Positive when behind. */
    behindByKg: z.number(),
    etaWeeks: z.number().nullable(),
    /** kg still to go (0 inside the finish band). */
    remainingKg: z.number(),
    /** "~3 wks", "~5 days", "this week", "there", "". */
    eta: z.string(),
    etaDate: z.string().nullable(),
  })
  .passthrough();

export type GoalPaceRead = z.infer<typeof GoalPaceReadSchema>;

/** The last 7 local days of logging, against the member's own targets. */
export const GoalAdherenceSchema = z
  .object({
    logDays: z.number(),
    proteinDays: z.number(),
    totalDays: z.number(),
    logTarget: z.number(),
    proteinTarget: z.number(),
    logOk: z.boolean(),
    /** Null until a protein goal is known. */
    proteinOk: z.boolean().nullable(),
    proteinJudged: z.boolean(),
  })
  .passthrough();

export type GoalAdherence = z.infer<typeof GoalAdherenceSchema>;

/** "Where to work on next" for one pillar. `key` doubles as the notification
 *  tag / dedupe key. */
export const GoalSuggestionSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    sub: z.string(),
    severity: z.enum(['info', 'nudge', 'warn', 'good']),
    url: z.string(),
  })
  .passthrough();

export type GoalSuggestion = z.infer<typeof GoalSuggestionSchema>;

export const NutritionGoalViewSchema = z
  .object({
    unit: z.enum(['lbs', 'kg']),
    status: z.enum(['none', 'active', 'achieved']),
    kind: z.enum(['weight', 'maintain']).nullable(),
    direction: z.enum(['lose', 'maintain', 'gain']).nullable(),
    startedAt: z.string().nullable(),
    achievedAt: z.string().nullable(),
    /** Where the plan started — the goal's baseline, i.e. "then". */
    baseline: GoalWeightPointSchema,
    /** The very first weigh-in ever, for context. */
    journeyStart: GoalWeightPointSchema,
    now: GoalNowWeightPointSchema,
    target: GoalNutritionTargetSchema,
    pace: GoalPaceReadSchema.nullable(),
    adherence: GoalAdherenceSchema.nullable(),
    proteinGoal: z.number().nullable(),
    suggestion: GoalSuggestionSchema,
  })
  .passthrough();

export type NutritionGoalView = z.infer<typeof NutritionGoalViewSchema>;

export const GoalTrainingTargetSchema = z
  .object({
    daysPerWeek: z.number().nullable(),
    programId: z.string().nullable(),
  })
  .passthrough();

export type GoalTrainingTarget = z.infer<typeof GoalTrainingTargetSchema>;

/** `chancesLeft` counts the remaining TRAINING days of the week, not calendar
 *  days, when the member has a schedule. */
export const GoalTrainingWeekSchema = z
  .object({
    done: z.number(),
    remaining: z.number(),
    chancesLeft: z.number(),
    weekLost: z.boolean(),
  })
  .passthrough();

export type GoalTrainingWeek = z.infer<typeof GoalTrainingWeekSchema>;

/** A lift's best estimated max, in the member's unit. */
export const GoalPRSnapshotSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    e1RM: z.number(),
    weight: z.number().optional(),
    reps: z.number().optional(),
  })
  .passthrough();

export type GoalPRSnapshot = z.infer<typeof GoalPRSnapshotSchema>;

export const GoalTrainingBaselineSchema = z
  .object({
    daysPerWeek: z.number().nullable(),
    date: z.string().nullable(),
    prs: z.array(GoalPRSnapshotSchema),
  })
  .passthrough();

export type GoalTrainingBaseline = z.infer<typeof GoalTrainingBaselineSchema>;

/** then → now on one lift. `reached` flips true once `now` caught `target`. */
export const GoalLiftProgressSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    then: z.number(),
    now: z.number(),
    delta: z.number(),
    pct: z.number(),
    target: z.number().optional(),
    /** 0–100 toward the target from baseline; null without a target. */
    toTargetPct: z.number().nullable(),
    remaining: z.number().optional(),
    reached: z.boolean().optional(),
  })
  .passthrough();

export type GoalLiftProgress = z.infer<typeof GoalLiftProgressSchema>;

export const LIFT_TIERS = ['building', 'progressing', 'refining'] as const;
export const LiftTierSchema = z.enum(LIFT_TIERS);
export type LiftTier = z.infer<typeof LiftTierSchema>;

/** How established a lift is, and what that judgement was made from. */
export const LiftTierAssessmentSchema = z
  .object({
    tier: LiftTierSchema,
    weeksLogged: z.number(),
    /** Fractional change over the recent window, e.g. 0.04 = up 4%. Null when
     *  there is not enough history to say. */
    recentGain: z.number().nullable(),
    sessions: z.number(),
  })
  .passthrough();

export type LiftTierAssessment = z.infer<typeof LiftTierAssessmentSchema>;

/** A proposed strength target — what PUT /api/goals writes when
 *  `lifts: 'suggested'`. */
export const StrengthTargetSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    baselineE1RM: z.number(),
    targetE1RM: z.number(),
    tier: LiftTierSchema,
    /** Gain rate per 4 weeks, e.g. 0.015 = 1.5%. */
    ratePer4Weeks: z.number(),
    horizonWeeks: z.number(),
    assessment: LiftTierAssessmentSchema,
  })
  .passthrough();

export type StrengthTarget = z.infer<typeof StrengthTargetSchema>;

/** Why a target is the number it is, so tapping it can explain itself. */
export const StrengthTargetExplanationSchema = z
  .object({
    headline: z.string(),
    tier: LiftTierSchema,
    tierLabel: z.string(),
    why: z.array(z.string()),
    method: z.string(),
    caveat: z.string(),
  })
  .passthrough();

export type StrengthTargetExplanation = z.infer<
  typeof StrengthTargetExplanationSchema
>;

export const GoalTopSetSchema = z
  .object({
    name: z.string(),
    weight: z.number(),
    reps: z.number(),
    e1RM: z.number(),
  })
  .passthrough();

export type GoalTopSet = z.infer<typeof GoalTopSetSchema>;

/** What the member actually did in the gym this week — the near view. */
export const WeekTrainingMetricsSchema = z
  .object({
    sessions: z.number(),
    sets: z.number(),
    reps: z.number(),
    /** Σ weight × reps across completed weighted sets, in the member's unit. */
    volume: z.number(),
    workSeconds: z.number(),
    topSet: GoalTopSetSchema.nullable(),
    exercises: z.number(),
    /** False ⇒ `volume` is not meaningful (no weighted set logged). */
    hasWeightedWork: z.boolean(),
  })
  .passthrough();

export type WeekTrainingMetrics = z.infer<typeof WeekTrainingMetricsSchema>;

export const TrainingGoalViewSchema = z
  .object({
    status: z.enum(['none', 'active']),
    startedAt: z.string().nullable(),
    target: GoalTrainingTargetSchema,
    thisWeek: GoalTrainingWeekSchema,
    avgLast4: z.number().nullable(),
    weeklyCounts: z.array(z.number()),
    baseline: GoalTrainingBaselineSchema,
    lifts: z.array(GoalLiftProgressSchema),
    /** Empty once the member has set their own lift targets. */
    suggestedLifts: z.array(StrengthTargetSchema),
    hasLiftTargets: z.boolean(),
    /** Keyed by lift slug. */
    liftRationales: z.record(z.string(), StrengthTargetExplanationSchema),
    week: WeekTrainingMetricsSchema,
    /** The member's load unit, so numbers can be labelled without refetching
     *  the profile. */
    unit: z.enum(['lbs', 'kg']),
    suggestion: GoalSuggestionSchema,
  })
  .passthrough();

export type TrainingGoalView = z.infer<typeof TrainingGoalViewSchema>;

/** GET /api/goals?tz= and the fresh payload PUT /api/goals answers with. */
export const GoalProgressResponseSchema = z
  .object({
    /** The member's local day, `YYYY-MM-DD`, resolved from `?tz=`. */
    todayKey: z.string(),
    nutrition: NutritionGoalViewSchema,
    training: TrainingGoalViewSchema,
  })
  .passthrough();

export type GoalProgressResponse = z.infer<typeof GoalProgressResponseSchema>;

/** PUT /api/goals, nutrition pillar — the pace Settings and onboarding write. */
export const GoalUpdateNutritionRequestSchema = z.object({
  pillar: z.literal('nutrition'),
  /** Clamped server-side to 0.1–1.5 kg/wk. */
  paceKgPerWeek: z.number().optional(),
  adherence: z
    .object({
      logDaysPerWeek: z.number().optional(),
      proteinDaysPerWeek: z.number().optional(),
    })
    .optional(),
  /** Minutes west of UTC, as everywhere else in this package. */
  tz: z.number().optional(),
});

export type GoalUpdateNutritionRequest = z.infer<
  typeof GoalUpdateNutritionRequestSchema
>;

/** PUT /api/goals, training pillar. `lifts: 'suggested'` asks the server to
 *  derive the targets from the member's own history; an array sets them
 *  explicitly (at most 5); `[]` clears them. */
export const GoalUpdateTrainingRequestSchema = z.object({
  pillar: z.literal('training'),
  daysPerWeek: z.number().optional(),
  lifts: z
    .union([
      z.literal('suggested'),
      z.array(
        z.object({
          slug: z.string(),
          name: z.string().optional(),
          baselineE1RM: z.number().optional(),
          targetE1RM: z.number(),
        }),
      ),
    ])
    .optional(),
  tz: z.number().optional(),
});

export type GoalUpdateTrainingRequest = z.infer<
  typeof GoalUpdateTrainingRequestSchema
>;

export const GoalUpdateRequestSchema = z.discriminatedUnion('pillar', [
  GoalUpdateNutritionRequestSchema,
  GoalUpdateTrainingRequestSchema,
]);

export type GoalUpdateRequest = z.infer<typeof GoalUpdateRequestSchema>;

// ===========================================================================
// GET /api/progress?tz= — the dashboard's stat tiles and current-program card
//
// `?detailed=1` adds the progress page's extras; the dashboard fetches the
// summary. Both shapes are described by ProgressApiResponseSchema, because it
// is one route and one client-side type.
// ===========================================================================

/** A charted point. `date` is a SHORT DISPLAY LABEL ("Sep 1"), formatted
 *  server-side — not an ISO date. */
export const ProgressSeriesPointSchema = z
  .object({
    date: z.string(),
    value: z.number(),
  })
  .passthrough();

export type ProgressSeriesPoint = z.infer<typeof ProgressSeriesPointSchema>;

/**
 * The four numbers the stat row renders. `goalProgress` is how far through the
 * CURRENT PROGRAM the member is (it was once mislabelled an annual goal), and
 * `thisWeekWorkouts` counts COMPLETED sessions since the member's local Sunday.
 */
export const ProgressStatsSchema = z
  .object({
    streakDays: z.number(),
    totalWorkouts: z.number(),
    thisWeekWorkouts: z.number(),
    goalProgress: z.number(),
  })
  .passthrough();

export type ProgressStats = z.infer<typeof ProgressStatsSchema>;

/**
 * `goal.pace` — an OBJECT, not a number.
 *
 * This is the pace read the Goal tile shows, built by the route from
 * `paceRead()`: the chosen weekly rate plus where the member stands against it.
 * It was typed as a number once and GET /api/progress simply did not parse.
 * Null when the member has no target, no weigh-in or no goal baseline.
 */
export const ProgressGoalPaceSchema = z
  .object({
    /** The CHOSEN weekly rate in kg (a plan, not a measurement). */
    kgPerWeek: z.number().nullable(),
    status: PaceStatusSchema,
    etaWeeks: z.number().nullable(),
    /** The formatted ETA, e.g. "~3 wks". */
    eta: z.string(),
    /** Positive when behind the plan line; 0 otherwise. */
    behindByKg: z.number(),
  })
  .passthrough();

export type ProgressGoalPace = z.infer<typeof ProgressGoalPaceSchema>;

/**
 * The member's goal, attached to BOTH the summary and the detailed shape — the
 * Goal and This Week tiles used to see neither because it was detailed-only.
 * `startWeightKg` is the GOAL'S baseline, not `profile.currentWeightKg` (which
 * every weigh-in overwrites).
 */
export const ProgressGoalSummarySchema = z
  .object({
    /** Today: 'lose_weight' | 'gain_muscle' | 'maintain' |
     *  'improve_performance' | 'general_health'. Loose on purpose — see the
     *  file header. */
    fitnessGoal: z.string().nullable(),
    /** Today: 'lose' | 'maintain' | 'gain'. */
    nutritionDirection: z.string().nullable(),
    targetWeightKg: z.number().nullable(),
    startWeightKg: z.number().nullable(),
    weeklyAvailability: z.number().nullable(),
    weightUnit: z.enum(['kg', 'lbs']),
    pace: ProgressGoalPaceSchema.nullable(),
  })
  .passthrough();

export type ProgressGoalSummary = z.infer<typeof ProgressGoalSummarySchema>;

/**
 * The current-program card. `completedWorkouts`/`totalWorkouts` come from the
 * SCHEDULE when there is one (so the percentage agrees with the workout hub)
 * and are absent on the legacy `UserProgress.currentProgram` path, which stores
 * neither.
 */
export const ProgressCurrentProgramSchema = z
  .object({
    programId: z.string(),
    name: z.string(),
    currentPhase: z.number(),
    currentWeek: z.number(),
    totalWeeks: z.number(),
    completedWorkouts: z.number().optional(),
    totalWorkouts: z.number().optional(),
    /** "Day 3 - Upper A". */
    nextWorkout: z.string(),
    nextWorkoutDay: z.string().optional(),
  })
  .passthrough();

export type ProgressCurrentProgram = z.infer<
  typeof ProgressCurrentProgramSchema
>;

/** A personal best. `date` is a short display label ("Jun 5"). */
export const ProgressExercisePRSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    weight: z.number(),
    reps: z.number(),
    date: z.string(),
  })
  .passthrough();

export type ProgressExercisePR = z.infer<typeof ProgressExercisePRSchema>;

/** `?detailed=1`: the last 7 completed sessions, newest first. */
export const ProgressRecentWorkoutSchema = z
  .object({
    date: z.string(),
    programId: z.string().optional(),
    day: z.string(),
    duration: z.number().optional(),
    exerciseCount: z.number(),
  })
  .passthrough();

export type ProgressRecentWorkout = z.infer<typeof ProgressRecentWorkoutSchema>;

export const ProgressLoggedSetSchema = z
  .object({
    setNumber: z.number(),
    reps: z.number().nullable(),
    weight: z.number().nullable(),
    duration: z.number().nullable(),
    distance: z.number().nullable(),
    speed: z.number().nullable(),
    completed: z.boolean(),
  })
  .passthrough();

export type ProgressLoggedSet = z.infer<typeof ProgressLoggedSetSchema>;

export const ProgressLoggedExerciseSchema = z
  .object({
    name: z.string(),
    slug: z.string().optional(),
    bestSet: z
      .object({ weight: z.number(), reps: z.number() })
      .passthrough()
      .nullable(),
    volume: z.number(),
    isPR: z.boolean(),
    sets: z.array(ProgressLoggedSetSchema),
  })
  .passthrough();

export type ProgressLoggedExercise = z.infer<
  typeof ProgressLoggedExerciseSchema
>;

/** `?detailed=1`: the last 20 completed sessions with their full set data. */
export const ProgressDetailedWorkoutSchema = z
  .object({
    /** Short display label ("Fri, Jun 5"). */
    date: z.string(),
    /** The same instant as an ISO string. */
    rawDate: z.string(),
    kind: z.enum(['program', 'quick']),
    sessionId: z.string().optional(),
    title: z.string().optional(),
    programId: z.string().optional(),
    day: z.string(),
    duration: z.number().optional(),
    notes: z.string().optional(),
    totalVolume: z.number(),
    exercises: z.array(ProgressLoggedExerciseSchema),
  })
  .passthrough();

export type ProgressDetailedWorkout = z.infer<
  typeof ProgressDetailedWorkoutSchema
>;

/** `?detailed=1`: the last 12 weeks, keyed by the week's Monday. */
export const ProgressWeeklyVolumeSchema = z
  .object({
    /** Short display label for the week's Monday ("Jun 1"). */
    week: z.string(),
    volume: z.number(),
    workouts: z.number(),
  })
  .passthrough();

export type ProgressWeeklyVolume = z.infer<typeof ProgressWeeklyVolumeSchema>;

/**
 * GET /api/progress.
 *
 * The four series and `stats` are always present — they are all a brand-new
 * member (and the route's own error fallback) answers with. `goal`,
 * `longestStreak` and the `?detailed=1` extras are therefore optional: a client
 * must handle the empty answer without treating it as a failure.
 */
export const ProgressApiResponseSchema = z
  .object({
    weightData: z.array(ProgressSeriesPointSchema),
    bmiData: z.array(ProgressSeriesPointSchema),
    /** Only weigh-ins that carried a body-fat reading. */
    bodyFatData: z.array(ProgressSeriesPointSchema).optional(),
    leanMassData: z.array(ProgressSeriesPointSchema).optional(),
    moodData: z.array(ProgressSeriesPointSchema),
    currentProgram: ProgressCurrentProgramSchema.nullable(),
    stats: ProgressStatsSchema,
    goal: ProgressGoalSummarySchema.optional(),
    longestStreak: z.number().optional(),
    // ── `?detailed=1` only ──────────────────────────────────────────────
    pbs: z.array(ProgressExercisePRSchema).optional(),
    recentWorkouts: z.array(ProgressRecentWorkoutSchema).optional(),
    detailedWorkouts: z.array(ProgressDetailedWorkoutSchema).optional(),
    weeklyVolume: z.array(ProgressWeeklyVolumeSchema).optional(),
    totalVolumeLbs: z.number().optional(),
    targetWeightLbs: z.number().nullable().optional(),
    weeklyAvailability: z.number().nullable().optional(),
  })
  .passthrough();

export type ProgressApiResponse = z.infer<typeof ProgressApiResponseSchema>;
