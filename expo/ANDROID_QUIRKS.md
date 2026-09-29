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
}
```

This lets content render under the status bar + nav bar; the per-screen
`SafeAreaView` from `react-native-safe-area-context` adds the insets so
content doesn't actually overlap the system chrome.

There used to be an `androidNavigationBar: { barStyle: "light-content" }` block
next to it. Expo SDK 57 removed that key from the config schema — Android is
edge-to-edge by default and the nav-bar style is a runtime concern now — and
`npx expo-doctor`'s schema check fails while it is present, so it is gone.
`__tests__/androidConfig.test.ts` asserts it stays gone.

## Hardware back button

The Android hardware back press is captured by `useAndroidBackHandler`
(`lib/android/backHandler.ts`). Screens that hold in-progress, dismissable-
only-after-confirmation state install the hook with `enabled={hasInProgressWork}`
+ an `onBack` that shows the confirm dialog. Examples:

- **Live workout** (`app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx`) —
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

`android.adaptiveIcon` is wired in `app.json` with
`foregroundImage: "./assets/adaptive-icon.png"` + `backgroundColor: "#0a0a0a"`
(the app's own background, so the launcher tile is the same dark as the first
screen).

The foreground is its OWN file, not the store icon: the store icon is opaque
edge to edge, and every launcher mask (circle, squircle, teardrop, rounded
square) would crop a filled tile into a shape with no margin. The foreground is
the mark on transparency, occupying the centre 50% of a 1024 px canvas — inside
the ~66% safe zone every mask keeps.

The same applies to the splash: Android 12+ masks the splash icon to a circle,
so `assets/splash-icon.png` is the mark on transparency too, not the lockup.

All three assets are written by `scripts/generate-app-assets.mjs` from
`webapp/public/logo.png`, which is also what the PWA installs with — so the
phone icon and the browser icon are the same mark. Re-run it (and only it) when
the real store icon lands.

## Accessibility (TalkBack, font size, Remove animations)

The baseline and the device checklist live in `ACCESSIBILITY.md` (NP-124). The
Android-specific parts:

- **`accessibilityLiveRegion` is the Android half of an announcement**, and
  `AccessibilityInfo.announceForAccessibility` is the iOS half. Every state
  change that replaces content sets both — the prop is ignored on iOS and the
  announcement API is the only thing VoiceOver hears.
- **`importantForAccessibility="no"` vs `"no-hide-descendants"`.** The modal
  backdrop is `"no"`: it is the PARENT of the dialog, so hiding its descendants
  would hide the dialog with it. The sheet's grab bar, which has no descendants
  worth reading, is `"no-hide-descendants"`.
- **Material's minimum is 48 dp against Apple's 44 pt**, and the app holds 44 as
  one number (`lib/a11y/touchTarget.ts`) because the slop is symmetric and a
  44-point view with 8 points of slop clears 48 dp on every density we ship. The
  device pass checks it by thumb, not by arithmetic.
- **Android's effective font scale reaches ~2.0** (Font size at maximum plus
  Display size at maximum), which is inside the 3.12× the suite renders at.
- **"Remove animations"** is the same `AccessibilityInfo.isReduceMotionEnabled`
  the iOS switch feeds, so `lib/a11y/reducedMotion.ts` covers both.

## Verified by

- `__tests__/accessibility.test.tsx` / `__tests__/reducedMotion.test.tsx` — the
  roles, names, targets, Dynamic Type constructions and the Reduce Motion rule
  (both platforms; see `ACCESSIBILITY.md`)
- `__tests__/androidConfig.test.ts` — app.json invariants (edge-to-edge,
  package, intentFilters, adaptiveIcon)
- `__tests__/androidBackHandler.test.tsx` — useAndroidBackHandler subscribes
  + unsubscribes + intercepts via makeConfirmOnBack
- `__tests__/notificationChannels.test.ts` — 4 channels with correct
  importance + unique IDs
