/**
 * THE iOS BACKGROUND REFRESH — re-read the feed and push the timeline while
 * the app is closed.
 *
 * With `expo-widgets` the extension never fetches: it renders a timeline the
 * APP pushed earlier (`updateTimeline` in `lib/widgets/update.ts`), stored in
 * the App Group the plugin creates. Without this task the widget only changes
 * when the member opens the app — the OS redraws the last pushed timeline and
 * nothing else.
 *
 * THE MECHANISM is `expo-background-task` (an Expo LIBRARY on BGTaskScheduler
 * — not a hosted service, so it is fine under the NP-040 rules in AGENTS.md:
 * no EAS, no expo.dev project, no Expo Push). One task,
 * `become-widgets-refresh`, defined with `TaskManager.defineTask` and
 * registered at app start from `expo/index.js` on iOS only. Its body is
 * `refreshIosWidgets` below: read the stored widgets token, read the feed,
 * compact it (`snapshot.ts`) and push it (`drawIosWidgets`).
 *
 * FOUR BRANCHES, mirroring the Android headless task (`taskHandler.tsx`):
 *
 *   • no token — signed out as far as the home screen is concerned: draw the
 *     prompt, done;
 *   • ok — `saveSnapshot` BEFORE drawing, so the next refresh with no network
 *     still has today's numbers, then push the timelines;
 *   • revoked (401/403 — sign-out elsewhere, deletion) — clear the token AND
 *     the snapshot, then draw the prompt, so no stale numbers survive;
 *   • unreachable — keep the token, draw from the stored snapshot. The day
 *     check still applies inside the draw: a snapshot from yesterday is never
 *     painted as today.
 *
 * NEVER THROWS. An exception out of a background task is a widget frozen on
 * whatever it drew last, with nothing anywhere saying why — so the whole body
 * is wrapped and the fallback is the same offline paint.
 *
 * THE INTERVAL comes from the feed's `refreshAfterSeconds` (NP-216's
 * `nextRefreshDate` bounds: 15 min floor, 6 h ceiling, 30 min default),
 * converted to the minutes `minimumInterval` wants. iOS treats it as a
 * minimum delay, not a schedule — see `IOS_QUIRKS.md`.
 */
import { Platform } from "react-native";
import { currentTzOffsetMinutes } from "@become/api-client";
import { localDayStamp } from "@/lib/timezone/reportTimezone";
import { fetchWidgetFeed, type WidgetFeedResult } from "@/lib/widgets/feed";
import {
  IOS_WIDGET_REFRESH_DEFAULT_SECONDS,
  IOS_WIDGET_REFRESH_MAX_SECONDS,
  IOS_WIDGET_REFRESH_MIN_SECONDS,
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
 * What one background run did. `no-token` and `revoked` both end on the
 * sign-in prompt; only `refreshed` wrote anything.
 */
export type IosWidgetsRefreshResult =
  /** No stored widgets token: drew the prompt, done. */
  | "no-token"
  /** Feed read, snapshot saved, timelines pushed. */
  | "refreshed"
  /** The token is dead: cleared the token + snapshot, drew the prompt. */
  | "revoked"
  /** Offline or anything unexpected: painted the stored snapshot, kept the token. */
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
  /**
   * Re-register the task with the feed's cadence after a successful read.
   * Defaults to the real registration; an interval hint only, so a failure
   * here never fails the refresh.
   */
  reschedule?: (refreshAfterSeconds: number | null) => Promise<void>;
  now?: () => Date;
  /** Minutes WEST of UTC. Injectable so a test is not the machine's zone. */
  tzOffsetMinutes?: () => number;
}

type ResolvedRefreshDeps = Required<IosWidgetsRefreshDeps>;

