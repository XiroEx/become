/**
 * THE APP ENTRY — expo-router, plus the one registration that cannot live in a
 * screen.
 *
 * `package.json`'s `main` used to be `expo-router/entry` directly, and for the UI
 * that is still all this is: the import below is that same module, unchanged.
 *
 * WHAT IT ADDS is the Android App Widget task handler (NP-198). Android wakes a
 * widget's provider as a HEADLESS JS task — the bundle loads, no activity is
 * created and no component is ever rendered — so `AppRegistry.registerHeadlessTask`
 * has to have run by the time the bundle finishes evaluating. A registration
 * inside `app/_layout.tsx`, or any component, only exists once the UI does, which
 * in a headless task is never: the OS would start the task, find no handler for
 * `RNWidgetBackgroundTask` and the widget would sit on whatever it last drew.
 *
 * Guarded by platform because it is Android's mechanism. iOS's widgets are a
 * WidgetKit extension (NP-181): their layouts register from
 * `lib/widgets/ios/widgets.ts` (one `createWidget` per row of `IOS_WIDGETS`),
 * and share the feed and the token, not this entry.
 *
 * `__tests__/androidWidgets.test.ts` reads this file, so the registration cannot
 * quietly go missing while the four providers stay in the manifest.
 */
import "expo-router/entry";

import { Platform } from "react-native";
import { registerWidgetTaskHandler } from "react-native-android-widget";

import { widgetTaskHandler } from "./lib/widgets/taskHandler";

if (Platform.OS === "android") {
  registerWidgetTaskHandler(widgetTaskHandler);
}

if (Platform.OS === "ios") {
  // The WidgetKit layouts: one `createWidget(name, BecomeWidget)` per row of
  // `IOS_WIDGETS`. Side-effect import — registration, not a value.
  require("./lib/widgets/ios/widgets");

  // The background refresh (NP-218): re-read the feed and push the timelines
  // while the app is closed. `defineTask` must run in the bundle's global
  // scope — the OS wakes the bundle with no UI, exactly like Android's
  // headless task above — so this lives here and not in a screen. iOS decides
  // when the task actually runs (see `IOS_QUIRKS.md`); failures are silent by
  // design (`lib/widgets/iosBackgroundRefresh.ts` never throws).
  const {
    registerIosWidgetsRefresh,
  } = require("./lib/widgets/iosBackgroundRefresh");
  registerIosWidgetsRefresh().catch(() => null);
}
