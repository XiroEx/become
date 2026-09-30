// Run with: npx tsx --test tests/dashboardSchemas.test.ts
//
// NP-023 — the dashboard domain (layout, tiles, suggestions, program nudge,
// goals and progress).
//
// These are fixtures matching the beta channel responses, proving the wire
// contracts are internally coherent and match what the routes return.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_KINDS,
  TILE_SIZES,
  MAX_DASHBOARD_TILES,
  SMART_INTERVAL_OPTIONS_MS,
  DashboardTileSchema,
  DashboardLayoutSchema,
  DashboardLayoutResponseSchema,
  DashboardLayoutPatchRequestSchema,
  DashboardLayoutPatchResponseSchema,
  DashboardTilesResponseSchema,
  DashboardTileTapRequestSchema,
  DashboardTileTapResponseSchema,
  SuggestionDismissRequestSchema,
  SuggestionDismissResponseSchema,
  ProgramNudgeRequestSchema,
  ProgramNudgeResponseSchema,
  GoalProgressResponseSchema,
  GoalUpdateRequestSchema,
  ProgressApiResponseSchema,
} from '../src/index';

// ---------------------------------------------------------------------------
// Beta fixtures
// ---------------------------------------------------------------------------

const BETA_GET_DASHBOARD_LAYOUT = {
  layout: [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '1x1' },
    { id: 'weekly', kind: 'stat', size: '1x1' },
    { id: 'goal', kind: 'stat', size: '1x1' },
    {
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      locked: null,
      settings: {
        pool: ['stat:streak', 'stat:mood', 'stat:weekly', 'stat:workouts'],
        intervalMs: 6000,
      },
    },
  ],
};

const BETA_PATCH_DASHBOARD_LAYOUT_REQUEST = {
  layout: [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '1x1' },
    { id: 'smart', kind: 'smart-rotating', size: '2x1', locked: 'stat:streak' },
  ],
};

const BETA_PATCH_DASHBOARD_LAYOUT_RESPONSE = {
  success: true,
  layout: [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '1x1' },
    { id: 'smart', kind: 'smart-rotating', size: '2x1', locked: 'stat:streak' },
  ],
};

const BETA_GET_DASHBOARD_TILES = {
  tiles: [
    {
      kind: 'metric',
      tileId: 'strength-prs-timeline',
      score: 0.85,
      pinned: true,
      breakdown: {
        freshness: 1,
        signalStrength: 0.8,
        recencySinceLastShown: 1,
        goalWeight: 1.2,
      },
    },
    {
      kind: 'suggestion',
      suggestionId: 'workout-plateau',
      score: 0.72,
      pinned: false,
      breakdown: {
        freshness: 0.9,
        signalStrength: 0.9,
        recencySinceLastShown: 0.8,
        goalWeight: 1.0,
      },
    },
  ],
  metrics: [
    {
      id: 'strength-prs-timeline',
      label: 'PRs Timeline',
      unit: 'PRs',
      domain: 'workout',
      trendDirection: 'up-good',
      latest: {
        t: '2026-09-29T10:00:00.000Z',
        value: 4,
        label: 'Bench Press',
      },
      data: [
        {
          t: '2026-09-15T10:00:00.000Z',
          value: 2,
        },
        {
          t: '2026-09-29T10:00:00.000Z',
          value: 4,
          label: 'Bench Press',
        },
      ],
    },
  ],
  suggestions: [
    {
      id: 'workout-plateau',
      severity: 'warning',
      title: 'Bench Press Plateau Detected',
      body: 'Your estimated 1RM has stayed at 225 lbs for 4 consecutive weeks. Try a deload week.',
      placement: 'dashboard',
      primaryAction: {
        label: 'View Recommendations',
        href: '/dashboard/workouts',
      },
      dismissible: true,
      cooldownDays: 14,
      source: 'workout',
      sourceData: {
        exerciseSlug: 'barbell-bench-press',
      },
    },
  ],
  engagement: [
    {
      key: 'stat:streak',
      taps: 12,
      lastTapAt: '2026-09-29T18:30:00.000Z',
    },
  ],
  now: '2026-09-30T06:00:00.000Z',
};

const BETA_POST_DASHBOARD_TILE_TAP_REQUEST = {
  key: 'stat:streak',
};

const BETA_POST_DASHBOARD_TILE_TAP_RESPONSE = {
  success: true,
};

const BETA_POST_SUGGESTIONS_DISMISS_REQUEST = {
  id: 'workout-plateau',
};

