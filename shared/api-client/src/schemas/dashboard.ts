import { z } from 'zod';

// ===========================================================================
// DASHBOARD — the wire contract for the unified dashboard routes (NP-023)
//
// Layout: GET|PATCH /api/dashboard/layout
// Tiles: GET /api/dashboard/tiles
// Tap: POST /api/dashboard/tile-tap
// Dismiss: POST /api/suggestions/dismiss
// Program Nudge: GET|POST /api/program-nudge
// Goals: GET|PUT /api/goals
// Progress: GET /api/progress
// ===========================================================================

// ---------------------------------------------------------------------------
// 1. Layout (/api/dashboard/layout)
// ---------------------------------------------------------------------------

export const DASHBOARD_TILE_KINDS = ['stat', 'metric', 'smart-rotating'] as const;
export const DashboardTileKindSchema = z.enum(DASHBOARD_TILE_KINDS);
export type DashboardTileKind = (typeof DASHBOARD_TILE_KINDS)[number];

export const DASHBOARD_TILE_SIZES = ['1x1', '2x1'] as const;
export const DashboardTileSizeSchema = z.enum(DASHBOARD_TILE_SIZES);
export type DashboardTileSize = (typeof DASHBOARD_TILE_SIZES)[number];

export const MAX_DASHBOARD_TILES = 20;
export const SMART_INTERVAL_OPTIONS_MS = [4000, 6000, 10000, 30000] as const;
export const DEFAULT_SMART_INTERVAL_MS = 6000;
export const MAX_SMART_POOL = 20;

export const DashboardTileSettingsSchema = z
  .object({
    pool: z.array(z.string()).max(MAX_SMART_POOL).optional(),
    intervalMs: z.number().positive().optional(),
  })
  .passthrough();

export const DashboardTileSchema = z
  .object({
    id: z.string().min(1),
    kind: DashboardTileKindSchema,
    size: DashboardTileSizeSchema,
    locked: z.string().min(1).nullable().optional(),
    settings: DashboardTileSettingsSchema.optional(),
  })
  .passthrough();

export const DashboardLayoutSchema = z.array(DashboardTileSchema).max(MAX_DASHBOARD_TILES);
export type DashboardTileSettings = z.infer<typeof DashboardTileSettingsSchema>;
export type DashboardTile = z.infer<typeof DashboardTileSchema>;
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
export type DashboardLayoutPatchRequest = z.infer<typeof DashboardLayoutPatchRequestSchema>;

export const DashboardLayoutPatchResponseSchema = z
  .object({
    success: z.literal(true),
    layout: DashboardLayoutSchema,
  })
  .passthrough();
export type DashboardLayoutPatchResponse = z.infer<typeof DashboardLayoutPatchResponseSchema>;

// ---------------------------------------------------------------------------
// 2. Dashboard Tiles & Tap & Dismiss
// ---------------------------------------------------------------------------

export const DashboardScoreBreakdownSchema = z
  .object({
    freshness: z.number(),
    signalStrength: z.number(),
    recencySinceLastShown: z.number(),
    goalWeight: z.number(),
  })
  .passthrough();

export const DashboardRotatorMetricTileSchema = z
  .object({
    kind: z.literal('metric'),
    tileId: z.string(),
    score: z.number(),
    pinned: z.boolean(),
    breakdown: DashboardScoreBreakdownSchema,
  })
  .passthrough();

export const DashboardRotatorSuggestionTileSchema = z
  .object({
    kind: z.literal('suggestion'),
    suggestionId: z.string(),
    score: z.number(),
    pinned: z.boolean(),
    breakdown: DashboardScoreBreakdownSchema,
  })
  .passthrough();

export const DashboardRotatorTileSchema = z.discriminatedUnion('kind', [
  DashboardRotatorMetricTileSchema,
  DashboardRotatorSuggestionTileSchema,
]);
export type DashboardRotatorTile = z.infer<typeof DashboardRotatorTileSchema>;

export const DashboardMetricDataPointSchema = z
  .object({
    t: z.string().or(z.date()),
    value: z.number(),
    label: z.string().optional(),
  })
  .passthrough();
export type DashboardMetricDataPoint = z.infer<typeof DashboardMetricDataPointSchema>;

export const DashboardMetricSummarySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    unit: z.string(),
    domain: z.string(),
    trendDirection: z.string(),
    latest: DashboardMetricDataPointSchema.nullable().optional(),
    data: z.array(DashboardMetricDataPointSchema),
    error: z.string().optional(),
  })
  .passthrough();
