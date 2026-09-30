// Run with: npx tsx --test tests/mindSchemas.test.ts
//
// NP-037 — the Mind and Becoming domains.
//
// These are HAND-WRITTEN fixtures, so they agree with the schemas by
// construction and prove only that the shapes are internally coherent: that
// MindSessionPlan carries the five fields the player reads, that the 403 gate
// body parses as one, that a day key and an instant are not interchangeable,
// and that every write request names `tz`. What the routes ACTUALLY send is
// checked by webapp/tests/unit/contract/np037Mind.test.ts, which calls the real
// handlers against a real database. Both exist on purpose; neither replaces the
// other.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BECOMING_FACTS,
  BECOMING_SEVERITIES,
  BECOMING_STEPS,
  BECOMING_SUBJECTS,
  BecomingJourneyResponseSchema,
  MIND_MOVE_KINDS,
  MIND_PRIMARY_OBSTACLES,
  MIND_RESUME_DROPPED_REASONS,
  MIND_ROUTES_WITHOUT_SCHEMAS,
  MIND_SESSIONS_FEATURE,
  MIND_STARTING_POINTS,
  MIND_STATES,
  MindDisciplineActionRequestSchema,
  MindDisciplineResponseSchema,
  MindGatePayloadSchema,
  MindIdentityPatchRequestSchema,
  MindIdentityResponseSchema,
  MindJournalResponseSchema,
  MindMissionResponseSchema,
  MindNonNegotiablesResponseSchema,
  MindProgressResponseSchema,
  MindSessionCompleteRequestSchema,
  MindSessionCompleteResponseSchema,
  MindSessionPlanSchema,
  MindSessionSaveRequestSchema,
  MindSessionStateResponseSchema,
  MindShareRequestSchema,
  MindStateResponseSchema,
  MindSummaryResponseSchema,
  MindVisionResponseSchema,
  MindWinsResponseSchema,
  classifyApiResponse,
  type MindSessionPlan,
} from '../src/index';

// ---------------------------------------------------------------------------
// The plan — the shape a Mind session IS. Card NP-037 names five of its
// fields (`intro`, `moves[]`, `rewardXp`, `openingId`, `cta`); all of them are
// populated here, plus the adaptive swap the player resolves at run time.
// ---------------------------------------------------------------------------

const PLAN: MindSessionPlan = {
  intro: { title: 'Settle, then aim', subtitle: 'Three minutes. One point.' },
  moves: [
    {
      id: 'open-breath',
      kind: 'breath',
      title: 'Bring it down a notch',
      subtitle: 'Long exhales do the work',
      protocolId: 'sigh',
      xp: 5,
      altPositive: {
        id: 'open-amplify',
        kind: 'identity',
        title: 'Spend it on purpose',
        statement: 'I am the person who does the work anyway.',
        source: 'IDENTITY_POOL',
        xp: 5,
      },
    },
    {
      id: 'pick-one',
      kind: 'choice',
      title: 'What gets today?',
      prompt: 'Name the one thing.',
      options: [
        { label: 'The hard thing', response: 'Good. Everything else can wait.' },
        { label: 'The overdue thing' },
      ],
      xp: 5,
    },
    {
      id: 'compose-line',
      kind: 'compose',
      title: 'Finish the line',
      compose: {
        template: 'I am {0} enough to {1} today.',
        blanks: [['steady', 'awake'], ['start', 'finish']],
      },
      xp: 5,
    },
  ],
  rewardXp: 20,
  doneText: 'That is the rep. Go spend it.',
  blueprintId: 'open-one-point/commit',
  openingId: 'stressed',
  cta: { system: 'discipline', reason: 'You named the hard thing — go hold the line on it.' },
};

test('MindSessionPlanSchema carries intro, moves, rewardXp, openingId and cta', () => {
  const parsed = MindSessionPlanSchema.parse(PLAN);
  assert.equal(parsed.intro.title, 'Settle, then aim');
  assert.deepEqual(parsed.moves.map((m) => m.kind), ['breath', 'choice', 'compose']);
  assert.equal(parsed.rewardXp, 20);
  assert.equal(parsed.openingId, 'stressed');
  assert.equal(parsed.cta?.system, 'discipline');
  // The adaptive swap is one level deep and nothing more: the move it points at
  // is built by the same slotMove() and never carries a swap of its own.
  assert.equal(parsed.moves[0]?.altPositive?.kind, 'identity');
});

