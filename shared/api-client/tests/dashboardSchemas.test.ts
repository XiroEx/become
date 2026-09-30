// Run with: npx tsx --test tests/dashboardSchemas.test.ts
//
// NP-023 — the dashboard domain: layout, tiles, tile-tap, suggestion dismissal,
// the program nudge, goals and progress.
//
// WHAT THESE FIXTURES ARE. Each constant below is a beta-channel response body
// for the route it is named after, captured through the real handlers and
// trimmed to one representative row per collection. They prove the schemas are
// internally coherent and that the OPTIONAL fields are actually optional — the
// empty answers a brand-new member gets are fixtures too, because that is the
// shape a first-run native home screen has to survive.
//
// WHAT THEY ARE NOT. A hand-written fixture agrees with its schema by
// construction, so this file cannot tell you the ROUTE still answers this way.
// That is webapp/tests/unit/contract/np023Dashboard.test.ts's job: it calls the
// real exported handlers against a real database and parses what comes back.
// Both exist on purpose — this one runs in the `shared-api-client` job, which
// has neither the webapp nor a database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TILE_KINDS,
  TILE_SIZES,
  MAX_DASHBOARD_TILES,
  MAX_SMART_POOL,
  SMART_INTERVAL_OPTIONS_MS,
  DEFAULT_SMART_INTERVAL_MS,
  SMART_ROTATING_TILE_ID,
  STAT_TILE_IDS,
  TILE_KEY_REGEX,
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

/** GET /api/dashboard/layout — the first-run default, once customized. */
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

/** A brand-new member, before the lazy migration has anything to migrate. */
const BETA_GET_DASHBOARD_LAYOUT_EMPTY = { layout: [] };

const BETA_PATCH_DASHBOARD_LAYOUT_REQUEST = {
  layout: [
    { id: 'streak', kind: 'stat', size: '1x1' },
    { id: 'mood', kind: 'stat', size: '1x1' },
    { id: 'smart', kind: 'smart-rotating', size: '2x1', locked: 'stat:streak' },
  ],
};

const BETA_PATCH_DASHBOARD_LAYOUT_RESPONSE = {
  success: true,
  layout: BETA_PATCH_DASHBOARD_LAYOUT_REQUEST.layout,
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
        goalWeight: 1,
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
      latest: { t: '2026-09-29T10:00:00.000Z', value: 4, label: 'Bench Press' },
      data: [
        { t: '2026-09-15T10:00:00.000Z', value: 2 },
        { t: '2026-09-29T10:00:00.000Z', value: 4, label: 'Bench Press' },
      ],
    },
    // A metric whose own compute() threw: the route degrades ONE tile rather
    // than failing the dashboard, so this is a shape a client sees for real.
    {
      id: 'nutrition-protein-trend',
      label: 'Protein',
      unit: 'g',
      domain: 'nutrition',
      trendDirection: 'up-good',
      latest: null,
      data: [],
      error: 'MongoServerError: operation exceeded time limit',
    },
  ],
  suggestions: [
    {
      id: 'workout-plateau',
      severity: 'warning',
      title: 'Bench Press plateau detected',
      body: 'Your estimated max has stayed at 225 lbs for 4 weeks. Try a deload.',
      placement: 'dashboard',
      primaryAction: { label: 'View recommendations', href: '/dashboard/workout' },
      dismissible: true,
      cooldownDays: 14,
      source: 'workout',
      sourceData: { exerciseSlug: 'barbell-bench-press' },
    },
  ],
  engagement: [
    { key: 'stat:streak', taps: 12, lastTapAt: '2026-09-29T18:30:00.000Z' },
    { key: 'metric:strength-prs-timeline', taps: 1, lastTapAt: null },
  ],
  now: '2026-09-30T06:00:00.000Z',
};

