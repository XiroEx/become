# The Live Nudge Inventory

Every row below is already shipping. Source of truth:
`webapp/app/api/cron/notify/route.ts` (the scheduled job),
`webapp/lib/notifications/cronNotify.ts` (windows and timezone helpers),
`webapp/app/api/notifications/preferences/route.ts` (the preference keys and defaults),
`webapp/lib/pushNotification.ts` (VAPID delivery, dead-subscription pruning).

**Read this before proposing a new nudge.** Nine already compete for the same tray.

---

## The shipped set

| Nudge | Pref key | Local window | Trigger | `tag` | Destination |
|---|---|---|---|---|---|
| Workout reminder | `workoutReminder` | 07:00-11:00 | Scheduled slot today, active program, not yet logged | `workout-reminder` | `/dashboard/calendar` |
| Mind reminder | `mindReminder` | 08:00-11:00 | Mind module available today, not started | `mind-reminder` | `/dashboard/mind` |
| Meal reminder | `mealReminder` | 17:00-20:00 | No food logged today, and the user has logged ≥3 meals in the last 10 days | `meal-reminder` | `/dashboard/nutrition` |
| Check-in reminder | `checkInReminder` | 12:00-16:00 | No mood or weight entry today | `checkin-reminder` | `/dashboard` |
| Re-engagement | `reEngagement` | 12:00-18:00 | Extended inactivity | `re-engagement` | `/dashboard` |
| Goal nudge | `goalNudge` | 17:00-20:00 | Goal-specific state, 3-day per-key cooldown | `goal-nudge` | varies by goal |
| Streak at risk | `streakAtRisk` | **Any hour** — no local-hour gate exists | Live streak, nothing logged today, 20h per-key cooldown | `streak-at-risk` | `/dashboard` |
| Super streak at risk | `superStreakAtRisk` | Evening | Multi-pillar streak at risk | `super-streak-at-risk` | `/dashboard/streaks` |
| Schedule setup | `workoutReminder` | Morning | Active program with no training days set | `schedule-setup` | `/dashboard/calendar` |

All preference keys default to `true`. Each nudge writes its own timestamp to
`UserProgress.lastPushSentAt.<key>` and checks it before firing, which gives each nudge an
independent cooldown.

**The gap that matters:** those cooldowns are per-key. Nine independently-capped nudges can
still produce three or four notifications for one person in one day. Any new nudge, and any
marketing push, must respect a **global per-user daily cap** on top of the per-key cooldown.

---

## Window map, read as a day

```
07:00 ─── workout reminder ────┐
08:00 ─── mind reminder ───────┤  MORNING: crowded. Do not add here.
11:00 ─────────────────────────┘
12:00 ─── check-in / re-engagement ───┐
16:00 ───────────────────────────────┘  MIDDAY: moderately used.
17:00 ─── goal nudge + meal reminder ──┐
20:00 ──────────────────────────────────┘  EVENING: the real collision.
21:00 ─── QUIET HOURS: the target, NOT what ships today.
   └── streak-at-risk has no local-hour gate and can fire at 03:00.
```

The evening block is where the stacking risk actually lives: **goal nudge and meal reminder share
the identical 17:00-20:00 local window**, and both are common states for the same person. Any new
evening nudge has to explain how it avoids being the third one.

Quiet hours are a **rule we intend to enforce, not a rule the code enforces**. Eight of the nine
nudges are hour-gated. The streak-at-risk sweep is not: `webapp/app/api/cron/notify/route.ts`
comments it as "any hour — urgent" and gates only on a 20-hour per-key cooldown, so a user whose
streak enters the danger window at 03:00 local gets a 03:00 push. Fix the gate before writing
anything that promises quiet hours to a user.

---

## Timezone rules (two separate traps)

**Trap 1: the stale offset.** A stored `timezoneOffset` is a snapshot. It is wrong for half the
year the moment daylight saving moves, and it only self-corrects when the member opens the app.
The members most likely to have a drifted offset are the quiet ones we most want to reach at a
sane hour. `localHourForUser` prefers the IANA `timezone` name and falls back to the offset.
Use the zone name wherever it exists.