test('a plan with no moves and no cta still parses — arsenal plans set neither', () => {
  const minimal = MindSessionPlanSchema.parse({
    intro: { title: 'One move', subtitle: 'Just this' },
    moves: [],
    rewardXp: 5,
  });
  assert.deepEqual(minimal.moves, []);
  assert.equal(minimal.cta, undefined);
  assert.equal(minimal.doneText, undefined);
});

test('a move kind the client has never heard of does NOT sink the session', () => {
  // The whole reason `kind` is a plain string: a composer that grows a beat must
  // not make a shipped store build drop the response.
  const grown = MindSessionPlanSchema.parse({
    ...PLAN,
    moves: [{ id: 'x', kind: 'gratitude-ladder', title: 'New beat', xp: 5 }],
  });
  assert.equal(grown.moves[0]?.kind, 'gratitude-ladder');
  // And the known list is still the known list.
  assert.equal(MIND_MOVE_KINDS.length, 18);
  assert.ok(MIND_MOVE_KINDS.includes('state-check'));
  assert.ok(MIND_MOVE_KINDS.includes('contrast'));
});

// ---------------------------------------------------------------------------
// The 403 gate body
// ---------------------------------------------------------------------------

const MIND_GATE = {
  error: "You've finished your first 10 Mind sessions.",
  requiresTier: 'plus',
  feature: 'mind-sessions',
  limit: 10,
  remaining: 0,
  resetsAt: null,
  window: 'lifetime',
};

test('the mind-sessions gate body parses and names the feature and the tier', () => {
  const gate = MindGatePayloadSchema.parse(MIND_GATE);
  assert.equal(gate.feature, MIND_SESSIONS_FEATURE);
  assert.equal(gate.feature, 'mind-sessions');
  assert.equal(gate.requiresTier, 'plus');
  assert.equal(gate.limit, 10);
  assert.equal(gate.remaining, 0);
  assert.equal(gate.resetsAt, null);
});

test('the same body is what classifyApiResponse calls a plan gate', () => {
  // One refusal, two readers: this schema (for a contract test) and the
  // classifier (for the app). They must not disagree about what a gate is.
  const classified = classifyApiResponse(403, MIND_GATE);
  assert.equal(classified.kind, 'plan-gate');
  assert.equal(classified.kind === 'plan-gate' && classified.gate.feature, 'mind-sessions');
  assert.equal(classified.kind === 'plan-gate' && classified.gate.requiresTier, 'plus');
});

test('an empty `error` is not a gate — the sheet renders the server wording verbatim', () => {
  assert.equal(MindGatePayloadSchema.safeParse({ ...MIND_GATE, error: '' }).success, false);
  assert.equal(
    MindGatePayloadSchema.safeParse({ error: 'Nope.', requiresTier: 'plus' }).success,
    false,
    'a gate without a `feature` is an ordinary refusal',
  );
});

// ---------------------------------------------------------------------------
// The session reads and writes
// ---------------------------------------------------------------------------

test('MindSessionStateResponseSchema parses the resumable, unlocked shape', () => {
  const parsed = MindSessionStateResponseSchema.parse({
    dateKey: '2026-09-29',
    completedToday: false,
    streak: 4,
    lastBreathAt: 1790000000000,
    recentKinds: ['breath', 'choice'],
    mainSessionAvailable: true,
    lastMainSessionAt: null,
    nextMainSessionAt: null,
    resume: { seed: 20370914, plan: PLAN },
    resumeDropped: null,
    locked: false,
    lockReason: null,
    requiresTier: null,
    sessionsUsed: 3,
    sessionsLimit: null,
  });
  // A day KEY, not an instant — the streak is counted in local days.
  assert.match(parsed.dateKey, /^\d{4}-\d{2}-\d{2}$/);
  // An epoch-ms INSTANT, not a day key.
  assert.equal(typeof parsed.lastBreathAt, 'number');
  assert.equal(parsed.resume?.plan.moves.length, 3);
  // Uncapped is null, which is not a limit of zero.
  assert.equal(parsed.sessionsLimit, null);
});