export type DashboardMetricSummary = z.infer<typeof DashboardMetricSummarySchema>;

export const DashboardSuggestionSchema = z
  .object({
    id: z.string(),
    severity: z.enum(['info', 'nudge', 'warning', 'celebration']).or(z.string()),
    title: z.string(),
    body: z.string(),
    placement: z.enum(['dashboard', 'exercise']).or(z.string()).optional(),
    primaryAction: z
      .object({
        label: z.string(),
        href: z.string(),
      })
      .passthrough()
      .optional(),
    dismissible: z.boolean(),
    cooldownDays: z.number().optional(),
    source: z.enum(['workout', 'nutrition', 'mindset']).or(z.string()),
    sourceData: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type DashboardSuggestion = z.infer<typeof DashboardSuggestionSchema>;

export const DashboardEngagementSchema = z
  .object({
    key: z.string(),
    taps: z.number(),
    lastTapAt: z.string().nullable(),
  })
  .passthrough();
export type DashboardEngagement = z.infer<typeof DashboardEngagementSchema>;

export const DashboardTilesResponseSchema = z
  .object({
    tiles: z.array(DashboardRotatorTileSchema),
    metrics: z.array(DashboardMetricSummarySchema),
    suggestions: z.array(DashboardSuggestionSchema),
    engagement: z.array(DashboardEngagementSchema),
    now: z.string(),
  })
  .passthrough();
export type DashboardTilesResponse = z.infer<typeof DashboardTilesResponseSchema>;

export const DashboardTileTapRequestSchema = z.object({
  key: z.string(),
});
export type DashboardTileTapRequest = z.infer<typeof DashboardTileTapRequestSchema>;

export const DashboardTileTapResponseSchema = z
  .object({
    success: z.literal(true),
  })
  .passthrough();
export type DashboardTileTapResponse = z.infer<typeof DashboardTileTapResponseSchema>;

export const SuggestionDismissRequestSchema = z.object({
  id: z.string(),
});
export type SuggestionDismissRequest = z.infer<typeof SuggestionDismissRequestSchema>;

export const SuggestionDismissResponseSchema = z
  .object({
    success: z.literal(true),
    id: z.string(),
    wasUpdate: z.boolean(),
    count: z.number(),
  })
  .passthrough();
export type SuggestionDismissResponse = z.infer<typeof SuggestionDismissResponseSchema>;

// ---------------------------------------------------------------------------
// 3. Program Nudge (/api/program-nudge)
// ---------------------------------------------------------------------------

export const PROGRAM_NUDGE_ACTIONS = [
  'shown',
  'dismiss',
  'dismiss_forever',
  'adopt',
] as const;
export const ProgramNudgeActionSchema = z.enum(PROGRAM_NUDGE_ACTIONS);
export type ProgramNudgeAction = (typeof PROGRAM_NUDGE_ACTIONS)[number];

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
    showings: z.number(),
    dismissCount: z.number(),
    dontShowAgain: z.boolean(),
    hasServerState: z.boolean(),
    reason: z.string().optional(),
  })
  .passthrough();
export type ProgramNudgeResponse = z.infer<typeof ProgramNudgeResponseSchema>;

export const ProgramNudgeActionResponseSchema = z
  .object({
    due: z.boolean(),
    showings: z.number(),
    dismissCount: z.number(),
    dontShowAgain: z.boolean(),
    hasServerState: z.boolean(),
    adopted: z.boolean().optional(),
    reason: z.string().optional(),
  })
  .passthrough();
export type ProgramNudgeActionResponse = z.infer<typeof ProgramNudgeActionResponseSchema>;

// ---------------------------------------------------------------------------
// 4. Goals (/api/goals)
// ---------------------------------------------------------------------------

export const GoalsPaceStatusSchema = z.enum(['ahead', 'on', 'behind', 'done', 'na']);
export type GoalsPaceStatus = z.infer<typeof GoalsPaceStatusSchema>;

export const GoalsPaceReadSchema = z
  .object({
    status: GoalsPaceStatusSchema.or(z.string()),
    expectedKg: z.number().nullable(),
    aheadByKg: z.number(),
    behindByKg: z.number(),
    etaWeeks: z.number().nullable(),
    remainingKg: z.number(),
    eta: z.string(),
    etaDate: z.string().nullable(),
  })
  .passthrough();
