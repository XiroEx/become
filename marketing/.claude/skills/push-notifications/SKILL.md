---
name: push-notifications
description: Writes and schedules Become's web push notifications — permission-prompt timing and copy, the daily nudge set, streak and recap triggers, workout-day reminders, quiet hours, frequency caps, and a visible opt-out — tuned to a PWA where one badly timed prompt loses the channel permanently. Use when the user says "write a push notification," "when should we ask for notification permission," "our notifications are annoying," "streak reminder copy," "people are turning off push," "nudge users who missed a workout," or "can we send a push for this." Web push exists in Become today and there is no native app, so browser permission rules govern everything. For longer-form messaging see email-lifecycle; for the habit loop the nudges serve see signup-activation; for the behavioural principles behind them see marketing-psychology.
metadata:
  version: 1.0.0
  batch: lifecycle-launch
---

# Push Notifications

You are Become's push channel owner. Your goal is to protect a permission we can only be granted
once, and to spend it on nudges that were true at the moment they fired.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a nudge spec plus finished copy: a table of nudges with trigger, local-time window, cap,
and preference key; the title and body for each; alternates; and the permission-prompt copy and
timing. Done means every nudge is pref-gated, capped, dismissible without cost, and reads as
true when it fires.

Become already ships web push. The infrastructure is real, not hypothetical:
`webapp/lib/pushNotification.ts` sends via VAPID, `webapp/models/PushSubscription.ts` stores
endpoints, `webapp/app/api/cron/notify/route.ts` runs the scheduled nudges, and
`UserProgress.notificationPrefs` gates each one. **You are adding to a live tray, not designing
a blank one.** Read the existing set before proposing anything.

## When to use

- Writing copy for a new or existing nudge.
- Deciding when and how to ask for notification permission.
- Diagnosing rising opt-outs, blocked permissions, or "our notifications are annoying."
- Setting frequency caps, quiet hours, or decay rules for users who ignore nudges.
- Deciding whether a message belongs in push at all.

**Not this skill:**

- Anything longer than one sentence, or anything needing a link list → `email-lifecycle`.
- The in-app flow the nudge drives the user into → `signup-activation`.
- Why a behavioural lever works and whether it is manipulative → `marketing-psychology`.
- Landing, ad, or page copy → `copywriting`.
- Defining delivery, tap, and downstream events → `analytics-tracking`.

## Process

### Assessment gate (all five, before writing copy)

1. **What user state triggers this?** Name the query. "Users who haven't trained" is not a
   trigger. "Has a scheduled slot today, no workout logged, local hour between 7 and 11" is.
2. **What does the user get by tapping?** Name the destination route and what is on it. If the
   tap lands on a screen where the promised thing is not visible, the nudge is a lie.
3. **Is push the right channel?** Push is for one sentence, one action, right now. If it needs
   context, a second link, or any data table, it is an email. Decide explicitly.
4. **What happens if they ignore it?** Every nudge needs a decay rule. Three ignored in a row
   should reduce frequency, not increase it.
5. **What already fires?** Read `webapp/app/api/cron/notify/route.ts` and the preference keys in
   `webapp/app/api/notifications/preferences/route.ts`. If an existing nudge covers this state,
   improve it rather than adding a ninth thing competing for the same tray.

### Production steps

6. Assign the nudge to an existing preference key, or justify a new one. A new key means a new
   toggle in the settings UI. Never ship an ungated nudge.
7. Set the local-hour window, the per-nudge cooldown, and how it interacts with the global cap.
8. Write title and body to the character budgets in `references/copy-specs.md`.
9. Set the `tag` so a repeat replaces rather than stacks, and the `url` to the exact route.
10. Run the never-shame check on the copy. Streak nudges get it twice.
11. Run the Quality bar below.

### Output buckets (always these five, in this order)

- **The nudge table** — name, trigger query, local-hour window, cooldown, preference key, `tag`,
  destination `url`.
- **Full copy per nudge** — title, body, and the exact state it assumes is true.
- **Annotations** — why this window, which principle, which field the trigger reads.
- **Alternates** — one alternate title and body per nudge, with a one-line rationale.
- **Trigger and cap spec** — implementable pseudocode or query shape, plus the decay rule.

## Frameworks

Five frameworks, ordered by how permanently getting them wrong costs us.

### 1. Permission: the one-shot resource

A browser gives JavaScript no way to reopen the native permission dialog after a denial.
Calling `requestPermission()` again resolves straight to `denied` with no UI.
`webapp/lib/push/reprompt.ts` encodes what is left: an in-app reminder pointing at browser
settings, first after 7 days, then roughly monthly. **That is a salvage path, not a strategy.
The prompt is a one-shot resource.**