/** Nothing to rotate yet — every collection empty, `now` still sent. */
const BETA_GET_DASHBOARD_TILES_EMPTY = {
  tiles: [],
  metrics: [],
  suggestions: [],
  engagement: [],
  now: '2026-09-30T06:00:00.000Z',
};

const BETA_POST_TILE_TAP_REQUEST = { key: 'stat:streak' };
const BETA_POST_TILE_TAP_RESPONSE = { success: true };

const BETA_POST_SUGGESTIONS_DISMISS_REQUEST = { id: 'workout-plateau' };

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

/** The fail-closed answers: unauthenticated, and a read that threw. */
const BETA_GET_PROGRAM_NUDGE_UNAUTHENTICATED = {
  due: false,
  reason: 'unauthenticated',
};

const BETA_POST_PROGRAM_NUDGE_REQUEST = {
  action: 'adopt',
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
    baseline: { weight: 195.5, date: '2026-08-01T00:00:00.000Z' },
    journeyStart: { weight: 198, date: '2026-07-15T00:00:00.000Z' },
    now: { weight: 188.2, date: '2026-09-29T00:00:00.000Z', fourWeeksAgo: 191 },
    target: {
      weight: 180,
      paceKgPerWeek: 0.45359237,
      pacePerWeek: 1,
      bandKg: 0.9,
    },
    pace: {
      status: 'on',
      expectedKg: 85.37,
      aheadByKg: 0.2,
      behindByKg: 0,
      etaWeeks: 3.7,
      remainingKg: 1.68,
      eta: '~4 wks',
      etaDate: '2026-10-25T00:00:00.000Z',
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
      key: 'nutrition-on-pace',
      title: 'On pace',
      sub: '1.7 kg to go, about 4 wks at your pace',
      severity: 'good',
      url: '/dashboard/becoming',
    },
  },
  training: {
    status: 'active',
    startedAt: '2026-08-01T00:00:00.000Z',
    target: { daysPerWeek: 4, programId: 'strength-foundation' },
    thisWeek: { done: 2, remaining: 2, chancesLeft: 3, weekLost: false },
    avgLast4: 3.75,
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
        slug: 'barbell-bench-press',
        name: 'Barbell Bench Press',
        baselineE1RM: 240,
        targetE1RM: 250,
        tier: 'progressing',
        ratePer4Weeks: 0.015,
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
      'barbell-bench-press': {
        headline: '250 lbs over the next 8 weeks',
        tier: 'progressing',
        tierLabel: 'Progressing',
        why: ['24 logged sessions', 'up 3% over the last month'],
        method: 'Your estimated max, grown 1.5% every 4 weeks, on the plate grid.',
        caveat: 'Not a prediction — a target to aim at.',
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
      key: 'training-week',
      title: '2 to go this week',
      sub: '3 training days left',
      severity: 'nudge',
      url: '/dashboard/calendar',
    },
  },
};

/** A member who has set nothing: both pillars 'none', every number null. */
const BETA_GET_GOALS_EMPTY = {
  todayKey: '2026-09-30',
  nutrition: {
    unit: 'lbs',
    status: 'none',
    kind: null,
    direction: null,
    startedAt: null,
    achievedAt: null,
    baseline: { weight: null, date: null },
    journeyStart: { weight: null, date: null },
    now: { weight: null, date: null, fourWeeksAgo: null },
    target: { weight: null, paceKgPerWeek: null, pacePerWeek: null, bandKg: 0.9 },
    pace: null,
    adherence: {
      logDays: 0,
      proteinDays: 0,
      totalDays: 7,
      logTarget: 5,
      proteinTarget: 5,
      logOk: false,
      proteinOk: null,
      proteinJudged: false,
    },
    proteinGoal: null,
    suggestion: {
      key: 'nutrition-no-target',
      title: 'Set a target weight',
      sub: 'A target turns weigh-ins into a direction',
      severity: 'info',
      url: '/dashboard/settings',
    },
  },
  training: {
    status: 'none',
    startedAt: null,
    target: { daysPerWeek: null, programId: null },
    thisWeek: { done: 0, remaining: 0, chancesLeft: 7, weekLost: false },
    avgLast4: null,
    weeklyCounts: [],
    baseline: { daysPerWeek: null, date: null, prs: [] },
    lifts: [],
    suggestedLifts: [],
    hasLiftTargets: false,
    liftRationales: {},
    week: {
      sessions: 0,
      sets: 0,
      reps: 0,
      volume: 0,
      workSeconds: 0,
      topSet: null,
      exercises: 0,
      hasWeightedWork: false,
    },
    unit: 'lbs',
    suggestion: {
      key: 'training-no-target',
      title: 'Pick your training days',
      sub: 'How many days a week do you want to train?',
      severity: 'info',
      url: '/dashboard/settings',
    },
  },
};

