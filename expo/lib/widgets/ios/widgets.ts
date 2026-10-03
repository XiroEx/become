/**
 * THE FIVE iOS WIDGET INSTANCES — one `createWidget` per row of `IOS_WIDGETS`.
 *
 * Widgets are JS components marked with the `'widget'` directive (`./
 * BecomeWidget.tsx`) and created with `createWidget(name, Component)`; `name`
 * must match a `widgets[].name` in the `expo-widgets` plugin block in
 * `app.json` (`__tests__/iosWidgetsConfig.test.ts` holds the three lists
 * equal). The APP pushes data in — `updateTimeline([{ date, props }])` from
 * `../update.ts` — stored in the App Group the plugin creates. The extension
 * does NOT run our fetch code, so there is no extension-side network call and
 * no separate Swift module writing a token into the group: the widgets token
 * stays in the app's SecureStore (`../token.ts`), and the app (or its
 * background task) reads the feed and pushes props.
 *
 * This module is imported for its side effects (registration) by the widget
 * bundle entry. Importing it from app code only registers the same five names
 * again, which `expo-widgets` treats as the same five widgets.
 */
import { createWidget, type Widget } from "expo-widgets";
import { BecomeWidget } from "@/lib/widgets/ios/BecomeWidget";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import type { IosWidgetProps } from "@/lib/widgets/iosTimeline";

/** Every registered widget, keyed by its `createWidget` name. */
export const IOS_WIDGET_INSTANCES: Record<string, Widget<IosWidgetProps>> =
  Object.fromEntries(
    IOS_WIDGETS.map((definition) => [
      definition.name,
      createWidget<IosWidgetProps>(definition.name, BecomeWidget),
    ]),
  );

/** The widget instance behind a `createWidget` name, or null. */
export function iosWidgetInstance(name: string): Widget<IosWidgetProps> | null {
  return IOS_WIDGET_INSTANCES[name] ?? null;
}
