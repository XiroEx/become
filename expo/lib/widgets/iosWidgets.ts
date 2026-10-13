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
 * the gallery ask for NP-181 is one entry per feed key, and NP-182 draws each
 * one in small, medium and Lock Screen sizes (see `supportedFamilies`).
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
  /**
   * The WidgetKit families this widget draws in. One `createWidget`
   * registration covers all of them: the layout (`BecomeWidget`) reads
   * `environment.widgetFamily` at paint time and draws the size the OS asks
   * for. Must match the `supportedFamilies` of the same row in the
   * `expo-widgets` plugin block in `app.json` — a family in one and not the
   * other is a size the gallery offers that paints nothing, or a layout the
   * extension never asks for.
   */
  supportedFamilies: readonly IosWidgetFamily[];
}

/**
 * Every WidgetKit family the five widgets draw in: small and medium Home
 * Screen tiles, and the three Lock Screen accessory sizes.
 */
export const IOS_WIDGET_FAMILIES = [
  "systemSmall",
  "systemMedium",
  "accessoryCircular",
  "accessoryRectangular",
  "accessoryInline",
] as const;

/** One of the WidgetKit families in `IOS_WIDGET_FAMILIES`. */
export type IosWidgetFamily = (typeof IOS_WIDGET_FAMILIES)[number];

/**
 * One entry per feed key, in `WidgetKeySchema` order
 * (streak, nutrition, mind, becoming, training). Every widget draws every
 * family in `IOS_WIDGET_FAMILIES` — small, medium and Lock Screen (NP-182).
 */
export const IOS_WIDGETS: readonly IosWidgetDefinition[] = [
  {
    name: "StreakWidget",
    feedKey: "streak",
    displayName: "Become · Streak",
    description: "Your streak, and whether today still needs something logged.",
    supportedFamilies: IOS_WIDGET_FAMILIES,
  },
  {
    name: "NutritionWidget",
    feedKey: "nutrition",
    displayName: "Become · Nutrition",
    description: "Calories left today, with protein, carbs and fat.",
    supportedFamilies: IOS_WIDGET_FAMILIES,
  },
  {
    name: "MindWidget",
    feedKey: "mind",
    displayName: "Become · Mind",
    description: "Today's Mind session, and where you are in the chapter.",
    supportedFamilies: IOS_WIDGET_FAMILIES,
  },
  {
    name: "BecomingWidget",
    feedKey: "becoming",
    displayName: "Become · Becoming",
    description: "The week you are on, and who you are becoming.",
    supportedFamilies: IOS_WIDGET_FAMILIES,
  },
  {
    name: "TrainingWidget",
    feedKey: "training",
    displayName: "Become · Training",
    description: "Today's session, and whether it is done.",
    supportedFamilies: IOS_WIDGET_FAMILIES,
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