const BETA_PUT_GOALS_NUTRITION_REQUEST = {
  pillar: 'nutrition',
  paceKgPerWeek: 0.45359237,
  adherence: { logDaysPerWeek: 6, proteinDaysPerWeek: 5 },
  tz: 0,
};

const BETA_PUT_GOALS_TRAINING_REQUEST = {
  pillar: 'training',
  daysPerWeek: 4,
  lifts: 'suggested',
  tz: 0,
};

const BETA_PUT_GOALS_TRAINING_EXPLICIT_REQUEST = {
  pillar: 'training',
  daysPerWeek: 4,
  lifts: [
    {
      slug: 'barbell-back-squat',
      name: 'Barbell Back Squat',
      baselineE1RM: 335,
      targetE1RM: 350,
    },
  ],
  tz: -60,
};

/** GET /api/progress?tz=0 — the summary the dashboard fetches. */
const BETA_GET_PROGRESS = {
  weightData: [
    { date: 'Sep 1', value: 195 },
    { date: 'Sep 29', value: 188.5 },
  ],
  bmiData: [
    { date: 'Sep 1', value: 27.2 },
    { date: 'Sep 29', value: 26.3 },
  ],
  bodyFatData: [{ date: 'Sep 1', value: 18.5 }],
  leanMassData: [{ date: 'Sep 1', value: 158.9 }],
  moodData: [
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
    nextWorkout: 'Day 3 - Upper Body Power',
    nextWorkoutDay: 'Day 3',
  },
  stats: {
    streakDays: 14,
    totalWorkouts: 42,
    thisWeekWorkouts: 2,
    goalProgress: 21,
  },
  goal: {
    fitnessGoal: 'lose_weight',
    nutritionDirection: 'lose',
    targetWeightKg: 81.6,
    startWeightKg: 88.5,
    weeklyAvailability: 4,
    weightUnit: 'lbs',
    // AN OBJECT. `goal.pace` was typed as a number once and this route simply
    // did not parse — see ProgressGoalPaceSchema.
    pace: {
      kgPerWeek: 0.45359237,
      status: 'behind',
      etaWeeks: 3.7,
      eta: '~4 wks',
      behindByKg: 0.62,
    },
  },
  longestStreak: 28,
};

/** The same route for a member with a target but no weigh-in yet: `pace` null. */
const BETA_GET_PROGRESS_NO_PACE = {
  ...BETA_GET_PROGRESS,
  goal: { ...BETA_GET_PROGRESS.goal, startWeightKg: null, pace: null },
};

/** A brand-new member — and byte for byte the route's own error fallback. */
const BETA_GET_PROGRESS_EMPTY = {
  weightData: [],
  bmiData: [],
  moodData: [],
  currentProgram: null,
  stats: { streakDays: 0, totalWorkouts: 0, thisWeekWorkouts: 0, goalProgress: 0 },
};