function resolveRefreshDeps(deps: IosWidgetsRefreshDeps): ResolvedRefreshDeps {
  return {
    loadToken: deps.loadToken ?? (() => loadWidgetsToken()),
    clearToken: deps.clearToken ?? (() => clearWidgetsToken()),
    loadSnapshot: deps.loadSnapshot ?? (() => loadSnapshot()),
    saveSnapshot: deps.saveSnapshot ?? ((s) => saveSnapshot(s)),
    clearSnapshot: deps.clearSnapshot ?? (() => clearSnapshot()),
    fetchFeed: deps.fetchFeed ?? ((token) => fetchWidgetFeed(token)),
    draw: deps.draw ?? ((args) => drawIosWidgets(args)),
    reschedule:
      deps.reschedule ??
      ((seconds) => {
        void registerIosWidgetsRefresh({ refreshAfterSeconds: seconds });
        return Promise.resolve();
      }),
    now: deps.now ?? (() => new Date()),
    tzOffsetMinutes: deps.tzOffsetMinutes ?? (() => currentTzOffsetMinutes() ?? 0),
  };
}

/**
 * One background run: re-read the feed and push the timelines.
 *
 * Never throws — every caller is the OS, and neither a launch nor a widget
 * may fail because this could not reach the network.
 */
export async function refreshIosWidgets(
  deps: IosWidgetsRefreshDeps = {},
): Promise<IosWidgetsRefreshResult> {
  const d = resolveRefreshDeps(deps);
  try {
    const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());

    const token = await d.loadToken();
    if (!token) {
      // Signed out — and the tiles say exactly that.
      await d.draw({ snapshot: null, signedIn: false, todayKey });
      return "no-token";
    }

    const result = await d.fetchFeed(token);

    if (result.kind === "ok") {
      const snapshot = snapshotFromFeed(result.feed, d.now().getTime());
      // Saved BEFORE drawing, so the next refresh with no network has today's
      // numbers even if this draw is the last thing the task does.
      await d.saveSnapshot(snapshot);
      await d.draw({ snapshot, signedIn: true, todayKey });
      try {
        await d.reschedule(result.feed.refreshAfterSeconds ?? null);
      } catch {
        // An interval hint, not the refresh: the timelines are already pushed.
      }
      return "refreshed";
    }

    if (result.kind === "revoked") {
      // The server has stopped accepting this token: the member signed out
      // somewhere, or asked for deletion. Drop it here too — otherwise every
      // refresh re-asks a question already answered — drop the day with it
      // (stale numbers on a signed-out tile are another member's day), and
      // draw the prompt.
      await d.clearToken();
      await d.clearSnapshot();
      await d.draw({ snapshot: null, signedIn: false, todayKey });
      return "revoked";
    }

    // Unreachable: today's cached numbers if we have them, the invitation to
    // open the app if we do not. The token stays — offline says nothing about
    // it — and the day check inside the draw still applies.
    await d.draw({ snapshot: await d.loadSnapshot(), signedIn: true, todayKey });
    return "offline";
  } catch {
    // Anything unexpected (a store that threw, a draw that failed) is treated
    // as "no fresh data": the same fallback as offline, never a throw out of
    // the task and never a blank tile.
    try {
      const todayKey = localDayStamp(d.now(), d.tzOffsetMinutes());
      await d.draw({ snapshot: await d.loadSnapshot(), signedIn: true, todayKey });
    } catch {
      // The fallback itself failed — nothing left to do, and nothing to report.
    }
    return "offline";
  }
}

/**
 * The feed's `refreshAfterSeconds` as the `minimumInterval` (minutes)
 * `registerTaskAsync` wants: the NP-216 bounds (15 min floor, 6 h ceiling,
 * 30 min default), in minutes. BGTaskScheduler's own floor is 15 minutes, so
 * the clamp is load-bearing, not decorative.
 */
export function refreshIntervalMinutes(
  refreshAfterSeconds?: number | null,
): number {
  const advertised =
    typeof refreshAfterSeconds === "number" &&
    Number.isFinite(refreshAfterSeconds)
      ? refreshAfterSeconds
      : IOS_WIDGET_REFRESH_DEFAULT_SECONDS;
  const minutes = Math.ceil(advertised / 60);
  return Math.min(
    IOS_WIDGET_REFRESH_MAX_SECONDS / 60,
    Math.max(IOS_WIDGET_REFRESH_MIN_SECONDS / 60, minutes),
  );
}

