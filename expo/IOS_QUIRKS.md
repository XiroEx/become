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

The launch screen is `expo-splash-screen` with
`image: "./assets/splash-icon.png"`, `imageWidth: 200`, `resizeMode: "contain"`
and `backgroundColor: "#0a0a0a"` — plus a `dark` block with the **same** colour
and image. `userInterfaceStyle` is now pinned to `dark` (see "Status bar"
below), so the system cannot reach for the default white launch screen; the
`dark` block stays because it costs nothing and is what keeps this true if the
pin is ever lifted.

`#0a0a0a` is not a decoration, it is the whole trick: it is the app's first
paint (`app/_layout.tsx`'s Stack `contentStyle`), the root view background
(`expo.backgroundColor`, which is why `expo-system-ui` is a dependency — on iOS
that key does nothing without it) and the adaptive-icon background. Launch
screen, window and first screen are one colour, so there is nothing to flash
between them. `__tests__/appAssets.test.ts` asserts all four agree.

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

Today the app installs none of those modules and there are no usage strings;
each later feature brings its own with its code.

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
prop is one of `'light' | 'dark' | 'auto'` and never `'black-translucent'`.

`app.json`'s `userInterfaceStyle` is **`dark`**, not `automatic` (NP-013).
`automatic` handed the app whatever the phone was set to, and NativeWind
followed it — while 39 files hard-code `#0a0a0a` in a plain RN `style`, because
a SafeAreaView or a StatusBar cannot read a Tailwind class. A phone in light
mode therefore drew light-mode text (`--foreground: 24 24 27`, near-black) on
those near-black surfaces. v1 ships one theme: `lib/theme/colorScheme.ts`'s
`pinDarkMode()` runs at module load in `app/_layout.tsx` and `app.json` says
`dark` so the OS agrees about keyboards, share sheets and the launch screen.
`__tests__/darkModePin.test.tsx` asserts all of it. NP-123 is where a real
light theme lands, and it starts by deleting the literals.

## Swipe-back

Expo Router uses React Navigation under the hood; iOS swipe-back is enabled
by default on the Stack navigator. We don't override `gestureEnabled` anywhere
that would break it. Modal screens (e.g. the daily check-in modal) use
`presentation: "modal"` so the swipe-down dismiss gesture works.

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
