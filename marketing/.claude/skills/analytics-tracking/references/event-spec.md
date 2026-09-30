# Event Spec

The starting event set for Become. Twelve events, not two hundred. Add one only when someone
names the decision it changes.

Grammar: `object_action`, snake_case, past-tense action. Properties are snake_case scalars.

---

## Fixed property set (every event)

| Property | Type | Notes |
|---|---|---|
| `user_id` | string | Mongo `_id` as a string. Before auth, use `anon_id` instead. |
| `anon_id` | string | First-party cookie or localStorage id, set on first visit. |
| `timestamp` | ISO 8601 | Server time where the event is server-side. |
| `channel` | `production` \| `beta` | Derived from `NEXT_PUBLIC_APP_URL`. Both channels write to the same database, so this property is the only way to separate them. |
| `platform` | `web` \| `pwa` | `pwa` when `display-mode: standalone` matches. |
| `route` | string | Pathname, no query string, no tokens. |
| `source`, `medium`, `campaign`, `content` | string | Captured from UTM on first touch, persisted for the session, attached to signup events. |

**Never** attach: email address, name, weight, mood value, calorie counts, meal contents, or any
free-text the user typed. Send `user_id` and let the app's own database hold the health data.

## The twelve events

| Event | Fires when | Extra properties | Source |
|---|---|---|---|
| `page_viewed` | A public route renders | `referrer`, `title` | client |
| `signup_started` | Email submitted, `/api/auth/send-link` returns 200 | `entry_route` | server |
| `magic_link_sent` | Email accepted by SMTP | `send_ms` | server |
| `magic_link_clicked` | `/verify` hit with a token that parses | `token_age_s`, `same_device` | server |
| `account_created` | A new `User` document is written | `first_touch_source` | server |
| `onboarding_step_completed` | Each onboarding step finishes | `step`, `step_index` | client |
| `onboarding_completed` | Final onboarding step finishes | `duration_s`, `steps_skipped` | client |
| `workout_logged` | A workout log is persisted | `logged_via` (`live` \| `manual`), `program_id`, `exercise_count`, `set_count` | server |
| `meal_logged` | A meal log is persisted | `logged_via` (`photo` \| `barcode` \| `search`), `item_count` | server |
| `mood_logged` | A mood check-in is persisted | none beyond fixed set. **Do not send the mood value.** | server |
| `push_permission_prompted` / `push_permission_granted` / `push_permission_denied` | Permission flow | `prompt_context` | client |
| `share_created` | A `Share` document is written | `kind` (`program` \| `workout` \| `session`) | server |

Variants go in properties, never in new event names. `workout_logged` with
`logged_via: "live"` is correct; a separate `live_workout_logged` is not.

## Typed helper

One wrapper so a typo fails the build and the fixed properties cannot be forgotten.

```ts
// webapp/lib/track.ts (sketch)
type EventName =
  | "page_viewed" | "signup_started" | "magic_link_sent" | "magic_link_clicked"
  | "account_created" | "onboarding_step_completed" | "onboarding_completed"
  | "workout_logged" | "meal_logged" | "mood_logged"
  | "push_permission_prompted" | "push_permission_granted"
  | "push_permission_denied" | "share_created";

export function track(name: EventName, props: Record<string, string | number | boolean> = {}) {
  // attach fixed properties, strip anything that looks like PII, then send
}
```

Rules:
- Server events go through a server-side send, so an ad blocker cannot delete
  `account_created`.
- The wrapper strips any property whose key matches an email pattern or a denylist
  (`email`, `weight`, `mood`, `calories`, `name`).
- Failure to send is never allowed to break a user action. Fire and forget.

## Queries that need no instrumentation

Run against the app database. Always project narrowly, always filter test accounts, always bound
the command with `timeout`. Never print a connection string.

**Exclude filter, defined once:**

```js
const EXCLUDE = { email: { $not: /@become\.test$/i } };
```

**New accounts by week**

```js
db.users.aggregate([
  { $match: { createdAt: { $gte: since } } },
  { $group: { _id: { $isoWeek: "$createdAt" }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } }
]);
```

**Activation: first logged workout within 7 days of signup**

```js
db.userprogresses.aggregate([
  { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "u" } },
  { $unwind: "$u" },
  { $project: {
      created: "$u.createdAt",
      firstLog: { $min: "$workoutLogs.date" }
  } },
  { $project: {
      created: 1,
      activated: { $lte: [ { $subtract: ["$firstLog", "$created"] }, 1000 * 60 * 60 * 24 * 7 ] }
  } }
]);
```

**Weekly logged sessions per active user (the North Star)**

Numerator: count of `workoutLogs` entries with `date` in the ISO week.
Denominator: distinct users with at least one logged action (workout, meal, or mood) in that week.
Report both raw counts alongside the ratio so a small denominator is visible.

**Plan adherence**

```js
db.schedules.aggregate([
  { $unwind: "$scheduledWorkouts" },
  { $match: { "scheduledWorkouts.date": { $gte: weekStart, $lt: weekEnd } } },
  { $group: { _id: "$scheduledWorkouts.status", n: { $sum: 1 } } }
]);
```

Statuses are `scheduled`, `completed`, `missed`, `skipped`, `rest`. Adherence is
`completed / (completed + missed + skipped)`, with `rest` excluded from the denominator.

**Nutrition logging frequency**: distinct `MealLog.user` per day over the period.
**Streaks**: `UserProgress.streakDays` and `longestStreak` distributions.
**Push reach**: distinct `PushSubscription.userId` over total active users.
**Share loop**: `Share` documents created per week and the sum of `Share.views`.

## Day-boundary rule

Some day-scoped rows are written at UTC midnight and read as local instants. Compute every daily
and weekly bucket with one shared boundary helper, in one timezone, and state the timezone in the
report header. Two reports built on different boundaries will disagree by a day and someone will
spend an afternoon on it.

## Tooling choice

The repo has **no analytics library installed today**. That is a feature: pick deliberately.

| Option | Fits when |
|---|---|
| Database queries plus a weekly rollup | Now. Zero cost, zero privacy exposure, answers most questions. |
| A privacy-first page-analytics tool | When you need traffic sources and page performance, which the database cannot see. |
| A product-analytics tool with funnels and cohorts | When N is large enough that funnel visualization beats a query, and only with the PII rules above enforced in the wrapper. |

Whatever is chosen: server-side for trust-critical events, a documented exclude filter, and no
health data in the payload.

## Instrumentation order

1. First-touch UTM capture and persistence (nothing else works without it).
2. `signup_started`, `magic_link_sent`, `magic_link_clicked`, `account_created` server-side.
3. `page_viewed` on public routes.
4. Weekly rollup job producing the North Star, activation, and week-1 return.
5. `onboarding_step_completed` and `onboarding_completed`.
6. `workout_logged`, `meal_logged`, `mood_logged`.
7. Push permission events, then `share_created`.
