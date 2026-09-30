import { z } from 'zod';

// ===========================================================================
// DASHBOARD — the wire contract for dashboard layout, tiles, suggestions,
//             program nudge, goals and progress (NP-023).
//
// Every schema below names the route it mirrors; nothing here describes a
// response no route sends.
//
// Rules asserted by webapp/tests/unit/contract/np023Dashboard.test.ts:
//   1. Tile kinds, sizes, interval options and the 20-tile limit match
//      webapp/lib/dashboardLayout/types.ts exactly.
//   2. Response schemas are .passthrough() so shipped client builds survive
//      additive server changes.
// ===========================================================================

// ---------------------------------------------------------------------------
// Vocabulary & Constants — mirrors webapp/lib/dashboardLayout/types.ts & defaults.ts
// ---------------------------------------------------------------------------

export const TILE_KINDS = ['stat', 'metric', 'smart-rotating'] as const;
export const DASHBOARD_TILE_KINDS = TILE_KINDS;
export type DashboardTileKind = (typeof TILE_KINDS)[number];

export const TILE_SIZES = ['1x1', '2x1'] as const;
export const DASHBOARD_TILE_SIZES = TILE_SIZES;
export type DashboardTileSize = (typeof TILE_SIZES)[number];

/** Maximum number of tiles a single layout may contain. */
export const MAX_DASHBOARD_TILES = 20;

/** Allowed rotation intervals (ms) for a smart tile's frequency setting. */
export const SMART_INTERVAL_OPTIONS_MS = [4000, 6000, 10000, 30000] as const;
export type SmartIntervalMs = (typeof SMART_INTERVAL_OPTIONS_MS)[number];
export const DEFAULT_SMART_INTERVAL_MS = 6000;

/** A smart tile's pool may reference at most this many card keys. */
export const MAX_SMART_POOL = 20;

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

export const SMART_ROTATING_TILE_ID = 'smart';

export const TILE_KEY_REGEX = /^(stat|metric):[a-zA-Z0-9._-]+$/;

// ---------------------------------------------------------------------------
// GET | PATCH /api/dashboard/layout
// ---------------------------------------------------------------------------

export const DashboardTileKindSchema = z.enum(TILE_KINDS);
export const DashboardTileSizeSchema = z.enum(TILE_SIZES);
export const StatTileIdSchema = z.enum(STAT_TILE_IDS);

export const SmartIntervalMsSchema = z.union([
  z.literal(4000),
  z.literal(6000),
  z.literal(10000),
  z.literal(30000),
]);

export const DashboardTileSettingsSchema = z
  .object({
    pool: z.array(z.string().regex(TILE_KEY_REGEX)).max(MAX_SMART_POOL).optional(),
    intervalMs: SmartIntervalMsSchema.optional(),
  })
  .passthrough();

export type DashboardTileSettings = z.infer<typeof DashboardTileSettingsSchema>;

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

export const DashboardLayoutSchema = z
  .array(DashboardTileSchema)
  .max(MAX_DASHBOARD_TILES);

export type DashboardLayout = z.infer<typeof DashboardLayoutSchema>;

export const DashboardLayoutResponseSchema = z
  .object({
    layout: DashboardLayoutSchema,
  })
  .passthrough();

export type DashboardLayoutResponse = z.infer<typeof DashboardLayoutResponseSchema>;

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

// ---------------------------------------------------------------------------
// GET /api/dashboard/tiles — rotator-picked metrics & suggestions
// ---------------------------------------------------------------------------

export const ScoreBreakdownSchema = z
  .object({
    freshness: z.number(),
    signalStrength: z.number(),
    recencySinceLastShown: z.number(),
    goalWeight: z.number(),
  })
  .passthrough();

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const TileCandidateSchema = z
  .object({
    kind: z.enum(['metric', 'suggestion']),
    tileId: z.string().optional(),
    suggestionId: z.string().optional(),
    score: z.number(),
    pinned: z.boolean(),
    breakdown: ScoreBreakdownSchema,
  })
  .passthrough();

export type TileCandidate = z.infer<typeof TileCandidateSchema>;

export const MetricDataPointSchema = z
  .object({
    t: z.string(),
    value: z.number(),
    label: z.string().optional(),
  })
  .passthrough();

export type MetricDataPoint = z.infer<typeof MetricDataPointSchema>;

export const MetricDomainSchema = z.enum(['workout', 'nutrition', 'mindset']);
export type MetricDomain = z.infer<typeof MetricDomainSchema>;

export const MetricTrendDirectionSchema = z.enum([
  'up-good',
  'down-good',
  'neutral',
]);
export type MetricTrendDirection = z.infer<typeof MetricTrendDirectionSchema>;