/**
 * The slice of `expo-background-task` / `expo-task-manager` this file uses,
 * and no more. Both are `require`d inside the loader (never imported at the
 * top): the native side exists only in a dev / store build, and the loader
 * returning null is how every other platform — and Expo Go — says
 * "unsupported".
 */
export interface IosRefreshScheduler {
  defineTask: (name: string, executor: () => Promise<number>) => void;
  isTaskDefined: (name: string) => boolean;
  registerTaskAsync: (
    name: string,
    options: { minimumInterval: number },
  ) => Promise<void>;
  /** `BackgroundTaskResult.Success` — the run finished, nothing to retry. */
  taskSucceeded: number;
  /** `BackgroundTaskResult.Failed` — ask the OS to retry sooner. */
  taskFailed: number;
}

/**
 * The real scheduler on iOS, null everywhere else (or where the native
 * module is missing). Mirrors `loadIosWidgetUpdaters` in `update.ts` on
 * purpose: a platform check in one place, and a null every caller already
 * knows how to handle.
 */
export function loadScheduler(): IosRefreshScheduler | null {
  if (Platform.OS !== "ios") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as {
      defineTask: IosRefreshScheduler["defineTask"];
      isTaskDefined: IosRefreshScheduler["isTaskDefined"];
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BackgroundTask = require("expo-background-task") as {
      registerTaskAsync: IosRefreshScheduler["registerTaskAsync"];
      BackgroundTaskResult: { Success: number; Failed: number };
    };
    return {
      defineTask: TaskManager.defineTask,
      isTaskDefined: TaskManager.isTaskDefined,
      registerTaskAsync: BackgroundTask.registerTaskAsync,
      taskSucceeded: BackgroundTask.BackgroundTaskResult.Success,
      taskFailed: BackgroundTask.BackgroundTaskResult.Failed,
    };
  } catch {
    return null;
  }
}

export type RegisterIosRefreshResult =
  /** The task is defined and registered with the OS. */
  | "registered"
  /**
   * Nothing was registered: the wrong platform, Expo Go, a simulator without
   * the module — or a registration the OS refused. From the widget's side all
   * four are the same non-event.
   */
  | "unsupported";

export interface RegisterIosRefreshDeps {
  /**
   * The feed's cadence, when the caller holds one. Null (the app-start case)
   * registers the 30-minute default; the background task re-registers with
   * the fresh value after every successful read.
   */
  refreshAfterSeconds?: number | null;
  /** DI for tests, and the null-means-nothing-to-do case. */
  scheduler?: IosRefreshScheduler | null;
}

/**
 * Define the task (once — `defineTask` must run in the bundle's global scope,
 * which is why this is called from `expo/index.js`) and register it with the
 * OS. iOS only; never throws.
 */
export async function registerIosWidgetsRefresh(
  deps: RegisterIosRefreshDeps = {},
): Promise<RegisterIosRefreshResult> {
  if (Platform.OS !== "ios") return "unsupported";
  const scheduler = deps.scheduler === undefined ? loadScheduler() : deps.scheduler;
  if (!scheduler) return "unsupported";
  try {
    if (!scheduler.isTaskDefined(IOS_WIDGETS_REFRESH_TASK)) {
      scheduler.defineTask(IOS_WIDGETS_REFRESH_TASK, async () => {
        const result = await refreshIosWidgets();
        // Offline is the one outcome a retry could fix; everything else —
        // fresh timelines, a prompt that is already correct — is done.
        return result === "offline" ? scheduler.taskFailed : scheduler.taskSucceeded;
      });
    }
    await scheduler.registerTaskAsync(IOS_WIDGETS_REFRESH_TASK, {
      minimumInterval: refreshIntervalMinutes(deps.refreshAfterSeconds),
    });
    return "registered";
  } catch {
    return "unsupported";
  }
}
