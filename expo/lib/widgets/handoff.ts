/**
 * WHAT THE APP DOES FOR ITS WIDGETS — at every open, and at sign-out.
 *
 * Two jobs, and the second one is the one the card names:
 *
 *  1. **At open (signed in): hand the token over and redraw.** The contract the
 *     server was built against is "ask for a fresh token at each open, store
 *     nothing longer, and read only the summary" (AGENTS.md § The widgets
 *     token). Minting writes nothing and costs one request, and it is what makes
 *     revocation cheap: a bump of `widgetTokenVersion` kills every old token and
 *     the next open replaces it. The feed read that follows is what makes the
 *     tiles correct NOW — the OS's own refresh has a 30-minute floor, so without
 *     this a member who logs a meal watches a stale calorie count for half an
 *     hour.
 *
 *  2. **At sign-out: forget and redraw.** The server side already happens
 *     (`POST /api/auth/logout` bumps the counter, `lib/auth/AuthProvider.tsx`).
 *     This is the device side: drop the token, drop the cached day, and push the
 *     sign-in prompt onto all four tiles immediately rather than leaving the
 *     member's streak and calories on the home screen of a phone they just
 *     signed out of.
 *
 * Everything here is best-effort and returns a verdict instead of throwing. A
 * launch may not fail because a widget could not be fed, and a sign-out may
 * never fail at all.
 */
import { currentTzOffsetMinutes } from "@become/api-client";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import { fetchWidgetFeed, type WidgetFeedResult } from "@/lib/widgets/feed";
import {
  clearSnapshot,
  saveSnapshot,
  snapshotFromFeed,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";
import {
  clearWidgetsToken,
  mintWidgetsToken,
  storeWidgetsToken,
  type MintWidgetsTokenResult,
} from "@/lib/widgets/token";
import { drawAndroidWidgets, hasWidgetSurface } from "@/lib/widgets/update";

export type WidgetHandoffResult =
  /** Token minted, stored, feed read and the tiles redrawn. */
  | "handed-off"
  /** This platform has no widget surface yet (iOS, until NP-181). */
  | "unsupported"
  /** Token minted and stored; the feed read did not land, tiles left alone. */
  | "token-only"
  /** The server refused: the stored token and snapshot are gone, prompt drawn. */
  | "refused"
  /** Offline. Nothing changed; the tiles keep painting from their snapshot. */
  | "unreachable";

export interface WidgetHandoffDeps {
  mint?: (sessionToken: string) => Promise<MintWidgetsTokenResult>;
  storeToken?: (token: string) => Promise<void>;
  clearToken?: () => Promise<void>;
  fetchFeed?: (token: string) => Promise<WidgetFeedResult>;
  saveSnapshot?: (snapshot: WidgetSnapshot) => Promise<void>;
  clearSnapshot?: () => Promise<void>;
  draw?: (args: {
    snapshot: WidgetSnapshot | null;
    signedIn: boolean;
    todayKey: string;
  }) => Promise<number>;
  now?: () => Date;
  tzOffsetMinutes?: () => number;
  /** Is there a widget surface on this platform? Defaults to `hasWidgetSurface`. */
  hasSurface?: () => boolean;
}

type Resolved = Required<WidgetHandoffDeps>;

function resolve(deps: WidgetHandoffDeps): Resolved {
  return {
    mint: deps.mint ?? ((session) => mintWidgetsToken(session)),
    storeToken: deps.storeToken ?? ((token) => storeWidgetsToken(token)),
    clearToken: deps.clearToken ?? (() => clearWidgetsToken()),
    fetchFeed: deps.fetchFeed ?? ((token) => fetchWidgetFeed(token)),
    saveSnapshot: deps.saveSnapshot ?? ((s) => saveSnapshot(s)),
    clearSnapshot: deps.clearSnapshot ?? (() => clearSnapshot()),
    draw: deps.draw ?? ((args) => drawAndroidWidgets(args)),
    hasSurface: deps.hasSurface ?? hasWidgetSurface,
    now: deps.now ?? (() => new Date()),
    tzOffsetMinutes:
      deps.tzOffsetMinutes ?? (() => currentTzOffsetMinutes() ?? 0),
  };
}

/**
 * Mint the widgets token for this session, store it where the widget refresh
 * reads it, and redraw the tiles with a fresh feed.
 */
export async function handOffWidgetsToken(
  sessionToken: string,
  deps: WidgetHandoffDeps = {},
): Promise<WidgetHandoffResult> {
  const d = resolve(deps);
  // Nothing to feed on this platform: minting here would be a request at every
  // app open for a credential nothing reads.
  if (!d.hasSurface()) return "unsupported";

  const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());

  const minted = await d.mint(sessionToken);

  if (minted.kind === "refused") {
    // The session is finished, or a deletion is pending. Either way the home
    // screen must stop showing this member's day: the app is about to sign them
    // out (a 401 reaches the unauthorized handler through their next real
    // request) and the widgets should not be the last thing still holding on.
    await d.clearToken();
    await d.clearSnapshot();
    await d.draw({ snapshot: null, signedIn: false, todayKey });
    return "refused";
  }

  if (minted.kind === "unreachable") return "unreachable";

  await d.storeToken(minted.token);

  const feed = await d.fetchFeed(minted.token);
  if (feed.kind !== "ok") {
    // A token we could mint but a feed we could not read: keep the token (it is
    // good, and the OS refresh will use it) and leave the tiles as they are.
    return "token-only";
  }

  const snapshot = snapshotFromFeed(feed.feed, d.now().getTime());
  await d.saveSnapshot(snapshot);
  await d.draw({ snapshot, signedIn: true, todayKey });
  return "handed-off";
}

/**
 * Sign the widgets out: forget the token, forget the day, draw the prompt.
 *
 * Runs on a DELIBERATE sign-out and on any other end of a session the app
 * notices, because both leave the same wrong thing on the home screen. It is
 * idempotent — a launch that was already signed out simply redraws the prompt.
 */
export async function clearWidgetsHandoff(
  deps: WidgetHandoffDeps = {},
): Promise<void> {
  const d = resolve(deps);
  if (!d.hasSurface()) return;

  const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());
  await d.clearToken();
  await d.clearSnapshot();
  await d.draw({ snapshot: null, signedIn: false, todayKey });
}
