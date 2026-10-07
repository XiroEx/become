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

`onBack` is not only for confirm dialogs — it is whatever "back" should mean on
that screen:

- **Sign-in / sign-up** (`app/(auth)/login.tsx`, NP-309) — "Create account" is
  `mode` state, not a route, so system back used to fall through to the OS and
  exit the app, where web's `/register` is its own page and back returns to
  `/login`. Enabled only while `mode === "register"`, `onBack` flips `mode`
  back to `"login"` instead.

`makeConfirmOnBack` from the same module returns a stable handler that
intercepts the first press, calls `onConfirm`, and lets a second press
through (an Alert with "Discard" / "Keep editing").

## Keyboard avoiding (NP-319)

`IOS_QUIRKS.md`'s "Keyboard avoiding" section explains the shape of the bug:
all of the app's `KeyboardAvoidingView`s used
`behavior={Platform.OS === "ios" ? "padding" : undefined}`, so Android got
nothing, and "nothing" used to be survivable because
`windowSoftInputMode=adjustResize` shrank the window on its own. It stopped
being survivable once targetSdk 35 made edge-to-edge enforcement mandatory —
the resize no longer happens — and a `Modal` sheet never got the resize
either way.

**The fix, in three pieces:**

- **A real Android `behavior`.** `undefined` is a no-op, not a fallback to
  something else — every affected `KeyboardAvoidingView` now sets
  `behavior={Platform.OS === "ios" ? "padding" : "height"}`. `"height"` is
  computed from the native keyboard-show event, not a window resize, so it
  works identically on a plain screen and inside a `Modal` sheet. Fixed in
  `components/nutrition/EstimateSheet.tsx` (Describe your meal), `BasketSheet.tsx`
  ("Name this sitting"), `EditLogItemSheet.tsx` (Custom amount),
  `components/ai/CoachChat.tsx` (the shared Mind coach / nutrition consultant
  chat), `app/(app)/(tabs)/nutrition/goals.tsx`,
  `app/(app)/(tabs)/mind/[section].tsx` (Vision's edit form), and
  `components/workout/PasteImportSheet.tsx` (Import a session/program,
  NP-279 — missed by the original pass despite living in the same
  `BottomSheet` `Modal`; the keyboard used to cover both the paste field and
  the submit button with no way to reach either).
  `__tests__/androidKeyboardAvoiding.test.ts` holds the set.
- **`useScrollFocusedFieldIntoView`** (`lib/keyboard/useScrollFocusedFieldIntoView.ts`)
  — Android's `ScrollView`, unlike iOS's, has no built-in "scroll the focused
  `TextInput` into view" behaviour, so `"height"` alone can still leave a
  field unreachable on a plain (non-sheet) screen. This is `app/(auth)/login.tsx`'s
  (NP-309) one-off `keyboardDidShow` + `measureInWindow` + `ScrollView.scrollTo`
  fix, generalised so a screen with more than one focusable field — Nutrition
  Goals' Water Goal, Vision's Environment field (and the rest of its domains)
  — can reuse it instead of re-deriving it. A component that doesn't own its
  own `ScrollView` (`components/mind/VisionDashboard.tsx`, rendered inside
  its parent route's) takes `setActiveField` as a prop instead of calling the
  hook itself; the ref is always dereferenced INSIDE the `onFocus` handler
  (`onFocus={() => setActiveField?.(fieldRef.current)}`), never passed into
  a function during render, which `react-hooks/refs` enforces.
- **`handleSheetRequestClose`** (`lib/keyboard/handleSheetRequestClose.ts`) —
  a sheet's `Modal` fires `onRequestClose` on the hardware back press; wiring
  that straight to `onClose` closed the keyboard AND the sheet in the same
  press (Find a food, Edit item), discarding whatever the member was
  mid-typing. The first back press now only dismisses the keyboard
  (`Keyboard.isVisible()` → `Keyboard.dismiss()`); the sheet closes on the
  next press. Wired into `components/BottomSheet.tsx` (covering every sheet
  built on it) and `components/ai/CoachChat.tsx` (its own `Modal`).
  `BottomSheet.tsx` and `CoachChat.tsx` also set `statusBarTranslucent` on
  their `Modal`, matching `app.json`'s edge-to-edge status bar so the sheet's
  own window inset calculation agrees with the rest of the app's.

Verified by `__tests__/androidKeyboardAvoiding.test.ts`,
`__tests__/useScrollFocusedFieldIntoView.test.ts`,
`__tests__/handleSheetRequestClose.test.ts`, `__tests__/BottomSheet.test.tsx`,
`__tests__/coachChatAndroidKeyboard.test.tsx`,
`__tests__/visionDashboardAndroidKeyboard.test.tsx`, and the new case in
`__tests__/nutritionGoalsNP148.test.tsx`.

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
`foregroundImage: "./assets/adaptive-icon.png"` + `backgroundColor: "#0a0a0a"`.
That plate stays dark in both themes on purpose (NP-123 made the app itself
follow the system): the launcher tile is brand artwork sitting on the launcher's
own wallpaper, not a UI surface the member reads text on, and a tile that
changed colour with the system setting would be a different icon twice a day.

The foreground is its OWN file, not the store icon: the store icon is opaque
edge to edge, and every launcher mask (circle, squircle, teardrop, rounded
square) would crop a filled tile into a shape with no margin. The foreground is
the mark on transparency, occupying the centre 50% of a 1024 px canvas — inside
the ~66% safe zone every mask keeps.

The same applies to the splash: Android 12+ masks the splash icon to a circle,
so `assets/splash-icon.png` is the mark on transparency too, not the lockup.
There are TWO of them since NP-123 — `splash-icon.png` (white mark, for the
`#0a0a0a` dark splash) and `splash-icon-light.png` (the same mark in zinc-900,
for the `#fafafa` light one), which the plugin writes into `values/` and
`values-night/`. A white mark on a light splash is an empty launch screen.

All three assets are written by `scripts/generate-app-assets.mjs` from
`webapp/public/logo.png`, which is also what the PWA installs with — so the
phone icon and the browser icon are the same mark. Re-run it (and only it) when
the real store icon lands.

## Runtime permissions (NP-206)

The v1 build may ask for six runtime permissions, and only those six
(`app.json` → `android.permissions`):

| Permission | What Become does with it | Asked |
|---|---|---|
| `CAMERA` | Meal photo for the estimate, food-barcode scan, food-label evidence, Mind mirror preview | From the feature surface only |
| `RECORD_AUDIO` | Follow along as the member speaks their affirmation | Only on Start in a Speak / Mirror beat |
| `health.READ_WEIGHT` | Import weigh-ins the scale or another app recorded | Only after the read switch is on |
| `health.WRITE_WEIGHT` | Write a Become weigh-in back out | Only after the write switch is on |
| `health.WRITE_EXERCISE` | Write a finished workout out as a session | Only after the write switch is on |
| `POST_NOTIFICATIONS` | Workout reminders, streak alerts | At the considered moment, never at first launch |

Each has its reason in the member's language on the screen before the OS
prompt (`lib/config/permissions.ts` → `V1_ANDROID_RUNTIME_PERMISSIONS`, with
`rationaleAnchors` naming the copy). The biometric plugin adds two
install-time normal permissions (`USE_BIOMETRIC`, `USE_FINGERPRINT`) that
never prompt. Everything else the AARs merge (`INTERNET`, `VIBRATE`,
`RECEIVE_BOOT_COMPLETED`, SDK-32-capped storage) never prompts either and
Play does not review it. `__tests__/releaseCandidatePermissions.test.ts`
holds the manifest, the table and the screens equal — a permission without
its reason, or a reason without its screen, fails the build.

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

## App Widgets (NP-198)

The four widgets Jon asked for — **Streak, Nutrition, Mind, Becoming** — on the
Android home screen, from the same feed and the same token as iOS's.

**The library is `react-native-android-widget`** (sAleksovski's, the maintained
one): it ships its own Expo config plugin, renders `RemoteViews` from React
elements and needs no Kotlin in this repo. It is safe to import on iOS — the
module swaps itself for a no-op off Android — which is why `lib/widgets/` is one
directory and not two.

**An App Widget is a build-time declaration.** The plugin block in `app.json`
writes, per widget, a Java `AppWidgetProvider`
(`io.redbtn.become.widget.<Name>`), an `<receiver>` in the manifest and an
`@xml/widgetprovider_<name>` — verified by running `expo prebuild --platform
android`. So the set of widgets is a table (`lib/widgets/androidWidgets.ts`)
held equal to `app.json` by `__tests__/androidWidgets.test.ts`; a widget in one
and not the other is a tile that never draws, or a draw call for a provider that
does not exist.

**`updatePeriodMillis` is 30 minutes because that is the platform floor.** The
feed advertises 900s, and Android silently clamps anything under 1,800,000. The
gap is covered from the app side: every signed-in open mints a token, reads the
feed and redraws all four (`lib/widgets/handoff.ts`), which is the refresh that
matters after the member logs a meal.

**The token hand-off is the iOS contract, on Android's mechanism.** The widget
refresh runs as a headless JS task — this app's bundle, no activity, no session
in memory — so it reads a `scope: 'widgets'` token from SecureStore
(`become.widgets.token`, its own key, never the session) that the app minted at
its last open through `POST /api/widgets/token`. That token is refused by every
route except `GET /api/widgets/summary`. Registration lives in **`index.js`**,
the app entry: `AppRegistry.registerHeadlessTask` has to have run by the time the
bundle finishes evaluating, and a registration inside a component only exists
once the UI does — which in a headless task is never.

**Signing out shows the sign-in prompt, both ways round.** A deliberate sign-out
already bumps `User.widgetTokenVersion` server-side (`lib/auth/AuthProvider.tsx`),
which is what stops a token that has left the device; on the device,
`components/widgets/WidgetsBridge.tsx` — mounted at the ROOT, because the
sign-out transition unmounts everything inside `(app)` — drops the token and the
cached day and pushes the prompt onto all four tiles immediately, rather than
leaving the member's streak and calories up for the half hour until the OS
refreshes. A refresh that still holds an old token gets a 401 and lands on the
same prompt.

**Offline draws yesterday's nothing, not yesterday's numbers.** A compact
snapshot of the feed (`lib/widgets/snapshot.ts`, kept well under
expo-secure-store's 2048-byte ceiling) is what a refresh paints with no network —
but only while the snapshot's `todayKey` is still the device's local day. "820
cal left" redrawn tomorrow is not stale, it is wrong, so the tile falls back to
"Open Become to update this."

**Taps go through the one resolver.** A widget tap is an `ACTION_VIEW` intent,
not a navigation, so each tile carries `become://dashboard/…` built from the
feed's own `deepLink` (`lib/widgets/taps.ts`); `app/+native-intent.tsx` →
`lib/navigation/webPathToRoute.ts` places it, the same table push taps use. The
signed-out tile taps to `/login`. `app.json`'s `scheme: "become"` is what makes
the intent resolve to the app, cold start included.

**It needs a dev build.** The native side is not in Expo Go's module set, and
nobody has run a local `expo prebuild` + Gradle build of this app yet
(`RELEASE.md` is the procedure; there is no cloud builder and no OTA), so
nobody has seen these on a phone — that is the outstanding half of NP-198's
acceptance.

**Known gap: no `previewImage`.** The plugin can point each provider at a
drawable for the widget picker; without one Android falls back to
`android:initialLayout`, which is the library's empty `rn_widget`, so the picker
shows the label over a blank tile. A preview is a PICTURE of a widget, not the
widget, and drawing four by hand would be four more things to keep true — so it
waits for the first dev build, where a screenshot of the real tile is the honest
asset. The widgets themselves are unaffected.

Files: `lib/widgets/androidWidgets.ts` (the table), `token.ts` (the hand-off),
`feed.ts` (the read), `snapshot.ts` (the cached day), `render.tsx` (the tiles),
`taps.ts` (tap → route), `update.ts` (the only caller of the native module),
`taskHandler.tsx` (the OS refresh), `handoff.ts` (open and sign-out),
`components/widgets/WidgetsBridge.tsx` (mounted in `app/_layout.tsx`),
`index.js` (the registration).

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
- `__tests__/androidWidgets.test.ts` — the four widgets held equal across
  `app.json`, `ANDROID_WIDGETS` and the server's own `WidgetKey` union, the
  30-minute floor, the Geist faces, and `index.js` still registering the handler
- `__tests__/widgetToken.test.ts` — minting with the session, a refusal vs a
  network failure, and a token whose scope is not `widgets` being refused
- `__tests__/widgetFeedClient.test.ts` — the summary read: `tz` on the query,
  401 as revoked, everything else as unreachable
- `__tests__/widgetSnapshot.test.ts` — the compact day, its byte budget, and
  that it expires by local DAY
- `__tests__/widgetRender.test.tsx` — the tiles: the server's strings drawn
  verbatim, integer bar weights, the signed-out prompt, the app's palette and
  typeface, and every tree accepted by the library's own `buildWidgetTree`
- `__tests__/widgetTaps.test.ts` — every `deepLink` read out of
  `webapp/lib/widgets/feed.ts` resolving to a real native screen
- `__tests__/widgetTaskHandler.test.tsx` — the OS refresh: signed out, revoked,
  offline with and without today's cache, and never a throw or a blank tile
- `__tests__/widgetHandoff.test.ts` — open and sign-out, and the four-tile redraw
- `__tests__/widgetsBridge.test.tsx` — once per session token, once per
  sign-out, and mounted at the root rather than inside `(app)`
- `__tests__/androidKeyboardAvoiding.test.ts` (NP-319) — every affected sheet
  and screen sets a real Android `behavior`, never `undefined`
- `__tests__/useScrollFocusedFieldIntoView.test.ts` (NP-319) — the scroll
  math (offset + overflow + margin), no-ops on iOS, and no-ops when nothing
  overflows or nothing is registered
- `__tests__/handleSheetRequestClose.test.ts` (NP-319) — dismisses the
  keyboard instead of closing while it's visible, closes once it's down
- `__tests__/BottomSheet.test.tsx` / `__tests__/coachChatAndroidKeyboard.test.tsx`
  (NP-319) — `statusBarTranslucent` and the `onRequestClose` guard, wired
- `__tests__/visionDashboardAndroidKeyboard.test.tsx` (NP-319) — the
  identity and domain fields' `onFocus` reach the handed-down
  `setActiveField`, and the component still renders without one
