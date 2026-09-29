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

## Health Connect (NP-199)

Weight both ways and finished workouts out, through
`react-native-health-connect` (the maintained module; v4 ships its own Expo
config plugin, so there is no `expo-health-connect` to install).

**It needs a dev build.** Health Connect is not in Expo Go's module set, and the
client requires API 26 — `app.json` raises `minSdkVersion` to 26 through
`expo-build-properties`, or the manifest merge fails at build time. The config
plugin writes the two rationale entry points the permission sheet links to: an
`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent-filter on the main
activity (through Android 13) and a `ViewPermissionUsageActivity` alias guarded
by `START_VIEW_PERMISSION_USAGE` (Android 14+).

**Three permissions, and only three** (`app.json` → `android.permissions`):
`READ_WEIGHT`, `WRITE_WEIGHT`, `WRITE_EXERCISE`. Nothing reads workouts or steps
back out of Health Connect, so neither is requested — an unused health
permission is something Play asks about and the app cannot justify.
`HEALTH_CONNECT_PERMISSIONS` in `lib/health/healthConnect.ts` is the list; the
manifest and Play's declaration are held equal to it by
`__tests__/androidHealthConnect.test.ts`.

**The switches.** Three flags, each its own SecureStore key, all default off:

| Key | What it answers |
|---|---|
| `become.optin.health` | the umbrella: talk to the health store at all |
| `become.sync.health.read` | Health → Become (import weigh-ins) |
| `become.sync.health.write` | Become → Health (weigh-ins + workouts out) |

They are read ONCE per process, at launch (`lib/health/switches.ts`), and the
sync consults that snapshot — so **turning a direction off stops it at the next
launch**, which is what Settings says and what iOS will do for the same reason.
It is also the honest description of the platform: Health Connect's own
`revokeAllPermissions()` does not take effect until the process restarts, and its
docs say not to hang an in-app disconnect toggle on it — track the state
yourself and stop syncing yourself.

**The loop guard.** Become writes weigh-ins into Health Connect and Health
Connect offers them back on the next read. A read therefore drops every record
whose `metadata.dataOrigin` is `io.redbtn.become`. (Health Connect's
`dataOriginFilter` can only allow-list, so it cannot do this for us.) On the
server side the same sample arriving twice is already inert: the row carries the
sample's `externalId` and a repeat is answered `applied: false`.

**The day is the sample's own.** A record's `zoneOffset` (seconds EAST) becomes
minutes WEST and builds the `date` the import sends, so a weigh-in recorded at
9pm — or in another country — lands on the day it was made, not the day the sync
ran. `POST /api/weight` refuses an import with no `date` for exactly that reason.

Files: `lib/health/healthConnect.ts` (the module), `lib/health/android.ts` (the
adapter), `lib/health/sync.ts` (both directions, one server route),
`lib/health/switches.ts` (the switches + snapshot),
`components/health/HealthSyncBridge.tsx` (the launch import),
`components/settings/HealthSyncSection.tsx` (the switches in Settings).

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

- `__tests__/androidHealthConnect.test.ts` — the module, the plugin, minSdk 26,
  and the manifest permissions held equal to the code's list and to Play's
  health apps declaration in RELEASE.md
- `__tests__/healthConnectBridge.test.ts` — record mapping, the own-package loop
  guard, zone offsets, and asking only for missing permissions
- `__tests__/healthSwitches.test.ts` — the switches and "next launch"
- `__tests__/healthSync.test.ts` — both directions over `POST /api/weight`
- `__tests__/accessibility.test.tsx` / `__tests__/reducedMotion.test.tsx` — the
  roles, names, targets, Dynamic Type constructions and the Reduce Motion rule
  (both platforms; see `ACCESSIBILITY.md`)
- `__tests__/androidConfig.test.ts` — app.json invariants (edge-to-edge,
  package, intentFilters, adaptiveIcon)
- `__tests__/androidBackHandler.test.tsx` — useAndroidBackHandler subscribes
  + unsubscribes + intercepts via makeConfirmOnBack
- `__tests__/notificationChannels.test.ts` — 4 channels with correct
  importance + unique IDs