test('MindSessionStateResponseSchema parses the LOCKED shape, and the two locks are separate', () => {
  const parsed = MindSessionStateResponseSchema.parse({
    dateKey: '2026-09-29',
    completedToday: false,
    streak: 0,
    lastBreathAt: null,
    recentKinds: [],
    // The plan wall is on and the cooldown is not: the two are orthogonal.
    mainSessionAvailable: true,
    lastMainSessionAt: null,
    nextMainSessionAt: null,
    resume: null,
    resumeDropped: 'new_day',
    locked: true,
    lockReason: 'tier',
    requiresTier: 'plus',
    sessionsUsed: 10,
    sessionsLimit: 10,
  });
  assert.equal(parsed.locked, true);
  assert.equal(parsed.requiresTier, 'plus');
  assert.equal(parsed.mainSessionAvailable, true);
  assert.ok(MIND_RESUME_DROPPED_REASONS.includes('new_day'));
  assert.deepEqual([...MIND_RESUME_DROPPED_REASONS], ['new_day', 'workout_logged', 'meal_logged']);
});

test('the session writes name `tz` and nothing else — the web`s `tzOffset` is not the contract', () => {
  // POST /api/mind/session reads the day from `tz` through
  // readTzOffsetFromBody, which does NOT look at `tzOffset`. A client that sent
  // the web's spelling would have every completion stamped with the UTC day.
  const put = MindSessionSaveRequestSchema.parse({ seed: 1, plan: PLAN, tz: 240 });
  assert.equal(put.tz, 240);
  assert.equal('tzOffset' in put, false, '`tzOffset` is stripped, not carried');

  const post = MindSessionCompleteRequestSchema.parse({
    moves: [{ kind: 'breath' }, { kind: 'choice' }],
    tz: -60,
    tzZone: 'Europe/Berlin',
  });
  assert.deepEqual(post.moves, [{ kind: 'breath' }, { kind: 'choice' }]);
  assert.equal(post.tz, -60);
  assert.equal(post.tzZone, 'Europe/Berlin');

  // `tz` is a NUMBER of minutes west of UTC, never an IANA zone name.
  assert.equal(
    MindSessionCompleteRequestSchema.safeParse({ moves: [], tz: 'America/New_York' }).success,
    false,
  );
});

test('MindSessionCompleteResponseSchema parses a counted completion and a training rep', () => {
  const level = { level: 2, intoLevel: 20, span: 75, pct: 27, xpToNext: 55 };
  const chapter = {
    id: 1,
    name: 'Reset',
    theme: 'Get out of your own way.',
    description: 'Calm the storm first.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    systems: ['state-shift', 'self-image', 'mission'],
  };
  const base = {
    completions: 1,
    counted: true,
    trainingMode: false,
    xpAwarded: 20,
    levelXp: 70,
    level: 2,
    previousLevel: 1,
    leveledUp: true,
    levelProgress: level,
    chapter: 1,
    previousChapter: 1,
    chapterAdvanced: false,
    newlyUnlocked: [],
    unlockedSystems: ['state-shift', 'self-image', 'mission'],
    currentChapter: chapter,
    mainSessionCount: 3,
    sessionsIntoChapter: { done: 3, needed: 10, toNext: 7 },
    nextMainSessionAt: 1790072000000,
    xpBank: 70,
    streak: 3,
    featureUnlocks: ['coach'],
  };
  const counted = MindSessionCompleteResponseSchema.parse(base);
  assert.equal(counted.counted, true);
  assert.equal(counted.xpAwarded, 20);
  assert.deepEqual(counted.featureUnlocks, ['coach']);

  // Inside the 20h cooldown the session still runs and still nudges the level,
  // but it counts toward no chapter — `counted` is the field that says so.
  const training = MindSessionCompleteResponseSchema.parse({
    ...base,
    counted: false,
    trainingMode: true,
    xpAwarded: 5,
    mainSessionCount: 3,
    featureUnlocks: [],
  });
  assert.equal(training.counted, false);
  assert.equal(training.trainingMode, true);
  assert.equal(training.xpAwarded, 5);
});

