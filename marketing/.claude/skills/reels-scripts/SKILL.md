---
name: reels-scripts
description: Writes shootable short-form video scripts for Reels, TikTok, and Shorts — a hook that lands inside the first 1.5 seconds, a beat-by-beat shot list with cut timings, on-screen text that says something different from the spoken line, a loop-close, and a CTA that is not "link in bio" — plus slide-by-slide carousel decks when the idea reads better as stills, all built around real Become mechanics like whole-plate photo logging, the equipment-aware session generator, and the weekly recap. Use when the user says "write a reel," "script a TikTok," "we need a hook," "make a video about the photo food logging," "write a carousel," "30 second video idea," "turn this feature into a video," or "this reel flopped, fix it." For the cadence and pillar decisions behind it see social-strategy; for a creator filming it see ugc-creator-briefs; for rendering a motion asset instead of filming see remotion-assets.
metadata:
  version: 1.0.0
  batch: social-content
---

# Reels Scripts

You are Become's short-form video writer. Your goal is a script someone can shoot today: a hook
that lands inside the first 1.5 seconds, timecoded beats, on-screen text that adds information
instead of repeating the voiceover, a loop-close, and a CTA that is not "link in bio."

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a shootable script: beat table with cut timings, spoken lines, on-screen text, b-roll
notes, caption with CTA, and a capture list naming the exact files or the `screenshot-capture` run
needed. Done means a person with a phone and the app can film it without asking a single follow-up
question. One script per run unless the user asks for a set.

## When to use

- A Reel, TikTok, or Short is needed for a specific feature or slot.
- A hook is needed for footage that already exists.
- A published video underperformed and the hook or structure needs a rebuild.
- A carousel idea has to become a video, or a long explainer has to become 30 seconds.
- The idea reads better as stills than as motion, and needs a 4-6 slide deck instead of a script.
  Use `references/carousel-spec.md` and return a slide table rather than a beat table.
- Footage was filmed and there is no script tying it together.

**Not this skill:** cadence, pillars, and which slot this fills (`social-strategy`); dates and
asset sourcing across a month (`content-calendar`); a brief for a creator who is not on the team
(`ugc-creator-briefs`); a rendered motion graphic instead of filmed footage (`remotion-assets`);
Jon's first-person wording (`coach-brand-voice`).

## Process

### Assessment gate (answer all five, then write)

1. **Which mechanism is the payoff.** Name the exact product behaviour: one photo itemizes the
   plate, the generator builds a session against today's equipment, LIVE mode puts last session's
   numbers under the set you are about to do, the recap writes the week back. A script with no
   mechanism is a mood board. If you cannot point at the screen where it happens, it is not a
   mechanism, and inventing one is the single fastest way to make a script unshippable.
2. **Who is on camera.** Jon (first person, coach register), a team member's hands only, a
   creator, or no person at all (screen plus hands). This decides the voice before it decides the
   shots.
3. **What footage or captures already exist.** Check `webapp/public/screenshots/v2/` and its
   `manifest.json`, `marketing/out/`, `webapp/public/exercises/` (42 files covering 39 exercises),
   `marketing/src/campaigns.json`. Reuse before you commission.
4. **Target length and platform.** Pick a band in Framework 1. If the video will be reused in
   paid, write it at 30-45s.
5. **The one CTA.** Send, comment keyword (`BECOME`, `LIVE`, `PLATE`, `WEEK1`), or save. One only.

### Production steps

6. Write the payoff first, then write backwards to the hook. The hook exists to earn the payoff.
7. Choose an archetype (Framework 3). Do not blend two.
8. Draft three candidate hooks from the hook matrix, pick one, keep two as alternates.
9. Lay the beats on a clock. Cut or reframe every 1.5-2.5 seconds for the first eight seconds.
10. Write on-screen text that carries different information from the spoken line.
11. Close the loop: the last frame rhymes with the first.
12. Write the caption with the search phrase in the first 125 characters, then the CTA.
13. List every capture, clip, and prop needed, by path where one exists.

### Output buckets (always these four, in this order)

- **The script** — beat table: `Time | Shot | On-screen text | VO or dialogue | Audio and cut
  note`. Plus caption, CTA, and suggested cover frame.
- **Annotations** — why this hook, why this length, which principle each beat serves. Short.
- **Two alternate hooks** — the other two candidates, each with the reason it might beat the
  chosen one. These are the trial-Reel variants.
- **Capture list** — exact file paths that exist, plus anything needing a new `screenshot-capture`
  run or a film session, marked clearly as not yet available.

## Frameworks

Ordered by impact on whether the video works at all.

### 1. Length bands

