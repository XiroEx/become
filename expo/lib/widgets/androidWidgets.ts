/**
 * THE FOUR WIDGETS JON ASKED FOR, ON ANDROID — one table, read by everything.
 *
 * Android's home-screen surface is an App Widget: a `RemoteViews` tree drawn by
 * the launcher's process, declared in the manifest at BUILD time. So the set of
 * widgets is not a runtime decision — `app.json`'s `react-native-android-widget`
 * plugin block writes one `AppWidgetProvider` receiver per row below, and the
 * headless task the OS wakes is handed the receiver's class name back as
 * `widgetInfo.widgetName`. That is why `name` is both the Java class name and
 * the lookup key here, and why `__tests__/androidWidgets.test.ts` holds this
 * list equal to `app.json`: a widget in one and not the other is either a
 * receiver nothing can draw or a draw call for a widget that does not exist.
 *
 * `feedKey` is the row of `GET /api/widgets/summary` each one paints. The feed
 * ships FIVE rows and this list is FOUR: `training` is deliberately not a
 * widget of its own. The ask was a streak one, a nutrition one with macros, a
 * mindset one for the daily session and a Becoming one for progress
 * (AGENTS.md § Home-screen widgets); today's session is already the thing the
 * app opens on, and a fifth tile nobody asked for is a fifth tile to keep
 * honest. It stays in the feed because the app-icon badge counts it (NP-067).
 *
 * The same four keys are what the iOS extension (NP-181/NP-182) draws, from the
 * same feed and the same token — this file is the Android half of that
 * contract, not a second opinion about what a widget is.
 */
import type { WidgetKey } from "@become/api-client";

export interface AndroidWidgetDefinition {
  /**
   * The name the OS knows it by. It becomes a Java class
   * (`io.redbtn.become.widget.<name> extends RNWidgetProvider`) and an XML
   * resource (`widgetprovider_<name lowercased>.xml`), so it has to be a valid
   * Java identifier and unique case-insensitively.
   */
  name: string;
  /** The row of `GET /api/widgets/summary` this widget draws. */
  feedKey: WidgetKey;
  /** What the widget picker lists it as (`android:label`). */
  label: string;
  /** The picker's one-line description (`android:description`). */
  description: string;
}

export const ANDROID_WIDGETS: readonly AndroidWidgetDefinition[] = [
  {
    name: "Streak",
    feedKey: "streak",
    label: "Become · Streak",
    description: "Your streak, and whether today still needs something logged.",
  },
  {
    name: "Nutrition",
    feedKey: "nutrition",
    label: "Become · Nutrition",
    description: "Calories left today, with protein, carbs and fat.",
  },
  {
    name: "Mind",
    feedKey: "mind",
    label: "Become · Mind",
    description: "Today's Mind session, and where you are in the chapter.",
  },
  {
    name: "Becoming",
    feedKey: "becoming",
    label: "Become · Becoming",
    description: "The week you are on, and who you are becoming.",
  },
] as const;

/** Every widget name, for the plugin block and for a draw-them-all sweep. */
export const ANDROID_WIDGET_NAMES: readonly string[] = ANDROID_WIDGETS.map(
  (w) => w.name,
);

/**
 * The definition behind a `widgetInfo.widgetName`, or null.
 *
 * Null is a real answer and not an error: a widget the member added from a
 * build that declared it, kept across an update that removed it, still wakes
 * this app with its old name. Nothing is drawn for it, which is what the OS
 * does with a provider it cannot resolve anyway.
 */
export function androidWidgetByName(
  name: string | null | undefined,
): AndroidWidgetDefinition | null {
  if (!name) return null;
  return ANDROID_WIDGETS.find((w) => w.name === name) ?? null;
}

/** The definition that draws a given feed row, or null. */
export function androidWidgetByFeedKey(
  key: WidgetKey,
): AndroidWidgetDefinition | null {
  return ANDROID_WIDGETS.find((w) => w.feedKey === key) ?? null;
}

/**
 * How often the OS may refresh a widget on its own, in ms.
 *
 * The feed advertises 900s (`WIDGET_REFRESH_SECONDS`), but `updatePeriodMillis`
 * has a HARD platform floor of 30 minutes — Android silently clamps anything
 * smaller, so writing 900_000 would be writing a number the OS ignores. The
 * gap is covered from the app side instead: every open hands the token over
 * and redraws all four (`lib/widgets/handoff.ts`), which is the refresh that
 * actually matters after a member logs something.
 */
export const ANDROID_WIDGET_UPDATE_PERIOD_MS = 1_800_000;
