/**
 * THE TWO FILES THAT TOUCH A NATIVE WIDGET MODULE — Android's, and iOS's.
 *
 * `requestWidgetUpdate` is how the APP (not the OS) redraws an Android widget
 * that is already on a home screen: it asks the module which instances of a
 * given provider exist, renders each one and pushes the `RemoteViews` over.
 * `updateTimeline` is the iOS equivalent: the app pushes `[{ date, props }]`
 * per WidgetKit widget into the App Group the `expo-widgets` plugin creates,
 * and the extension paints from it. Both are called after a sign-in, after a
 * sign-out, and whenever the app has a fresher feed than the tile does.
 *
 * WHY EACH DRAW IS BEHIND A LOADER. `react-native-android-widget` is
 * Android-only, and its JS is deliberately safe to IMPORT anywhere (it swaps
 * in a no-op module off Android), but calling into it still has three ways to
 * be nothing:
 *
 *   • iOS — where the widgets are a WidgetKit extension (NP-181), not this;
 *   • Expo Go — the native side is not in its module set;
 *   • a device with no widget of ours on any home screen — the common case.
 *
 * `expo-widgets` is the mirror image: iOS-only, and absent in Expo Go (its JS
 * proxy throws on first property access there). So `loadIosWidgetUpdaters`
 * `require`s it behind a `Platform.OS` check, exactly like
 * `lib/health/healthConnect.ts`'s loader — a platform check in one place, and
 * a null that every caller already knows how to handle.
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
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import {
  buildIosTimeline,
  type IosTimelineEntry,
  type IosWidgetProps,
} from "@/lib/widgets/iosTimeline";
import { renderAndroidWidget } from "@/lib/widgets/render";
import {
  snapshotIsForDay,
  snapshotRowFor,
  type WidgetSnapshot,
} from "@/lib/widgets/snapshot";

/** The slice of the library this file uses, and no more. */
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

/**
 * Does this platform have a widget surface to feed at all?
 *
 * Android has its App Widgets and iOS its WidgetKit extension, so both do.
 * The hand-off mints the token at every app open on either — the token stays
 * in the app's SecureStore on both (`lib/widgets/token.ts`), and the feed and
 * snapshot files are platform-neutral on purpose, which is why the extension
 * landing changed this one line and nothing else.
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

/** The slice of `expo-widgets` this file uses, and no more. */
export interface IosWidgetUpdater {
  updateTimeline: (entries: IosTimelineEntry[]) => void;
}

export interface IosWidgetUpdaters {
  [widgetName: string]: IosWidgetUpdater | null | undefined;
}

/**
 * The iOS updaters, keyed by `createWidget` name — or null off iOS, null in
 * Expo Go, and null when the native module is missing.
 *
 * Mirrors `loadAndroidWidgetUpdater` on purpose: a platform check in one
 * place, and a null that every caller already knows how to handle. The
 * `require` is lazy for the same reason as Health Connect's: `expo-widgets`'s
 * JS proxy throws on first property access where its native side is absent,
 * so importing it at the top would break every Android bundle and every jest
 * run that does not mock it.
 */
export function loadIosWidgetUpdaters(
  /** DI for tests: the registered instances. Defaults to the real five. */
  instances?: Record<string, IosWidgetUpdater | null | undefined>,
): IosWidgetUpdaters | null {
  if (Platform.OS !== "ios") return null;
  try {
    const resolved =
      instances ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy like Health Connect: expo-widgets throws where its native side is absent
      (require("@/lib/widgets/ios/widgets") as {
        IOS_WIDGET_INSTANCES?: Record<string, IosWidgetUpdater>;
      }).IOS_WIDGET_INSTANCES;
    if (!resolved) return null;
    const updaters: IosWidgetUpdaters = {};
    for (const definition of IOS_WIDGETS) {
      const instance = resolved[definition.name];
      if (instance) updaters[definition.name] = instance;
    }
    return updaters;
  } catch {
    return null;
  }
}

export interface DrawIosWidgetsArgs {
  /** The feed snapshot to draw from, or null when there is none. */
  snapshot: WidgetSnapshot | null;
  /** Is a widgets token being held? False draws the sign-in prompt. */
  signedIn: boolean;
  /** The device's local day, so a snapshot from yesterday is never drawn. */
  todayKey: string;
  /** The instant the timeline starts at. Defaults to now. */
  now?: Date;
  /**
   * The next local midnight as an instant, resolved by the caller in the
   * member's zone. Defaults to 24h after `now` — close enough for a push that
   * is re-pushed at every app open, and exact whenever the caller resolves it.
   */
  nextLocalMidnight?: Date;
  /** DI for tests, and the null-means-nothing-to-do case. */
  updaters?: IosWidgetUpdaters | null;
}

/**
 * Push a WidgetKit timeline to all five iOS widgets. Returns how many were
 * handed to the OS — 0 when there is no module (Android, Expo Go) and 0 when
 * the member has added none, which are the same non-event.
 *
 * Each widget is wrapped so one failure never throws and never stops the
 * rest: this runs from a launch effect and from a sign-out.
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
    const entries = timeline[definition.feedKey] as
      | IosTimelineEntry[]
      | undefined;
    if (!entries) continue;
    try {
      // `updateTimeline` is sync in expo-widgets 57 (it schedules the entries
      // and reloads the widget); `await` keeps this uniform with the Android
      // draw and harmless if a later SDK makes it async.
      await updater.updateTimeline(entries);
      drawn += 1;
    } catch {
      // A widget removed mid-draw, a group the extension cannot open: the next
      // app open pushes again.
    }
  }
  return drawn;
}

/** Draw on whichever platform this is running on. */
export async function drawWidgets(args: {
  snapshot: WidgetSnapshot | null;
  signedIn: boolean;
  todayKey: string;
  now?: Date;
  nextLocalMidnight?: Date;
}): Promise<number> {
  if (Platform.OS === "ios") {
    return drawIosWidgets(args);
  }
  return drawAndroidWidgets(args);
}

/**
 * The props one iOS widget paints — re-exported here so the widget bundle
 * entry and tests reach the type from the draw path.
 */
export type { IosWidgetProps };

/**
 * Redraw the widgets. Returns how many were handed to the OS — 0 when there is
 * no module (Expo Go) and 0 when the member has added none, which are the
 * same non-event.
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
