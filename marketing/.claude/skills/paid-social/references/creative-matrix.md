# Creative Matrix

5 hooks × 3 mechanisms × 2 formats. Thirty cells exist; you build 3 to 5 at a time. Sampling the
grid is the method, filling it is not.

---

## The three mechanisms

Only real, demonstrable capabilities. Anything not on this list is not an ad concept.

| Mechanism | What is literally shown on screen | Source asset |
|---|---|---|
| **M1 Photo itemizes a plate** | One photo of a real plate resolving into separate line items with macros | Film the capture-to-result moment. Stills: `webapp/public/screenshots/v2/nutrition-meal-light.webp`, `nutrition-day-light.webp`. Note the seeded meals in those shots were typed through food search, so they show the result, not the photo path |
| **M2 LIVE mode logs the set** | The live logger during a set: last session's weight and reps on screen, the rest timer running, a PR badge | `webapp/public/screenshots/v2/workout-log-dark.webp` (dark only, by design) |
| **M3 The week written back** | The recap and the progress trend, one screen | `webapp/public/screenshots/v2/progress-light.webp` (Training Log: volume, history, PRs), `dashboard-light.webp` (streak, mood, weight, calories) |

Supporting, secondary: coach-built multi-phase programs (`workout-hub-light.webp`), the AI
generator (`generate-light.webp`), mind sessions (`mind-light.webp`). Use these as the second
beat, rarely as the hook.

## The five hook shapes

| # | Shape | Pattern | Example against M1 |
|---|---|---|---|
| H1 | Problem statement | Name the friction in the viewer's words | "Six searches to log one plate of food. That is why you stopped." |
| H2 | Mechanism reveal | State the surprising capability flatly | "One photo. Every item on the plate." |
| H3 | Misconception flip | "You think X. Actually Y." | "You are not bad at tracking. Tracking is badly built." |
| H4 | Demonstration cold open | No words. The thing happening, immediately | Frame one: a phone over a real plate, shutter, rows filling in |
| H5 | Coach answer | Jon answering a real question, first person | "Every client asks me how to log a meal they did not cook. Here." |

H4 is usually the strongest on TikTok. H5 is usually the strongest for a coach-led brand and
belongs to `coach-brand-voice`. H1 is the safest and the most generic.

## The two formats

| Format | What it is | Produced by |
|---|---|---|
| **F1 Creator or coach shot** | Real hands, real room, phone in frame, spoken hook, captions burned in | Filmed. Brief via `ugc-creator-briefs` or `reels-scripts` |
| **F2 Product motion** | Rendered composition, screen recording or capture in motion, text overlay | `remotion-assets`, sources in `marketing/out/` |

F1 usually wins on TikTok and in Spark placements. F2 is cheaper to iterate and works well in
feed and stories. Run one of each on the winning message in round three.

## Round structure

**Round 1: find the hook shape.**
Three ads. One mechanism (start with M1: it is the most differentiated and the easiest to film
convincingly, because the payoff is visible in one frame). H1, H2, H4.
Same footage, different first 1.5 seconds. Read hook rate (3-second views over impressions).

**Round 2: find the message.**
Winning hook shape × M1, M2, M3. Three ads. Read cost per `signup_started`.

**Round 3: find the execution.**
Winning message × F1 and F2. Two ads. Read cost per `account_created` if volume allows.

Each round is one week minimum, at or above the budget floor. Three rounds is roughly a month and
is the smallest honest paid test Become can run.

## Worked cells

**H2 × M1 × F1**
- Frame 1 (0.0s): a real plate on a real table, a hand bringing the phone over it.
- VO: "One photo. Every item on the plate."
- On-screen text (different from the VO): "chicken, rice, broccoli. it knew"
- 1.5s: the shutter, then the rows arriving one at a time with their calories.
- 4s: the macro bars filling underneath.
- 7s: the day's calorie ring settling at what is left.
- CTA: "Log your lunch in Become. Free today, no card."

**H4 × M2 × F2**
- Frame 1 (0.0s): the live logger mid-set, no text, no logo. "Last: 155 lbs × 10 reps" legible.
- 0.6s: the set number ticking to 3 of 3, the reps field taking a value.
- 2s: on-screen text "it remembers what you lifted last time"
- 4s: the PR badge landing.
- 6s: the rest timer starting on its own.
- CTA: "Log your next set in Become. Free today."

**H5 × M3 × F1**
- Frame 1: Jon, mid-sentence, no intro. "The reason people quit is not effort."
- 2s: "It is that nobody ever showed them the week."
- 4s: cut to the recap screen.
- 7s: back to Jon. "That is the whole thing. It writes your week back to you."
- CTA: "See your week. Free, sign in with an email link."

Jon's register is first person and owned by `coach-brand-voice`. The product's register is second
person. Do not mix them in one block.

## Ad copy specs

| Field | Length | Rule |
|---|---|---|
| Primary text (Meta) | 125 characters before the fold | First sentence must stand alone |
| Headline | 27 to 40 characters | One concrete noun, no adjectives |
| Description | 30 characters, often hidden | Do not carry meaning here |
| TikTok caption | Under 100 characters | The video carries the message |
| CTA button | Platform list | "Sign Up" or "Learn More". Never a button implying a purchase |

Copy rules: second person, present tense, concrete noun first. Banned: "journey," "unlock your
potential," "game-changer," "seamless," "effortless," "crush it," "no excuses," "beast mode,"
"just," "simply." Near-zero em dashes in deliverable copy. At most one emoji, only if it carries
meaning. No pricing beyond "free today." No results claims. No fabricated proof.

## Variant set for one ad

Always ship three primary-text variants with one rationale line each:

- **A, mechanism-led:** "Photograph the plate. Become itemizes it, macros and all. Free today, no
  card." *Leads with the differentiator; the most likely to earn attention from cold traffic.*
- **B, stack-fatigue-led:** "Five apps for one workout. Become logs the set, itemizes the plate,
  and shows you the week." *Leads with the pain the ICP already names out loud.*
- **C, coach-led:** "Coach-built programs, phase by phase. Not a random workout generator." *Leads
  with credibility; likely strongest with an older segment.*

## Creative hygiene

- Captions burned in. Most views are sound-off, and captions are an accessibility baseline.
- Safe area: keep text out of the top and bottom 15% for 9:16 placements.
- Light and dark: the product appears in both themes across the set, never dark-only.
- No "(beta)" visible anywhere in a frame. Check every capture against
  `webapp/public/screenshots/v2/manifest.json` and its `knownIssues`.
- No empty states, no zero rows, no error toasts, nothing mid-animation.
- Aspect ratios: 9:16 for stories, reels, and TikTok; 1:1 or 4:5 for feed. Render from
  `remotion-assets`, resize with `image-production`. Never upscale a capture.
- No competitor logos, no competitor screenshots, no trace of their creative.

## What we never run

| Never | Why |
|---|---|
| Before/after body imagery | Policy violation and a hard constraint |
| "Lose X pounds in Y weeks" | Results claim, promised timeline, likely false |
| Fabricated member quotes or star ratings | Fabrication. We have neither |
| Price, discount, trial, "limited time free" | No pricing exists |
| Body-focused second person ("your belly fat") | Personal-attribute policy violation and shaming |
| A capture showing a bug or an empty state | Constraint. Fix the bug or recapture |
| Any claim that the camera tallies repetitions, or that a set logs itself | It does not. You log the set; LIVE mode makes it one tap |
| Camera-roll photos of Jon | Constraint |
| The Becoming as the headline concept | It is at most one beat |
