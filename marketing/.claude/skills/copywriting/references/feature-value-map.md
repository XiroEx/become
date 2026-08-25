# Feature to Value Map

Every value line in Become copy has to be reachable from a mechanic that exists today. This is the
lookup table. Columns: the mechanic exactly as it works, the value it produces, the line to write
toward, and the capture that proves it.

Captures live in `webapp/public/screenshots/v2/`. Read
`webapp/public/screenshots/v2/manifest.json` before citing one: it records the seeded state, and
some shots carry known limitations.

---

## Dashboard

| Mechanic | Value | Line to write toward | Capture |
|---|---|---|---|
| Day at a glance: streak, mood, weight, water, calories, next session, all as tiles | No app-switching to answer "what am I doing today" | "The whole day on one screen." | `dashboard-light.webp` / `dashboard-dark.webp` |
| Customizable tiles | The dashboard shows what you actually track | "Keep the tiles you use. Hide the rest." | same |
| Streak counter | A visible reason to not skip | "Day 3. Keep it." | same |
| Mood and weight check-in prompt | One tap logs the two things people abandon first | "Two taps and today is logged." | same |

❌ "A beautiful, intuitive dashboard experience."
✅ "Streak, mood, weight, calories, next session. One screen."

## Training

| Mechanic | Value | Line to write toward | Capture |
|---|---|---|---|
| Coach-built multi-phase programs | Structure from someone who has programmed before | "A coach built the phases. You run them." | `workout-hub-light.webp` / `-dark.webp` |
| AI session and program generator | A session when the plan does not fit the day | "Tell it your equipment. It builds the session." | `generate-light.webp` / `-dark.webp` |
| Set logging with PR history | The app remembers, so you do not | "It remembers what you lifted last Tuesday." | `workout-log-dark.webp` |
| Exercise demo videos on the main movements | You never guess the big lifts | "Demo clips on the big lifts. Watch one mid-set." | `workout-log-dark.webp` |
| LIVE mode: one set on screen, last session's numbers under blank fields, rest timer on tap | Logging does not interrupt the set | "Log the set before you rack the bar." | `workout-log-dark.webp` |
| Program scheduling across the week | The week is planned before Monday | "Your week is already written." | `workout-hub-light.webp` |

Notes for accuracy: `workout-log-dark.webp` is **dark only**, there is no light twin. The generate
sheet capture was filled in but not submitted, so no generated output is shown. Both facts are in the
manifest, and copy that implies otherwise will not match the image.

Demo clips ship for **39 of the 132 canonical exercises** (`webapp/public/exercises/`, 42 files
covering 39 movements). The big lifts are covered; most of the library is not. Never write "every
exercise has a clip." `workout-log-dark.webp` shows Lat Pulldown, which is one of the 39.

LIVE mode is the live **logging** screen: a Track and a Live tab, set and weight and reps entered by
hand, a checkbox per set, a rest timer, "Last: 155 lbs × 10 reps" under the inputs, a PR badge. The
camera is not involved. Nothing in the app watches a set or tallies repetitions, and copy that
suggests otherwise is a fabrication, not an exaggeration.

❌ "Revolutionary AI training technology."
✅ "Pull day, intermediate, barbell and cable, five exercises. Generated."

## Nutrition

| Mechanic | Value | Line to write toward | Capture |
|---|---|---|---|
| Photo logging itemizes a whole plate | No searching, no per-item entry | "One photo. The whole plate, itemized." | None yet. Commission via `screenshot-capture` |
| Barcode scan | Packaged food in one motion | "Scan the box. Done." | None yet. Commission via `screenshot-capture` |
| Personal calorie and macro targets | Targets set from your own numbers | "Targets set to your goal, not a generic 2000." | `nutrition-day-light.webp` / `-dark.webp` |
| Day view with calorie ring and macro bars | You can see the day without doing math | "Protein, carbs, fats. Where you actually are." | `nutrition-day-light.webp` |

