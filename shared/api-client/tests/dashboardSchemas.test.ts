// Run with: npx tsx --test tests/dashboardSchemas.test.ts
//
// NP-023: The dashboard domain schemas and beta fixtures.
//
// Verifies that beta fixtures for each dashboard route parse with the new schemas:
// - GET|PATCH /api/dashboard/layout
// - GET /api/dashboard/tiles
// - POST /api/dashboard/tile-tap
// - POST /api/suggestions/dismiss
// - GET|POST /api/program-nudge
// - GET|PUT /api/goals
// - GET /api/progress

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DASHBOARD_TILE_KINDS,
  DASHBOARD_TILE_SIZES,
  MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS,
  MAX_SMART_POOL,
  DashboardTileKindSchema,
  DashboardTileSizeSchema,
  DashboardTileSettingsSchema,
  DashboardTileSchema,
  DashboardLayoutSchema,
  DashboardLayoutResponseSchema,
  DashboardLayoutPatchRequestSchema,
  DashboardLayoutPatchResponseSchema,
  DashboardRotatorTileSchema,
  DashboardMetricSummarySchema,
  DashboardSuggestionSchema,
  DashboardEngagementSchema,
  DashboardTilesResponseSchema,
  DashboardTileTapRequestSchema,
  DashboardTileTapResponseSchema,
  SuggestionDismissRequestSchema,
  SuggestionDismissResponseSchema,
  PROGRAM_NUDGE_ACTIONS,
  ProgramNudgeActionSchema,
  ProgramNudgeRequestSchema,
  ProgramNudgeResponseSchema,
  ProgramNudgeActionResponseSchema,
  GoalProgressResponseSchema,
  GoalsQuerySchema,
  GoalsUpdateRequestSchema,
  GoalsNutritionUpdateRequestSchema,
  GoalsTrainingUpdateRequestSchema,
  NutritionGoalViewSchema,
  TrainingGoalViewSchema,
  ProgressApiResponseSchema,
  ProgressQuerySchema,
  ProgressGoalSchema,
  ProgressGoalPaceSchema,
} from '../src/index';

// ---------------------------------------------------------------------------
// 1. Layout Fixtures & Tests
// ---------------------------------------------------------------------------

const BETA_LAYOUT_FIXTURE = {
  layout: [
    {
      id: 'stat:streak',
      kind: 'stat',
      size: '1x1',
    },
    {
      id: 'stat:mood',
      kind: 'stat',
      size: '1x1',
    },
    {
      id: 'metric:weekly_volume',
      kind: 'metric',
      size: '2x1',
    },
    {
      id: 'smart-rotating',
      kind: 'smart-rotating',
      size: '1x1',
      locked: null,
      settings: {
        pool: ['stat:streak', 'stat:mood', 'metric:workout_duration'],
        intervalMs: 6000,
      },
    },
  ],
} as const;

test('GET /api/dashboard/layout beta fixture parses with DashboardLayoutResponseSchema', () => {
  const parsed = DashboardLayoutResponseSchema.parse(BETA_LAYOUT_FIXTURE);
  assert.equal(parsed.layout.length, 4);
  assert.equal(parsed.layout[0]?.kind, 'stat');
  assert.equal(parsed.layout[0]?.size, '1x1');
  assert.equal(parsed.layout[2]?.kind, 'metric');
  assert.equal(parsed.layout[2]?.size, '2x1');
  assert.equal(parsed.layout[3]?.kind, 'smart-rotating');
  assert.deepEqual(parsed.layout[3]?.settings?.pool, [
    'stat:streak',
    'stat:mood',
    'metric:workout_duration',
  ]);
  assert.equal(parsed.layout[3]?.settings?.intervalMs, 6000);
});

test('PATCH /api/dashboard/layout request & response parse with schemas', () => {
  const req = DashboardLayoutPatchRequestSchema.parse(BETA_LAYOUT_FIXTURE);
  assert.equal(req.layout.length, 4);

  const res = DashboardLayoutPatchResponseSchema.parse({
    success: true,
    layout: BETA_LAYOUT_FIXTURE.layout,
  });
  assert.equal(res.success, true);
  assert.equal(res.layout.length, 4);
});

