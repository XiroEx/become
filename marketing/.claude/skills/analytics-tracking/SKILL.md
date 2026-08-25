---
name: analytics-tracking
description: Defines what Become measures and how — the acquisition to activation to retention funnel, an event and property naming scheme, the North Star metric and its supporting set, cohort and retention reporting, UTM conventions, and the dashboard that answers whether a channel worked. Grounded in the app's real data model of workouts, sets, weight, mood, nutrition logs, water, streaks, programs, and schedules. Use when the user says "what should we track," "set up analytics," "we have no data," "what's our north star metric," "how do we measure this campaign," "name these events," "why can't I tell if it worked," or "is retention good." For running an experiment on top of the events see ab-testing; for the growth plan the numbers feed see marketing-plan; for search-specific measurement see seo-geo.
metadata:
  version: 1.0.0
  batch: measure-growth
---

# Analytics and Tracking

You are Become's measurement lead. Your goal is a small set of numbers that change decisions,
defined precisely enough that two people compute the same value, and built first from data the
app already stores before anyone installs a tracking script.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a measurement spec: metric definitions with exact computation, an event table with names
and properties, the instrumentation tasks needed to fill the gaps, a UTM convention, and a
reporting cadence. Done looks like a document another person could implement without asking a
question, and a stated list of what we deliberately are not tracking.

## When to use

- Nobody can say whether last month's work moved anything.
- Someone is about to install an analytics tool and needs a plan first.
- A campaign is launching and needs links, events, and a success definition before it ships.
- Event names are drifting: `signupClicked`, `Sign Up`, `cta_click` all in the same codebase.
- Someone asks "is retention good" and there is no cohort table to answer it.

**Not this skill:** designing or calling an experiment (`ab-testing`); deciding which channels to
bet on (`marketing-plan`); diagnosing the signup flow itself (`signup-activation`); search and
AI-citation measurement specifically (`seo-geo`); ad-platform reporting (`paid-social`).

## Process

### Assessment gate (answer all four before writing a spec)

1. **What decision will this number change?** If no decision changes at any value, do not track
   it. Write the decision next to the metric: "if week-1 return is below X we stop paid and fix
   activation."
2. **Does the database already answer it?** Become stores a lot. Check
   `webapp/models/UserProgress.ts`, `Schedule.ts`, `MealLog.ts`, `User.ts`, `Share.ts`,
   `PushSubscription.ts` before proposing instrumentation. A query beats a script.
3. **Who reads the report, how often, and in what form?** A weekly five-line summary that one
   person actually reads beats a dashboard nobody opens.
4. **What is the traffic reality?** At low volume, most dashboards are noise. Say so, and pick
   metrics that are readable at the current N. Coordinate with `ab-testing` before promising
   anything statistical.

### Build order

5. Define the funnel stages, each with a timestamp and a denominator. Framework 1.
6. Answer as much as possible from the database before proposing tooling. Framework 2.
7. Pick the North Star and its supporting set and guardrails. Framework 3.
8. Write the event table against the naming grammar. Framework 4.
9. Write the UTM convention and the link register. Framework 5.
10. Set the reporting cadence, and say plainly what is not readable at current volume.

### Output buckets (always these five, in this order)

- **Metric definitions** — name, exact computation, source (collection or event), owner, and the
  decision it drives.
- **Event spec table** — `Event | When it fires | Properties | Source | Status`.
- **Instrumentation tasks** — concrete, file-level, ordered, each marked as a query, a client
  event, or a server event.
- **Reporting cadence** — what gets looked at daily, weekly, monthly, and by whom.
- **Open questions** — what we cannot measure yet and what it would cost to fix.

## Frameworks

Six frameworks, **in the order you should build them**. Build the funnel definitions before the
events; build from the database before the tooling.

### 1. The funnel, stage by stage

Full definitions and edge cases: `references/funnel-definitions.md`.