/** GET /api/progress?detailed=1 — the extras the progress page adds. */
const BETA_GET_PROGRESS_DETAILED = {
  ...BETA_GET_PROGRESS,
  pbs: [
    {
      slug: 'barbell-back-squat',
      name: 'Barbell Back Squat',
      weight: 315,
      reps: 3,
      date: 'Sep 22',
    },
  ],
  recentWorkouts: [
    {
      date: 'Mon, Sep 28',
      programId: 'strength-foundation',
      day: 'Day 1',
      duration: 52,
      exerciseCount: 5,
    },
    // A quick session: no programId, and `day` falls back to a label.
    { date: 'Sat, Sep 26', day: 'Quick Session', exerciseCount: 2 },
  ],
  detailedWorkouts: [
    {
      date: 'Mon, Sep 28',
      rawDate: '2026-09-28T18:04:00.000Z',
      kind: 'program',
      sessionId: 'sess_np023',
      title: 'Lower A',
      programId: 'strength-foundation',
      day: 'Day 1',
      duration: 52,
      notes: 'Felt strong.',
      totalVolume: 9450,
      exercises: [
        {
          name: 'Barbell Back Squat',
          slug: 'barbell-back-squat',
          bestSet: { weight: 315, reps: 3 },
          volume: 9450,
          isPR: true,
          sets: [
            {
              setNumber: 1,
              reps: 5,
              weight: 275,
              duration: null,
              distance: null,
              speed: null,
              completed: true,
            },
            {
              setNumber: 2,
              reps: 3,
              weight: 315,
              duration: null,
              distance: null,
              speed: null,
              completed: true,
            },
          ],
        },
        // A time-based movement: no load, no best set.
        {
          name: 'Plank',
          bestSet: null,
          volume: 0,
          isPR: false,
          sets: [
            {
              setNumber: 1,
              reps: null,
              weight: null,
              duration: 60,
              distance: null,
              speed: null,
              completed: true,
            },
          ],
        },
      ],
    },
  ],
  weeklyVolume: [{ week: 'Sep 28', volume: 9450, workouts: 1 }],
  totalVolumeLbs: 9450,
  targetWeightLbs: 180,
  weeklyAvailability: 4,
};

// ---------------------------------------------------------------------------
// GET | PATCH /api/dashboard/layout
// ---------------------------------------------------------------------------

test('GET /api/dashboard/layout parses, populated and empty', () => {
  const parsed = DashboardLayoutResponseSchema.parse(BETA_GET_DASHBOARD_LAYOUT);
  assert.equal(parsed.layout.length, 5);
  assert.equal(parsed.layout[0]?.id, 'streak');

  const smart = parsed.layout[4];
  assert.equal(smart?.id, SMART_ROTATING_TILE_ID);
  assert.equal(smart?.kind, 'smart-rotating');
  assert.equal(smart?.size, '2x1');
  assert.equal(smart?.locked, null);
  assert.equal(smart?.settings?.intervalMs, DEFAULT_SMART_INTERVAL_MS);
  assert.deepEqual(smart?.settings?.pool, [
    'stat:streak',
    'stat:mood',
    'stat:weekly',
    'stat:workouts',
  ]);

  assert.deepEqual(
    DashboardLayoutResponseSchema.parse(BETA_GET_DASHBOARD_LAYOUT_EMPTY).layout,
    [],
  );
});

test('PATCH /api/dashboard/layout parses both ways, and `locked` pins one card', () => {
  const request = DashboardLayoutPatchRequestSchema.parse(
    BETA_PATCH_DASHBOARD_LAYOUT_REQUEST,
  );
  assert.equal(request.layout.length, 3);

  const response = DashboardLayoutPatchResponseSchema.parse(
    BETA_PATCH_DASHBOARD_LAYOUT_RESPONSE,
  );
  assert.equal(response.success, true);
  assert.equal(response.layout[2]?.locked, 'stat:streak');
});

test('every stat id in the default pool is a valid tile key', () => {
  for (const id of STAT_TILE_IDS) {
    assert.match(`stat:${id}`, TILE_KEY_REGEX);
  }
});

