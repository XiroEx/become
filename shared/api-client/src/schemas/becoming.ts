import { z } from 'zod';
import { MindStateSchema } from './mind';

// ===========================================================================
// THE BECOMING — the wire contract for /api/becoming/journey (NP-037)
//
// One route, one payload, and it is the biggest single read in the app: every
// week of the member's life in Become, scored across the three pillars, placed
// on a path, with the story line for each. Mirrors
// webapp/lib/becoming/journey.ts#JourneyPayload and the `WeekSnapshot` /
// `DayProof` / `PillarUse` shapes in webapp/lib/becoming/weeks.ts.
//
// Three rules travel with it, asserted by
// webapp/tests/unit/contract/np037Mind.test.ts:
//
//   1. A `weekKey`, a `todayKey`, a `firstActivity`, a `days[].key` and a
//      `weights[].day` are all YYYY-MM-DD DAY KEYS in the member's LOCAL zone,
//      computed from the request's `tz`. None of them is an instant, and none of
//      them may be put through a timezone offset a second time on the client.
//   2. `weeks` runs OLDEST FIRST and is capped at 52. A run of at least three
//      empty weeks COLLAPSES into a single snapshot carrying `gap`, so the
//      indexes are not contiguous calendar weeks and a client must not compute
//      a date from `index`.
//   3. `uses` says which pillars this member was actually using around that
//      week. A card may only speak about the pillars it names: telling a member
//      who has never opened Mind that they did 0 of 7 sessions, every week,
//      forever, is a fact about a feature they declined.
//
// `.passthrough()` for the same reason as everywhere else: a shipped store
// build has to survive a server that grew a field.
// ===========================================================================

/** Which pillar a week was mostly about — it colours the tile. */
export const BECOMING_SUBJECTS = [
  'training',
  'fuel',
  'mind',
  'all',
  'empty',
] as const;

export const BecomingSubjectSchema = z.enum(BECOMING_SUBJECTS);

/** How the path moves INTO this week. `start` is the very first week. */
export const BECOMING_STEPS = ['up', 'flat', 'down', 'start'] as const;

export const BecomingStepSchema = z.enum(BECOMING_STEPS);

/**
 * A fact a card can state about a week. The headline and the highlights draw
 * from one list, so `said` is how the card knows not to print a fact twice.
 */
export const BECOMING_FACTS = [
  'workouts',
  'prs',
  'logging',
  'protein',
  'weight',
  'sessions',
  'checkins',
  'state',
  'chapter',
  'active',
] as const;

export const BecomingFactSchema = z.enum(BECOMING_FACTS);

/** The direction a weight target moves in. */
export const BecomingDirectionSchema = z.enum(['lose', 'maintain', 'gain']);

/** How urgent a suggestion is — `Severity` in webapp/lib/goals/suggestions.ts. */
export const BECOMING_SEVERITIES = ['info', 'nudge', 'warn', 'good'] as const;

export const BecomingSeveritySchema = z.enum(BECOMING_SEVERITIES);

export type BecomingSubject = z.infer<typeof BecomingSubjectSchema>;
export type BecomingStep = z.infer<typeof BecomingStepSchema>;
export type BecomingFact = z.infer<typeof BecomingFactSchema>;
export type BecomingSeverity = z.infer<typeof BecomingSeveritySchema>;

/**
 * One pillar's "what to work on next".
 *
 * The WHOLE suggestion travels, severity included: the live card ranks the two
 * against each other and cannot do that from the copy alone. These are the same
 * objects `/api/goals` returns and the nudge cron sends, so the page and the
 * notification always say the same thing.
 */
export const BecomingSuggestionSchema = z
  .object({
    /** Stable id, used as the notification tag / dedupe key. */
    key: z.string(),
    title: z.string(),
    sub: z.string(),
    severity: BecomingSeveritySchema,
    /** A RELATIVE web path. Native maps it to a route; it is not a URL to open. */
    url: z.string(),
  })
  .passthrough();

/** A day inside a week — rule 1: `key` is a local day key. */
export const BecomingDayProofSchema = z
  .object({
    key: z.string(),
    workout: z.boolean(),
    /**
     * Workouts that day. Two sessions in one day is two workouts, and the card
     * compares this week against the same days of the week before — a boolean
     * would report that as "the same as last week".
     */
    workoutCount: z.number(),
    food: z.boolean(),
    /** Anything on the mind side: a session, a mood check-in or a state log. */
    mind: z.boolean(),
    /** A completed Mind SESSION specifically — the number the card reports. */
    mindSession: z.boolean(),
    /** A day later than today, on the live week. */
    future: z.boolean(),
  })
  .passthrough();

/** Rule 3 — which pillars this member was using around this week. */
export const BecomingPillarUseSchema = z
  .object({
    training: z.boolean(),
    fuel: z.boolean(),
    mind: z.boolean(),
    /** How they use Mind when they do: real sessions, or only the check-in. */
    mindMode: z.enum(['sessions', 'checkins']).nullish(),
  })
  .passthrough();

