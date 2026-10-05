# iOS quirks

Polish-pass decisions for the iOS half of the native app. Each section calls
out the choice + the rationale + the file it lives in, so a future polish
pass can find + revisit.

## Icon and launch screen

`expo.icon` is `./assets/icon.png`: 1024 x 1024, **opaque, no alpha channel**.
App Store Connect rejects an icon with one, and `assets/` is generated rather
than hand-exported precisely so that property cannot drift —
`scripts/generate-app-assets.mjs` writes an RGB PNG for the icon and RGBA for
the other two. Run it after replacing the source artwork:

```bash
node scripts/generate-app-assets.mjs
```

The launch screen is `expo-splash-screen`, and since NP-123 it is **two launch
screens**: the top-level props are the LIGHT one
(`image: "./assets/splash-icon-light.png"`, `backgroundColor: "#fafafa"`) and the
`dark` block is the dark one (`splash-icon.png`, `#0a0a0a`), with
`imageWidth: 200` and `resizeMode: "contain"` shared. `userInterfaceStyle` is
`automatic` (see "Status bar" below), so the system picks — which is the point,
and also why the two assets differ in more than background: the mark is white in
one and zinc-900 in the other, because a white mark on `#fafafa` is an empty
launch screen.

The colour is not a decoration, it is the whole trick: launch screen, window and
first screen have to agree, or whatever the system reaches for between them is
the flash. Since NP-123 they agree PER SCHEME: the first paint is
`app/_layout.tsx`'s Stack `contentStyle`, which is `colors.background` (`#0a0a0a`
dark / `#fafafa` light); the window is `expo.backgroundColor` — one static value,
so it stays the dark one, and `useThemedWindowBackground()` repaints it through
`expo-system-ui` (which is why that package is a dependency — on iOS the
`backgroundColor` key does nothing without it) before the splash lifts; the
adaptive-icon plate stays dark because a launcher tile is artwork, not a UI
surface. `__tests__/appAssets.test.ts` and
`__tests__/themeFollowsSystem.test.tsx` assert the chain in both modes.

## Export compliance

`ios.infoPlist.ITSAppUsesNonExemptEncryption: false`. Become talks to
`become.redbtn.io` over HTTPS and ships no crypto of its own, which is exempt.
Declaring it in the build is what stops App Store Connect asking the
export-compliance question on every single upload.

## Privacy manifest

`ios.privacyManifests` becomes `PrivacyInfo.xcprivacy` in the build. Without it
an upload comes back with ITMS-91053 ("Missing API declaration"). Four
required-reason categories, one reason code each:

| Category | Reason | Who uses it |
|---|---|---|
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | file timestamps inside the app container — the bundle loader / file system |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | React Native + expo-constants, reading only this app's own defaults |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1` | React Native's performance timers, measuring elapsed time between in-app events |
| `NSPrivacyAccessedAPICategoryDiskSpace` | `E174.1` | checking there is room before writing a cached file |

`NSPrivacyTracking: false` with no tracking domains (no ad or analytics SDK,
and the app never asks for ATT), and the three collected data types — email,
user ID, push token — mirror the App Privacy answers drafted in `RELEASE.md`.
Keep the two in step: they are answers to the same question in two places.

## Permission usage strings

One place: `expo.ios.infoPlist` in `app.json`. The rule lives in
`lib/config/permissions.ts` and is enforced by
`__tests__/permissionStrings.test.ts` — install a module that makes iOS prompt
(camera, photos, microphone, speech, Face ID, HealthKit) without adding its
sentence and the suite fails, naming the Info.plist key and the card.

A sentence says what **Become** does with the resource, in the app's voice: not
"This app requires access to the camera." The test enforces the mechanical part
of that (it names Become, it is long enough to be a sentence, it is not a
placeholder) and the unused half of the rule too: a usage string with no module
behind it is a question from App Review, so it fails as well.

The v1 set is five keys (NP-206 audit): camera (meal photo, barcode scan,
food-label evidence, Mind mirror preview), photo library (meal, food label,
avatar, feedback screenshot — picked, never scanned), microphone + speech
recognition (speaking the affirmation out loud), and Face ID (unlock instead
of a fresh sign-in link). Push needs no key on iOS; HealthKit ships no key
until NP-185 installs its module; nothing is saved to the library so there is
no `NSPhotoLibraryAddUsageDescription`. `__tests__/releaseCandidatePermissions.test.ts`
pins the whole set — add a key with the module that needs it, or the suite
fails.

## Safe area