const BETA_POST_SUGGESTIONS_DISMISS_RESPONSE = {
  success: true,
  id: 'workout-plateau',
  wasUpdate: false,
  count: 1,
};

const BETA_GET_PROGRAM_NUDGE = {
  due: true,
  showings: 1,
  dismissCount: 0,
  dontShowAgain: false,
  hasServerState: true,
};

const BETA_POST_PROGRAM_NUDGE_REQUEST = {
  action: 'dismiss',
  dismissCount: 1,
  shownCount: 1,
  lastDismissedAt: '2026-09-30T06:00:00.000Z',
  lastShownAt: '2026-09-30T06:00:00.000Z',
  dontShowAgain: false,
};

const BETA_POST_PROGRAM_NUDGE_RESPONSE = {
  due: false,
  showings: 1,
  dismissCount: 1,
  dontShowAgain: false,
  hasServerState: true,
  adopted: false,
};

const BETA_GET_GOALS = {
  todayKey: '2026-09-30',
  nutrition: {
    unit: 'lbs',
    status: 'active',
    kind: 'weight',
    direction: 'lose',
    startedAt: '2026-08-01T00:00:00.000Z',
    achievedAt: null,
    baseline: {
      weight: 195.5,
      date: '2026-08-01T00:00:00.000Z',
    },
    journeyStart: {
      weight: 198.0,
      date: '2026-07-15T00:00:00.000Z',
    },
    now: {
      weight: 188.2,
      date: '2026-09-29T00:00:00.000Z',
      fourWeeksAgo: 191.0,
    },
    target: {
      weight: 180.0,
      paceKgPerWeek: 0.45359237,
      pacePerWeek: 1.0,
      bandKg: 0.9,
    },
    pace: {
      status: 'on',
      expectedKg: 85.0,
      aheadByKg: 0.2,
      behindByKg: 0,
      etaWeeks: 8,
      remainingKg: 3.7,
      eta: '8 weeks',
      etaDate: '2026-11-25T00:00:00.000Z',
    },
    adherence: {
      logDays: 6,
      proteinDays: 5,
      totalDays: 7,
      logTarget: 6,
      proteinTarget: 5,
      logOk: true,
      proteinOk: true,
      proteinJudged: true,
    },
    proteinGoal: 160,
    suggestion: {
      key: 'nutrition-on-track',
      title: 'Nutrition on Track',
      sub: 'Hit your protein target 5 days this week',
      severity: 'good',
      url: '/nutrition',
    },
  },
  training: {
    status: 'active',
    startedAt: '2026-08-01T00:00:00.000Z',
    target: {
      daysPerWeek: 4,
      programId: 'strength-foundation',
    },
    thisWeek: {
      done: 2,
      remaining: 2,
      chancesLeft: 4,
      weekLost: false,
    },
    avgLast4: 3.8,
    weeklyCounts: [4, 4, 3, 4],
    baseline: {
      daysPerWeek: 3,
      date: '2026-08-01T00:00:00.000Z',
      prs: [
        {
          slug: 'barbell-back-squat',
          name: 'Barbell Back Squat',
          e1RM: 315,
          weight: 275,
          reps: 5,
        },
      ],
    },
    lifts: [
      {
        slug: 'barbell-back-squat',
        name: 'Barbell Back Squat',
        then: 315,
        now: 335,
        delta: 20,
        pct: 6.3,
        target: 350,
        toTargetPct: 57.1,
        remaining: 15,
        reached: false,
      },
    ],
    suggestedLifts: [
      {
        slug: 'barbell-back-squat',
        name: 'Barbell Back Squat',
        baselineE1RM: 335,
        targetE1RM: 350,
        tier: 'progressing',
        ratePer4Weeks: 0.02,
        horizonWeeks: 8,
        assessment: {
          tier: 'progressing',
          weeksLogged: 12,
          recentGain: 0.03,
          sessions: 24,
        },
      },
    ],
    hasLiftTargets: true,
    liftRationales: {
      'barbell-back-squat': {
        headline: '350 lbs over the next 8 weeks',
        tier: 'progressing',
        tierLabel: 'Progressing',
        why: ['24 logged sessions', 'Steady 2% gain per month'],
        method: 'Plate progression',
        caveat: 'Assumes consistent training',
      },
    },
    week: {
      sessions: 2,
      sets: 16,
      reps: 110,
      volume: 18500,
      workSeconds: 0,
      topSet: {
        name: 'Barbell Back Squat',
        weight: 295,
        reps: 5,
        e1RM: 342,
      },
      exercises: 4,
      hasWeightedWork: true,
    },
    unit: 'lbs',
    suggestion: {
      key: 'training-schedule',
      title: '2 Workouts Remaining',
      sub: '4 days left in the week to hit your 4-day goal',
      severity: 'nudge',
      url: '/schedule',
    },
  },
};

