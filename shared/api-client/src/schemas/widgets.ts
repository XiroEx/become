import { z } from 'zod';

/**
 * GET /api/widgets/summary — everything a home-screen / lock-screen widget
 * needs to draw, in one request.
 *
 * Mirrors webapp/lib/widgets/feed.ts:21-75 exactly. A widget is not a small
 * web page: it is drawn by the OS on a timeline with no network at paint time
 * and no JS, so every wording decision is already made on the server. The big
 * number is a STRING, the caption is a STRING, and the only numbers that cross
 * the wire are the 0..1 fractions a ring or bar needs. A renderer that had to
 * decide what "at risk" means would eventually disagree with the app.
 */

/** The five widgets, in gallery order. */
export const WidgetKeySchema = z.enum([
  'streak',
  'nutrition',
  'mind',
  'becoming',
  'training',
]);

/** Whether to draw the surface lit (`done`), nudging (`todo`), warning
 *  (`at-risk`) or resting (`none` — nothing set up yet, so say so rather than
 *  showing a hollow zero). */
export const WidgetStateSchema = z.enum(['none', 'todo', 'done', 'at-risk']);

/** One macro ring/bar. `pct` is null when the member has no target for it. */
export const WidgetRingSchema = z
  .object({
    key: z.enum(['calories', 'protein', 'carbs', 'fats']),
    label: z.string(),
    value: z.number(),
    target: z.number().nullish(),
    pct: z.number().nullish(),
    unit: z.string(),
  })
  .passthrough();

export const BecomeWidgetSchema = z
  .object({
    key: WidgetKeySchema,
    /** Widget-gallery name, and the small header a medium widget draws. */
    title: z.string(),
    /** The one big thing. Already a string — "12", "Rest day", "Ready". */
    headline: z.string(),
    /** Small trailing unit, e.g. "days". Null when there isn't one. */
    headlineUnit: z.string().nullish(),
    /** One short line under the headline. Never empty. */
    caption: z.string(),
    state: WidgetStateSchema,
    /** 0..1 for a ring or bar. Null when this widget has nothing to fill. */
    progress: z.number().nullish(),
    /** Only the nutrition widget fills this; everything else ships []. */
    rings: z.array(WidgetRingSchema).default([]),
    /** In-app path a tap opens. Relative — the client joins its own origin. */
    deepLink: z.string(),
  })
  .passthrough();

export const WidgetFeedSchema = z
  .object({
    /** Epoch ms the snapshot was built — "updated 3m ago". */
    generatedAt: z.number().optional(),
    /** The member's LOCAL day this snapshot describes (YYYY-MM-DD). */
    todayKey: z.string().optional(),
    /** How long the snapshot stays good for. A timeline asks for the next
     *  refresh rather than polling blind. */
    refreshAfterSeconds: z.number().optional(),
    widgets: z.array(BecomeWidgetSchema).default([]),
    /** What to draw on the app ICON — daily commitments still open. 0 means
     *  "clear the badge", never "draw a zero". */
    badgeCount: z.number().optional(),
  })
  .passthrough();

/**
 * POST /api/widgets/token — trade a full session for the READ-ONLY credential an
 * OS widget surface holds.
 *
 * Mirrors webapp/app/api/widgets/token/route.ts:60-69. A widget surface is a
 * different process with a different lifetime, so it never holds the member's
 * 30-day session: `scope: 'widgets'` is refused by every route in the app
 * except `GET /api/widgets/summary` (`verifyAuth` is default-deny for scoped
 * tokens). `scope` is a literal for that reason — a response that came back
 * with any other scope is not a widgets token and must not be stored as one.
 *
 * `refreshAfterSeconds` is the cadence the feed itself advertises, so a surface
 * configuring its refresh reads one number from the server rather than
 * inventing a tighter one.
 */
export const WidgetTokenResponseSchema = z
  .object({
    token: z.string().min(1),
    scope: z.literal('widgets'),
    /** Lifetime in seconds (180 days today — an OS refresh budget is hours). */
    expiresIn: z.number().optional(),
    expiresAt: z.string().optional(),
    refreshAfterSeconds: z.number().optional(),
  })
  .passthrough();

export type WidgetKey = z.infer<typeof WidgetKeySchema>;
export type WidgetTokenResponse = z.infer<typeof WidgetTokenResponseSchema>;
export type WidgetState = z.infer<typeof WidgetStateSchema>;
export type WidgetRing = z.infer<typeof WidgetRingSchema>;
export type BecomeWidget = z.infer<typeof BecomeWidgetSchema>;
export type WidgetFeed = z.infer<typeof WidgetFeedSchema>;
