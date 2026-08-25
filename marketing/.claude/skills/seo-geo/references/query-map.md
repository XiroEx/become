# Query Map: three tiers, seeded

A starting map, not a finished keyword plan. Volumes are deliberately absent: at Become's stage
the decision is "which page do we build," and volume estimates from free tools are Tier C noise.
Validate intent by running the query yourself and reading what currently ranks and what the AI
Overview says.

---

## Tier 1: Decision queries

The searcher is choosing. Small volume, highest value, hardest to win. Our play is a page plus
presence in other people's roundups.

| Query family | Example queries | Page we need | Realistic goal |
|---|---|---|---|
| Best free X | best free workout app, best free fitness app 2026, free workout tracker no subscription | `/best-free-workout-app` comparison page | AI citation, roundup inclusion |
| One app for both | app that tracks workouts and food, workout and nutrition app in one, all in one fitness app | `/workout-and-nutrition-in-one-app` | AI citation |
| Alternatives | MyFitnessPal alternative free, Hevy alternative, Fitbod alternative, Ladder alternative | `/alternatives/<competitor>` set | listicle and AI citation |
| Versus | Become vs Hevy, Become vs MyFitnessPal | `/compare/<competitor>` | branded defense, later |
| Coaching without the price | online personal trainer alternative, workout program without a trainer, coach-built workout plan free | `/coach-built-programs` | AI citation |
| Mechanism-led | app that counts reps with camera, app that logs food from a photo, photo calorie tracker | feature pages on the landing route or standalone | citation plus curiosity clicks |

Rules for T1 pages:
- Every competitor claim carries a checked date. See `competitor-analysis` for the sourcing rule.
- Never state a competitor's price without the date you checked it, and never state ours as
  anything but free today.
- A comparison page that only flatters us is not credible and does not get cited. Name the thing
  the competitor genuinely does better, then name where we win.
- The page must answer the query in the first 60 words. See `references/geo-tactics.md`.

## Tier 2: Problem and evaluation queries

The searcher has a problem, not a shortlist. Larger volume, warmer than T3, and the natural home
for the mechanism story.

| Query family | Example queries | Angle | Product step at the end |
|---|---|---|---|
| Consistency | how to stay consistent with workouts, why do I keep quitting the gym, how to not miss workouts | implementation intentions and a fixed schedule, honest about relapse | schedule your training days in Become |
| Restarting | how to get back into the gym after months off, restarting after a break | phase one of a program, not a hero week | start a coach-built phase |
| Logging friction | fastest way to log a meal, how to track calories without weighing food, is photo calorie tracking accurate | be honest about accuracy limits, that honesty is why it gets cited | log a plate from a photo |
| Program design | how many days a week should I lift, upper lower vs full body, how to progress weight each week | teach the actual rule | let the generator build the session |
| Tracking what matters | how to track progress in the gym, what is a good weekly volume, should I track mood and training | connect training to mood and weight in one view | see your week in the recap |
| Habit stacking | how to build a workout habit, morning routine for training | identity framing, see `marketing-psychology` | one nudge, one check-in |

Rules for T2 pages:
- Answer-first. The reader gets the answer before any mention of Become.
- One product step at the end, phrased as a step, not a pitch. ❌ "Try Become today to transform
  your consistency." ✅ "In Become, set your training days once and the schedule fills itself in."
- No medical claims and no promised timelines. "Most people" statements need a source or get cut.

## Tier 3: Entity and reference queries

The exercise corpus. Individually tiny, collectively the entity mass that makes T1 and T2
believable.

| Pattern | Example | Page |
|---|---|---|
| `<exercise> form` | romanian deadlift form, lat pulldown form | `/exercises/<slug>` |
| `<exercise> alternatives` | lat pulldown alternative at home, no cable machine substitute | same page, alternatives section |
| `<exercise> vs <exercise>` | barbell row vs dumbbell row | comparison block on the more common of the two |
| `<muscle> exercises` | best back exercises with dumbbells | `/exercises/muscle/<group>` index |
| `<equipment> workout` | dumbbell only back workout | `/exercises/equipment/<slug>` index |

What each exercise page must carry to be worth publishing, all from `webapp/models/Exercise.ts`:
- `instructions` (a real sequence, not one line)
- `cues` (at least two)
- `commonMistakes` (at least two: this is the field competitors do not have)
- `primaryMuscles`, `secondaryMuscles`, `equipment`, `difficulty`
- `alternatives` and `variations`, rendered as internal links
- the demo clip from `webapp/public/exercises/`, referenced as the `.mp4`, never the `.mov`

If a document is missing instructions or cues, it does not get a page. A thin page is worse than
no page.

## Seasonality

January is the category's peak, with a secondary summer rise. The implication is a publishing
deadline, not a content theme.

| Window | Action |
|---|---|
| Sep to Oct | Build the technical base and the T3 pilot. Indexation takes weeks. |
| Nov | Publish T1 comparison and alternatives pages. Submit to directories (`web-app-listing`). |
| Early Dec | Everything meant to work in January is live and indexed. Freeze. |
| Jan | Amplify, do not publish. Paid and social carry the moment (`paid-social`, `social-strategy`). |
| Feb to Mar | Read what actually earned citations. Kill what did not. |

## How to validate a query before building for it

1. Run the query in Google. Screenshot the SERP shape: is there an AI Overview, a listicle pack,
   an app-store block? If app-store results dominate, a PWA will struggle. Deprioritize.
2. Run the same query in ChatGPT and Perplexity. Note which sources get cited. Those sources are
   your off-site target list, more actionable than the ranking pages.
3. Check whether the query implies a capability Become does not have. If the honest answer is
   "we do not do that," the page does not get built. See the product truth in
   `marketing/.agents/become-context.md`.
4. Assign the tier, the page path, and the 40-60 word answer passage before writing anything else.
