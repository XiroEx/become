# Meal Scheduling Plan — Become

Last updated: 2026-05-11 (Run 2 review applied)

This document is the source of truth for adding a **month calendar view** and **meal planning/scheduling** to `/dashboard/timeline`. Hand it to executing agents; do not re-derive the spec. If you discover something the plan missed, edit the plan first, then implement.

This plan deliberately spends most of its ink on three things: the architecture decision (planned vs logged), the conversion flow (plan -> log), and the timezone story. Visual minutiae will be filled in by the implementing run against the design system in `UI_CONSISTENCY_PLAN.md`.

---

## 0. Run 2 Review — Changes & Verdicts

This section was added by run 2 (the adversarial review pass). It summarises the changes run 2 made before handing the plan to run 3. **Run 3 should treat the rest of this document as the spec, with the changes below already baked in.** Inline `> **Run 2 review:**` callouts in each section give context but the canonical wording in each section already reflects the verdict.

### 0.1 Architecture — Option A: confirmed, with caveat documented

Run 1 picked separate `MealPlan` collection. Run 2 verified the "log readers trust logs = consumed" claim by grepping every `MealLog.find/findOne/aggregate/findById` call. The blast radius is real:

- `webapp/app/api/meal-logs/route.ts` GET (date + range)
- `webapp/app/api/meal-logs/[id]/route.ts` GET, PATCH, DELETE
- `webapp/app/api/meal-logs/[id]/items/route.ts`
- `webapp/app/api/meal-logs/[id]/items/[itemId]/route.ts`
- `webapp/app/api/nutrition/log/route.ts` GET/POST/PUT/DELETE (the legacy day-shape adapter — reads MealLog and feeds the existing /dashboard/nutrition page)
- `webapp/app/api/nutrition/foods/frequent/route.ts` (aggregation: would silently start ranking planned items)
- `webapp/app/api/nutrition/foods/recent/route.ts` (same risk)
- `webapp/app/api/meals/[id]/log/route.ts`
- `recordStreakActivity` (indirectly — fires only on POST, but if a plan POST=log under Option B/C, streaks would extend without consumption)

That's ~10 reader sites including the legacy `/api/nutrition/log` GET that powers `/dashboard/nutrition`. Adding a `status` field as in option B would force every one of them to either learn the filter or accept silent data corruption. **Verdict: A stands.** The plan's defense at Section 2.1 understated this one extra angle (frequent/recent food rankings), which has been added to the inline review.

### 0.2 TZ asymmetry between logs and plans — newly flagged, requires fix in PR 2

This is the biggest issue run 2 found. The plan's section 8.2 mirrors the workouts TZ pattern for `plannedDate`, but the existing `/api/meal-logs` route uses a different convention:

- **Plans** store `plannedDate` as UTC midnight where YYYY-MM-DD matches the user's intended local date (per Section 8 of the plan, mirrors workouts).
- **Logs** store `loggedAt` as a precise instant (UTC). The existing GET route at `/api/meal-logs?from=X&to=Y` buckets logs by **UTC date of loggedAt**, not local date.

The collision: a user in PST who logs dinner at 11pm local on May 14 has `loggedAt = 2026-05-15T07:00:00Z`. The existing route buckets that log under `2026-05-15`. But the user's planned dinner for May 14 (if any) is stored under `2026-05-14`. **They render on different cells of the month grid.**