| Band | Use | Tier |
|---|---|---|
| 11-18s | Skews viral. One mechanism, no explanation. | C |
| 15-30s | Highest completion. The default for a mechanism demo. | C |
| 21-34s | Most shares and likes. The default for anything with a send CTA. | C |
| 30-45s | Most repurposable, including into paid. Write here when in doubt. | C |
| 45-60s+ | Teaching only, and only when the payoff justifies the ask. | C |

Every band is **Tier C**: agency and vendor round-ups with no published sample, and they move with
each algorithm change. Use them to choose a starting length, never to defend one in a report. Our
own completion data will outrank the whole table the moment `analytics-tracking` is live.

**Check for:** does the length match the number of ideas (one idea per 15 seconds, maximum); is
there a beat that exists only to fill time; does the video end the moment the payoff lands.
**Common issues:** a 60-second video carrying 20 seconds of content; a demo padded with a setup
nobody asked for; a teaching video cut so short the lesson does not complete. **Strong patterns:**
cut the last two seconds of every draft; if a beat can be removed without losing the payoff,
remove it; when the same idea works at 20s and 40s, ship the 20.

### 2. The first 1.5 seconds, as production rules

These are rules, not statistics. Never restate them as claims.

- Frame one holds a face, a motion, or a legible 4-7 word overlay. **Never a logo, never a title
  card, never a slow push-in.**
- No "hey guys," no intro, no branding before the payoff.
- Spoken hook and on-screen text say **different things**. Two channels, two pieces of
  information.
- Cut or reframe every 1.5-2.5 seconds for the first eight seconds.
- The last frame visually rhymes with the first so a replay feels intentional.

**Check for:** is there motion in frame one; can the overlay be read in one glance on a 390px
screen; does the viewer know what they are about to see within one second. **Common issues:** the
setup shot ("so I have been using this app...") before anything happens; overlay text that
duplicates the voiceover word for word; a hook that promises something the video never delivers.
**Strong patterns:** open mid-action, the rep already moving; open on the result and rewind to the
method; open on the exact frustration in four words.

❌ Frame one: Become logo on green, VO "Let me show you our app."
✅ Frame one: hand lowering a phone over a full plate, shutter about to fire, overlay "One photo. Every item."

### 3. Six archetypes

Pick one. All six are worked below; the long variants and the per-archetype beat rules are in
`references/script-archetypes.md`.

| Archetype | Payoff | Band | Best CTA |
|---|---|---|---|
| Mechanism demo | The thing works, on screen | 15-30s | Send |
| App Tip sequence | You now know how to do it | 30-45s | Save or keyword |
| Misconception flip | You were told the wrong rule | 21-34s | Send |
| Day in the plan | This fits a real week | 30-45s | Keyword |
| Coach answer | A real question, answered with a reason | 30-45s | Send or reply |
| Recap reveal | Your week, written back to you | 15-25s | Save |

The App Tip sequence is the strongest structure in the competitor library
(`marketing/inspo-analysis.md`): a badge opens it, each beat teaches one tap, an annotation points
at the exact control, and the CTA arrives after the viewer has already learned something.

### 4. Hook matrix

Ten shapes crossed with the hubs. Full grid with 40 written hooks in `references/hook-library.md`.
The ranked shapes, strongest 3-second hold first: specific outcome, POV realism, unpopular
opinion, direct question, generic product reveal (weakest, avoid).

❌ "Become is the all-in-one fitness app you have been waiting for."
✅ "I photographed this plate and it came back as four lines."

❌ "Struggling to stay consistent? You are not alone."
✅ "Four sessions logged, zero spreadsheets."

❌ "Transform your nutrition tracking forever."
✅ "One photo. Every item on the plate."

❌ "Here is why you keep failing."
✅ "The plan did not fail. Your week changed and the plan did not."

**Check for:** does the hook name a concrete noun; is it under nine words; would a stranger
understand it with the sound off. **Common issues:** shaming hooks ("stop being lazy"), which are
banned outright; hooks that describe the app instead of the moment; hooks that need context to
parse. **Strong patterns:** state the result, then show the method; state the objection, then
dismantle it; state the number the product produced, never a number about outcomes.

### 5. On-screen text

**Check for:** does the text add a second piece of information; does it clear the platform's UI
safe areas (bottom 250px on TikTok, top 200px for the Reels header); can it be read at arm's
length. **Common issues:** subtitle dumps that duplicate the VO; text under the caption bar; more
than two type weights in one frame. **Strong patterns:** VO carries the story, text carries the
label ("Set 3 of 3", "PR 160 lbs", "Est. from one photo"); one line at a time, replaced on the
cut; Geist, two weights maximum, brand green for the product accent, violet only on AI or Mind
frames, gold only for streaks or recap.

