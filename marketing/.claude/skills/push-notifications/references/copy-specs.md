# Push Copy Specs

## Character budgets

The payload shape is fixed by `webapp/lib/pushNotification.ts`: `title`, `body`, `icon`, `badge`,
`url`, `tag`.

| Field | Target | Truncation reality |
|---|---|---|
| `title` | 25-35 characters | Android collapses around 40. Desktop Chrome shows more, mobile shows less. Write for 30. |
| `body` | 50-80 characters | Often collapsed to one line until the user expands the notification. The first 50 characters carry the message. |
| `tag` | kebab-case, stable | Same tag replaces the existing notification instead of stacking a second one. |
| `url` | Exact route | Where the promised thing is visible. Not `/dashboard` when the thing is on `/dashboard/nutrition`. |

**Write the body so the first 50 characters stand alone.** Assume the rest is never read.

---

## The five copy rules

1. **One action.** Not two. "Log your workout and check your mood" gets neither.
2. **A concrete noun.** The session name, the meal, the number. Not "your goals."
3. **True at fire time.** Resolve from live data. A push naming a workout the user cannot find in
   the app is the fastest route to a revoked permission.
4. **No blame.** State a fact, offer an action.
5. **At most one emoji.** House rule is none in product-voice copy. The shipped nudges carry a
   single trailing glyph as a category marker; matching that keeps the tray consistent. Never
   two, and prefer none in anything new.

---

## Pattern bank

### The queued-object pattern (strongest)

Names the specific thing waiting.

```
✅ Title: Today's workout is ready
   Body:  Push A. 5 exercises, about 40 minutes.

✅ Title: Wednesday: Legs
   Body:  4 exercises. Your last squat set was 185 x 5.
```

### The low-cost pattern

Names the effort so the user can price the decision.

```
✅ Title: Log today's food
   Body:  Photograph the plate. It itemizes the rest. About 30 seconds.

✅ Title: Daily check-in
   Body:  Mood and weight. Two taps.
```

### The state-is-live pattern (for streaks)

States a fact about a live thing without threatening.

```
✅ Title: Your 12-day streak is live
   Body:  Anything logged today keeps it. Mood counts.
```

### The clean-slate pattern (after a break)

```
✅ Title: New week, clean slate
   Body:  Wednesday is your next scheduled session.
```

### The mechanism pattern (for a feature launch)

```
✅ Title: The camera counts your reps
   Body:  Open LIVE mode, prop the phone, train. It logs the set.
```

---

## Weak versus strong

```
❌ Don't forget to work out today!
✅ Today's workout is ready

❌ You have things to do in Become
✅ Push A, 5 exercises, about 40 minutes

❌ Your nutrition data is incomplete
✅ Log today's food. About 30 seconds.

❌ Come back and keep building your best self
✅ Your program is still where you left it

❌ You're about to lose your streak!!
✅ Your 12-day streak is live today. Mood counts.

❌ Time to unlock your potential
✅ Your weekly recap is ready

❌ WORKOUT TIME! 💪🔥
✅ Today's workout is ready
```

---

## Banned in push, without exception

| Banned | Why |
|---|---|
| Guilt or blame in any form | Shaming. The user is not lazy, their tools were scattered. |
| "Don't quit," "don't give up," "no excuses" | Confirmshaming and hustle framing. |
| Comparison to other users | Never expose or imply another member's data or performance. |
| Any number the user did not generate | Fabricated stat. Non-negotiable. |
| Pricing, discounts, trial language | Become is free today and no pricing exists. |
| Promised pounds, timelines, or health outcomes | Responsible-claims rule. No medical claims. |
| ALL CAPS, `!!!`, more than one emoji | Spammy, off-brand. |
| "journey," "unlock," "crush it," "beast mode," "seamless," "just," "simply" | Banned words. |
| Em dashes | Near-zero in deliverable copy. Use a period or a comma. |
| Fake counts or fake activity | "12 people are training right now" is fabricated proof. |

---

## Writing the alternate

Every nudge ships with one alternate title and body plus a one-line rationale. The alternate
should differ in **strategy**, not in wording.

```
Primary
  Title: Today's workout is ready
  Body:  Push A. 5 exercises, about 40 minutes.
  Rationale: names the queued object and prices the effort.

Alternate
  Title: Wednesday: Push A
  Body:  Last time you benched 155 x 5.
  Rationale: leads with the user's own data instead of the schedule, which
  suits members with logging history and reads flat for new members.
```

---

## Localization and length safety

- Titles and bodies are written for English today. Any future translation will run 20-30% longer
  in several languages, so leaving headroom against the ceiling is cheap insurance.
- Never rely on a line break. Notification rendering collapses whitespace.
- Never rely on the icon to carry meaning. Some surfaces show it small or not at all.

---

## Pre-ship checklist for a single nudge

- [ ] Title under ~35 characters, body's first 50 characters stand alone.
- [ ] Exactly one action.
- [ ] The `url` route contains the promised thing.
- [ ] `tag` is stable so repeats replace rather than stack.
- [ ] Every fact in the copy is resolved from live data at fire time.
- [ ] Preference key exists and has a visible toggle.
- [ ] Fires inside its local-hour window and outside quiet hours (21:00-07:00 local).
- [ ] Respects the global per-user daily cap.
- [ ] Zero blame, zero fabricated numbers, zero pricing, zero health claims.
- [ ] At most one emoji, no banned words, near-zero em dashes.
- [ ] One alternate written, with a rationale that names a different strategy.