Every top-level screen wraps its content in `SafeAreaView` from
`react-native-safe-area-context` with `edges={["top","bottom"]}`. This handles
both the notch + the home-bar overlap on modern iPhones. Layout files
(`app/_layout.tsx`, `app/(app)/(tabs)/_layout.tsx`) wrap the entire tree in a
`SafeAreaProvider` so per-screen `SafeAreaView` invocations have insets to
read from.

Why edges=`["top","bottom"]` (vs the default of all four)? Horizontal insets
are usually 0 on iPhones in portrait and add zero value; explicitly excluding
them means content lines up edge-to-edge with the design grid.

## Keyboard avoiding

Every screen that contains a `TextInput` wraps its content in
`KeyboardAvoidingView` with `behavior={Platform.OS === "ios" ? "padding" : undefined}`.
On Android we leave the default (windowSoftInputMode handles it). Affected
screens:

- `app/(auth)/login.tsx`
- `app/(app)/(tabs)/chat/[id].tsx`
- `app/(app)/(tabs)/nutrition/search.tsx`
- `app/(app)/(tabs)/nutrition/food/[id].tsx`
- `app/(app)/(tabs)/calendar/settings.tsx`

The `Input` component itself is a thin wrapper around the platform `TextInput`
— it does NOT manage keyboard avoidance because the surrounding screen knows
the layout shape better than the input does.

## Status bar style

Set at runtime in `app/_layout.tsx` via `<StatusBar style="light" />` from
`expo-status-bar`. The app is dark-themed by default; the status-bar glyphs
need to render light to stay visible.

**Never** use `style="black-translucent"` — per the `feedback_black_translucent`
project memory, that style produces an unfixable bottom gap on iOS. The
runtime test in `__tests__/iosConfig.test.ts` asserts the layout's StatusBar
prop is never `'black-translucent'` — and, since NP-123, that it is not a literal
at all: it is `statusBarStyle` from `useThemeTokens()`, which is light content on
the dark surface and dark content on the light one.

`app.json`'s `userInterfaceStyle` is **`automatic`** (NP-123). It was `dark`
(NP-013) for one reason: 43 `#0a0a0a` literals sat in plain RN styles — a
SafeAreaView, a Stack's `contentStyle`, the tab bar — while the classes beside
them followed the system, so a phone in light mode drew light-mode text
(`--foreground: 24 24 27`, near-black) on those near-black surfaces. The literals
are gone: every colour is a class or comes from `useThemeTokens()`, and a hex is
now a lint error. `automatic` is what makes the OS surfaces the app does not draw
— keyboards, share sheets, the launch screen — match the app again.

Two iOS specifics that come with it:

- **The launch screen has two variants.** `expo-splash-screen`'s top-level props
  are the LIGHT one (`#fafafa` with `splash-icon-light.png`, the mark in
  zinc-900) and the `dark` block is `#0a0a0a` with the white mark. A white mark
  on `#fafafa` is an empty launch screen, which is why there are two assets and
  `scripts/generate-app-assets.mjs` paints the ink per asset.
- **`expo.backgroundColor` can only be one colour**, and it is applied before JS
  exists, so it stays the dark `#0a0a0a`. `useThemedWindowBackground()` in the
  root layout repaints the window through `expo-system-ui` while the splash is
  still up, and again on every live flip.

`__tests__/themeFollowsSystem.test.tsx` asserts all of it (it replaced
`darkModePin.test.tsx`).

## Swipe-back

Expo Router uses React Navigation under the hood; iOS swipe-back is enabled
by default on the Stack navigator. We don't override `gestureEnabled` anywhere
that would break it. Modal screens (e.g. the daily check-in modal) use
`presentation: "modal"` so the swipe-down dismiss gesture works.

## Accessibility (VoiceOver, Dynamic Type, 44 points, Reduce Motion)

The baseline and the device checklist live in `ACCESSIBILITY.md` (NP-124). The
iOS-specific decisions:

- **`accessibilityLiveRegion` does nothing on iOS.** It is a TalkBack prop. A
  state change that replaces content — sign-in's "Check your inbox", onboarding's
  step change — is spoken by `lib/a11y/announce.ts`
  (`AccessibilityInfo.announceForAccessibility`, which is
  `UIAccessibility.post(.announcement)`), and the live region is set as well for
  Android. Both, always: neither one covers both platforms.
