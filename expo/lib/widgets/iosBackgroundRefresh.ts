/**
 * THE iOS BACKGROUND REFRESH — re-read the feed and push the timeline while
 * the app is closed.
 *
 * With `expo-widgets` the extension never fetches: it renders a timeline the
 * APP pushed earlier (`updateTimeline` in `lib/widgets/update.ts`), stored in
 * the App Group the plugin creates. Without this task the widget only changes
 * when the member opens the app — the OS redraws the last pushed timeline on
 * its own schedule, and after midnight that timeline is the sign-in prompt by
 * design (`iosTimeline.ts` rule 1), so a quiet member's widget goes quiet too.
 *
 * THE MECHANISM is `expo-background-task` (an Expo library on BGTaskScheduler:
 * fine under the no-hosted-services rule — no EAS, no expo.dev project, no
 * Expo Push). One task, `become-widgets-refresh`, defined with
 * `expo-task-manager`'s `defineTask` and registered with
 * `registerTaskAsync({ minimumInterval })` at app start on iOS only. The
 * interval is the feed's `refreshAfterSeconds` (NP-216, via `nextRefreshDate`)
 * expressed in minutes and clamped to >= 15 min — the library's own floor.
 * iOS decides when the task actually runs: the interval is a minimum delay,
 * not a schedule, and short intervals are often deferred to overnight windows.
 *
 * THE BODY (`refreshIosWidgets`) mirrors the Android headless task
 * (`lib/widgets/taskHandler.tsx`) branch for branch, because the states are
 * the same states:
 *
 *   • no stored token → the sign-in prompt (this is the "after sign-out"
 *     state: signing out clears the token AND bumps the server's counter);
 *   • a token the server no longer accepts → the prompt, and the dead token
 *     AND the snapshot are dropped rather than re-asked for 180 days;
 *   • a good token → today's numbers, cached before they are drawn;
 *   • no network → today's cache if it is today's, the prompt if not — and
 *     the token is kept, because offline says nothing about it.
 *
 * It never throws: an exception out of a background task is a widget frozen
 * on whatever it last drew, with nothing anywhere saying why. Every store,
 * every fetch and every draw is wrapped, and the fallback is the same one
 * used offline.
 */