// ---------------------------------------------------------------------------
// GET /api/dashboard/tiles
// ---------------------------------------------------------------------------

test('GET /api/dashboard/tiles parses, populated and empty', () => {
  const parsed = DashboardTilesResponseSchema.parse(BETA_GET_DASHBOARD_TILES);

  assert.equal(parsed.tiles.length, 2);
  assert.equal(parsed.tiles[0]?.tileId, 'strength-prs-timeline');
  assert.equal(parsed.tiles[0]?.suggestionId, undefined);
  assert.equal(parsed.tiles[1]?.suggestionId, 'workout-plateau');
  assert.equal(parsed.tiles[1]?.tileId, undefined);
  assert.equal(parsed.tiles[0]?.breakdown.goalWeight, 1.2);

  assert.equal(parsed.metrics.length, 2);
  assert.equal(parsed.metrics[0]?.latest?.value, 4);
  assert.equal(parsed.metrics[0]?.data.length, 2);
  // The degraded tile: a message instead of data, never a failed response.
  assert.equal(parsed.metrics[1]?.latest, null);
  assert.deepEqual(parsed.metrics[1]?.data, []);
  assert.match(parsed.metrics[1]?.error ?? '', /time limit/);

  assert.equal(parsed.suggestions[0]?.severity, 'warning');
  assert.equal(parsed.suggestions[0]?.primaryAction?.href, '/dashboard/workout');
  assert.equal(parsed.suggestions[0]?.sourceData?.exerciseSlug, 'barbell-bench-press');

  assert.equal(parsed.engagement[0]?.taps, 12);
  assert.equal(parsed.engagement[1]?.lastTapAt, null);
  assert.equal(parsed.now, '2026-09-30T06:00:00.000Z');

  const empty = DashboardTilesResponseSchema.parse(BETA_GET_DASHBOARD_TILES_EMPTY);
  assert.deepEqual(empty.tiles, []);
  assert.deepEqual(empty.metrics, []);
  assert.deepEqual(empty.suggestions, []);
  assert.deepEqual(empty.engagement, []);
});

// ---------------------------------------------------------------------------
// POST /api/dashboard/tile-tap · POST /api/suggestions/dismiss
// ---------------------------------------------------------------------------

test('POST /api/dashboard/tile-tap parses both ways and pins the key format', () => {
  assert.equal(
    DashboardTileTapRequestSchema.parse(BETA_POST_TILE_TAP_REQUEST).key,
    'stat:streak',
  );
  assert.equal(
    DashboardTileTapResponseSchema.parse(BETA_POST_TILE_TAP_RESPONSE).success,
    true,
  );

  // The route 400s on anything that is not `stat:<id>` / `metric:<id>`.
  assert.equal(DashboardTileTapRequestSchema.safeParse({ key: 'streak' }).success, false);
  assert.equal(DashboardTileTapRequestSchema.safeParse({ key: 'stat:' }).success, false);
  assert.equal(
    DashboardTileTapRequestSchema.safeParse({ key: 'metric:strength-prs-timeline' }).success,
    true,
  );
});

test('POST /api/suggestions/dismiss parses both ways, and `wasUpdate` marks the replay', () => {
  assert.equal(
    SuggestionDismissRequestSchema.parse(BETA_POST_SUGGESTIONS_DISMISS_REQUEST).id,
    'workout-plateau',
  );
  assert.equal(SuggestionDismissRequestSchema.safeParse({ id: '' }).success, false);

  const first = SuggestionDismissResponseSchema.parse(
    BETA_POST_SUGGESTIONS_DISMISS_RESPONSE,
  );
  assert.equal(first.wasUpdate, false);
  assert.equal(first.count, 1);

  const replay = SuggestionDismissResponseSchema.parse({
    ...BETA_POST_SUGGESTIONS_DISMISS_RESPONSE,
    wasUpdate: true,
  });
  assert.equal(replay.wasUpdate, true);
});

