# Native MVP Plan — Become (React Native / Expo Sibling)

> **Status:** Draft (claimed 2026-05-27 by claude-worker as part of the `native-app-port` strategic).
> **Scope:** Build a React Native (Expo) sibling app to `webapp/`, sharing the same backend at `become.redbtn.io`.
> **Source-of-truth:** This document. Every concrete phase ID referenced below has a 1:1 entry in the working batch — see [Phase index](#phase-index).

---

## 1. Goals

- **One backend, two clients.** The Next.js webapp (`webapp/`) stays the source of truth. The Expo app (`expo/`) is a deliberate, documented lag — it page-mirrors the webapp.
- **Reach iOS + Android in ~12 weeks, 1 FT eng.** The MVP cut is intentional: ship the high-leverage 70% of webapp surfaces, defer (or web-only) the long-tail 30%.
- **No backend rewrites for the port.** The auth, schedule, workouts, nutrition, chat, and progress endpoints already exist and are tz-aware (PRs #315/#316). The Expo client consumes them via a shared, zod-typed API client that the webapp will also gradually adopt.
- **Native-only wins from day one of the relevant phase.** Push notifications (server side already shipped per project memory — push-notifications strategic is done), HealthKit/Health Connect, biometrics, offline workout-save queue. These are the *reasons* a Becomer would prefer the app over mobile-web.
- **Mindset-first framing carries to native.** Per [[project_marketing_positioning]] memory, mindset surfaces (mood / wins / discipline / streak) are the brand differentiator. Native parity for the Mind tab is non-negotiable in MVP, even though it would seem "deferrable" on a pure-workout-app reading.

### Non-goals (for the 12-week cut)

- **Admin tooling.** Food review, exercise editor, video framing, recipe editor — all stay web-only. Native links out to `become.redbtn.io/dashboard/admin/...` via Tier 3 deep-link.
- **Coach / cohort tooling.** Same reasoning — web-only.
- **Heavy editors.** Workout builder, program editor, recipe editor — web-only with Tier 3 deep-link.
- **Offline read of arbitrary data.** Offline writes (workout / weight / mood / meal log) are in scope. Read offline is best-effort via TanStack Query persistor, not a guarantee.

---

## 2. Tier framework (cut decisions per surface)

We use the @redbtn-proven Tier 1/2/3 framework from the `nextjs-to-react-native` skill:

> **Tier 1 — Read-only mirror + modal editor.** Days to build, Expo Go-compatible. List/grid renders the data, tap → modal opens a focused editor. No spatial visualization. The user can do ~80% of the editing work without us building a canvas.
>
> **Tier 2 — Full native gesture implementation.** Weeks, requires a dev build (Reanimated + gesture-handler + skia/svg). Real pan/pinch/drag. Default position: defer.
>
> **Tier 3 — Deep-link "Edit in web browser."** 1 day. Button opens `become.redbtn.io/.../[id]` in `expo-web-browser` with a one-time-token-exchanged session. Native mobile-web on Become already works because the webapp is responsive.

### Per-surface decisions

| Surface | Tier | Rationale | Phase |
|---|---|---|---|
| **Auth (magic link)** | Tier 1 (native) | Deep-link verify is straightforward; no editor question. Universal Links + polling fallback (per skill). | P6 |
| **Dashboard** | Tier 1 (native) | Read-mostly: today's workout teaser, streak banner, check-in modal. Modal handles mood/weight quick-log. | P7 |
| **Programs list / detail** | Tier 1 (native) | Read flow. Browse + saved + start program. Editor stays web-only. | P8 |
| **Live workout** | Tier 1 (native) | Full native parity is *the* core flow. Set logging, group nav, rest timers. Per-set log is a modal-style focused input — already aligns with Tier 1. | P9 |
| **Workout builder / program editor** | Tier 3 | Deep-link to `/dashboard/programming/[programId]/edit`. Heavy form with drag-reorder; not worth porting. | (deferred — doc note in P14) |
| **Food search + meal log** | Tier 1 (native) | Highest-traffic flow per memory. Debounced search → variant picker → serving picker → log. All Tier 1 modals. | P10 |
| **Recipes** | Tier 1 (native) | Browse + save-as-meal. Recipe *create* form is web-only via Tier 3. | P11 |
| **Recipe create / edit** | Tier 3 | Multi-step form with image upload + ingredients table. Deep-link to webapp. | (P11 doc note) |
| **Timeline / calendar** | Tier 1 (native) | Calendar component renders fine in RN. Schedule settings is a focused form (Tier 1 modal). | P12 |
| **Mind tab (mood / wins / discipline / streak)** | Tier 1 (native) | Brand differentiator — see [[project_marketing_positioning]]. Lives across P7 (dashboard) + P9-adjacent screens. Surfaced in MVP. | P7 (entry) |
| **Chat** | Tier 1 (native) | Conversation list + thread + send. Existing endpoints already work (per memory: 4 e2e tests passing). | P13 |
| **Admin (food review / exercise editor / video framing)** | Tier 3 | Heavy editing surfaces. Deep-link out. Native shows a read-only list as a courtesy. | P14 |
| **Push notifications** | Tier 1 (native) | Server-side already in place. Need `expo-notifications` + token-registration roundtrip. | P15 |
| **Health integration** | Tier 1 (native) | Read weight + step count, opt-in. Adapter abstracts iOS/Android. | P16 |
| **Biometrics auth** | Tier 1 (native) | `expo-local-authentication` on cold open if stored JWT exists. | P17 |
| **Offline sync** | Tier 1 (native) | TanStack Query + AsyncStorage persistor for workout / weight / mood / meal log mutations. | P18 |
| **iOS / Android quirks** | n/a | Polish pass per platform. | P19 / P20 |
| **Distribution (TestFlight + Play Internal)** | n/a | EAS Build + Submit. | P21 |

### Surfaces explicitly deferred (web-only via Tier 3 deep-link)

- Program editor (`/dashboard/programming/[programId]/edit`)
- Workout builder (`/dashboard/programming/create`)
- Recipe create/edit (`/dashboard/nutrition/recipes/create`)
- Exercise editor + video upload + framing editor
- Admin food review *editing* (read list lives native; edits deep-link out)
- Admin user / cohort tooling
- Onboarding *coach setup* — user onboarding lives native (P6/P7), but the coach-side configuration is web-only

Each deferred surface gets an "Edit in browser" button (Tier 3) in the native UI. Catalog lives in `expo/gap_analysis/SUMMARY.md` (P14 deliverable).

---

## 3. Twelve-week timeline (1 FT eng)

Front-loaded foundations so user-visible work compounds. Doc + foundations first (weeks 1–3), MVP-shippable slice by week 6 (TestFlight), feature parity sweep weeks 7–10, polish + distribution 11–12.

### Weeks 1–2 — Foundations doc + scaffold + shared client

| Wk | Phase | Output |
|---|---|---|
| 1 | **P1** Plan doc (this file) | `NATIVE_MVP_PLAN.md` committed; phase IDs locked. |
| 1 | **P2** Expo bootstrap | `expo/` directory with Expo Router + NativeWind 4 + Tailwind v3 + jest. Hello screen + smoke test. (Bumped to SDK 56 during P2 build — npm registry no longer ships matching SDK 54 sub-package version lines; SDK 56 is the current stable.) |
| 2 | **P3** Shared API client | `shared/api-client/` package: zod schemas + typed `apiFetch` + tz= injection. Webapp adopts on one route as proof-of-life. |
| 2 | **P4** Design system + base components | NativeWind tokens (CSS-variable triplets per skill), Button/Card/Input/Toggle/Badge/Modal/BottomSheet, stories screen. |

**Exit criteria for week 2 (Foundation milestone):**
- `npm --prefix expo run typecheck` clean
- `npm --prefix expo test` runs P2 smoke + P4 component tests green
- `shared/api-client/` builds, ≥20 unit tests green, webapp imports it from ≥1 route
- Dev can boot Expo Go and see the stories screen

### Weeks 3–5 — Auth + read flows → first TestFlight build

| Wk | Phase | Output |
|---|---|---|
| 3 | **P5** Data hooks | `useFetch` / `useMutation` / `useSSE` ported, layered on shared client. |
| 3 | **P6** Auth (magic-link deep-link) | `expo-secure-store` JWT, `expo-linking` `become://verify` handler, polling fallback (per skill), AuthGuard equivalent. |
| 4 | **P7** Tab shell + dashboard | 5-tab bottom nav (dashboard / programming / mind / nutrition / chat), DashboardScreen, daily check-in modal, streak banner. |
| 5 | **P8** Programs read flows | Browse / search / saved / detail / phase / workout overview (read-only). |

**Exit criteria for week 5 (MVP-shippable v0):**
- Real user can install Expo Go on their phone, sign in via magic link, see today's workout, log mood/weight via check-in modal, browse programs
- All P5-P8 tests green
- Internal TestFlight build (P21 deliverable preview only; the proper EAS Submit work lives in P21 at week 12)
- Per-surface gap log started in `expo/gap_analysis/SUMMARY.md`

### Weeks 6–8 — Core write flows (heaviest surfaces)

| Wk | Phase | Output |
|---|---|---|
| 6–7 | **P9** Live workout | Set logging, exercise nav, supersets/circuits/EMOM/AMRAP, rest timers, last-performance prefill, bellStyle label, save queue. |
| 7–8 | **P10** Nutrition search + meal log | Debounced search (3 sources w/ rank labels per memory), variant picker, serving picker, day-view totals. |
| 8 | **P11** Recipes browser | List + detail + save-as-meal. Tier 3 deep-link for create/edit. |

**Exit criteria for week 8 (Core flows milestone):**
- A user can complete a real workout end-to-end native
- A user can log a meal end-to-end native
- P9-P11 tests green
- Gap log updated with any backend surprises found during P9/P10

### Weeks 9–10 — Remaining read/write surfaces + native-only wins

| Wk | Phase | Output |
|---|---|---|
| 9 | **P12** Timeline + scheduling | Calendar + scheduled list + schedule settings form. |
| 9 | **P13** Chat | Conversation list + thread + send + unread badge. |
| 9 | **P14** Admin shell (Tier 2 limited) | Read-only admin food list + exercise list, Tier 3 deep-links for everything heavy. GAPS.md committed. |
| 10 | **P15** Push notifications | `expo-notifications`, token registration to existing `/api/push/subscribe`, foreground + background handlers, tap-to-deep-link. |
| 10 | **P16** Health integration | HealthKit + Health Connect read of weight + steps. Opt-in toggle in profile. |
| 10 | **P17** Biometrics | `expo-local-authentication` on cold open if JWT exists. |

**Exit criteria for week 10 (Native parity milestone):**
- Every webapp tab has a native counterpart (or a documented Tier 3 deep-link)
- Native-only wins are real: push notifications fire and route correctly; weight syncs from Health on opt-in; biometrics unlocks the app
- P12-P17 tests green
- Gap log final pass

### Weeks 11–12 — Offline + polish + distribution

| Wk | Phase | Output |
|---|---|---|
| 11 | **P18** Offline + sync | TanStack Query + `@tanstack/query-async-storage-persister`. Offline-first hooks for workout / weight / mood / meal log. NetInfo-driven sync on reconnect. |
| 11 | **P19** iOS quirks | Safe-area pass (no black-translucent per [[feedback_black_translucent]]), keyboard-avoiding, status-bar style, swipe-back. IOS_QUIRKS.md. |
| 11 | **P20** Android quirks | Edge-to-edge, hardware back, ripple, notification channels. ANDROID_QUIRKS.md. |
| 12 | **P21** EAS distribution | `eas.json`, iOS + Android credentials, first production build, TestFlight + Play Internal Track wired, RELEASE.md. |

**Exit criteria for week 12 (Launch-ready milestone):**
- Production EAS Build succeeds for both platforms
- Apple App Privacy + Google Data Safety forms filled out
- Internal beta users on both TestFlight + Play Internal Track
- All 21 phases' tests green; full unit + typecheck + e2e (where applicable) clean
- Gap log frozen as the canonical "what's deferred" reference

---

## 4. Per-milestone exit criteria summary

| Milestone | Week | Hard gate |
|---|---|---|
| Foundation | 2 | Shared client + design system + Expo scaffold all build green |
| MVP v0 | 5 | Real user signs in + sees dashboard + browses programs (TestFlight preview) |
| Core flows | 8 | Real user logs a workout + logs a meal native end-to-end |
| Native parity | 10 | Every webapp tab has a native counterpart or Tier-3 deep-link |
| Launch ready | 12 | Production EAS build on both platforms + privacy forms filled + internal beta users on |

A phase doesn't ship without:
1. Its acceptance criteria met
2. Unit tests for any code it produces
3. Typecheck clean for any .ts / .tsx files it touches
4. RTL / component / e2e tests *executed in CI or by the worker* — listing the spec does not count
5. Gap-log entry (if a webapp gap was discovered during the phase)

---

## 5. Dependencies between phases

A directed graph; later phases assume earlier ones shipped. Critical paths in bold.

```
P1 (plan)
P2 (scaffold) ─┬─ P4 (design system) ─┬─ P7 (dashboard) ─┐
               │                       └─ P8 (programs) ─┤
               │                                          ├─ P9 (live workout)  ─┐
               │                                          ├─ P10 (food log)      ├─ P18 (offline)
               │                                          ├─ P11 (recipes)       │
               │                                          ├─ P12 (timeline)      │
               │                                          ├─ P13 (chat)          │
               │                                          └─ P14 (admin)         │
               └─ P3 (api client) ─┬─ P5 (hooks) ─┬─ P6 (auth) ─────────────────┘
                                   │              └─ P7..P14 (consume hooks)
                                   └─ P15 (push) / P16 (health) / P17 (biometrics)

P19 (iOS) + P20 (Android) ── polish pass over everything above

P21 (EAS) ── distribution; depends on P19+P20 polish to ship a public binary
```

**Bold critical path:** P2 → P3 → P4 → P5 → P6 → P7 → P9 → P10 → P18 → P21.

Phases that can fan out in parallel once P5+P6 are done: P7/P8/P9/P10/P11/P12/P13/P14 each only depend on the shared foundations. A second engineer joining the team would pick up the fan-out cleanly.

---

## 6. Phase index (1:1 with workingPhases batch)

The 21 phases below are exact mirrors of the `workingPhases` array decomposed for this batch. Phase IDs are stable across the lifetime of the project — if a phase splits, the resulting children inherit the parent's ID prefix.

| # | Phase ID | Title | todoId |
|---|---|---|---|
| 1 | **P1-mvp-sequencing-doc** | This document. 12-week sequencing, Tier framework, per-surface decisions, exit criteria, phase index. | `native-sequencing-mvp` |
| 2 | **P2-expo-bootstrap** | Scaffold `expo/` (Expo Router + NativeWind 4 + Tailwind v3 + jest). | `native-parent` |
| 3 | **P3-shared-api-client** | `shared/api-client/` zod-typed package. Webapp adopts on one route as proof-of-life. | `native-backend-posture` |
| 4 | **P4-design-tokens-base-components** | NativeWind tokens + Button/Card/Input/Toggle/Badge/Modal/BottomSheet + stories screen. | `native-design-system` |
| 5 | **P5-data-fetching-hooks** | `useFetch` / `useMutation` / `useSSE` ported on top of shared client. | `native-dashboard-read-flows` |
| 6 | **P6-auth-magic-link-deep-link** | `expo-secure-store` JWT, `become://verify` deep link, polling fallback, AuthGuard equivalent. | `native-auth-shell` |
| 7 | **P7-tab-shell-and-dashboard** | 5-tab bottom nav + DashboardScreen + daily check-in modal + streak banner. | `native-dashboard-read-flows` |
| 8 | **P8-programs-read-flows** | Programs list / search / saved / detail / phase / workout overview (read-only). | `native-dashboard-read-flows` |
| 9 | **P9-live-workout-screen** | Set logging, group nav, rest timers, last-performance prefill, bellStyle label, save queue. | `native-live-workout` |
| 10 | **P10-nutrition-search-and-log** | Debounced 3-source search, variant + serving pickers, meal log, day-view totals. | `native-nutrition-food-log` |
| 11 | **P11-recipes-browser** | Recipe list + detail + save-as-meal (Tier 3 deep-link for create/edit). | `native-nutrition-food-log` |
| 12 | **P12-timeline-and-scheduling** | Calendar + scheduled list + schedule settings form. | `native-timeline-planning` |
| 13 | **P13-chat** | Conversation list + thread + send + unread badge. | `native-chat-admin` |
| 14 | **P14-admin-shell-tier2** | Read-only admin food + exercise lists; GAPS.md documents Tier 3 deep-links. | `native-chat-admin` |
| 15 | **P15-push-notifications** | `expo-notifications` + `/api/push/subscribe` registration + tap-to-deep-link. | `native-native-only-enhancements` |
| 16 | **P16-health-integration** | HealthKit (iOS) + Health Connect (Android) read of weight + steps; opt-in. | `native-native-only-enhancements` |
| 17 | **P17-biometrics-auth** | `expo-local-authentication` on cold open if stored JWT exists. | `native-native-only-enhancements` |
| 18 | **P18-offline-sync-tanstack** | TanStack Query + AsyncStorage persistor; offline-first workout/weight/mood/meal log. | `native-offline-sync` |
| 19 | **P19-ios-quirks-pass** | Safe-area, keyboard-avoiding, status-bar style, swipe-back. IOS_QUIRKS.md. | `native-ios-quirks` |
| 20 | **P20-android-quirks-pass** | Edge-to-edge, hardware back, ripple, notification channels. ANDROID_QUIRKS.md. | `native-android-quirks` |
| 21 | **P21-eas-distribution** | `eas.json`, TestFlight + Play Internal, first production build, RELEASE.md. | `native-distribution-eas` |

### Strategic todo coverage

The 15 claimed native-* todos map to the 21 phases above as follows:

| Strategic todo | Phases |
|---|---|
| `native-parent` | P2 |
| `native-auth-shell` | P6 |
| `native-design-system` | P4 |
| `native-dashboard-read-flows` | P5, P7, P8 |
| `native-live-workout` | P9 |
| `native-nutrition-food-log` | P10, P11 |
| `native-timeline-planning` | P12 |
| `native-chat-admin` | P13, P14 |
| `native-native-only-enhancements` | P15, P16, P17 |
| `native-offline-sync` | P18 |
| `native-distribution-eas` | P21 |
| `native-ios-quirks` | P19 |
| `native-android-quirks` | P20 |
| `native-backend-posture` | P3 |
| `native-sequencing-mvp` | P1 |

Every claimed todo is reachable from at least one phase. No phase exists without a backing todo.

---

## 7. Risk register + mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| NativeWind 4 / Tailwind v4 incompatibility (webapp is on Tailwind v4) | High | Mobile uses Tailwind v3 with parallel CSS-variable triplets per skill guidance. Semantic tokens stay identical between configs. |
| Magic-link deep-link UX confusion (user opens link on desktop, not phone) | Medium | Polling-fallback pattern per skill — mobile polls `check-session` while LoginModal is open. |
| Offline-mode complexity > schedule | Medium | TanStack Query + persistor is well-trodden; we scope offline to *writes* (workout/weight/mood/meal log) only. Offline reads are best-effort. |
| HealthKit / Health Connect dev-build requirement | Medium | If `expo-health` ships and works, stay in Expo Go. Otherwise dev-build before P16 starts; P16 sequenced after P15 specifically so push (Expo Go-compatible) ships first. |
| Apple App Privacy form complexity | Low | Pre-fill in week 11 (P19 territory). Push token + email + JWT are the only data types we send. |
| Atlas connectivity from mobile networks | Low | Existing webapp already proxies all Mongo through Next.js API routes. Mobile uses identical endpoints. |
| Universal Link verification | Medium | `become.redbtn.io/.well-known/{apple-app-site-association,assetlinks.json}` must be served. Add as a webapp deliverable in P6. |

---

## 8. Open questions (resolve as phases land)

- **EAS account ownership.** Apple Team ID + Google Play account — which entity owns them? (Resolves before P21.)
- **Bundle identifier + package name.** `io.redbtn.become` likely; needs to be locked before P21 because both EAS Build and the Universal Link AASA file bake the identifier.
- **Push category names.** "Workout reminders", "Streak alerts", "Re-engagement" — these become Android notification channels and iOS notification categories. (Resolves in P15.)
- **Should we ship Mind as its own tab or keep mood inside Dashboard?** Mind is *the* differentiator (memory: [[project_marketing_positioning]]). Default plan: keep webapp's tab structure (Mind is a top-level tab). Revisit in P7.

---

## 9. Memory hooks

- [[project_marketing_positioning]] — Mindset is the differentiator. Mind tab is MVP-mandatory.
- [[feedback_black_translucent]] — never use black-translucent statusBarStyle on iOS.
- [[feedback_nutrition_ux]] — Simplicity over comprehensiveness in food logging. Native picker should reduce, not increase, friction over web.
- [[project_food_search]] — 3-source ranking + USDA intermittency + deploy env-var gotcha. P10 inherits these.
- [[reference_database]] — Production DB is Atlas, not the LAN server. Mobile hits the same Next.js routes; no direct Mongo connection from the device.

---

*End of plan. Each phase below this milestone in the batch (`P2` through `P21`) consumes this document as its parent contract — if any phase's reality diverges from the plan, this document is updated before the phase ships.*
