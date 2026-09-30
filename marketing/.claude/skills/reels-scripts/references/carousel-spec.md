# Carousel Spec

A carousel is the format for anything whose payoff is a **still the viewer wants to keep**: a
teaching sequence, a comparison, a list of modalities. Reels buy reach; carousels buy saves and
authority. If the idea only works because something is moving, it is a Reel. If a viewer would
screenshot slide 3, it is a carousel.

Structure below is lifted from the strongest sequence in the competitor library, Ladder's five-slide
meal-logging deck (`marketing/inspo-analysis.md`): a cover that promises a countable thing, one
modality or one tap per slide, an identical lower-third lockup on every frame, and a CTA slide that
arrives after the viewer has already learned something.

---

## Deck shape

| Slide | Job | Rule |
|---|---|---|
| 1 — Cover | Promise something countable and specific | The only slide most people see. It must work alone, muted, at thumbnail size |
| 2 to n-1 — Body | One idea per slide, no exceptions | If a slide needs "and," it is two slides |
| n — CTA | The low-friction ask | Always the same frame: email link, no card, free today |

Four to six slides. Three is a static post wearing a costume. Seven loses the last two to drop-off,
and the drop is steepest between slides 1 and 2, which is why slide 2 has to deliver rather than
set up.

## Canvas and lockup

- **1080 x 1350 (4:5).** Tallest ratio the feed allows, so it occupies the most screen. The existing
  Remotion `SocialSquare` composition renders 1080 x 1080; a 4:5 variant has to be added before a
  deck can be rendered from `marketing/`. Until then, 1080 x 1080 is acceptable and 1:1 is what
  ships.
- **Safe area:** keep type 90px from every edge. The right 120px of every slide except the last
  holds the swipe affordance, so nothing important lives there.
- **Lockup, identical on every slide:** wordmark bottom-left at 48px, slide counter bottom-right
  (`2/5`). Same position, same size, same opacity, every frame. The repetition is what makes a deck
  read as one object rather than five posts.
- **Type:** Geist, two weights per slide maximum. Headline 72-96px, body 34-40px. If the body copy
  will not fit at 34px, the slide is carrying two ideas.
- **Colour:** one accent per deck. Brand green `#16a34a` / `#22c55e` by default; violet only on AI
  and Mind decks; gold only for streak and recap decks. Never three accents in one frame.
- **Annotation:** one white hand-drawn ellipse or arrow per slide, pointing at the exact control.
  Never a general area, never over a face or a number.