// ---------------------------------------------------------------------------
// GET | POST /api/program-nudge
// ---------------------------------------------------------------------------

test('GET|POST /api/program-nudge parse, including the fail-closed answer', () => {
  const due = ProgramNudgeResponseSchema.parse(BETA_GET_PROGRAM_NUDGE);
  assert.equal(due.due, true);
  assert.equal(due.showings, 1);
  assert.equal(due.hasServerState, true);

  // `due` is the only field the refusals carry — everything else is optional
  // precisely so this parses.
  const closed = ProgramNudgeResponseSchema.parse(
    BETA_GET_PROGRAM_NUDGE_UNAUTHENTICATED,
  );
  assert.equal(closed.due, false);
  assert.equal(closed.reason, 'unauthenticated');
  assert.equal(closed.showings, undefined);

  const request = ProgramNudgeRequestSchema.parse(BETA_POST_PROGRAM_NUDGE_REQUEST);
  assert.equal(request.action, 'adopt');
  assert.equal(request.shownCount, 1);

  const recorded = ProgramNudgeResponseSchema.parse(BETA_POST_PROGRAM_NUDGE_RESPONSE);
  assert.equal(recorded.due, false);
  assert.equal(recorded.adopted, false);

  // Every action the route accepts, and nothing else.
  for (const action of ['shown', 'dismiss', 'dismiss_forever', 'adopt']) {
    assert.equal(ProgramNudgeRequestSchema.safeParse({ action }).success, true, action);
  }
  assert.equal(ProgramNudgeRequestSchema.safeParse({ action: 'snooze' }).success, false);
});

// ---------------------------------------------------------------------------
// GET | PUT /api/goals
// ---------------------------------------------------------------------------

test('GET /api/goals parses, both pillars active and both unset', () => {
  const parsed = GoalProgressResponseSchema.parse(BETA_GET_GOALS);
  assert.equal(parsed.todayKey, '2026-09-30');

  assert.equal(parsed.nutrition.status, 'active');
  assert.equal(parsed.nutrition.pace?.status, 'on');
  assert.equal(parsed.nutrition.pace?.eta, '~4 wks');
  assert.equal(parsed.nutrition.adherence?.proteinOk, true);
  assert.equal(parsed.nutrition.baseline.weight, 195.5);
  assert.equal(parsed.nutrition.now.fourWeeksAgo, 191);

  assert.equal(parsed.training.status, 'active');
  assert.equal(parsed.training.lifts[0]?.reached, false);
  assert.equal(parsed.training.suggestedLifts[0]?.assessment.tier, 'progressing');
  assert.equal(
    parsed.training.liftRationales['barbell-bench-press']?.tierLabel,
    'Progressing',
  );
  assert.equal(parsed.training.week.topSet?.e1RM, 342);

  const empty = GoalProgressResponseSchema.parse(BETA_GET_GOALS_EMPTY);
  assert.equal(empty.nutrition.status, 'none');
  assert.equal(empty.nutrition.pace, null);
  assert.equal(empty.nutrition.kind, null);
  assert.equal(empty.nutrition.adherence?.proteinOk, null);
  assert.equal(empty.training.status, 'none');
  assert.deepEqual(empty.training.liftRationales, {});
  assert.equal(empty.training.week.topSet, null);
});