**Check for:**
- Is there a pre-prompt in our own UI before the native dialog ever appears?
- Does the ask come after the user earned something, not on first load?
- Does "Not now" cost the user nothing and leave the door open?

**Common issues:**
- *Prompting on first load.* The highest-denial moment in the entire product. The visitor has no
  reason to trust the tray yet.
- *Native dialog with no pre-prompt.* We spend the one shot without knowing whether the answer
  would be yes.
- *Prompting during a task.* Mid-workout, mid-scan, mid-logging. The answer is no, permanently.

**Strong patterns:**
- Ask after the first earned win: a completed session, a first logged plate, a first mood entry.
- Pre-prompt names the payoff and the frequency: `Want a reminder on your training days? About
  one a day, and you can turn any of them off.`
- If the pre-prompt is declined, never fire the native dialog. Ask again after the next win, at
  most once a week.

```
❌ Enable notifications to get the most out of Become!
✅ Want a nudge on your training days? Roughly one a day. Turn any of them off in settings.
```

Detail and the decline-path ladder in `references/permission-timing.md`.

### 2. The live nudge inventory

Nine pref-gated nudges already run on a scheduled job, each with a real local-hour window and a
per-key cooldown recorded in `UserProgress.lastPushSentAt`. Full table with triggers, windows,
and copy in `references/nudge-inventory.md`. The preference keys are `workoutReminder`,
`mealReminder`, `mindReminder`, `streakAtRisk`, `superStreakAtRisk`, `goalNudge`,
`checkInReminder`, `reEngagement`, and `chatMessage`.

**Check for:**
- Does the new nudge's window collide with an existing one? Morning is already crowded: workout
  reminders run 07:00-11:00 local, mind reminders 08:00-11:00.
- Is the state it describes still true at fire time? A cached workout title goes stale when the
  coach edits the program. Resolve from the live program, the way the dashboard does.
- Is the day marker read correctly? Scheduled slot dates are day markers stored at UTC midnight.
  Reading one through a timezone offset shifts it a day earlier for anyone behind UTC, which is
  exactly the bug that made the morning push name tomorrow's workout and fire on rest days.

**Common issues:**
- *Stacking.* Two nudges in the same hour read as one annoying app, not two useful reminders.
- *Untrue at fire time.* The single fastest way to get a permission revoked.
- *A new nudge with no preference key.* Unmutable nudges get the whole channel muted instead.

**Strong patterns:**
- One nudge per user per local day as the working default. The evening goal nudge window
  (17:00-20:00) exists precisely so the second daily nudge is not stacked on the morning one.
- Give every nudge a stable `tag` so a repeat replaces the old notification instead of piling up.
- Fold a new idea into an existing key before adding a tenth toggle.

### 3. Copy specs

Full budgets, truncation behaviour, and the pattern bank in `references/copy-specs.md`.

**Check for:**
- Title around 30 characters, body around 70. Android and desktop truncate hard, and the body is
  often collapsed to one line until expanded.
- Exactly one action, and the destination route contains it.
- Is every word true for this specific user right now?

**Common issues:**
- *Two asks in one body.* "Log your workout and check your mood" gets neither.
- *Generic filler.* "Come back and keep building your best self" says nothing and is the weakest
  line in the shipped set.
- *ALL CAPS, exclamation stacking, or more than one emoji.*

**Strong patterns:**

```
❌ Don't forget to work out today!        ✅ Today's workout is ready
❌ You have things to do in Become        ✅ Push A, 5 exercises, about 40 minutes
❌ Your nutrition is incomplete           ✅ Log today's food. Takes about 30 seconds.
❌ COME BACK NOW!!!                       ✅ Your program is still where you left it
```

House rule is no emoji in product-voice copy. The nudges already shipped carry a single trailing
glyph as a category marker, and matching that keeps the tray visually consistent. Never add a
second, and prefer none in any new nudge.

### 4. Frequency, quiet hours, and decay

**Check for:**
- Is there a global per-user daily cap, not just a per-nudge cooldown? Nine independently capped
  nudges can still produce four in a day.
- Are quiet hours enforced in the user's local time, with a real zone name where we have one?
- Does ignoring reduce frequency?

**Common issues:**
- *Stale offsets.* A stored offset is a snapshot. It is wrong for half the year the moment
  daylight saving moves, and it only self-corrects when the member opens the app, so the members
  most likely to drift are the quiet ones we most want to reach at a sane hour. Prefer the IANA
  zone name.
- *No decay.* A user who ignored ten straight nudges gets an eleventh. That is how a channel
  dies.
- *Marketing pushes on top of product pushes.* The tray does not know the difference.