const BETA_PUT_GOALS_NUTRITION_REQUEST = {
  pillar: 'nutrition',
  paceKgPerWeek: 0.45359237,
  adherence: {
    logDaysPerWeek: 6,
    proteinDaysPerWeek: 5,
  },
  tz: 0,
};

const BETA_PUT_GOALS_TRAINING_REQUEST = {
  pillar: 'training',
  daysPerWeek: 4,
  lifts: 'suggested',
  tz: 0,
};

const BETA_GET_PROGRESS = {
  weightData: [
    { date: 'Sep 1', value: 195.0 },
    { date: 'Sep 8', value: 193.5 },
    { date: 'Sep 15', value: 191.8 },
    { date: 'Sep 22', value: 190.2 },
    { date: 'Sep 29', value: 188.5 },
  ],
  bmiData: [
    { date: 'Sep 1', value: 27.2 },
    { date: 'Sep 29', value: 26.3 },
  ],
  bodyFatData: [
    { date: 'Sep 1', value: 18.5 },
    { date: 'Sep 29', value: 17.2 },
  ],
  leanMassData: [
    { date: 'Sep 1', value: 158.9 },
    { date: 'Sep 29', value: 156.1 },
  ],
  moodData: [
    { date: 'Sep 28', value: 4 },
    { date: 'Sep 29', value: 5 },
    { date: 'Sep 30', value: 4 },
  ],
  currentProgram: {
    programId: 'strength-foundation',
    name: 'Strength Foundation',
    currentPhase: 1,
    currentWeek: 3,
    totalWeeks: 12,
    completedWorkouts: 10,
    totalWorkouts: 48,
    nextWorkout: 'Upper Body Power',
    nextWorkoutDay: 'Day 3',
  },
  stats: {
    streakDays: 14,
    totalWorkouts: 42,
    thisWeekWorkouts: 2,
    goalProgress: 21,
  },
  goal: {
    fitnessGoal: 'gain_muscle',
    nutritionDirection: 'lose',
    targetWeightKg: 81.6,
    startWeightKg: 88.5,
    weeklyAvailability: 4,
    weightUnit: 'lbs',
    pace: 1.0,
  },
  longestStreak: 28,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GET /api/dashboard/layout parses with DashboardLayoutResponseSchema', () => {
  const parsed = DashboardLayoutResponseSchema.parse(BETA_GET_DASHBOARD_LAYOUT);
  assert.equal(parsed.layout.length, 5);
  assert.equal(parsed.layout[0]?.id, 'streak');
  assert.equal(parsed.layout[4]?.kind, 'smart-rotating');
  assert.equal(parsed.layout[4]?.settings?.intervalMs, 6000);
});

test('PATCH /api/dashboard/layout parses with request & response schemas', () => {
  const req = DashboardLayoutPatchRequestSchema.parse(BETA_PATCH_DASHBOARD_LAYOUT_REQUEST);
  assert.equal(req.layout.length, 3);

  const res = DashboardLayoutPatchResponseSchema.parse(BETA_PATCH_DASHBOARD_LAYOUT_RESPONSE);
  assert.equal(res.success, true);
  assert.equal(res.layout.length, 3);
});

test('GET /api/dashboard/tiles parses with DashboardTilesResponseSchema', () => {
  const parsed = DashboardTilesResponseSchema.parse(BETA_GET_DASHBOARD_TILES);
  assert.equal(parsed.tiles.length, 2);
  assert.equal(parsed.metrics.length, 1);
  assert.equal(parsed.metrics[0]?.id, 'strength-prs-timeline');
  assert.equal(parsed.suggestions.length, 1);
  assert.equal(parsed.suggestions[0]?.severity, 'warning');
  assert.equal(parsed.engagement.length, 1);
  assert.equal(parsed.engagement[0]?.key, 'stat:streak');
});

test('POST /api/dashboard/tile-tap parses with request & response schemas', () => {
  const req = DashboardTileTapRequestSchema.parse(BETA_POST_DASHBOARD_TILE_TAP_REQUEST);
  assert.equal(req.key, 'stat:streak');

  const res = DashboardTileTapResponseSchema.parse(BETA_POST_DASHBOARD_TILE_TAP_RESPONSE);
  assert.equal(res.success, true);
});