export const DashboardMetricSummarySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unit: z.string(),
    domain: MetricDomainSchema,
    trendDirection: MetricTrendDirectionSchema,
    latest: MetricDataPointSchema.nullable(),
    data: z.array(MetricDataPointSchema),
    error: z.string().optional(),
  })
  .passthrough();

export type DashboardMetricSummary = z.infer<
  typeof DashboardMetricSummarySchema
>;

export const SuggestionSeveritySchema = z.enum([
  'info',
  'nudge',
  'warning',
  'celebration',
]);
export type SuggestionSeverity = z.infer<typeof SuggestionSeveritySchema>;

export const SuggestionDomainSchema = z.enum(['workout', 'nutrition', 'mindset']);
export type SuggestionDomain = z.infer<typeof SuggestionDomainSchema>;

export const SuggestionPlacementSchema = z.enum(['dashboard', 'exercise']);
export type SuggestionPlacement = z.infer<typeof SuggestionPlacementSchema>;

export const SuggestionPrimaryActionSchema = z
  .object({
    label: z.string(),
    href: z.string(),
  })
  .passthrough();

export type SuggestionPrimaryAction = z.infer<
  typeof SuggestionPrimaryActionSchema
>;

export const DashboardSuggestionSchema = z
  .object({
    id: z.string(),
    severity: SuggestionSeveritySchema,
    title: z.string(),
    body: z.string(),
    placement: SuggestionPlacementSchema.optional(),
    primaryAction: SuggestionPrimaryActionSchema.optional(),
    dismissible: z.boolean(),
    cooldownDays: z.number().optional(),
    source: SuggestionDomainSchema,
    sourceData: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export type DashboardSuggestion = z.infer<typeof DashboardSuggestionSchema>;

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
    now: z.string(),
  })
  .passthrough();

export type DashboardTilesResponse = z.infer<
  typeof DashboardTilesResponseSchema
>;

// ---------------------------------------------------------------------------
// POST /api/dashboard/tile-tap
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// POST /api/suggestions/dismiss
// ---------------------------------------------------------------------------

export const SuggestionDismissRequestSchema = z.object({
  id: z.string().min(1),
});

export type SuggestionDismissRequest = z.infer<
  typeof SuggestionDismissRequestSchema
>;

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

// ---------------------------------------------------------------------------
// GET | POST /api/program-nudge
// ---------------------------------------------------------------------------

export const PROGRAM_NUDGE_ACTIONS = [
  'shown',
  'dismiss',
  'dismiss_forever',
  'adopt',
] as const;

export type ProgramNudgeAction = (typeof PROGRAM_NUDGE_ACTIONS)[number];
export const ProgramNudgeActionSchema = z.enum(PROGRAM_NUDGE_ACTIONS);

export const ProgramNudgeRequestSchema = z.object({
  action: ProgramNudgeActionSchema,
  dismissCount: z.number().optional(),
  shownCount: z.number().optional(),
  lastDismissedAt: z.string().optional(),
  lastShownAt: z.string().optional(),
  dontShowAgain: z.boolean().optional(),
});

export type ProgramNudgeRequest = z.infer<typeof ProgramNudgeRequestSchema>;

export const ProgramNudgeResponseSchema = z
  .object({
    due: z.boolean(),
    showings: z.number().optional(),
    dismissCount: z.number().optional(),
    dontShowAgain: z.boolean().optional(),
    hasServerState: z.boolean().optional(),
    adopted: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .passthrough();

export type ProgramNudgeResponse = z.infer<typeof ProgramNudgeResponseSchema>;

// ---------------------------------------------------------------------------
// GET | PUT /api/goals
// ---------------------------------------------------------------------------

export const GoalWeightPointSchema = z
  .object({
    weight: z.number().nullable(),
    date: z.string().nullable(),
    fourWeeksAgo: z.number().nullable().optional(),
  })
  .passthrough();

export type GoalWeightPoint = z.infer<typeof GoalWeightPointSchema>;

export const GoalTargetNutritionSchema = z
  .object({
    weight: z.number().nullable(),
    paceKgPerWeek: z.number().nullable(),
    pacePerWeek: z.number().nullable(),
    bandKg: z.number(),
  })
  .passthrough();

export type GoalTargetNutrition = z.infer<typeof GoalTargetNutritionSchema>;

export const PaceStatusSchema = z.enum(['ahead', 'on', 'behind', 'done', 'na']);
export type PaceStatus = z.infer<typeof PaceStatusSchema>;

export const GoalPaceSchema = z
  .object({
    status: PaceStatusSchema,
    expectedKg: z.number().nullable(),
    aheadByKg: z.number(),
    behindByKg: z.number(),
    etaWeeks: z.number().nullable(),
    remainingKg: z.number(),
    eta: z.string(),
    etaDate: z.string().nullable(),
  })
  .passthrough();

export type GoalPace = z.infer<typeof GoalPaceSchema>;

export const GoalAdherenceSchema = z
  .object({
    logDays: z.number(),
    proteinDays: z.number(),
    totalDays: z.number(),
    logTarget: z.number(),
    proteinTarget: z.number(),
    logOk: z.boolean(),
    proteinOk: z.boolean().nullable(),
    proteinJudged: z.boolean(),
  })
  .passthrough();

export type GoalAdherence = z.infer<typeof GoalAdherenceSchema>;

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
    baseline: GoalWeightPointSchema,
    journeyStart: GoalWeightPointSchema,
    now: GoalWeightPointSchema,
    target: GoalTargetNutritionSchema,
    pace: GoalPaceSchema.nullable(),
    adherence: GoalAdherenceSchema.nullable(),
    proteinGoal: z.number().nullable(),
    suggestion: GoalSuggestionSchema,
  })
  .passthrough();

