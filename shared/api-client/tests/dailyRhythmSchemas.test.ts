// Run with: npx tsx --test tests/dailyRhythmSchemas.test.ts
//
// NP-022: Type the daily-rhythm routes: streaks, freeze, check-in, mood and weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as sharedIndex from '../src/index';
import {
  ActivityStreakResultSchema,
  CheckInActionRequestSchema,
  CheckInActionResponseSchema,
  CheckInRequestSchema,
  CheckInResponseSchema,
  FREEZE_REFUSALS,
  FreezeRefusalSchema,
  FreezeRefusalResponseSchema,
  FreezeRequestSchema,
  FreezeResponseSchema,
  FreezeSuccessResponseSchema,
  GoalReachedSchema,
  LogMoodRequestSchema,
  LogMoodResponseSchema,
  LogWeightRequestSchema,
  LogWeightResponseSchema,
  MoodCheckResponseSchema,
  MoodScale,
  StreaksPayloadSchema,
  StreaksResponseSchema,
  WeightCheckResponseSchema,
} from '../src/index';

const SAMPLE_STREAKS_PAYLOAD = {
  todayKey: '2026-09-30',
  minVisible: 3,
  overall: {
    current: 12,
    best: 25,
    freezes: 2,
    milestonesReached: [3, 7],
    nextMilestone: 14,
    activeToday: true,
    lastActivityDate: '2026-09-30',
  },
  pillars: {
    workout: {
      unit: 'days' as const,
      current: 4,
      best: 10,
      thisWeek: 2,
      target: 3,
      metThisWeek: false,
      weekLost: false,
      weeksOnTarget: 3,
      remainingThisWeek: 1,
    },
    nutrition: {
      unit: 'days' as const,
      current: 8,
      best: 14,
      activeToday: true,
    },
    mindset: {
      unit: 'days' as const,
      current: 5,
      best: 12,
      activeToday: true,
    },
    super: {
      unit: 'days' as const,
      current: 4,
      best: 9,
      activeToday: false,
      today: {
        nutrition: true,
        mindset: true,
        trained: false,
        restDay: false,
        weekOnTrack: true,
      },
      freeze: {
        available: true,
        returnsOn: null,
        usedDays: ['2026-09-01'],
        frozenToday: false,
      },
    },
  },
  credits: {
    workout: ['2026-09-28'],
    nutrition: [],
    mindset: ['2026-09-29'],
  },
};

// ─── Acceptance e015c70e: Mood & Weight POST + numeric tz ───────────────────

test('e015c70e: LogMoodResponseSchema parses with streak available to callers', () => {
  const body = {
    success: true,
    mood: 4,
    date: '2026-09-30',
    applied: true,
    streak: {
      streakDays: 7,
      streakExtended: true,
      newMilestone: 7,
    },
  };
  const parsed = LogMoodResponseSchema.parse(body);
  assert.equal(parsed.success, true);
  assert.equal(parsed.mood, 4);
  assert.equal(parsed.date, '2026-09-30');
  assert.equal(parsed.applied, true);
  assert.ok(parsed.streak);
  assert.equal(parsed.streak?.streakDays, 7);
  assert.equal(parsed.streak?.streakExtended, true);
  assert.equal(parsed.streak?.newMilestone, 7);
});

test('e015c70e: LogMoodRequestSchema accepts numeric tz and rejects string tz', () => {
  // Numeric tz is accepted
  const validPositive = LogMoodRequestSchema.safeParse({ mood: 3, tz: 240 });
  assert.equal(validPositive.success, true);
  if (validPositive.success) assert.equal(validPositive.data.tz, 240);

  const validNegative = LogMoodRequestSchema.safeParse({ mood: 5, tz: -60 });
  assert.equal(validNegative.success, true);

  const validZero = LogMoodRequestSchema.safeParse({ mood: 2, tz: 0 });
  assert.equal(validZero.success, true);

  // String tz (e.g. IANA name) must be rejected
  const stringTz = LogMoodRequestSchema.safeParse({ mood: 3, tz: 'America/New_York' });
  assert.equal(stringTz.success, false, 'string tz must be rejected');

  const stringUtc = LogMoodRequestSchema.safeParse({ mood: 3, tz: 'UTC' });
  assert.equal(stringUtc.success, false, 'string tz UTC must be rejected');
});