test('POST /api/suggestions/dismiss parses with request & response schemas', () => {
  const req = SuggestionDismissRequestSchema.parse(BETA_POST_SUGGESTIONS_DISMISS_REQUEST);
  assert.equal(req.id, 'workout-plateau');

  const res = SuggestionDismissResponseSchema.parse(BETA_POST_SUGGESTIONS_DISMISS_RESPONSE);
  assert.equal(res.success, true);
  assert.equal(res.count, 1);
});

test('GET /api/program-nudge & POST /api/program-nudge parse with nudge schemas', () => {
  const getRes = ProgramNudgeResponseSchema.parse(BETA_GET_PROGRAM_NUDGE);
  assert.equal(getRes.due, true);
  assert.equal(getRes.showings, 1);

  const postReq = ProgramNudgeRequestSchema.parse(BETA_POST_PROGRAM_NUDGE_REQUEST);
  assert.equal(postReq.action, 'dismiss');

  const postRes = ProgramNudgeResponseSchema.parse(BETA_POST_PROGRAM_NUDGE_RESPONSE);
  assert.equal(postRes.due, false);
  assert.equal(postRes.adopted, false);
});

test('GET /api/goals & PUT /api/goals parse with GoalProgressResponseSchema & GoalUpdateRequestSchema', () => {
  const getRes = GoalProgressResponseSchema.parse(BETA_GET_GOALS);
  assert.equal(getRes.todayKey, '2026-09-30');
  assert.equal(getRes.nutrition.status, 'active');
  assert.equal(getRes.training.status, 'active');

  const putReqNutrition = GoalUpdateRequestSchema.parse(BETA_PUT_GOALS_NUTRITION_REQUEST);
  assert.equal(putReqNutrition.pillar, 'nutrition');

  const putReqTraining = GoalUpdateRequestSchema.parse(BETA_PUT_GOALS_TRAINING_REQUEST);
  assert.equal(putReqTraining.pillar, 'training');
});

test('GET /api/progress parses with ProgressApiResponseSchema (both summary and empty)', () => {
  const full = ProgressApiResponseSchema.parse(BETA_GET_PROGRESS);
  assert.equal(full.weightData.length, 5);
  assert.equal(full.moodData.length, 3);
  assert.equal(full.stats.streakDays, 14);
  assert.equal(full.currentProgram?.programId, 'strength-foundation');
  assert.equal(full.goal?.fitnessGoal, 'gain_muscle');

  // Empty progress (brand new user)
  const empty = ProgressApiResponseSchema.parse({
    weightData: [],
    bmiData: [],
    moodData: [],
    currentProgram: null,
    stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 },
  });
  assert.equal(empty.currentProgram, null);
  assert.equal(empty.stats.streakDays, 0);
});

test('DashboardLayoutSchema enforces the 20-tile limit', () => {
  const twentyTiles = Array.from({ length: 20 }, (_, i) => ({
    id: `tile-${i}`,
    kind: 'stat',
    size: '1x1',
  }));
  assert.equal(DashboardLayoutSchema.parse(twentyTiles).length, 20);

  const twentyOneTiles = Array.from({ length: 21 }, (_, i) => ({
    id: `tile-${i}`,
    kind: 'stat',
    size: '1x1',
  }));
  assert.throws(() => DashboardLayoutSchema.parse(twentyOneTiles));
});

test('DashboardTileSchema rejects invalid kind, size, and intervalMs', () => {
  assert.throws(() =>
    DashboardTileSchema.parse({ id: 'bad-kind', kind: 'unknown', size: '1x1' }),
  );
  assert.throws(() =>
    DashboardTileSchema.parse({ id: 'bad-size', kind: 'stat', size: '3x3' }),
  );
  assert.throws(() =>
    DashboardTileSchema.parse({
      id: 'bad-interval',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { intervalMs: 5000 },
    }),
  );
});

test('tile kinds, sizes, interval options and limit constants match expected values', () => {
  assert.deepEqual([...TILE_KINDS], ['stat', 'metric', 'smart-rotating']);
  assert.deepEqual([...TILE_SIZES], ['1x1', '2x1']);
  assert.deepEqual([...SMART_INTERVAL_OPTIONS_MS], [4000, 6000, 10000, 30000]);
  assert.equal(MAX_DASHBOARD_TILES, 20);
});