The nutrition captures show a populated day (calories remaining, macro bars, protein slightly over
target). Copy can reference the shape of that screen. It may not turn the numbers in the capture into
a claim about outcomes.

Two capture caveats the manifest is explicit about. The meals in `nutrition-meal-*.webp` were seeded
through food search and `POST /api/nutrition/log`, meaning they were **typed, not photographed**.
The shot proves itemized meals exist, not that a photo produced them, so never pair it with
photo-logging copy. And `nutrition-day-light.webp` is the calorie ring and macro bars; the barcode
scanner is not in frame in any v2 shot. Photo logging and barcode scan are both real mechanics with
no capture behind them yet, which is a gap worth closing before either one anchors a page.

❌ "Effortless nutrition tracking that transforms your diet."
✅ "Photograph the plate. It splits out the chicken, the rice, and the sauce."

## Mind

| Mechanic | Value | Line to write toward | Capture |
|---|---|---|---|
| Short guided sessions | Mind work sized to fit a real day | "Five minutes that belong to the plan." | `mind-light.webp` / `mind-dark.webp` |
| Mood tracking on a 1-5 scale | A record of how training actually felt | "Rate the day. Watch the pattern." | `mind-light.webp` |
| Identity work | The part of the plan that is not sets and grams | "Train the part that decides to show up." | `mind-dark.webp` |

Mind copy is where preachiness creeps in. Stay concrete, stay short, never moralize.

❌ "Cultivate an unshakeable mindset and unlock your true potential."
✅ "Five minutes, guided. Then log how the day felt."

## Progress and The Becoming

| Mechanic | Value | Line to write toward | Capture |
|---|---|---|---|
| Training Log: weekly volume chart, workout history, personal records | Evidence instead of memory | "Evidence, not vibes." | `progress-light.webp` / `-dark.webp` |
| Weight, BMI, and mood trends on the dashboard | The slow numbers, watched over months | "The line you only see by showing up." | None usable yet. Single-point charts |
| Weekly recap that writes your week back to you | Someone noticed what you did | "Your week, written back to you." | `progress-light.webp` |
| The Becoming, a weekly path of cards | The long arc, made visible | One mention, one section, never the headline. | `dashboard-light.webp` (summary row) |

The Becoming is design inspiration and a single section or mention at most. It is not the theme of
the page, the campaign, or the brand.

Capture caveat from the manifest, and it trips people up: `/dashboard/progress` is the **Training
Log**. It holds the weekly volume bars, the workout history list, and personal records. It contains no
weight-trend chart at all. Weight, BMI, and mood trends live on `/dashboard`, below the fold. So
`progress-*.webp` proves strength and volume history, never body-weight progress.

Weight and mood history also cannot be backdated through any app API, so those trend charts are
single-point on every dummy account. Do not write "watch six months of progress" against a capture
that shows one dot. Either write to what the shot shows, or request a new capture through
`screenshot-capture`.

## Cross-cutting

| Mechanic | Value | Line to write toward |
|---|---|---|
| Signup by email link, Google, or a passkey | Nothing to remember, nothing to pay | "No password. No credit card." |
| PWA, installs from the browser | No store, no download wait | "Add it to your home screen. That is the install." |
| Web push notifications | Nudges that arrive without an app store | "A reminder on the day you train." |
| Light and dark themes | It matches the phone | Rarely worth a line of its own. Show it instead. |

## Things that are NOT features

Do not write value lines for any of these. They do not exist, or they are not ours to claim.

- Pricing, tiers, trials, discounts, founder rates, lifetime deals.
- Any user count, download count, rating, or review score.
- Any promised result: pounds lost, weeks to a goal, strength gained.
- Medical or clinical benefit of any kind.
- A native iOS or Android app. Become is a PWA.
- Integrations with wearables, Apple Health, or Google Fit unless
  `marketing/.agents/become-context.md` says one shipped.
- A community, forum, or DM channel unless the context doc confirms it is live.

When asked to write copy for one of these, say it is not available today and offer the nearest true
line instead.