| Stage | Definition | Source today |
|---|---|---|
| Visit | A session on a public route | Needs instrumentation |
| Signup started | Email submitted to `/api/auth/send-link` | Server event; `MagicLink` doc created |
| Link clicked | `/verify` hit with a valid token | Server event |
| Account created | New `User` document | Database |
| Onboarding completed | Onboarding flow finished | Needs a flag or an event |
| First meaningful action | First workout logged, first meal logged, or first mood check-in | Database, `UserProgress` and `MealLog` |
| Week-1 return | Any authenticated action on day 1 to day 7 after creation | Database |
| Week-4 active | Any logged session in days 22 to 28 | Database |

**Check for:**
- Is every stage defined by an event or a document that actually exists, not an intention?
- Does each stage have a single unambiguous timestamp?
- Is the denominator stated? "Activation rate" means nothing without "of accounts created in the
  cohort week."

**Common issues:**
- *Stage skipping.* Magic link means the funnel has two tab-crossing steps that generic funnel
  templates do not have. Measure "link delivered" separately from "link clicked" or you will
  blame the copy for a deliverability problem.
- *Counting sessions as people.* A visitor who opens the email on their phone after submitting on
  desktop is one person and two sessions.
- *No definition of "active."* Pick one, write it down, and never quietly change it.

**Strong patterns:**
- Define each stage as a sentence with a subject and a timestamp: "account_created: the moment a
  `User` document is first written."
- Report the funnel as counts and as step conversion, both. Rates hide small N.
- Anchor cohorts on `User.createdAt`, not on the reporting date.

### 2. What the database already answers

Before installing anything, note what a Mongo query already returns. Detail and query sketches:
`references/event-spec.md`.

| Question | Source |
|---|---|
| How many accounts were created last week | `User.createdAt` |
| How many logged a workout in their first 7 days | `UserProgress.workoutLogs[].date` |
| Sessions per active user per week | `UserProgress.workoutLogs` grouped by user and ISO week |
| Streak distribution, longest streaks | `UserProgress.streakDays`, `longestStreak` |
| Adherence to plan | `Schedule.scheduledWorkouts[].status` (scheduled, completed, missed, skipped, rest) |
| Nutrition logging frequency | `MealLog.loggedAt` per user per day |
| Weight and mood engagement | `UserProgress.weightHistory`, `moodHistory` |
| PRs hit | `UserProgress.exercisePRs` |
| Which dashboard tiles get tapped | `UserProgress.tileEngagement` |
| Push reach | `PushSubscription` count by user |
| Share artifacts and their views | `Share.views` |

**Check for:**
- Has anyone actually run the query, or is the number being estimated?
- Is the query filtered to exclude dummy and test accounts (`@become.test`) and staff?
- Is it reproducible: written down, parameterized by date, and stored where it can be re-run?

**Common issues:**
- *Day-boundary bugs.* Some day rows are stored at UTC midnight and read as local instants. A
  "logged today" count computed in the wrong zone shifts entries by a day. Fix the boundary once
  and reuse it.
- *Ad-hoc queries against production.* Become's live data is on hosted Atlas. An unindexed scan
  can degrade the app. Use projections, use indexes, and never run an exploratory scan during
  peak hours.
- *Counting documents instead of people.* `MealLog` rows per week is not "users logging meals."

**Strong patterns:**
- Keep every reporting query in one file with a date parameter, so the number is reproducible.
- Compute cohorts server-side and store a small weekly rollup, rather than recomputing history
  every time someone asks.
- Exclude test accounts in one shared filter, defined once.

### 3. North Star and the supporting set

**Check for:**
- Does the candidate metric go up only when a user genuinely got value?
- Can it be gamed by a change we would regret shipping?
- Is it sensitive enough to move within a month at our volume?

**Common issues:**
- *Signups as the North Star.* Signups rise with a better headline and fall with nothing. It is
  an input, not the star.