export type NutritionGoalView = z.infer<typeof NutritionGoalViewSchema>;

export const TrainingGoalTargetSchema = z
  .object({
    daysPerWeek: z.number().nullable(),
    programId: z.string().nullable(),
  })
  .passthrough();

export type TrainingGoalTarget = z.infer<typeof TrainingGoalTargetSchema>;

export const TrainingThisWeekSchema = z
  .object({
    done: z.number(),
    remaining: z.number(),
    chancesLeft: z.number(),
    weekLost: z.boolean(),
  })
  .passthrough();

export type TrainingThisWeek = z.infer<typeof TrainingThisWeekSchema>;

export const PRSnapshotSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    e1RM: z.number(),
    weight: z.number().optional(),
    reps: z.number().optional(),
  })
  .passthrough();

export type PRSnapshot = z.infer<typeof PRSnapshotSchema>;

export const TrainingBaselineSchema = z
  .object({
    daysPerWeek: z.number().nullable(),
    date: z.string().nullable(),
    prs: z.array(PRSnapshotSchema),
  })
  .passthrough();

export type TrainingBaseline = z.infer<typeof TrainingBaselineSchema>;

export const LiftProgressSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    then: z.number(),
    now: z.number(),
    delta: z.number(),
    pct: z.number(),
    target: z.number().optional(),
    toTargetPct: z.number().nullable(),
    remaining: z.number().optional(),
    reached: z.boolean().optional(),
  })
  .passthrough();

export type LiftProgress = z.infer<typeof LiftProgressSchema>;

export const LiftTierSchema = z.enum(['building', 'progressing', 'refining']);
export type LiftTier = z.infer<typeof LiftTierSchema>;

export const TierAssessmentSchema = z
  .object({
    tier: LiftTierSchema,
    weeksLogged: z.number(),
    recentGain: z.number().nullable(),
    sessions: z.number(),
  })
  .passthrough();

export type TierAssessment = z.infer<typeof TierAssessmentSchema>;

export const StrengthTargetSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    baselineE1RM: z.number(),
    targetE1RM: z.number(),
    tier: LiftTierSchema,
    ratePer4Weeks: z.number(),
    horizonWeeks: z.number(),
    assessment: TierAssessmentSchema,
  })
  .passthrough();

export type StrengthTarget = z.infer<typeof StrengthTargetSchema>;

export const TargetExplanationSchema = z
  .object({
    headline: z.string(),
    tier: LiftTierSchema,
    tierLabel: z.string(),
    why: z.array(z.string()),
    method: z.string(),
    caveat: z.string(),
  })
  .passthrough();

export type TargetExplanation = z.infer<typeof TargetExplanationSchema>;

export const TopSetSchema = z
  .object({
    name: z.string(),
    weight: z.number(),
    reps: z.number(),
    e1RM: z.number(),
  })
  .passthrough();

export type TopSet = z.infer<typeof TopSetSchema>;

export const WeekTrainingMetricsSchema = z
  .object({
    sessions: z.number(),
    sets: z.number(),
    reps: z.number(),
    volume: z.number(),
    workSeconds: z.number(),
    topSet: TopSetSchema.nullable(),
    exercises: z.number(),
    hasWeightedWork: z.boolean(),
  })
  .passthrough();

export type WeekTrainingMetrics = z.infer<typeof WeekTrainingMetricsSchema>;