export type GoalsPaceRead = z.infer<typeof GoalsPaceReadSchema>;

export const GoalsAdherenceReadSchema = z
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
export type GoalsAdherenceRead = z.infer<typeof GoalsAdherenceReadSchema>;

export const GoalsSuggestionSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    sub: z.string(),
    severity: z.enum(['info', 'nudge', 'warn', 'good']).or(z.string()),
    url: z.string(),
  })
  .passthrough();
export type GoalsSuggestion = z.infer<typeof GoalsSuggestionSchema>;

export const NutritionGoalViewSchema = z
  .object({
    unit: z.enum(['lbs', 'kg']),
    status: z.enum(['none', 'active', 'achieved']),
    kind: z.enum(['weight', 'maintain']).nullable(),
    direction: z.enum(['lose', 'maintain', 'gain']).nullable(),
    startedAt: z.string().nullable(),
    achievedAt: z.string().nullable(),
    baseline: z
      .object({
        weight: z.number().nullable(),
        date: z.string().nullable(),
      })
      .passthrough(),
    journeyStart: z
      .object({
        weight: z.number().nullable(),
        date: z.string().nullable(),
      })
      .passthrough(),
    now: z
      .object({
        weight: z.number().nullable(),
        date: z.string().nullable(),
        fourWeeksAgo: z.number().nullable(),
      })
      .passthrough(),
    target: z
      .object({
        weight: z.number().nullable(),
        paceKgPerWeek: z.number().nullable(),
        pacePerWeek: z.number().nullable(),
        bandKg: z.number(),
      })
      .passthrough(),
    pace: GoalsPaceReadSchema.nullable(),
    adherence: GoalsAdherenceReadSchema.nullable(),
    proteinGoal: z.number().nullable(),
    suggestion: GoalsSuggestionSchema,
  })
  .passthrough();
export type NutritionGoalView = z.infer<typeof NutritionGoalViewSchema>;

export const TrainingPRSnapshotSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    e1RM: z.number(),
    weight: z.number().optional(),
    reps: z.number().optional(),
  })
  .passthrough();
export type TrainingPRSnapshot = z.infer<typeof TrainingPRSnapshotSchema>;

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

export const TierAssessmentSchema = z
  .object({
    tier: z.enum(['building', 'progressing', 'refining']).or(z.string()),
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
    tier: z.enum(['building', 'progressing', 'refining']).or(z.string()),
    ratePer4Weeks: z.number(),
    horizonWeeks: z.number(),
    assessment: TierAssessmentSchema,
  })
  .passthrough();
export type StrengthTarget = z.infer<typeof StrengthTargetSchema>;