**Trap 2: the day marker.** A scheduled workout slot's `date` is a **day marker stored at UTC
midnight**. It means "Aug 13," not an instant. Reading it through a timezone offset shifts it a
day earlier for anyone behind UTC: Aug 13 00:00Z minus 4h keys as Aug 12.

That bug shipped. On 2026-08-12 a member in EDT saw "Today: Day 3, Legs" on the dashboard and
received a push naming "Day 4, Chest and Back," because the dashboard reads the marker as a
plain date and the cron did not. It also fired reminders on rest days, since tomorrow's slot
satisfied the "is there a slot today?" gate.

**Read the marker the way the dashboard does: take the UTC date part, full stop.** `slotDateKey`
in `webapp/lib/notifications/cronNotify.ts` exists for this.

**Trap 3: the stale title.** A slot caches `workoutTitle` at generation time, so it goes stale
when the coach edits or reorders the program. The dashboard reads the live program, so the
reminder must too. `workoutTitleForDay` resolves it. A push naming a workout the user cannot
find in the app is the fastest route to a revoked permission.

---

## Adding a nudge: the checklist

1. **Does an existing key cover it?** Folding into `goalNudge` or `workoutReminder` beats a
   tenth toggle. More toggles means more people muting the whole channel instead.
2. **Which window has room?** Not the morning.
3. **What is the cooldown?** Per-key, in `lastPushSentAt`. The goal nudge additionally tracks
   `goalNudgeKey` and `goalNudgeKeyAt` for a 3-day per-message cooldown, so the same specific
   line does not repeat. Copy that pattern for anything with copy variants.
4. **Does it respect the global daily cap?** Check whether anything already fired for this user
   today before sending.
5. **Is the state still true at fire time?** Resolve from live data, never from a cached field.
6. **Does the preference toggle exist in the settings UI?** Ship both together.
7. **What is the decay rule?** The target ladder is 3 consecutive ignores halves the frequency, 6
   drops to weekly, 10 stops it and surfaces an in-app prompt instead. **This is to build.** No
   ignore tracking exists in the codebase today: `lastPushSentAt` records that we sent, never
   whether anyone opened it. A nudge cannot decay until something counts the ignores, so specify
   the ladder and flag the dependency rather than describing it as live.

---

## Marketing pushes: the guest rules

A campaign or launch push is a guest on a channel the product depends on.

- **It consumes that user's daily slot.** If a product nudge already fired today for that user,
  the marketing push does not send. The product nudge wins, always.
- **It needs its own preference key** or it rides an existing one. Never send ungated.
- **It obeys the same quiet hours**, 21:00 to 07:00 local. No launch-day exception, and unlike the
  streak sweep a marketing push has no urgency argument for skipping the gate.
- **It must be true and specific.** "We shipped something" is not a push. "Photograph the plate.
  It comes back itemized." is.
- **One per launch.** Not a countdown series.
- Coordinate the send window with `launch-campaign` and make sure the same message is not also
  going out by email that day. See `email-lifecycle`.

---

## Copy audit of the shipped set

Useful as a live before-and-after bank.

| Nudge | Shipped body | Read |
|---|---|---|
| Workout reminder | "Today's workout is ready" | Strong. Concrete, true, one action. Could name the session title. |
| Meal reminder | "A quick log keeps your nutrition picture honest. It takes 30 seconds." | Strong. Names the cost, which lowers it. |
| Streak at risk | "Log a workout, mood, or weight to keep it alive." | Good action, but three options is three decisions. One would convert better. |
| Schedule setup | "Pick the days you train and we will keep you on track from there." | Strong. Names the payoff of the action. |
| Re-engagement | "Come back and keep building your best self." | **Weakest line in the set.** Generic, no concrete noun, no specific action. Rewrite candidate: "Your program is still where you left it." |

Rewrite proposals go through the never-shame check and the character budgets in
`references/copy-specs.md`.
