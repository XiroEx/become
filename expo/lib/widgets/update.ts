/**
 * THE ONE FILE THAT TOUCHES THE NATIVE WIDGET MODULES.
 *
 * `requestWidgetUpdate` (Android) / `updateTimeline` (iOS) is how the APP (not
 * the OS) redraws a widget that is already on a home screen. Called after a
 * sign-in, after a sign-out, and whenever the app has a fresher feed than the
 * tile does.
 *
 * WHY EACH SIDE IS BEHIND A LOADER. Both libraries are platform-only, and
 * calling into either still has three ways to be nothing:
 *
 *   • the other platform — Android widgets are an App Widget provider,
 *     iOS widgets are a WidgetKit extension (NP-181), never both;
 *   • Expo Go — the native side is not in its module set;
 *   • a device with no widget of ours on any home screen — the common case.
 *
 * None of those is an error. Every call here is swallowed per widget, because
 * this runs from a launch effect and from a sign-out: a member signing out must
 * not see a failure because one tile could not be redrawn.
 */
import { Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import {
  ANDROID_WIDGETS,
  type AndroidWidgetDefinition,
} from "@/lib/widgets/androidWidgets";
import { renderAndroidWidget } from "@/lib/widgets/render";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  buildIosTimeline,
  type IosTimelineEntry,
} from "@/lib/widgets/iosTimeline";
import {
  snapshotIsForDay,
  snapshotRowFor,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";

/** The slice of the Android library this file uses, and no more. */
export interface AndroidWidgetUpdater {
  requestWidgetUpdate: typeof requestWidgetUpdate;
}

/**
 * The real updater on Android, null everywhere else.
 *
 * Mirrors `lib/health/healthConnect.ts`'s loader on purpose: a platform check in
 * one place, and a null that every caller already knows how to handle.
 */
export function loadAndroidWidgetUpdater(): AndroidWidgetUpdater | null {
  if (Platform.OS !== "android") return null;
  return { requestWidgetUpdate };
}

/** The slice of `expo-widgets` this file uses, and no more. */
export interface IosWidgetUpdater {
  updateTimeline: (entries: IosTimelineEntry[]) => void;
}

/**
 * One updater per iOS widget, keyed by `createWidget` name — or null off iOS,
 * in Expo Go, or when the native module is missing.
 *
 * `expo-widgets` is `require`d inside the loader (never imported at the top):
 * its native module exists only in a dev / store build, and the package's own
 * proxy throws on first property access where the native side is absent. The
 * `createWidget` handles themselves live in `lib/widgets/ios/widgets.ts`,
 * imported for its side effect by the app entry file on iOS — this loader only
 * needs the per-name `Widget` objects to push timelines through.
 *
 * The layout is passed as an opaque handle: under babel the `'widget'`
 * directive stringifies `BecomeWidget` into the layout source, and
 * `createWidget` hands that same source to the native side under the same
 * name — re-registering here is idempotent, and it is what returns the
 * `Widget` object this push needs.
 */
export function loadIosWidgetUpdaters(
  createWidgetFn?: (name: string, layout: unknown) => IosWidgetUpdater,
  layout?: unknown,
): Record<string, IosWidgetUpdater> | null {
  if (Platform.OS !== "ios") return null;
  try {
    const create =
      createWidgetFn ??
      (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("expo-widgets") as {
          createWidget: (name: string, layout: unknown) => IosWidgetUpdater;
        }
      ).createWidget;
    const widgetLayout =
      layout ??
      (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("@/lib/widgets/ios/BecomeWidget") as {
          BecomeWidget: unknown;
        }
      ).BecomeWidget;
    const updaters: Record<string, IosWidgetUpdater> = {};
    for (const definition of IOS_WIDGETS) {
      updaters[definition.name] = create(definition.name, widgetLayout);
    }
    return updaters;
  } catch {
    return null;
  }
}

/**
 * Does this platform have a widget surface to feed at all?
 *
 * Android has its App Widget providers; iOS has its WidgetKit extension
 * (NP-181). Both inherit the whole of `lib/widgets/token.ts`, `feed.ts` and
 * `snapshot.ts` unchanged — which is the point of keeping them
 * platform-neutral.
 */
export function hasWidgetSurface(): boolean {
  return Platform.OS === "android" || Platform.OS === "ios";
}

export interface DrawWidgetsArgs {
  /** The feed snapshot to draw from, or null when there is none. */
  snapshot: WidgetSnapshot | null;
  /** Is a widgets token being held? False draws the sign-in prompt. */
  signedIn: boolean;
  /** The device's local day, so a snapshot from yesterday is not drawn as today. */
  todayKey: string;
  /** DI for tests, and the null-means-nothing-to-do case. */
  updater?: AndroidWidgetUpdater | null;
  /** Which widgets to redraw. Defaults to all four. */
  definitions?: readonly AndroidWidgetDefinition[];
}

/**
 * Redraw the Android widgets. Returns how many were handed to the OS — 0 when
 * there is no module (iOS, Expo Go) and 0 when the member has added none, which
 * are the same non-event.
 */
export async function drawAndroidWidgets({
  snapshot,
  signedIn,
  todayKey,
  updater = loadAndroidWidgetUpdater(),
  definitions = ANDROID_WIDGETS,
}: DrawWidgetsArgs): Promise<number> {
  if (!updater) return 0;

  // One snapshot, one day check, four tiles: the four widgets of a home screen
  // are refreshed together and must never disagree about what day it is.
  const usable = snapshotIsForDay(snapshot, todayKey) ? snapshot : null;

  let drawn = 0;
  for (const definition of definitions) {
    const row = snapshotRowFor(usable, definition.feedKey);
    try {
      await updater.requestWidgetUpdate({
        widgetName: definition.name,
        renderWidget: () =>
          renderAndroidWidget({ definition, row, signedIn }),
      });
      drawn += 1;
    } catch {
      // A provider the launcher no longer knows, a widget removed mid-draw: the
      // next refresh is 30 minutes away and the app redraws at every open.
    }
  }
  return drawn;
}

export interface DrawIosWidgetsArgs {
  /** The feed snapshot to draw from, or null when there is none. */
  snapshot: WidgetSnapshot | null;
  /** Is a widgets token being held? False draws the sign-in prompt. */
  signedIn: boolean;
  /** The device's local day, so a snapshot from yesterday is not drawn as today. */
  todayKey: string;
  /** The instant the timeline starts at. Defaults to now. */
  now?: Date;
  /**
   * The next local midnight as an instant, resolved by the caller in the
   * member's zone and used verbatim (see `iosTimeline.ts`: no date arithmetic
   * here, so no DST arithmetic either). Defaults to 24h after `now` — the
   * prompt side of midnight is what matters, not the exact minute.
   */
  nextLocalMidnight?: Date;
  /** DI for tests, and the null-means-nothing-to-do case. */
  updaters?: Record<string, IosWidgetUpdater> | null;
}

/**
 * Push the WidgetKit timelines. Returns how many widgets were handed a
 * timeline — 0 when there is no module (Android, Expo Go) and 0 when the
 * member has added none, which are the same non-event.
 *
 * Each push is wrapped so one failing widget never stops the rest: a timeline
 * the extension no longer knows is a widget removed mid-draw, and the app
 * redraws at every open.
 */
export async function drawIosWidgets({
  snapshot,
  signedIn,
  todayKey,
  now = new Date(),
  nextLocalMidnight = new Date(now.getTime() + 24 * 60 * 60 * 1000),
  updaters = loadIosWidgetUpdaters(),
}: DrawIosWidgetsArgs): Promise<number> {
  if (!updaters) return 0;

  // One snapshot, one day check, five timelines: the widgets of a home screen
  // are refreshed together and must never disagree about what day it is. The
  // builder answers the prompt everywhere when signed out, revoked,
  // snapshot-less or stale — so `signedIn: false` needs no special case here.
  const timeline = buildIosTimeline({
    snapshot,
    signedIn,
    now,
    todayKey,
    nextLocalMidnight,
  });

  let drawn = 0;
  for (const definition of IOS_WIDGETS) {
    const updater = updaters[definition.name];
    if (!updater) continue;
    try {
      updater.updateTimeline(timeline[definition.feedKey] ?? []);
      drawn += 1;
    } catch {
      // A widget the extension no longer knows, a timeline entry it rejects:
      // the next open pushes again.
    }
  }
  return drawn;
}

export interface DrawWidgetsOnThisPlatformArgs {
  /** The feed snapshot to draw from, or null when there is none. */
  snapshot: WidgetSnapshot | null;
  /** Is a widgets token being held? False draws the sign-in prompt. */
  signedIn: boolean;
  /** The device's local day, so a snapshot from yesterday is not drawn as today. */
  todayKey: string;
  /** The instant the iOS timeline starts at. Defaults to now. */
  now?: Date;
  /** The next local midnight as an instant (iOS only). */
  nextLocalMidnight?: Date;
}

/**
 * Draw on whichever platform this is: the Android sweep on Android, the iOS
 * timeline push on iOS, nothing anywhere else. Returns how many widgets were
 * handed to the OS. This is the `draw` the hand-off (`handoff.ts`) runs by
 * default — mint at open, clear + prompt at sign-out — without changing its
 * contract.
 */
export async function drawWidgetsOnThisPlatform({
  snapshot,
  signedIn,
  todayKey,
  now,
  nextLocalMidnight,
}: DrawWidgetsOnThisPlatformArgs): Promise<number> {
  if (Platform.OS === "ios") {
    return drawIosWidgets({ snapshot, signedIn, todayKey, now, nextLocalMidnight });
  }
  return drawAndroidWidgets({ snapshot, signedIn, todayKey });
}