export const TrainingGoalViewSchema = z
  .object({
    status: z.enum(['none', 'active']),
    startedAt: z.string().nullable(),
    target: TrainingGoalTargetSchema,
    thisWeek: TrainingThisWeekSchema,
    avgLast4: z.number().nullable(),
    weeklyCounts: z.array(z.number()),
    baseline: TrainingBaselineSchema,
    lifts: z.array(LiftProgressSchema),
    suggestedLifts: z.array(StrengthTargetSchema),
    hasLiftTargets: z.boolean(),
    liftRationales: z.record(z.string(), TargetExplanationSchema),
    week: WeekTrainingMetricsSchema,
    unit: z.enum(['lbs', 'kg']),
    suggestion: GoalSuggestionSchema,
  })
  .passthrough();

export type TrainingGoalView = z.infer<typeof TrainingGoalViewSchema>;

export const GoalProgressResponseSchema = z
  .object({
    todayKey: z.string(),
    nutrition: NutritionGoalViewSchema,
    training: TrainingGoalViewSchema,
  })
  .passthrough();

export type GoalProgressResponse = z.infer<typeof GoalProgressResponseSchema>;

export const GoalUpdateNutritionRequestSchema = z.object({
  pillar: z.literal('nutrition'),
  paceKgPerWeek: z.number().optional(),
  adherence: z
    .object({
      logDaysPerWeek: z.number().optional(),
      proteinDaysPerWeek: z.number().optional(),
    })
    .optional(),
  tz: z.number().optional(),
});

export type GoalUpdateNutritionRequest = z.infer<
  typeof GoalUpdateNutritionRequestSchema
>;

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

// ---------------------------------------------------------------------------
// GET /api/progress
// ---------------------------------------------------------------------------

export const ProgressDataPointSchema = z
  .object({
    date: z.string(),
    value: z.number(),
  })
  .passthrough();

export type ProgressDataPoint = z.infer<typeof ProgressDataPointSchema>;

export const ProgressStatsSchema = z
  .object({
    streakDays: z.number(),
    totalWorkouts: z.number(),
    thisWeekWorkouts: z.number(),
    goalProgress: z.number(),
  })
  .passthrough();

export type ProgressStats = z.infer<typeof ProgressStatsSchema>;

export const ProgressGoalSummarySchema = z
  .object({
    fitnessGoal: z.string().nullable(),
    nutritionDirection: z.string().nullable(),
    targetWeightKg: z.number().nullable(),
    startWeightKg: z.number().nullable(),
    weeklyAvailability: z.number().nullable(),
    weightUnit: z.enum(['kg', 'lbs']).optional(),
    pace: z.number().nullable(),
  })
  .passthrough();

export type ProgressGoalSummary = z.infer<typeof ProgressGoalSummarySchema>;

export const ProgressCurrentProgramSchema = z
  .object({
    programId: z.string(),
    name: z.string(),
    currentPhase: z.number(),
    currentWeek: z.number(),
    totalWeeks: z.number(),
    completedWorkouts: z.number(),
    totalWorkouts: z.number(),
    nextWorkout: z.string(),
    nextWorkoutDay: z.string().optional(),
  })
  .passthrough();

export type ProgressCurrentProgram = z.infer<
  typeof ProgressCurrentProgramSchema
>;

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

export const ProgressWeeklyVolumeSchema = z
  .object({
    week: z.string(),
    volume: z.number(),
    workouts: z.number(),
  })
  .passthrough();

export type ProgressWeeklyVolume = z.infer<typeof ProgressWeeklyVolumeSchema>;

export const ProgressApiResponseSchema = z
  .object({
    weightData: z.array(ProgressDataPointSchema),
    bmiData: z.array(ProgressDataPointSchema),
    bodyFatData: z.array(ProgressDataPointSchema).optional(),
    leanMassData: z.array(ProgressDataPointSchema).optional(),
    moodData: z.array(ProgressDataPointSchema),
    currentProgram: ProgressCurrentProgramSchema.nullable(),
    stats: ProgressStatsSchema,
    goal: ProgressGoalSummarySchema.optional(),
    longestStreak: z.number().optional(),
    pbs: z.array(ProgressExercisePRSchema).optional(),
    recentWorkouts: z.array(z.unknown()).optional(),
    detailedWorkouts: z.array(z.unknown()).optional(),
    weeklyVolume: z.array(ProgressWeeklyVolumeSchema).optional(),
    totalVolumeLbs: z.number().optional(),
    targetWeightLbs: z.number().nullable().optional(),
    weeklyAvailability: z.number().nullable().optional(),
  })
  .passthrough();

export type ProgressApiResponse = z.infer<typeof ProgressApiResponseSchema>;
