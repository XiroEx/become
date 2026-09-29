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
  of errors that have nothing to do with the code.
- **There is no Expo web target.** The web client is the Next.js app in
  `../webapp`, so `react-native-web` and the `web` script are gone. `react-dom`
  stays as a direct dependency because `expo-router`'s own dependencies
  (`vaul`, `@radix-ui/*`) require it, and pinning it here keeps npm from
  resolving a `react-dom` that demands a newer `react`.

TypeScript is on the 6.0 line because that is what SDK 57 expects. TS 6 no
longer injects every `@types/*` package into the global scope, which is why
`tsconfig.json` names `"types": ["jest", "node"]` explicitly.

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

## File layout

```
expo/
├── app/                  # Expo Router file-system routes (mirrors webapp/app)
│   ├── _layout.tsx       # Root layout: GestureHandlerRootView + SafeAreaProvider
│   └── index.tsx         # Home / theme-probe screen
├── lib/
│   └── theme/
│       └── tokens.ts     # Typed RGB-triplet map (light + dark)
├── __tests__/            # Jest + RTL tests
├── __mocks__/            # cssStub.js — resolves the `global.css` side-effect import under Jest
├── assets/               # Icons, splash, etc. (populated as needed)
├── global.css            # Tailwind directives + CSS variable tokens
├── tailwind.config.js    # NativeWind 4 + Tailwind v3 config
├── babel.config.js       # babel-preset-expo + nativewind/babel + reanimated/plugin
├── metro.config.js       # withNativeWind wrapper
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
- **`strokeWidth={1.5}` on every lucide icon** — RN default is 2 and looks bolder than the webapp.
- **No black-translucent statusBarStyle** — per [[feedback_black_translucent]] memory.
- **Tailwind v3, not v4** — NativeWind 4 doesn't support v4 yet.
- **`lucide-react-native` is mapped to its CJS build in the Jest config** — the
  package's `react-native` export condition points at an `.mjs` bundle, and
  jest-expo's babel transform only matches `.[jt]sx?`, so the ESM bundle reaches
  Jest untranspiled. Metro is unaffected; this is a test-only mapping.
- **`__tests__/root-layout-smoke.test.tsx` is the launch canary** — it renders
  the real `app/_layout.tsx` through `renderRouter` from
  `expo-router/testing-library`. Every other suite renders a screen in
  isolation, so only this one loads the module graph that a device loads at
  launch. If a dependency set cannot boot, this is the test that says so.
