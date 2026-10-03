/**
 * THE FIVE WIDGETS, ON iOS — one table, read by everything.
 *
 * The iOS home-screen surface is a WidgetKit extension: `app.json`'s
 * `expo-widgets` plugin block declares one widget per row below, creates the
 * App Group (`group.io.redbtn.become`) both sides share, and generates an
 * `ExpoWidgetsTarget` in the Xcode project at prebuild time. The names here
 * are the `createWidget(name, …)` names the JS widget components register
 * under (NP-182 draws them) — a name in one and not the other is a widget
 * that never paints.
 *
 * `feedKey` is the row of `GET /api/widgets/summary` each one paints, in
 * `WidgetKeySchema` order. Unlike Android (`androidWidgets.ts`, four rows —
 * `training` was deliberately not its own tile there), iOS declares all FIVE:
 * the gallery ask for NP-181 is one entry per feed key, and the other sizes
 * and Lock Screen families land in NP-182.
 *
 * HOW DATA REACHES THE EXTENSION. The extension does NOT run our fetch code
 * and makes no network call: the APP reads the feed (`feed.ts`), compacts it
 * (`snapshot.ts`) and pushes props in (`updateSnapshot` / `updateTimeline` /
 * `reload` from `expo-widgets`), stored in the App Group the plugin creates.
 * So there is no extension-side token either — the widgets token stays in the
 * app's SecureStore (`token.ts`). `__tests__/iosWidgetsConfig.test.ts` holds
 * this list equal to `app.json`.
 */
import type { WidgetKey } from "@become/api-client";

export interface IosWidgetDefinition {
  /**
   * The name the extension knows it by. It must match the `widgets[].name`
   * in the `expo-widgets` plugin block in `app.json` AND the `createWidget`
   * name in the JS widget component, and be a valid Swift identifier.
   */
  name: string;
  /** The row of `GET /api/widgets/summary` this widget draws. */
  feedKey: WidgetKey;
  /** What the widget gallery lists it as. */
  displayName: string;
  /** The gallery's one-line description. */
  description: string;
}

/**
 * One entry per feed key, in `WidgetKeySchema` order
 * (streak, nutrition, mind, becoming, training). `systemSmall` only for now —
 * NP-182 adds the other sizes and Lock Screen families.
 */
export const IOS_WIDGETS: readonly IosWidgetDefinition[] = [
  {
    name: "StreakWidget",
    feedKey: "streak",
    displayName: "Become · Streak",
    description: "Your streak, and whether today still needs something logged.",
  },
  {
    name: "NutritionWidget",
    feedKey: "nutrition",
    displayName: "Become · Nutrition",
    description: "Calories left today, with protein, carbs and fat.",
  },
  {
    name: "MindWidget",
    feedKey: "mind",
    displayName: "Become · Mind",
    description: "Today's Mind session, and where you are in the chapter.",
  },
  {
    name: "BecomingWidget",
    feedKey: "becoming",
    displayName: "Become · Becoming",
    description: "The week you are on, and who you are becoming.",
  },
  {
    name: "TrainingWidget",
    feedKey: "training",
    displayName: "Become · Training",
    description: "Today's session, and whether it is done.",
  },
] as const;

/** Every widget name, for the plugin block and for a push-to-all sweep. */
export const IOS_WIDGET_NAMES: readonly string[] = IOS_WIDGETS.map(
  (w) => w.name,
);

/** The App Group the app and the WidgetKit extension share. */
export const IOS_WIDGET_GROUP_IDENTIFIER = "group.io.redbtn.become";

/** The extension target's bundle identifier. */
export const IOS_WIDGET_BUNDLE_IDENTIFIER = "io.redbtn.become.widgets";

/**
 * The definition behind a `createWidget` name, or null.
 *
 * Null is a real answer and not an error: a widget the member added from a
 * build that declared it, kept across an update that removed it, still wakes
 * this app with its old name. Nothing is pushed for it.
 */
export function iosWidgetByName(
  name: string | null | undefined,
): IosWidgetDefinition | null {
  if (!name) return null;
  return IOS_WIDGETS.find((w) => w.name === name) ?? null;
}

/** The definition that draws a given feed row, or null. */
export function iosWidgetByFeedKey(key: WidgetKey): IosWidgetDefinition | null {
  return IOS_WIDGETS.find((w) => w.feedKey === key) ?? null;
}
