/**
 * THE PURE TIMELINE BUILDER FOR THE iOS WIDGETS — which entry each tile shows,
 * and when.
 *
 * WidgetKit does NOT run our fetch code: the extension cannot reach the
 * network, so it draws a TIMELINE the app pushed in — an ordered list of
 * `{ date, props }` entries per widget, where the system renders the latest
 * entry whose date has passed. This file decides those entries from the facts
 * the app already holds: the compacted feed (`lib/widgets/snapshot.ts`), whether
 * a widgets token is being held, and the device's local day.
 *
 * THREE RULES, SHARED WITH THE ANDROID DRAW (`lib/widgets/update.ts`):
 *
 *  1. **Yesterday's numbers are never drawn.** Every number in the feed is scoped
 *     to the member's local day, so a snapshot whose `todayKey` is not the
 *     device's local day is refused (`snapshotIsForDay`) and the tile falls back
 *     to the sign-in prompt instead of lying quietly.
 *  2. **A tile is never blank.** Every key gets at least one entry — a key the
 *     snapshot lacks yields the prompt for that key, never an empty timeline.
 *  3. **The day ends at midnight, on purpose.** A signed-in tile carries a second
 *     entry AT `nextLocalMidnight` with the prompt, so a phone that sits locked
 *     past midnight never shows yesterday's numbers in the morning. The midnight
 *     instant is passed IN (computed where the timezone is known), never derived
 *     here with `+ 24h` arithmetic — across a DST change a local day is 23 or 25
 *     hours long, and this file stays correct by never doing the math.
 *
 * `refreshAfterSeconds` is the cadence the feed itself advertises ("these numbers
 * stay good for this long"). It becomes a middle entry restating the row at
 * `nextRefreshDate(now, refreshAfterSeconds)` — skipped when that instant is at
 * or past midnight, where the prompt entry already takes over. Without it the
 * parameter the signature requires would be dead, and the timeline would carry
 * no trace of the server's own freshness window.
 *
 * PLATFORM-NEUTRAL ON PURPOSE: no `expo-widgets` import, no React Native import
 * — plain types and dates, so this runs in the unit suite with no device, no
 * simulator and no native module. The `url` on every entry is built with
 * `widgetTapUri` / `widgetSignInUri` (`lib/widgets/taps.ts`), which are pure
 * string functions over the same resolver every other entry point uses.
 */
import type { WidgetKey, WidgetState } from "@become/api-client";
import {
  snapshotIsForDay,
  snapshotRowFor,
  type WidgetSnapshot,
  type WidgetSnapshotRow,
} from "@/lib/widgets/snapshot";
import { widgetSignInUri, widgetTapUri } from "@/lib/widgets/taps";

/** What the prompt tile says. The one action that fixes it is opening the app. */
export const IOS_SIGN_IN_PROMPT = "Open Become to sign in" as const;

/**
 * The title on a prompt tile. The app's name, as on Android's signed-out tile
 * (`lib/widgets/render.tsx`): the tile says nothing about the member's day
 * because after a sign-out — or past midnight — this surface has no right to.
 */
export const IOS_SIGNED_OUT_TITLE = "Become";

/** A tile showing the member's day. Strings and the 0..1 fraction verbatim. */
export interface IosWidgetSignedInProps {
  signedIn: true;
  title: string;
  headline: string;
  headlineUnit: string | null;
  caption: string;
  state: WidgetState;
  /** 0..1 for the bar, or null when this widget has nothing to fill. */
  progress: number | null;
  /** `become://` uri the tap fires, from the row's `deepLink`. */
  url: string;
}

/** A tile with nothing of the member's to draw: the sign-in prompt. */
export interface IosWidgetSignedOutProps {
  signedIn: false;
  title: string;
  prompt: typeof IOS_SIGN_IN_PROMPT;
  /** The sign-in tap, as a uri. */
  url: string;
}

/** Everything one iOS widget renders. */
export type IosWidgetProps = IosWidgetSignedInProps | IosWidgetSignedOutProps;

/** One point on a widget's timeline: what to show once this instant passes. */
export interface IosTimelineEntry {
  date: Date;
  props: IosWidgetProps;
}

/**
 * Every feed key gets a timeline. `training` has no gallery widget yet — the
 * snapshot never keeps it (`snapshotFromFeed` holds the four) — so it always
 * takes the missing-row path below, which is the point: a key with no row is a
 * prompt, never a blank.
 */
export const IOS_TIMELINE_KEYS: readonly WidgetKey[] = [
  "streak",
  "nutrition",
  "mind",
  "becoming",
  "training",
];

