# Content Pillars (detail, slot names, seeded ideas)

Five pillars. Each is anchored to a hub and a mechanism the product actually performs. If an idea
does not fit a pillar, it does not get made.

---

## Pillar 1 — Watch It Work

**Hubs:** Training, Nutrition.
**Mechanism:** the camera counts reps in LIVE mode; one photo itemizes a whole plate; barcode scan.
**Format:** Reel, 15-30s. Occasionally a 3-slide carousel when the result is a still.
**Default CTA:** send CTA, or `LIVE` / `PLATE` keyword.
**Asset source:** filmed screen capture of a real session, or `webapp/public/screenshots/v2/workout-log-dark.webp` and the nutrition captures for stills.

Seeded ideas:
1. Phone propped, set of ten, counter ticking on screen. No voiceover for the first four seconds.
2. One plate photographed, the itemized breakdown appearing line by line.
3. Barcode scan at the shelf, macros landing before the door closes.
4. Two ways to log the same meal, photo versus barcode, timed side by side.
5. The set that gets logged without touching the phone.

**Rule:** the mechanism must be visible in the frame. A claim about the mechanism is not this pillar.

---

## Pillar 2 — One Tap At A Time

**Hubs:** any.
**Mechanism:** a specific task completed in the app, one tap per beat. Directly modelled on the
strongest pattern in `marketing/inspo-analysis.md` (the "App Tip" how-to sequence).
**Format:** carousel, 4-6 slides, or a 30-45s Reel.
**Default CTA:** save CTA.
**Asset source:** `webapp/public/screenshots/v2/` captures, annotated. New states go through `screenshot-capture`.

Seeded ideas:
1. How to log a set with PR history showing.
2. How to generate a session when you have 35 minutes and two dumbbells.
3. How to swap an exercise you cannot do today.
4. How to read the week strip on the dashboard.
5. How to shoot the plate photo so the itemization is clean.

**Rule:** one tap per slide, one annotation per slide, the payoff on the last content slide and
the CTA after it. Never six bullets on one frame.

---

## Pillar 3 — Coach Answer

**Hubs:** Training, Mind.
**Mechanism:** Jon answers a real question and gives the reason, not just the rule.
**Format:** Reel, 30-45s, Jon on camera. First person, per `coach-brand-voice`.
**Default CTA:** send CTA, or a reply-in-comments prompt tied to a real question.
**Asset source:** filmed. Batch four to six per session.

Seeded ideas:
1. "Should I train through soreness?" with the actual decision rule.
2. Why the program has a deload week and what happens if you skip it.
3. How to pick a starting weight without a max test.
4. What to do when you miss two sessions in a row. No shame framing, ever.
5. Why the plan changes when your week changes.

**Rule:** never invent a client, a client result, or an anecdote. Injury, medical, and pregnancy
questions get the referral answer, no exceptions.

---

## Pillar 4 — Plan The Week

**Hubs:** Training, Dashboard.
**Mechanism:** coach-built multi-phase programs, the AI session generator, the schedule.
**Format:** carousel, or a Reel when the planning happens on screen.
**Default CTA:** `WEEK1` keyword, or save.
**Asset source:** `workout-hub-light.webp`, `workout-hub-dark.webp`, `generate-light.webp`, `generate-dark.webp`.

Seeded ideas:
1. Three training days, one phase, what week one actually contains.
2. Generating a session against the equipment you have today.
3. Setting the training days so the week fits your life instead of the other way round.
4. What a phase change looks like and why the numbers move.
5. Planning around a trip without abandoning the program.

**Rule:** never show a program that is not live in the app. No invented program names.

---

## Pillar 5 — Read Your Week

**Hubs:** Progress, Mind.
**Mechanism:** weight and strength trends, mood tracking, the weekly recap that writes your week back to you.
**Format:** Reel or carousel. **One slot per week, hard cap.**
**Default CTA:** save, or send to a training partner.
**Asset source:** `progress-light.webp`, `progress-dark.webp`, `mind-light.webp`, `mind-dark.webp`.

Seeded ideas:
1. What the recap says after a good week and after a scrappy one.
2. Mood logged next to training volume, and what the pattern shows.
3. Reading a strength trend without reading a scale.
4. The one number worth watching in month one.
5. Why a flat week is information, not failure.

**Rules:** The Becoming is design inspiration and gets at most one mention. Never show a real
user's data. Never present a trend as a promised outcome. The captures note that weight and mood
cannot be backdated through any app API, so trend charts on dummy accounts are single-point;
plan the shot around that or run a fresh capture (see `screenshot-capture`).

---

## Named recurring slots

The competitor library shows a named weekly slot converts ad inventory into an audience habit.
Become's version, non-competitive and self-referential:

| Slot | Day | Pillar | Format | Owner |
|---|---|---|---|---|
| Watch It Work | Monday | 1 | Reel | Brand |
| One Tap | Wednesday | 2 | Carousel | Brand |
| Coach Answer | Thursday | 3 | Reel | Jon |
| Plan The Week | Friday | 4 | Carousel or Reel | Brand |
| Read Your Week | Sunday | 5 | Reel or carousel | Brand |

Adjust the days to the team's real capacity. Keep the names; the names are the habit.

## Pillar hygiene

- A pillar with no available asset and no agreed capture session is not a pillar yet.
- A pillar in the bottom quartile of sends per reach for four consecutive weeks gets rebuilt or dropped.
- Do not add a sixth pillar to cover a one-off idea. One-offs belong in an existing slot.
- No "motivation" pillar. Motivation without a mechanism is exactly the fluff the voice bans.
