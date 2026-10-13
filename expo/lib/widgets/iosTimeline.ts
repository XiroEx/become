/**
 * THE iOS TIMELINE, AS PURE DATA — which entry each WidgetKit widget shows, and when.
 *
 * WidgetKit does not run our code at paint time: it renders a TIMELINE the app
 * pushed earlier (`updateTimeline([{ date, props }])` from `expo-widgets`), one
 * entry per date, showing the latest entry whose date has passed. So the only
 * two decisions are what each widget shows NOW and what it shows after the day
 * rolls over — everything else is the OS's schedule, not ours.
 *
 * THREE RULES IT KEEPS:
 *
 *  1. **Today's numbers, then the prompt — never yesterday's numbers.** A
 *     signed-in widget with today's snapshot draws its row at `now` and the
 *     sign-in prompt at `nextLocalMidnight`, so a widget the OS redraws after
 *     midnight cannot show a day that has ended (`snapshot.ts` refuses a stale
 *     day for the same reason). Signed out, revoked, snapshot-less or
 *     stale-day: the prompt at `now`, one entry, nothing else.
 *  2. **No date arithmetic here, so no DST arithmetic either.** `now` and
 *     `nextLocalMidnight` arrive as instants the caller resolved in the
 *     member's zone; the midnight entry uses the handed-in instant verbatim.
 *     A fall-back night is 25 hours long and a spring-forward one 23 — a
 *     builder that added 24 hours would plant the rollover an hour off, in
 *     exactly the direction that shows yesterday's numbers (or hides today's).
 *  3. **Never a blank.** A key the snapshot lacks gets the prompt for that
 *     key, not an empty timeline — a blank widget reads as a broken app and
 *     raises no error anywhere.
 *
 * PLATFORM-NEUTRAL ON PURPOSE. This file imports no `expo-widgets` and no
 * React Native: the APP (or its background task) reads the feed, compacts it
 * (`snapshot.ts`) and pushes what this builds. `__tests__/iosTimeline.test.ts`
 * runs it in plain jest for that reason.
 */
import type { WidgetKey, WidgetState } from "@become/api-client";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  snapshotIsForDay,
  snapshotRowFor,
  type WidgetSnapshot,
  type WidgetSnapshotRing,
  type WidgetSnapshotRow,
} from "@/lib/widgets/snapshot";
import { widgetSignInUri, widgetTapUri } from "@/lib/widgets/taps";

/** What a widget without numbers says, in every gallery entry. */
export const IOS_WIDGET_SIGN_IN_PROMPT = "Open Become to sign in" as const;

/**
 * Everything one iOS widget renders. Either today's numbers — copied from the
 * snapshot row as is, no re-wording, no re-derived state — or the sign-in
 * prompt. `url` is the tap target as a `become://` url the OS can fire.
 * `rings` is the nutrition row's macro rings (empty everywhere else); the
 * medium tile draws one mini-bar per ring.
 */
export type IosWidgetProps =
  | {
      signedIn: true;
      title: string;
      headline: string;
      headlineUnit: string | null;
      caption: string;
      state: WidgetState;
      /** 0..1 for the bar, or null when this widget has nothing to fill. */
      progress: number | null;
      rings: WidgetSnapshotRing[];
      url: string;
    }
  | {
      signedIn: false;
      title: string;
      prompt: typeof IOS_WIDGET_SIGN_IN_PROMPT;
      url: string;
    };

/** One WidgetKit timeline entry: what to draw, starting when. */
export interface IosTimelineEntry {
  date: Date;
  props: IosWidgetProps;
}

export interface BuildIosTimelineArgs {
  /** The compacted feed, or null when the app holds none. */
  snapshot: WidgetSnapshot | null;
  /** False draws the prompt everywhere — even with a snapshot still on disk. */
  signedIn: boolean;
  /** The instant the timeline starts at. The caller owns the clock. */
  now: Date;
  /** The device's local day, so a snapshot from yesterday is never drawn. */
  todayKey: string;
  /**
   * The next local midnight as an instant, resolved by the caller in the
   * member's zone. Used verbatim — this builder does no date arithmetic.
   */
  nextLocalMidnight: Date;
  /**
   * The cadence the feed advertises, in seconds. Accepted here so a caller
   * holding the feed passes one object straight through — but the ENTRIES are
   * bounded by the local day, not by this number. Freshness is
   * `nextRefreshDate`'s job, consumed by the push scheduler, not by the
   * timeline.
   */
  refreshAfterSeconds?: number | null;
}