test('PUT /api/goals discriminates on `pillar`', () => {
  const nutrition = GoalUpdateRequestSchema.parse(BETA_PUT_GOALS_NUTRITION_REQUEST);
  assert.equal(nutrition.pillar, 'nutrition');
  assert.equal(
    nutrition.pillar === 'nutrition' ? nutrition.adherence?.logDaysPerWeek : null,
    6,
  );

  const suggested = GoalUpdateRequestSchema.parse(BETA_PUT_GOALS_TRAINING_REQUEST);
  assert.equal(suggested.pillar, 'training');
  assert.equal(suggested.pillar === 'training' ? suggested.lifts : null, 'suggested');

  const explicit = GoalUpdateRequestSchema.parse(
    BETA_PUT_GOALS_TRAINING_EXPLICIT_REQUEST,
  );
  assert.equal(explicit.pillar === 'training' && Array.isArray(explicit.lifts), true);

  // Clearing the lift targets is an empty array, not a missing key.
  assert.equal(
    GoalUpdateRequestSchema.safeParse({ pillar: 'training', lifts: [] }).success,
    true,
  );
  // The route answers 400 for any other pillar; so does the schema.
  assert.equal(GoalUpdateRequestSchema.safeParse({ pillar: 'mind' }).success, false);
});

// ---------------------------------------------------------------------------
// GET /api/progress
// ---------------------------------------------------------------------------

test('GET /api/progress parses the dashboard summary, with goal.pace as an OBJECT', () => {
  const parsed = ProgressApiResponseSchema.parse(BETA_GET_PROGRESS);

  assert.equal(parsed.weightData.length, 2);
  assert.equal(parsed.moodData.at(-1)?.value, 4);
  assert.equal(parsed.stats.streakDays, 14);
  assert.equal(parsed.stats.thisWeekWorkouts, 2);
  assert.equal(parsed.currentProgram?.programId, 'strength-foundation');
  assert.equal(parsed.currentProgram?.completedWorkouts, 10);
  assert.equal(parsed.goal?.weightUnit, 'lbs');
  assert.equal(parsed.longestStreak, 28);

  // The regression this schema was corrected for.
  assert.equal(typeof parsed.goal?.pace, 'object');
  assert.equal(parsed.goal?.pace?.status, 'behind');
  assert.equal(parsed.goal?.pace?.eta, '~4 wks');
  assert.equal(parsed.goal?.pace?.behindByKg, 0.62);
  // A bare number is what the schema used to say, and it is not what the route
  // sends — so it must NOT parse.
  assert.equal(
    ProgressApiResponseSchema.safeParse({
      ...BETA_GET_PROGRESS,
      goal: { ...BETA_GET_PROGRESS.goal, pace: 1 },
    }).success,
    false,
  );

  assert.equal(
    ProgressApiResponseSchema.parse(BETA_GET_PROGRESS_NO_PACE).goal?.pace,
    null,
  );
});

test('GET /api/progress parses the empty answer a brand-new member gets', () => {
  const parsed = ProgressApiResponseSchema.parse(BETA_GET_PROGRESS_EMPTY);
  assert.deepEqual(parsed.weightData, []);
  assert.equal(parsed.currentProgram, null);
  assert.equal(parsed.stats.goalProgress, 0);
  // The fields the empty answer omits are the ones a client must not require.
  assert.equal(parsed.goal, undefined);
  assert.equal(parsed.bodyFatData, undefined);
  assert.equal(parsed.longestStreak, undefined);
});

test('GET /api/progress?detailed=1 parses the progress page extras', () => {
  const parsed = ProgressApiResponseSchema.parse(BETA_GET_PROGRESS_DETAILED);
  assert.equal(parsed.pbs?.[0]?.weight, 315);
  assert.equal(parsed.recentWorkouts?.length, 2);
  assert.equal(parsed.recentWorkouts?.[1]?.programId, undefined);

  const session = parsed.detailedWorkouts?.[0];
  assert.equal(session?.kind, 'program');
  assert.equal(session?.exercises[0]?.bestSet?.weight, 315);
  assert.equal(session?.exercises[0]?.isPR, true);
  // A time-based movement: reps and weight are null, duration carries it.
  assert.equal(session?.exercises[1]?.bestSet, null);
  assert.equal(session?.exercises[1]?.sets[0]?.reps, null);
  assert.equal(session?.exercises[1]?.sets[0]?.duration, 60);

  assert.equal(parsed.weeklyVolume?.[0]?.volume, 9450);
  assert.equal(parsed.totalVolumeLbs, 9450);
  assert.equal(parsed.targetWeightLbs, 180);
});

