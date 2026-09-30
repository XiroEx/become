# Become — Expo (React Native) sibling app

This is the React Native (Expo) sibling to the Next.js webapp at `../webapp`. Both clients share the same backend (`become.redbtn.io`).

**Status:** Bootstrap scaffold. See `../NATIVE_MVP_PLAN.md` for the 12-week port plan and per-surface decisions.

## Stack

- **Expo SDK 57** (managed workflow; `expo@~57.0.25`, React Native 0.86.3, React 19.2.3). See [Which SDK, and why](#which-sdk-and-why).
- **Expo Router 57** — file-system routing that mirrors Next.js App Router (router major-versioned to match SDK starting at 55.x)
- **NativeWind 4 + Tailwind v3** — the webapp is on Tailwind v4; NativeWind 4 only supports v3, so we maintain parallel configs with identical semantic token names
- **TypeScript strict**
- **Jest + jest-expo + @testing-library/react-native** for unit/component tests
- **ESLint** via `eslint-config-expo`
- **lucide-react-native** for icons (always `strokeWidth={1.5}`)
- **react-native-reanimated 4 + moti** as the Framer Motion replacement
- **react-native-gesture-handler** + **react-native-safe-area-context** as foundations

## Which SDK, and why

**The app is on Expo SDK 57** (`expo@~57.0.25`, the `latest` tag on npm at the
time of the bump; SDK 58 is still in preview). Three reasons it has to be 57 and
not 56:

1. **SDK 56 could not launch.** SDK 56's pinned set had `react@19.2.6` next to
   React Native 0.85.3, whose renderer refuses to initialise unless `react` is
   exactly the version it ships (19.2.3). `app/_layout.tsx` imports
   `react-native-gesture-handler`, which loads that renderer at module load, so
   the root layout threw `Incompatible React versions` — in Jest and, because
   Metro bundles with `inlineRequires: false`, at launch on a device too.
2. **Hermes V1 memory regression.** `npx expo-doctor` flags every SDK ≤ 56
   project using Hermes V1 ≤ 250829098.0.15. The fix ships in React Native
   0.86.2+, which means Expo SDK 57.
3. **`app.json` schema.** SDK 57 dropped `newArchEnabled` (the New Architecture
   is the only architecture now) and `androidNavigationBar` (Android is
   edge-to-edge by default). Both keys failed the config-schema check.

Rules this directory lives by, so it does not drift back:

- **Never pin `react` away from the version React Native ships.** The version of
  record is `react` in `expo/bundledNativeModules.json` for the installed SDK
  (57 → `react@19.2.3`, `react-native@0.86.3`); `react-dom` and
  `react-test-renderer` are pinned to the same 19.2.3.
- **`npx expo install --check` must report no mismatches**, and
  `npx expo-doctor` must pass every check. Run both before shipping a dependency
  change. Use `npx expo install <pkg>` (not `npm install`) so the SDK's expected
  range is what lands.
- **`zod` is pinned exactly (`4.4.3`) to match `../shared/api-client`.** The two
  packages have separate `node_modules`; when their `zod` copies differ the
  inferred schema types stop unifying and `npx tsc --noEmit` fails with hundreds
  of errors that have nothing to do with the code. The BUNDLE always contains
  exactly one copy of `zod` — this app's — see [The shared API
  client](#the-shared-api-client).
- **There is no Expo web target.** The web client is the Next.js app in
  `../webapp`, so `react-native-web` and the `web` script are gone. `react-dom`
  stays as a direct dependency because `expo-router`'s own dependencies
  (`vaul`, `@radix-ui/*`) require it, and pinning it here keeps npm from
  resolving a `react-dom` that demands a newer `react`.

TypeScript is on the 6.0 line because that is what SDK 57 expects. TS 6 no
longer injects every `@types/*` package into the global scope, which is why
`tsconfig.json` names `"types": ["jest", "node"]` explicitly.

## The shared API client

The wire contract lives at `../shared/api-client` (`@become/api-client`) and is
imported by most screens. Three separate mechanisms reach it, and they are not
interchangeable:

| Tool | How it finds the package |
|---|---|
| `tsc` | `paths` in `tsconfig.json` → `../shared/api-client/src/index` |
| Jest | `moduleNameMapper` in `package.json` |
| **Metro** | `node_modules/@become/api-client`, and nothing else |

For a long time only the first two existed. The typecheck and the suite were
green while **Metro could not resolve the package at all**, so `npx expo export`
— and therefore every EAS build — failed on the first screen that imports it.
Three things fix that, and all three have to stay:

1. **`"@become/api-client": "file:../shared/api-client"` in `package.json`.**
   The repository root is not an npm workspace, so this `file:` link is what
   puts the package (as a symlink) in `node_modules`. Run `npm install` in this
   directory after changing it so `package-lock.json` keeps the link entry —
   `npm ci` refuses to run when the two disagree.
2. **`watchFolders` includes `../shared`** (`metro.config.js`). The link points
   out of the project root, and Metro serves the project root plus
   `watchFolders` and nothing else.
3. **`resolver.nodeModulesPaths` is this app's `node_modules`, and
   `shared/**/node_modules` is on the `blockList`** (`metro.config.js`). The
   shared sources import `zod` and Metro resolves it from THEIR location on
   disk: with neither setting the lookup walks out of the repository and the
   export fails on `zod`; with only the first, a machine that has installed
   `shared/api-client`'s own dependencies (CI does, because tsc needs its `zod`)
   bundles a second copy of `zod`. Together they leave exactly one.

A consequence worth knowing: **a runtime dependency added to
`shared/api-client` must also be declared here**, or the bundle fails to resolve
it. That is deliberate — the app declares everything it ships.

`.github/workflows/ci.yml`'s `expo` job runs
`npx expo export --platform ios` for exactly this reason: it is the only step
that builds the app, and nothing else in the job can see a Metro resolution
failure.

**EAS builds get `../shared` for free.** `eas build` archives from the ROOT of
the git repository (this project is a subdirectory of it, and `shared/` is
tracked and not ignored — there is no `.easignore`), then installs and builds
in `expo/`. The `file:` link therefore resolves on the builder exactly as it
does here.

## Scripts

```bash
# Boot the dev server (interactive — pick i / a)
npm run start

# Launch on a connected iOS simulator (macOS host required)
npm run ios

# Launch on a connected Android emulator / device
npm run android

# TypeScript check (no emit)
npm run typecheck

# ESLint
npm run lint

# Jest
npm test
```

To run on a physical device with the **Expo Go** app:
1. `npm run start`
2. Scan the QR code that appears in the terminal with Expo Go (iOS) or the camera app (Android, then tap to open in Expo Go).

> Per the `nextjs-to-react-native` skill: stay on Expo Go as long as possible. We only move to a dev build (`expo-dev-client`) when a native module not in Expo Go's prebuilt set is required (e.g. `expo-health`, custom Swift/Kotlin modules).

## Theme tokens

CSS variables live in `global.css` as bare `R G B` triplets (no commas, no `rgb()` wrapper) so Tailwind composes alpha via `rgb(var(--primary) / <alpha-value>)`.

The same triplets are exported from `lib/theme/tokens.ts` as a typed map, for RN APIs that can't read Tailwind classes (StatusBar, lucide `color` prop, etc.).

`darkMode: "class"` is set in `tailwind.config.js` — non-negotiable for NativeWind's runtime `colorScheme.set()`.

### Light and dark both ship, and the system picks (NP-123)

`lib/theme/colorScheme.ts` exports `followSystemColorScheme()`, which
`app/_layout.tsx` calls **at module load** — before the first render, so there is
no frame in the wrong theme. `app.json` sets `userInterfaceStyle: "automatic"` so
the OS agrees about the surfaces the app does not draw (keyboards, share sheets,
the launch screen, which has a light variant and a dark one), and the status bar
style is derived from the theme rather than pinned to `light`.

**Every colour comes from a class or from `useThemeTokens()`.** The hook reads
NativeWind's colour scheme — the same signal `bg-background` resolves against —
so a class and a plain RN `style` on one screen can never disagree, and a live
flip of the system setting re-renders both. It gives you `colors` (every token as
`rgb(r g b)`), `tint()` for the translucent banner surfaces, `scrim` for a modal
backdrop, and `statusBarStyle`. `useThemedWindowBackground()` (root layout only)
repaints the window itself through `expo-system-ui`, because `app.json` can only
hold one colour for it.

This replaced NP-013's dark pin, which existed only because 43 `#0a0a0a`
literals sat in plain RN styles while the classes beside them followed the
system: a phone in light mode drew light-mode text (`--foreground: 24 24 27`,
near-black) on those near-black surfaces. **A hex colour is now a lint error and
a test failure** in `app/`, `components/` and `lib/` — `eslint.config.mjs`
(`no-restricted-syntax`) and `__tests__/noHexColorLiterals.test.ts`.
`__tests__/themeFollowsSystem.test.tsx` covers the rest: the live flip, the
window, the status bar, the navigators, the two launch screens, and the contrast
of every text/surface pair in both modes.

## Offline: the banner, and the writes that keep their day

The app is usable with no connection, and two files are the whole of it:

- **`components/offline/ConnectivityBanner.tsx`** — mounted once, at the root,
  above the Stack. It shows a bar the moment NetInfo says the connection is
  gone and hides it when it is back (NetInfo pushes its events; nothing
  debounces or polls them), it starts the write queue, and it **clears the
  queue when the session ends** — every sign-out, a tapped one and a 401 alike,
  arrives here as `status: "signed-out"`.
- **`lib/offline/writes.ts`** — the mount of `lib/query/offlineQueue.ts` (dedup,
  backoff, a persisted snapshot). Every weight and every mood the member logs
  goes through it, online or not: the dashboard check-in, the Mind screen and
  the weigh-in in Settings.

**The rule that makes a replay safe: a queued write keeps its own day.** The
payload is built when the member taps and is never rebuilt at delivery —
`date` (their local day), `loggedAt` (the instant) and `tz` (minutes west of
UTC). Without them the server dates a write by its own clock, so a mood logged
at 11:50pm and delivered at 12:05am would land on tomorrow. `/api/mood` and
`/api/weight` read all three (NP-189, `webapp/lib/dayWindow.ts#resolveEntryDay`),
keep one entry per local day, and let the newer `loggedAt` win — so a replay
can never move an entry to another day or overwrite a newer value.

Two things deliberately do NOT go through it: a weight **skip** (it answers
*today's* prompt, so back-dating it would answer a prompt that is gone) and the
live workout's own saves (NP-191 owns those, over the four-collection façade in
`lib/query/offlineMutations.ts`).

An unreachable server is no longer an error the member sees — the write is kept
and the banner says so. A **refusal** (a 4xx that is not 408/425/429) still is:
retrying cannot change it, so the item is dropped and the caller told.

## Typography — Geist, the web's typeface (NP-160)

The web has set **Geist** and **Geist Mono** since the first commit
(`webapp/app/layout.tsx` loads them from `next/font/google` and
`webapp/app/globals.css` feeds them to Tailwind's `--font-sans` / `--font-mono`).
Native loaded no font at all, so every screen drew in San Francisco or Roboto.
Four facts hold this up, and each one is a bug that would otherwise ship:

- **Eight files, in the repo.** `assets/fonts/` carries Geist and Geist Mono at
  400/500/600/700 — Google Fonts' latin subset, the same files the web serves,
  SIL Open Font License 1.1 (`assets/fonts/OFL.txt`). `expo-font` registers them
  from the bundle; nothing is fetched at runtime, so the app works offline and
  in Expo Go.
- **One face per weight, because `fontFamily` names a FACE.** A browser
  synthesises weights from one variable file; React Native cannot. A
  `fontWeight` the named face does not have is ignored on iOS (a
  runtime-registered font is a family of one) or faked on Android. So
  `lib/theme/fonts.ts` maps family × weight → face, and `font-mono font-bold`
  resolves to exactly one file: `GeistMono-Bold`. CSS cannot express that — it
  is two properties — which is why the resolution is in JS.
- **The app owns its Text.** React Native has no cascade: a `<Text>` with no
  `fontFamily` is the system font, whatever `tailwind.config.js` says. Every
  screen and component imports `Text` from `components/Text.tsx`, which resolves
  the face from the className (or the inline style) and applies it INLINE —
  NativeWind's highest-precedence source, so it outranks the `font-sans` /
  `font-mono` families rather than fighting them. ESLint's
  `no-restricted-imports` fails the build on `import { Text } from
  "react-native"` anywhere under `app/` or `components/`. `components/Input.tsx`
  does the same by hand for the app's one `TextInput`.
- **The launch screen is held until the faces are registered.**
  `holdSplashForFonts()` runs at MODULE LOAD in `app/_layout.tsx` (an effect is
  one frame too late), the layout renders `null` until `useGeistFonts()` reports
  ready, and that hook hides the splash. React Native does not re-render a
  `<Text>` when a font arrives, so anything painted early keeps the system font
  for the life of the screen. A load FAILURE also counts as ready: the system
  font is ugly, a splash that never lifts is a dead app.

`__mocks__/expo-font.js` answers "loaded" for every other suite, so they render
the layout without awaiting a font. Test: `__tests__/geistFont.test.tsx` — it
parses the `.ttf` headers, walks `app/` and `components/` for a stray
`react-native` Text import, drives the splash gate through both states, and
reads `webapp/` to check the web still uses Geist.

## Accessibility baseline (NP-124)

Full detail — including the device QA checklist — is in
[`ACCESSIBILITY.md`](./ACCESSIBILITY.md). The four rules, and where each lives:

- **Every interactive element has a role and a label.** The label may be the
  words inside the control, but `components/Button.tsx` computes it
  (`accessibleName`) because `loading` replaces the label with a spinner and a
  spinner has no name. `Toggle`'s `accessibilityLabel` is a REQUIRED prop: a
  switch has no words of its own, and a type error is the only check that catches
  the next one that forgets. A group that reads as one fact (the streak banner,
  today's workout) is ONE element with a composed label; decoration (the sheet's
  grab bar, the modal backdrop) is hidden rather than described.
- **44 × 44 points, minimum** — `lib/a11y/touchTarget.ts`. `minTouchTarget`
  grows the view where growing is invisible; `hitSlopToMinTarget(w, h)` grows
  only the touchable area where the size IS the design (the 48 × 28 switch
  track). The settings gear was a 36-point target until this card.
- **Dynamic Type is never capped** — `lib/a11y/dynamicType.ts`. Nothing sets
  `allowFontScaling={false}`; what breaks at the largest size is layout, and it
  breaks because **React Native's `flexShrink` is 0 where CSS's is 1** — a
  `<Text>` in a flex ROW keeps its intrinsic width and runs off the end instead
  of wrapping. So text in a row gets `WRAPPABLE_TEXT`, and rows of controls get
  `flex: 1` wrappers. (The tab bar's labels do not scale, by react-navigation's
  design: it uses iOS's Large Content Viewer instead.)
- **Reduce Motion is honoured** — `lib/a11y/reducedMotion.ts`. React Native
  applies none of it: `Modal.animationType` animates and every Reanimated
  `withTiming` runs whatever the setting says. The rule that travels: a file
  importing `moti` or `react-native-reanimated` must also reach for
  `useReducedMotion`, and `__tests__/reducedMotion.test.tsx` sweeps the sources
  for the first one that does not.

Tests: `__tests__/accessibility.test.tsx` renders the v1 screens (sign-in,
consent, onboarding, Home, Settings — the plan page has no native screen until
NP-053) and walks the rendered tree the way a screen reader does, driving sign-in
→ Home **using only queries by role and accessible name**;
`__tests__/reducedMotion.test.tsx` drives the hook through the system setting
and both overlays with it. Neither can lay text out, which is why the device pass
in `ACCESSIBILITY.md` exists.

## File layout

```
expo/
├── app/                  # Expo Router file-system routes (mirrors webapp/app)
│   ├── _layout.tsx       # Root: GestureHandlerRootView, SafeAreaProvider,
│   │                     #   AuthProvider, the cold-open unlock, and a Stack
│   │                     #   over index / (auth) / (app) / onboarding
│   ├── +native-intent.tsx# Every incoming link passes through here first, and
│   │                     #   is resolved by lib/navigation/webPathToRoute.ts
│   ├── index.tsx         # The launch redirect (sign-in, onboarding or Home)
│   ├── onboarding.tsx    # Signed-in, but OUTSIDE (app): the gate points here
│   ├── _stories.tsx      # Component gallery. A LIVE route (see below) — it
│   │                     #   redirects to Home unless __DEV__
│   ├── (auth)/           # No session required: login, verify, account/restore
│   └── (app)/            # AuthGuard → ConsentGate → OnboardingGuard
│       ├── (tabs)/       # Four tabs (the web's bar); chat + calendar +
│       │   │             #   profile hidden (href: null)
│       │   └── <tab>/    # each with its own _layout.tsx Stack, so detail
│       │                 #   screens PUSH inside the tab instead of becoming
│       │                 #   tab buttons of their own
│       └── admin/        # Read-only native admin shells — also __DEV__ only
├── index.js              # THE app entry (package.json `main`): expo-router/entry
│                         #   plus the Android App Widget task registration
├── lib/
│   ├── a11y/
│   │   ├── announce.ts       # announce() — VoiceOver is told what replaced what
│   │   ├── dynamicType.ts    # The largest scales + WRAPPABLE_TEXT (flexShrink: 1)
│   │   ├── reducedMotion.ts  # useReducedMotion() / modalAnimation() / motionDuration()
│   │   └── touchTarget.ts    # 44 points: minTouchTarget + hitSlopToMinTarget()
│   ├── dev/
│   │   └── devOnlyRoute.tsx  # Wraps a route so it redirects to Home outside __DEV__
│   ├── widgets/              # Android App Widgets (NP-198): the four tiles, the
│   │                         #   widgets-token hand-off, the feed read, the
│   │                         #   cached day, the surfaces and the OS refresh
│   ├── navigation/
│   │   └── webPathToRoute.ts # THE web-path → native-route table (one per app)
│   ├── offline/
│   │   ├── connectivity.ts   # THE NetInfo state → "online" mapping (one per app)
│   │   ├── storage.ts        # AsyncStorage, where the queue's snapshot lives
│   │   └── writes.ts         # The mounted weight/mood queue (see Offline, below)
│   ├── query/                # offlineQueue.ts — dedup + backoff + snapshot
│   └── theme/
│       ├── colorScheme.ts    # followSystemColorScheme() — the system decides
│       ├── fonts.ts          # The Geist faces + family × weight → one face
│       ├── loadFonts.ts      # useGeistFonts() / holdSplashForFonts()
│       ├── tokens.ts         # Typed RGB-triplet map (light + dark) + tint/scrim
│       └── useThemeTokens.ts # THE hook: colours for everything Tailwind can't reach
├── components/
│   └── Text.tsx          # THE app's Text — React Native's, with Geist on it
├── __tests__/            # Jest + RTL tests
├── __mocks__/            # cssStub.js (the `global.css` side-effect import),
│                         # expo-font.js + expo-splash-screen.js (fonts are
│                         # already loaded for every suite but geistFont's),
│                         # plus node-module mocks for NetInfo and AsyncStorage,
│                         #   applied automatically (no jest.mock call)
├── assets/               # icon.png (store, opaque), adaptive-icon.png
│   │                     # (Android foreground), splash-icon.png —
│   │                     # all three written by scripts/generate-app-assets.mjs
│   └── fonts/            # Geist + Geist Mono at 400/500/600/700, and the OFL
├── scripts/              # Build-time Node scripts (asset generation)
├── global.css            # Tailwind directives + CSS variable tokens
├── tailwind.config.js    # NativeWind 4 + Tailwind v3 config
├── babel.config.js       # babel-preset-expo + nativewind/babel + reanimated/plugin
├── metro.config.js       # withNativeWind + the ../shared resolution (see above)
├── app.json              # Expo config (scheme: become, bundle: io.redbtn.become)
├── eslint.config.mjs     # eslint-config-expo flat
├── tsconfig.json         # strict, extends expo/tsconfig.base
└── package.json          # jest config lives inline under "jest" key (preset: jest-expo)
```

## Phase index

This directory tracks against the phases in `../NATIVE_MVP_PLAN.md`. The work in this directory was bootstrapped by **P2-expo-bootstrap**. Subsequent phases will:

- P3 — shared API client lands at `../shared/api-client/`
- P4 — base components land at `expo/components/`
- P5 — data hooks land at `expo/lib/hooks/`
- P6 — auth context + deep-link handler
- P7+ — screen-by-screen port

See the plan doc for full sequencing.

## Gotchas (per skill)

- **`darkMode: "class"` mandatory** — without it, NativeWind crashes at runtime when the theme changes.
- **Never `import { Text } from "react-native"`** — import it from
  `@/components/Text`, which carries the Geist face. React Native has no
  cascade, so a bare `<Text>` is the system font no matter what the Tailwind
  theme says. ESLint fails the build on it; see [Typography](#typography--geist-the-webs-typeface-np-160).
- **`strokeWidth={1.5}` on every lucide icon** — RN default is 2 and looks bolder than the webapp.
- **A new touchable needs a role, a label and 44 points** — the role and the
  label because that is all VoiceOver has to go on, and the 44 from
  `lib/a11y/touchTarget.ts` because NativeWind padding around a small icon is
  not a hit target. `__tests__/accessibility.test.tsx` walks the v1 screens for
  both and sweeps every `.tsx` under `app/` and `components/` so no file holds
  more touchables than roles. See [Accessibility
  baseline](#accessibility-baseline-np-124).
- **Never `allowFontScaling={false}`, and never a fixed height around text** —
  Dynamic Type goes to 3.12× on iOS. A `<Text>` inside a flex row also needs
  `WRAPPABLE_TEXT`: React Native's `flexShrink` is 0, so it would run off the end
  of the screen rather than wrap.
- **Anything that animates asks `useReducedMotion()` first** — moti and
  Reanimated do not consult the system setting, and the suite fails the build on
  a file that imports either without it.
- **No black-translucent statusBarStyle** — per [[feedback_black_translucent]] memory.
- **Tailwind v3, not v4** — NativeWind 4 doesn't support v4 yet.
- **`lucide-react-native` is mapped to its CJS build in the Jest config** — the
  package's `react-native` export condition points at an `.mjs` bundle, and
  jest-expo's babel transform only matches `.[jt]sx?`, so the ESM bundle reaches
  Jest untranspiled. Metro is unaffected; this is a test-only mapping.
- **NetInfo and AsyncStorage are mocked as NODE MODULES, not per test** —
  `__mocks__/@react-native-community/netinfo.js` and
  `__mocks__/@react-native-async-storage/async-storage.js` sit next to
  `node_modules`, so Jest applies them automatically with no `jest.mock()`
  call. The root layout mounts the connectivity banner and starts the write
  queue, so every suite that renders it would otherwise reach for a native
  module the test renderer does not have. A test that needs the connection to
  CHANGE either drives `NetInfo.fetch` (a `jest.fn`) or passes its own
  `ConnectivitySource` — both the banner and the queue take one.
- **`__tests__/root-layout-smoke.test.tsx` is the launch canary** — it renders
  the real `app/_layout.tsx` through `renderRouter` from
  `expo-router/testing-library`. Every other suite renders a screen in
  isolation, so only this one loads the module graph that a device loads at
  launch. If a dependency set cannot boot, this is the test that says so.
- **The navigation shell is tested by RENDERING it, not by reading a config
  array** — `__tests__/navigation-shell.test.tsx` (the tab bar and the
  per-tab stacks) and `__tests__/launch-and-links.test.tsx` (where a launch
  and a cold-start link land) build their route map from the real `app/`
  directory via `test-support/appRoutes.tsx`. A screen file added tomorrow is
  in the render tomorrow: that is how a tab bar with twenty buttons went
  unnoticed while a five-entry `TAB_ROUTES` array was asserted to be five
  entries long.
- **One resolver from web paths to native routes** — the server only speaks in
  web paths (emails link to `/verify` and `/account/restore`, pushes carry
  `/dashboard/…` urls, widgets carry a `deepLink`, suggestion cards a
  `primaryAction.href`), and `lib/navigation/webPathToRoute.ts` is the ONE table
  that turns them into `/(tabs)/…` routes. Every entry point reads it:
  `app/+native-intent.tsx` (every incoming link, cold start included),
  `lib/push/deepLinkRouter.ts` (notification taps), and widget taps and
  suggestion cards when they land. Two rules travel with it — one mapping for
  every entry point, and a row whose native screen is not built yet falls back
  deliberately (`fallback: "nearest" | "hidden"`) and never to a blank screen.
  `__tests__/webPathToRoute.test.ts` READS the server's own sources
  (`webapp/app/api/cron/notify/route.ts`, `webapp/lib/widgets/feed.ts`,
  `webapp/lib/goals/suggestions.ts`, `webapp/lib/suggestions/**`), so a url
  added over there fails this suite until it has a row.
- **The tab bar is the WEB's tab bar** — order, labels and icons come from
  `webapp/components/BottomNav.tsx`: Workout, Mind, Home, Nutrition, minus
  Community while the web hides it behind `FeatureGuard`. The `programming`
  folder is the *Workout* tab (the route keeps its name; renaming it would
  break every `/(tabs)/programming/…` href), and `chat` stays in the tree as a
  hidden tab until NP-032 removes those routes behind
  `EXPO_PUBLIC_COMMUNITY_ENABLED`.
- **The app entry is `index.js`, not `expo-router/entry` directly** — it imports
  that same module and then registers the Android App Widget task handler
  (NP-198). Android wakes a widget's provider as a headless JS task with no UI,
  so `AppRegistry.registerHeadlessTask` must have run by the time the bundle
  finishes evaluating; a registration inside a component only exists once the UI
  does. See `ANDROID_QUIRKS.md` § App Widgets and `lib/widgets/`.
- **`_` is not a private prefix in expo-router** — its ignore list is exactly
  `+api`, `+html` and `+native-intent` (`getIgnoreList` in
  `expo-router/build/getRoutesCore.js`), so `app/_stories.tsx` is a live route
  at `become://_stories`. A screen that must not ship is wrapped in
  `devOnlyRoute()` (`lib/dev/devOnlyRoute.tsx`), which redirects to Home unless
  `__DEV__`. `__tests__/dev-only-routes.test.tsx` opens all three URLs with
  `__DEV__` flipped and asserts where they land.