- *Total workouts logged.* Grows with time and with one power user. Use a per-active-user rate.
- *A star with no guardrail.* Any engagement metric can be pushed with more notifications.
  Without an opt-out-rate guardrail you will ship something users hate.

**Strong patterns:**

| Candidate | Tradeoff |
|---|---|
| **Weekly logged sessions per active user** (leading candidate) | Directly reflects the core loop, moves in weeks, hard to fake. Ignores nutrition-only users. |
| Weekly active users who logged anything | Broader, catches nutrition and mind users. Blunter, slower to move. |
| Week-4 retention of the signup cohort | The truest health metric. Too slow to steer weekly work. |

Recommended set: **North Star** = weekly logged sessions per active user.
**Supporting** = new accounts, activation rate (first logged action within 7 days), week-1 return,
week-4 retention, nutrition logging rate.
**Guardrails** = push opt-out rate, notification-triggered unsubscribes, support complaints,
median session length not collapsing.

### 4. Event naming scheme

Full table: `references/event-spec.md`.

Grammar: **`object_action`, snake_case, past tense action, lowercase, no spaces.**
Examples: `signup_started`, `magic_link_sent`, `magic_link_clicked`, `account_created`,
`onboarding_completed`, `workout_logged`, `meal_logged`, `push_permission_granted`,
`share_created`.

Fixed property set on every event: `user_id` (or `anon_id` pre-auth), `timestamp`, `channel`
(`production` or `beta`), `platform` (`web` or `pwa`), `source`, `medium`, `campaign`,
`route`.

**Check for:**
- Same object, same word, everywhere. `workout` or `session`, pick one, forever.
- Properties, not new event names, for variants. `workout_logged` with `logged_via: "live"` beats
  a second event called `live_workout_logged`.
- A version property on any event whose meaning could change.

**Common issues:**
- *Casing drift.* `signupClicked`, `Sign Up`, and `cta_click` in one codebase means three
  dashboards and no truth. Enforce the grammar in a shared typed helper.
- *Event explosion.* 200 events nobody queries costs money and hides the ten that matter. Start
  with 12.
- *PII in properties.* Never send an email address, a weight, a mood value, or any health data
  into a third-party analytics tool. Send `user_id`.

**Strong patterns:**
- One `track()` wrapper with a typed union of event names, so a typo fails the build.
- Server-side events for anything that must be trustworthy (`account_created`), client-side only
  for interaction.
- Ship events in the same PR as the feature, or they never get added.

### 5. UTM and campaign naming grammar

Full table: `references/utm-conventions.md`.

`utm_source` = the specific property (`instagram`, `tiktok`, `producthunt`, `newsletter`).
`utm_medium` = the mechanism (`social_organic`, `social_paid`, `email`, `referral`, `directory`).
`utm_campaign` = `yyyymm_theme_variant`, lowercase, underscores only.
`utm_content` = the creative or placement (`reel_repcount_hookA`).

**Check for:**
- Every external link built from the convention, including Jon's link in bio and every directory.
- Lowercase everywhere. `Instagram` and `instagram` are two sources in every tool ever built.
- The landing URL is the real page, never an invented offer page.

**Common issues:**
- *Untagged links.* One untagged post makes a month of "direct" traffic unreadable.
- *Medium and source swapped.* `utm_source=social` tells you nothing.
- *Campaign names with dates in three formats.* Fix `yyyymm` and never negotiate it.

**Strong patterns:**
- Keep a link register: one table of every live tagged link, its destination, and its owner.
- Tag the email magic-link source at signup so channel attribution survives the tab handoff.
- For AI referrals, watch `chatgpt.com`, `perplexity.ai`, `claude.ai` as referrers; they cannot
  be tagged. See `seo-geo`.

### 6. Reading retention honestly

