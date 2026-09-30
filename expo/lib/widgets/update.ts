/**
 * THE ONE FILE THAT TOUCHES THE NATIVE WIDGET MODULE.
 *
 * `requestWidgetUpdate` is how the APP (not the OS) redraws a widget that is
 * already on a home screen: it asks the module which instances of a given
 * provider exist, renders each one and pushes the `RemoteViews` over. Called
 * after a sign-in, after a sign-out, and whenever the app has a fresher feed
 * than the tile does.
 *
 * WHY IT IS BEHIND A LOADER. `react-native-android-widget` is Android-only, and
 * its JS is deliberately safe to IMPORT anywhere (it swaps in a no-op module off
 * Android), but calling into it still has three ways to be nothing:
 *
 *   • iOS — where the widgets are a WidgetKit extension (NP-181), not this;
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
 * THE ONE LINE NP-181 CHANGES. Today it is Android, because Android is where the
 * widgets exist; on iOS the hand-off would mint a token at every app open that
 * nothing reads and store it in a Keychain nothing opens. When the WidgetKit
 * extension lands it says `Platform.OS === "android" || Platform.OS === "ios"`
 * and inherits the whole of `lib/widgets/token.ts`, `feed.ts` and `snapshot.ts`
 * unchanged — which is the point of keeping them platform-neutral.
 */
export function hasWidgetSurface(): boolean {
  return Platform.OS === "android";
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
 * Redraw the widgets. Returns how many were handed to the OS — 0 when there is
 * no module (iOS, Expo Go) and 0 when the member has added none, which are the
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