/** A row, verbatim, plus its tap target. */
function rowProps(row: WidgetSnapshotRow): IosWidgetProps {
  return {
    signedIn: true,
    title: row.title,
    headline: row.headline,
    headlineUnit: row.headlineUnit,
    caption: row.caption,
    state: row.state,
    progress: row.progress,
    rings: row.rings ?? [],
    url: widgetTapUri(row.deepLink),
  };
}

/** The prompt for one widget — titled by its gallery entry, never blank. */
function promptProps(key: WidgetKey): IosWidgetProps {
  const title =
    IOS_WIDGETS.find((widget) => widget.feedKey === key)?.displayName ??
    "Become";
  return {
    signedIn: false,
    title,
    prompt: IOS_WIDGET_SIGN_IN_PROMPT,
    url: widgetSignInUri(),
  };
}

/**
 * One timeline per widget, keyed by feed key.
 *
 * Signed in with today's snapshot: the row at `now`, the prompt at
 * `nextLocalMidnight` — a key the snapshot lacks prompts at both dates.
 * Anything else (signed out, no snapshot, another day's snapshot): the prompt
 * at `now`, one entry per key.
 */
export function buildIosTimeline(
  args: BuildIosTimelineArgs,
): Record<WidgetKey, IosTimelineEntry[]> {
  const { snapshot, signedIn, now, todayKey, nextLocalMidnight } = args;
  // A snapshot from yesterday is never drawn (see `snapshot.ts`): without a
  // signed-in member AND today's snapshot there is no row anywhere.
  const fresh =
    signedIn && snapshotIsForDay(snapshot, todayKey) ? snapshot : null;
  const timeline = {} as Record<WidgetKey, IosTimelineEntry[]>;
  for (const definition of IOS_WIDGETS) {
    if (!fresh) {
      timeline[definition.feedKey] = [
        { date: now, props: promptProps(definition.feedKey) },
      ];
      continue;
    }
    const row = snapshotRowFor(fresh, definition.feedKey);
    timeline[definition.feedKey] = [
      {
        date: now,
        props: row ? rowProps(row) : promptProps(definition.feedKey),
      },
      { date: nextLocalMidnight, props: promptProps(definition.feedKey) },
    ];
  }
  return timeline;
}

/** The fastest a widget may ask to be pushed again — 15 minutes. */
export const IOS_WIDGET_REFRESH_MIN_SECONDS = 15 * 60;
/** The slowest — 6 hours. Past that the day has rolled over twice over. */
export const IOS_WIDGET_REFRESH_MAX_SECONDS = 6 * 60 * 60;
/** When the feed advertises no cadence — 30 minutes. */
export const IOS_WIDGET_REFRESH_DEFAULT_SECONDS = 30 * 60;

/**
 * When the app should push the timeline again: `now + refreshAfterSeconds`,
 * clamped to [15 min, 6 h], 30 min when the feed names no cadence (or names a
 * nonsense one). Pure — the caller owns the clock.
 */
export function nextRefreshDate(
  now: Date,
  refreshAfterSeconds?: number | null,
): Date {
  const advertised =
    typeof refreshAfterSeconds === "number" &&
    Number.isFinite(refreshAfterSeconds)
      ? refreshAfterSeconds
      : IOS_WIDGET_REFRESH_DEFAULT_SECONDS;
  const clamped = Math.min(
    IOS_WIDGET_REFRESH_MAX_SECONDS,
    Math.max(IOS_WIDGET_REFRESH_MIN_SECONDS, advertised),
  );
  return new Date(now.getTime() + clamped * 1000);
}
