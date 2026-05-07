# UI Consistency Rework Plan — Become

Last updated: 2026-05-06

This document is the source of truth for the cross-route styling rework. Hand it to executing agents; do not re-derive the spec. If you discover something the plan missed, edit the plan first, then implement.

---

## 1. Goals

1. Every page should feel like the same app.
2. Mobile content density goes up — less wasted space from over-sized padding and over-sized radii.
3. One way to draw a card. One way to draw status. One radius scale. One padding scale. One shadow.
4. No more `border-2` deciding "this card is important." Visual emphasis comes from accent (icon color, small badge, or 3px left stripe) — never from a thicker border or a full gradient frame.

## 2. Non-goals

- We are NOT redesigning information architecture. Sections stay where they are.
- We are NOT replacing colors site-wide — green stays the brand accent, status colors stay (red/amber/blue/emerald), they just get expressed as accents instead of frames.
- Dashboard density stays roughly as-is — it's the hub, more cards is OK.
- We are NOT migrating modals/sheets to the same primitive as cards. Modals keep their own shell.

---

## 3. The Design Tokens (target state)

These are the **only** values that should exist after the rework.

### 3.1 Card shell

```tsx
// Canonical card
"rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
```

- **Border:** always `border` (1px). **No `border-2` anywhere on cards.**
- **Bg:** always `bg-white` / `dark:bg-zinc-900`. **No gradient frames** (`from-X/10 to-Y/10`).
- **Shadow:** `shadow-sm` on light surfaces, none on dark surfaces is acceptable. **Drop `shadow-md`, `shadow-xl` from cards.** Only modals/sheets get `shadow-2xl`.

### 3.2 Radius scale

| Token | Use for |
|---|---|
| `rounded-xl` (12px) | Default card, panel, or section block |
| `rounded-lg` (8px) | Inner controls, list rows inside a card, small tiles, dropdowns |
| `rounded-2xl` (16px) | Reserved: hero cards (Mind chapter, Program detail hero), modal/sheet shells |
| `rounded-full` | Pills, badges, icon avatars, progress bars |

**Banned:** `rounded-3xl`. Replace with `rounded-2xl`.

### 3.3 Padding scale

| Class (mobile / desktop) | Use for |
|---|---|
| `p-3 sm:p-4` | Default card |
| `p-3` (flat, no responsive) | Compact cards (stat tiles, list rows) |
| `p-2.5` | Inner tinted sub-block (no border) inside a card |
| `p-5 sm:p-6` | Modal/sheet content shell only |
| `py-12 px-4` | Empty states |

**Banned outside the table above:** `p-4 sm:p-6`, `p-5` flat, `sm:p-5`, `p-6` flat. These have all been used inconsistently.

### 3.4 Status accents

Status (success / info / warning / danger / paused) is expressed as:
- An icon in the appropriate color token (`text-green-600`, `text-blue-600`, `text-amber-600`, `text-red-600`)
- Optional 3px **left accent stripe**: `before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-full before:bg-{color}-500` (or use a `<span>` if `before:` is awkward)
- Optional colored **badge pill** in the card header

Status is **not** expressed as: `border-2`, gradient frame, full-card tinted background, colored shadow.

**Single exception:** alerts that the user must notice (missed workouts, paused program callout) may keep a tinted background — but only with `bg-red-50 dark:bg-red-950/20` + `border-red-200 dark:border-red-900/40` (single border, no gradient). One accent color per page section max.

### 3.5 Page padding

Set in `app/dashboard/layout.tsx`. Already correct:
```
px-3 py-4 pb-6 sm:px-6 sm:py-6   // page wrapper
max-w-3xl mx-auto                 // container
```
**Do not change.** Cards inside use the padding scale above.

### 3.6 Nested cards — banned

