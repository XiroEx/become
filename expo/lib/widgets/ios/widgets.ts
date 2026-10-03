/**
 * THE FIVE iOS WIDGET REGISTRATIONS — one `createWidget` per row of
 * `IOS_WIDGETS`.
 *
 * `createWidget(name, BecomeWidget)` hands the stringified `BecomeWidget`
 * layout (`lib/widgets/ios/BecomeWidget.tsx`, via the `'widget'` directive)
 * to the native side under `name`, which must match a `widgets[].name` in the
 * `expo-widgets` plugin block in `app.json`. The extension renders whatever
 * timeline the APP pushed for that name (`updateTimeline` in
 * `lib/widgets/update.ts`); the layout itself takes `IosWidgetProps` and
 * draws the feed's strings and fractions, verbatim.
 *
 * This module is imported for its SIDE EFFECT (registration) by the app's
 * entry file on iOS. It imports `expo-widgets`, whose native module exists
 * only in a dev / store build — never `import` this file from a test or from
 * platform-neutral code; `update.ts` reaches the widgets through the
 * `loadIosWidgetUpdaters` loader instead.
 */
import { createWidget } from "expo-widgets";
import { BecomeWidget } from "@/lib/widgets/ios/BecomeWidget";
import { IOS_WIDGETS } from "@/lib/widgets/iosWidgets";
import type { IosWidgetProps } from "@/lib/widgets/iosTimeline";

for (const definition of IOS_WIDGETS) {
  createWidget<IosWidgetProps>(definition.name, BecomeWidget);
}
