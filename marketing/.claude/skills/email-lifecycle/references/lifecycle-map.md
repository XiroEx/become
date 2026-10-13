# Become Email Lifecycle Map

Five stages. Every email belongs to exactly one. Triggers reference real fields in the app's
data model, so an engineer can implement a row without a second conversation.

Existing implementation lives in `webapp/lib/email.ts`: `sendEmail`, `sendVerificationEmail`,
`sendStreakMilestoneEmail`, `sendStreakAtRiskEmail`. Extend that pattern — the transport, not the
markup, which carries emoji and a heavier layout than the voice rules allow. Note that
`sendStreakAtRiskEmail` has **no callers**: streak-at-risk ships as a web push only, so treat that
function as dead code rather than as an email that exists.

**Nothing below Stage 1 can send yet.** There is no unsubscribe route, no suppression store, and no
`List-Unsubscribe` header anywhere in the codebase. Stages 2 to 5 are designs waiting on that
infrastructure. See the compliance gate in `SKILL.md`.

---

## Stage 1 — Transactional

Consent basis: the user asked for it. No unsubscribe. No marketing content, ever.

| Email | Trigger | Timing | Goal metric | Suppression |
|---|---|---|---|---|
| Magic link / verify | `POST /api/auth/send-link` | Immediate, under 10s | Link clicked within 15 min | None. Never suppressed. |
| Streak milestone | Streak count crosses 3, 7, 14, 30, 50, 100, 200, 365 | On crossing | Return visit within 24h | One per milestone, ever |
| Share received (if built) | Recipient opens a `/share/<shareId>` link and requests a copy | Immediate | Signup from share | None |

**Rules for this stage**
- One button, one plain-URL fallback under it.
- State the 15-minute expiry in the magic-link body.
- The magic-link URL comes from the **request origin** (`getRequestOrigin(req)` in
  `webapp/app/api/auth/send-link/route.ts`), so a link requested on beta already points at beta.
  `NEXT_PUBLIC_APP_URL` is the fallback, and it is the only thing a cron-triggered send has to work
  from, so set the host deliberately for anything we originate ourselves.
- Never add a "while you're here" block. It converts almost nothing and risks the sender.

---

## Stage 2 — Activation (day 0 to day 7)

Consent basis: they created an account. Marketing footer and unsubscribe required.
**Hard cap: three emails across the window. Sequence exits the moment the user activates.**

| # | Email | Trigger | Delay | Single action | Suppression |
|---|---|---|---|---|---|
| A1 | Welcome and first step | Account created | +15 min | Start a session or generate one | Skip if a workout was already logged |
| A2 | Pick your training days | Account created, no `Schedule` training days set | +24h | Set training days | Skip if `Schedule.trainingDays` is non-empty |
| A3 | One logged set is the whole habit | Account created, zero workout logs | +72h | Log any set | Skip if any workout log exists |

**Exit conditions (any one ends the sequence)**
- A workout log exists in `UserProgress.workoutLogs`.
- A meal log exists for the user.
- The user unsubscribed.

**Do not** send A1, A2, and A3 to someone who logged a session an hour after signing up. That
person gets A1 only, and the rest is silence until the habit stage.

**Channel check.** A2 and A3 overlap with real product pushes (`workoutReminder`,
`scheduleSetup` in `webapp/app/api/cron/notify/route.ts`). If the user granted push permission
and the equivalent push already fired today, drop the email. See `push-notifications`.

---

## Stage 3 — Habit

Consent basis: ongoing relationship. Unsubscribe required. **One send per week, maximum.**

| Email | Trigger | Timing | Goal metric | Suppression |
|---|---|---|---|---|
| Weekly recap | Week boundary passes with at least one logged action that week | Morning after the week closes, local time | Return visit, next-week session scheduled | Skip entirely if the week has zero logged actions. Silence beats an empty recap. |

**Content rules**
- Every number comes from that user's week: sessions logged, sets, PRs, streak, mood entries,
  weight entries, nutrition days hit.
- Suppress any block with no data. Never render `0.0 lb` or `0 sessions` as a result.
- Trend language requires three or more data points in the window.
- Close on the next scheduled session from `Schedule`, not on a compliment.
- May link to The Becoming once. Not the theme.

**Timezone trap.** Scheduled-workout slot dates are day markers stored at UTC midnight. Reading
one through a timezone offset shifts it a day for anyone behind UTC, which is exactly the bug
that made the morning push name tomorrow's workout. Read the marker's UTC date part, the way the
dashboard does. See the comments in `webapp/lib/notifications/cronNotify.ts`.

---

## Stage 4 — Reactivation

Consent basis: still subscribed. **Two emails maximum, then the address goes quiet.**

| # | Email | Trigger | Delay | Single action | Suppression |
|---|---|---|---|---|---|
| R1 | Your program is where you left it | No logged action for 14 days | Day 14 | Open the active program | Skip if any log in the window |
| R2 | Want to restart with a shorter week? | No logged action for 30 days, R1 sent | Day 30 | Set fewer training days, or generate a short session | Skip if R1 was not delivered |

After R2, stop. No day-60, no day-90, no "we're really going to miss you."

**Lapse is relative, not absolute.** Someone training three days a week has a normal week with
four empty days. Compute the lapse against `Schedule.trainingDays`, not the calendar. A person
who trains Tuesday and Thursday is not lapsed on Wednesday.

**Tone.** R1 and R2 are the highest guilt-risk emails in the program. The frame is *the plan is
still here*, never *you failed*.

```
❌ You haven't trained in two weeks.
✅ Your Push A is still where you left it. Wednesday works.
```

---

## Stage 5 — Broadcast

Consent basis: subscribed. Unsubscribe required. Rare by design.

| Email | Trigger | Timing | Goal metric | Suppression |
|---|---|---|---|---|
| Feature launch | A launch date set by `launch-campaign` | Launch morning | Feature used within 72h | Suppress users who already used the feature |
| Program drop | New coach-built program published | Day of | Enrollments | None |

**Rules**
- Broadcasts are the only sends where volume spikes. Ramp them: send in batches rather than one
  burst from a sender with no warmup.
- A broadcast must clear the readiness gate in `launch-campaign` first. Never announce something
  that is not live on `become.redbtn.io`.
- Never announce with "(beta)" visible in any capture.

---

## Global rules across all stages

- **Global frequency cap: no more than 2 non-transactional emails in any 7-day window,** and
  never two on the same day.
- **Suppression is a query, not a checkbox.** Write it as one before writing copy.
- **Cross-channel suppression.** If the same message already went out as a push today, do not
  send it as an email. `UserProgress.notificationPrefs` and `lastPushSentAt` are the source of
  truth for what already fired.
- **Beta and production share one database.** Any send triggered from the beta channel reaches
  real members. Test against a dummy account only.
- **No pricing, no results claims, no fabricated proof, in any stage.**