// ---------------------------------------------------------------------------
// The rest of the Mind surface
// ---------------------------------------------------------------------------

test('MindProgressResponseSchema parses the full progression read', () => {
  const chapter = {
    id: 2,
    name: 'Foundation',
    theme: "See clearly where you're going.",
    description: 'Paint the picture.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    systems: ['vision'],
  };
  const parsed = MindProgressResponseSchema.parse({
    chapter: 2,
    xp: 130,
    xpBank: 60,
    xpProgress: { needed: 150, current: 80, pct: 80 },
    readyToLevelUp: false,
    canSelfDeclare: true,
    selfDeclaredChapters: [1],
    unlockedSystems: ['state-shift', 'self-image', 'mission', 'vision'],
    currentChapter: chapter,
    nextChapter: null,
    vision: {
      habits: 'Up at five.',
      mind: 'Calm under load.',
      body: 'Strong.',
      relationships: 'Present.',
      environment: 'Clear.',
      identityStatement: 'I am the person who finishes.',
      completedAt: '2026-09-01T12:00:00.000Z',
      updatedAt: '2026-09-28T12:00:00.000Z',
      alignmentHistory: [{ date: '2026-09-29', score: 4 }],
    },
    lastBreathAt: '2026-09-29T07:15:00.000Z',
    chapterHistory: [{ chapter: 1, unlockedAt: '2026-08-01T00:00:00.000Z' }],
    currentMilestone: null,
    nextMilestone: null,
    levelXp: 60,
    level: 2,
    levelProgress: { level: 2, intoLevel: 10, span: 75, pct: 13, xpToNext: 65 },
    mainSessionCount: 12,
    sessionsIntoChapter: { done: 2, needed: 10, toNext: 8 },
    introducedSystems: ['state-shift'],
    mainSessionAvailable: false,
    lastMainSessionAt: 1790000000000,
    nextMainSessionAt: 1790072000000,
  });
  // `lastBreathAt` here is an ISO STRING; on the session read it is epoch ms.
  assert.equal(typeof parsed.lastBreathAt, 'string');
  assert.equal(typeof parsed.lastMainSessionAt, 'number');
  // The alignment trail is keyed by LOCAL day.
  assert.match(parsed.vision?.alignmentHistory[0]?.date ?? '', /^\d{4}-\d{2}-\d{2}$/);
  // mainSessionCount is chapter progress, not a session count: 12 here with
  // `sessionsIntoChapter.done` of 2 is a perfectly ordinary state.
  assert.equal(parsed.mainSessionCount, 12);
  assert.equal(parsed.sessionsIntoChapter.done, 2);
});

test('MindStateResponseSchema keeps the FEELING beside the state', () => {
  const parsed = MindStateResponseSchema.parse({
    logs: [
      {
        _id: '68f1c2a9b4d3e10012ab34cd',
        userId: '6ab0370000000000000f7ee0',
        state: 'stressed',
        feeling: 'Overwhelmed',
        note: 'Too many open loops.',
        timestamp: '2026-09-29T07:00:00.000Z',
        __v: 0,
      },
    ],
    todayMood: { value: 4, label: 'Pretty good', at: 1790000000000 },
  });
  // Twenty feelings collapse onto four states, and the word is the point.
  assert.equal(parsed.logs[0]?.state, 'stressed');
  assert.equal(parsed.logs[0]?.feeling, 'Overwhelmed');
  assert.equal(parsed.todayMood?.label, 'Pretty good');
  assert.deepEqual([...MIND_STATES], ['stressed', 'distracted', 'low_energy', 'locked_in']);
  assert.equal(MindStateResponseSchema.safeParse({ logs: [], todayMood: null }).success, true);
});