test('e015c70e: LogWeightResponseSchema parses with streak and goalReached available to callers', () => {
  const body = {
    success: true,
    date: '2026-09-30',
    applied: true,
    streak: {
      streakDays: 14,
      streakExtended: true,
      newMilestone: 14,
    },
    goalReached: {
      pillar: 'nutrition' as const,
      direction: 'lose' as const,
      unit: 'lbs' as const,
      targetWeight: 175,
      startWeight: 190,
      currentWeight: 175,
      totalChange: 15,
      days: 42,
    },
  };
  const parsed = LogWeightResponseSchema.parse(body);
  assert.equal(parsed.success, true);
  assert.equal(parsed.date, '2026-09-30');
  assert.equal(parsed.applied, true);
  assert.ok(parsed.streak);
  assert.equal(parsed.streak?.streakDays, 14);
  assert.equal(parsed.streak?.streakExtended, true);
  assert.equal(parsed.streak?.newMilestone, 14);
  assert.ok(parsed.goalReached);
  assert.equal(parsed.goalReached?.pillar, 'nutrition');
  assert.equal(parsed.goalReached?.direction, 'lose');
  assert.equal(parsed.goalReached?.unit, 'lbs');
  assert.equal(parsed.goalReached?.targetWeight, 175);
  assert.equal(parsed.goalReached?.totalChange, 15);
  assert.equal(parsed.goalReached?.days, 42);
});

test('e015c70e: LogWeightRequestSchema accepts numeric tz and rejects string tz', () => {
  // Numeric tz is accepted
  const validPositive = LogWeightRequestSchema.safeParse({ weight: 180, tz: 240 });
  assert.equal(validPositive.success, true);
  if (validPositive.success) assert.equal(validPositive.data.tz, 240);

  const validNegative = LogWeightRequestSchema.safeParse({ weight: 82.5, tz: -120 });
  assert.equal(validNegative.success, true);

  const validZero = LogWeightRequestSchema.safeParse({ weight: null, skip: true, tz: 0 });
  assert.equal(validZero.success, true);

  // String tz (e.g. IANA name) must be rejected
  const stringTz = LogWeightRequestSchema.safeParse({ weight: 180, tz: 'America/New_York' });
  assert.equal(stringTz.success, false, 'string tz must be rejected');

  const stringUtc = LogWeightRequestSchema.safeParse({ weight: 180, tz: 'UTC' });
  assert.equal(stringUtc.success, false, 'string tz UTC must be rejected');
});

// ─── Acceptance e015c70f: GET /api/streaks & POST /api/streaks/freeze ───────

test('e015c70f: GET /api/streaks payload parses with all pillars, super freeze, and credits', () => {
  const parsed = StreaksResponseSchema.parse(SAMPLE_STREAKS_PAYLOAD);
  assert.equal(parsed.todayKey, '2026-09-30');
  assert.equal(parsed.minVisible, 3);
  assert.equal(parsed.overall.current, 12);
  assert.equal(parsed.pillars.workout.unit, 'days');
  assert.equal(parsed.pillars.workout.current, 4);
  assert.equal(parsed.pillars.workout.thisWeek, 2);
  assert.equal(parsed.pillars.nutrition.current, 8);
  assert.equal(parsed.pillars.mindset.current, 5);
  assert.equal(parsed.pillars.super.current, 4);
  assert.equal(parsed.pillars.super.today.weekOnTrack, true);
  assert.equal(parsed.pillars.super.freeze.available, true);
  assert.deepEqual(parsed.credits.workout, ['2026-09-28']);
});