A bordered card may NOT contain another bordered card. Replacements:
- For a list of rows: parent gets the border, rows use `divide-y divide-zinc-200 dark:divide-zinc-800` and per-row padding `px-3 py-2.5`.
- For a sub-section block (e.g. "today's daily action" inside a Mission card): use a flat tinted block — `rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-3` — **no border**.
- For a 2-up grid of options (state check-ins, quick actions): each option is a `rounded-lg border border-zinc-200 ... p-3` button — but the parent card around them does NOT have a border (it's just a header + grid).

---

## 4. Primitives to build

Build these first. Everything else migrates onto them.

### 4.1 `webapp/components/ui/Card.tsx` — NEW
```tsx
type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Visual variant */
  variant?: 'default' | 'compact' | 'hero';
  /** Status accent — adds left stripe; does NOT change border/bg */
  accent?: 'none' | 'success' | 'info' | 'warning' | 'danger';
  /** Render as <a>/<Link>/etc. via asChild pattern, or just allow `as` prop */
  as?: React.ElementType;
};
```
- `default`: `rounded-xl border border-zinc-200 bg-white p-3 sm:p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900`
- `compact`: same, padding `p-3` flat
- `hero`: `rounded-2xl border ... p-4 sm:p-5 shadow-sm` (used by Program detail hero, Mind chapter)
- `accent` adds the left stripe via a positioned span; never thickens the border

### 4.2 `webapp/components/ui/SectionHeader.tsx` — NEW
Standard section title pattern used across all 4 routes:
```tsx
<SectionHeader
  title="Continue Training"
  icon={<Flame />}                          // optional
  action={<Link href="...">View all</Link>} // optional right-side action
/>
```
Renders: `<div className="mb-3 flex items-center justify-between gap-2"><h2 className="text-lg font-semibold ...">{title}</h2>{action}</div>`

### 4.3 `webapp/components/ui/StatTile.tsx` — NEW
Used in dashboard stats grid (Day Streak, Mood, Weekly, Goal). Wraps `Card` with `compact` variant. Standardizes:
- Icon badge: `h-9 w-9 rounded-full bg-{accent}-100 dark:bg-{accent}-900/30 text-{accent}-600`
- Big number: `text-2xl font-extrabold tracking-tight`
- Label: `text-xs text-zinc-500`

### 4.4 `webapp/components/ui/EmptyState.tsx` — NEW
Standardizes the dashed-border empty state used in Programs, My Programs, Recipes:
```tsx
<EmptyState
  icon={<Plus />}
  title="..."
  description="..."
  action={<Link>...</Link>}
/>
```
- Shell: `rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 py-12 px-4 text-center`
- **Was inconsistent:** some used `rounded-2xl py-16`. Standardize on `rounded-xl py-12`.

### 4.5 `webapp/lib/cn.ts` — NEW (if not present)
Tiny `cn()` helper that joins class strings. (We already use Tailwind; just need a string concat utility — no need to add `clsx` or `tailwind-merge` unless we hit conflicts.)

---

## 5. Per-route migration playbook

Each route gets its own PR. Order: **Programs → Mind → Nutrition → Dashboard.**

### 5.1 Programs route

**Files in scope:**
- `webapp/app/dashboard/programming/ProgrammingClient.tsx`
- `webapp/app/dashboard/programming/library/ExerciseLibraryClient.tsx`
- `webapp/app/dashboard/programs/mine/MyProgramsClient.tsx`
- `webapp/app/dashboard/programming/[programId]/ProgramDetailClient.tsx`
- `webapp/components/UpcomingWorkouts.tsx`
- `webapp/components/NextWorkoutCard.tsx`

**Specific changes:**

1. **Continue Training card** (ProgrammingClient.tsx ~382–459)
   - Drop the `border-2 border-{color}-500/30` and `from-{color}-500/10 to-{color}-500/10` gradient.
   - Wrap in `Card` (default variant) with `accent={isPaused ? 'warning' : isFuture ? 'info' : 'success'}`.
   - Keep the per-status icon color + the play/pause button. Drop the gradient progress bar; use `bg-green-500` solid (or `bg-amber-500` paused, `bg-blue-500` future).

2. **Recommended row** (ProgrammingClient.tsx ~594–645)
   - Drop `border-2 border-green-200`. Use `Card` default + `accent="success"` left stripe.

3. **Saved row** (ProgrammingClient.tsx ~490–554)
   - Drop the amber border. Use `Card` default. Move "Saved" cue to a small amber bookmark icon on the right (already there) — that's the only signal needed.

4. **Browse program row** (ProgrammingClient.tsx ~802–863)
   - Already on canonical pattern. Just swap to `Card` for parity.

5. **Empty states** (ProgrammingClient.tsx ~891, MyProgramsClient.tsx ~133)
   - Replace with `<EmptyState>` primitive. Drop `rounded-2xl py-16` → `rounded-xl py-12`.

6. **Phase Selector card** (ProgramDetailClient.tsx ~713–758)
   - Drop `shadow-xl`. Use `Card` (default). Drop nested gradient `from-zinc-50 to-zinc-100` Phase Focus block — use flat `bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3`.

7. **Exercise group containers** (ProgramDetailClient.tsx ~857–871)
   - These are the `border-2` color-coded grouping (superset/circuit/triset/etc.) panels.
   - Keep the color coding semantically but switch from `border-2 border-{color}-300` + `bg-{color}-50` → single `border border-{color}-200` + `bg-{color}-50/50` + a small color-coded label badge in the header. Keep readable but quieter.

8. **Missed Workout banner** (NextWorkoutCard.tsx ~131–182)
   - Keep the red tint (it's an alert). Drop nested blue `bg-blue-50` "Today's workout detail" sub-block; use `divide-y` row pattern instead.

9. **My Exercises (Library)** — already the cleanest. Just sub `Card` primitive for parity.

**Acceptance for Programs:**
- Zero `border-2` in the route's files.
- Zero `from-X-500/10` or `to-X-500/10` gradient frames.
- All cards use `Card` primitive.
- Visual: status color comes from icon + accent stripe, not from a gradient frame.

### 5.2 Mind route

**Files in scope:** all of `webapp/components/mind/*.tsx`, `webapp/app/dashboard/mind/page.tsx`, `webapp/app/dashboard/mind/[section]/page.tsx`.

**Specific changes:**

1. **Hero chapter card** (MindHub.tsx ~240, VisionBoard.tsx ~59, etc.)
   - Use `Card variant="hero"`. Keep the dark `bg-zinc-900` + emerald gradient overlay — it's a hero, this is the one place a tinted backdrop is allowed.

2. **Protocol/breathwork cards with dynamic colored borders** (StateShiftTab.tsx ~425, VisionBoard.tsx ~122)
   - Drop `border {protocol.border}` (e.g. `border-emerald-500/30`). Switch to `Card` default + `accent` (success/info/warning) left stripe + colored icon badge. Same color signal, way less visual noise.

3. **Section toggles** (SocialTab.tsx ~217, AntiSabotageTab.tsx ~248)
   - Currently `rounded-2xl border ... p-1` wrapping `rounded-xl` buttons. Change to `rounded-lg bg-zinc-100 dark:bg-zinc-800 p-1` (no border) wrapping `rounded-md` buttons. Standard segmented-control pattern.

4. **Primary container padding `p-5` → `p-3 sm:p-4`** everywhere in Mind. The `p-5` cards are visually heavier than the rest of the app.

5. **Nested expandable item rows** (MissionTab.tsx ~201, AntiSabotageTab.tsx ~199)
   - Replace inner `rounded-xl bg-zinc-50 dark:bg-zinc-800/50 p-3` with `divide-y` rows on the outer card.

6. **Info banners** (IdentityOnboarding.tsx ~155 resume, JournalTab.tsx ~418 draft)
   - These are correctly tinted alert cards (blue-50, amber-50). Just replace with `Card accent="info"` / `accent="warning"` + tinted bg pulled from the accent. Standardize the colored-bg behavior in the primitive (one prop, not handcrafted).

**Acceptance for Mind:**
- All `p-5` removed (replaced with the standard scale).
- Dynamic per-protocol colored borders gone — replaced by accent prop.
- Section toggles use the segmented-control pattern.

### 5.3 Nutrition route

**Files in scope:** all of `webapp/components/nutrition/*.tsx`, `webapp/components/meals/*.tsx`, `webapp/app/dashboard/nutrition/**`, `webapp/app/dashboard/foods/**`, `webapp/app/dashboard/meals/**`.

**Specific changes:**

1. **Macro / Calorie / Water / NutritionSummary cards**
   - Already on the canonical pattern. Just sub `Card` primitive.

2. **Meal cards (Snack/Lunch/etc. containers)** (MealCard.tsx, TagSection.tsx)
   - Switch container to `Card` (default). Inner food rows: drop their borders, use `divide-y` on the parent's body wrapper. Per-row padding `px-3 py-2.5`.

3. **Quick Add / Recipes / Goals tile grid** (nutrition/page.tsx bottom)
   - Currently each tile has its own border, padding, rounded — and they don't quite match. Standardize as `Card variant="compact"` 2-up grid; tinted icon badge inside.

4. **Modal inputs `border-2`** (QuickAddModal, EditFoodModal, foods/new)
   - Switch to `border` (1px). Use `focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10` for emphasis on focus instead of static thicker border.

5. **Macro preview tiles** (used inside EditFoodModal, FoodLogSheet, MealApplySheet — all slightly different)
   - Standardize on `rounded-lg bg-zinc-50 dark:bg-zinc-800/50 p-2.5` with no border. **Pick one and force the others to match.**

6. **Recipe list items** (recipes/page.tsx ~198)
   - Currently `rounded-lg p-3 sm:p-4`. Switch to `Card variant="compact"` (rounded-xl, p-3).

7. **Empty states** (nutrition/page.tsx ~200, recipes/page.tsx ~177)
   - `<EmptyState>` primitive. Drop `rounded-lg py-16` → `rounded-xl py-12`.

8. **Bottom-sheet shells** (FoodLogSheet, MealApplySheet, EditFoodModal)
   - Keep `rounded-t-2xl` mobile / `rounded-2xl` desktop with `shadow-2xl`. These are sheets, not cards — they stay outside the primitive system but adopt the inner padding scale (`p-5 sm:p-6`).

**Acceptance for Nutrition:**
- Zero `border-2` outside of focus states.
- Macro preview tiles all use one class string.
- All "small action" tiles (Quick Add, Recipes, Goals) are visually identical except for icon and label.

### 5.4 Dashboard route

**Files in scope:** `app/dashboard/DashboardClient.tsx`, `app/dashboard/page.tsx`, `components/UpcomingWorkouts.tsx`, `components/NextWorkoutCard.tsx`, `components/ProgressChart.tsx`, `components/DailyCheckInModal.tsx`.

**Specific changes:**

1. **2x2 stat tiles** (Day Streak, Mood, Weekly, Goal)
   - Currently use the canonical card pattern but with hand-rolled icon badges that vary in color. Switch each to `<StatTile>` primitive. Icon badge always `h-9 w-9 rounded-full bg-{accent}-100`.

2. **Missed Workouts banner** (NextWorkoutCard.tsx)
   - Keep the red alert treatment, but use `Card accent="danger"` with `bg-red-50 border-red-200`. Sub-rows inside use `divide-y` not their own borders.

3. **Up Next card** — already canonical. Sub `Card`.

4. **Quick Links 4-tile grid** (Programs / Nutrition / Progress / Connect)
   - These already match the canonical pattern but use `hover:shadow-md`. Drop the hover-shadow. Use `hover:border-zinc-300` instead — quieter.

5. **Mindset card → mood summary nested block** (DashboardClient.tsx ~531)
   - Inner `rounded-lg bg-zinc-50` block stays, but drop its sub-padding from `p-3` to `p-2.5` so it doesn't look like another full card.

6. **Daily Check-in modal**
   - Mood selection buttons currently use `border-2 border-{color}-300` + `bg-{color}-50`. Switch to `border border-zinc-200` (unselected) and `border-zinc-900 bg-{color}-50` (selected). Selection comes from border-color swap, not weight swap.

**Acceptance for Dashboard:**
- All stat tiles use `StatTile`.
- Quick Links no longer have shadow-elevation hover.
- Mood selection in modal: no `border-2`.

---

## 6. Sweep / catch-all

After the per-route PRs, run a final sweep:

1. **Grep for `border-2` across `webapp/app` and `webapp/components`.** Each remaining match must be either (a) a focus state, (b) an explicit selection state, or (c) deleted.
2. **Grep for `rounded-3xl`.** Replace with `rounded-2xl` (1 instance per inventory).
3. **Grep for `shadow-md`, `shadow-xl` on non-modal surfaces.** Remove or downgrade to `shadow-sm`.
4. **Grep for `from-{color}-500/10 to-{color}-` gradient frames.** Each remaining one must be a hero card or modal backdrop.
5. **Grep for `p-5` on a card surface.** Should be zero outside modals.

Codex command (run from `webapp/`):
```bash
grep -rE '(border-2|rounded-3xl|shadow-(md|xl)|from-[a-z]+-500/10|p-5\b)' app components | grep -v test
```

---

## 7. What we're explicitly keeping

Don't accidentally rip these out:

- **Hero cards** with dark backgrounds + colored gradient overlays (Program detail hero, Mind chapter card on `/dashboard/mind`, Vision Board statement). Tinted backdrop is intentional here.
- **Time-of-day gradient** on Daily Check-in modal (morning/afternoon/evening/night). It's the modal backdrop, not a card.
- **Saved-for-later drag-handle UX.** Reordering stays. Just the amber border goes.
- **Exercise group color coding** (superset/circuit/etc.). The semantic color stays — it just expresses as a small badge + light tint instead of a thick frame.
- **`max-w-3xl mx-auto` page container.** Don't widen the layout.
- **Bottom-nav, bottom-sheets, modals.** Different shell, different rules.

---

## 8. Acceptance criteria (whole project)

After all 4 route PRs land:

- [ ] `Card`, `SectionHeader`, `StatTile`, `EmptyState` exist in `webapp/components/ui/`.
- [ ] Sweep grep (section 6) returns zero hits outside the explicit exceptions.
- [ ] Visual smoke test on real device or Playwright screenshot diff for each route's main scroll: Dashboard, Programs, Mind, Nutrition.
- [ ] Dark mode looks deliberate (no half-finished color pairs — every `bg-X-50` has its `dark:bg-X-950/20` partner).
- [ ] Mobile: each route fits 4+ visible cards in a viewport that previously fit ~3.
- [ ] No regression in Playwright e2e (program flow + chat). Re-run before each PR merge.

## 9. Execution order & PR strategy

1. **PR 1 — Primitives.** Add `ui/Card.tsx`, `ui/SectionHeader.tsx`, `ui/StatTile.tsx`, `ui/EmptyState.tsx`, `lib/cn.ts`. No consumer migration. Land first so subsequent PRs all import from the same source.
2. **PR 2 — Programs.** Migrate Programs route + sweep its files.
3. **PR 3 — Mind.** Migrate Mind route + sweep.
4. **PR 4 — Nutrition.** Migrate Nutrition route + sweep.
5. **PR 5 — Dashboard.** Migrate Dashboard + final cross-route grep sweep.

Each PR: branch `agent/<host>-ui-pass-<N>`, opened against `beta`. Per CLAUDE.md, agent has standing permission to merge feature → beta → main.

## 10. Traps to avoid

- Don't refactor unrelated logic during the visual pass. State, fetching, prop shapes — leave them alone unless the rework genuinely requires the change.
- Don't add `clsx` or `tailwind-merge` packages "while we're in there." A 5-line `cn()` is fine.
- Don't introduce a Context provider for "theme tokens" — these are Tailwind classes, the theme is the design system.
- Status accent's left stripe is a `<span class="absolute inset-y-3 left-0 w-[3px] rounded-full bg-{color}-500">`. Don't reach for `border-l-[3px]` — it shifts content.
- When deleting `from-X/10 to-Y/10` gradients, also delete the `via-` color if present and any `dark:from-` variants — incomplete cleanups will look broken in dark mode.
- The Programs `Continue Training` card has 3 status states (active, future-start, paused). Don't collapse them to one — they need 3 distinct accent colors.
