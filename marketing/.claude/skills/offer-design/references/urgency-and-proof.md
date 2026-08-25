# Honest Urgency and the Proof We Actually Have

Two things a free product with no pricing has to solve differently: why act now, and why believe
us. Both have honest answers. Neither answer involves a countdown or a testimonial.

---

## Part 1: the urgency ladder

**The test.** Would this deadline still exist if we deleted the page? If no, it is manufactured
and we do not use it.

### Rung 1: the week boundary (always available)

Weeks exist without us. A plan that starts Monday is a real edge.

```
✅ Week 1 starts Monday. Set it up tonight and it's ready.
✅ Set your goal today and tomorrow's session is already queued.
❌ Sign up before Monday or miss out!
```

Use for: cold landing, push, email. This is the default and it is usually enough.

### Rung 2: a real program drop

A new coach-built program going live on a known date is a legitimate event.

```
✅ New program from Jon, live Thursday. It'll be in the app when you open it.
❌ New program drops Thursday, don't miss your chance!
```

Requirement: the program must actually be shipping on that date, on production. Check before
writing. `launch-campaign` owns the moment.

### Rung 3: a real cohort start

Only if one is actually being run, with a real start date and real people. If nobody is running a
cohort, this rung does not exist.

```
✅ The next group starts on the 6th.
❌ Only 12 spots left in the founding cohort.
```

The second is a fabricated count, and "founding" implies a price tier.

### Rung 4: the user's own trend

Their data, stated neutrally, with no guilt. This is the highest-risk category we write, because
the difference between motivating and shaming is one word.

```
✅ Two sessions left this week. Day 3 is ready when you are.
✅ Your week ends Sunday. Three of four done.
❌ Don't lose your streak!
❌ You've missed 3 days. Get back on track.
❌ Your progress is slipping away.
```

Rules: never a punishment frame, never a public loss, never an exclamation point on a miss. See
`marketing-psychology` for streaks done responsibly and `push-notifications` for the nudge copy.

### Permanently refused

| Tactic | Why |
|---|---|
| Countdown timers | Ours would reset, which is a lie the reader can catch by reloading |
| "Only N spots left" | A web app has no inventory |
| "Founder pricing ends Friday" | There is no pricing |
| "Free while in beta" | Implies a future price and puts "(beta)" in copy |
| Fake cohort sizes | Fabricated count |
| "Price goes up soon" | Fabricated pricing |
| Confirmshaming decline copy | Shame framing, banned by voice rules and by the dark-pattern line |

### When to use no urgency at all

Cold traffic that does not yet understand the product. Urgency before comprehension reads as
pressure and raises anxiety, which is exactly the force we are trying to lower. Clarity first.
Urgency, if any, at the ask.

---

## Part 2: the proof inventory

We have no counts, no ratings, and no testimonials, and we may not invent any. What we have is
better suited to the positioning anyway: proof of the mechanism.

### Tier 1: mechanism proof (strongest, always available)

Show the thing working. This is the most persuasive proof available to us and the least
fabricable.

| Proof | Where it lives |
|---|---|
| A photo of a plate resolving into items | **No capture exists yet.** Commission via `screenshot-capture` |
| A barcode scan landing a packaged food | **No capture exists yet.** Commission via `screenshot-capture` |
| A day of meals, itemized, against calorie and macro targets | `nutrition-meal-light.webp` and `nutrition-day-light.webp` |
| A session being generated from focus, level, and equipment | `generate-light.webp` and `generate-dark.webp` |
| Every hub on one dashboard | `dashboard-light.webp` and `dashboard-dark.webp` |
| Last-session numbers and a PR badge during a set | `workout-log-dark.webp` |
| Volume, workout history, and PRs over six weeks | `progress-light.webp` and `progress-dark.webp` |

Clear every shot against `webapp/public/screenshots/v2/manifest.json` before use, and note two
traps it records. The meals in `nutrition-meal-*.webp` were **typed through food search**, not
photographed, so that shot proves itemized meals and never photo logging. And `/dashboard/progress`
is the **Training Log** — volume, history, PRs — with no weight-trend chart on it at all; body-weight
trend lives on the dashboard, and it is single-point on every dummy account because weight and mood
cannot be backdated through any app API.

### Tier 2: coach credibility

Jon Don built the programs. That is a fact about the product, not a claim about outcomes.

```
✅ Programs and habits from coach Jon Don, from the system he runs with his own clients.
❌ Trusted by hundreds of Jon's clients.
❌ Jon's clients see results in 8 weeks.
```

The first is defensible. The second is a fabricated count. The third is a promised result and a
health claim.

### Tier 3: specificity as proof

Concrete numbers about the product itself are honest and read as evidence. Numbers about outcomes
are not.

```
✅ 39 movements with a demo clip, covering the main lifts.
✅ Twelve-week programs, built in phases.
✅ Filters for focus, level, and the equipment in front of you.
❌ 10,000 workouts logged.
❌ Users train 3x more often.
```

The line: a number describing what we built is a fact. A number describing what users did is a
claim, and we may not make one until it is measured, reproducible, and even then it stays internal
unless explicitly cleared.

### Tier 4: risk reversal as proof

The signup itself carries proof. Nothing to pay, nothing to remember, nothing to cancel.

```
✅ No password. We email a link that expires in fifteen minutes.
✅ Free today. No card.
❌ 100% risk free, cancel anytime.
```

### What we may never use as proof

Fabricated testimonials, invented user counts, star ratings, "as seen in" without a real
placement, before/after imagery implying a guaranteed outcome, another user's data shown without
their own action creating the share, and any statistic borrowed from an industry benchmark and
restated as ours.

If a member gives written permission, their words may be used, attributed accurately, with no
result claim added on top. `ugc-creator-briefs` owns permission and disclosure.

---

## The one-question test, applied

Before any offer line ships:

1. Would this deadline exist if we deleted the page?
2. Can I point at the file, route, or capture that proves this claim?
3. Is every word true today, for everyone, with no asterisk?
4. Does any line create guilt?
5. Would a reader who learned exactly how this line was constructed still feel respected?

A no on any of the five means rewrite, not soften.