- **A modal is confined with `accessibilityViewIsModal`, and escaped with
  `onAccessibilityEscape`.** `components/Modal.tsx`'s backdrop used to be a
  full-screen `accessibilityRole="button"` labelled "Close modal", which VoiceOver
  reached BEFORE anything inside the dialog. It is now hidden from assistive
  technology (`accessible={false}`, `importantForAccessibility="no"`) and still
  tappable for a sighted member; the two-finger scrub is the dismissal, which is
  the platform gesture and arrives as `onAccessibilityEscape` on the card.
- **44 × 44 points is Apple's minimum, and padding is not a target.**
  `lib/a11y/touchTarget.ts`. The settings gear was 36 points (a 20-point icon in
  `p-2`) and the switch 28 tall.
- **Dynamic Type reaches 3.12× (AX5: 53pt body against 17pt).** Nothing in the
  app sets `allowFontScaling={false}`; the tab bar's labels are the one exception
  and they are react-navigation's, which turns scaling off on iOS 13+ on purpose
  and relies on the Large Content Viewer (`BottomTabItem`:
  `allowFontScaling = SUPPORTS_LARGE_CONTENT_VIEWER ? false : undefined`).
- **Reduce Motion is a read, not a guess.** `Modal.animationType` animates
  whatever Settings says, so `lib/a11y/reducedMotion.ts` turns the fade and the
  slide into a cut and follows `reduceMotionChanged` live.

## Haptic feedback

Tier-1 haptics are deferred to the dev build (`expo-haptics` isn't bundled in
Expo Go). The pattern is in place — every key action (set-complete tap,
streak-saved animation, check-in submit) is the natural attachment point.
Wiring lands in the P21 polish pass.

## Universal links

Deep-link to `become://verify` and `https://become.redbtn.io/verify` (via the
applinks AASA at `webapp/public/.well-known/apple-app-site-association`)
both work because `app.json` has:

```json
"ios": {
  "associatedDomains": ["applinks:become.redbtn.io"]
}
```

See P6 for the parse/verify flow.

## Home-screen widgets (iOS half)

`app.json` mounts `expo-widgets` (`~57.0.x`) with `bundleIdentifier`
`io.redbtn.become.widgets`, `groupIdentifier` `group.io.redbtn.become`,
`enableAndroid: false` (Android widgets are `react-native-android-widget`,
NP-198 — expo-widgets must not touch Android), and one widget per feed key in
`WidgetKeySchema` order (`StreakWidget`, `NutritionWidget`, `MindWidget`,
`BecomingWidget`, `TrainingWidget`), `supportedFamilies: ["systemSmall"]`
only — NP-182 adds the other sizes and Lock Screen families. The names live
in one place, `lib/widgets/iosWidgets.ts` (`IOS_WIDGETS`), mirroring
`androidWidgets.ts`; `__tests__/iosWidgetsConfig.test.ts` holds the plugin
block equal to it.

The plugin injects `extra.eas.build.experimental.ios.appExtensions` into the
RESOLVED config at prebuild time. That is inert metadata — we never run EAS,
there is no `eas.json`, no `expo-updates`, no expo.dev project — and
`scripts/check-no-ota.mjs` reads `app.json` (not the resolved config), so it
still passes. Do NOT add `extra.eas` to `app.json` yourself; the plugin puts
it there when it needs it.

Data flows app → extension, never the reverse: the app reads the feed,
pushes props (`updateSnapshot` / `updateTimeline` / `reload`), and the
extension reads them from the App Group. The widgets token stays in the app's
SecureStore (`lib/widgets/token.ts`); there is no extension-side network call
and no separate Swift module writing a token into the group.

## Verified by

- `__tests__/iosConfig.test.ts` — app.json invariants + StatusBar style +
  export compliance + the privacy manifest
- `__tests__/appAssets.test.ts` — every asset path in app.json exists (the
  check `expo-doctor` runs), the icon has no alpha, and the four
  launch-to-first-paint colours are one colour
- `__tests__/permissionStrings.test.ts` — a permission-bearing module without
  its usage string fails
- `__tests__/iosSafeArea.test.ts` — every top-level screen file references
  `SafeAreaView`
- `__tests__/iosKeyboardAvoiding.test.ts` — every input-bearing screen file
  references `KeyboardAvoidingView`
- `__tests__/accessibility.test.tsx` — the v1 screens are rendered and walked the
  way a screen reader walks them: a role and a name on everything interactive,
  44 × 44 in numbers, sign-in → Home driven by role and name alone, and nothing
  built to clip at the largest Dynamic Type size
- `__tests__/reducedMotion.test.tsx` — the hook follows the system setting, both
  overlays honour it, and a file that imports moti or Reanimated without it fails
  the build
