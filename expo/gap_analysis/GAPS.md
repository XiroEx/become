# Native gap analysis

Heavy editor surfaces stay web-only via Tier-3 "Edit in browser" deep links per
the [`nextjs-to-react-native`](../../NATIVE_MVP_PLAN.md) skill. Each entry below
lists the webapp URL, the reason for deferral, the Tier classification, and a
revisit date (or `permanent` when there's no plan to port).

| Surface | Webapp URL | Why deferred | Tier | Revisit |
|---|---|---|---|---|
| **Program editor** | `https://become.redbtn.io/dashboard/programming/[id]/edit` | Heavy drag-reorder form with @hello-pangea/dnd — native equivalent (react-native-draggable-flatlist) would take weeks and the editor is used by ~1 user (the coach). | Tier 3 | permanent |
| **Workout builder (create)** | `https://become.redbtn.io/dashboard/programming/create` | Same drag-reorder pattern as the editor; multi-step wizard with exercise picker → set/rep matrix. Coach-only. | Tier 3 | permanent |
| **Recipe create / edit** | `https://become.redbtn.io/dashboard/nutrition/recipes/create` (or `/[id]/edit`) | Multi-step form with image upload, ingredients table, instructions editor. Webapp version is responsive — mobile-web is usable. | Tier 3 | permanent |
| **Exercise editor + video upload** | `https://become.redbtn.io/dashboard/admin/exercises/[slug]` | Form + S3 video upload + framing editor — needs presigned PUT plumbing on native and a canvas-equivalent for framing. Coach-only. | Tier 3 | permanent |
| **Admin food review** | `https://become.redbtn.io/dashboard/admin/foods/[id]` | USDA / OFF reconciliation form, variant merging UI, nutrition override editor. Coach-only. | Tier 3 | permanent |
| **Admin user / cohort tooling** | `https://become.redbtn.io/dashboard/admin/users` | User search, role management, cohort assignment. Coach-only, low-frequency. | Tier 3 | permanent |
| **Onboarding coach setup** | `https://become.redbtn.io/dashboard/admin/onboarding` | Configures the user-facing onboarding questionnaire. Coach-only, used once per question revision. | Tier 3 | permanent |
| **Framing editor (video)** | `https://become.redbtn.io/dashboard/admin/exercises/[slug]/framing` | Per-surface video framing override; requires canvas / pointer-precision drawing. Could revisit when Skia ships an N-handle framing widget. | Tier 2 | when Skia ships |
| **HealthKit / Health Connect smoke test** | n/a (native module) | Real `react-native-health` (iOS) and `react-native-health-connect` (Android) bridges aren't shipped in Expo Go — jest tests use injected fakes that exercise the adapter shape only. End-to-end behaviour needs a dev build and a physical device with sample weight + step data. | Tier 1 (deferred) | when dev build ships (P21) |

## How to add a gap

When porting a surface to native, if it ends up requiring more than ~5 days of
Tier 2 work or depends on a native module that breaks Expo Go, add a row above
with a Tier-3 'Edit in browser' button on the native side.

## Native surfaces that consume these deep-links

- `expo/components/programs/ProgramDetail.tsx` — program editor + workout builder
- `expo/components/recipes/RecipeDetail.tsx` — recipe edit
- `expo/components/admin/AdminFoodList.tsx` — admin food review
- `expo/components/admin/AdminExerciseList.tsx` — exercise editor + video upload
- `expo/lib/admin/adminLinks.ts` exports `adminUsersUrl()` and
  `adminOnboardingUrl()` for callers that want to deep-link out

Every "Edit in browser" Pressable forwards `accessibilityHint` set to the full
URL so screen readers preview the destination before navigating.
