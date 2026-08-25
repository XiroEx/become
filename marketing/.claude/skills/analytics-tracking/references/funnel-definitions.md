# Funnel Definitions

One definition per stage, written so two people compute the same number. Copy these into any
report header rather than restating them loosely.

---

## Stage definitions

### Visit
**Definition:** a session on a public route (`/`, `/login`, `/register`, `/share/[shareId]`).
**Timestamp:** first page view of the session.
**Source:** `page_viewed` event.
**Notes:** sessions, not people. A person on two devices is two visits. Do not use this as a
denominator for anything person-level.

### Signup started
**Definition:** an email address was submitted and `/api/auth/send-link` returned success,
creating a `MagicLink` document.
**Timestamp:** server time of the response.
**Source:** `signup_started` server event.
**Notes:** the same person retrying three times is three events and one intent. Dedupe by hashed
email or by `anon_id` when reporting intent.

### Link delivered
**Definition:** the SMTP send succeeded.
**Source:** `magic_link_sent`.
**Notes:** delivered to the provider, not to the inbox. Spam placement is invisible here. A large
gap between `magic_link_sent` and `magic_link_clicked` is a deliverability signal, not a copy
signal. Hand it to `email-lifecycle`.

### Link clicked
**Definition:** `/verify` was loaded with a token that parses, whether or not it was expired.
**Source:** `magic_link_clicked`, with `token_age_s` and `same_device`.
**Notes:** `MagicLink` documents expire in 15 minutes via a TTL index. A click after expiry is a
distinct failure mode from no click at all, and the two need separate fixes.

### Account created
**Definition:** a new `User` document is written.
**Timestamp:** `User.createdAt`.
**Source:** database. This is the cohort anchor for everything downstream.
**Notes:** returning users who sign in do not create a document. Do not count sign-ins as signups.

### Onboarding completed
**Definition:** the user finished the final onboarding step.
**Source:** `onboarding_completed` event, or a persisted flag if one is added.
**Notes:** partial completion is measured by `onboarding_step_completed` with `step_index`. The
drop-off step is the actionable number, not the completion rate.

### First meaningful action
**Definition:** the earliest of: a workout logged, a meal logged, or a mood check-in.
**Source:** `min` over `UserProgress.workoutLogs[].date`, `MealLog.loggedAt`, and
`UserProgress.moodHistory[].date`.
**Notes:** record **which** of the three it was. Retention splits sharply by first action, and
that split is the single most useful activation insight available from existing data.

### Activated
**Definition:** first meaningful action within 7 days of `User.createdAt`.
**Notes:** 7 days is a choice. Write it in the header. Changing it later without saying so
invalidates every historical comparison.

### Week-1 return
**Definition:** any authenticated write (workout, meal, mood, weight) on day 1 through day 7
after `createdAt`, where day 0 is the signup day.
**Notes:** excludes day 0 deliberately, so it measures return rather than the initial session.

### Week-4 active
**Definition:** at least one logged action in days 22 to 28 after `createdAt`.
**Notes:** the truest health number available. Too slow to steer weekly work; report monthly.

---

## The two magic-link steps generic funnels miss

Become's signup crosses tabs and often crosses devices. Two steps exist that a standard template
has no slot for:

1. **Inbox gap.** Between `magic_link_sent` and `magic_link_clicked` sits an email client we do
   not control. Median gap and the 24-hour non-click rate are both worth reporting.
2. **Tab handoff.** The originating tab polls `/api/auth/check-session`; the link may open in a
   mail app's in-app browser instead. `same_device` on `magic_link_clicked` tells you how often
   this happens. A high cross-device rate changes what the verify page should say, not the
   headline.

Diagnosis and fixes belong to `signup-activation`. This document only defines the measurement.

---

## Cohort construction

- **Anchor:** `User.createdAt`, bucketed by ISO week starting Monday.
- **Shape:** a triangle. Rows are signup weeks, columns are weeks since signup (0 to 8), cells are
  the percentage of that cohort active in that week, with the raw count in parentheses.
- **N on every row.** Always. A percentage without an N is not a finding.
- **Never average across cohorts** for a headline number. A launch-week cohort behaves nothing
  like a steady-state cohort.
- **Exclude** accounts matching the test filter and any staff accounts, using one shared filter
  defined in `references/event-spec.md`.
- **Channel:** production and beta write to the same database. Either include the `channel`
  property or state in the header that the cohort mixes both.

Example header, copy this shape. The numbers in it are
[ILLUSTRATIVE — no analytics exists yet; replace with measured numbers]:

> Cohort: accounts created week of 2026-08-04, N = 48, production and beta combined (not
> separable before the `channel` property shipped). Activation = first logged workout, meal, or
> mood within 7 days. Timezone: America/New_York.

---

## Reading the funnel

| Symptom | Likely cause | Who fixes it |
|---|---|---|
| Visit to signup-started is low | Landing clarity or CTA friction | `landing-cro` |
| Signup-started to link-clicked is low | Deliverability, spam placement, inbox delay | `email-lifecycle` |
| Link-clicked to account-created is low | Expired tokens, verify-page confusion, cross-device handoff | `signup-activation` |
| Account-created to activated is low | Onboarding length, unclear first action, empty first screen | `signup-activation` |
| Activated but no week-1 return | No trigger. The product did not ask them back | `push-notifications`, `email-lifecycle` |
| Week-1 fine, week-4 collapses | Product value, not marketing. Say so plainly | product |

The last row matters most. A marketing skill that hides a product problem behind a funnel tweak
wastes a quarter.

---

## When N is too small

Below roughly 200 signups per month, most stage-to-stage comparisons are unreadable week to week.
Report them monthly, report counts alongside rates, and refuse to draw a conclusion from a
two-point move. Ask `ab-testing` for the minimum readable change before anyone declares a win.

"Not readable yet, becomes readable at about X per week" is a legitimate and useful answer.