test('MindIdentityResponseSchema parses BOTH `{ profile: null }` and the two-field edit answer', () => {
  assert.equal(MindIdentityResponseSchema.parse({ profile: null }).profile, null);
  // PATCH action: 'edit' answers with the same key carrying a projection, which
  // is why everything but the two statements is optional.
  const edited = MindIdentityResponseSchema.parse({
    profile: { currentSelf: 'Where I am.', futureSelf: 'Who I am becoming.' },
  });
  assert.equal(edited.profile?.futureSelf, 'Who I am becoming.');

  assert.deepEqual([...MIND_STARTING_POINTS], ['lost', 'stuck', 'building', 'leveling_up']);
  assert.deepEqual(
    [...MIND_PRIMARY_OBSTACLES],
    ['clarity', 'discipline', 'motivation', 'environment'],
  );
  // The PATCH union: an `edit` with no text does not compile and does not parse.
  assert.equal(
    MindIdentityPatchRequestSchema.safeParse({ action: 'edit', tz: 0 }).success,
    false,
  );
  assert.equal(
    MindIdentityPatchRequestSchema.safeParse({ action: 'affirm', tz: 240 }).success,
    true,
  );
});

test('the streak views all report the DISPLAY streak, which is 0 once the day lapsed', () => {
  const mission = MindMissionResponseSchema.parse({
    mission: {
      _id: '68f1c2a9b4d3e10012ab34ce',
      purpose: 'Be someone my kids copy on purpose.',
      whyItMatters: 'They are watching.',
      dailyAction: 'One hard thing before noon.',
      momentumStreak: 6,
      longestMomentumStreak: 11,
      lastMovedKey: '2026-09-20',
      __v: 0,
    },
    // The stored streak is 6 and the display streak is 0: the day was missed.
    momentum: { streak: 0, longest: 11, movedToday: false },
  });
  assert.equal(mission.mission?.momentumStreak, 6);
  assert.equal(mission.momentum?.streak, 0);

  const items = MindNonNegotiablesResponseSchema.parse({
    items: [
      { id: '68f1c2a9b4d3e10012ab34cf', text: 'Phone out of the bedroom.', currentStreak: 0, longestStreak: 14, checkedToday: false },
    ],
  });
  // `id`, never `_id`: this route projects rather than handing the row back.
  assert.equal(items.items[0]?.id, '68f1c2a9b4d3e10012ab34cf');
  assert.equal(items.items[0]?.currentStreak, 0);
});

test('MindVisionResponseSchema treats an untouched alignment trail as an empty one', () => {
  // The route writes the vision with dotted `$set` paths, so the subdocument
  // default never runs and `alignmentHistory` is ABSENT until the first align.
  const parsed = MindVisionResponseSchema.parse({
    vision: { identityStatement: 'I am the person who finishes.' },
    alignment: { avg7: 0, entries7: 0, todayScore: null, checkedToday: false },
  });
  assert.deepEqual(parsed.vision?.alignmentHistory, []);
  assert.equal(parsed.alignment.checkedToday, false);
});

test('MindDisciplineResponseSchema tolerates the null challenge the POST can answer with', () => {
  // Neither action upserts, so a `complete` that never had a GET before it
  // finds no row and answers `{ challenge: null }`.
  assert.equal(MindDisciplineResponseSchema.parse({ challenge: null }).challenge, null);
  const parsed = MindDisciplineResponseSchema.parse({
    challenge: {
      _id: '68f1c2a9b4d3e10012ab34d0',
      // A 00:00Z day MARKER for the member's local day, not an instant.
      date: '2026-09-29T00:00:00.000Z',
      challenge: 'No phone for the first hour.',
      completed: true,
      completedAt: '2026-09-29T08:12:00.000Z',
      __v: 0,
    },
  });
  assert.equal(parsed.challenge?.date.slice(11), '00:00:00.000Z');
  assert.equal(
    MindDisciplineActionRequestSchema.safeParse({ action: 'skip', tz: 0 }).success,
    false,
    'the route accepts only complete | excuse',
  );
});

test('the wins and journal reads carry day markers and per-kind counts', () => {
  const wins = MindWinsResponseSchema.parse({
    wins: [
      {
        _id: '68f1c2a9b4d3e10012ab34d1',
        date: '2026-09-29T00:00:00.000Z',
        win: 'Did the hard thing before noon.',
        createdAt: '2026-09-29T16:02:00.000Z',
        __v: 0,
      },
    ],
  });
  // The marker is the local day; `createdAt` beside it is the real instant.
  assert.equal(wins.wins[0]?.date.slice(0, 10), '2026-09-29');
  assert.notEqual(wins.wins[0]?.createdAt, wins.wins[0]?.date);

  const journal = MindJournalResponseSchema.parse({
    entries: [
      {
        _id: '68f1c2a9b4d3e10012ab34d2',
        system: 'session',
        kind: 'protocol',
        title: 'Settle, then aim',
        lines: [{ prompt: 'What gets today?', answer: 'The hard thing.' }],
        createdAt: '2026-09-29T16:02:00.000Z',
        __v: 0,
      },
    ],
    counts: { protocol: 3, 'fear-breakdown': 1 },
  });
  assert.equal(journal.counts.protocol, 3);
  assert.equal(journal.entries[0]?.lines[0]?.answer, 'The hard thing.');
});