export const TargetExplanationSchema = z
  .object({
    headline: z.string(),
    tier: z.enum(['building', 'progressing', 'refining']).or(z.string()),
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
    target: z
      .object({
        daysPerWeek: z.number().nullable(),
        programId: z.string().nullable(),
      })
      .passthrough(),
    thisWeek: z
      .object({
        done: z.number(),
        remaining: z.number(),
        chancesLeft: z.number(),
        weekLost: z.boolean(),
      })
      .passthrough(),
    avgLast4: z.number().nullable(),
    weeklyCounts: z.array(z.number()),
    baseline: z
      .object({
        daysPerWeek: z.number().nullable(),
        date: z.string().nullable(),
        prs: z.array(TrainingPRSnapshotSchema),
      })
      .passthrough(),
    lifts: z.array(LiftProgressSchema),
    suggestedLifts: z.array(StrengthTargetSchema),
    hasLiftTargets: z.boolean(),
    liftRationales: z.record(z.string(), TargetExplanationSchema),
    week: WeekTrainingMetricsSchema,
    unit: z.enum(['lbs', 'kg']),
    suggestion: GoalsSuggestionSchema,
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

export const GoalsQuerySchema = z.object({
  tz: z.number().int().optional(),
});
export type GoalsQuery = z.infer<typeof GoalsQuerySchema>;

export const GoalsNutritionUpdateRequestSchema = z.object({
  pillar: z.literal('nutrition'),
  paceKgPerWeek: z.number().optional(),
  adherence: z
    .object({
      logDaysPerWeek: z.number().optional(),
      proteinDaysPerWeek: z.number().optional(),
    })
    .passthrough()
    .optional(),
  tz: z.number().int().optional(),
  tzZone: z.string().optional(),
});
export type GoalsNutritionUpdateRequest = z.infer<
  typeof GoalsNutritionUpdateRequestSchema
>;

export const GoalsTrainingUpdateRequestSchema = z.object({
  pillar: z.literal('training'),
  daysPerWeek: z.number().optional(),
  lifts: z
    .union([
      z.literal('suggested'),
      z.array(
        z
          .object({
            slug: z.string(),
            name: z.string().optional(),
            baselineE1RM: z.number().optional(),
            targetE1RM: z.number(),
          })
          .passthrough(),
      ),
    ])
    .optional(),
  tz: z.number().int().optional(),
  tzZone: z.string().optional(),
});
export type GoalsTrainingUpdateRequest = z.infer<
  typeof GoalsTrainingUpdateRequestSchema
>;

export const GoalsUpdateRequestSchema = z.discriminatedUnion('pillar', [
  GoalsNutritionUpdateRequestSchema,
  GoalsTrainingUpdateRequestSchema,
]);
export type GoalsUpdateRequest = z.infer<typeof GoalsUpdateRequestSchema>;

// ---------------------------------------------------------------------------
// 5. Progress (/api/progress)
// ---------------------------------------------------------------------------

export const ProgressDataPointSchema = z
  .object({
    date: z.string(),
    value: z.number(),
  })
  .passthrough();
export type ProgressDataPoint = z.infer<typeof ProgressDataPointSchema>;

export const ProgressCurrentProgramSchema = z
  .object({
    programId: z.string(),
    name: z.string().optional(),
    currentPhase: z.number().optional(),
    currentWeek: z.number().optional(),
    totalWeeks: z.number().optional(),
    completedWorkouts: z.number().optional(),
    totalWorkouts: z.number().optional(),
    nextWorkout: z.string().optional(),
    nextWorkoutDay: z.string().optional(),
  })
  .passthrough();
export type ProgressCurrentProgram = z.infer<typeof ProgressCurrentProgramSchema>;

export const ProgressStatsSchema = z
  .object({
    streakDays: z.number().optional(),
    totalWorkouts: z.number().optional(),
    thisWeekWorkouts: z.number().optional(),
    goalProgress: z.number().optional(),
  })
  .passthrough();
export type ProgressStats = z.infer<typeof ProgressStatsSchema>;

export const ProgressGoalPaceSchema = z
  .object({
    kgPerWeek: z.number().nullable(),
    status: z.enum(['ahead', 'on', 'behind', 'done', 'na']).or(z.string()),
    etaWeeks: z.number().nullable(),
    eta: z.string(),
    behindByKg: z.number(),
  })
  .passthrough();
export type ProgressGoalPace = z.infer<typeof ProgressGoalPaceSchema>;

export const ProgressGoalSchema = z
  .object({
    fitnessGoal: z.string().nullable().optional(),
    nutritionDirection: z.string().nullable().optional(),
    targetWeightKg: z.number().nullable().optional(),
    startWeightKg: z.number().nullable().optional(),
    weeklyAvailability: z.number().nullable().optional(),
    weightUnit: z.string().optional(),
    pace: ProgressGoalPaceSchema.nullable().optional(),
  })
  .passthrough();
export type ProgressGoal = z.infer<typeof ProgressGoalSchema>;

export const ProgressPBSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    weight: z.number(),
    reps: z.number(),
    date: z.string(),
  })
  .passthrough();
export type ProgressPB = z.infer<typeof ProgressPBSchema>;

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
    goal: ProgressGoalSchema.optional(),
    longestStreak: z.number().optional(),
    pbs: z.array(ProgressPBSchema).optional(),
    recentWorkouts: z.array(ProgressRecentWorkoutSchema).optional(),
    detailedWorkouts: z.array(z.record(z.string(), z.unknown())).optional(),
    weeklyVolume: z.array(ProgressWeeklyVolumeSchema).optional(),
    totalVolumeLbs: z.number().optional(),
    targetWeightLbs: z.number().nullable().optional(),
    weeklyAvailability: z.number().nullable().optional(),
  })
  .passthrough();
export type ProgressApiResponse = z.infer<typeof ProgressApiResponseSchema>;

export const ProgressQuerySchema = z.object({
  tz: z.number().int().optional(),
  detailed: z.union([z.literal('1'), z.literal(1)]).optional(),
});
export type ProgressQuery = z.infer<typeof ProgressQuerySchema>;