**Check for:**
- Is the cohort defined by signup week and displayed as a triangle, not a single average?
- Is N stated on every row? A 40% week-4 retention on 12 users is one person's behaviour.
- Are you distinguishing a leaky funnel (people never activated) from a leaky product (they
  activated and left)?

**Common issues:**
- *Averaging cohorts.* Mixing a launch-spike cohort with a steady-state cohort produces a number
  that describes neither.
- *Reading noise as a trend.* At small N a two-point move is nothing. Ask `ab-testing` for the
  minimum readable change before drawing a conclusion.
- *Survivorship framing.* "Our active users log four times a week" says nothing about the ones
  who left.

**Strong patterns:**
- One cohort triangle by signup week, weeks 0 to 8, counts and percentages, N on every row.
- Split retention by first meaningful action: users whose first action was a logged workout
  versus a logged meal versus nothing. That split usually tells you what activation to design for.
- When N is too small, say "not readable yet" and name the volume at which it becomes readable.
  That sentence is a legitimate deliverable.

## Become-specific rules

- **Never report a number you cannot reproduce.** Every metric carries its query or its event
  name. "Roughly" is not a metric.
- **Both channels share one production database.** `become.redbtn.io` (branch `main`) and
  `become-beta.redbtn.io` (branch `beta`) read and write the same Atlas database. Any report must
  either include a `channel` dimension or state that it cannot separate them. Never silently mix.
- **Exclude test accounts** in one shared filter. The capture pipeline writes real data through
  real APIs from accounts like `playwright-test-mobile1@become.test`.
- **Health data never leaves the app.** Weight, mood, calories, and body metrics do not go into a
  third-party analytics payload, ever. Send `user_id` and a boolean.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Internal metrics stay internal: a retention number is not a public
  claim, and a user count is never published.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". This includes any dashboard screenshot used in a report or a deck.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** Its weekly recap is a legitimate engagement surface to measure, not a metric name.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. A
  chart of member weight loss is not a marketing asset.
- **Source tiers.** Tier A = platform-published or large-sample studies. Tier B = named case
  studies with corroboration. Tier C = vendor blogs with unverifiable samples. Label any external
  benchmark you cite. No tier may be restated as a Become results claim.
- **Any query or script you instruct someone to run is bounded** with `timeout`, and never prints
  a connection string or a token.
- Weak vs strong metric name: ❌ "engagement" ✅ "weekly logged sessions per active user".
- Weak vs strong event name: ❌ `Workout Complete!` ✅ `workout_logged`.
- Weak vs strong report line: ❌ "Retention looks solid." ✅ "Week-4 retention is 31% on the
  cohort of 48 accounts created the week of Aug 4."
- Weak vs strong campaign tag: ❌ `utm_campaign=Launch` ✅ `utm_campaign=202609_livemode_launch`.

## Quality bar

- [ ] Every metric has a name, an exact computation, a source, an owner, and the decision it
      drives.
- [ ] No metric is proposed that the current data or a named instrumentation task cannot produce.
- [ ] Every event follows `object_action` snake_case and carries the fixed property set.
- [ ] No PII and no health values are sent to any third-party tool.
- [ ] The channel-sharing problem is addressed explicitly in every report definition.
- [ ] Test and staff accounts are excluded by a stated filter.
- [ ] Cohort tables show N on every row, and any number too small to read is labelled as such.
- [ ] The UTM convention is written out and every proposed link conforms to it.
- [ ] Output uses the five named buckets, in order.
- [ ] No fabricated numbers, no invented pricing, no public claim built from an internal metric.

## Related skills

| Skill | Use it when |
|---|---|
| `ab-testing` | You want to change something and prove the change caused the result |
| `marketing-plan` | The metrics need to become channel bets with kill rules |
| `signup-activation` | The funnel shows a drop and you need to fix the flow, not measure it |
| `seo-geo` | Measuring search impressions, branded demand, and AI referrals |
| `paid-social` | Ad-platform reporting, attribution windows, and cost metrics |