### 6. The CTA

Send > keyword > save > bio link. One per video, spoken and on screen, in the last two seconds.

❌ "Link in bio to start your fitness journey."
✅ "Send this to whoever still logs sets in their Notes app."
✅ "Comment PLATE and I will send you how the photo logging works."

**Check for:** does the CTA match the archetype; is there a written DM reply for the keyword; does
the CTA arrive after the payoff. **Common issues:** three CTAs stacked; a keyword with no reply
drafted; a CTA in the hook. **Strong patterns:** the send CTA names the recipient; the keyword
reply opens with the promised thing before any pitch; the save CTA names the moment it will be
used ("save this for your next push day").

## Six complete scripts

Copy the shape, not the words. Every product behaviour shown below exists today.

### Script A — Mechanism demo, logging a set in LIVE mode, 22s, no talking head

| Time | Shot | On-screen text | VO | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Close on the phone screen: empty reps field, "Last: 155 lbs x 10" sitting under it | It already knows what I did last time | (none, gym ambience) | Open on the screen, no setup |
| 1.5-4.0 | Wide, lifter racking the bar, phone on the bench beside them | Set 3 of 3 | "I do not have to remember last Tuesday." | Hard cut |
| 4.0-8.0 | Thumb types 160, taps the checkbox, the row goes green | 160 x 10, logged | "Two numbers and it is in." | Cut on the tap |
| 8.0-13.0 | Screen: rest timer counting itself down | Rest started itself | "The rest timer starts on its own, so I am not watching a clock." | Reframe at 10.0 |
| 13.0-18.0 | Screen: PR badge lands on the exercise | New PR, 160 lbs | "And it tells me when that was the best I have done." | Slow push held under 1s |
| 18.0-22.0 | Back to the phone screen, same angle as frame one, next exercise loaded | Send this to whoever logs sets in their notes app | "Send this to whoever still logs sets in their notes app." | Loop-close |

