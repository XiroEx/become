# Android quirks

Polish-pass decisions for the Android half of the native app. Each section
calls out the choice + the rationale + the file it lives in, so a future
polish pass can find + revisit.

## Edge-to-edge

`app.json` enables an edge-to-edge layout via:

```jsonc
"androidStatusBar": {
  "translucent": true,
  "barStyle": "light-content"
},
"androidNavigationBar": {
  "barStyle": "light-content"
}
```

This lets content render under the status bar + nav bar; the per-screen
`SafeAreaView` from `react-native-safe-area-context` adds the insets so
content doesn't actually overlap the system chrome.

## Hardware back button

The Android hardware back press is captured by `useAndroidBackHandler`
(`lib/android/backHandler.ts`). Screens that hold in-progress, dismissable-
only-after-confirmation state install the hook with `enabled={hasInProgressWork}`
+ an `onBack` that shows the confirm dialog. Examples:

- **Live workout** (`app/(tabs)/programming/[id]/workout/[idx]/live.tsx`) —
  intercepts back when one or more sets are completed but the workout isn't
  marked finished.
- **Recipe create** (web-only via Tier-3 deep-link, so no native handler) —
  no native interception needed; deep-link out + browser owns back.

`makeConfirmOnBack` from the same module returns a stable handler that
intercepts the first press, calls `onConfirm`, and lets a second press
through (an Alert with "Discard" / "Keep editing").

## Material ripple

We use `Pressable` everywhere instead of `TouchableNativeFeedback`. Android
ripple ships automatically via Pressable's `android_ripple` prop when set,
or via the default platform feedback when omitted. NativeWind / Tailwind
classes don't disable the ripple. The visual is "good enough" without
per-component tuning.

## Notification channels

Four channels created at boot via `expo-notifications.setNotificationChannelAsync`
using the metadata returned from `getNotificationChannels()`:

| ID | Name | Importance | Sound | Vibrate |
|---|---|---|---|---|
| `workout-reminders` | Workout Reminders | high | ✓ | ✓ |
| `streak-alerts` | Streak Alerts | high | ✓ | ✓ |
| `re-engagement` | Re-engagement | default | ✗ | ✗ |
| `streak-saved` | Streak Saved | default | ✓ | ✗ |

The push-sender (webapp's `api/cron/notify`) sets the `channelId` on the
outbound message so each notification lands on the right channel.

## App-link deep-link verification

`app.json`'s `android.intentFilters` declares the `become.redbtn.io` `/verify`
path with `autoVerify: true`. Combined with the
`webapp/public/.well-known/assetlinks.json` (P6), Android verifies the link
ownership at install time and the system opens the link in the app directly,
skipping the disambiguation chooser.

## Adaptive icon

`android.adaptiveIcon` is wired in `app.json` with `foregroundImage` +
`backgroundColor: "#0a0a0a"` (matching the dark theme). The icon file lives
under `assets/icon.png` (placeholder).

## Verified by

- `__tests__/androidConfig.test.ts` — app.json invariants (edge-to-edge,
  package, intentFilters, adaptiveIcon)
- `__tests__/androidBackHandler.test.tsx` — useAndroidBackHandler subscribes
  + unsubscribes + intercepts via makeConfirmOnBack
- `__tests__/notificationChannels.test.ts` — 4 channels with correct
  importance + unique IDs