The plan does not address this. The new month view MUST bucket logs by **local date of `loggedAt`** (client-side; the server's UTC bucketing in `?from=&to=` is fine for fetching but the rebucket happens client-side using the same local-midnight pattern). Run 2 has added a new sub-section 8.5 covering the rebucket and made it an explicit RUN 3 DECISION POINT — though I am recommending: do the rebucket on the client in `MonthView`, do not change the existing meal-logs API.

### 0.3 Unique index on (user, plannedDate, tag) — REMOVED

The plan's unique compound index was justified by "one breakfast per day per user." But:

- Users CAN have two snacks (mid-morning and afternoon) — open Q #7 acknowledges this.
- The unique-then-409 pattern adds an entire "Replace" UX path on conflict that's avoidable.
- After promotion, the unique index becomes useless because the log is in a separate collection — so the constraint is only meaningful for `status: 'active'` plans, which Mongoose unique indexes cannot express as a partial constraint without additional config.

**Verdict: drop the unique index.** Replace with the same UX deduplication the log surface already uses: when creating a plan, if a same-(user, date, tag) ACTIVE plan exists, the API merges the items into the existing plan (or returns 409 at the API surface based on a `mode: 'merge' | 'replace' | 'fail'` body field, default `merge`). This mirrors the existing `/api/nutrition/log` POST behavior which appends to an existing day-tag MealLog bucket.

Section 3 schema and Section 4.2 API behavior have been rewritten accordingly.

### 0.4 PR 3 split — now PR 3a + PR 3b

The plan's PR 3 packed five distinct things: picker mode prop on FoodSearchModal, picker mode prop on EditFoodModal, new TimelinePlanCard, future-day FAB rewiring, TagSection kebab. That's plausibly >1000 LOC and three disjoint review surfaces. **Run 2 has split PR 3 into PR 3a (read-only planning surface + future-day FAB + picker submit-to-plans) and PR 3b (TimelinePlanCard, edit, delete, TagSection kebab).** PR 3a closes the loop on "I can create a plan and see it." PR 3b closes the loop on "I can interact with that plan."

The phasing total is now 6 PRs (PR 1, 2, 3a, 3b, 4, 5). All are still independently deployable. PR 2 is acknowledged as having a hard dependency on PR 1 (the `/api/meal-plans` endpoint must exist before MonthView can fetch it) — the plan claimed "independently deployable" without that caveat; corrected below.

### 0.5 Open questions — all 10 closed

All 10 open questions in Section 13 now have concrete decisions inline. Summary of the ones with meaningful shifts:

- **Q2 (auto-promote past days)**: confirmed NO — run 1's instinct was right.
- **Q3 (CalorieRing previews plans)**: confirmed default OFF — but add the toggle only in PR 5 to keep PR 3/4 lean.
- **Q4 (per-plan auto-promote override)**: REJECTED for v1 — global setting is enough; if v2 needs it, add the field then. Avoid premature flexibility.
- **Q5 (recurrence in bulk-from-meal)**: ACCEPTED — adds 20 lines and removes a real ergonomic gap. Bumped into PR 5.
- **Q7 (multi-tag plans / two snacks)**: addressed by dropping the unique index (see 0.3 above). User can have N snacks on a day.

### 0.6 Missing sections added

Run 2 added the following sections that run 1 omitted:
- **Section 9.1** — cascade on user deletion, cascade on Meal-template deletion.
- **Section 8.5** — log/plan TZ rebucket strategy (the big TZ catch).
- **Section 5.9** — accessibility / keyboard nav for month grid.
- **Section 5.10** — optimistic UI policy (when to optimistic-update vs spinner).
- **Section 6.10** — dashboard "Today's Plans" tile decision (deferred to v2 but documented).
- **Section 11.6** — rollback story per PR.
- **Section 13.5** — what's explicitly NOT tested (no test framework — confirmed) + the manual QA checklist.

### 0.7 Things run 1 got right (preserve through implementation)

To prevent run 3 from second-guessing: these decisions are CORRECT and SHOULD NOT BE REVISITED.

1. Separate `MealPlan` collection (Section 2).
2. Snapshot items into the plan (don't ref Food/Meal live).
3. `fromPlanId` back-ref on MealLog rather than mutating the plan into a log.
4. Server is timezone-naive; client decides "today" (Section 8.3).
5. `addLocalDays` for recurrence (Section 7.4).
6. Manual promote mode as the default (Section 3.3) — not auto.
7. Default-times table for back-promotion (Section 6.5).
8. Expand-on-create recurrence rather than a stored rule (Section 7).
9. No new npm dependencies, strict TS, design tokens, mobile-first.
10. NO drag-and-drop reschedule in v1 (Section 1.2).

### 0.8 What remains as RUN 3 DECISION POINT

Exactly one item ended up not fully decidable from text:

- **Section 8.5 — log rebucket strategy**: client-side rebucket is the right answer for v1 in run 2's opinion, but if PR 2 hits a perf wall on a user with thousands of logs in a month (unlikely — Jon Don's clients average ~30 logs/month), the alternative is to extend `/api/meal-logs` to accept a `tz=America/New_York` param and bucket server-side. Recommend client-side; flag for PR 2 implementer to confirm during build.

Everything else is decided.

---

## 1. Goals & non-goals

### 1.1 Goals

1. **Add a true month view** to `/dashboard/timeline` alongside the existing Day and Week views. Calendar grid, dot density per day, click-to-expand. Visually consistent with `webapp/app/dashboard/calendar/CalendarClient.tsx`.
2. **Let users plan future meals**. A "plan" is an explicit intent attached to a future date + tag (breakfast/lunch/dinner/snack/custom). Distinct from a `MealLog`, which represents actual consumption.
3. **Plans can become logs**. When the planned date arrives, the user converts the plan to a log via one of two paths: (a) auto-promote on the day's first nutrition page load, or (b) explicit per-row "Log as planned" confirm. This is a *per-user preference* with a sensible default.
4. **Bulk planning helpers**. "Copy yesterday forward N days", "Apply a Meal template to N days", "Plan a whole week from a tag-grouped template".
5. **Goal-aware day cells**. The month view tints each day cell based on whether the day's planned-or-logged calories hit, miss, or overshoot the user's `NutritionGoal`.
6. **No new data semantics for the log shape**. The picker, the daily-summary math, and the daily-rollup API all keep working on `MealLog` as they do today. Plans live in a parallel collection (see Section 2).
7. **Round-trip safe**. A plan stores enough provenance to (a) edit before promotion, (b) materialize as a log at promotion time, and (c) reconcile with a divergent actual log without losing either record.
8. **PWA-friendly**. Month view usable on a 375px screen; day cells are at least 40x40 tap targets.

### 1.2 Non-goals (explicitly out of scope for v1)

- **AI suggestions** ("here's a meal for tomorrow"). Stored data will support this later; no UI now.
- **Grocery list / shopping list generation** from planned meals.
- **Meal prep workflows** ("batch cook on Sunday → eat 5 days"). Bulk *planning* exists, but no prep state machine.
- **Social sharing** of meal plans.
- **Reminders / push notifications / email nudges** for upcoming planned meals. v1 of scheduling is *silent*.
- **Macro/calorie targeting at plan time** ("auto-fill the rest of today's calories"). Plans are user-authored.
- **Plan templates as a first-class entity**. We reuse the existing `Meal` model for templates; no new `PlanTemplate` collection.
- **Recurring rules engine**. We DO support a minimal "repeat weekly for N weeks" expansion (Section 7), but it's expand-on-create, not a stored rule.
- **Drag-and-drop on the calendar grid** (move a plan from one day to another). Out for v1; user edits the plan's date via the picker. v2 candidate.
- **Snapping logs back into a previously-planned slot**. If a plan exists for a day and a divergent log is created, we mark the plan superseded but do not auto-rewrite either.

---

## 2. The architecture decision — Option **A**: separate `MealPlan` collection

We considered three options:

| Option | Shape | Pros | Cons |
|---|---|---|---|
| **A. Separate collection** | New `MealPlan` model alongside `MealLog`. Plans live in their own collection. | Daily-rollup math on logs **does not change**. Querying "what's planned" vs "what was eaten" is two distinct queries with no `status` filter required. Migration is zero risk to existing logs. Indices stay tight (planned rows don't bloat the log query path). | Two collections to keep coherent. Promotion requires a write to one + write to the other. The month view has to fetch both and merge. |
| **B. One collection** | `MealLog.items` gain `status: 'planned' \| 'logged' \| 'skipped'`. Plans are future-dated logs in `planned` state. | Single query for "everything on day X". Picker re-use is straightforward. | Every existing daily-rollup query path (already deployed) must be updated to `status: 'logged'` or it'll silently start counting plans as eaten. **High blast radius.** All `/api/meal-logs`, `/api/nutrition/summary`, all dashboard widgets, streak math (`recordStreakActivity`) — every read becomes hazardous. Migration risk is enormous: thousands of existing rows need a default status, AND every codepath has to learn the filter. |
| **C. Hybrid** | `MealLog` doc with `plannedAt` + `status`. Plans materialize as logs with status=planned, get flipped to logged. | Single ID for the plan-log lifecycle (no cross-collection ref). Some query consolidation. | Same migration risk as (B). Plus: promotion is now an in-place state mutation, which kills the immutability that makes logs trustworthy (an audit/refeed/leaderboard query can no longer say "this was logged at time X" without checking history). Editing-the-plan-vs-editing-the-log becomes ambiguous on the same `_id`. |

### 2.1 Decision: **A**.

**Defense**:

1. **Existing log surface is sacred.** `/api/meal-logs`, `/api/nutrition/summary` (which still reads `NutritionLog`, not `MealLog`, so it's the older path), the dashboard daily tile, `recordStreakActivity`, the calorie ring on `/dashboard/timeline?view=day` — every single one of these reads/queries logs with the implicit assumption that "if it's there, the user ate it". Adding a `status` field forces every consumer to learn the new filter or accept silent data corruption. That's the (B)/(C) tax. Not worth it.
2. **Plans have a different shape than logs.** A log has `loggedAt` (precise time). A plan has `plannedDate` (a calendar date) + `tag` (breakfast/lunch/etc.) — no time of day yet. A plan doesn't have `totalNutrition` recomputed-on-save — it has *expected* nutrition derived from snapshotted items. These differences would lead to nullable-everywhere fields under (B)/(C).
3. **Cross-collection joins are cheap** for our scale. Month view fetches one month at a time: ~30 plans + ~90 logs maximum per user. Two indexed queries.
4. **Reconciliation is honest.** With two collections we can keep the plan AND the log when they diverge, mark the plan superseded, and let the user see what they intended vs what they did. This is the "intent vs consumption" story made visible.
5. **Backout is safe.** If meal planning is descoped or rolled back, we drop the `MealPlan` collection and the existing system is bit-for-bit unchanged. With (B)/(C) we'd be unwinding a schema migration touching every log.

6. **(Added by run 2)** `/api/nutrition/foods/frequent` and `/recent` are aggregations over MealLog. Under (B)/(C), planned-but-unconsumed items would pollute "what foods did this user actually eat often" rankings. The picker's "Recent foods" tab would suggest planned items the user hasn't actually had. That's silent UX rot, not just a query-correctness story.

> **Run 2 review:** Confirmed Option A. Verified the blast-radius claim by grepping every MealLog reader (10+ sites across 7 files). Plan also missed the `frequent`/`recent` foods aggregation surface — added as point 6. Do NOT revisit this decision.

### 2.2 Implications of choosing A

- **One write per action** — `POST /api/meal-plans` creates a plan; `POST /api/meal-plans/[id]/promote` creates a `MealLog` and marks the plan promoted.
- **Two reads in month view** — fetch logs (existing endpoint) and plans (new endpoint) for the month range; merge by date key in the client.
- **The picker (`FoodSearchModal`, `FoodLogSheet`) is reused** by passing it a `mode: 'log' | 'plan'` prop. The submit handler chooses the destination endpoint based on mode.
- **A promoted plan keeps its `_id`** in `MealPlan` (status moves to `promoted`). The created `MealLog` gets a back-reference `fromPlanId`. This lets us answer "did the user follow the plan?" and lets the UI show a "planned" badge on the log row.
- **A plan can be edited or deleted up until promotion.** After promotion, edits live on the `MealLog`, not the plan. The plan is read-only post-promotion (it becomes the historical record of intent).

---

## 3. Data model changes

### 3.1 New model: `webapp/models/MealPlan.ts`

```ts
import mongoose, { Schema, Types } from 'mongoose'
import { IMealItem, IMealNutrition, computeTotalNutrition } from './Meal'

// ---------------------------------------------------------------------------
// MealPlan — a user's INTENT to eat a specific set of items on a specific
// future date, tagged for time-of-day (breakfast/lunch/etc.). When the date
// arrives, the plan can be promoted to a MealLog via /api/meal-plans/[id]/promote.
//
// Plans are distinct from logs:
//   - plannedDate is a CALENDAR DATE (YYYY-MM-DD intent), not a precise time.
//   - We store it as Date set to LOCAL midnight in the user's TZ at create
//     time, mirroring the workout Schedule pattern (server stores UTC midnight
//     where the YYYY-MM-DD portion is the intended local date).
//   - totalNutrition is "expected" — computed from items the same way as a
//     log, but not flowing into daily rollups or streaks until promotion.
//
// `status` is a small state machine:
//   draft     — never used; reserved for a future "save without committing"
//   active    — created, not yet promoted; user can edit/delete
//   promoted  — converted to a MealLog (logId stored)
//   skipped   — user explicitly skipped (kept for history); no log created
//   superseded — date arrived, user logged something else, plan was kept for
//               reference but did not auto-promote
// ---------------------------------------------------------------------------

export type MealPlanStatus = 'active' | 'promoted' | 'skipped' | 'superseded'

export interface IMealPlan {
  _id?: Types.ObjectId
  user: Types.ObjectId

  /**
   * The intended calendar date for this meal. Stored as a Date at UTC
   * midnight where the YYYY-MM-DD portion is the intended local date.
   * See Section 8 (timezone story) for parse/format rules.
   */
  plannedDate: Date

  /**
   * Tag is REQUIRED on a plan — every plan belongs to a slot of the day.
   * Defaults are breakfast/lunch/dinner/snack but any user tag is allowed
   * (matches /api/tags). Multiple plans per (user, plannedDate, tag) are
   * ALLOWED (run 2 reversal) — users can plan two snacks on the same day.
   * Conflict deduplication happens at the API layer (Section 4.2) via a
   * mode: 'merge' | 'replace' | 'fail' body field, default 'merge'.
   */
  tag: string

  /**
   * Snapshotted items — same shape as MealLog.items. Source of truth at
   * plan-create-time for nutrition. We snapshot so a later edit to the
   * underlying Food does not silently change a plan that was already made.
   */
  items: IMealItem[]

  /**
   * If the plan was created by applying a Meal template, keep the source ref
   * so the UI can show "Planned from: Avocado Toast" and so promotion can
   * inherit the meal's tags / image.
   */
  mealId?: Types.ObjectId
  mealName?: string

  /** Free-text user note. Inherited into the MealLog on promote. */
  notes?: string

  /** Expected nutrition — same shape as a log's totalNutrition. */
  expectedNutrition: IMealNutrition

  status: MealPlanStatus

  /**
   * When promoted: the MealLog that was created from this plan. Used by the
   * timeline UI to show a "from plan" badge on the log row and to short-
   * circuit a double-promote.
   */
  logId?: Types.ObjectId
  promotedAt?: Date

  /**
   * Recurrence parent (Section 7). When a user creates a recurring plan
   * ("every Monday breakfast for 6 weeks"), we expand into N independent
   * MealPlan rows on create and stamp them all with a shared seriesId so a
   * future "edit the whole series" operation can find them. v1 only uses
   * this for bulk-delete-series; no live recurrence resolution.
   */
  seriesId?: Types.ObjectId

  createdAt?: Date
  updatedAt?: Date
}

const MealPlanNutritionSchema = new Schema<IMealNutrition>({
  calories: { type: Number, required: true, default: 0 },
  protein: { type: Number, required: true, default: 0 },
  carbs: { type: Number, required: true, default: 0 },
  fats: { type: Number, required: true, default: 0 },
  fiber: { type: Number },
  sugar: { type: Number },
  sodium: { type: Number },
  saturatedFat: { type: Number },
}, { _id: false })

// Reuse the same MealItem subschema shape as MealLog. Inline-defined to keep
// the model self-contained (the import circle is annoying otherwise).
const MealPlanItemSchema = new Schema<IMealItem>({
  foodId: { type: Schema.Types.ObjectId, ref: 'Food' },
  variantId: { type: Schema.Types.ObjectId },
  variantName: { type: String },
  name: { type: String, required: true },
  brand: { type: String },
  servingSize: { type: Number, required: true },
  servingUnit: { type: String, required: true },
  servings: { type: Number, required: true, default: 1 },
  nutrition: { type: MealPlanNutritionSchema, required: true },
  loggedQuantity: { type: Number },
  loggedUnit: { type: String },
  loggedGramsPerServing: { type: Number },
  loggedMlPerServing: { type: Number },
}, { _id: true })

const MealPlanSchema = new Schema<IMealPlan>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  plannedDate: { type: Date, required: true },
  tag: { type: String, required: true },
  items: { type: [MealPlanItemSchema], default: [] },
  mealId: { type: Schema.Types.ObjectId, ref: 'Meal' },
  mealName: { type: String },
  notes: { type: String },
  expectedNutrition: { type: MealPlanNutritionSchema, default: () => ({
    calories: 0, protein: 0, carbs: 0, fats: 0,
  }) },
  status: {
    type: String,
    enum: ['active', 'promoted', 'skipped', 'superseded'],
    default: 'active',
    required: true,
  },
  logId: { type: Schema.Types.ObjectId, ref: 'MealLog' },
  promotedAt: { type: Date },
  seriesId: { type: Schema.Types.ObjectId },
}, { timestamps: true })

MealPlanSchema.pre('save', function () {
  this.expectedNutrition = computeTotalNutrition(this.items as IMealItem[])
})

// Indexes
// Run 2 change: dropped the UNIQUE compound index. Multiple plans for the same
// (user, plannedDate, tag) are allowed (e.g. two snacks). Dedup is API-layer.
MealPlanSchema.index({ user: 1, plannedDate: 1, tag: 1 })
MealPlanSchema.index({ user: 1, status: 1, plannedDate: 1 })
MealPlanSchema.index({ seriesId: 1 })

export default mongoose.models.MealPlan || mongoose.model<IMealPlan>('MealPlan', MealPlanSchema)
```

> **Run 2 review:** The original plan put a UNIQUE compound index on `(user, plannedDate, tag)`. That was wrong for two reasons:
> 1. Real users plan multiple snacks per day.
> 2. The constraint only makes sense for `status: 'active'` plans (a promoted plan keeps the row for history but shouldn't block a new active plan in the same slot) — and Mongoose partial unique indexes add complexity that isn't worth it.
>
> Replacement: non-unique compound index for query performance, dedup at the API layer with a `mode: 'merge' | 'replace' | 'fail'` body field (default `merge` — appending items into the existing active plan, which matches the existing `/api/nutrition/log` POST behavior of appending into an existing day-tag log bucket).

### 3.2 `MealLog` additions (minimal)

Add **one** field to `webapp/models/MealLog.ts`:

```ts
// Back-reference: the plan this log was promoted from. Optional; only
// set when the log was created via /api/meal-plans/[id]/promote.
fromPlanId?: Types.ObjectId
```

Schema:

```ts
fromPlanId: { type: Schema.Types.ObjectId, ref: 'MealPlan' },
```

No index needed — promotion is one-way and we never query "all logs that came from plans" in v1.

### 3.3 `User` additions (one preference field)

Add to `webapp/models/User.ts` `IUserProfile`:

```ts
export interface IUserProfile {
  // ...existing fields...

  /**
   * When a meal plan's date arrives, how should it be handled?
   *   'manual'  — show the plan as a "Tap to log" row in the day view.
   *               User taps to promote. Default.
   *   'auto'    — promote silently on the first day-view load that day, so
   *               the daily rollup includes it without user action.
   * Per-plan override is not in v1 — global pref only.
   */
  planPromoteMode?: 'manual' | 'auto'
}
```

```ts
planPromoteMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
```

**Default is `manual`** because nutrition tracking integrity matters: silent promotion means a calorie count that the user didn't confirm. The setting is exposed in `/dashboard/profile`.

### 3.4 No changes to `Meal`, `Food`, `NutritionGoal`, `NutritionLog`

The existing `Meal` model is reused as the "template" for bulk plans. `Food` is unchanged. `NutritionGoal` is read by the month view for the per-day tint math (Section 8) but not modified. `NutritionLog` (the older daily-rollup collection) is **not touched** — the meal scheduling system reads from `MealLog`/`MealPlan` exclusively. If the legacy `NutritionLog` is later sunset, this plan is unaffected.

### 3.5 Migration impact

- **`MealPlan`** is a new collection: zero migration on existing data.
- **`MealLog.fromPlanId`** is an optional new field: zero migration; old docs have it `undefined`.
- **`User.profile.planPromoteMode`** is an optional new field with a default that takes effect on next save. Existing users have it `undefined` server-side and read as `manual` in code via `profile?.planPromoteMode ?? 'manual'`.

No migration script required for the data model. (We do ship one optional helper: `webapp/scripts/preview-meal-plans.ts` is an inspect-only dump for QA; not a migration.)

---

## 4. API surface

All endpoints use `verifyAuth()` middleware (Bearer JWT) and return `NextResponse.json(...)` per project conventions.

### 4.1 `GET /api/meal-plans`

Query params: `from=YYYY-MM-DD&to=YYYY-MM-DD` (inclusive), optional `status=active,promoted` (CSV, defaults to all-except-skipped+superseded for sane month view).

Response:

```ts
{
  plans: Array<{
    _id: string
    plannedDate: string   // YYYY-MM-DD (extracted server-side from the stored UTC date)
    tag: string
    items: IMealItem[]
    mealId?: string
    mealName?: string
    notes?: string
    expectedNutrition: IMealNutrition
    status: MealPlanStatus
    logId?: string
    promotedAt?: string
  }>
  // Per-day grouping convenience — same shape the timeline already uses for logs.
  days: Array<{
    date: string  // YYYY-MM-DD
    plans: Array<{...same as above...}>
    expectedTotals: IMealNutrition
  }>
}
```

**Why both `plans[]` and `days[]`**: month view needs a per-day rollup for the tint math (Section 8). Day view in planning mode wants the flat list. Server returns both so the client doesn't re-bucket.

**Date parsing**: server reads `from`/`to` with the same helper as `webapp/app/dashboard/calendar/CalendarClient.tsx`'s `localDateFromScheduledIso` analogue — see Section 8 for the canonical timezone function. Range is `>= start of from-day` and `<= end of to-day` in UTC terms applied to the stored UTC-midnight dates.

### 4.2 `POST /api/meal-plans`

Body:

```ts
{
  plannedDate: string  // YYYY-MM-DD (required)
  tag: string          // required; lowercased server-side
  items?: MealItemInput[]   // optional — empty plan allowed (e.g. placeholder)
  mealId?: string           // optional — when applying a template
  notes?: string
  // Dedup behaviour when an ACTIVE plan already exists for (user, date, tag).
  // Default 'merge' — append items into the existing plan. 'replace' wipes the
  // existing plan's items and replaces with this body's items. 'fail' returns
  // 409 (used by automated/recurring callers that want explicit handling).
  mode?: 'merge' | 'replace' | 'fail'
  // Recurrence (Section 7):
  repeat?: {
    every: 'day' | 'week'
    count: number              // 1..52 weeks or 1..30 days
    skipDates?: string[]       // YYYY-MM-DDs to omit
  }
}
```

Behavior:

1. Resolve `items` via `resolveItemsFromInput` (existing helper in `webapp/lib/mealItems.ts`) — same code path the log endpoint uses, so the picker payloads are interchangeable.
2. If `mealId` is supplied and `items` is omitted, snapshot from the meal's `items[]` (same code as `POST /api/meals/[id]/log`).
3. Parse `plannedDate` via `parsePlannedDateToUtcMidnight()` (Section 8). Store as UTC midnight where the YYYY-MM-DD portion is the intended local date.
4. Reject `plannedDate` strictly in the past (today is OK; the user might be "back-planning" a same-day meal they haven't logged). Comparison uses the client-derived "today" rule (Section 8.3) — but for past-day rejection, the server uses a permissive bound: reject only if `plannedDate < today_utc - 1` (i.e. anything more than 24h behind UTC today is unambiguously in the past). This handles TZ ambiguity at midnight without rejecting same-day plans for any client TZ.
5. **Run 2 — dedup logic** (replaces the old unique-index-409 path):
   - Look up `MealPlan.findOne({ user, plannedDate, tag, status: 'active' })`.
   - If exists AND `mode === 'fail'`: return 409 `{ error: 'plan_exists', existingPlan }`.
   - If exists AND `mode === 'merge'` (default): append the new items to `existingPlan.items`, recompute `expectedNutrition` via pre-save hook, save, return 200 `{ plan: existingPlan, merged: true }`.
   - If exists AND `mode === 'replace'`: overwrite `existingPlan.items` with the new items, save, return 200 `{ plan: existingPlan, replaced: true }`.
   - If no existing plan: create new doc, return 201 `{ plan }`.
6. If `repeat` is provided, expand into N rows (Section 7), assign a fresh `seriesId`. Per-row dedup follows the same mode rule. `insertMany` is NOT used (because per-row dedup needs an existence check first); instead, parallel sequential `findOneAndUpdate({ upsert: true })` calls bounded by `Promise.allSettled` so per-row failures don't block the rest. Response shape: `{ created, merged, conflicts, plans, seriesId }`.

> **Run 2 review:** The old behavior assumed a unique index would catch dupes at the DB layer. With the index dropped, dedup moves to the API. The default `mode: 'merge'` makes sense because the existing log surface already merges items into an existing day-tag bucket (see `/api/nutrition/log` POST line 300). Consistency with that mental model.

Old 409 contract retained for `mode: 'fail'` callers:

```ts
{ error: 'plan_exists', existingPlan: {...} }
```

6. On success: 201 with `{ plan }` (or `{ plans, seriesId }` for recurring).

**No streak side-effects** — creating a plan does not extend a streak. Only promotion (which creates a log) does.

### 4.3 `GET /api/meal-plans/[id]`

Single plan fetch. Owner-only. 404 if missing or not owner.

### 4.4 `PATCH /api/meal-plans/[id]`

Owner-only. Body accepts subset of: `items`, `tag`, `notes`, `plannedDate`. **Not allowed after promotion** — `status: 'promoted'` plans are read-only (return 409 with `{ error: 'plan_already_promoted', logId }`). After edit, recompute `expectedNutrition` via pre-save hook.

Edit-the-series support (`?series=true`) is **out of scope for v1**. The user must edit each plan individually, or delete-series + recreate.

### 4.5 `DELETE /api/meal-plans/[id]`

Owner-only. Hard delete. Returns 200 even if plan is already promoted — but does NOT cascade to the resulting `MealLog`. Use case: "I deleted the plan after I'd already logged it" — the log stays.

Query param `?series=true` extends to delete all plans sharing this plan's `seriesId` that are still `active` (don't touch promoted ones).

### 4.6 `POST /api/meal-plans/[id]/promote`

Owner-only. Body optional:

```ts
{
  loggedAt?: string  // optional override; defaults to "now" if the plannedDate is today, or to the plannedDate at the user's local "default-tag time" if it's in the past
  tags?: string[]    // optional — defaults to [plan.tag]
}
```

Behavior:

1. Look up the plan. If status is not `active`, return 409.
2. Resolve `loggedAt` (Section 6.4 for the time-derivation logic).
3. Create a `MealLog` with `items` cloned from the plan, `tags` = supplied or `[plan.tag]`, `fromPlanId = plan._id`, `mealId = plan.mealId` (so log -> meal usage count still tracks), `notes = plan.notes`.
4. Set `plan.status = 'promoted'`, `plan.logId = log._id`, `plan.promotedAt = new Date()`. Save.
5. Run `recordStreakActivity` exactly like the existing log endpoint.
6. Return `{ log, plan }`.

This endpoint is the **only** way to promote a plan. There is no batch-promote endpoint in v1 — auto-promote mode (Section 6.4) calls this endpoint once per matching plan from the client.

### 4.7 `POST /api/meal-plans/[id]/skip`

Owner-only. Sets `status: 'skipped'`. No log created. Used by the "Skip" affordance on a planned row in the day view. Returns `{ plan }`.

### 4.8 `POST /api/meal-plans/bulk-from-day`

Convenience endpoint for "copy yesterday/this-day forward N days". Body:

```ts
{
  sourceDate: string   // YYYY-MM-DD (existing day in either logs or plans)
  sourceType: 'log' | 'plan'
  targetDates: string[]   // YYYY-MM-DDs to plant copies on
  tagPolicy?: 'preserve' | 'remap-by-time'   // default 'preserve'
}
```

For each target date, for each source row (a log or an active plan on `sourceDate`), create a new `MealPlan` on the target date with the same tag and snapshotted items. On per-row unique-constraint conflict, skip that (date, tag) cell and include it in the response's `conflicts[]`. Returns `{ created: N, conflicts: [...], plans: [...] }`.

### 4.9 `POST /api/meal-plans/bulk-from-meal`

"Apply a Meal template to N days at a specific tag." Body:

```ts
{
  mealId: string
  targetDates: string[]
  tag: string
  notes?: string
}
```

Same conflict handling.

### 4.10 No changes to existing endpoints

`/api/meal-logs` (GET/POST), `/api/meal-logs/[id]` (GET/PATCH/DELETE), `/api/meals/*`, `/api/nutrition/*`, `/api/tags`, `/api/profile`: **untouched** except `/api/profile` will surface `planPromoteMode` as a writable field (one-line addition; the existing PATCH handler already iterates over allowed profile fields).

---

## 5. UX spec — month view

### 5.1 Where it lives

The existing toggle on `/dashboard/timeline/page.tsx` is a 2-button segmented control (Day, Week) at lines 658-682. Replace with a 3-button: **Day | Week | Month**. Match the existing styling exactly (the dark-on-white pill is the canonical timeline toggle — do not switch to the gray pill used in CalendarClient's toggle, which is a different surface).

URL state pattern follows the existing one: `?view=month&date=YYYY-MM-DD`. The `date` param's role in month view is "any day within the displayed month" — the page derives the actual month grid from `date.getFullYear()/getMonth()`.

### 5.2 Calendar grid layout

Visual reference: `webapp/app/dashboard/calendar/CalendarClient.tsx` lines 506-582. The grid SHELL is identical (`rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 overflow-hidden`, 7-col grid, Sun-Sat header row, padded cells). The day cell BODY content is meal-flavored:

```
+--------+
|  12    |  <- date number, pill on today (existing pattern)
|  ●●●   |  <- up to 3 colored dots for "tag groups present"
|  73%   |  <- optional micro-percentage of calorie goal (day view setting)
+--------+
```

**Dot color semantics** (max 3 visible, oldest tag in user's day wins for the 4th+):

- Breakfast: amber
- Lunch: orange
- Dinner: indigo
- Snack: emerald
- Other tags: zinc gray (lumped — fine)

A **logged** entry shows a solid dot. A **planned** entry shows a hollow ring (`border border-{color}-500 bg-transparent`). When both logged AND planned for the same tag exist on a day, render the solid dot only — planned has been served. This is the only visual distinction at month-grid density; the rest is for the click-expanded day strip.

**The day-cell tint** (background color of the cell itself) is goal-driven, see Section 8. It's subtle: `bg-emerald-50/60` for on-target, `bg-amber-50/60` for under, `bg-red-50/60` for over, no tint for "no data". Dark mode equivalents per design system.

**Tap target**: each cell is a `<button>` (not a div). Min height `min-h-[44px]` on mobile (the workouts calendar's `min-h-[52px]` is fine too). Tap selects the day; tap-again deselects.

### 5.3 Click behavior

Tapping a day cell in month mode does **not** switch the view. Instead, it expands an **inline day strip** below the calendar showing the selected day's logs + plans, in chronological order, using the same `TimelineLogCard` component as Day view (with a new sibling `TimelinePlanCard` for plans — Section 6.2).

Tapping the date pill on a cell (the small inner button) jumps to Day view: `setView('day'); setSelectedDate(day)`. This is the "drill in" affordance.

A small "Today" button persists in the month-view nav header (matches the existing Day/Week nav). Tapping it scrolls to the current month AND selects today.

### 5.4 Month nav

Header pattern matches CalendarClient: `< ChevronLeft | "May 2026" | ChevronRight >`. Add the existing "Today" pill. The current `goPrev`/`goNext` logic already handles `viewMode` — extend it: for month, step by ±1 calendar month (`setDate(1); setMonth(m ± 1)`).

### 5.5 Loading + empty states

- **Loading**: 6 rows x 7 cols of `h-14 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800` placeholders. Matches CalendarClient's pattern.
- **Empty (no plans, no logs)**: standard `EmptyState` primitive — "No nutrition data this month" with a CTA "Plan your first meal" that opens the plan picker for the first day of the displayed month.

### 5.6 The "fetch month range" pattern

`getMonthDays(year, month)` in CalendarClient.tsx already returns the padded grid (lines 111-137). We reuse this helper. `useEffect` on `(selectedMonthDate, viewMode === 'month')` fetches `/api/meal-logs?from=...&to=...` AND `/api/meal-plans?from=...&to=...` in parallel and merges by date key. Use the calendar's padding-extension trick (`from -= 7 days`, `to += 7 days`) to cover the previous/next month rendered in the padding rows.

### 5.7 What it looks like at 375px

- Grid is full-width.
- Cells are ~50px wide on a 375px screen (375 / 7 ≈ 53, minus borders).
- Date number is `text-xs`; dots are `h-1.5 w-1.5`.
- Calorie micro-percentage is OFF by default on mobile (toggleable from the month-view settings overflow menu — see Section 5.8).

### 5.8 Month view settings overflow

A small gear icon in the month-view header opens a sheet with:

- Toggle: "Show calorie progress on cells" (default on for >= sm, off on mobile)
- Toggle: "Dim past days with no logs" (default on)
- Link: "Promote behavior: Manual / Auto" — deep-link to `/dashboard/profile#nutrition`

These are localStorage-only preferences for v1 (they don't need server sync — they're per-device display prefs). Key: `timeline.monthView.calorieTint`, etc.

### 5.9 (Added by run 2) Accessibility — month grid keyboard + screen reader

The workouts calendar `CalendarClient.tsx` does NOT currently implement arrow-key navigation on its grid. Run 2 is NOT requiring run 3 to retrofit accessibility on the workouts calendar — that's out of scope — but the NEW MonthView MUST ship with minimum-viable a11y:

- **Cells are `<button>`** (already in the spec). Each gets an `aria-label` of the form `"May 14, 2026, 1850 of 2000 calories logged"` (planned/logged distinguished). When no data: `"May 14, 2026, no entries"`.
- **Today's cell** gets `aria-current="date"`.
- **Selected cell** gets `aria-pressed="true"`.
- **Roving tabindex within the grid**: only the currently-focused day is `tabindex={0}`, all others `tabindex={-1}`. Arrow keys move focus (Left/Right ±1 day, Up/Down ±7 days). Home jumps to Sunday of the focused week; End to Saturday. PageUp/PageDown step ±1 month.
- The grid is wrapped in `role="grid"`; rows are `role="row"`; cells are `role="gridcell"`. (Not strictly needed since `<button>` carries the role, but the `role="grid"` on the container enables AT to announce "Calendar, week 2 of 6".)
- The day strip that expands on click receives `aria-live="polite"` so the screen reader announces the day's contents when navigating.

**Dot legend**: the colored dots are decorative duplicates of information already in the cell's `aria-label`. Add `aria-hidden="true"` to the dot container so AT doesn't read "bullet bullet bullet".

### 5.10 (Added by run 2) Optimistic UI policy

The plan tells run 3 to "swap the plan card to a log card in place" after promotion, but doesn't say whether the swap is optimistic or wait-for-server. Run 2 standardizes:

| Mutation | Policy | Rollback on error |
|---|---|---|
| Create plan (POST) | Spinner on the submit button; on success, close picker and re-fetch month + day strip. NOT optimistic — there's a real merge-vs-replace dialog if 409 returns under `mode: 'fail'`, and pre-render-on-success-only avoids the flicker. | N/A — failure stays in the picker. |
| Edit plan (PATCH) | Same as create. | N/A. |
| Delete plan (DELETE) | OPTIMISTIC. Hide the card immediately. On error: re-fetch, show toast. The delete UX needs to feel instant. | Re-fetch + error toast. |
| Promote plan (POST /promote) | Show inline spinner in the "Log it" button. Wait for response. On success: server returns `{ log, plan }`, the client replaces the plan card with a log card constructed from the response (no re-fetch needed). | Re-enable the button, show toast. |
| Skip plan (POST /skip) | OPTIMISTIC. Fade card to 40% opacity immediately. | Re-fetch + error toast. |
| Bulk operations | Show full-modal spinner overlay during request; close modal on success and re-fetch month. | Keep modal open, show error inline. |

**No optimistic for create/edit** because the merge-vs-replace dialog requires real server response. Optimistic for delete and skip because the failure mode is rare (network drop) and the perceived snappiness gain is worth the rollback complexity.

**Auto-promote**: NOT optimistic at the per-plan level. Show the page in loading state until all promote calls resolve (use `Promise.allSettled`), then re-render with results in one shot. Auto-promote toast appears after all settle.

---

## 6. UX spec — planning / scheduling

### 6.1 Where the user enters planning mode

**Two affordances**, no separate "planning mode toggle":

1. **Future-day affordance**: when the user opens a future day (any day after today in Day view, or a future cell in Month view's expanded day strip), the existing `+ Add Food` FAB (timeline page.tsx line 815-825) and the `EmptyState` "Add food" CTA both route to **plan-create** instead of **log-create**. The picker title flips from "Log food" to "Plan food". Same modal, different submit endpoint.
2. **Long-press on today** (day view): a long-press on a tag header (`TagSection` in `webapp/components/nutrition/TagSection.tsx`) reveals an "+ Plan this slot" action. Use case: "Plan tomorrow's dinner right now while I'm in the kitchen". For mobile, long-press; for desktop, a small kebab menu on each tag header with "Plan…" and "Apply meal…".

There is **no global planning toggle**. The mode is inferred from the day. This avoids the UX trap of "I forgot I was in planning mode and now my dinner is a plan when I meant to log it".

### 6.2 Visual treatment: planned vs logged

A `TimelinePlanCard` component renders alongside `TimelineLogCard` in the day view. Visual differences (kept minimal):

- **Border treatment**: planned cards use `border-dashed` (logged cards stay `border` solid). Same per-tag left-stripe color (`tagBorderClass(...)`) — the color story stays consistent.
- **Header badge**: a small `Planned` pill next to the time slot, using `Card accent="info"` left-stripe convention.
- **Title meta**: log cards show `formatTime(log.loggedAt)`; plan cards show "Tomorrow" / "Mon" / etc., never a precise time.
- **Action buttons** (replaces edit/delete on logs):
  - `Log it` (primary) — calls `POST /api/meal-plans/[id]/promote`, on success replaces the plan card with the resulting log card in place.
  - `Edit` — opens `FoodLogSheet` in plan-edit mode.
  - `Skip` — calls `POST /api/meal-plans/[id]/skip`. The card greys to 40% opacity and the actions collapse.
  - `Delete` — same as log delete confirmation pattern.

A `<TimelinePlanCard>` props skeleton:

```ts
interface TimelinePlanCardProps {
  plan: MealPlan
  isToday: boolean              // affects which actions show
  onPromote: (planId: string) => Promise<void>
  onSkip: (planId: string) => Promise<void>
  onEdit: (planId: string) => void
  onDelete: (planId: string) => void
  onToggleFilter: (tag: string) => void
  activeFilters: Set<string>
}
```

A planned card is **never** counted in `dailyTotals` or in the `CalorieRing`. The CalorieRing for a future day shows the goal target only ("Plan 0 / 2000 cal"), unless the user toggles a "preview planned" switch on the day header — in which case the ring fills with `expectedNutrition` summed across active plans (visually distinguished — striped fill, see design system).

### 6.3 Adding a planned meal — flow

From any planning entry point (future-day FAB, kebab "Plan…"), reuse `FoodSearchModal` with two changes:

1. **Mode prop**: `mode: 'log' | 'plan'`. Plan mode hides the precise time picker (plans don't carry times) but keeps the tag picker.
2. **Submit handler**: when `mode === 'plan'`, the caller (`TimelineClient`) calls `POST /api/meal-plans` instead of `POST /api/meal-logs`. The body is constructed exactly the same way — `items[]` is the picker output — plus `plannedDate` (the day the user was viewing) and `tag`.

There is also a fast-path: from any **Meal template** (the `/dashboard/nutrition/recipes` library and the future "My Meals" surface), an "Apply on…" affordance opens a date picker + tag picker and calls `POST /api/meal-plans/bulk-from-meal` with a single-element `targetDates`. This is the "I made tonight's dinner once, schedule it for Thursday" path.

### 6.4 Conversion flow: plan → log

**Two modes** (per-user setting `profile.planPromoteMode`, default `manual`):

#### Manual (default)

- A plan for today shows up in Day view as a `TimelinePlanCard` with a primary action `Log it`.
- Tapping `Log it` calls `POST /api/meal-plans/[id]/promote` with default body (server picks `loggedAt`).
- Server resolves `loggedAt`:
  - If the user is viewing today AND it's still today (server clock + user TZ check), use `new Date()`.
  - If today's tag has a default time-of-day (breakfast 8am, lunch 12:30pm, dinner 6:30pm, snack 3pm) — see Section 6.5 — use that as the local time, converted to ISO. This applies when the user is back-promoting a yesterday plan ("oh I forgot to mark it logged").
  - For any other case, client supplies `loggedAt` (the day-view-with-time-pencil pattern that already exists for logs).
- After promotion, the card swaps in place to a `TimelineLogCard` (the response includes both `plan` and `log` — the client uses `log` for the replacement render).

#### Auto

- On Day view mount for "today", after fetching plans, the client checks: any plan for today with `status: 'active'`? If yes, fire `POST /api/meal-plans/[id]/promote` for each in parallel, then re-fetch logs.
- A subtle toast: "3 plans logged automatically". Plus a per-toast Undo (revert via `DELETE /api/meal-logs/[logId]` and `PATCH /api/meal-plans/[id]` to flip status back to `active`).
- Auto mode is **idempotent across reloads** because step 1 (the check) only fires for `status: 'active'`. A reload won't re-promote.
- Auto mode does NOT fire for past days. If the user navigates to yesterday and yesterday has an unhandled plan, the system does not silently fill it in — that would be retroactive misrepresentation. Show the plan card with its actions.

Why both modes are available:

- **Manual** suits the audience-of-one (Jon Don's clients) who want plan-as-aspiration: planning Monday's perfect breakfast is a commitment device, and tapping "Log it" the morning of is the affirmation. The product is built around mindset (per `MEMORY.md` marketing positioning); a "tap to commit" beat is on-brand.
- **Auto** suits the high-discipline user who pre-plans the week and treats deviation as the exception. They don't want to tap "Log it" on Wednesday morning because the plan IS reality.

Either way, the underlying mechanism is the same single endpoint. We do not store auto/manual at the plan level in v1 — it's purely a client behavior. If we later need per-plan override, we add a `MealPlan.autoPromote?: boolean` field; the contract above already accommodates it.

### 6.5 Default times for back-promotion

```ts
// webapp/lib/mealPlanTimes.ts
export const DEFAULT_TAG_TIMES: Record<string, [number, number]> = {
  breakfast: [8, 0],
  brunch: [10, 30],
  lunch: [12, 30],
  snack: [15, 0],
  'pre-workout': [16, 30],
  dinner: [18, 30],
  'post-workout': [19, 30],
  dessert: [20, 30],
  'late-night': [22, 0],
}

export function defaultTimeForTag(tag: string): [number, number] {
  return DEFAULT_TAG_TIMES[tag.toLowerCase()] ?? [12, 0]
}
```

Server reuses this for the back-promote `loggedAt` derivation (Section 6.4). Client also reuses it when constructing the "default time" for a fresh log in the existing flow — this is the only place where this table touches non-plan code.

### 6.6 Editing a plan

`PATCH /api/meal-plans/[id]` — see Section 4.4. The picker reopens with the plan's current `items`, `tag`, `plannedDate`. Saving rewrites the plan. The associated `MealLog` (if any) is **not touched** — a plan is read-only after promotion anyway, so editing in this state is rejected with 409.

### 6.7 Deleting a plan

`DELETE /api/meal-plans/[id]`:

- If `status: 'active'`: hard delete.
- If `status: 'promoted'`: still hard delete the plan row, but the `MealLog` stays. UI confirmation copy: "Delete this plan? The food log you created from it will stay."
- If `status: 'skipped'` / `superseded`: hard delete with the standard confirmation.

`?series=true` deletes all sibling active plans in the same `seriesId`.

### 6.8 Bulk operations

Each is a single endpoint call. The UI lives in a "Plan tools" overflow on the month view (a kebab on the calendar header):

1. **Copy day forward** — modal: source day (defaults to "Yesterday"), target range (defaults to the next 5 days), preview of (date, tag) cells about to fill. Submit calls `POST /api/meal-plans/bulk-from-day`. Conflicts (existing plans/logs at target cells) shown with per-row "skip / overwrite" radios.
2. **Apply meal to days** — opens after picking a `Meal` from the library (sheet flow): pick target dates (multi-select calendar), pick tag, submit. Calls `POST /api/meal-plans/bulk-from-meal`.
3. **Plan whole week from template** — a tag-grouped template is just a `Meal` with multiple items already on it; we use the same `bulk-from-meal` path with 7 target dates and the same tag for all 7. (For varied weekly templates — different meal per day of week — v1 user manually does 7 single-day applies. v2 idea: a "weekly menu" object.)

### 6.9 Tag picker semantics

A plan's tag is **single-valued** (one tag), unlike a log which is multi-valued (`tags[]`). This is a deliberate UX simplification: a plan exists at a slot, not at a multi-tag intersection. ~~The unique index `(user, plannedDate, tag)` depends on it.~~ (Run 2: the unique index was dropped — see Section 0.3. Single-tag plans is still the right UX choice but no longer enforced by a DB constraint.) If the user wants a "snack and pre-workout" tagged log, they create the log directly (or promote then add tags to the resulting log).

### 6.10 (Added by run 2) Dashboard tile — deferred

> **Run 2 review** of run 1's implicit punt: the `/dashboard` customizable tile registry could host a "Today's Plans" tile showing the user's planned-but-not-yet-promoted meals for today. Run 1's plan does not mention this.
>
> Decision: **defer to v2**. The day view already surfaces today's plans (alongside today's logs). Adding a dashboard tile means picking a tile slot, building a mini-card, and wiring the same promote/skip/edit affordances at smaller density. That's a separate stream of UI work.
>
> What v1 SHOULD ship: ensure the new endpoints (`GET /api/meal-plans?from=today&to=today`) work and respond fast (<100ms). The future tile is a thin client over an endpoint that already exists.

---

## 7. Recurring plans (v1 scope)

**In scope**: "repeat weekly for N weeks" and "repeat daily for N days" — both as expand-on-create.

**Out of scope**: every-other-week, last-Monday-of-month, "weekday-only" (this is M-F daily; trivial to add but not v1), recurrence editing ("change next week's Monday breakfast" — user deletes + adds), DTSTART/RRULE-style rules engine.

### 7.1 Expansion rule

On `POST /api/meal-plans` with `repeat: { every: 'week', count: 6 }`:

1. Validate: `count` in `[1, 52]` for weekly, `[1, 30]` for daily.
2. Generate a fresh `seriesId = new ObjectId()`.
3. Compute target dates: `plannedDate + 0, +1 step, +2 steps, ... up to count - 1`. `step` is 1 day for daily, 7 days for weekly.
4. Subtract any dates in `skipDates`.
5. For each target date, snapshot the same items + tag + notes + mealId. Stamp `seriesId`.
6. `insertMany(plans, { ordered: false })`.
7. Collect per-row conflict failures (unique-index hits) and return them in the response without blocking the others.

### 7.2 Editing/breaking a recurrence

V1: each generated plan is independent. The user edits any single one with `PATCH /api/meal-plans/[id]` and it's unaffected by its siblings. The user breaks out by simply deleting one (with `?series=false`, the default).

`DELETE /api/meal-plans/[id]?series=true` — bulk-delete sibling actives. The UI exposes this only when the plan card has a `seriesId`.

### 7.3 UI hooks

- The plan create modal (sheet variant of `FoodLogSheet`) gets a "Repeat" disclosure section: dropdown (`Once`, `Daily`, `Weekly`) and a number input (`Times: 6`). Hidden by default.
- The plan card shows a tiny "Repeats weekly" line in the meta strip when `seriesId` is present (client requests with `populate-series-count` to know "1 of 6").

### 7.4 No timezone surprises

Weekly recurrence uses LOCAL calendar days. "Every Monday breakfast at week +1" is computed in the user's TZ. See Section 8 for the parse helpers — adding 7 to a local-midnight Date and then re-canonicalizing to UTC-midnight-of-same-local-date is the trap (DST shifts can make a +7-day arithmetic land at 23:00 UTC of the wrong calendar date). The helper `addLocalDays(localMidnightDate, n)` constructs `new Date(y, m, d + n)` and re-canonicalizes — DO NOT use `setDate` on a UTC-anchored Date.

---

## 8. NutritionGoal integration + the timezone story

### 8.1 Tint math (month view day cells)

For each visible day cell:

```ts
const goal = userGoal.calories ?? 2000
const consumedToday = sumLogCals(logsByDate.get(key) ?? [])
const plannedToday = sumPlanCals(plansByDate.get(key) ?? []) // active plans only

// In the past: use consumed.
// Today: use consumed + planned (preview).
// Future: use planned.
let cals: number
if (day < today) cals = consumedToday
else if (isSameLocalDay(day, today)) cals = consumedToday + plannedToday
else cals = plannedToday

const pct = cals / goal
let tint: 'none' | 'on' | 'under' | 'over'
if (cals === 0) tint = 'none'
else if (pct < 0.80) tint = 'under'
else if (pct <= 1.10) tint = 'on'
else tint = 'over'
```

**Tint class** (subtle; the day cell is a button, the tint must not fight legibility):

| State | Class |
|---|---|
| `none` | (no tint) |
| `under` | `bg-amber-50/60 dark:bg-amber-950/20` |
| `on` | `bg-emerald-50/60 dark:bg-emerald-950/20` |
| `over` | `bg-red-50/60 dark:bg-red-950/20` |

The 80% / 110% thresholds are deliberately tolerant (rangy goals are healthy goals). They become user-configurable in v2.

### 8.2 The timezone trap (canonical pattern)

The user's intention when they say "plan breakfast for May 15" is a calendar date in their local TZ. The server is in UTC. Naive `new Date('2026-05-15')` interprets as UTC midnight, which becomes the previous evening in any zone west of UTC — and this is the exact bug recently fixed in `webapp/app/dashboard/calendar/CalendarClient.tsx` (commit 9ba8650) for the workouts calendar.

We mirror the workouts pattern exactly:

```ts
// webapp/lib/mealPlanDates.ts (new — small file, no deps)

/**
 * Parse a YYYY-MM-DD string into a Date pinned at UTC midnight of that
 * calendar day. This is the canonical STORAGE form: the YYYY-MM-DD portion
 * is the user's intended LOCAL date, but we store at UTC midnight so the
 * date string in the database is unambiguous.
 *
 * USE this on the SERVER when accepting a plannedDate from the request.
 */
export function parsePlannedDateToUtcMidnight(s: string): Date {
  // s = '2026-05-15'
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/**
 * Extract the YYYY-MM-DD portion from a stored UTC-midnight Date. Server-
 * side use only — the stored Date IS UTC midnight by construction.
 */
export function plannedDateKey(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Convert a stored plannedDate ISO ("2026-05-15T00:00:00.000Z") into a Date
 * at LOCAL midnight of the same calendar day. Required CLIENT-SIDE so day
 * comparisons against local "today" work in non-UTC zones. Mirrors
 * localDateFromScheduledIso in CalendarClient.tsx (lines 88-101).
 */
export function localDateFromPlannedIso(iso: string): Date {
  const datePart = typeof iso === 'string'
    ? iso.split('T')[0]
    : new Date(iso).toISOString().split('T')[0]
  const [y, m, d] = datePart.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Add N calendar days to a local-midnight Date and return a fresh local-
 * midnight Date. Avoids DST cliffs that `setDate(getDate() + n)` can hit
 * when the source Date is anchored to UTC.
 */
export function addLocalDays(localMidnight: Date, n: number): Date {
  return new Date(
    localMidnight.getFullYear(),
    localMidnight.getMonth(),
    localMidnight.getDate() + n,
  )
}
```

**Rules of the road** (executing run, read this and follow it exactly):

1. **Server** — when accepting a `plannedDate: 'YYYY-MM-DD'` string from a request body, parse with `parsePlannedDateToUtcMidnight`. Store. Never use `new Date('YYYY-MM-DD')`.
2. **Server** — when serializing `plannedDate` to the response, **also** include `plannedDateKey` as a string field on the same object (so clients don't have to re-parse the ISO). The response includes both: `plannedDate: '2026-05-15T00:00:00.000Z'` AND `plannedDateKey: '2026-05-15'`. Belt and suspenders.
3. **Client** — when comparing a plan's date against "today", use `localDateFromPlannedIso(plan.plannedDate)` then `isSameLocalDay(..., new Date())`. Never `new Date(plan.plannedDate)` directly for day-equality.
4. **Client** — when bucketing plans into the month grid, key by `plan.plannedDateKey` (server-provided string). No date math.
5. **Client** — when creating a new plan from a day-cell click, pass the day's `toDateKey(day)` (existing helper) — already a YYYY-MM-DD string — as the request body `plannedDate`. Never `day.toISOString()`.
6. **Recurrence expansion** — use `addLocalDays`. Compute server-side using the input string's parsed local components.

### 8.3 Today-ness

Server cannot reliably know the user's local day boundary without a TZ. We do NOT add a TZ field to the User model (out of scope; would require migration + onboarding flow). Instead: **today-ness is decided client-side**. The promote endpoint accepts an optional `loggedAt` from the client (Section 4.6). When auto-promoting on day-view mount, the client constructs `loggedAt = new Date()` and sends it — server stores verbatim. When the user back-promotes via the "Log it" button on a past-day plan, the client constructs `loggedAt = combineLocalMidnight(plannedDate, defaultTimeForTag(tag))` and sends it.

This means: a user who is in PST and travels to UTC the next morning won't see weird "did breakfast Tuesday auto-promote at 4am UTC?" behavior, because their CLIENT decides what "now" is. Server is pure storage.

### 8.4 NutritionGoal lookups

`GET /api/nutrition/goals` already exists. The timeline page already fetches it (line 362-372). No new endpoint. Add a `useEffect` to refetch goals when the month changes — actually unnecessary; goals don't change per month. Single fetch on mount, reuse across views.

### 8.5 (Added by run 2) Log/plan rebucket strategy for the month grid

> **Run 2 review — the TZ catch run 1 missed:** Plans store `plannedDate` as UTC midnight pinned to the user's intended local date. Logs store `loggedAt` as a precise UTC instant. The existing `/api/meal-logs?from=X&to=Y` route buckets logs by **UTC date** (`l.loggedAt.getUTCFullYear/Month/Date` — see `webapp/app/api/meal-logs/route.ts` lines 28-34, 117, 122). A non-UTC user who logs dinner at 11pm local on May 14 has `loggedAt = 2026-05-15T07:00Z`, and the existing route returns it bucketed under `2026-05-15`. **If a plan exists for May 14 dinner and a log exists for May 14 dinner at 11pm local, they will render on different cells of the month grid.**
>
> This is not a new bug — it's how the existing week view already works, but week view doesn't render on a grid so the rebucket misalignment is invisible. Month view makes it visible.

**Decision (recommended for run 3, with one fallback):**

**Primary path — rebucket on the client in `MonthView`.** The server returns logs in the same shape the existing route already does (do NOT touch the existing route to keep regression risk in PR 2 near zero). The MonthView component re-buckets:

```ts
// MonthView.tsx — internal helper
function bucketLogByLocalDate(log: { loggedAt: string }): string {
  const d = new Date(log.loggedAt)  // parses as UTC instant
  // d.getFullYear/Month/Date use local TZ — exactly what we want
  return toDateKey(d)  // YYYY-MM-DD in local time
}

function bucketPlanByLocalDate(plan: { plannedDate: string }): string {
  // plan.plannedDate is "YYYY-MM-DDT00:00:00.000Z" — strip the time portion
  return plan.plannedDate.split('T')[0]
}
```

`bucketPlanByLocalDate` reuses the server-provided `plannedDateKey` if present (see Section 8.2 rule 2 — server includes both raw ISO and the pre-extracted key). Use the key.

**Fallback path — extend `/api/meal-logs` with a `tz` param.** If perf or correctness in PR 2 reveals client-side rebucket is too brittle (e.g. user with 5000 logs in a month — unrealistic for Jon Don's clients but possible for power users), accept a `tz=America/New_York` query string param on `/api/meal-logs?from=&to=&tz=` and let the server bucket in the user's TZ using Intl.DateTimeFormat. This is the proper fix but adds 60 lines of server code and a code path that could regress the day view. **Not v1 unless PR 2 implementer hits a wall.**

**RUN 3 DECISION POINT:** during PR 2 build, default to client-side rebucket. If you discover that the existing meal-logs route is already TZ-broken for day/week views in non-UTC zones (likely yes), file a follow-up issue separately — do NOT try to fix the day view as part of this work.

### 8.6 (Added by run 2) Server's notion of "today"

The plan claims "server cannot reliably know today without a TZ" (Section 8.3). True. But several endpoints in Section 4 still need a server-side day comparison:
- `POST /api/meal-plans` — reject strictly-past `plannedDate` (Section 4.2 step 4).
- `POST /api/meal-plans/[id]/promote` — pick the right default `loggedAt` when `plannedDate` is "today" (Section 4.6).

**Rule for run 3:**
- For past-date rejection: use a 24h slop. Reject only if `plannedDate < UTC_TODAY - 1 day`. This means "yesterday in any TZ" is still acceptable (the user can plan a same-day breakfast at 11pm the night before because their browser tab was still on yesterday). False positives (planning a meal for 23h in the future) are not user-reachable because the picker hands a YYYY-MM-DD that the user just tapped.
- For "is plannedDate today?" inside promote: do NOT decide server-side. The client passes an explicit `loggedAt` for any back-promote case; absent `loggedAt`, server uses `new Date()` (now), which the client can verify is in the user's local same-day before triggering. The "no client-supplied loggedAt" branch only fires for fresh same-day promotions where now == today is trivially correct.

---

## 9. Edge cases & traps

| Edge case | Behavior |
|---|---|
| Plan made for today before any logging happens | Picker is invoked from a future-day affordance only. To plan today, the user uses the long-press / kebab path on a tag header. Result: plan card appears in today's day view alongside any actuals. Promote affordance is active. |
| Plan made for past date | API rejects with 400 `{ error: 'plan_past_date' }`. The user almost certainly meant "I forgot to log this" — direct them to the standard log-create flow. (UI catches this client-side before submit and surfaces a "Did you mean to log instead?" prompt; do NOT silently retroactively-log on their behalf.) |
| Plan exists, day arrives, user logs something different | Plan stays at `status: 'active'`. The day view shows BOTH: the planned card AND the logged card. No auto-supersession in v1. The user can `Skip` the plan or `Delete` it. (Future: when promote-mode is auto and a different log already exists for that tag, auto-flip plan to `superseded`. Out of v1 scope.) |
| Plan exists for breakfast, log for breakfast also exists | Render both. The CalorieRing counts the log (not the plan). The tag-section header on Day view shows the log first; the plan appears below with a subtle "Planned for today — still pending" cue. |
| Two plans submitted for same (user, date, tag) | **(Updated by run 2)** Default behaviour merges the new items into the existing active plan (Section 4.2 `mode: 'merge'`). UI shows a subtle toast: "Added to existing breakfast plan". If the user wanted a separate plan (e.g. second snack of the day), they can use the kebab "Plan as separate row" affordance — which sends `mode: 'fail'` first to detect existence, then offers explicit "Add to existing" vs "Plan separately" choice. v1 default = merge. |
| Recurring create where some target dates already have plans | Per-row dedup via `mode: 'merge'` by default; items are added to existing rows. Response: `{ created: 3, merged: 2, conflicts: [], plans: [...] }`. UI: "Created 3 new plans, merged into 2 existing". For `mode: 'fail'`, conflicts surface in `conflicts[]` with existing-plan IDs. |
| User changes promote-mode mid-day | If they're on auto and switch to manual, nothing already-promoted is reversed. The next page-load won't auto-fire. If they switch from manual to auto, the next page-load triggers a sweep over any remaining `active` plans for today. |
| Plan items reference a Food that was later deleted | `IMealItem` already snapshots `name`, `nutrition`, `servingSize`, `servingUnit`. Plan rendering and promotion both work fine with no `foodId` lookup. The "edit" picker may not be able to re-resolve the variant, but the snapshot has enough to display + log. |
| User has 0 nutrition goal (uninitialized) | Goal endpoint returns defaults (calories: 2000) — see `webapp/models/NutritionGoal.ts` lines 25-30. Tint math just works. |
| Daylight Saving transition on day in a series | `addLocalDays` constructs from local components, so adding 7 days lands at the same wall-clock-named date (May 14 → May 21) regardless of DST. The stored UTC midnight may differ in absolute offset by 1 hour across the DST boundary; harmless because we render off the YYYY-MM-DD portion only. |
| `MealLog` count vs `MealPlan` count on the same day | Daily totals (existing `/api/meal-logs?date=` response) are unaffected — they don't see plans. The month-view tint considers both per Section 8.1. No double-counting because logs and plans are in disjoint collections. |
| User deletes the underlying Meal that a plan was created from | `mealId` becomes dangling. Plan still renders fine via snapshots. The "Planned from: Avocado Toast" subtitle uses `mealName` (snapshotted). Promotion still works (the log endpoint accepts `mealId` for usage-count increment but tolerates a missing meal — see `Meal_incrementUsage` in `webapp/app/api/meal-logs/route.ts` line 212-215). |
| Timeline page is 1545 lines — what gets refactored | We will NOT refactor the day/week view logic. We'll extract a **MonthView** component into `webapp/app/dashboard/timeline/MonthView.tsx` (new file) and reuse the existing `DayView`/`WeekView` exports. The plan-related pieces (`TimelinePlanCard`, plan fetcher, plan mutations) live in a sibling `webapp/app/dashboard/timeline/planning.ts` module. The page itself grows by ~150 lines (state for plans, the third toggle button, the MonthView render branch, the plan-side mutation handlers). No reorganization of existing helpers. |

---

## 9.1 (Added by run 2) Cascade & reference-integrity rules

The plan was silent on what happens when referenced docs are deleted. Spell it out so run 3 doesn't pick wrong defaults.

| Event | Cascade behavior |
|---|---|
| User deleted | All `MealPlan` rows for that user → hard delete. Match the existing pattern for `MealLog` (we should verify the existing User-delete codepath — if it doesn't cascade MealLogs today, document that as a separate gap, don't paper over it here). |
| `Meal` template (`mealId`) deleted | `MealPlan.mealId` becomes dangling but the plan continues to render via `mealName` snapshot + `items[]` snapshot. NO cascade — plans don't disappear when the user deletes the template they were built from. Renders subtitle "Planned from: Avocado Toast (template removed)" — see Section 9 edge-case table. |
| `Food` deleted (rare; admin only) | Plan items already snapshotted `name`, `nutrition`, `servingSize`, `servingUnit`. `foodId` dangles but render is fine. Same handling as MealLog already has. |
| Plan deleted while a derived MealLog exists | The MealLog is independent and survives. `MealLog.fromPlanId` becomes dangling. Render and math still work; the "from plan" badge on the log row shows "from plan (deleted)" or hides — UI choice for PR 3b. |
| MealLog deleted that came from a plan | The plan row remains with `status: 'promoted'` and a dangling `logId`. On the UX side, this means the user gets a permanent "I promoted this but the log is gone" ghost. Run 2 recommendation: when deleting a MealLog, if `log.fromPlanId` is set, also flip `MealPlan.status` from `promoted` back to `active` so the plan reverts to being log-able. (This is a server-side join inside the existing `DELETE /api/meal-logs/[id]` handler — three lines.) |

> **Run 2 review:** The plan was silent on cascade. The two non-obvious calls are (1) Meal template delete does NOT cascade — plans survive on snapshot, and (2) MealLog delete flips the corresponding promoted plan back to active so the user can re-log it. Both follow the principle "plans are independent intent records; logs are independent consumption records; coupling is opt-in via fromPlanId."

---

## 10. Migration story

**This plan does not require a data migration.**

- `MealPlan` is a new collection — zero existing rows.
- `MealLog.fromPlanId` is a new optional field — old rows have `undefined` which is exactly the right value.
- `User.profile.planPromoteMode` is a new optional field with a default that comes into effect on next save; existing users read it as `manual` via `?? 'manual'` in code. No DB migration.

**Smoke-test data**: a single helper script `webapp/scripts/seed-plans-for-user.ts` (dev only, gated by a manual env flag) seeds 14 days of plans for a test user from a hand-curated set of meals. Not deployed; used only for visual QA. Optional — skip if the implementing run runs out of time.

---

## 11. Phased PRs

> **Run 2 change:** the original "five PRs" plan packed too much into PR 3 (5 disjoint UI surfaces). Split into PR 3a + PR 3b. Total is now **six PRs**. PR 2 has a hard dependency on PR 1 being deployed first; the rest are linearly stacked. See Section 11.6 for the rollback story per PR.

Six PRs, each independently deployable (with PR 1 deployed before PR 2). After each, production is in a coherent state (no half-states).

### PR 1 — Foundation: models, helpers, endpoints

Branch: `agent/<host>-meal-plan-foundation`.

Includes:

- `webapp/models/MealPlan.ts` (new).
- `webapp/models/MealLog.ts` — add `fromPlanId` field.
- `webapp/models/User.ts` — add `profile.planPromoteMode`.
- `webapp/lib/mealPlanDates.ts` (new).
- `webapp/lib/mealPlanTimes.ts` (new).
- `webapp/app/api/meal-plans/route.ts` (GET, POST).
- `webapp/app/api/meal-plans/[id]/route.ts` (GET, PATCH, DELETE).
- `webapp/app/api/meal-plans/[id]/promote/route.ts` (POST).
- `webapp/app/api/meal-plans/[id]/skip/route.ts` (POST).
- `webapp/app/api/meal-plans/bulk-from-day/route.ts` (POST).
- `webapp/app/api/meal-plans/bulk-from-meal/route.ts` (POST).
- `webapp/app/api/profile/route.ts` — add `planPromoteMode` to allowed fields.

Acceptance:
- `tsc` clean, `next build` clean.
- A curl-based smoke flow works end-to-end against staging: create plan, fetch month range, promote, observe the log appearing in `/api/meal-logs?date=...`.

NO UI changes. Existing app behavior unchanged.

### PR 2 — Month view (read-only against existing logs + plans)

Branch: `agent/<host>-timeline-month-view`.

**Hard dependency**: PR 1 must be deployed first so `/api/meal-plans` exists. Without PR 1, the plan-fetch returns 404 and the month grid shows only logs (degraded but not broken). Do not merge PR 2 to main until PR 1 is on main.

Includes:
- `webapp/app/dashboard/timeline/MonthView.tsx` (new).
- `webapp/app/dashboard/timeline/page.tsx` — extend the view toggle to 3 buttons (Day/Week/Month); add the month branch; add fetch of `/api/meal-plans` alongside `/api/meal-logs` for the month range.
- Reuse `getMonthDays`, `toDateKey` from CalendarClient — duplicate them into `webapp/lib/calendarDays.ts` so both pages import from one place (refactor of CalendarClient.tsx is allowed in this PR only for the import-source change; behavior preserved).
- **Client-side log rebucket per Section 8.5** (the TZ catch). Logs are returned by the server in UTC-bucketed shape but MonthView re-buckets them by local date of `loggedAt` for grid placement.
- Calorie-tint math per Section 8.1.
- Accessibility per Section 5.9 (roving tabindex, aria-labels, gridcell roles).
- Loading skeleton per Section 5.5 (6×7 pulse).
- Empty state per Section 5.5.

Plans are READ in this PR — they render as dots and contribute to tint, but plan creation/edit is still inert. Tapping a "planned" indicator is a no-op (cursor: default; not yet a `<TimelinePlanCard>`).

Acceptance:
- `/dashboard/timeline?view=month` renders without error.
- Month grid shows logged dots correctly for a known test user with historical data.
- A log at 11pm local on May 14 renders on the May 14 cell (NOT May 15) — TZ rebucket works (Section 8.5).
- Calendar nav (month +/-, Today) works.
- Tap on a day with logs shows the expanded day strip below the grid.
- 375px viewport: usable, no horizontal scroll.
- Workouts calendar `/dashboard/calendar` still renders correctly (regression check).
- Arrow keys move focus across the grid; `aria-current="date"` set on today's cell.

### PR 3a — Plan creation (picker mode + future-day affordance + month dots)

Branch: `agent/<host>-timeline-plan-create`.

Scope is deliberately narrow: a user can create a plan and SEE it on the month grid as a hollow-ring dot. They can't yet edit, skip, delete, or promote it — those come in PR 3b. The kebab menu on TagSection is also deferred to PR 3b.

Includes:
- `webapp/components/nutrition/FoodSearchModal.tsx` — add `mode: 'log' | 'plan'` prop. When `'plan'`: hide the time-of-day picker; the submit handler routes to `POST /api/meal-plans` instead of `POST /api/meal-logs`.
- `webapp/components/meals/FoodLogSheet.tsx` — same `mode` prop. Same routing change.
- `webapp/app/dashboard/timeline/page.tsx`:
  - Wire the future-day FAB to open the picker in `mode: 'plan'`.
  - Add the plan-merge-conflict resolution UI: if POST returns `{ plan, merged: true }`, show a subtle toast "Added to existing breakfast plan". If `{ replaced: true }`, toast "Replaced existing breakfast plan". If 409 (when `mode: 'fail'` was sent — not used in PR 3a but reserved), show error toast.
- `MonthView` — render hollow-ring dots for plans alongside solid dots for logs (the dot layer was built in PR 2 but only for logs; this PR adds the plan layer).
- `EditFoodModal.tsx` — NOT touched in this PR (deferred to PR 3b for plan-edit).

Acceptance:
- User taps future day on month grid → day strip expands → empty → user taps FAB → picker opens in plan mode → user picks a food → submit → plan is created server-side → month grid re-renders with a hollow ring on that date.
- Creating a second plan for the same date+tag merges into the first (default `mode: 'merge'`).
- Daily ring for a future day shows "0 / 2000" (plans don't count as consumed).
- Existing log creation flow on today/past days is unaffected.
- Plan dots match tag colour per Section 5.2.

### PR 3b — Plan interaction (TimelinePlanCard + edit + delete + skip + kebab)

Branch: `agent/<host>-timeline-plan-interact`.

Builds on PR 3a. Adds the day-strip plan card and all per-card actions EXCEPT promote (which is PR 4 because it touches the streak + auto-mode logic).

Includes:
- `webapp/app/dashboard/timeline/TimelinePlanCard.tsx` (new).
- Render `TimelinePlanCard` in the day strip (expanded under the month grid) and in Day view alongside `TimelineLogCard`.
- Wire `Edit` on the plan card to `EditFoodModal` in `mode: 'plan'` (PATCH `/api/meal-plans/[id]`).
- Wire `Delete` on the plan card → standard delete confirmation modal → `DELETE /api/meal-plans/[id]`. Optimistic UI per Section 5.10.
- Wire `Skip` → `POST /api/meal-plans/[id]/skip`. Optimistic fade per Section 5.10.
- `webapp/components/nutrition/TagSection.tsx` — add the kebab menu with "Plan…" and "Apply meal…" entries. (Already exists as a section header; this is a small additive change.)
- The `Log it` button on the plan card renders but is wired in PR 4. In PR 3b it shows a tooltip "Coming soon" or is hidden — implementer choice.

Acceptance:
- User sees a `TimelinePlanCard` for each plan in the expanded day strip.
- Edit opens the picker pre-populated with the plan's current items; submit updates the plan.
- Delete removes the plan card optimistically; on server error the card returns and a toast appears.
- Skip fades the plan card to 40% opacity.
- Long-press / kebab on `TagSection` reveals "Plan…" — opens picker in plan mode for the section's tag.
- Editing or deleting a `status: 'promoted'` plan is rejected (PATCH returns 409, DELETE succeeds without touching the log).

### PR 4 — Promotion + auto mode + skip

Branch: `agent/<host>-meal-plan-promote`.

Includes:
- Wire the `Log it` button on `TimelinePlanCard` to `POST /api/meal-plans/[id]/promote`.
- Wire `Skip` to `POST /api/meal-plans/[id]/skip`.
- Profile page: add the "Plan promote mode" radio (Manual/Auto) to `/dashboard/profile`.
- Day-view auto-promote sweep on mount when `profile.planPromoteMode === 'auto'`.
- "Undo recent promotion" toast.

Acceptance:
- Manual mode: tapping `Log it` swaps the plan card for a log card in place, the CalorieRing updates, the streak system fires.
- Auto mode: visiting today's view with 2 active plans causes both to silently promote; toast shows "2 plans logged automatically"; Undo works.
- Promoting a plan does NOT delete the plan row — it flips `status: 'promoted'` and stores `logId`.

### PR 5 — Bulk + recurrence + CalorieRing preview toggle

Branch: `agent/<host>-meal-plan-bulk`.

Includes:
- "Plan tools" kebab on the month-view header.
- `CopyDayForward` sheet.
- `ApplyMealToDays` sheet (entry from a Meal's detail/library view too).
- Recurrence disclosure in the plan-create modal.
- (Run 2 closure of open Q5) `bulk-from-meal` accepts a `repeat: { every, count }` body extension. Server expands into N applied target dates via `addLocalDays`. Same per-row dedup mode as `POST /api/meal-plans`.
- `?series=true` delete affordance on a recurring plan card.
- (Run 2 closure of open Q3) "Preview planned in ring" toggle on the day view header. When on, CalorieRing fills with `consumed + expectedFromActivePlans`. Default off, persisted to localStorage `timeline.dayView.previewPlanned`.
- Confirm step for bulk operations affecting >7 target dates ("Apply Avocado Toast to 30 days?") — prevents user accidentally planning 6 months out.

Acceptance:
- Copy today forward 5 days creates 5 plans (or fewer if conflicts); the conflict list is shown in the response toast.
- A user can apply "Avocado Toast" to next Monday, Tuesday, Wednesday breakfasts with 3 taps.
- A weekly-for-6-weeks plan creates 6 sibling rows with a shared `seriesId`; deleting the series clears all 6 in one call.
- Bulk op with N > 7 surfaces a confirm dialog.
- DST recurrence test: a user in US-Eastern creating a "weekly for 6 weeks" plan spanning the March DST cutover lands on the same wall-clock day each week (manual QA item).

### 11.6 (Added by run 2) Rollback story per PR

If a PR ships broken and must be reverted:

| PR | Rollback path | Cost |
|---|---|---|
| PR 1 | Revert the merge commit. New collection is unused → safe to leave the empty `meal_plans` collection in production. New optional fields on `MealLog` and `User` stay around as no-op. | Low. Code revert only; no data action. |
| PR 2 | Revert the merge commit. The 3rd toggle button disappears; URL `?view=month` falls back to `day` (the existing useMemo defaults to `day` if the param is unrecognized — verify before revert). | Low. Code revert only. |
| PR 3a | Revert the merge commit. Future-day FAB returns to log-create (existing behavior). Any plans created during the broken window remain in the DB — orphan but harmless. | Low. Optional cleanup: `db.meal_plans.deleteMany({ createdAt: { $gt: deployTime } })` if the docs are bad. |
| PR 3b | Revert the merge commit. `TimelinePlanCard` is gone; plans still exist in DB but no longer render. The PR 3a affordances (create plan) still work, so the user can create plans they can't see — likely worth fixing forward rather than reverting. | Medium. If reverting, also revert PR 3a. |
| PR 4 | Revert the merge commit. Promote button stops working. Any plans promoted during the broken window leave behind `logId` references; logs they created stay in `meal_logs`. If the promote logic was wrong (e.g. wrong streak math), targeted DB fix may be needed. | Medium-high depending on what broke. |
| PR 5 | Revert the merge commit. Bulk operations stop working. Plans created by bulk-from-day during the broken window stay around — they look identical to single-plan-create rows. | Low. Code revert only. |

**Coupled reverts**: PR 3b depends on PR 3a (plans render in PR 3b but are created in PR 3a). PR 4 depends on PR 3b (the Log it button lives on `TimelinePlanCard`). Revert in reverse merge order.

---

## 12. Acceptance criteria (whole feature)

After PR 5 lands:

- [ ] `/dashboard/timeline?view=month` shows a 7-col calendar grid for the current month.
- [ ] Each day cell shows up to 3 colored dots: solid for logged, hollow ring for planned.
- [ ] Day cell background is tinted per Section 8.1 thresholds against the user's NutritionGoal.
- [ ] Tapping a day expands an inline day strip showing logs (with edit/delete) and plans (with Log-it/Edit/Skip/Delete).
- [ ] Tapping the date pill inside a cell switches to Day view for that date.
- [ ] Day and Week views still work exactly as before (no regression).
- [ ] `Card`, `EmptyState`, `SectionHeader` primitives used throughout new UI. No `border-2` outside focus states. No `rounded-3xl`. No `p-5` outside modals.
- [ ] 375px viewport: month grid usable, no horizontal scroll, day cells >= 44px.
- [ ] Future-day FAB + tag-header kebab both open `FoodSearchModal` in `mode: 'plan'`.
- [ ] Creating a plan for an existing (date, tag) slot merges into it by default (no 409); explicit `mode: 'fail'` returns 409.
- [ ] Promoting a plan calls a single endpoint, creates a log, flips plan status to `promoted`, fires the streak system.
- [ ] Auto mode promotes today's actives on day-view mount, exactly once per page load; idempotent across reloads.
- [ ] Auto mode does NOT fire for past days the user revisits (Section 9, edge cases).
- [ ] Auto-promote toast offers Undo.
- [ ] Bulk copy day forward creates plans on target dates, skipping conflicts and reporting them.
- [ ] Weekly recurrence creates N sibling plans with shared seriesId; series delete clears them all.
- [ ] No new npm dependencies introduced.
- [ ] All timezone-sensitive code (plan date input, plan date display, month grid bucketing, recurrence expansion, addLocalDays) uses the helpers from `webapp/lib/mealPlanDates.ts`. No `new Date('YYYY-MM-DD')` outside that file.
- [ ] Log rebucket on the client uses local date of `loggedAt` (Section 8.5) — a log at 11pm local does not render on the next day's cell.
- [ ] `tsc` strict clean. No `any`.
- [ ] Playwright e2e (program flow + chat) green — no regression in the existing suite.
- [ ] (Run 2 added) Month grid supports arrow-key navigation with roving tabindex; `aria-current="date"` on today's cell; cells have descriptive `aria-label`.
- [ ] (Run 2 added) Deleting a `MealLog` with `fromPlanId` flips the source `MealPlan.status` back from `promoted` to `active`.

---

## 13. Open questions — CLOSED by run 2

All questions below were left open by run 1 for run 2 to decide. Run 2's decisions are stated, with brief reasoning. Run 3 implements against these answers.

1. **Sharing the calendar-grid scaffolding between `/dashboard/calendar` and `/dashboard/timeline`.** **DECISION: defer extraction.** v1 duplicates the grid render between the two routes. Run 1's recommendation stands. The workouts calendar regression budget isn't worth burning on a refactor that only saves ~80 lines. Revisit when a third grid surface appears.

2. **Auto-promote on past days the user revisits.** **DECISION: NO auto-promote on past days.** Run 1's instinct was right. Two concrete reasons: (a) silently fabricating consumption records the user didn't confirm is dishonest data — the project's mindset positioning trades on truthfulness; (b) the streak system fires on log create — auto-firing yesterday's plan would silently extend a streak the user shouldn't have. Implementation: in the auto-promote sweep on Day view mount, gate to `plannedDateKey === today_local_key` only.

3. **Should the CalorieRing on today's day view preview planned items by default?** **DECISION: default OFF.** Add the toggle in PR 5 (deferred from PR 3b/PR 4 to keep their scopes lean). The existing ring semantics ("what you ate") are familiar; changing them without consent surprises. The toggle lives in the day header's existing micro-menu, persisted to `localStorage.timeline.dayView.previewPlanned`. Run 1's recommendation stands.

4. **Per-plan auto-promote override.** **DECISION: REJECTED for v1.** Don't add `MealPlan.autoPromote?: boolean`. Reason: premature flexibility. The global setting is enough for the existing user stories. If we discover a real concrete need in v2, adding the field is trivial — but YAGNI today.

5. **Pre-population of recurring plans when applying a `Meal` template.** **DECISION: ACCEPTED.** Add `repeat: { every, count }` to the `bulk-from-meal` body in PR 5. ~20 LOC. Closes a real ergonomic gap ("apply to every Monday for 6 weeks"). Now baked into PR 5 scope.

6. **Calorie-tint thresholds.** **DECISION: hardcode 80%/110% for v1.** No user setting. Per `MEMORY.md`'s "fewer, better choices" directive, expose configurability only when a user complains. The thresholds are visible in `Section 8.1` for future tuning.

7. **Multi-tag plans / two snacks.** **DECISION: drop the unique index.** Multiple plans per (user, date, tag) are now allowed. See Section 0.3. Single-tag PER PLAN is still the rule (a plan has ONE `tag`), but the user can have N plans tagged `snack` on the same day. Pre-workout shake scenario: the user can create one plan tagged `snack` and another tagged `pre-workout`, both for the same item; or use the kebab "Apply meal…" path with multiple target tags.

8. **Plans for a paused / archived program.** **DECISION: non-issue.** Confirmed — plans have no program association. Pausing a workout program does not affect nutrition plans. No code change. Document in Section 9 edge-case table if asked.

9. **Conflict reconciliation on auto-promote.** **DECISION: explicit user action only.** If auto mode fires AND a log already exists for that tag on the same day, the plan stays `active`. The user gets a UI cue ("Planned for today — still pending, you've already logged this tag") with a Skip button. NO silent supersession. Reasoning: same mindset/truthfulness argument as Q2.

10. **Notes inheritance.** **DECISION: YES, inherit.** A plan's `notes` ride into the resulting log on promotion. The plan author wrote those notes thinking about this meal; preserving them maintains the link between intent and consumption. The user can edit the log's notes after promotion if they want. Implementation: Section 4.6 step 3 is already correct.

---

## 13.5 (Added by run 2) Testing posture

The Become codebase has no test framework (per CLAUDE.md). This plan does NOT promise tests. Manual QA expectations:

**Per-PR manual QA checklist** (run before opening for review):

- PR 1: Curl-driven smoke flow against a dev MongoDB. Create plan → fetch → promote → verify log appears. Also: rejected past-date plan, merge mode dedup, fail mode 409, recurring expansion (3 weekly with skipDates).
- PR 2: Visual QA in 375px, 768px, 1280px viewports. Both light and dark mode. Specifically: a log at 11:30pm local should appear on its local-date cell (TZ rebucket).
- PR 3a: Create a future-day plan via FAB. Same plan again — confirm merge toast. Plan dot appears.
- PR 3b: Edit plan, delete plan (optimistic), skip plan (fade). Kebab on TagSection opens picker in plan mode.
- PR 4: Manual mode: tap Log it, observe ring update + streak fire. Auto mode toggle: plans for today auto-fire on day-view mount. Undo restores both the log delete and the plan status flip.
- PR 5: Bulk copy 5 days. Apply meal to 7 days with merge. Weekly recurrence for 6 weeks crossing DST (US-Eastern test account, weekly Mondays Feb 23 → Apr 6, 2026).

**Existing test suites that MUST still pass after each PR**:
- Playwright e2e in `tests/e2e/program-flow.spec.ts` (24 tests).
- Playwright e2e in `tests/e2e/chat.spec.ts` (4 tests).

These tests don't touch nutrition/timeline, so they should remain green by construction. Run them anyway as a regression check.

**What is NOT being tested in this plan**:
- Unit tests for `mealPlanDates.ts` helpers (no test framework). The helpers are simple enough that visual QA catches bugs.
- Property-based tests for TZ math. Manual DST test is the substitute.
- Load tests for the month view with 5000+ logs in a month (out of expected user scale).

---

## 14. What we punted on (with reasons)

- **Reminders / push notifications**. Explicitly out of scope; no notification primitive in the app yet, and adding one for v1 of planning would dwarf the plan itself.
- **Smart suggestions** ("based on last week's logs, plan Tuesday lunch as..."). Stored data supports it; the AI layer doesn't exist yet.
- **Grocery list**. Plans contain `items[]` with `Food` references; building shopping list aggregation across a date range is a one-day task on this foundation. v2.
- **Plan analytics** ("you followed 87% of your plans this month"). Trivial to compute from `promoted` vs `skipped` vs `superseded` counts. v2 dashboard tile.
- ~~**Plan-to-plan re-ordering on the same day**. Plans are single per (date, tag), so no ordering required.~~ (Run 2: with the unique index dropped, multiple plans per (date, tag) are allowed — but they still don't need explicit ordering. Render by `createdAt` ASC.)
- **Server-side TZ awareness**. Avoiding the User TZ field entirely; client decides today-ness. Pragmatic for v1.
- **Plan templates as a separate entity**. Reused the `Meal` model. If templates need plan-specific fields (e.g. preferred tag, time-of-day suggestion), break into `PlanTemplate` later.
- **Drag-and-drop reschedule** in the calendar. Edit-the-plan handles the same need with two more taps; DnD is a polish.
- **A second collection-level migration** for `NutritionLog` (the legacy daily-rollup collection). Plans live entirely in `MealPlan` / `MealLog`; `NutritionLog` is parallel-legacy and untouched. If `NutritionLog` is later removed, this plan stays valid.
- **(Added by run 2) Dashboard "Today's Plans" tile.** See Section 6.10.

---

## 15. Traps for the executing run

- **Don't use `new Date('YYYY-MM-DD')`** anywhere outside `webapp/lib/mealPlanDates.ts`. The trap is silent and time-zone-dependent. Use the helpers.
- **Don't add a `status: 'planned'` field to `MealLog`** to "simplify". That's option B; we explicitly rejected it.
- **Don't auto-promote on past days.** Today only.
- **Don't extend the streak when a plan is created.** Only when a plan is promoted (which creates a log, which calls `recordStreakActivity`).
- **(Updated by run 2) Don't re-add the unique index on `(user, plannedDate, tag)`.** Run 1 specified a unique index; run 2 dropped it. Multiple plans per (user, date, tag) ARE allowed (two snacks). Dedup is API-layer via `mode: 'merge' | 'replace' | 'fail'`, default `merge`. See Section 0.3 and Section 4.2.
- **Don't refactor `webapp/app/dashboard/timeline/page.tsx`** beyond adding the month branch and the planning state. The existing day/week paths are well-tested in production; leave them.
- **Don't migrate the workouts calendar `CalendarClient.tsx`** as part of this work. The shared-grid primitive (open question 1) is v2.
- **Don't reuse `loggedAt` for plan dates.** Plans get `plannedDate`. Confusion here will produce time-of-day-vs-date bugs downstream.
- **Don't add a planning toggle to the global nav.** Planning mode is inferred from the day being future. If the user wants to plan today, they use the tag-header kebab.
- **Don't ship recurrence v1 without DST testing.** Manually verify a US-Eastern test account creating a weekly plan that spans the March DST transition lands on the right calendar Monday.
- **Don't try to backport tints to Week view.** Tints are month-only in v1; week view stays a list with per-day calorie summaries, which is the existing behavior.
- **(Added by run 2) Don't bucket logs by UTC date on the client.** The month grid uses LOCAL date of `loggedAt`. The existing `/api/meal-logs` route returns UTC-bucketed but MonthView re-buckets. See Section 8.5.
- **(Added by run 2) Don't make plan creation/edit optimistic.** The merge-vs-replace dialog (Section 4.2) requires the server response before any UI swap. Delete and skip ARE optimistic. See Section 5.10.
- **(Added by run 2) Don't cascade-delete logs when a plan is deleted.** A plan and its derived log are independent. The log stays. See Section 9.1.
- **(Added by run 2) Don't put a unique partial index trying to "fix" the unique-index problem.** Just don't have a uniqueness constraint at all. Dedup is API-layer.

---

## 16. (Added by run 2) Definition of "Done" for the whole feature

The implementer can claim done when:

1. All six PRs (1, 2, 3a, 3b, 4, 5) are merged to main.
2. The acceptance criteria checklist (Section 12) is fully ticked.
3. A real user account on production can: create a future plan via the FAB on `/dashboard/timeline?view=month`, see the hollow-ring dot appear, navigate to the day, see the `TimelinePlanCard`, edit/skip/delete it, and when its date arrives, promote it manually (or have it auto-promote if their profile is set to auto).
4. The DST recurrence smoke test (US-Eastern test account, weekly Mondays spanning March DST) lands on the right calendar Monday each week.
5. Workouts calendar `/dashboard/calendar` is visually unchanged (regression check at 375px, 768px, 1280px).
6. No new npm dependencies added (verified by `git diff main..head -- webapp/package.json webapp/package-lock.json` showing zero lines).
7. The legacy `/dashboard/nutrition` page still loads and renders correctly — the `/api/nutrition/log` GET (which reads from MealLog) is unchanged in behavior.