test('MindShareRequestSchema takes a single plan OR a sessions array', () => {
  assert.equal(MindShareRequestSchema.safeParse({ plan: PLAN, tz: 0 }).success, true);
  assert.equal(
    MindShareRequestSchema.safeParse({ sessions: [{ title: 'Morning', plan: PLAN }], tz: 0 }).success,
    true,
  );
  // A plan is shareable only when it is a plan: a bare title is refused.
  assert.equal(MindShareRequestSchema.safeParse({ plan: { intro: {} } }).success, false);
});

test('MindSummaryResponseSchema is the cheap read, with the same numbers flattened', () => {
  const parsed = MindSummaryResponseSchema.parse({
    todayKey: '2026-09-29',
    level: 2,
    levelPct: 13,
    chapter: 1,
    chapterName: 'Reset',
    // A NUMBER here, where /api/mind/progress sends { done, needed, toNext }.
    sessionsIntoChapter: 3,
    sessionsPerChapter: 10,
    sessionDoneToday: true,
    mainSessionAvailable: false,
    sessionsLast7Days: 4,
    moodCheckinsLast7Days: 5,
    todayMood: 4,
    lastState: { state: 'stressed', feeling: 'Overwhelmed', at: 1790000000000 },
  });
  assert.equal(parsed.sessionsIntoChapter, 3);
  assert.equal(parsed.lastState?.feeling, 'Overwhelmed');
  assert.equal(
    MindSummaryResponseSchema.parse({ ...parsed, lastState: null }).lastState,
    null,
  );
});

// ---------------------------------------------------------------------------
// The Becoming
// ---------------------------------------------------------------------------

const WEEK = {
  index: 1,
  weekKey: '2026-09-27',
  label: 'Sep 27 – Oct 3',
  isCurrent: true,
  isFirst: false,
  daysElapsed: 3,
  score: 64,
  step: 'up',
  altitude: 4.25,
  subject: 'mind',
  days: [
    { key: '2026-09-27', workout: true, workoutCount: 2, food: true, mind: true, mindSession: true, future: false },
    { key: '2026-09-28', workout: false, workoutCount: 0, food: true, mind: true, mindSession: false, future: false },
    { key: '2026-09-29', workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: false },
    { key: '2026-09-30', workout: false, workoutCount: 0, food: false, mind: false, mindSession: false, future: true },
  ],
  uses: { training: true, fuel: true, mind: true, mindMode: 'sessions' },
  mind: { sessions: 1, moodDays: 2, dominant: 'locked_in', wins: ['Did the hard thing.'], chapterUnlocked: 2 },
  nutrition: { logDays: 2, proteinDays: 1, avgCalories: 2180, weightStart: 181.2, weightEnd: 180.4, delta: -0.8 },
  training: { workouts: 2, target: 4, hit: false, prs: [{ name: 'Back Squat', e1RM: 315 }], prCount: 1 },
  headline: 'Two sessions in, one to go.',
  sub: 'Down 0.8 lb and logging.',
  said: ['workouts', 'weight'],
  tags: ['2 workouts', '-0.8 lb'],
};

