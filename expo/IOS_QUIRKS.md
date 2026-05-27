# iOS quirks

Polish-pass decisions for the iOS half of the native app. Each section calls
out the choice + the rationale + the file it lives in, so a future polish
pass can find + revisit.

## Safe area

Every top-level screen wraps its content in `SafeAreaView` from
`react-native-safe-area-context` with `edges={["top","bottom"]}`. This handles
both the notch + the home-bar overlap on modern iPhones. Layout files
(`app/_layout.tsx`, `app/(tabs)/_layout.tsx`) wrap the entire tree in a
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

- `app/login.tsx`
- `app/(tabs)/chat/[id].tsx`
- `app/(tabs)/nutrition/search.tsx`
- `app/(tabs)/nutrition/food/[id].tsx`
- `app/(tabs)/calendar/settings.tsx`

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

`app.json`'s `userInterfaceStyle: "automatic"` lets the system pick light vs
dark dynamically (which the dark theme defaults to dark anyway).

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

- `__tests__/iosConfig.test.ts` — app.json invariants + StatusBar style
- `__tests__/iosSafeArea.test.ts` — every top-level screen file references
  `SafeAreaView`
- `__tests__/iosKeyboardAvoiding.test.ts` — every input-bearing screen file
  references `KeyboardAvoidingView`