// ---------------------------------------------------------------------------
// The tile vocabulary itself — the values webapp/lib/dashboardLayout mirrors.
// (What happens when the two DRIFT is tests/webParity.test.ts.)
// ---------------------------------------------------------------------------

test('the tile vocabulary is the one the web persists', () => {
  assert.deepEqual([...TILE_KINDS], ['stat', 'metric', 'smart-rotating']);
  assert.deepEqual([...TILE_SIZES], ['1x1', '2x1']);
  assert.deepEqual([...SMART_INTERVAL_OPTIONS_MS], [4000, 6000, 10000, 30000]);
  assert.equal(MAX_DASHBOARD_TILES, 20);
  assert.equal(MAX_SMART_POOL, 20);
  assert.equal(DEFAULT_SMART_INTERVAL_MS, 6000);
  assert.equal(SMART_ROTATING_TILE_ID, 'smart');
  assert.deepEqual(
    [...STAT_TILE_IDS],
    ['streak', 'mood', 'weekly', 'goal', 'calories', 'water', 'weight', 'workouts'],
  );
  // The option set is the interval schema, not a second copy of it.
  assert.ok(SMART_INTERVAL_OPTIONS_MS.includes(DEFAULT_SMART_INTERVAL_MS as 6000));
});

test('DashboardLayoutSchema enforces the 20-tile limit', () => {
  const tiles = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `tile-${i}`, kind: 'stat', size: '1x1' }));

  assert.equal(DashboardLayoutSchema.parse(tiles(MAX_DASHBOARD_TILES)).length, 20);
  assert.equal(DashboardLayoutSchema.safeParse(tiles(MAX_DASHBOARD_TILES + 1)).success, false);
});

test('DashboardTileSchema refuses an unknown kind, size or rotation interval', () => {
  assert.equal(
    DashboardTileSchema.safeParse({ id: 'x', kind: 'chart', size: '1x1' }).success,
    false,
  );
  assert.equal(
    DashboardTileSchema.safeParse({ id: 'x', kind: 'stat', size: '3x3' }).success,
    false,
  );
  assert.equal(DashboardTileSchema.safeParse({ id: '', kind: 'stat', size: '1x1' }).success, false);
  // 5000 is not one of SMART_INTERVAL_OPTIONS_MS.
  assert.equal(
    DashboardTileSchema.safeParse({
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { intervalMs: 5000 },
    }).success,
    false,
  );
  for (const intervalMs of SMART_INTERVAL_OPTIONS_MS) {
    assert.equal(
      DashboardTileSchema.safeParse({
        id: 'smart',
        kind: 'smart-rotating',
        size: '2x1',
        settings: { intervalMs },
      }).success,
      true,
      `${intervalMs} is an offered interval`,
    );
  }
  // A pool entry must be a card key, and the pool is capped.
  assert.equal(
    DashboardTileSchema.safeParse({
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { pool: ['streak'] },
    }).success,
    false,
  );
  assert.equal(
    DashboardTileSchema.safeParse({
      id: 'smart',
      kind: 'smart-rotating',
      size: '2x1',
      settings: { pool: Array.from({ length: MAX_SMART_POOL + 1 }, (_, i) => `stat:s${i}`) },
    }).success,
    false,
  );
});

test('response schemas keep a field they have never heard of', () => {
  // Forward compatibility: a shipped store build outlives the server it was
  // written against and must not drop a whole response over a new key.
  const grown = DashboardLayoutResponseSchema.parse({
    ...BETA_GET_DASHBOARD_LAYOUT,
    version: 7,
  }) as { version?: number };
  assert.equal(grown.version, 7);
});