test('DashboardLayoutSchema enforces 20-tile limit and valid kinds and sizes', () => {
  assert.deepEqual(DASHBOARD_TILE_KINDS, ['stat', 'metric', 'smart-rotating']);
  assert.deepEqual(DASHBOARD_TILE_SIZES, ['1x1', '2x1']);
  assert.equal(MAX_DASHBOARD_TILES, 20);
  assert.deepEqual(SMART_INTERVAL_OPTIONS_MS, [4000, 6000, 10000, 30000]);
  assert.equal(DEFAULT_SMART_INTERVAL_MS, 6000);
  assert.equal(MAX_SMART_POOL, 20);

  // 21 tiles must fail
  const tooManyTiles = Array.from({ length: 21 }, (_, i) => ({
    id: `tile-${i}`,
    kind: 'stat' as const,
    size: '1x1' as const,
  }));
  assert.equal(DashboardLayoutSchema.safeParse(tooManyTiles).success, false);

  // 20 tiles must pass
  const maxTiles = Array.from({ length: 20 }, (_, i) => ({
    id: `tile-${i}`,
    kind: 'stat' as const,
    size: '1x1' as const,
  }));
  assert.equal(DashboardLayoutSchema.safeParse(maxTiles).success, true);

  // Invalid kind or size must fail
  assert.equal(
    DashboardTileSchema.safeParse({ id: 'bad', kind: 'invalid', size: '1x1' }).success,
    false,
  );
  assert.equal(
    DashboardTileSchema.safeParse({ id: 'bad', kind: 'stat', size: '3x1' }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 2. Tiles, Tile-Tap & Dismiss Fixtures & Tests
// ---------------------------------------------------------------------------

const BETA_TILES_FIXTURE = {
  tiles: [
    {
      kind: 'metric',
      tileId: 'weekly_volume',
      score: 0.85,
      pinned: true,
      breakdown: {
        freshness: 0.9,
        signalStrength: 0.8,
        recencySinceLastShown: 1.0,
        goalWeight: 1.2,
      },
    },
    {
      kind: 'suggestion',
      suggestionId: 'workout-plateau',
      score: 0.72,
      pinned: false,
      breakdown: {
        freshness: 0.8,
        signalStrength: 0.9,
        recencySinceLastShown: 1.0,
        goalWeight: 1.0,
      },
    },
  ],
  metrics: [
    {
      id: 'weekly_volume',
      label: 'Weekly Volume',
      unit: 'lbs',
      domain: 'workout',
      trendDirection: 'up-good',
      latest: {
        t: '2026-09-30T10:00:00.000Z',
        value: 12500,
        label: '12.5k lbs',
      },
      data: [
        {
          t: '2026-09-23T10:00:00.000Z',
          value: 11200,
        },
        {
          t: '2026-09-30T10:00:00.000Z',
          value: 12500,
          label: '12.5k lbs',
        },
      ],
    },
  ],
  suggestions: [
    {
      id: 'workout-plateau',
      severity: 'warning',
      title: 'Bench Press plateau detected',
      body: 'You have been at 185 lbs for 3 consecutive weeks. Consider a deload or variation.',
      placement: 'dashboard',
      primaryAction: {
        label: 'Explore Variations',
        href: '/dashboard/exercises',
      },
      dismissible: true,
      cooldownDays: 7,
      source: 'workout',
      sourceData: {
        exerciseSlug: 'barbell-bench-press',
      },
    },
  ],
  engagement: [
    {
      key: 'stat:streak',
      taps: 14,
      lastTapAt: '2026-09-30T08:00:00.000Z',
    },
    {
      key: 'metric:weekly_volume',
      taps: 8,
      lastTapAt: null,
    },
  ],
  now: '2026-09-30T10:00:00.000Z',
} as const;

test('GET /api/dashboard/tiles beta fixture parses with DashboardTilesResponseSchema', () => {
  const parsed = DashboardTilesResponseSchema.parse(BETA_TILES_FIXTURE);
  assert.equal(parsed.tiles.length, 2);
  assert.equal(parsed.tiles[0]?.kind, 'metric');
  assert.equal(parsed.tiles[1]?.kind, 'suggestion');
  assert.equal(parsed.metrics.length, 1);
  assert.equal(parsed.metrics[0]?.id, 'weekly_volume');
  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.suggestions[0]?.severity, 'warning');
  assert.equal(parsed.engagement.length, 2);
  assert.equal(parsed.engagement[0]?.key, 'stat:streak');
  assert.equal(parsed.engagement[0]?.taps, 14);
});

test('POST /api/dashboard/tile-tap request & response parse with schemas', () => {
  const req = DashboardTileTapRequestSchema.parse({ key: 'stat:streak' });
  assert.equal(req.key, 'stat:streak');

  const res = DashboardTileTapResponseSchema.parse({ success: true });
  assert.equal(res.success, true);
});

test('POST /api/suggestions/dismiss request & response parse with schemas', () => {
  const req = SuggestionDismissRequestSchema.parse({ id: 'workout-plateau' });
  assert.equal(req.id, 'workout-plateau');

  const res = SuggestionDismissResponseSchema.parse({
    success: true,
    id: 'workout-plateau',
    wasUpdate: true,
    count: 3,
  });
  assert.equal(res.success, true);
  assert.equal(res.id, 'workout-plateau');
  assert.equal(res.wasUpdate, true);
  assert.equal(res.count, 3);
});

// ---------------------------------------------------------------------------
// 3. Program Nudge Fixtures & Tests
// ---------------------------------------------------------------------------

const BETA_NUDGE_FIXTURE = {
  due: true,
  showings: 1,
  dismissCount: 0,
  dontShowAgain: false,
  hasServerState: true,
} as const;

test('GET /api/program-nudge beta fixture parses with ProgramNudgeResponseSchema', () => {
  const parsed = ProgramNudgeResponseSchema.parse(BETA_NUDGE_FIXTURE);
  assert.equal(parsed.due, true);
  assert.equal(parsed.showings, 1);
  assert.equal(parsed.dismissCount, 0);
  assert.equal(parsed.dontShowAgain, false);
  assert.equal(parsed.hasServerState, true);
});

test('POST /api/program-nudge request & response parse with schemas', () => {
  assert.deepEqual(PROGRAM_NUDGE_ACTIONS, ['shown', 'dismiss', 'dismiss_forever', 'adopt']);

  for (const action of PROGRAM_NUDGE_ACTIONS) {
    const req = ProgramNudgeRequestSchema.parse({
      action,
      dismissCount: 1,
      shownCount: 2,
      lastDismissedAt: '2026-09-29T12:00:00.000Z',
      lastShownAt: '2026-09-30T09:00:00.000Z',
      dontShowAgain: false,
    });
    assert.equal(req.action, action);
  }

  const res = ProgramNudgeActionResponseSchema.parse({
    due: false,
    showings: 2,
    dismissCount: 1,
    dontShowAgain: false,
    hasServerState: true,
    adopted: false,
  });
  assert.equal(res.due, false);
  assert.equal(res.showings, 2);
  assert.equal(res.adopted, false);
});

// ---------------------------------------------------------------------------
// 4. Goals Fixtures & Tests
// ---------------------------------------------------------------------------

const BETA_GOALS_FIXTURE = {
  todayKey: '2026-09-30',
  nutrition: {
    unit: 'kg',
    status: 'active',
    kind: 'weight',
    direction: 'lose',
    startedAt: '2026-08-01T00:00:00.000Z',
    achievedAt: null,
    baseline: {
      weight: 85.0,
      date: '2026-08-01T00:00:00.000Z',
    },
    journeyStart: {
      weight: 85.0,
      date: '2026-08-01T00:00:00.000Z',
    },
    now: {
      weight: 81.2,
      date: '2026-09-29T00:00:00.000Z',
      fourWeeksAgo: 82.5,
    },
    target: {
      weight: 75.0,
      paceKgPerWeek: 0.5,
      pacePerWeek: 0.5,
      bandKg: 0.9,
    },
    pace: {
      status: 'on',
      expectedKg: 80.8,
      aheadByKg: 0.4,
      behindByKg: 0,
      etaWeeks: 12.4,
      remainingKg: 6.2,
      eta: '~12 wks',
      etaDate: '2026-12-25T00:00:00.000Z',
    },
    adherence: {
      logDays: 6,
      proteinDays: 5,
      totalDays: 7,
      logTarget: 5,
      proteinTarget: 5,
      logOk: true,
      proteinOk: true,
      proteinJudged: true,
    },
    proteinGoal: 160,
    suggestion: {
      key: 'nutrition.on-pace',
      title: 'On pace',
      sub: 'Same again next week.',
      severity: 'good',
      url: '/dashboard/nutrition',
    },
  },
  training: {
    status: 'active',
    startedAt: '2026-08-01T00:00:00.000Z',
    target: {
      daysPerWeek: 4,
      programId: 'hypertrophy-1',
    },
    thisWeek: {
      done: 2,
      remaining: 2,
      chancesLeft: 3,
      weekLost: false,
    },
    avgLast4: 3.8,
    weeklyCounts: [4, 4, 3, 4],
    baseline: {
      daysPerWeek: 4,
      date: '2026-08-01T00:00:00.000Z',
      prs: [
        {
          slug: 'bench-press',
          name: 'Bench Press',
          e1RM: 205,
          weight: 185,
          reps: 3,
        },
      ],
    },
    lifts: [
      {
        slug: 'bench-press',
        name: 'Bench Press',
        then: 205,
        now: 215,
        delta: 10,
        pct: 5,
        target: 225,
        toTargetPct: 50,
        remaining: 10,
        reached: false,
      },
    ],
    suggestedLifts: [
      {
        slug: 'bench-press',
        name: 'Bench Press',
        baselineE1RM: 215,
        targetE1RM: 225,
        tier: 'progressing',
        ratePer4Weeks: 0.015,
        horizonWeeks: 8,
        assessment: {
          tier: 'progressing',
          weeksLogged: 8,
          recentGain: 0.02,
          sessions: 12,
        },
      },
    ],
    hasLiftTargets: true,
    liftRationales: {
      'bench-press': {
        headline: '225 lbs over the next 8 weeks',
        tier: 'progressing',
        tierLabel: 'Progressing',
        why: ['Steady progress observed over recent weeks.'],
        method: 'Built from current estimated max.',
        caveat: 'Direction, not a guarantee.',
      },
    },
    week: {
      sessions: 2,
      sets: 16,
      reps: 160,
      volume: 18500,
      workSeconds: 0,
      topSet: {
        name: 'Bench Press',
        weight: 185,
        reps: 5,
        e1RM: 215,
      },
      exercises: 6,
      hasWeightedWork: true,
    },
    unit: 'lbs',
    suggestion: {
      key: 'training.on-track',
      title: '2 more this week',
      sub: '2/4 done — on track.',
      severity: 'good',
      url: '/dashboard/workout',
    },
  },
} as const;

test('GET /api/goals?tz beta fixture parses with GoalProgressResponseSchema', () => {
  const parsed = GoalProgressResponseSchema.parse(BETA_GOALS_FIXTURE);
  assert.equal(parsed.todayKey, '2026-09-30');
  assert.equal(parsed.nutrition.unit, 'kg');
  assert.equal(parsed.nutrition.target.weight, 75.0);
  assert.equal(parsed.nutrition.pace?.status, 'on');
  assert.equal(parsed.nutrition.adherence?.logOk, true);
  assert.equal(parsed.training.target.daysPerWeek, 4);
  assert.equal(parsed.training.lifts[0]?.slug, 'bench-press');
  assert.equal(parsed.training.week.sessions, 2);
});

test('PUT /api/goals update requests parse with GoalsUpdateRequestSchema', () => {
  const nutReq = GoalsUpdateRequestSchema.parse({
    pillar: 'nutrition',
    paceKgPerWeek: 0.5,
    adherence: {
      logDaysPerWeek: 5,
      proteinDaysPerWeek: 5,
    },
    tz: 240,
  });
  assert.equal(nutReq.pillar, 'nutrition');

  const trainReq = GoalsUpdateRequestSchema.parse({
    pillar: 'training',
    daysPerWeek: 4,
    lifts: 'suggested',
    tz: 240,
  });
  assert.equal(trainReq.pillar, 'training');

  const trainReqExplicit = GoalsUpdateRequestSchema.parse({
    pillar: 'training',
    daysPerWeek: 5,
    lifts: [
      {
        slug: 'bench-press',
        name: 'Bench Press',
        baselineE1RM: 200,
        targetE1RM: 225,
      },
    ],
  });
  assert.equal(trainReqExplicit.pillar, 'training');
});

// ---------------------------------------------------------------------------
// 5. Progress Fixtures & Tests (including the critical goal.pace object shape)
// ---------------------------------------------------------------------------

const BETA_PROGRESS_FIXTURE = {
  weightData: [
    { date: 'Sep 1', value: 185.0 },
    { date: 'Sep 15', value: 183.5 },
    { date: 'Sep 30', value: 181.2 },
  ],
  bmiData: [
    { date: 'Sep 1', value: 26.5 },
    { date: 'Sep 15', value: 26.3 },
    { date: 'Sep 30', value: 26.0 },
  ],
  bodyFatData: [
    { date: 'Sep 1', value: 20.5 },
    { date: 'Sep 30', value: 19.8 },
  ],
  leanMassData: [
    { date: 'Sep 1', value: 147.0 },
    { date: 'Sep 30', value: 145.3 },
  ],
  moodData: [
    { date: 'Sep 28', value: 4 },
    { date: 'Sep 29', value: 5 },
    { date: 'Sep 30', value: 4 },
  ],
  currentProgram: {
    programId: 'become-12-week',
    name: 'BECOME — 12 Week Fat-Loss Foundation',
    currentPhase: 1,
    currentWeek: 3,
    totalWeeks: 12,
    completedWorkouts: 8,
    totalWorkouts: 48,
    nextWorkout: 'Day 1 - Start Training',
    nextWorkoutDay: 'Day 1',
  },
  stats: {
    streakDays: 7,
    totalWorkouts: 15,
    thisWeekWorkouts: 2,
    goalProgress: 17,
  },
  goal: {
    fitnessGoal: 'lose_weight',
    nutritionDirection: 'lose',
    targetWeightKg: 75.0,
    startWeightKg: 85.0,
    weeklyAvailability: 4,
    weightUnit: 'kg',
    // KEY TEST: pace is an OBJECT returned by readNutritionGoalForTile, NOT a number
    pace: {
      kgPerWeek: 0.5,
      status: 'on',
      etaWeeks: 12.4,
      eta: '~12 wks',
      behindByKg: 0,
    },
  },
  longestStreak: 14,
} as const;

test('GET /api/progress beta fixture parses with ProgressApiResponseSchema (goal.pace is an object)', () => {
  const parsed = ProgressApiResponseSchema.parse(BETA_PROGRESS_FIXTURE);
  assert.equal(parsed.weightData.length, 3);
  assert.equal(parsed.bmiData.length, 3);
  assert.equal(parsed.moodData.length, 3);
  assert.equal(parsed.currentProgram?.programId, 'become-12-week');
  assert.equal(parsed.stats.streakDays, 7);
  assert.equal(parsed.longestStreak, 14);

  // Assert goal shape specifically
  assert.ok(parsed.goal);
  assert.equal(parsed.goal.fitnessGoal, 'lose_weight');
  assert.equal(parsed.goal.targetWeightKg, 75.0);
  assert.equal(parsed.goal.weightUnit, 'kg');

  // Assert goal.pace is the object with arithmetic and status
  assert.ok(parsed.goal.pace);
  assert.equal(parsed.goal.pace.kgPerWeek, 0.5);
  assert.equal(parsed.goal.pace.status, 'on');
  assert.equal(parsed.goal.pace.etaWeeks, 12.4);
  assert.equal(parsed.goal.pace.eta, '~12 wks');
  assert.equal(parsed.goal.pace.behindByKg, 0);
});

test('ProgressGoalSchema accepts null pace when member has no pace', () => {
  const parsed = ProgressGoalSchema.parse({
    fitnessGoal: 'maintain',
    nutritionDirection: 'maintain',
    targetWeightKg: null,
    startWeightKg: null,
    weeklyAvailability: null,
    weightUnit: 'lbs',
    pace: null,
  });
  assert.equal(parsed.pace, null);
});

test('ProgressGoalPaceSchema rejects a raw number for pace (the regression CI caught)', () => {
  // A raw number must NOT pass as ProgressGoalPaceSchema
  assert.equal(ProgressGoalPaceSchema.safeParse(0.5).success, false);
});