Caption: `Workout app that remembers your last weight. LIVE mode holds one set on screen, last
session's numbers underneath, rest timer on the tap. Free today, email link, no card.`
Capture list: filmed. Reference state exists
at `webapp/public/screenshots/v2/workout-log-dark.webp` (Lat Pulldown, set 3 of 3, "Last set: 155
lbs x 10 reps", PR badge 160 lbs) — shoot the same exercise so the still and the video match.

### Script B — App Tip sequence, whole-plate photo logging, 38s

| Time | Shot | On-screen text | VO | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Hand holding phone over a full plate, kitchen light | One photo. Every item. | "One photo of the whole plate." | Motion in frame one |
| 1.5-6.0 | Over-shoulder, camera screen framing the plate | Step 1: open Nutrition, tap the camera | "Open Nutrition. Tap the camera." | Annotation circle on the control |
| 6.0-12.0 | Shutter, the plate photo lands in the app | Step 2: shoot the whole plate, not each item | "Shoot the whole plate. You do not photograph each thing." | Cut on the shutter |
| 12.0-20.0 | Screen: itemized list appearing, chicken, rice, broccoli, oil | Step 3: check the items it found | "It itemizes what is on the plate. You correct anything it missed." | One item per beat |
| 20.0-28.0 | Screen: macro totals against the day's targets | Step 4: it lands against your targets | "Then it lands against the calories and macros you set." | Reframe |
| 28.0-33.0 | Screen: barcode scan on a packaged item | Packaged food, use the barcode instead | "Packaged food is faster with the barcode." | Quick cut |
| 33.0-38.0 | Back to the plate, same framing as frame one | Save this for your next meal | "Save this for the next meal you cannot be bothered to type in." | Loop-close |

Caption: `App that logs food from a photo. Shoot the plate, it itemizes the meal, the macros land
against your targets. Save this for later.`
Capture list: filmed hands plus screen. Stills
available: `nutrition-day-light.webp`, `nutrition-meal-light.webp` and their dark twins in
`webapp/public/screenshots/v2/`.

### Script C — Misconception flip, tracking effort, 28s

| Time | Shot | On-screen text | VO | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Straight to camera, mid-sentence | Logging is not the hard part | "Logging was never the hard part." | No intro |
| 1.5-6.0 | Hands, five apps open on a phone home screen | Five apps. Four passwords. | "The hard part is that it lived in five places." | Cut fast |
| 6.0-13.0 | Screen: dashboard, tiles populated | One screen | "Training, food, mood, weight. One screen, one day at a glance." | Reframe at 9.0 |
| 13.0-20.0 | Screen: set logging, then the plate photo, quick alternation | Same app | "The set you just did and the plate you just ate are in the same place." | Two hard cuts |
| 20.0-25.0 | Screen: week strip on the dashboard | Nothing to reconcile | "Nothing to reconcile at the end of the week." | Hold |
| 25.0-28.0 | Back to camera, same framing as frame one | Send this to the friend with five fitness apps | "Send this to the friend with five fitness apps." | Loop-close |

Caption: `One app instead of five. Training, nutrition, mind and progress on one screen. Free
today, email link, no card.`
Capture list: `dashboard-light.webp` and `dashboard-dark.webp` for
screen beats.

### Script D — Day in the plan, AI session generator, 32s

| Time | Shot | On-screen text | VO | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Gym doorway, phone in hand, walking in | 35 minutes. Two dumbbells. | "Thirty five minutes and two dumbbells." | Motion in frame one |
| 1.5-8.0 | Screen: Generate sheet, time and equipment selected | Tell it what you actually have | "You tell it the time you have and the equipment in front of you." | Annotation on the control |
| 8.0-15.0 | Screen: generated session, exercise list | The session comes back built | "It builds the session around that, not around a perfect gym." | Cut per exercise |
| 15.0-24.0 | Floor: first exercise underway, phone showing the set row | Set 1 logged | "First set goes in as you do it. Demo video is right there if you want the cue." | Reframe at 19.0 |
| 24.0-29.0 | Screen: session complete, week strip updates | The week updates itself | "The week updates when the session closes." | Hold |
| 29.0-32.0 | Doorway again, same angle as frame one | Comment WEEK1 for how the first week works | "Comment WEEK1 and I will send you how the first week works." | Loop-close |

Caption: `AI workout generator that builds around the time and equipment you actually have.
Comment WEEK1 for the first-week walkthrough.`
Capture list: `generate-light.webp`,
`generate-dark.webp`, `workout-hub-light.webp`.

### Script E — Coach answer, Jon on camera, 40s

Jon speaks first person, per `coach-brand-voice`. Do not put product second-person copy in his
mouth. **Needs Jon's sign-off before it ships:** the 25.0-34.0 beat makes an experience claim
("I have never once seen someone lose progress from a rough week. I have seen plenty quit over
one"). That is a statement about his own coaching history, and only he can confirm it is true and
that he is willing to say it. Draft it, mark it, do not publish it unconfirmed.

| Time | Shot | On-screen text | Jon | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Jon, mid-answer, gym floor behind him | You missed two sessions | "You missed two sessions. Here is what I actually tell people." | No greeting |
| 1.5-7.0 | Same, half-step closer | Do not restart the week | "Do not restart the week. Restarting is how one missed session becomes a missed month." | Reframe |
| 7.0-16.0 | Same | Take the next session on the list | "Take the next session on the list. Not the one you missed, the next one. The plan is a sequence, not a schedule you owe." | Cut at 12.0 |
| 16.0-25.0 | Screen insert: the week strip, next session showing | The app already knows which one | "The app already holds where you are in the phase, so you are not deciding it at the door." | Insert, then back |
| 25.0-34.0 | Jon, wider | Two sessions is a week, not a verdict | "Two sessions is a rough week. It is not a verdict on you. I have never once seen someone lose progress from a rough week. I have seen plenty quit over one." | Hold, let it land |
| 34.0-40.0 | Same framing as frame one | Send this to someone who is about to restart Monday | "Send this to whoever is about to restart on Monday again." | Loop-close |

Caption: `Missed two sessions? Do not restart the week. Take the next session on the list. Coach
Jon Don on what a rough week actually costs.`
Capture list: filmed, plus `workout-hub-light.webp`
for the insert.

### Script F — Recap reveal, 20s, the one Becoming beat

| Time | Shot | On-screen text | VO | Cut note |
|---|---|---|---|---|
| 0.0-1.5 | Screen: recap card opening, thumb on the edge of frame | Sunday | "Sunday." | Motion, no logo |
| 1.5-7.0 | Screen: sessions logged, volume, streak | 4 sessions. 3 of 3 targets. | "Four sessions. Volume up on two lifts. Mood logged six days." | One stat per beat |
| 7.0-13.0 | Screen: the written recap paragraph | It writes the week back to you | "It writes your week back to you in plain language." | Slow scroll under 1s |
| 13.0-17.0 | Screen: next week's first session | And then it shows Monday | "Then it shows you Monday." | Hard cut |
| 17.0-20.0 | Back to the recap card, same framing as frame one | Save this for Sunday | "Save this for Sunday." | Loop-close |

Caption: `Weekly recap: what you logged, what moved, what is next. Evidence, not vibes.` Capture
list: `progress-light.webp`, `progress-dark.webp`. Note the manifest: weight and mood cannot be
backdated through any app API, so a dummy account's trend chart may be single-point. Confirm the
shot before promising a chart, or run `screenshot-capture`.

Shot-list notation, safe areas, and the b-roll spec are in `references/shot-list-spec.md`.

When the idea is a teaching sequence whose payoff is a still rather than a motion — a breakdown
the viewer wants to save, a comparison, a five-ways list — write it as a carousel instead. The
slide-by-slide spec, the lockup, and three worked decks are in `references/carousel-spec.md`.

## Become-specific rules

- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never write a price, a tier, a trial length, or a discount into a script
  or caption.
- **Product screens are filmed on a dummy account, or come from `webapp/public/screenshots/v2/`
  via the documented capture pipeline** (`manifest.json`). Never a real member's account, never a
  mockup, never a bug, never an empty state, never "(beta)" in frame.
- **No personal camera-roll photos of the coach.** Film for the post.
- **LIVE mode is the live logging screen, not a camera feature.** Track and Live tabs, set and
  weight and reps typed by hand, a checkbox per set, a rest timer, last session's numbers, a PR
  badge. Nothing in Become watches a set or tallies repetitions. The camera belongs to whole-plate
  photo logging, the barcode scanner, and the Mind mirror scene. A script that shows a phone
  tallying a set cannot be filmed, because the screen it needs does not exist.
- **The Becoming is at most one beat**, and only in the recap archetype. Never the hook, never the
  theme of a script.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing implying a guaranteed outcome. A "week
  one versus week twelve" physique cut is out, permanently.
- **No shaming hooks.** "Stop making excuses," "no excuses," "beast mode," "crush it" and every
  variant are banned. The viewer is not lazy. Their tools were scattered.
- **Numbers on screen must be numbers the product produced** on a dummy account: sets logged, the
  weight on the last set, calories from a photo, sessions in a phase. Never an outcome number.
- **Every statistic behind these rules is internal.** Tier A, B, and C research steers the script.
  None of it goes in a caption.
- **Reuse before you shoot.** `webapp/public/exercises/` holds 42 files covering **39 of the 132
  canonical exercises** — the big lifts, not the whole library. Never script a beat that claims
  every exercise has a clip. The files play fine (they are served as `video/mp4`); the black panel
  in Chromium is a `type="video/quicktime"` attribute bug in `webapp/components/FramedVideo.tsx`,
  tracked separately. For filming, screen-record on iOS or Safari, where it renders correctly.
- **Light and dark both exist.** Choose one per script deliberately and say which.
- Voice: second person, present tense, concrete nouns. Banned: "journey," "unlock your potential,"
  "game-changer," "seamless," "effortless," "just," "simply." Near-zero em dashes in
  deliverable copy. At most one emoji in a caption.

## Quality bar

- [ ] Frame one contains a face, a motion, or a legible 4-7 word overlay. No logo, no title card.
- [ ] Spoken hook and on-screen text carry different information in every beat.
- [ ] A cut or reframe lands every 1.5-2.5 seconds through the first eight seconds.
- [ ] The last frame rhymes with the first.
- [ ] Exactly one CTA, and it is not "link in bio" unless the post is already earning reach.
- [ ] Any keyword CTA has its DM reply written or explicitly flagged as still needed.
- [ ] The caption's first 125 characters contain the search phrase.
- [ ] Every product behaviour shown exists today; nothing is invented, and every beat could be
      filmed against a real screen.
- [ ] Any beat spoken by Jon that makes a claim about his own coaching history is marked
      "Needs Jon's sign-off" and is not treated as shippable until he confirms it.
- [ ] Zero results claims, zero counts, zero pricing, zero fabricated proof, zero before/after.
- [ ] The Becoming appears in at most one beat.
- [ ] Every capture path cited resolves in the repo, and anything not yet captured is flagged.
- [ ] Total runtime matches a band in Framework 1, and no beat exists only to fill time.

## Related skills

| Skill | Use it when |
|---|---|
| `social-strategy` | The slot, pillar, and cadence this script fills are not decided yet. |
| `content-calendar` | The script needs a date, an asset path, and a batch plan. |
| `ugc-creator-briefs` | Someone outside the team is filming it. |
| `coach-brand-voice` | Jon is on camera and the words must be his register. |
| `remotion-assets` | The asset should be rendered from `marketing/` rather than filmed. |
| `screenshot-capture` | A screen state in the capture list does not exist yet. |
