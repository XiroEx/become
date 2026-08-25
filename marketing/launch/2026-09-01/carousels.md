# Carousel decks: launch 2026-09-01

> **Superseded in part at the Tue 8/25 readiness review — see `content-calendar.md` R-14.** For
> the Fri 9/4 pinned One Tap slot, the "Five hubs" deck (`captions-week1.md` `C-20`, committed
> captures only) wins; **deck 1 below is held for the week-3 One Tap (Wed 9/16)**. For every
> composited deck: `captions-week1.md` wins on slide lines and captions where the two differ;
> this file's §0 wins on production mechanics. Output filenames use the calendar spelling
> (`onetap01-01.png`). Deck due dates follow `content-calendar.md` §4 (slide pass 1 = Thu 8/27).

Three complete decks, built to `reels-scripts/references/carousel-spec.md`. Every slide names its
source before the copy, and every source resolves in this worktree today or is produced inside the
Sat 8/29 film batch already scheduled in `reels-pack.md` §A.

Companion doc: `reels-pack.md` (eight Reel scripts). Between them they are the full creative set
`launch-plan.md` §6 asks for, minus `MECH-01` and `QA-01`, which are logged as owed in
`reels-pack.md` §E.

---

## 0. Shared production spec

Applies to all three decks. `image-production` composites; no new image dependency. `sharp` is
already in `webapp/package.json`.

| Thing | Value |
|---|---|
| Canvas | **1080 x 1350 (4:5)**, matching `accounts-setup.md` §5.1's pin-1 slides |
| Remotion caveat | `SocialSquare` renders 1080 x 1080 and no 4:5 variant exists. These decks are **composited by `image-production` from `sharp`, not rendered by Remotion**, so the gap does not block them. If a deck is ever moved into Remotion, the 4:5 composition has to be added first |
| Safe area | Type stays 90px from every edge |
| Swipe gutter | Right 120px of every slide **except the last** holds nothing important |
| Lockup | Wordmark `BECOME` bottom-left at 48px; slide counter bottom-right (`2/6`). Identical position, size and opacity on every slide of a deck. The repetition is what makes six files read as one object at swipe speed |
| Type | Geist. Two weights per slide, maximum. Headline 72-96px, body 34-40px. If body copy will not fit at 34px, the slide is carrying two ideas and must be split |
| Annotation | Exactly one per slide. White hand-drawn ellipse or single arrow, pointing at the exact control named in the copy. Never over a face, a number, or the CTA. Cover and CTA slides carry none |
| Accent | One per deck, stated per deck below. Never three accents in one frame |
| Device frame | None. The captures are already 780x1688 phone-viewport shots; a drawn phone bezel around a phone screenshot reads as a mockup |

**Output paths**, following the `accounts-setup.md` §5.1 convention:

```
marketing/out/social/onetap01-01.png … onetap01-06.png
marketing/out/social/ptw01-01.png    … ptw01-05.png
marketing/out/social/onetap02-01.png … onetap02-05.png
```

*(Filenames fixed 8/25 to `content-calendar.md`'s spelling — no hyphen inside the deck ID — per
`assets-manifest.md` F8; the calendar is the posting surface, so its spelling wins. Read the
hyphenated slide IDs in the handoff table below as these filenames.)*

**`marketing/out/` is gitignored and does not exist in this worktree.** Per `launch-plan.md` T-6
12:00, George copies the frozen launch asset set into a durable local folder and records the path.
No slide below depends on any file already inside `out/`. Every source is either a committed v2
capture or Saturday footage.

### Banned on every slide, restated

Zero state, empty ring, greyed-out grid, or "(beta)" anywhere in frame. Anything blurred or
redacted; re-crop instead. Any results claim, user count, rating, price, tier, trial or discount.
Before-and-after or body-focused imagery. Another member's data in any form. Any mechanic the
product does not have: **nothing in Become watches a set or tallies reps**, and no slide may imply
it. Human coach chat is admin-gated behind a "Coming Soon" `FeatureGuard`, so no slide may promise a
reply from Jon inside the app.

### The Becoming