/** WidgetKit has no documented floor here; 15 minutes keeps a quiet phone sane. */
export const IOS_REFRESH_MIN_SECONDS = 900;
/** Past six hours the numbers are about a different part of the day anyway. */
export const IOS_REFRESH_MAX_SECONDS = 21_600;
/** What the timeline assumes when the feed did not advertise a cadence. */
export const IOS_REFRESH_DEFAULT_SECONDS = 1800;

/**
 * When the row entry stops being the freshest answer: `now` plus the server's
 * advertised cadence, clamped to [15 min, 6 h]. Absent (or not a number) means
 * the 30-minute default. Pure date arithmetic on an absolute instant, so a DST
 * change between `now` and the result moves nothing.
 */
export function nextRefreshDate(
  now: Date,
  refreshAfterSeconds?: number | null,
): Date {
  const seconds =
    typeof refreshAfterSeconds === "number" &&
    Number.isFinite(refreshAfterSeconds)
      ? refreshAfterSeconds
      : IOS_REFRESH_DEFAULT_SECONDS;
  const clamped = Math.min(
    IOS_REFRESH_MAX_SECONDS,
    Math.max(IOS_REFRESH_MIN_SECONDS, seconds),
  );
  return new Date(now.getTime() + clamped * 1000);
}

/** The prompt entry: sign-in title, sign-in prompt, sign-in tap. */
function signedOutProps(): IosWidgetSignedOutProps {
  return {
    signedIn: false,
    title: IOS_SIGNED_OUT_TITLE,
    prompt: IOS_SIGN_IN_PROMPT,
    url: widgetSignInUri(),
  };
}

/**
 * The row entry. NO business logic: the strings and the fraction come from the
 * snapshot row as is — wording lives on the server (`webapp/lib/widgets/feed.ts`).
 */
function rowProps(row: WidgetSnapshotRow): IosWidgetSignedInProps {
  return {
    signedIn: true,
    title: row.title,
    headline: row.headline,
    headlineUnit: row.headlineUnit,
    caption: row.caption,
    state: row.state,
    progress: row.progress,
    url: widgetTapUri(row.deepLink),
  };
}

export interface BuildIosTimelineArgs {
  /** The compacted feed, or null when the app holds none. */
  snapshot: WidgetSnapshot | null;
  /** Is a widgets token being held for this member? False draws the prompt. */
  signedIn: boolean;
  /** The instant the timeline is built for. */
  now: Date;
  /** The device's local day (YYYY-MM-DD), so yesterday's snapshot is refused. */
  todayKey: string;
  /** The next local midnight as an absolute instant — computed by the caller. */
  nextLocalMidnight: Date;
  /** The feed's advertised cadence, when the snapshot carried one. */
  refreshAfterSeconds?: number | null;
}

/**
 * One timeline per feed key.
 *
 * Signed out, no snapshot, or a snapshot for another day: ONE entry at `now`
 * with the prompt — a snapshot from yesterday is never drawn. Signed in with
 * today's snapshot: the row at `now`, the row restated at the refresh point
 * (unless midnight comes first), and the prompt AT `nextLocalMidnight` so the
 * tile never shows yesterday's numbers after midnight. A key the snapshot lacks
 * gets the prompt at `now`, never a blank.
 */
export function buildIosTimeline({
  snapshot,
  signedIn,
  now,
  todayKey,
  nextLocalMidnight,
  refreshAfterSeconds,
}: BuildIosTimelineArgs): Record<WidgetKey, IosTimelineEntry[]> {
  const usable: WidgetSnapshot | null =
    signedIn && snapshot && snapshotIsForDay(snapshot, todayKey)
      ? snapshot
      : null;
  const refresh = nextRefreshDate(now, refreshAfterSeconds);
  const restateBeforeMidnight =
    refresh.getTime() < nextLocalMidnight.getTime();

  const timeline = {} as Record<WidgetKey, IosTimelineEntry[]>;
  for (const key of IOS_TIMELINE_KEYS) {
    const row = usable ? snapshotRowFor(usable, key) : null;
    if (!row) {
      timeline[key] = [{ date: now, props: signedOutProps() }];
      continue;
    }
    const entries: IosTimelineEntry[] = [{ date: now, props: rowProps(row) }];
    if (restateBeforeMidnight) {
      entries.push({ date: refresh, props: rowProps(row) });
    }
    entries.push({ date: nextLocalMidnight, props: signedOutProps() });
    timeline[key] = entries;
  }
  return timeline;
}