const JOURNEY = {
  todayKey: '2026-09-30',
  identity: 'I am the person who finishes.',
  firstActivity: '2026-08-16',
  unit: 'lbs',
  target: { weight: 175, direction: 'lose', pace: '1 lb/wk', eta: 'mid-November' },
  weeklyTarget: 4,
  weeks: [
    {
      ...WEEK,
      index: 0,
      weekKey: '2026-08-16',
      isCurrent: false,
      isFirst: true,
      daysElapsed: 7,
      step: 'start',
      // A collapsed run of empty weeks — the indexes are NOT calendar weeks.
      gap: { weeks: 4, fromKey: '2026-08-23', toKey: '2026-09-19' },
    },
    WEEK,
  ],
  next: {
    nutrition: { key: 'nutrition.protein', title: 'Protein is the macro you miss', sub: 'Hit it 3 of the last 7 days.', severity: 'nudge', url: '/dashboard/nutrition' },
    training: { key: 'training.volume', title: 'One more session a week', sub: 'You are at 2 of 4.', severity: 'warn', url: '/dashboard/workouts' },
  },
  becomingScore: 640,
  chapter: 2,
  weights: [
    { day: '2026-09-27', value: 181.2 },
    { day: '2026-09-29', value: 180.4 },
  ],
};

test('BecomingJourneyResponseSchema parses the whole journey payload', () => {
  const parsed = BecomingJourneyResponseSchema.parse(JOURNEY);
  // Rule 1: every date is a LOCAL day key, never an instant.
  for (const key of [parsed.todayKey, parsed.firstActivity ?? '', parsed.weeks[0]!.weekKey]) {
    assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const w of parsed.weights) assert.match(w.day, /^\d{4}-\d{2}-\d{2}$/);
  // Rule 2: oldest first, and a gap card stands in for a run of empty weeks.
  assert.equal(parsed.weeks[0]?.isFirst, true);
  assert.equal(parsed.weeks[parsed.weeks.length - 1]?.isCurrent, true);
  assert.equal(parsed.weeks[0]?.gap?.weeks, 4);
  assert.equal(parsed.weeks[1]?.gap, undefined);
  // Rule 3: the card may only speak about the pillars `uses` names.
  assert.equal(parsed.weeks[1]?.uses.mindMode, 'sessions');
  // The WHOLE suggestion travels, severity included — the card ranks on it.
  assert.equal(parsed.next?.nutrition.severity, 'nudge');
  assert.equal(parsed.next?.training.severity, 'warn');
  assert.equal(parsed.unit, 'lbs');
});

test('a member with nothing yet still parses: no weeks, no target, no suggestions', () => {
  const parsed = BecomingJourneyResponseSchema.parse({
    todayKey: '2026-09-30',
    identity: null,
    firstActivity: null,
    unit: 'kg',
    target: { weight: null, direction: null, pace: null, eta: null },
    weeklyTarget: null,
    weeks: [],
    next: null,
    becomingScore: 0,
    chapter: 1,
    weights: [],
  });
  assert.deepEqual(parsed.weeks, []);
  assert.equal(parsed.next, null);
  assert.equal(parsed.firstActivity, null);
});

test('the Becoming vocabularies are the ones webapp/lib/becoming/weeks.ts declares', () => {
  assert.deepEqual([...BECOMING_STEPS], ['up', 'flat', 'down', 'start']);
  assert.deepEqual([...BECOMING_SUBJECTS], ['training', 'fuel', 'mind', 'all', 'empty']);
  assert.deepEqual([...BECOMING_SEVERITIES], ['info', 'nudge', 'warn', 'good']);
  assert.deepEqual(
    [...BECOMING_FACTS],
    ['workouts', 'prs', 'logging', 'protein', 'weight', 'sessions', 'checkins', 'state', 'chapter', 'active'],
  );
  // An unknown step is a real failure: it decides which way the path moves.
  assert.equal(
    BecomingJourneyResponseSchema.safeParse({
      ...JOURNEY,
      weeks: [{ ...WEEK, step: 'sideways' }],
    }).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// And the routes that must stay untyped
// ---------------------------------------------------------------------------

test('the routes with no live web caller are listed and have no schema', () => {
  assert.deepEqual(
    [...MIND_ROUTES_WITHOUT_SCHEMAS].sort(),
    [
      '/api/journal',
      '/api/meditation',
      '/api/mind/content/daily',
      '/api/mind/progress/levelup',
      '/api/mind/progress/xp',
      '/api/sleep',
    ],
  );
  // The enforcement lives in webapp/tests/unit/contract/np037Mind.test.ts,
  // which scans this whole package for a schema named after one of them — it
  // can read the files, and an import list here could not.
});