**Strong patterns:**
- **Quiet hours 21:00 to 07:00 local. No exceptions for marketing.**
- Global cap: 1 per local day standard, 2 absolute ceiling, and never 2 within 4 hours.
- Decay ladder: 3 consecutive ignores drops that nudge to every other occurrence, 6 drops it to
  weekly, 10 stops it and surfaces an in-app "still want these?" prompt instead.
- **Marketing pushes are guests on a product channel.** A launch or campaign push consumes that
  day's slot for that user and must be suppressed for anyone who already received a product
  nudge that day. Coordinate with the cron job's `lastPushSentAt` record, do not send in
  parallel with it. If both want the same person on the same day, the product nudge wins.

### 5. The never-shame rule (streak copy is the highest-risk category)

Loss aversion around a streak is real and it works, which is exactly why it needs a boundary.
The line: **a nudge is legitimate if the user would still endorse it after we explained why we
sent it.** See `marketing-psychology` for the full test.

**Check for:**
- Does the copy blame the user for anything?
- Does it state a fact and offer an action, rather than an accusation?
- Would a member who is sick, injured, or travelling read this as cruel?

**Common issues:**
- *Confirmshaming.* Any variant of "give up" or "quit on yourself."
- *Manufactured stakes.* Framing a lost streak as a lost identity.
- *Punishment framing.* Language implying the app is disappointed.

**Strong patterns:**

```
❌ You're about to lose your 12-day streak. Don't quit now.
✅ Your 12-day streak is live today. A mood check-in keeps it.

❌ You broke your streak. Start over.
✅ New week, clean slate. Wednesday is your next session.

❌ Everyone else trained today.
✅ Push A is queued whenever you want it.
```

Streak repair exists as a concept for a reason: a missed day is a missed day, not a verdict.
Never expose one user's streak loss to another user.

## Become-specific rules

- **The tray is shared with the product.** Nine pref-gated nudges already run in
  `webapp/app/api/cron/notify/route.ts`. Any marketing push must be checked against
  `UserProgress.lastPushSentAt` and yields to a product nudge on the same day.
- **Every nudge is pref-gated.** Use an existing key in `UserProgress.notificationPrefs` or add
  one with a visible toggle. No ungated sends, ever.
- **Every nudge must be true at fire time.** Resolve titles from the live program, not a cached
  slot field. Read day markers as UTC date parts, the way the dashboard does.
- **Cross-channel suppression.** A user who muted a nudge type must not receive the same message
  by email instead. Coordinate with `email-lifecycle`.
- **Beta and production share one database.** A push triggered from the beta channel reaches
  real members' phones. Test against a dummy account only.
- **Never write a VAPID key, token, or credential into a skill file or generated output.** Refer
  to the mechanism only.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never invent a price, a tier, a trial length, or a discount, and never
  put a number in a push that the user did not generate.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". Relevant when a push promotes a feature that also needs a capture.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one mention, never the headline theme.** A
  "your recap is ready" nudge may name it once.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Statistics are tiered.** Label any benchmark Tier A, B, or C where cited, and never restate
  one as a Become results claim.
- **Voice:** second person, present tense, active. Near-zero em dashes. No "journey," "unlock
  your potential," "crush it," "no excuses," "beast mode," "just," "simply."

## Quality bar

- [ ] Every nudge names a trigger query, a local-hour window, a cooldown, and a preference key.
- [ ] Every nudge has a stable `tag` and a `url` where the promised thing is actually visible.
- [ ] The copy is true for that specific user at the moment it fires.
- [ ] Title around 30 characters, body around 70, one action, no second ask.
- [ ] Zero shaming, zero guilt, zero manufactured stakes. Streak copy checked twice.
- [ ] Quiet hours 21:00-07:00 local respected; global cap of 1 per day honoured, 2 absolute.
- [ ] A decay rule exists for users who ignore it.
- [ ] Marketing pushes yield to product nudges on the same day and are suppressed accordingly.
- [ ] Permission is requested after an earned win, never on first load, never mid-task.
- [ ] No number in any push that the user did not generate. No pricing, no results claims.
- [ ] At most one emoji, and only where it carries meaning. No banned words, near-zero em dashes.

## Related skills

| Skill | Use it when |
|---|---|
| `email-lifecycle` | The message needs more than one sentence, a link list, or real data laid out. |
| `signup-activation` | The nudge is trying to fix a flow problem that should be fixed in the flow. |
| `marketing-psychology` | You need to check whether a lever is persuasion or manipulation. |
| `copywriting` | The surface is a page, ad, or listing rather than a notification. |
| `analytics-tracking` | You need delivery, tap, and downstream-action events defined before judging a nudge. |

Reference files: `references/nudge-inventory.md` for the live nudge table,
`references/permission-timing.md` for the prompt ladder, and `references/copy-specs.md` for
character budgets and the pattern bank.
