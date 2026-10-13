# Lifecycle for launch week - email, push, activation

Produced Tue 2026-08-25 (T-7) by `email-lifecycle`, `push-notifications`, and `signup-activation`
against `launch-plan.md`. All times **America/New_York**. Owners: **George** (builder, ops),
**Jon** (coach), **agent** (a `become-marketing` skill run).

**What this file owns**, so two documents never disagree:

| This file owns | Lives elsewhere |
|---|---|
| The compliance decision as implemented, and what may be sent | The date, the gate, the channel split: `launch-plan.md` |
| The 9/1 push: copy, preference key, `url`, `tag`, window, caps, runbook | Captions, bios, FAQ: `launch-day-copy.md` |
| The push guard's acceptance criteria and hours | Dev-task scheduling and the deploy: `george-checklist.md` |
| Week-one activation for new users, day 0 to day 7 | Directory fields: `listings.md`; handles: `accounts-setup.md` |
| The in-app 9/1 moment: spec or cut | The baseline numbers themselves: `measurement.md` |

`launch-day-copy.md` should **reference section 2 of this file rather than restate the push copy.**
Two copies of a notification payload is how a stale one gets sent.

Three deltas from the sketch in `george-checklist.md` "Dev task 1", each argued in section 3:
the `url` is `/dashboard/nutrition` and not `/dashboard`; the send is gated on an existing
preference key rather than on the master switch alone; and the local-hour window for this campaign
is 12:00-14:00, not 07:00-21:00.

---

## 1. The compliance decision, as implemented

### Decision: push and in-app only. No marketing email. Confirmed, not revisited.

This implements D2 in `launch-plan.md`. The `email-lifecycle` compliance gate is not a
recommendation and not a style preference. It blocks, and it blocks here.

**The gate, restated honestly.** Become has five lifecycle stages. Stage 1 is transactional.
Stages 2 through 5 (activation, habit, reactivation, broadcast) may not send until all of the
following exist. Verified in this worktree at `webapp/` on 2026-08-25:

| Requirement | Exists today? | Evidence |
|---|---|---|
| Unsubscribe route, works with no login, one click, not undoable by a later send | **No** | No route under `webapp/app/api/` matches. `webapp/app/api/notifications/unsubscribe/route.ts` is **web push**, not email. |
| Suppression store checked on every non-transactional send | **No** | No suppression model in `webapp/models/`. No check in `webapp/lib/email.ts`. |
| `List-Unsubscribe` plus `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) | **No** | `webapp/lib/email.ts` `sendEmail()` sets `to`, `subject`, `html`, `from`, `attachments`. No headers option is passed to Nodemailer. |
| Honoured within 2 days | n/a | Nothing to honour. |
| Complaint rate under 0.3% | Unmeasured | Nodemailer over SMTP. No ESP dashboard, no seed list, no reputation view. |
| DMARC **alignment** for the visible From domain | Unverified | Not checked this week and not scheduled. Out of launch scope. |
| Under 5,000 messages/day to Gmail | Yes | ~60 addresses total. |

**The failure mode, in one line:** a launch announcement with no unsubscribe generates complaints,
complaints poison the sending domain, and that domain is the one carrying the **magic links**. For
Become the email address *is* the identity, so a deliverability failure is an authentication
outage. Trading the login channel for roughly 60 announcement opens is a bad trade at any
conversion rate.

**What that costs us, stated plainly:** the owned tier is smaller than a normal launch's. Every one
of the ~60 members is reachable by email and none of them will be reached that way. The push
channel has to carry the entire owned tier, and its reach is capped by a subscription count nobody
has measured yet (measured Wed 8/26, see section 2).

### What still sends during launch week

Two transactional emails already ship and are unaffected by the gate. Neither carries a word of
marketing, and neither may acquire one:

| Email | Trigger | Code | Launch-week note |
|---|---|---|---|
| Magic link / verification | `POST /api/auth/send-link` | `sendVerificationEmail()` in `webapp/lib/email.ts:114`, called at `webapp/app/api/auth/send-link/route.ts:78` | **The launch runs on this email.** Its host derives from the request origin via `getRequestOrigin(req)`, so a link requested on beta returns a beta link. Test from `become.redbtn.io` only. Guardrail 1 in `launch-plan.md` section 11 is this email. |
| Streak milestone | Streak crosses 3, 7, 14, 30, 50, 100, 200, 365 (`webapp/lib/streakConstants.ts`) | `sendStreakMilestoneEmail()` in `webapp/lib/email.ts:53`, called from `webapp/lib/streak.ts:162` | Fires on the member's own achievement. A 9/1 signup who logs Tue, Wed, Thu hits milestone 3 on **Thu 9/3** and gets this. It is the only email a launch-week signup can receive besides their own sign-in links. |

`sendStreakAtRiskEmail()` (`webapp/lib/email.ts:85`) has **zero callers**. Streak-at-risk goes out
as a web push. Do not cite it as evidence that an email ships.

**Do not add marketing to either template.** A hero image and three feature links on a magic-link
email push the button below the fold, raise the spam score, and put the login channel at risk for
no gain.

### The one carve-out

Jon hand-typing up to **15 individual messages** to warm clients on Tue 9/1 is ordinary
correspondence between a coach and his clients. It is not a bulk send, it does not touch
`webapp/lib/email.ts`, and it does not touch the app's sending domain. Conditions, all three:
each message is different, the list is 15 names and not 60, and it goes from Jon's own accounts.
The list is Jon's task on Tue 8/25 in `jon-checklist.md`.

### The deferred build: minimal email unsubscribe. Week of 9/8, not launch week.

Opened at T+7 (Tue 9/8 11:30) per the run of show. Specified here so the week of 9/8 starts with a
spec instead of a discussion. It exists to open the **weekly recap**, which is the strongest email
Become will ever send because it is entirely about the reader and entirely true.

**Size: 5 hours, one working day with the test.** Owner George. Branch
`agent/alphaSystem-email-unsubscribe` to `beta` to `main`.

| # | Piece | File | Hours |
|---|---|---|---|
| 1 | Suppression model: `email` (lowercased, unique index), `reason`, `source`, `createdAt` | `webapp/models/EmailSuppression.ts` (new) | 0.5 |
| 2 | Signed unsubscribe token, HMAC over the lowercased address using the existing JWT secret mechanism. Non-guessable, no expiry, no login. Never write the secret anywhere. | `webapp/lib/email/unsubToken.ts` (new) | 0.5 |
| 3 | `GET` (link click) and `POST` (RFC 8058 one-click) on one route. Both write the suppression row and return 200 on a repeat. | `webapp/app/api/email/unsubscribe/route.ts` (new) | 1.5 |
| 4 | `sendMarketingEmail()` wrapper: checks the suppression store on **every** send, sets both headers, sets a marketing from-name distinct from the transactional one | `webapp/lib/email.ts` (extend, do not fork the transport) | 1.0 |
| 5 | Confirmation page, plain, with a re-subscribe link | `webapp/app/unsubscribe/page.tsx` (new) | 0.5 |
| 6 | Test against a **dummy account only**. Beta and production share one database, so a test broadcast from beta emails real members. | - | 1.0 |

**Acceptance criteria. Every line is a yes before the first non-transactional send:**

- [ ] `GET /api/email/unsubscribe?t=<token>` suppresses the address with no session and no login, and returns a confirmation page.
- [ ] `POST` to the same route with `List-Unsubscribe=One-Click` in the body suppresses it and returns 200, per RFC 8058.
- [ ] Every message sent through `sendMarketingEmail()` carries **both** `List-Unsubscribe: <https://become.redbtn.io/api/email/unsubscribe?t=...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
- [ ] The suppression check is a query inside `sendMarketingEmail()`, not a flag on `User` that a caller can forget. A suppressed address cannot be re-added by any later send path.
- [ ] Suppression takes effect on the next send, which is inside the 2-day Gmail and Yahoo requirement by construction. CAN-SPAM allows 10 days; we hold at effectively zero.
- [ ] `sendVerificationEmail()` and `sendStreakMilestoneEmail()` do **not** route through the wrapper and carry no unsubscribe header. Transactional mail stays transactional.
- [ ] A suppressed address still receives its magic link. Unsubscribing from the recap must never lock anyone out of their account.
- [ ] The marketing from-name differs from the transactional from-name, so a marketing complaint does not poison the login email.
- [ ] Tested end to end on a dummy address, on production, with the token pasted nowhere.