**Check for:** does slide 1 survive alone at thumbnail size; does every slide carry the same lockup
in the same place; is there exactly one idea per slide; does the last slide ask for one thing.
**Common issues:** a cover that is a title card rather than a promise; slide 2 restating slide 1;
the lockup drifting 20px between slides, which reads as sloppy at swipe speed; a CTA stacked onto
the last body slide so neither lands. **Strong patterns:** number the promise on the cover ("five
ways," "four items," "three taps") so the viewer knows the length; put the payoff on slide 2, not
slide 5; end on the same visual note the cover struck.

## Sourcing the slides

Every slide names its source before the deck is written. Product screens come from
`webapp/public/screenshots/v2/` (read `manifest.json` first) or from a fresh `screenshot-capture`
run on a dummy account. Never a real member's account, never a mockup, never an empty state, never
"(beta)" in frame, never a visible bug.

Two gaps worth knowing before you write: **whole-plate photo logging and the barcode scanner have no
capture in the v2 set.** `nutrition-meal-*.webp` shows itemized meals, but those meals were typed
through food search, not photographed, so the shot cannot stand in as photo-logging proof. Any deck
built on either mechanic needs a capture commissioned first, and the deck ships after the capture,
not before.

---

## Worked deck 1 — "Five ways Become logs your day", 6 slides

The modality deck. Ladder's exact structure, and the one to copy when a new hub ships.

| # | Visual | Headline | Body | Annotation |
|---|---|---|---|---|
| 1 | Dark cover, no screenshot, brand green gradient | **Five ways Become logs your day** | One app. Five things that usually live in five. | None. The cover stays clean |
| 2 | The itemized result of a plate photo (needs capture) | **A photo of the plate** | Chicken, rice, broccoli come back as separate lines with their own calories. | Ellipse on the itemized rows |
| 3 | Packaged item held to a phone (needs capture) | **A barcode, at the shelf** | Macros land before the box goes in the trolley. | Arrow to the scan control |
| 4 | `workout-log-dark.webp` | **Two numbers, mid-set** | The weight and the reps. "Last: 155 lbs × 10" is already sitting underneath. | Ellipse on the reference line |
| 5 | `dashboard-light.webp`, cropped to the check-in tiles | **A tap for weight and mood** | The two things everyone abandons first, reduced to one tap each. | Ellipse on the mood row |
| 6 | Flat CTA slide, brand green | **Start today** | We email you a sign-in link. No password, no card. | None |

**Cover-slide alternates:** "Five things you are logging in five apps" (pain-first), "Your whole day,
five taps" (outcome-first).
**Capture list:** slides 2 and 3 need new captures, of the photo-logging result and of a barcode
scan. Slides 4 and 5 exist today. `nutrition-meal-light.webp` looks like it would cover slide 2
and it does not: those meals were typed, and the headline says photo.
**CTA:** save. "Save this for the next time you open four apps to log one dinner."

---

## Worked deck 2 — "How one photo becomes a logged meal", 5 slides

The App Tip sequence as stills. One tap per slide, annotation on the exact control, payoff before
the ask.

| # | Visual | Headline | Body | Annotation |
|---|---|---|---|---|
| 1 | Hand lowering a phone over a full plate, real kitchen light | **One photo. The whole plate.** | You do not photograph each item. | None |
| 2 | Nutrition hub, camera control in frame (needs capture) | **Open Nutrition, tap the camera** | Step one, and the only step that needs a decision. | Ellipse on the camera control |
| 3 | Camera view framing the whole plate (needs capture) | **Shoot the plate, not the chicken** | One frame, everything on it, from above. | Arrow indicating the framing |
| 4 | Itemized result, per-item calories (needs capture) | **It comes back itemized** | Each item on its own line, with its own calories. Fix anything it missed. | Ellipse on one editable row |
| 5 | Flat CTA slide, brand green | **Start today** | We email you a sign-in link. No password, no card. | None |

**Cover-slide alternates:** "Stop typing 'chicken, rice, broccoli, olive oil'" (pain-first), "Four
items from one photo" (number-first).
**Capture list:** slides 2, 3, 4 all need a `screenshot-capture` run on the nutrition photo flow.
**This deck cannot ship until that run happens.** Do not substitute `nutrition-meal-light.webp`: its
meals were typed, and a deck that says "photograph it" over a screenshot of typed food is a
fabrication the first curious viewer will catch.
**CTA:** save, or `PLATE` keyword. The keyword reply has to be written before the deck posts, and it
is sent by hand.

---

## Worked deck 3 — "What a week actually looks like", 4 slides

The planning deck. Answers the question a cold visitor asks before they will sign up: what am I
being handed.

| # | Visual | Headline | Body | Annotation |
|---|---|---|---|---|
| 1 | `workout-hub-light.webp`, cropped to the week strip | **Your week is written before Monday** | Four training days, in order, already on the calendar. | Ellipse on the completed Monday check |
| 2 | `workout-hub-light.webp`, Continue Training card | **A coach built the phases** | Phase 1, day 2, eight sessions of sixteen done. You run it, you do not design it. | Ellipse on the progress line |
| 3 | `generate-light.webp` | **The day the plan does not fit** | Tell it the equipment in front of you and the time you have. It writes that session instead. | Ellipse on the equipment chips |
| 4 | Flat CTA slide, brand green | **Start today** | We email you a sign-in link. No password, no card. | None |

**Cover-slide alternates:** "You do not need to design a program. You need to run one." (reframe),
"Four sessions, in order, already scheduled" (number-first).
**Capture list:** all three product slides exist today. `generate-light.webp` shows the sheet
**filled but not submitted**, so slide 3 must describe the inputs, never show or imply a generated
output.
**CTA:** `WEEK1` keyword. Reply opens with what the first week actually contains, then the link.

---

## Banned in a carousel

- A slide with a zero state, an empty ring, a greyed-out grid, or "(beta)" anywhere in frame.
- Anything blurred out. If it needs redaction, re-capture from a dummy account.
- A results claim, a user count, a rating, a price, a tier, a trial, or a discount on any slide.
- Before-and-after framing, body-focused imagery, or a shaming line on the cover.
- Another member's data in any form, including a leaderboard or a comparison.
- A mechanic the product does not have. Nothing in Become watches a set or tallies repetitions;
  the camera belongs to plate logging, the barcode scanner, and the Mind mirror scene.