/** A collapsed run of empty weeks — rule 2. */
export const BecomingGapSchema = z
  .object({
    weeks: z.number(),
    fromKey: z.string(),
    toKey: z.string(),
  })
  .passthrough();

export const BecomingPrSchema = z
  .object({
    name: z.string(),
    /** Estimated one-rep max, rounded. */
    e1RM: z.number(),
  })
  .passthrough();

export const BecomingWeekMindSchema = z
  .object({
    sessions: z.number(),
    moodDays: z.number(),
    /** The state they were in most that week. */
    dominant: MindStateSchema.nullish(),
    wins: z.array(z.string()).default([]),
    chapterUnlocked: z.number().nullish(),
  })
  .passthrough();

export const BecomingWeekNutritionSchema = z
  .object({
    logDays: z.number(),
    proteinDays: z.number(),
    avgCalories: z.number().nullish(),
    /** In the member's own unit (`unit` on the payload), never kg on the wire. */
    weightStart: z.number().nullish(),
    weightEnd: z.number().nullish(),
    delta: z.number().nullish(),
  })
  .passthrough();

export const BecomingWeekTrainingSchema = z
  .object({
    workouts: z.number(),
    /** The member's committed sessions per week; null when unknown. */
    target: z.number().nullish(),
    hit: z.boolean(),
    prs: z.array(BecomingPrSchema).default([]),
    prCount: z.number(),
  })
  .passthrough();

/** One week of the Becoming. */
export const BecomingWeekSchema = z
  .object({
    /** Position in `weeks`, NOT a week number — rule 2. */
    index: z.number(),
    /** The Sunday that starts the week, as a local day key. */
    weekKey: z.string(),
    label: z.string(),
    isCurrent: z.boolean(),
    isFirst: z.boolean(),
    /** 1–7 on the live week; 7 on a frozen one. */
    daysElapsed: z.number(),
    /** 0–100 consistency across the pillars this member uses. */
    score: z.number(),
    step: BecomingStepSchema,
    /** Cumulative height. It stagnates rather than diving; it floors at 0. */
    altitude: z.number(),
    subject: BecomingSubjectSchema,
    /** Sunday..Saturday. */
    days: z.array(BecomingDayProofSchema).default([]),
    gap: BecomingGapSchema.optional(),
    uses: BecomingPillarUseSchema,
    mind: BecomingWeekMindSchema,
    nutrition: BecomingWeekNutritionSchema,
    training: BecomingWeekTrainingSchema,
    headline: z.string(),
    sub: z.string(),
    /** Facts the headline/sub already state — the card leaves them out. */
    said: z.array(BecomingFactSchema).default([]),
    tags: z.array(z.string()).default([]),
  })
  .passthrough();

/** The weight target the story compares against, in the member's unit. */
export const BecomingTargetSchema = z
  .object({
    weight: z.number().nullish(),
    direction: BecomingDirectionSchema.nullish(),
    /** Pre-formatted, e.g. "1 lb/wk". Display only. */
    pace: z.string().nullish(),
    /** Pre-formatted ETA. Display only. */
    eta: z.string().nullish(),
  })
  .passthrough();

/** GET /api/becoming/journey. */
export const BecomingJourneyResponseSchema = z
  .object({
    /** Rule 1 — the member's local day. */
    todayKey: z.string(),
    /** Their vision's identity statement, if they wrote one. */
    identity: z.string().nullish(),
    /** The local day key of the first event of any kind. Null for a new member. */
    firstActivity: z.string().nullish(),
    /** Every weight on this payload is in this unit. */
    unit: z.enum(['lbs', 'kg']),
    target: BecomingTargetSchema,
    /** Committed sessions per week; null when the member never said. */
    weeklyTarget: z.number().nullish(),
    /** Oldest first, 52 maximum, gaps collapsed — rule 2. */
    weeks: z.array(BecomingWeekSchema).default([]),
    next: z
      .object({
        nutrition: BecomingSuggestionSchema,
        training: BecomingSuggestionSchema,
      })
      .passthrough()
      .nullable(),
    /** MindProgress.xpBank — the lifetime score. Never decreases. */
    becomingScore: z.number(),
    chapter: z.number(),
    /** Every weigh-in by local day key, oldest first. */
    weights: z
      .array(z.object({ day: z.string(), value: z.number() }).passthrough())
      .default([]),
  })
  .passthrough();

export type BecomingSuggestion = z.infer<typeof BecomingSuggestionSchema>;
export type BecomingDayProof = z.infer<typeof BecomingDayProofSchema>;
export type BecomingPillarUse = z.infer<typeof BecomingPillarUseSchema>;
export type BecomingGap = z.infer<typeof BecomingGapSchema>;
export type BecomingPr = z.infer<typeof BecomingPrSchema>;
export type BecomingWeek = z.infer<typeof BecomingWeekSchema>;
export type BecomingTarget = z.infer<typeof BecomingTargetSchema>;
export type BecomingJourneyResponse = z.infer<
  typeof BecomingJourneyResponseSchema
>;