**Not in this build:** preference-centre granularity, a resubscribe flow beyond one link, HTML
templating beyond the existing single-column inline-styled shape, and DMARC work. DMARC alignment
is an ops task on the sending domain and is a separate ticket.

---

## 2. The launch push, Tue 2026-09-01

**One push. Not a countdown series, not a T+1 follow-up.** That is the guest rule in
`push-notifications/references/nudge-inventory.md` and there is no launch exception.

### 2.1 The nudge table

| Field | Value |
|---|---|
| Name | Launch day, plate photo |
| Audience | Every user with a live `PushSubscription` who passes the guard in section 3 |
| Trigger | Manual invoke of `POST /api/admin/notify` (broadcast branch) by George |
| Local-hour window | **12:00-14:00 local per user.** Inside quiet hours 07:00-21:00 by a wide margin |
| Send times (ET) | 07:30, 12:30, 15:30 on Tue 9/1. Idempotent per user, see 2.5 |
| Preference key | **`mealReminder`** (existing key, existing visible toggle in `webapp/app/dashboard/settings/page.tsx:96`). No tenth toggle |
| Global cap | One per member for this campaign. Suppressed for anyone who already received any product nudge in their local day |
| `tag` | `launch-2026-09-01` (explicit, never the route's `admin-test` default) |
| `url` | `/dashboard/nutrition` |
| Cooldown | n/a, one send |
| Decay | n/a, one send. The ignore-tracking dependency is named in 2.6 |

### 2.2 Full copy

**Primary**

```
Title: One photo, the whole plate
Body:  Photograph your lunch in Nutrition. It comes back itemized.
url:   /dashboard/nutrition
tag:   launch-2026-09-01
```

Title 26 characters. Body 59 characters, and the first 50 are
`Photograph your lunch in Nutrition. It comes back`, which carries the action and the destination
on its own. One action. No number the member did not generate. No price, no count, no health claim,
no emoji, no em dash, no banned word.

**The state it assumes is true:** the member has a plate in front of them, because the guard fires
only between 12:00 and 14:00 in their own timezone; and photographing a plate returns its items,
which is `webapp/app/api/ai/nutrition/plate/` and `webapp/models/PlateScan.ts`. Both are true for
every subscribed member regardless of history, which is the property a broadcast requires. The
route carries one title and one body for everyone, so any line resolving per-member data ("your
Push A", "your 12-day streak") would be false for most of the list.

**Alternate**

```
Title: Set your September training days
Body:  Pick the days you train. The plan fills in from there.
url:   /dashboard/calendar
tag:   launch-2026-09-01
```

Title 32 characters, body 54. **Different strategy, not different wording:** it leads with planning
rather than with a mechanism, and it suits a member with an enrolled program and no schedule (the
population the shipped `schedule-setup` nudge exists for). It is the alternate rather than the
primary because it reads as admin for anyone who already set their days, and because a broadcast
cannot tell the two apart. If it is chosen, the preference key changes to `workoutReminder`, which
is the key `schedule-setup` already rides.

### 2.3 Annotations

- **Why 12:30 and not 09:00.** The window map in `nudge-inventory.md` puts workout reminders at
  07:00-11:00 and mind reminders at 08:00-11:00 (morning: crowded), goal nudges and meal reminders
  both at 17:00-20:00 (evening: the real collision). Midday is the only block with room. Confirmed
  in code: `WORKOUT_REMINDER_START_HOUR`/`END_HOUR` 7/11, `MIND_REMINDER` 8/11, `GOAL_NUDGE` 17/20,
  meal 17-20, `CHECK_IN_REMINDER` 12/16, `REENGAGEMENT` 12/18, all in
  `webapp/lib/notifications/cronNotify.ts`.
- **Midday is not empty either, and the copy answers for it.** The check-in reminder (12:00-16:00)
  and re-engagement (12:00-18:00) both live there. The guard handles the backward direction
  (nothing already sent today) and stamps three keys forward (section 3). The residual exposure is
  in 2.4.
- **Why the mechanism pattern.** `copy-specs.md` names it for a feature launch: "One photo, the
  whole plate / Shoot the plate in Nutrition. It comes back itemized." Whole-plate photo logging is
  the most differentiated thing the product does per `become-context.md` section 7, and it is one
  of the two things the camera genuinely does.
- **Why the window makes the copy true.** "Lunch" is a claim about the member's hour. It is only
  honest because the guard resolves the hour with `localHourForUser(now, timezoneOffset, timezone)`
  and refuses to send outside 12:00-14:00. **The guard and this copy ship together or neither
  ships.**
- **Why the coordination is free.** `WIW-01`, the 16:00 brand post on 9/1, is the plate-photo
  mechanism. The push at 12:30 and the post at 16:00 carry the same true claim to two different
  audiences on the same day, with no second creative.
- **Why `/dashboard/nutrition` and not `/dashboard`.** `copy-specs.md`: the `url` is where the
  promised thing is visible, "not `/dashboard` when the thing is on `/dashboard/nutrition`". The
  route default in `webapp/app/api/admin/notify/route.ts:29` is `/dashboard`, so the payload must
  set it explicitly. This is delta 1 from `george-checklist.md`, and its "never tag an internal
  link with a UTM" rule still applies unchanged.
- **Why `mealReminder`.** The guest rules require a preference key or an existing key ridden.
  Folding beats a tenth toggle, and the message *is* a food-logging nudge, so a member who muted
  food nudges correctly does not get it. One honesty fix rides along: that toggle's sublabel
  currently reads "Evening nudge when you haven't logged any food"
  (`webapp/app/dashboard/settings/page.tsx:96`). Change it to
  **"A nudge when you haven't logged food"** in the same PR, five minutes, so the category the
  member can inspect matches what fired.

### 2.4 Collision check against the nine shipped nudges

Send at local 12:00-14:00. What can still reach that member the same day, and what the guard does:

| Nudge | Window | Can fire after our send? | Handling |
|---|---|---|---|
| Workout reminder | 07:00-11:00 | No, window has passed | Backward check only |
| Mind reminder | 08:00-11:00 | No | Backward check only |
| Schedule setup | Morning | No | Backward check only |
| Check-in reminder | 12:00-16:00 | **Yes, within 30 minutes** | Guard stamps `lastPushSentAt.checkInReminder` on send. The cron skips any member whose stamp is in their local day. Suppressed |
| Meal reminder | 17:00-20:00 | Yes | Guard stamps `lastPushSentAt.mealReminder`. Suppressed. Also the key we ride, so this is coherent |
| Goal nudge | 17:00-20:00 | Yes | Guard stamps `lastPushSentAt.goalNudge`. Suppressed |
| Re-engagement | 12:00-18:00 | Yes | **Not stamped, deliberately.** Its rate limit is 7 days (`webapp/app/api/cron/notify/route.ts:631`), so stamping would silence a lapsed member's follow-up for a week to prevent one same-day double. Accepted exposure |
| Super streak at risk | Evening | Yes | **Not stamped.** Suppressing it can cost a member a live streak. Never trade a member's streak for a marketing send |
| Streak at risk | **Any hour, no local-hour gate** | Yes | **Not stamped**, same reason. This is the pre-existing defect recorded in `nudge-inventory.md` ("any hour, urgent"), gated only by a 20-hour per-key cooldown |

**Residual exposure, stated rather than hidden.** A member who is (a) subscribed, (b) lapsed with
`streakDays: 0` and 3+ days inactive, and (c) not re-engaged in 7 days can receive our 12:30 push
and a re-engagement push the same afternoon. A member with a live streak and nothing logged can
receive ours plus the ungated streak-at-risk sweep. Both are two in a day, which is the absolute
ceiling in the skill, and the streak sweep is the only path that can break "never 2 within 4
hours". Neither is created by this launch; both are properties of the shipped cron. Record the
count at 18:00 on 9/1 rather than assuming it is zero.

### 2.5 Runbook, Tue 2026-09-01

The guard makes the route idempotent per member (a stamped member is skipped), so invoking it more
than once is safe and is how members outside Eastern time get reached inside their own 12:00-14:00.

| Time (ET) | Action | Owner |
|---|---|---|
| Wed 8/26 09:00 | Record the **push subscription count** (distinct `userId` in `PushSubscription`) into `measurement.md`. **Under 15 and push stops being a channel:** skip the push, skip the guard, record it in the review, and re-read section 6 of this file | George |
| Tue 9/1 07:20 | Dry run: `dryRun: true`. Record eligible / skipped-by-preference / skipped-by-window / skipped-already-nudged. Nothing sends | George |
| Tue 9/1 07:30 | Send invoke #1. Reaches only members whose local hour is 12:00-14:00, that is UTC+5 and east. **Skip this invoke** if Wednesday's dry run showed no member east of ET | George |
| Tue 9/1 12:30 | **Send invoke #2, the main one.** Eastern members | George |
| Tue 9/1 15:30 | Send invoke #3. Pacific members at their local 12:30 | George |
| Tue 9/1 18:00 | Record `attempted`, `delivered`, `pruned`, `skipped` into `measurement.md` alongside the primary metric snapshot | George |
| Tue 9/8 10:00 | Guardrail 2 read, per 2.6 | George |

Authentication is an ordinary session on an account with `role: 'admin'`
(`webapp/lib/adminAuth.ts`). Never paste a token, a cookie, or a connection string into any file in
this folder.

**Kill criteria, decided now so nobody decides them at 12:29:**

1. The guard is not merged and deployed by **Fri 8/28 09:00**: no push. Sending ungated burns a
   channel the product depends on to save one send.
2. The Wed 8/26 subscription count is under 15: no push, and no guard either.
3. Production is down or the landing page is broken at 12:30: no push. Fix first.
4. The dry run at 07:20 returns an eligible count of zero: no push, and investigate before 12:30.

### 2.6 Measurement, and two traps in it

**Trap 1: `sent` is not `delivered`.** `sendPushToUser()` (`webapp/lib/pushNotification.ts:34`)
catches every per-subscription error internally and never rejects. So in
`webapp/app/api/admin/notify/route.ts:60-62`, `errors` counts rejected promises and is
approximately always 0, and `sent` counts members iterated, not notifications delivered. The
`PushSendResult` shape already carries `attempted`, `delivered`, `pruned`, `failed`. **The guard
must sum and return those four**, or the T+7 row "Push: sent / errors" in `launch-plan.md` section
12 records a number that means nothing.

**Trap 2: the push itself prunes subscriptions.** A 404 or 410 response deletes the subscription row
(`webapp/lib/pushNotification.ts:66-70`). Guardrail 2 is "no net loss of push subscriptions across
launch week". Dead endpoints pruned by our own send will show up as a loss. Read the guardrail as:

```
net change = (count on Tue 9/8) - (count on Wed 8/26) + (pruned on 9/1) - (new subscriptions 9/1-9/7)
```

A decline that equals the pruned count is housekeeping. A decline beyond it is members leaving, and
that is the number that decides whether this push was worth sending.

**No ignore tracking exists.** `lastPushSentAt` records that we sent, never that anyone opened.
The decay ladder in the skill (3 consecutive ignores halves frequency, 6 drops to weekly, 10 stops
and asks in-app) cannot be built until something counts ignores. Named as a dependency, not
described as live. It is a week-of-9/8 candidate alongside `/api/track`, not launch-week work.

---

## 3. Dev task: the push guard

**Thu 8/27 09:00. Roughly 2 hours: 90 minutes for the route, 30 for a dummy-account test.**
Owner George. Branch `agent/alphaSystem-launch-push-guard` to `beta` to `main`. Use `/release
become` and wait for the build SHA to match the merge SHA. Merged is not deployed.

Files: `webapp/app/api/admin/notify/route.ts` (broadcast branch only, leave the single-email test
path alone), reusing `localHourForUser` and `localDateKeyForUser` from
`webapp/lib/notifications/cronNotify.ts`. Plus the one-line sublabel fix in
`webapp/app/dashboard/settings/page.tsx:96`.

**What the route does today, verified line by line:** `POST /api/admin/notify` checks
`verifyAdmin`, requires `title` and `bodyText`, then for a broadcast calls
`PushSubscription.distinct('userId')` and sends to every one of them. It reads no preference, no
timezone, no `lastPushSentAt`, and defaults `tag` to `admin-test` and `url` to `/dashboard`.

**Acceptance criteria:**

- [ ] Accepts `prefKey` and skips any member with `UserProgress.notificationPrefs[prefKey] === false`. Missing or `null` reads as ON, matching the shipped opt-out convention in `webapp/models/UserProgress.ts:162`.
- [ ] Skips any member with `notificationsEnabled === false` (the master switch, `webapp/lib/push/notificationsToggle.ts`).
- [ ] Accepts `localHourStart` and `localHourEnd` and skips any member whose local hour is outside them. Resolves with `localHourForUser(now, timezoneOffset, timezone)`, IANA zone preferred over the stored offset. **A member with no resolvable timezone is skipped and counted**, exactly as the cron does, so nobody gets a 03:00 notification from a stale offset.
- [ ] Refuses any window that overlaps 21:00-07:00 local. Quiet hours have no launch exception.
- [ ] Skips any member with **any** timestamp in `lastPushSentAt.*` inside their local day. The product nudge wins, always.
- [ ] On a successful send, stamps `lastPushSentAt.checkInReminder`, `lastPushSentAt.mealReminder`, and `lastPushSentAt.goalNudge` with `now`. Does **not** stamp `reEngagement`, `streakAtRisk`, or `superStreakAtRisk`, for the reasons in 2.4. A code comment states that these keys are a slot ledger meaning "this member's attention was spent on this category today", not an audit log of what was sent.
- [ ] Requires an explicit `tag`. Returns 400 rather than falling back to `admin-test`.
- [ ] Requires an explicit `url` for a broadcast. Returns 400 rather than falling back to `/dashboard`.
- [ ] Supports `dryRun: true`: evaluates every gate, sends nothing, returns the same counts.
- [ ] Returns summed `attempted`, `delivered`, `pruned`, `failed` from `PushSendResult`, plus `skippedByPreference`, `skippedByWindow`, `skippedNoTimezone`, `skippedAlreadyNudged`.
- [ ] The single-email path (`email` present) is unchanged, so admin testing still works.
- [ ] Tested against a **dummy account only**. Beta and production share one database, so a broadcast triggered from beta reaches real members' phones.

**Fallback if it does not merge by Fri 8/28 09:00: no push on 9/1.** Losing one send costs a handful
of opens. Sending ungated risks the tray the product's nine retention nudges live in.

---

## 4. Week one for a launch-day signup, Tue 9/1 to Tue 9/8

What a new account actually hits with today's product. Every row is what ships, not what should
ship. Day 0 is Tue 9/1, day 7 is Tue 9/8, which is the review.

| Day | Date | Touchpoint | Channel | Ships today? | Note |
|---|---|---|---|---|---|
| 0 | Tue 9/1 | Landing page, one CTA to `/register` | Web | Yes | `webapp/components/landing/`, unchanged this week |
| 0 | Tue 9/1 | `/register`: name + email, or Google, or a passkey | Web | Yes | `webapp/components/AuthForm.tsx`. Three doors. Google and passkey skip the inbox entirely |
| 0 | Tue 9/1 | Magic-link email, 15-minute expiry | Email, transactional | Yes | Host derives from the request origin. The waiting screen states the address and the expiry, and does not state arrival time or the spam folder. See F1 |
| 0 | Tue 9/1 | `/verify` success, then a 5-second countdown and `window.close()` | Web | Yes | The "Go to dashboard" link is a small underlined text link below the countdown. See F1 |
| 0 | Tue 9/1 | Onboarding, 5 steps: Goals, Background, Body & nutrition, Equipment, Review | In-app | Yes | `webapp/app/onboarding/page.tsx`. Mandatory: `AuthGuard.tsx:62` redirects an incomplete account here. Targets are computed from real answers, not schema defaults |
| 0 | Tue 9/1 | Review step offers the recommended program with "Start this program" | In-app | Yes | Optional enroll. Final button is "Finish", which lands on `/dashboard` |
| 0 | Tue 9/1 | Onboarding seeds a weight entry and nutrition goals | In-app | Yes | So the dashboard is not empty on arrival. Weight history has exactly one point, which is not a trend and must never be drawn as one |
| 0 | Tue 9/1 | First dashboard load: tutorial tour, then program nudge, then daily check-in modal | In-app | Yes | Queued, not stacked: `DashboardClient.tsx:437-465` gates each on `tutorialBusy` and on the one before it. A new account is `due` for the check-in by definition (`lib/checkin/status.ts`) |
| 0 | Tue 9/1 | **Notification pre-prompt slides up 3 seconds after the dashboard mounts** | In-app | Yes | `components/NotificationOptIn.tsx`, mounted at `DashboardClient.tsx:854`. **Outside the modal queue.** See F2 |
| 1 | Wed 9/2 | Nothing scheduled fires unless they granted push | - | **Gap** | Enrolling a program does **not** create a `Schedule`. No training days means no scheduled slot, no workout reminder, and no trigger to return. This is why the `schedule-setup` nudge exists |
| 1 | Wed 9/2 | If push granted: schedule-setup nudge, morning, "Pick the days you train and we will keep you on track from there" | Push | Yes | Rides `workoutReminder`. Strong copy already |
| 1-7 | Wed 9/2 to Tue 9/8 | Daily check-in modal on any dashboard visit until both mood and weight are logged for the day | In-app | Yes | Complete or "Skip for Today" closes the day; a partial check-in buys 8 hours |
| 1-7 | Wed 9/2 to Tue 9/8 | If push granted: check-in reminder 12:00-16:00, meal reminder 17:00-20:00 once they have logged 3 meals in 10 days, mind reminder 08:00-11:00 | Push | Yes | All pref-gated, all one per local day |
| 2 | Thu 9/3 | Streak milestone email at 3 consecutive days (earliest: a signup who logs Tue, Wed, Thu hits it Thu 9/3, matching section 1; a day later per missed day) | Email, transactional | Yes | `STREAK_MILESTONES = [3, 7, 14, ...]`. The only non-login email a launch signup can receive |
| 4-7 | Sat 9/5 onward | If lapsed 3+ days with `streakDays: 0`: re-engagement push, 12:00-18:00, 7-day rate limit | Push | Yes | Body is "Come back and keep building your best self", the weakest line in the shipped set. Rewrite candidate in 5.4, **not** launch-week work |
| 7 | Tue 9/8 | Weekly recap | Email | **No** | Blocked by section 1. Opens after the unsubscribe build. The in-app Progress hub carries the recap in the meantime |

**Read of that table.** With push permission, week one is well served: the shipped nudge set is
genuinely good and covers training, food, mind, check-in, and lapse. Without it, a launch-day
signup receives **nothing at all** between their sign-in link and a possible streak email on Fri
9/4. Push permission is therefore not a nice-to-have for the launch cohort, it is the entire
week-one program. That is what makes F2 the expensive one.

---

## 5. The two worst friction points, and the fixes

Leaking stage named, per `signup-activation`: **Stage 6, returned to a usable session**
(`funnel-map.md`). Launch traffic arrives from Instagram on a phone, which is the exact shape the
verify handoff was not designed for. Stage 8 is second, and F2 sits on it.

### Quick wins (do now, before the Mon 8/31 15:00 `main` freeze)

**F1. The verify handoff on a phone, from a link tapped inside Instagram.** Highest volume path on
9/1 and the most nested. The member taps Jon's link inside Instagram's in-app browser, submits at
`/register` there, opens their mail app, taps the link, which opens in the **mail app's** in-app
browser: a third, separate browser context. `/verify` verifies successfully there, then displays
"You're all set! This tab will close in 5s..." and "Return to your original tab to continue", then
calls `window.close()`, which does nothing because the tab was not opened by script
(`webapp/app/verify/page.tsx:75-76`). The original tab is inside Instagram, and it may be gone. The
only working action, "Go to dashboard", is a small underlined text link below the countdown
(`page.tsx:132-138`).

| Where | Current | Proposed | Why |
|---|---|---|---|
| `app/verify/page.tsx` success, non-PWA | Text link "Go to dashboard" under a countdown | **Promote it to the primary button**, styled like the error state's "Try again" button, labelled `Open Become`, placed directly under the heading and above any other copy | The success screen must always render an explicit primary action and never depend on `window.close()` or on another tab noticing |
| `app/verify/page.tsx` success, non-PWA | "You're all set! This tab will close in 5s..." then "Return to your original tab to continue." | `Signed in.` / `Account created.` then, under the button, `You can close this tab.` Drop the countdown and the close attempt | The countdown promises behaviour the browser will not perform. Removing it removes the lie and the wait |
| `components/AuthForm.tsx:147-151` waiting screen | Address and 15-minute expiry | Add one line: `It arrives in under a minute. Not there? Check spam and promotions.` | Names the spam folder before the member thinks of it. Cheapest fix at Stage 3 |
| `components/AuthForm.tsx` waiting screen | Address and expiry only | Add one line: `Open the link on this device to come straight back here.` | Sets the two-device expectation before it costs a session |

Effort: about 45 minutes total, copy and one class change. No new state, no new route. Ship on
`agent/alphaSystem-verify-handoff` **before Mon 8/31 15:00**, when `main` freezes.

**F2. The notification pre-prompt fires 3 seconds into the first session, outside the queue.**
`NotificationOptIn` (`webapp/components/NotificationOptIn.tsx:73-80`) sets a 3-second timer on
mount whenever `Notification.permission === 'default'`, and it is mounted at
`DashboardClient.tsx:854` with no dependency on `tutorialBusy`, `showNudge`, or
`showCheckInModal`. The dashboard carefully queues its three first-run modals and this card is not
in the queue, so a brand-new member gets it on top of the tutorial tour or the program nudge on
their very first screen, before they have done anything.

Against the ladder in `permission-timing.md` this is Rung 0 twice over: first session, and mid-task.
The card itself is good work (it is a real pre-prompt in our own UI, "Not now" costs nothing, and
the denial reprompt cadence in `lib/push/reprompt.ts` is honest). The timing is what spends the
one-shot resource at the worst moment. And a dismissal is stored for **30 days**
(`DISMISS_TTL_MS`), so a launch-day member who says "Not now" is not asked again until 10/1, after
the whole flywheel window.

Three options, cheapest first:

| # | Change | Effort | Cost of being wrong |
|---|---|---|---|
| a | Pass the dashboard's existing gate into the component and require it: show only when the tour is settled, the program nudge is closed, and the check-in modal is closed. One prop plus one condition | 30 min | Some members see the card later in the same session instead of never. Low |
| b | (a), plus require a first earned win: at least one logged mood, weight, meal, or set. Reuse the check-in status the dashboard already fetches from `GET /api/checkin`, so no new endpoint | 90 min | Grant rate rises, absolute grants may fall short term because fewer are asked. Medium |
| c | Ship neither. Accept that the launch cohort is asked at second 3 | 0 | Push is not a week-one channel for the launch cohort, and we will not know why |

**Recommended: (a) this week, (b) the week of 9/8.** (a) is the smallest change that stops the card
landing on top of another modal, and it fits before the freeze. (b) is the real fix and deserves
more than four days.

**iOS is a separate, larger hole and it is not launch-week work.** iOS 16.4+ grants web push only to
a site running from the Home Screen. `grep -rn "beforeinstallprompt"` across `webapp/` returns
**nothing**: there is no install prompt anywhere in the product. So the iOS half of Jon's audience
cannot receive a push at all, and nothing invites them to install. That caps the entire owned tier
in a way no copy change reaches. Recorded here, scheduled nowhere, and it belongs in the T+7
"one decision" slot in `launch-plan.md` section 12.

### High-impact changes (prioritize, not launch week)

**H1. Enrolling a program does not schedule anything.** There is no `Schedule` write in
`webapp/app/api/programs/enroll/route.ts`, so a member who enrols at the end of onboarding has an
active program, an empty calendar, and no day-2 trigger. The single largest determinant of day-2
return is whether anything is waiting. Fix: after enrolment, ask for training days in one step, or
default them from the `training days per week` answer already collected at onboarding step 2 and
let the member change them. Files: the enroll route, `webapp/app/api/schedule/`,
`app/onboarding/page.tsx` review step. Effort: half a day. **What would make it wrong:** if
members change their training days immediately after a defaulted schedule, defaulting was the wrong
call and the extra step was right.

**H2. The final onboarding button says "Finish".** `Finish` ends a form, `Start day one` starts a
plan, and the review step already computes and shows real targets. One string
(`app/onboarding/page.tsx:663`) plus a destination decision. Effort: 30 minutes for the string, more
if the destination changes from `/dashboard` to the recommended program's first session. Pairs with
H1.

**H3. Add the payoff to each step counter.** Currently `Step {n} of 5 · {title}`
(`app/onboarding/page.tsx:565`). Proposed: `Step 3 of 5 · Body & nutrition · Sets your calorie and
macro targets`, `Step 4 of 5 · Equipment · So no session asks for a machine you do not have`. One
line per step, and the flow already earns the claim. Effort: 30 minutes.

### Test ideas (hypotheses)

1. Because the verify success screen subordinates its only working action to a countdown that
   cannot fire in a mail app's in-app browser, we believe promoting `Open Become` to a primary
   button will cause **dashboard views per successful verification** to rise, measured by the ratio
   of `/dashboard` first views to verify successes, and we are wrong if members instead land in two
   sessions on two devices and the support volume rises.
2. Because the notification pre-prompt currently fires at second 3 of session one, we believe
   gating it on the existing modal queue will cause **grants divided by pre-prompts shown** to rise,
   and we are wrong if total grants fall because materially fewer members are ever asked.
3. Because enrolment creates no schedule, we believe defaulting training days from the onboarding
   answer will cause **day-2 return** to rise, and we are wrong if members immediately edit or
   abandon the defaulted days.

At ~25 signups the week cannot read any of these as a test. Ship the better-reasoned version and
watch a sequential window, per `ab-testing`. Do not report a percentage on a denominator of 25.

### Copy alternatives

| String | Option A | Option B |
|---|---|---|
| Verify success, register | `Account created.` | `You're in.` |
| Verify success, login | `Signed in.` | `You're in.` |
| Verify primary button | `Open Become` | `Go to my dashboard` |
| Verify secondary line | `You can close this tab.` | `Safe to close this tab.` |
| Waiting screen, arrival | `It arrives in under a minute. Not there? Check spam and promotions.` | `Usually under a minute. If not, check spam and promotions.` |
| Waiting screen, device | `Open the link on this device to come straight back here.` | `Open it here and you land straight in. Open it elsewhere and it signs you in there.` |
| Verify error heading | `That link expired.` with `Send me a new one` | `This link is used up.` with `Send me a new one` |

A is the recommendation in every row: shorter, literal, and closer to the copy set in
`magic-link-friction.md`. The error heading change also needs the route to distinguish expired from
reused, which today it does not (`api/auth/verify-link/route.ts:22` returns one message for both),
so treat that row as week-of-9/8.

### Instrumentation needed

Handed to `analytics-tracking`. Nothing here is launch-week build work.

| Metric | Status today | Cheapest path |
|---|---|---|
| Accounts created per day | Not instrumented | One aggregation on `User.createdAt`. Wed 8/26 baseline task |
| Onboarding completion | **Already readable.** `GET /api/admin/stats` returns `users.total` and `users.onboardingCompleted`, rendered at `/dashboard/admin/analytics` | Load the page, write both numbers into `measurement.md`. No query, no connection string |
| Activation (any entry within 7 days) | Not instrumented | `UserProgress` aggregation. `activity.activeThisWeek` from the same admin endpoint is a close free proxy |
| Push subscription count | Not instrumented | `PushSubscription.distinct('userId')`, and after Thu 8/27 the guard's `dryRun` returns it |
| Per-step onboarding drop-off | Not instrumented | Needs events. Week of 9/8 with `/api/track` |
| Verify success to dashboard view | Not instrumented | Needs events. Week of 9/8 |
| `pre_prompt_shown` / `accepted` / `declined`, `permission_granted` / `denied`, `subscription_pruned` | Not instrumented | Week of 9/8. Until then the grant rate is unknowable and F2's fix is judged on reasoning, not data |

---

## 6. The in-app moment on 9/1

**Decision: CUT by default. One named condition flips it.**

The launch push already lands members on `/dashboard/nutrition`, which is the in-app moment for
anyone reachable. A banner would reach members who open the app and did not get the push, which is
a real but small population, and it competes with a first-run screen that already sequences a
tutorial, a program nudge, and a check-in modal.

**It is genuinely a sub-2-hour task**, so the spec is written rather than hand-waved.
`webapp/components/dashboard/MoodGatewayBanner.tsx` is 48 lines and is exactly the pattern: a
single dismissible row rendered conditionally from `DashboardClient` (line 681).

| Field | Value |
|---|---|
| File | `webapp/components/dashboard/LaunchBanner.tsx` (new, clone `MoodGatewayBanner.tsx`) |
| Render | `DashboardClient.tsx`, same slot as `MoodGatewayBanner` (line 681), above the tile grid |
| Show when | `Date.now()` is inside Tue 9/1 00:00 to Sun 9/7 23:59 local **and** not dismissed |
| Dismiss | `localStorage` key `launch_banner_dismissed`, one dismissal is permanent. No re-ask |
| Never stacks | Same gate as the check-in modal: hidden while `tutorialBusy`, `showNudge`, or `showCheckInModal` is true |
| Copy | Heading `One photo, the whole plate` · body `Photograph a plate in Nutrition and it comes back itemized.` · button `Nutrition` to `/dashboard/nutrition` |
| Effort | 60 to 90 minutes including the theme pass in light and dark |
| Must ship by | Mon 8/31 15:00, when `main` freezes. After that it is out |
| Removal | The date window self-expires. Delete the component the week of 9/8 rather than leaving dead code |

**The condition that flips it to build:** the Wed 8/26 push subscription count comes back **under
15**. At that point push is not a channel (`george-checklist.md` line 117), the owned tier has no
surface at all, and 90 minutes to give members one honest in-app pointer is the cheapest owned beat
available. In that case the banner replaces the push and the guard, and the two hours saved on the
guard pay for it.

Otherwise: cut, no discussion on launch day.

---

## 7. What ships, when, and what does not

| When | Task | Owner | Blocks |
|---|---|---|---|
| Wed 8/26 09:00 | Push subscription count into `measurement.md`. **Under 15 flips sections 2, 3, and 6** | George | The push and the guard |
| Wed 8/26 09:00 | Load `/dashboard/admin/analytics` and record `users.total` and `users.onboardingCompleted` | George | Nothing. Free baseline |
| Thu 8/27 09:00 | Push guard, section 3 acceptance criteria, plus the settings sublabel fix | George | The push. No guard by Fri 8/28 09:00 means no push |
| Thu 8/27, any time | F1 verify and waiting-screen copy, `agent/alphaSystem-verify-handoff` | George | Nothing. 45 minutes |
| Fri 8/28, any time | F2 option (a): gate `NotificationOptIn` on the existing modal queue | George | Nothing. 30 minutes |
| Sun 8/30 16:00 | Push copy confirmed against section 2.2. Confirm, do not rewrite | George | The push |
| Mon 8/31 15:00 | `main` freezes. Anything in this file not merged is out of launch week | George | Everything above |
| Tue 9/1 | Runbook 2.5 | George | - |
| Tue 9/8 11:30 | Open the deferred unsubscribe build, section 1 | George | The weekly recap email |

**Explicitly not shipping in launch week**, so nobody adds them back: any marketing email; a second
or third push; a countdown push series; a new notification preference key; an install prompt;
`/api/track`; ignore tracking and the decay ladder; the re-engagement copy rewrite; H1, H2, and H3
from section 5; the recap email.

---

## Quality bar

**push-notifications:** every nudge names a trigger, a local-hour window, a cooldown, and a
preference key (2.1) · stable `tag` and a `url` where the promised thing is visible (2.2) · true at
fire time, and the guard is what makes it true (2.3) · title 26 and body 59 characters, one action
(2.2) · zero shaming, zero manufactured stakes, no streak copy at all · quiet hours 07:00-21:00
respected with room, and the shipped ungated streak sweep flagged (2.4) · decay ladder specified
with the ignore-tracking dependency named as to-build (2.6) · marketing yields to product nudges
both directions (2.4, section 3) · permission is not requested by this push at all, and the
first-load pre-prompt defect is flagged (F2) · no number the member did not generate, no price, no
results claim · zero emoji, zero banned words, near-zero em dashes.

**email-lifecycle:** nothing outside Stage 1 is marked shippable · the gate is restated with
per-row repo evidence · the magic-link email keeps its 15-minute expiry and its request-origin host
· no marketing added to a transactional template · the deferred build carries RFC 8058 headers, a
suppression store checked on every send, and a 2-day honour by construction.

**signup-activation:** one leaking stage named (Stage 6) · every recommendation names a real file
and line · mobile and the mail-app in-app browser are the default assumption · the flow is reasoned
across two devices and a closed tab · every hypothesis carries a metric and a guardrail, and the
unmeasurable ones are listed under instrumentation · copy alternatives supplied for every rewritten
string · no dark pattern, no fake progress, no pre-checked consent, no pricing, no count, no
promised timeline.