**Not named on any slide in any of these three decks.** The single permitted mention for this
launch is spent in `reels-pack.md` §5, `RYW-01` beat 11.5-15.0. This is a deliberate change from
`launch-plan.md` line 325, which had assigned it to a `RYW-01` carousel; that carousel became a
Reel (conflict C3 in `reels-pack.md` §C) and the budget travelled with it.

---

# Deck 1: `ONETAP-01`

**"Four things on your screen while you log a set."**

| | |
|---|---|
| Slot | One Tap (Wednesday pillar, running Fri 9/4 to land inside launch week) |
| Runs | **Fri 9/4 12:00**, brand Instagram |
| Slides | 6 |
| Theme | **Dark** |
| Accent | Brand green `#22c55e` on the dark field |
| CTA | Save |
| `utm_content` | `onetap-01` |
| Produced by | `image-production`, due **Thu 8/27** per `content-calendar.md` §4 slide pass 1 (this doc's later 9/3 date loses; staging everything before the Fri 8/28 freeze is the whole point of the freeze) |

**Why this deck exists as stills:** LIVE mode has one committed capture and it is dark only. The
Reel (`WIW-02`) sells the flow; this deck sells the four things sitting on the screen *while* the
flow happens, which is a list a viewer screenshots. The cover numbers the promise so the length is
known before slide 2.

**Deviation from `launch-plan.md` §6:** the plan specified 6 slides and this is 6 slides, but the
shape changed: the payoff moved to slide 2 rather than building to it, per the spec's drop-off
rule.

| # | Source asset and crop | Headline (72-96px) | Body (34-40px) | Annotation |
|---|---|---|---|---|
| 1 | No screenshot. Flat `#0a0a0a` field with a `#22c55e` gradient rising from the lower-left corner | **Four things on your screen while you log a set** | None of them are your memory. | None. The cover stays clean |
| 2 | `webapp/public/screenshots/v2/workout-log-dark.webp`, cropped to the weight field and the reference line directly beneath it, ~1:1 region upscaled to fill the top 60% | **Last session's numbers, under the field** | "Last set: 155 lbs × 10 reps" sits under the box you are typing into. You are not guessing at the number, you are beating it. | White ellipse on the reference line |
| 3 | `webapp/public/screenshots/v2/workout-log-dark.webp`, cropped to the exercise row carrying the PR badge | **A badge when it is your best** | The app knows what your best on that lift was, so a personal record is a thing that appears, not a thing you have to notice. | White ellipse on the PR badge |
| 4 | Frame grab from Saturday setup 2 (`reels-pack.md` §A.2) at the rest-timer beat, exported at 780px wide to match the capture set | **A rest timer that starts itself** | You tick the set off and it starts counting. Nothing to set, nothing to watch. | White ellipse on the running timer |
| 5 | Frame grab from Saturday setup 2 at the demo-clip beat, **shot on iOS/Safari** | **The demo runs behind the controls** | On the big lifts the movement clip plays behind the logging controls. Thirty-nine of the hundred and thirty-two exercises have one, and they are the ones you would want it for. | White arrow to the video panel behind the controls |
| 6 | Flat `#0a0a0a` field, `#22c55e` block | **Start today** | We email you a sign-in link. No password, no card. Free today. | None |

**Cover-slide alternates:**
- *Pain-first:* "You have already forgotten what you lifted last Tuesday." Stronger recognition, but
  it stops being a countable promise, and the countable promise is what makes a deck get swiped.
- *Reframe:* "A set log that argues with your memory." Better line, worse cover. It does not tell
  the viewer how long the deck is.

**Capture list:**
- Slides 2 and 3 exist today: `webapp/public/screenshots/v2/workout-log-dark.webp` (Lat Pulldown,
  Exercise 4/8, Set 3/3, 46% complete, "Last set: 155 lbs × 10 reps", PR badge 160 lbs).
- Slides 4 and 5 come from **Saturday setup 2**, which is already scheduled and is the same
  recording that feeds `WIW-02` and the `CA-01` insert. No extra shoot.
- **If Saturday setup 2 does not happen**, slides 4 and 5 are cut and the deck ships as 4 slides
  with the cover changed to "Two things on your screen while you log a set." Four slides is the
  floor; three is a static post wearing a costume.

**Caption, final:**

```
Workout logging that keeps your last numbers on the screen. Four things sit there while you enter a
set: what you lifted last session, a PR badge when it is your best on that lift, a rest timer that
starts when you tick the set off, and the demo clip playing behind the controls on the big lifts.

You type the weight and the reps. Nothing here watches you train, and the point is that you are not
trying to remember anything.

Free today. Email link, no card.

Save this for your next session.
```

**Constraint notes for whoever composites this:**
- Slide 5's body says "thirty-nine of the hundred and thirty-two." **Never "every exercise."**
  `webapp/public/exercises/` holds 42 files covering 39 movements; 42 is a file count.
- Every number on slides 2 and 3 was produced by the product on a dummy account. None of them is an
  outcome claim and none may be captioned as one.
- Crop slides 2-5 tight. A full 780x1688 screen shrunk into a 1080x1350 frame is unreadable at
  thumb distance, and unreadable is the only failure mode this deck has.

---

# Deck 2: `PTW-01`

**"Four sessions, in order, before Monday."**

| | |
|---|---|
| Slot | Plan The Week |
| Runs | **Sat 9/5 11:00**, brand Instagram |
| Slides | 5 |
| Theme | **Light** |
| Accent | Brand green `#16a34a` |
| CTA | Keyword `WEEK1` |
| `utm_content` | `ptw-01` |
| Produced by | `image-production`, due **Fri 9/4 18:00** |

**Why this deck exists:** it answers the question a cold visitor asks before they will sign up:
what am I actually being handed. Every source already exists, so it is the one launch asset with
zero production risk, which is why it also serves as the fallback if the Saturday batch collapses.

| # | Source asset and crop | Headline | Body | Annotation |
|---|---|---|---|---|
| 1 | No screenshot. Warm white field, `#16a34a` rule under the headline | **Four sessions, in order, before Monday** | You do not design the week. You run it. | None |
| 2 | `webapp/public/screenshots/v2/workout-hub-light.webp`, cropped to the Continue Training card | **A coach already wrote the phases** | Phase 1, day 2. Eight sessions of sixteen done. The progression is written into the program, so the only decision left is whether you turn up. | White ellipse on the phase and progress line |
| 3 | `webapp/public/screenshots/v2/workout-hub-light.webp`, cropped to the This Week strip | **The week is already on the calendar** | Your training days, in order, with the ones you have finished ticked off. Monday closed itself when the session did. | White ellipse on the completed Monday check |
| 4 | `webapp/public/screenshots/v2/generate-light.webp`, cropped to the Focus, Difficulty and Equipment rows | **The day the plan does not fit the room** | Tell it what you are training and only the equipment actually in front of you. It writes that session instead of the one you cannot do. | White ellipse on the equipment chips |
| 5 | Warm white field, `#16a34a` block | **Start today** | We email you a sign-in link. No password, no card. Free today. | None |

**Cover-slide alternates:**
- *Reframe:* "You do not need to design a program. You need to run one." The strongest line in the
  deck, but it promises nothing countable and the countable promise is the cover's job.
- *Pain-first:* "The plan is in a notes file and the notes file is out of date." True to the App
  Juggler persona; slightly long to set at 72px without wrapping to three lines.

**Capture list. All four product slides exist today. Nothing here needs a shoot.**

Two hard constraints on the sources:
1. **`generate-light.webp` shows the sheet filled but not submitted.** Slide 4 therefore describes
   the inputs only. It may never show, imply, or caption a generated session. The generated output
   lives in `GEN-01` (`reels-pack.md` §4), which is filmed footage of a real submission.
2. **`workout-hub-light.webp` also contains the Recommended-for-You row** naming "12 Week Fat-Loss
   Foundation" and "30-Day Shred". Slides 2 and 3 crop **above** that row. It is uncropped only
   after Jon confirms both are live program names under exactly those strings
   (`jon-checklist.md` Wed 8/26, check V4 in `reels-pack.md` §A.3). Re-crop, never blur.

**Caption, final:**

```
Workout program app where the week is written before Monday. Coach-built multi-phase programs with
the progression already in them, your training days on a calendar, and the finished sessions ticked
off as you go.

For the day the plan does not fit the room you are standing in, tell the generator what equipment is
actually there and it writes that session instead.

Free today. Email link, no card.

Comment WEEK1 and I will send you what the first week contains.
```

**CTA note:** the `WEEK1` DM reply is already written in `accounts-setup.md` §6.1 and must be saved
somewhere pasteable on George's phone (task G11) before this posts. A keyword with no reply reads as
bait. Saturday is a low-attention day for replies. If George cannot commit to answering within a
few hours, swap the CTA to save: "Save this for the Sunday you plan the week."

---

# Deck 3: `ONETAP-02`

**"Three things your training app does not log."**

| | |
|---|---|
| Slot | One Tap (week 2) |
| Runs | **Wed 9/9 12:00**, brand Instagram |
| Slides | 5 |
| Theme | **Dark** |
| Accent | Violet. See the colour note below. One accent only; no green anywhere except the wordmark |
| CTA | Save |
| `utm_content` | `onetap-02` |
| Produced by | `image-production`, due **Mon 9/7 18:00** |

**Why this deck exists:** Mind has zero launch-week content in `launch-plan.md` §6, and it is one of
the five hubs the product actually sells. It is also the cheapest deck in this doc. Every source is
a committed capture and it needs no footage, which is exactly what week 2 needs, since there is no
second film session scheduled.

**Colour note, and it is a real open item.** `become-context.md` §10 assigns violet to AI and Mind
but gives no hex, and the Remotion pillar map's `mindset #9818FF` does **not** match the brand
tokens and is unreconciled (open question 8). Do not invent a value and do not use `#9818FF`.
**Sample the violet directly out of `mind-dark.webp`'s own UI**, so the deck matches the product
surface it is showing, and record the sampled hex in this deck's production notes. If sampling is
ambiguous, ship the deck in green and lose nothing.

| # | Source asset and crop | Headline | Body | Annotation |
|---|---|---|---|---|
| 1 | No screenshot. Flat `#0a0a0a` field with a violet gradient rising from the lower-right | **Three things your training app does not log** | All three change what the training numbers mean. | None |
| 2 | `webapp/public/screenshots/v2/dashboard-dark.webp`, cropped to the Today's Mood tile | **How the week actually felt** | One tap a day, sitting on the same screen as your volume and your weight. A hard week and a flat week look identical in a set log and nothing like each other here. | White ellipse on the mood row |
| 3 | `webapp/public/screenshots/v2/mind-dark.webp`, cropped to the Suggested Next card | **The next session is already picked** | Short guided sessions with the next one chosen for you, the same way the training side chooses the next workout. | White ellipse on the Suggested Next card |
| 4 | `webapp/public/screenshots/v2/mind-dark.webp`, cropped to the Training Grounds row, **crop above the locked dashed cards at the bottom fold** | **Modules, in order, like a program** | State Shift, Self-Image, Mission. It runs as a sequence rather than a feed of quotes, and it unlocks the way a phase does. | White ellipse on one unlocked module |
| 5 | Flat `#0a0a0a` field, violet block | **Start today** | We email you a sign-in link. No password, no card. Free today. | None |

**Cover-slide alternates:**
- *Direct question:* "Do you know which week you felt worst this month?" Strong hook, but a question
  cover under-performs a numbered promise for saves, and saves are what this deck is for.
- *Unpopular opinion:* "Mood is training data. Most apps throw it away." Good line, and it is the
  thesis of slide 2, and moving it to the cover leaves slide 2 restating the cover, which is the exact
  failure the spec calls out.

**Capture list. All three product slides exist today.**

Three constraints on the sources:
1. **Crop slide 4 above the locked dashed cards.** The manifest records them as real progressive
   disclosure rather than an empty state, and that is true, but a greyed dashed grid in frame reads
   as a zero state at swipe speed and the spec bans the look, not just the state.
2. **`mind-dark.webp` carries a session cooldown counter** ("Next in 14h 55m" in the dark shot,
   "19h 41m" in the light). Main sessions are gated to one per 20 hours. Keep the counter out of
   frame and never write copy implying a daily session.
3. **No session-length claim anywhere on this deck.** The landing page's "most run under three
   minutes" is `become-context.md` open question 5, already public and still unverified. It does not
   get repeated here until somebody checks it.

**Caption, final:**

```
Fitness app that logs mood and a short mind session next to your training. Three things sit on the
same screen as your volume: how the day actually felt, a guided session with the next one already
chosen, and the identity modules that unlock in sequence the way a training phase does.

A hard week and a flat week look identical in a set log. They look nothing like each other when the
mood is on the same page.

Free today. Email link, no card.

Save this for the week that goes sideways.
```

---

## Production handoff: one table

Everything `image-production` needs. All paths repo-relative.

| Slide | Source | Crop target | Output |
|---|---|---|---|
| `onetap-01-01` | none | flat `#0a0a0a` + `#22c55e` gradient | 1080x1350 |
| `onetap-01-02` | `webapp/public/screenshots/v2/workout-log-dark.webp` | weight field + reference line | 1080x1350 |
| `onetap-01-03` | `webapp/public/screenshots/v2/workout-log-dark.webp` | exercise row with PR badge | 1080x1350 |
| `onetap-01-04` | Sat 8/29 setup 2 frame grab | rest timer running | 1080x1350 |
| `onetap-01-05` | Sat 8/29 setup 2 frame grab (iOS/Safari) | demo panel behind controls | 1080x1350 |
| `onetap-01-06` | none | flat `#0a0a0a` + `#22c55e` block | 1080x1350 |
| `ptw-01-01` | none | warm white + `#16a34a` rule | 1080x1350 |
| `ptw-01-02` | `webapp/public/screenshots/v2/workout-hub-light.webp` | Continue Training card, **above the Recommended row** | 1080x1350 |
| `ptw-01-03` | `webapp/public/screenshots/v2/workout-hub-light.webp` | This Week strip | 1080x1350 |
| `ptw-01-04` | `webapp/public/screenshots/v2/generate-light.webp` | Focus / Difficulty / Equipment rows, **inputs only** | 1080x1350 |
| `ptw-01-05` | none | warm white + `#16a34a` block | 1080x1350 |
| `onetap-02-01` | none | flat `#0a0a0a` + sampled violet gradient | 1080x1350 |
| `onetap-02-02` | `webapp/public/screenshots/v2/dashboard-dark.webp` | Today's Mood tile | 1080x1350 |
| `onetap-02-03` | `webapp/public/screenshots/v2/mind-dark.webp` | Suggested Next card, **cooldown counter out of frame** | 1080x1350 |
| `onetap-02-04` | `webapp/public/screenshots/v2/mind-dark.webp` | Training Grounds row, **above the locked dashed cards** | 1080x1350 |
| `onetap-02-05` | none | flat `#0a0a0a` + sampled violet block | 1080x1350 |

## Quality bar, checked against these decks

- Every cover promises something countable and survives alone, muted, at thumbnail size. None is a title card.
- Slide 2 delivers the payoff in all three decks; none of them sets up.
- One idea per slide. No slide body contains "and" joining two mechanics.
- Identical lockup position, size and opacity across every slide of a deck.
- One accent per deck. The violet is sampled from the product, never invented, and the deck ships green if sampling is ambiguous.
- Exactly one annotation per body slide, pointing at the named control. Covers and CTA slides carry none.
- Every CTA slide is the same frame and asks for one thing: email link, no card, free today.
- Every source path resolves in this worktree today, except `onetap-01-04/05`, which come from footage already scheduled in the Sat 8/29 batch, with a stated 4-slide fallback if it does not happen.
- No fabricated capture substitution. `nutrition-meal-*.webp` is not used anywhere in these decks, because a photo claim over typed food is the exact fabrication the spec warns about.
- Zero results claims, counts, ratings, prices, tiers, trials, discounts, before/after, or other members' data.
- The Becoming is named on no slide.
- Nothing implies the camera watches a set, and nothing promises a reply from Jon inside the app.
