# Retention & Inactivity Audit — What Actually Happens Today (7 & 14 Days Quiet)

> **Status / Baseline (re-annotated 2026-10-14):** Post-fix annotations added for PR #1999 (re-engagement query, IANA timezone fallback, cron timezone sweeps) and PR #2002 (display-only streak liveness). Sections re-checked and annotated: Executive Summary, §1.10, §3.1, §4.5, and Gaps 1, 2, 3, 9 in §5. Unchecked sections (retained as original 2026-10-14 morning baseline): §1.0–§1.9, §2, §3.2–§3.4, §4.1–§4.4, Gaps 4–8, 10–11.  
> Status: COMPLETE AUDIT. Authored 2026-10-14 for Jon's retention story (`6a9f898fcf65197968b1c161`).  
> Base branch: `main` / `beta`. Diff scope: `RETENTION_INACTIVITY_AUDIT.md` only (no product code changes).  
> Purpose: Establish ground truth from the codebase on what scheduled jobs, notifications, calendar sweeps, and UI flows do when a member stops logging for 7 and 14 days.

---

## Executive Summary

| Area | What the Product Does Today | Key Code References |
|---|---|---|
| **Scheduled Sender** | Exactly one cron route exists that sends notifications: `webapp/app/api/cron/notify/route.ts`. The other four cron routes (`purge-deletions`, `resweep-tiers`, `sync-exercise-catalog`, `verify-food-queue`) send zero messages. | `webapp/app/api/cron/notify/route.ts:93` |
| **Inactivity-Keyed Notifications** | Only **two** notification sweeps check inactivity: (1) **Streak at-risk** (23h–47h after last activity) and (2) **Re-engagement** (3+ days inactive, rate-limited to 7 days). | `webapp/app/api/cron/notify/route.ts:222-228, 706-726` |
| **The Re-Engagement Bug** | The re-engagement push (`webapp/app/api/cron/notify/route.ts:709-727`) requires `{ streakDays: 0 }`. Because no background job ever resets `UserProgress.streakDays` to 0 when a member goes quiet, **any member who ever had an active streak (`streakDays >= 1`) never matches the query and receives nothing**. *(FIXED 2026-10-14, PR #1999 — `webapp/lib/notifications/cronNotify.ts:184-207` `buildReEngagementFilter` selects on `lastActivityDate` alone without requiring `streakDays: 0`; called at `webapp/app/api/cron/notify/route.ts:721`)* | `webapp/app/api/cron/notify/route.ts:710, 721`, `webapp/lib/streak.ts:86-100`, `webapp/lib/notifications/cronNotify.ts:184-207` |
| **Day 7 Concrete Delivery** | **Push**: Re-engagement is blocked by `streakDays: 0`. Streak at-risk is past cutoff. Workout reminder fires **only if** today is a scheduled training day (names overdue count). Mind reminder and check-in reminder fire daily regardless of inactivity. Meal reminder fires only if ≥3 meals logged 7–10 days ago. Daily glance fires only if opted in. <br>**Email**: **Nothing**. <br>**In-app**: **Nothing** (no persistent notification inbox). | `webapp/app/api/cron/notify/route.ts:251-495, 601-754`, `webapp/models/User.ts:200` |
| **Day 14 Concrete Delivery** | **Push**: Same as Day 7, except meal reminder is definitively dead (0 meals in last 10 days; `count >= 3` fails). Workout reminder fires only if a session was scheduled for Day 14. Mind and check-in reminders fire daily. Re-engagement remains blocked by `streakDays: 0`. <br>**Email**: **Nothing**. <br>**In-app**: **Nothing**. | `webapp/app/api/cron/notify/route.ts:391-396, 710`, `webapp/models/User.ts:200` |
| **Welcome Back (Day 7 / 14)** | Returning members are greeted with an **alarming red card** on the dashboard (`NextWorkoutCard.tsx`: "X Incomplete Workouts" with red AlertCircle and "Do It" / "Skip" buttons) and a calendar littered with red dots (`bg-red-600`) and "Incomplete" badges for every missed session. No sessions are auto-rescheduled. | `webapp/components/NextWorkoutCard.tsx:142-190`, `webapp/app/dashboard/calendar/CalendarClient.tsx:192-196, 782` |
| **Streak on Return** | The streak is already lost. Freezes only auto-apply for a 1-day absence (`diff === 2`). A 7-day or 14-day absence resets `newStreak = 1` on the first new log. The streak tile temporarily shows stale unreset numbers until a new write occurs. *(FIXED 2026-10-14, PR #2002 — `webapp/app/api/streak/route.ts:38-51` evaluates `isStreakAlive` and serves `streakDays: 0` on read for lapsed streaks without altering DB state; tile no longer displays stale numbers).* | `webapp/lib/streak.ts:91-100`, `webapp/app/api/streak/route.ts:29-51` |
| **Delivery Blockers** | Missing push subscriptions (`PushSubscription.find` empty), missing `timezoneOffset` in DB queries, unconfigured APNs/FCM server credentials, and stale timezone offsets drifting across daylight saving time. Entitlements do **not** gate any notifications. | `webapp/lib/pushNotification.ts:63-65`, `webapp/lib/push/nativeSend.ts:199-207`, `webapp/app/api/cron/notify/route.ts:452, 614` |

---

## 1. What Fires, and When

Every scheduled notification originated by the server is handled in `webapp/app/api/cron/notify/route.ts`. The route is executed hourly (comment at `webapp/app/api/cron/notify/route.ts:252`). It calls `deliver()` (`webapp/app/api/cron/notify/route.ts:67-88`), which delegates to `sendPushToUser()` (`webapp/lib/pushNotification.ts:58-180`).

Below is the exhaustive inventory of every notification sweep in `webapp/app/api/cron/notify/route.ts`, what condition selects a recipient, and whether it keys on inactivity.

### 1.0 Slot State Maintenance (Not a Push)
- **Path**: `webapp/app/api/cron/notify/route.ts:130-148`
- **What it does**: Any scheduled workout slot dated >48h ago (`missedCutoff = now - 48h`, `webapp/app/api/cron/notify/route.ts:138`) with `status: 'scheduled'` is flipped in MongoDB to `status: 'missed'` via `Schedule.updateMany` (`webapp/app/api/cron/notify/route.ts:139-145`).
- **Inactivity key**: Directly affects inactive users by marking their unattended sessions as missed.

### 1.1 Daily Glance (`tag: 'daily-glance'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:151-213`
- **Recipient condition**:
  - Opt-in gate: `notificationPrefs.dailyGlance === true` (`webapp/app/api/cron/notify/route.ts:177`). (Default is undefined/off; off until explicitly toggled on).
  - Timezone filter: has `timezoneOffset` or `timezone` (`webapp/app/api/cron/notify/route.ts:178`).
  - Window: 06:00 to 09:00 local (`DAILY_GLANCE_START_HOUR = 6`, `DAILY_GLANCE_END_HOUR = 9` in `webapp/lib/notifications/cronNotify.ts:128-129`, checked at `webapp/app/api/cron/notify/route.ts:185`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:189`).
- **Payload**: Dynamic summary from `loadWidgetFeed()` and `buildDailyGlance()` (`webapp/app/api/cron/notify/route.ts:193-194`). Includes streak, today's workout, calories remaining, and mind module status.
- **Inactivity threshold**: **None**. It is a standing morning card for opted-in users, indifferent to inactivity.

### 1.2 Streak At-Risk (`tag: 'streak-at-risk'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:217-244`
- **Recipient condition**:
  - `streakDays: { $gte: 3 }` (`MIN_STREAK_DAYS_FOR_AT_RISK_NOTIFICATION = 3` in `webapp/lib/notifications/cronNotify.ts:153`, checked at `webapp/app/api/cron/notify/route.ts:227`).
  - `lastActivityDate` between 23h and 47h ago (`atRiskCutoff = now - 23h` at `webapp/app/api/cron/notify/route.ts:222`, `atRiskExpiry = now - 47h` at `webapp/app/api/cron/notify/route.ts:223`, query at `webapp/app/api/cron/notify/route.ts:228`).
  - `notificationPrefs.streakAtRisk !== false` (`webapp/app/api/cron/notify/route.ts:229`).
  - Cooldown: Not sent within the last 20 hours (`streakRateLimitCutoff = now - 20h` at `webapp/app/api/cron/notify/route.ts:224, 233`).
  - Local window: **None** ("any hour — urgent", comment at `webapp/app/api/cron/notify/route.ts:217`).
- **Payload**:
  - Title: `Don't break your ${u.streakDays}-day streak 🔥` (`webapp/app/api/cron/notify/route.ts:239`)
  - Body: `'Log a workout, mood, or weight to keep it alive.'` (`webapp/app/api/cron/notify/route.ts:240`)
  - URL: `'/dashboard'` (`webapp/app/api/cron/notify/route.ts:241`)
- **Inactivity threshold**: **Keys on 23 to 47 hours of inactivity**. Once a user has been quiet for ≥48 hours (Day 2+), they fall outside `$gte: atRiskExpiry` and this notification **never fires again**.

### 1.3 Workout Reminder (`tag: 'workout-reminder'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:251-385`
- **Recipient condition**:
  - User has a `Schedule` document with a workout scheduled in a ±36h window (`webapp/app/api/cron/notify/route.ts:253-264`).
  - User has an active/in-progress program matching the schedule (`isActiveProgramForSchedule` at `webapp/app/api/cron/notify/route.ts:292`).
  - `notificationPrefs.workoutReminder !== false` (`webapp/app/api/cron/notify/route.ts:289`).
  - Window: 07:00 to 11:00 local (`WORKOUT_REMINDER_START_HOUR = 7`, `WORKOUT_REMINDER_END_HOUR = 11` in `webapp/lib/notifications/cronNotify.ts:130-131`, checked at `webapp/app/api/cron/notify/route.ts:324`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:328-330`).
  - **Crucial gate**: Must have a workout scheduled for **TODAY** in local date (`keyed.filter((s) => s.status === 'scheduled' && s.key === userLocalDateKey).length > 0`, `webapp/app/api/cron/notify/route.ts:338-339`). If today is a rest day or has no scheduled slot, it skips.
- **Payload**:
  - Title: `"Today's workout is ready 💪"` (`webapp/app/api/cron/notify/route.ts:371`)
  - Body: `${named} · ${overdue} to catch up` if overdue > 0, else `${named}` (`webapp/app/api/cron/notify/route.ts:368`).
  - Overdue window: counts uncompleted slots from the prior 7 days (`CATCHUP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000` at `webapp/app/api/cron/notify/route.ts:354-356`).
- **Inactivity threshold**: **Does not key on inactivity**. It keys entirely on whether a session is scheduled on today's calendar date. A member inactive for 7 or 14 days will receive it on those days if and only if those days are designated training days in their schedule.

### 1.4 Meal-Log Reminder (`tag: 'meal-reminder'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:386-440`
- **Recipient condition**:
  - Activity gate: User must have logged **≥3 meals in the last 10 days** (`MealLog.aggregate` matching `loggedAt >= now - 10 days` with `count >= 3`, `webapp/app/api/cron/notify/route.ts:391-395`).
  - `notificationPrefs.mealReminder !== false` (`webapp/app/api/cron/notify/route.ts:403`).
  - Window: 17:00 to 20:00 local (5pm–8pm, `webapp/app/api/cron/notify/route.ts:406`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:410`).
  - Silence gate: Zero meals logged in the user's local today (`loggedToday` is false, `webapp/app/api/cron/notify/route.ts:417-421`).
- **Payload**:
  - Title: `'Log today\'s food 🍽️'` (`webapp/app/api/cron/notify/route.ts:424`)
  - Body: `'A quick log keeps your nutrition picture honest. It takes 30 seconds.'` (`webapp/app/api/cron/notify/route.ts:425`)
  - URL: `'/dashboard/nutrition'` (`webapp/app/api/cron/notify/route.ts:426`)
- **Inactivity threshold**: **Inverted / anti-inactivity gate**. Requires active logging (≥3 meals in prior 10 days). If a user has been inactive for >10 days, they are excluded. On Day 7, they qualify only if they logged ≥3 meals between 7 and 10 days ago. On Day 14, they are 100% excluded.

### 1.5 Daily Mind Session Reminder (`tag: 'mind-reminder'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:441-506`
- **Recipient condition**:
  - `notificationPrefs.mindReminder !== false` (`webapp/app/api/cron/notify/route.ts:451`).
  - Database filter: `timezoneOffset: { $exists: true }` (`webapp/app/api/cron/notify/route.ts:452`).
  - Window: 08:00 to 11:00 local (`MIND_REMINDER_START_HOUR = 8`, `MIND_REMINDER_END_HOUR = 11` in `webapp/lib/notifications/cronNotify.ts:134-135`, checked at `webapp/app/api/cron/notify/route.ts:458`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:464`).
  - Gate: Today's session not completed (`MindSession.exists` for today is false, `webapp/app/api/cron/notify/route.ts:473-474`).
  - Gate: Main session available off 20h cooldown (`mainSessionAvailable(mind?.lastMainSessionAt, now.getTime())`, `webapp/app/api/cron/notify/route.ts:481`).
- **Payload**:
  - Title: `started ? "Today's mindset module is ready 🧠" : 'Start your first session 🧠'` (`webapp/app/api/cron/notify/route.ts:489`)
  - Body: `started ? 'A few minutes on your mindset before the day takes over.' : 'Five minutes to set how today goes. Begin the path.'` (`webapp/app/api/cron/notify/route.ts:490-492`)
  - URL: `'/dashboard/mind'` (`webapp/app/api/cron/notify/route.ts:493`)
- **Inactivity threshold**: **None**. It fires every single morning indefinitely for all quiet members with a stored `timezoneOffset`.

### 1.6 Super Streak At Risk (`tag: 'super-streak-at-risk'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:507-549`
- **Recipient condition**:
  - `notificationPrefs.superStreakAtRisk !== false` (`webapp/app/api/cron/notify/route.ts:514`).
  - `timezoneOffset: { $exists: true }` (`webapp/app/api/cron/notify/route.ts:515`).
  - Window: 16:00 to 21:00 local (`SUPER_AT_RISK_START_HOUR = 16`, `SUPER_AT_RISK_END_HOUR = 21` in `webapp/lib/streaks/tile.ts:167`, checked at `webapp/app/api/cron/notify/route.ts:521`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:524`).
  - Streak evaluation: `superAtRisk(streaks, userLocalHour)` must return `atRisk: true` (`webapp/app/api/cron/notify/route.ts:530-531`).
  - In `webapp/lib/streaks/tile.ts:165`, if `sup.current < STREAK_VISIBLE_MIN` (3), it returns `atRisk: false`.
- **Inactivity threshold**: **Requires live streak yesterday**. If yesterday was not completed, `dayStreak` (`webapp/lib/streaks/pillars.ts:76-81`) computes `current = 0`, so `sup.current < 3` and this notification **never fires** for someone inactive for 7 or 14 days.

### 1.7 Goal Nudges (`tag: 'goal-nudge'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:550-600`
- **Recipient condition**:
  - `notificationPrefs.goalNudge !== false` (`webapp/app/api/cron/notify/route.ts:559`).
  - `timezoneOffset: { $exists: true }` (`webapp/app/api/cron/notify/route.ts:560`).
  - Window: 17:00 to 20:00 local (`GOAL_NUDGE_START_HOUR = 17`, `GOAL_NUDGE_END_HOUR = 20` in `webapp/lib/notifications/cronNotify.ts:138-139`, checked at `webapp/app/api/cron/notify/route.ts:566`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:569`).
  - Nudge selection: `computeGoalProgress()` and `pickGoalNudge()` (`webapp/app/api/cron/notify/route.ts:573-581`).
  - Severity must be `'warn'` or `'nudge'` (`webapp/lib/goals/suggestions.ts:102`).
  - Key cooldown: 3 days (`GOAL_NUDGE_KEY_COOLDOWN_DAYS = 3` in `webapp/lib/notifications/cronNotify.ts:141`, checked at `webapp/lib/goals/suggestions.ts:105-106`).
- **Potential triggers during inactivity**:
  - `nutrition.log`: "Log more days" ("X of Y days logged — you're aiming for Z. Trend needs data.") (`webapp/lib/goals/suggestions.ts:46`).
  - `training.consistency`: "Averaging X/wk against Y" ("The target may be too high for this season, or the schedule needs protecting.") (`webapp/lib/goals/suggestions.ts:79`).
- **Inactivity threshold**: Indirect. When logging ceases, adherence drops, triggering `'nutrition.log'` or `'training.consistency'`. Fired at most once every 3 days.

### 1.8 Daily Check-In Reminder (`tag: 'checkin-reminder'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:601-655`
- **Recipient condition**:
  - `notificationPrefs.checkInReminder !== false` (`webapp/app/api/cron/notify/route.ts:613`).
  - `timezoneOffset: { $exists: true }` (`webapp/app/api/cron/notify/route.ts:614`).
  - Window: 12:00 to 16:00 local (`CHECK_IN_REMINDER_START_HOUR = 12`, `CHECK_IN_REMINDER_END_HOUR = 16` in `webapp/lib/notifications/cronNotify.ts:147-148`, checked at `webapp/app/api/cron/notify/route.ts:620`).
  - Rate limit: Once per local calendar day (`webapp/app/api/cron/notify/route.ts:624`).
  - Gate: Check-in not logged or skipped today (`checkInFactsForToday` at `webapp/app/api/cron/notify/route.ts:626-631`).
- **Payload**:
  - Title: `'Time for your check-in 📝'` (`webapp/app/api/cron/notify/route.ts:640`)
  - Body: `'A quick mood + weight check-in — takes 10 seconds.'` (`webapp/app/api/cron/notify/route.ts:634`)
  - URL: `'/dashboard'` (`webapp/app/api/cron/notify/route.ts:642`)
- **Inactivity threshold**: **None**. Fires daily between 12pm and 4pm local for any inactive member who has a stored `timezoneOffset`.

### 1.9 Program With No Schedule (`tag: 'schedule-setup'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:656-703`
- **Recipient condition**:
  - Member has an active program (`activePrograms.status: 'active' | 'in-progress'`, `webapp/app/api/cron/notify/route.ts:661`), but **no Schedule document exists** (`webapp/app/api/cron/notify/route.ts:672`).
  - Window: 07:00 to 11:00 local (`webapp/app/api/cron/notify/route.ts:681`).
  - Rate limit: Weekly (`weekAgo = now - 7 days`, `webapp/app/api/cron/notify/route.ts:674, 688`).
- **Payload**:
  - Title: `'Your program has no training days yet 📅'` (`webapp/app/api/cron/notify/route.ts:691`)
  - Body: `'Pick the days you train and we will keep you on track from there.'` (`webapp/app/api/cron/notify/route.ts:692`)
  - URL: `'/dashboard/calendar'` (`webapp/app/api/cron/notify/route.ts:693`)
- **Inactivity threshold**: **None**. Rate-limited to once every 7 days until a schedule is created.

### 1.10 Re-Engagement Push (`tag: 're-engagement'`)
- **Path**: `webapp/app/api/cron/notify/route.ts:704-754`
- **Recipient condition**:
  - Database filter (`webapp/app/api/cron/notify/route.ts:709-727`):
    ```ts
    const lapsedUsers = await UserProgress.find({
      streakDays: 0,
      'notificationPrefs.reEngagement': { $ne: false },
      $and: [
        {
          $or: [
            { lastActivityDate: { $exists: false } },
            { lastActivityDate: { $lte: reEngageCutoff } },
          ],
        },
        {
          $or: [
            { 'lastPushSentAt.reEngagement': { $exists: false } },
            { 'lastPushSentAt.reEngagement': null },
            { 'lastPushSentAt.reEngagement': { $lte: reEngageRateLimit } },
          ],
        },
      ],
    }).select('userId timezoneOffset').lean()
    ```
  - Inactivity cutoff: `reEngageCutoff = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)` (3 days inactive, `webapp/app/api/cron/notify/route.ts:706, 716`).
  - Rate limit: `reEngageRateLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)` (at most once every 7 days, `webapp/app/api/cron/notify/route.ts:707, 723`).
  - Window: 12:00 to 18:00 local (`REENGAGEMENT_START_HOUR = 12`, `REENGAGEMENT_END_HOUR = 18` in `webapp/lib/notifications/cronNotify.ts:142-143`, checked at `webapp/app/api/cron/notify/route.ts:735`).
- **Payload**:
  - Title: `'We miss you 👋'` (`webapp/app/api/cron/notify/route.ts:740`)
  - Body: `'Come back and keep building your best self.'` (`webapp/app/api/cron/notify/route.ts:741`)
  - URL: `'/dashboard'` (`webapp/app/api/cron/notify/route.ts:742`)
- **Inactivity threshold**: Formally **3+ days of inactivity**.
- **The Execution Dead-End**: Because line 710 filters strictly on `streakDays: 0`, and no process in the codebase ever sets `streakDays: 0` on an existing member after they lapse, **this sweep only matches brand-new accounts that never logged a single activity**. Any member who previously logged and accumulated `streakDays >= 1` has a positive number stored in MongoDB, fails the `{ streakDays: 0 }` filter, and **is permanently excluded from re-engagement**. *(FIXED 2026-10-14, PR #1999 — `webapp/lib/notifications/cronNotify.ts:184-207` `buildReEngagementFilter` removed the `streakDays: 0` requirement, selecting on `lastActivityDate` alone (`$exists: false` or `<= now - 3 days`) with the pref gate and 7-day rate limit; invoked in `webapp/app/api/cron/notify/route.ts:721`. Also fixed IANA timezone omission: `webapp/app/api/cron/notify/route.ts:725-728` now selects `timezone` as well as `timezoneOffset` and resolves local hour via `localHourForUser(now, u.timezoneOffset, u.timezone)`).*

---

## 2. Day 7 and Day 14, Concretely

For a member whose last logged activity was exactly 7 days ago, or 14 days ago, here is what they receive across channels:

### Day 7 (Last Logged 7 Days Ago)

| Channel | Notification | What Happens & Exact Copy |
|---|---|---|
| **Push** | **Re-engagement** (`'We miss you 👋'`) | **NOTHING** for any user who ever logged an activity (blocked by `streakDays: 0` in `webapp/app/api/cron/notify/route.ts:710`). Only an unactivated user with 0 logs and a stored `timezoneOffset` could receive: Title: `'We miss you 👋'`, Body: `'Come back and keep building your best self.'` (`webapp/app/api/cron/notify/route.ts:740-741`). |
| **Push** | **Streak At-Risk** | **NOTHING**. Lapsed 168 hours ago; falls far outside the 47-hour cutoff (`atRiskExpiry = now - 47h`, `webapp/app/api/cron/notify/route.ts:223, 228`). |
| **Push** | **Workout Reminder** | **CONDITIONAL**. If Day 7 is a scheduled training day in their active program (`webapp/app/api/cron/notify/route.ts:338`): receives push at 07:00–11:00 local: Title: `"Today's workout is ready 💪"`, Body: `"${named} · ${overdue} to catch up"` (`webapp/app/api/cron/notify/route.ts:368-371`). If Day 7 is a rest day or program has ended: **NOTHING**. |
| **Push** | **Mind Reminder** | **YES**. Fires between 08:00 and 11:00 local: Title: `"Today's mindset module is ready 🧠"`, Body: `'A few minutes on your mindset before the day takes over.'` (`webapp/app/api/cron/notify/route.ts:489-491`). (Provided `timezoneOffset` exists). |
| **Push** | **Check-in Reminder** | **YES**. Fires between 12:00 and 16:00 local: Title: `'Time for your check-in 📝'`, Body: `'A quick mood + weight check-in — takes 10 seconds.'` (`webapp/app/api/cron/notify/route.ts:640-642`). (Provided `timezoneOffset` exists). |
| **Push** | **Meal-Log Reminder** | **CONDITIONAL**. Fires at 17:00–20:00 local **only if** the member logged ≥3 meals between 7 and 10 days ago (`webapp/app/api/cron/notify/route.ts:391-395`). If yes: Title: `'Log today\'s food 🍽️'`, Body: `'A quick log keeps your nutrition picture honest. It takes 30 seconds.'` (`webapp/app/api/cron/notify/route.ts:424-425`). Otherwise: **NOTHING**. |
| **Push** | **Goal Nudge** | **CONDITIONAL**. If goals configured, fires at 17:00–20:00 local: Title: `'Log more days'`, Body: `'X of Y days logged — you\'re aiming for Z. Trend needs data.'` (`webapp/lib/goals/suggestions.ts:46`), provided it has not fired in the last 3 days (`webapp/app/api/cron/notify/route.ts:580`). |
| **Push** | **Super Streak At-Risk**| **NOTHING**. Current streak is 0; `superAtRisk` requires `sup.current >= 3` (`webapp/lib/streaks/tile.ts:165`). |
| **Push** | **Daily Glance** | **NOTHING** by default. Only fires (06:00–09:00 local) if user explicitly opted in (`notificationPrefs.dailyGlance: true`, `webapp/app/api/cron/notify/route.ts:177`). |
| **Email** | **Any Email** | **NOTHING**. Become sends zero re-engagement or inactivity emails (`webapp/models/User.ts:200`). `sendStreakAtRiskEmail` in `webapp/lib/email.ts:233` is dead code with no callers. |
| **In-App**| **Notification Center / Inbox** | **NOTHING**. No in-app notification inbox or persistent notification store exists in the product. |

---

### Day 14 (Last Logged 14 Days Ago)

| Channel | Notification | What Happens & Exact Copy |
|---|---|---|
| **Push** | **Re-engagement** (`'We miss you 👋'`) | **NOTHING** for any user who ever logged (blocked by `streakDays: 0` in `webapp/app/api/cron/notify/route.ts:710`). |
| **Push** | **Streak At-Risk** | **NOTHING** (past 47h cutoff). |
| **Push** | **Meal-Log Reminder** | **NOTHING**. In the last 10 days, 0 meals were logged (`loggedAt >= now - 10 days`). `count >= 3` fails (`webapp/app/api/cron/notify/route.ts:395`). The reminder is completely silenced. |
| **Push** | **Workout Reminder** | **CONDITIONAL**. Fires at 07:00–11:00 local **only if** Day 14 is a scheduled workout on the calendar. If so, names today's workout plus overdue count from the prior 7 days (`webapp/app/api/cron/notify/route.ts:354-368`). If Day 14 is a rest day or the program schedule ran out of slots: **NOTHING**. |
| **Push** | **Mind Reminder** | **YES**. Fires between 08:00 and 11:00 local: Title: `"Today's mindset module is ready 🧠"`, Body: `'A few minutes on your mindset before the day takes over.'` (`webapp/app/api/cron/notify/route.ts:489-491`). |
| **Push** | **Check-in Reminder** | **YES**. Fires between 12:00 and 16:00 local: Title: `'Time for your check-in 📝'`, Body: `'A quick mood + weight check-in — takes 10 seconds.'` (`webapp/app/api/cron/notify/route.ts:640-642`). |
| **Push** | **Goal Nudge** | **CONDITIONAL**. May fire `'nutrition.log'` ("Log more days") or `'training.consistency'` ("Averaging X/wk against Y") at 17:00–20:00 local if off 3-day cooldown (`webapp/lib/goals/suggestions.ts:46, 79`). |
| **Push** | **Super Streak At-Risk**| **NOTHING**. |
| **Push** | **Daily Glance** | **NOTHING** unless opted in. |
| **Email** | **Any Email** | **NOTHING**. Zero emails sent. |
| **In-App**| **Notification Center / Inbox** | **NOTHING**. |

---

## 3. What the Member Sees When They Come Back

When a member opens the app after 7 or 14 days of silence, the interface presents the following state:

### 3.1 The Dashboard & Streak
1. **The Streak Tile Displays Stale Data Initially**:
   - `webapp/app/dashboard/DashboardClient.tsx:274` calls `GET /api/streak`.
   - `webapp/app/api/streak/route.ts:29-45` reads `progress.streakDays ?? 0` directly from the database and returns it.
   - Because no cron resets `UserProgress.streakDays` in MongoDB during inactivity, the tile initially renders the **old, un-lapsed streak count** (e.g., "12 day streak") upon first loading the dashboard.
   - However, `activityToday` returns `false` (`webapp/app/api/streak/route.ts:32`).
   - If the multi-pillar streak view (`computeStreaks` in `webapp/lib/streaks/compute.ts:172-185`) is rendered, computed pillar streaks (workout, nutrition, mindset, super) evaluate `dayStreak` (`webapp/lib/streaks/pillars.ts:75-81`) as `0` because neither today nor yesterday was active.
   - *(FIXED 2026-10-14, PR #2002 — `webapp/app/api/streak/route.ts:38-51` computes `callerToday = new Date(Date.now() - tzOffset * 60_000)` and `alive = isStreakAlive(...)`, returning `streakDays: alive ? storedStreakDays : 0` on read without mutating MongoDB; `GET /api/streak` no longer renders the old un-lapsed count).*
2. **Streak Freezes & The Streak Is Already Lost**:
   - In `webapp/lib/streak.ts:86-100`:
     ```ts
     const diff = lastActivity ? daysDiff(lastActivity, today) : 999
     let newStreak = progress.streakDays ?? 0
     ...
     if (diff === 1) {
       newStreak += 1
     } else if (diff === 2 && freezes > 0) {
       newStreak += 1
       freezes -= 1
       freezeUsed = true
     } else {
       newStreak = 1
     }
     ```
   - Freezes **only** apply when `diff === 2` (exactly one day missed).
   - For a 7-day (`diff = 7`) or 14-day (`diff = 14`) lapse, `diff > 2`. Freezes **cannot** bridge the gap. Even if the member holds 2 freezes (the max, `MAX_FREEZES = 2` in `webapp/lib/streakConstants.ts:2`), no freeze is consumed.
   - The moment the member logs their first workout, meal, mood, or weight entry upon returning, `newStreak` resets immediately to **1**. The streak was already broken; logging merely acknowledges the reset.

### 3.2 The Next Workout Card on the Dashboard
- `webapp/components/NextWorkoutCard.tsx:42-120` fetches schedule entries for the window `[-14 days, +14 days]` via `/api/schedule`.
- Every workout slot older than 48 hours has already been marked `status: 'missed'` by the cron (`webapp/app/api/cron/notify/route.ts:139-145`).
- `webapp/components/NextWorkoutCard.tsx:142-190` renders a prominent, red-styled warning card:
  - Container: `Card` with `accent="danger"` and class `!border-red-200 !bg-red-50 dark:!border-red-900/40 dark:!bg-red-950/20` (`webapp/components/NextWorkoutCard.tsx:144-145`).
  - Header: AlertCircle red icon + `"{missedWorkouts.length} Incomplete {missedWorkouts.length === 1 ? 'Workout' : 'Workouts'}"` in `text-red-700` (`webapp/components/NextWorkoutCard.tsx:148-151`).
  - Top link: `"View all"` linking to `/dashboard/calendar` (`webapp/components/NextWorkoutCard.tsx:153-156`).
  - Displays the first 2 missed sessions (`displayDate — dayLabel: workoutTitle`), each with two buttons:
    - Red **"Do It"** button linking to the workout form: `/dashboard/workout/${w.programId}/workout?day=${w.dayLabel}&sd=${w.date}` (`webapp/components/NextWorkoutCard.tsx:167-172`).
    - **"Skip"** button which triggers `PATCH /api/schedule` with `action: 'skip'` (`webapp/components/NextWorkoutCard.tsx:174-183`).
  - If more than 2 workouts were missed (the typical case after 7 or 14 days):
    `"+{missedWorkouts.length - 2} more in calendar"` displayed in `text-xs text-red-500` (`webapp/components/NextWorkoutCard.tsx:188-190`).
- Below this missed banner, if an upcoming session exists on or after today, the card shows "Up Next" with a blue dumbbell icon (`webapp/components/NextWorkoutCard.tsx:193-228`).

### 3.3 Schedule and Calendar Backlog
- **Does a program leave a fortnight of missed sessions behind?** **YES**.
- In `webapp/app/api/schedule/route.ts:96-97`:
  `// Otherwise there's outstanding (missed) work — leave it dated where it actually fell due (reflow only lays out sessions that never got a slot at all; see reflowStuckSchedule).`
- `reflowStuckSchedule` (`webapp/lib/schedule.ts:204-245`) explicitly skips sessions that already have slots assigned. It only schedules new slots when an active program runs completely out of future dates.
- In `webapp/app/dashboard/calendar/CalendarClient.tsx`:
  - Every missed day over the 7 or 14 days displays a solid red dot: `w.status === 'missed' ? 'bg-red-600'` (`webapp/app/dashboard/calendar/CalendarClient.tsx:782`).
  - The day detail shows a badge with an X icon: `<X className="h-2.5 w-2.5" /> Incomplete` in `bg-red-600 text-white` (`webapp/app/dashboard/calendar/CalendarClient.tsx:192-196`).
  - Clicking any missed session shows a "Make Up" link to execute the workout (`webapp/app/dashboard/calendar/CalendarClient.tsx:1049-1054`).
- **Result**: The calendar is full of red "Incomplete" dots for the entire duration of the absence.

### 3.4 In-App Greeting & Nudge Copy
1. **Daily Check-In Modal (`webapp/components/DailyCheckInModal.tsx`)**:
   - Triggers automatically when `checkInDue` is true (`webapp/app/dashboard/DashboardClient.tsx:551-553`).
   - Header greeting: Time-based from `getTimeBasedGreeting()` (`webapp/components/DailyCheckInModal.tsx:138-189`):
     `"Good morning!"`, `"Good afternoon!"`, `"Good evening!"`, or `"Good night!"`.
   - Subtitle: `"Daily check-in — all fields optional"` (`webapp/components/DailyCheckInModal.tsx:552`).
   - **Inactivity Warning Tags** (`webapp/components/DailyCheckInModal.tsx:252-257`):
     - Function `getWarningInfo(days)`:
       - If `days >= 10`: `{ level: 'critical', color: 'text-red-600 dark:text-red-400', message: `${days}+ days` }` (`webapp/components/DailyCheckInModal.tsx:253`).
       - If `days >= 7`: `{ level: 'high', color: 'text-orange-600 dark:text-orange-400', message: '7 days' }` (`webapp/components/DailyCheckInModal.tsx:256`).
     - Shown directly above the Mood selector (`webapp/components/DailyCheckInModal.tsx:562`):
       - On Day 7: **`"7 days since last log"`** (in orange `text-orange-600`).
       - On Day 14: **`"14+ days since last log"`** (in red `text-red-600`).
     - Shown directly above the Weight input (`webapp/components/DailyCheckInModal.tsx:608`):
       - On Day 7: **`"7 days since last log"`**.
       - On Day 14: **`"14+ days since last log"`**.
   - **Skip Confirmation Modal (`webapp/components/DailyCheckInModal.tsx:450-498`)**:
     - If the returning member clicks "Skip for Today", a confirmation dialog intercepts:
       - Header: `"Skip Check-in?"` (`webapp/components/DailyCheckInModal.tsx:476`)
       - Text: `"You haven't logged anything today. Are you sure you want to skip?"` (`webapp/components/DailyCheckInModal.tsx:481`)
       - Warning items:
         - `Mood`: `"Last logged: 7 days ago"` (or `"14+ days ago"`) (`webapp/components/DailyCheckInModal.tsx:488`)
         - `Weight`: `"Last logged: 7 days ago"` (or `"14+ days ago"`) (`webapp/components/DailyCheckInModal.tsx:488`)
2. **Program Nudge Modal (`webapp/components/ProgramNudgeModal.tsx`)**:
   - Does **not** show if the member is enrolled in a program (`due: enrolled ? false : shouldShowNudge(state)` in `webapp/app/api/program-nudge/route.ts:38`).
   - If unenrolled: asks `"Ready to start a training program?"` (`webapp/components/ProgramNudgeModal.tsx:62`).
3. **Resume Workout Button (`webapp/components/ResumeWorkoutButton.tsx`)**:
   - Renders only when there is an active workout log in progress for *today* (`webapp/app/dashboard/DashboardClient.tsx:802-804`). For an inactive returning member, this does not render.

---

## 4. What Blocks Delivery Today

Only factors directly demonstrable in code are cited below:

### 4.1 Missing Push Subscription
- **Where**: `webapp/lib/pushNotification.ts:63-65`
  ```ts
  const subs = await PushSubscription.find({ userId }).lean()
  if (subs.length === 0) return result
  ```
- **Impact**: If a user has never granted push notification permissions in their browser or mobile app, `subs.length === 0`. The send function terminates immediately with `attempted: 0, delivered: 0, noSubscription: 1`. In `webapp/app/api/cron/notify/route.ts:85`, `t.noSubscription++` is incremented. No push can reach them.
- **Dead token pruning**:
  - Web: HTTP 404/410 status codes immediately prune the subscription from MongoDB (`webapp/lib/pushNotification.ts:110-114`).
  - APNs (iOS): HTTP 410 or reasons `Unregistered` or `ExpiredToken` prune the token (`webapp/lib/push/nativeSend.ts:107-124`).
  - FCM (Android): `outcome.kind === 'unregistered'` prunes the token (`webapp/lib/push/nativeSend.ts:160-163`).

### 4.2 Missing Stored Timezone / TimezoneOffset
- **Where**: `webapp/app/api/cron/notify/route.ts` and `webapp/lib/notifications/cronNotify.ts:26-44`
- **Impact**:
  1. **MongoDB query-level exclusion**: Several sweeps explicitly require `timezoneOffset: { $exists: true }` in their Mongoose queries:
     - Mind reminder: `webapp/app/api/cron/notify/route.ts:452`
     - Super streak at risk: `webapp/app/api/cron/notify/route.ts:515`
     - Goal nudges: `webapp/app/api/cron/notify/route.ts:560`
     - Daily check-in reminder: `webapp/app/api/cron/notify/route.ts:614`
     Any user without a numeric `timezoneOffset` stored on their `UserProgress` document is completely filtered out of the MongoDB query.
  2. **Re-engagement timezone query omission**:
     - `webapp/app/api/cron/notify/route.ts:724`: `.select('userId timezoneOffset').lean()`
     - `webapp/app/api/cron/notify/route.ts:726`: `const userLocalHour = localHourForUser(now, u.timezoneOffset)`
     - Unlike other sweeps that pass `progress?.timezone`, re-engagement selects **only** `timezoneOffset` and does **not** pass `timezone`. If a user only has an IANA timezone string (e.g. from `/api/me/timezone`), `localHourForUser` returns `null` (`webapp/lib/notifications/cronNotify.ts:32`), and line 732 skips them (`results.skippedByWindow++`).
  3. **Daylight Saving Time (DST) drift**:
     - As documented in `webapp/lib/notifications/cronNotify.ts:16-19`, `timezoneOffset` is a static snapshot taken when the member last opened the client. If daylight saving time changes while a member is quiet, their stored offset is permanently off by 60 minutes until they reopen the app. This shifts their local hour computation and can cause sweeps to miss their delivery window.

### 4.3 Native Device Delivery Barriers
- **Where**: `webapp/lib/push/nativeSend.ts:186-207`
- **Impact**:
  1. **Unconfigured credentials**: If `push.apns` or `push.fcm` is missing from runtime secrets, native sends are skipped entirely with a logged warning (`webapp/lib/push/nativeSend.ts:199-204`).
  2. **Legacy Expo tokens**: Tokens formatted as Expo push tokens (`ExponentPushToken[...]`) are filtered out by `isExpoPushToken(row.endpoint)` and pruned as dead (`webapp/lib/push/nativeSend.ts:192-196`).
  3. **APNs Environment mismatch**: A token registered on a sandbox build sent to production APNs (or vice versa) returns HTTP 400 `BadDeviceToken`. While `sendOneApns` attempts the opposite environment (`webapp/lib/push/nativeSend.ts:120-124`), if both fail the token is marked dead and pruned (`webapp/lib/push/nativeSend.ts:123, 131-133`).

### 4.4 Entitlement Gates (Subscription / Pro Status)
- **Where**: `webapp/app/api/cron/notify/route.ts`
- **Code reality**: **ZERO notifications are gated on entitlements or subscription tiers**.
  - A comprehensive search of `webapp/app/api/cron/notify/route.ts` confirms that neither `entitlements`, `subscriptionTier`, `tier`, `isPro`, nor Stripe checks exist in the notification pipeline. Free members and paid members have identical notification paths.

### 4.5 The Inactivity Re-Engagement Bug
- **Where**: `webapp/app/api/cron/notify/route.ts:710`
- **Code reality**:
  ```ts
  const lapsedUsers = await UserProgress.find({
    streakDays: 0,
    'notificationPrefs.reEngagement': { $ne: false },
    ...
  ```
- `streakDays: 0` blocks delivery to every inactive user who has ever completed an onboarding action. Because `streakDays` in MongoDB is never reset by cron, it remains at whatever positive value it had when they went quiet. They never match `{ streakDays: 0 }`.
- *(FIXED 2026-10-14, PR #1999 — `webapp/lib/notifications/cronNotify.ts:184-207` `buildReEngagementFilter` eliminates the `streakDays: 0` filter and keys strictly on `lastActivityDate` (`$exists: false` or `<= now - 3 days`), wired in `webapp/app/api/cron/notify/route.ts:721`)*

---

## 5. What's Missing (Gaps Only)

This list contains gaps identified strictly from code analysis. No redesigns or feature recommendations are included.

1. **No background streak expiration to 0**: There is no scheduled worker or cron route that resets `UserProgress.streakDays` to 0 when 48+ hours elapse without activity. `streakDays` only updates upon write when `recordStreakActivity` is invoked (`webapp/lib/streak.ts:86-100`).
2. **Re-engagement query dead lock**: `webapp/app/api/cron/notify/route.ts:710` requires `streakDays: 0`, preventing any lapsed member with prior activity from qualifying for the re-engagement push. *(FIXED 2026-10-14, PR #1999 — `webapp/lib/notifications/cronNotify.ts:184-207` `buildReEngagementFilter`, called in `webapp/app/api/cron/notify/route.ts:721`, removes the `streakDays: 0` requirement, filtering on `lastActivityDate` alone).*
3. **Re-engagement ignores IANA timezone**: `webapp/app/api/cron/notify/route.ts:724-726` does not select `timezone` and does not pass it to `localHourForUser`, dropping quiet members who possess an IANA `timezone` but lack a numeric `timezoneOffset`. *(FIXED 2026-10-14, PR #1999 — `webapp/app/api/cron/notify/route.ts:725-728` now selects `.select('userId timezoneOffset timezone')` and calls `localHourForUser(now, u.timezoneOffset, u.timezone)`, which prefers IANA timezone via `partsInZone` at `webapp/lib/notifications/cronNotify.ts:31-37`).*
4. **Zero email re-engagement or lifecycle emails**: There are no scheduled jobs or cron routes that send emails to quiet members. `sendStreakAtRiskEmail` in `webapp/lib/email.ts:233` is uncalled dead code (`webapp/tests/unit/email/canSpam.test.ts:75`).
5. **No 7-day or 14-day dedicated inactivity triggers**: No notifications or copy in `webapp/app/api/cron/notify/route.ts` are keyed to 7-day or 14-day inactivity thresholds.
6. **No automatic schedule reflow or calendar shifting**: Unperformed workouts remain permanently timestamped on their historical dates as `missed` (`webapp/app/api/schedule/route.ts:96-97`). There is no mechanism to shift missed sessions forward or recalculate a program timeline upon return.
7. **Negative returning UX in dashboard and calendar**: Returning members are greeted with an "X Incomplete Workouts" danger alert (`webapp/components/NextWorkoutCard.tsx:142-190`) and red dots across their calendar (`webapp/app/dashboard/calendar/CalendarClient.tsx:782`).
8. **In-app check-in shame copy**: Returning members are shown `"7 days since last log"` / `"14+ days since last log"` in warning colors (`webapp/components/DailyCheckInModal.tsx:252-257, 562, 608`), and a confirmation dialog on skip states `"Last logged: 7 days ago"` / `"14+ days ago"` (`webapp/components/DailyCheckInModal.tsx:488`).
9. **Inconsistent timezone filtering in cron queries**: `mindReminder` (`webapp/app/api/cron/notify/route.ts:452`), `superStreakAtRisk` (`webapp/app/api/cron/notify/route.ts:515`), `goalNudge` (`webapp/app/api/cron/notify/route.ts:560`), and `checkInReminder` (`webapp/app/api/cron/notify/route.ts:614`) query `timezoneOffset: { $exists: true }`, dropping users who only have `timezone` recorded.
10. **DST offset staleness for quiet members**: Inactive users who cross a daylight saving time transition suffer from drifted `timezoneOffset` values until they open the app (`webapp/lib/notifications/cronNotify.ts:16-19`).
11. **No persistent in-app notification center**: Notifications are sent via push only; there is no notification inbox or notification history model in the database (`webapp/models/`).

### What Was Checked and Not Determined From Code
- **External Cron Trigger Schedule**: Checked `apphosting.yaml`, `firebase.json`, `package.json`, and `.github/` workflows for the external cron invocation frequency. While code comments state *"Cron runs hourly"* (`webapp/app/api/cron/notify/route.ts:252`), the actual schedule trigger (e.g. Cloud Scheduler, external curl cron) is hosted outside this repository and could not be determined from code.
- **Production Push Delivery Rates & Token Health**: Checked `webapp/lib/pushNotification.ts` and `webapp/lib/push/nativeSend.ts`. While delivery counters and error logging exist in code, actual delivery success percentages and subscription counts are production database state and cannot be determined from code.
