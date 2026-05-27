# Become — Expo (React Native) sibling app

This is the React Native (Expo) sibling to the Next.js webapp at `../webapp`. Both clients share the same backend (`become.redbtn.io`).

**Status:** Bootstrap scaffold. See `../NATIVE_MVP_PLAN.md` for the 12-week port plan and per-surface decisions.

## Stack

- **Expo SDK 56** (managed workflow, New Architecture enabled — bumped from plan's SDK 54 because the npm registry no longer ships matching SDK 54 sub-package version lines; the SDK 56 sub-packages all align to the 56.x track)
- **Expo Router 56** — file-system routing that mirrors Next.js App Router (router major-versioned to match SDK starting at 55.x)
- **NativeWind 4 + Tailwind v3** — the webapp is on Tailwind v4; NativeWind 4 only supports v3, so we maintain parallel configs with identical semantic token names
- **TypeScript strict**
- **Jest + jest-expo + @testing-library/react-native** for unit/component tests
- **ESLint** via `eslint-config-expo`
- **lucide-react-native** for icons (always `strokeWidth={1.5}`)
- **react-native-reanimated 4 + moti** as the Framer Motion replacement
- **react-native-gesture-handler** + **react-native-safe-area-context** as foundations

## Scripts

```bash
# Boot the dev server (interactive — pick i / a / w)
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