test('e015c70f: POST /api/streaks/freeze success (200) parses with frozen dayKey and updated streaks', () => {
  const body = {
    frozen: '2026-09-30',
    streaks: {
      ...SAMPLE_STREAKS_PAYLOAD,
      pillars: {
        ...SAMPLE_STREAKS_PAYLOAD.pillars,
        super: {
          ...SAMPLE_STREAKS_PAYLOAD.pillars.super,
          freeze: {
            available: false,
            returnsOn: '2026-10-30',
            usedDays: ['2026-09-01', '2026-09-30'],
            frozenToday: true,
          },
        },
      },
    },
  };
  const parsed = FreezeSuccessResponseSchema.parse(body);
  assert.equal(parsed.frozen, '2026-09-30');
  assert.equal(parsed.streaks.pillars.super.freeze.frozenToday, true);

  const unionParsed = FreezeResponseSchema.parse(body);
  assert.ok('frozen' in unionParsed);
});

test('e015c70f: POST /api/streaks/freeze refusal (409) parses with error, reason, and streaks', () => {
  for (const reason of FREEZE_REFUSALS) {
    const body = {
      error: `Cannot freeze: ${reason}`,
      reason,
      streaks: SAMPLE_STREAKS_PAYLOAD,
    };
    const parsed = FreezeRefusalResponseSchema.parse(body);
    assert.equal(parsed.reason, reason);
    assert.equal(parsed.error, `Cannot freeze: ${reason}`);
    assert.equal(parsed.streaks.overall.current, 12);

    const unionParsed = FreezeResponseSchema.parse(body);
    assert.ok('reason' in unionParsed);
  }
});

// ─── Acceptance e015c710: GET / POST /api/checkin & GET /api/weight ──────────

test('e015c710: GET /api/checkin parses complete decision and facts', () => {
  const dueBody = {
    due: true,
    reason: 'due' as const,
    complete: false,
    moodLoggedToday: false,
    weightLoggedToday: false,
    skippedToday: false,
    daysSinceMood: 2,
    daysSinceWeight: 5,
    todaysMood: null,
    lastWeight: 182.4,
  };
  const parsed = CheckInResponseSchema.parse(dueBody);
  assert.equal(parsed.due, true);
  assert.equal(parsed.reason, 'due');
  assert.equal(parsed.complete, false);
  assert.equal(parsed.moodLoggedToday, false);
  assert.equal(parsed.weightLoggedToday, false);
  assert.equal(parsed.daysSinceMood, 2);
  assert.equal(parsed.daysSinceWeight, 5);
  assert.equal(parsed.todaysMood, null);
  assert.equal(parsed.lastWeight, 182.4);

  // Unauthenticated refusal outcome
  const unauth = CheckInResponseSchema.parse({ due: false, reason: 'unauthenticated' });
  assert.equal(unauth.due, false);
  assert.equal(unauth.reason, 'unauthenticated');
});

test('e015c710: POST /api/checkin request and response parse', () => {
  const reqShown = CheckInActionRequestSchema.parse({ action: 'shown', tz: 240 });
  assert.equal(reqShown.action, 'shown');
  assert.equal(reqShown.tz, 240);

  const reqSkip = CheckInActionRequestSchema.parse({ action: 'skip', tz: -60 });
  assert.equal(reqSkip.action, 'skip');

  assert.equal(CheckInActionRequestSchema.safeParse({ action: 'invalid' }).success, false);

  const res = CheckInActionResponseSchema.parse({ success: true });
  assert.equal(res.success, true);
});

test('e015c710: GET /api/weight prompt state parses correctly', () => {
  const promptState = {
    needsWeightCheck: true,
    consecutiveSkips: 3,
    isMandatory: false,
    showReminder: true,
    daysSinceLastEntry: 4,
    lastWeight: 183.2,
  };
  const parsed = WeightCheckResponseSchema.parse(promptState);
  assert.equal(parsed.needsWeightCheck, true);
  assert.equal(parsed.consecutiveSkips, 3);
  assert.equal(parsed.isMandatory, false);
  assert.equal(parsed.showReminder, true);
  assert.equal(parsed.daysSinceLastEntry, 4);
  assert.equal(parsed.lastWeight, 183.2);
});

// ─── Speculative history shapes deleted ─────────────────────────────────────

test('speculative history shapes are deleted from shared/api-client', () => {
  assert.equal('MoodHistoryResponseSchema' in sharedIndex, false, 'MoodHistoryResponseSchema must not be exported');
  assert.equal('WeightHistoryResponseSchema' in sharedIndex, false, 'WeightHistoryResponseSchema must not be exported');
});