import { Platform } from "react-native";
import { currentTzOffsetMinutes } from "@become/api-client";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import { fetchWidgetFeed, type WidgetFeedResult } from "@/lib/widgets/feed";
import {
  IOS_WIDGET_REFRESH_MIN_SECONDS,
  nextRefreshDate,
} from "@/lib/widgets/iosTimeline";
import {
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
  snapshotFromFeed,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";
import {
  clearWidgetsToken,
  loadWidgetsToken,
} from "@/lib/widgets/token";
import { drawIosWidgets } from "@/lib/widgets/update";

/** The one background task this app registers, on iOS only. */
export const IOS_WIDGETS_REFRESH_TASK = "become-widgets-refresh";

/**
 * The interval floor, in minutes — the library's own minimum, and the reason
 * `refreshIntervalMinutes` never answers below it.
 */
export const IOS_WIDGETS_REFRESH_MIN_MINUTES = 15;

export type IosWidgetsRefreshResult =
  /** No stored token: the prompt is drawn. */
  | "no-token"
  /** Feed read, snapshot saved, timelines pushed. */
  | "refreshed"
  /** The token is dead: token + snapshot cleared, the prompt drawn. */
  | "revoked"
  /** Offline: today's cache drawn if it is today's, else the prompt. */
  | "offline";

export interface IosWidgetsRefreshDeps {
  loadToken?: () => Promise<string | null>;
  clearToken?: () => Promise<void>;
  loadSnapshot?: () => Promise<WidgetSnapshot | null>;
  saveSnapshot?: (snapshot: WidgetSnapshot) => Promise<void>;
  clearSnapshot?: () => Promise<void>;
  fetchFeed?: (token: string) => Promise<WidgetFeedResult>;
  draw?: (args: {
    snapshot: WidgetSnapshot | null;
    signedIn: boolean;
    todayKey: string;
  }) => Promise<number>;
  now?: () => Date;
  tzOffsetMinutes?: () => number;
}

type ResolvedDeps = Required<IosWidgetsRefreshDeps>;

function resolveDeps(deps: IosWidgetsRefreshDeps): ResolvedDeps {
  return {
    loadToken: deps.loadToken ?? (() => loadWidgetsToken()),
    clearToken: deps.clearToken ?? (() => clearWidgetsToken()),
    loadSnapshot: deps.loadSnapshot ?? (() => loadSnapshot()),
    saveSnapshot: deps.saveSnapshot ?? ((s) => saveSnapshot(s)),
    clearSnapshot: deps.clearSnapshot ?? (() => clearSnapshot()),
    fetchFeed: deps.fetchFeed ?? ((token) => fetchWidgetFeed(token)),
    draw: deps.draw ?? ((args) => drawIosWidgets(args)),
    now: deps.now ?? (() => new Date()),
    tzOffsetMinutes:
      deps.tzOffsetMinutes ?? (() => currentTzOffsetMinutes() ?? 0),
  };
}

/**
 * Read the stored widgets token, re-read the feed, push the timelines.
 *
 * Never throws — returns which branch ran instead, so the task executor can
 * answer `BackgroundTaskResult.Success` unconditionally.
 */
export async function refreshIosWidgets(
  deps: IosWidgetsRefreshDeps = {},
): Promise<IosWidgetsRefreshResult> {
  const d = resolveDeps(deps);
  const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());

  // The prompt side of every draw: signed out, revoked, snapshot-less or
  // stale-day. `drawIosWidgets` answers the prompt everywhere when
  // `signedIn` is false — even with a snapshot still on disk — so the
  // revoked branch needs no special draw of its own.
  const drawPrompt = async (): Promise<void> => {
    await d.draw({ snapshot: null, signedIn: false, todayKey });
  };

  // The branch we are in, set on entry — so a draw that throws still reports
  // the branch, not the fallback. Defaults to "offline": anything thrown
  // before a branch is reached IS "no fresh data".
  let result: IosWidgetsRefreshResult = "offline";

  try {
    const token = await d.loadToken();
    if (!token) {
      result = "no-token";
      await drawPrompt();
      return result;
    }

    const feed = await d.fetchFeed(token);

    if (feed.kind === "ok") {
      result = "refreshed";
      const snapshot = snapshotFromFeed(feed.feed, d.now().getTime());
      // Saved BEFORE drawing, so the next refresh with no network has
      // today's numbers even if this draw is the last thing that happens.
      await d.saveSnapshot(snapshot);
      await d.draw({ snapshot, signedIn: true, todayKey });
      return result;
    }

    if (feed.kind === "revoked") {
      result = "revoked";
      // The server has stopped accepting this token: the member signed out
      // somewhere, or asked for deletion. Drop the token AND the snapshot —
      // yesterday's numbers on a signed-out tile would be another member's
      // day — and draw the prompt.
      await d.clearToken();
      await d.clearSnapshot();
      await drawPrompt();
      return result;
    }

    // Unreachable: today's cached numbers if we have them, the prompt if we
    // do not. The day check still applies — `drawIosWidgets` refuses a stale
    // day for the same reason `snapshot.ts` does — and the token is kept,
    // because offline says nothing about it.
    await d.draw({ snapshot: await d.loadSnapshot(), signedIn: true, todayKey });
    return result;
  } catch {
    // Anything unexpected (a store that threw, a module that is not there)
    // is treated as "no fresh data": the same fallback as offline, never a
    // throw out of the task and never a blank tile.
    try {
      await d.draw({
        snapshot: await d.loadSnapshot(),
        signedIn: true,
        todayKey,
      });
    } catch {
      try {
        await drawPrompt();
      } catch {
        // The draw itself threw and the prompt draw threw too: there is
        // nothing left that can paint, and still nothing worth throwing.
      }
    }
    return result;
  }
}

/**
 * The `registerTaskAsync` minimum interval, in minutes, for the feed's
 * cadence: `nextRefreshDate` (NP-216) clamped to >= 15 min, the library's
 * floor. Pure — the caller owns the clock.
 */
export function refreshIntervalMinutes(
  now: Date,
  refreshAfterSeconds?: number | null,
): number {
  const next = nextRefreshDate(now, refreshAfterSeconds).getTime();
  const minutes = Math.ceil((next - now.getTime()) / 60_000);
  return Math.max(
    IOS_WIDGETS_REFRESH_MIN_MINUTES,
    Math.max(IOS_WIDGET_REFRESH_MIN_SECONDS / 60, minutes),
  );
}

export interface IosBackgroundRefreshScheduler {
  defineTask?: (
    taskName: string,
    executor: () => Promise<unknown>,
  ) => void;
  registerTaskAsync?: (
    taskName: string,
    options: { minimumInterval?: number },
  ) => Promise<void>;
}

/**
 * Define + register the refresh task. iOS only — off iOS this is a no-op
 * that registers nothing, so the Android headless task (`taskHandler.tsx`)
 * and the web build stay exactly as they are.
 *
 * `defineTask` must run at import/startup time (the OS launches the bundle
 * headless and looks the executor up by name), while `registerTaskAsync`
 * persists the schedule. Both are injected so a test never touches the
 * native module.
 */
export async function registerIosWidgetsRefresh(
  deps: {
    platform?: string;
    now?: () => Date;
    refreshAfterSeconds?: number | null;
    scheduler?: IosBackgroundRefreshScheduler | null;
  } = {},
): Promise<boolean> {
  const platform = deps.platform ?? Platform.OS;
  if (platform !== "ios") return false;

  // An explicit null is "no module" (Expo Go, test) — and `??` would swallow
  // it, so the absence of a key is the only thing that loads the real one.
  const scheduler =
    deps.scheduler === undefined ? loadScheduler() : deps.scheduler;
  if (!scheduler?.defineTask || !scheduler?.registerTaskAsync) return false;

  scheduler.defineTask(IOS_WIDGETS_REFRESH_TASK, async () => {
    // The executor answers success unconditionally: `refreshIosWidgets`
    // never throws, and every branch — including offline — leaves the
    // correct thing on the home screen, which IS the success.
    await refreshIosWidgets();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BackgroundTaskResult } = require("expo-background-task") as {
      BackgroundTaskResult: { Success: unknown };
    };
    return BackgroundTaskResult.Success;
  });

  const now = deps.now?.() ?? new Date();
  await scheduler.registerTaskAsync(IOS_WIDGETS_REFRESH_TASK, {
    minimumInterval: refreshIntervalMinutes(now, deps.refreshAfterSeconds),
  });
  return true;
}

/**
 * The real scheduler on iOS, null everywhere else.
 *
 * Mirrors `lib/widgets/update.ts`'s loaders on purpose: a platform check in
 * one place, `require`d inside (never imported at the top) because the
 * native module exists only in a dev / store build, and a null every caller
 * already knows how to handle.
 */
export function loadScheduler(): IosBackgroundRefreshScheduler | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as {
      defineTask: IosBackgroundRefreshScheduler["defineTask"];
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BackgroundTask = require("expo-background-task") as {
      registerTaskAsync: IosBackgroundRefreshScheduler["registerTaskAsync"];
    };
    if (
      typeof TaskManager.defineTask !== "function" ||
      typeof BackgroundTask.registerTaskAsync !== "function"
    ) {
      return null;
    }
    return {
      defineTask: TaskManager.defineTask.bind(TaskManager),
      registerTaskAsync: BackgroundTask.registerTaskAsync.bind(BackgroundTask),
    };
  } catch {
    return null;
  }
}
