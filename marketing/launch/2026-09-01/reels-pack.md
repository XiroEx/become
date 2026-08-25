# Reels pack: launch 2026-09-01

Eight shootable scripts. Produced by `reels-scripts` against `launch-plan.md` §6. Every product
behaviour below exists today and is traceable to `marketing/.agents/become-context.md` or to
`webapp/public/screenshots/v2/manifest.json`.

**Read before shooting:** §A (the one filming batch), §B (theme lock and the three capture bugs
that decide it), §C (conflicts with the parallel docs, resolved). Scripts start at §1.

---

## A. The one filming batch: Saturday 2026-08-29, 09:00-13:00

Per `launch-plan.md` T-3 and `jon-checklist.md`. One session. Nothing on this list is filmed twice.

### A.1 Jon on camera, 4 items, 09:00-11:15

| Order | ID | Script | Runtime | Wardrobe | Location | Takes |
|---|---|---|---|---|---|---|
| 1 | `LAUNCH-HERO` | §1 | 38s | Training clothes | Gym floor, racks behind | 3, then move on |
| 2 | `CA-01` | §7 | 40s | Same | Gym floor, same mark | 3 |
| 3 | `CA-02` | §6 | 28s | Same | Gym floor, same mark | 3 |
| 4 | `LAUNCH-BTS` | §8 | 36s | Same | Seated, off the floor, window light | 3 |

Same clothes across all four so cutdowns and story frames intercut. `LAUNCH-HERO` first while Jon
is fresh. Three takes each; the second is usually the one.

**One pickup, 5 minutes, after item 4:** `WARM-01` story frames (§8.5). Jon, phone-held, vertical,
two 5-second direct-to-camera lines. This is a delta from `jon-checklist.md`, which schedules the
Tue 09:30 story but gives it no script. It costs five minutes and it removes the risk of Jon
improvising the first thing his warm audience sees on launch morning. **Owner: George adds it to
the Saturday call sheet. Cut it first if the morning runs past 11:30.**

### A.2 George, screen recordings, 4 setups, 11:15-13:00

Dummy account `playwright-test-mobile1@become.test` (Alex Rivera). Real phone, full brightness,
do-not-disturb, tutorial overlays already dismissed on that account per the manifest `seeding`
block. **iOS or Safari only**. See §B.3.

| Order | Setup | Feeds | Theme | Minutes | Drop order |
|---|---|---|---|---|---|
| 1 | Plate photo, end to end | `WIW-01` (§2), `CA-02` inserts (§6), `MECH-01` (not in this pack) | Light | 30 | Never drop |
| 2 | LIVE set logging, end to end | `WIW-02` (§3), `CA-01` insert (§7), `LAUNCH-HERO` insert (§1) | Dark | 25 | Never drop |
| 3 | Generate sheet, submitted once | `GEN-01` (§4) | Light | 25 | Drop 2nd |
| 4 | Weekly recap / progress | `RYW-01` (§5) | Light | 15 | **Drop 1st** |

`accounts-setup.md` §8 task G5 lists three recordings. This pack needs four: setup 4 (recap) is
the addition, and it is the first thing cut if the batch runs long, because `RYW-01` runs T+6 and
is the only script in this pack that can be replaced by a still deck.

**Setup 3 requires submitting the Generate sheet once.** The capture manifest deliberately never
submitted it ("filled out but NOT submitted (no AI generation was burned)"). Filming the generator
without submitting it is impossible, so this is a budgeted, one-call deviation on a dummy account.
Record the returned session; never overlay an exercise list the app did not return.

### A.3 What George must verify Wednesday 8/26, before the batch

| # | Check | Blocks | If it fails |
|---|---|---|---|
| V1 | Does `/dashboard` render a **written** weekly recap line (The Becoming summary row) with real sentences on the dummy account, not a placeholder? | `RYW-01` beat 11.5-15.0 | Cut that beat. `RYW-01` becomes 16s and **the single The Becoming mention is not spent at all.** |
| V2 | Does `POST` on the Generate sheet return a session on that account without an error state? | `GEN-01` entirely | `GEN-01` is cut; `PTW-01` carousel (§carousels.md) carries the generator as inputs-only stills. |
| V3 | Does the plate-photo path return itemized rows on that account today? | `WIW-01`, `CA-02` inserts, `MECH-01` | The plate mechanic has no moving asset at all. Escalate. This is the differentiator. |
| V4 | Are "30-Day Shred" and "12 Week Fat-Loss Foundation" the real, live names of programs in the app right now? (Jon answers, per `jon-checklist.md` Wed 8/26.) | Any beat that shows the Recommended row in `workout-hub-*.webp` | Frame the workout hub above the Recommended row. Do not blur, re-frame. |

---

## B. Theme lock, and why

Three open rendering defects in `manifest.json` `knownIssues` decide the theme of four of the eight
scripts. This is not a style preference.

### B.1 `RYW-01` and `GEN-01` film **light**

- `ProgressClient.tsx:560` hardcodes the Weekly Volume bar fill to `#18181b` with no dark variant.
  On the dark card the bars are invisible. The manifest's `progress-dark.webp` only looks right
  because the six bar rects were recolored in the DOM at capture time. **A phone recording cannot
  be DOM-patched.** Filming the recap in dark mode produces an empty axis over six weeks of real
  data, which is an empty state in frame, which is banned.
- The Generate sheet's exercise-count range input keeps a white unfilled track in dark mode, so on
  a dark violet sheet it is the brightest object on screen and it pulls the eye off the equipment
  chips, which are the point of the beat.

### B.2 `WIW-02` films **dark**

`workout-log-dark.webp` is the only LIVE-mode capture and there is no light twin
(`accounts-setup.md` §9 asset debt, optional fix Tue 9/8). Dark also reads correctly as the in-gym
screen. Film dark, keep the still and the video matched.

### B.3 Every screen recording is shot on **iOS or Safari**

`webapp/components/FramedVideo.tsx:39` emits `type="video/quicktime"` for `.mov` sources.
Chromium and Firefox refuse it (`canPlayType('video/quicktime') === ''`), so exercise demo panels
render as a black rectangle. The files themselves are fine. The server sends `Content-Type:
video/mp4`. Record on iOS/Safari and the demo plays. Record on Android or desktop Chrome and
`WIW-02` beat 17.0-20.5 is a black box.

### B.4 `WIW-01` films **light**, the Jon items film in whatever the room gives

Kitchen daylight for the plate. The Jon items are a face, not a UI, so the theme rule only applies
to their screen inserts, which inherit the theme of the recording they are cut from.

---

## C. Conflicts with the parallel docs, resolved

> **C.0 — Superseded at the Tue 8/25 readiness review.** `content-calendar.md` §2 rows **R-9 to
> R-13** are binding over this section wherever they disagree. In short: the calendar wins on
> dates, slots, formats and `utm_content` (underscore style); `captions-week1.md` wins on captions
> it covers; this pack wins on shot lists. Specifically: **C3 overruled** (`RYW-01` ships as the
> `C-24` carousel Mon 9/7 11:00; the §5 Reel is optional upside from setup 4), **C4 overruled**
> (`MECH-01` holds Thu 9/3 10:00 and its script is due **Thu 8/27 22:00**, not Fri 9/5; `GEN-01`
> is filmed Sat and held for the T+7 review to slot), the topic-ID map is fixed at R-10 (this
> pack's §7 "CA-01" ships as the calendar's **CA-02** on Sun 9/6; §6 food-scale is a spare;
> missed-sessions and soreness scripts are owed as addenda Thu 8/27), the brand `LAUNCH-BTS`
> caption in §8 is dropped (R-6/R-13, Jon-only), and the 09:30 story ships as `C-09`'s five frames
> with the `WARM-01` pickup feeding its two Jon-to-camera frames.

Flagged rather than resolved quietly, per `AGENTS.md` §8.

| # | Conflict | Resolution in this pack | Who decides |
|---|---|---|---|
| C1 | `accounts-setup.md` §8 schedules filming **Wed 8/26** (J3, G5). `launch-plan.md` T-3 and `jon-checklist.md` schedule it **Sat 8/29 09:00-13:00**. | **Sat 8/29.** Two of three docs, and it is the master run-of-show. `accounts-setup.md` §8 J3/G5 need their date corrected. | George, today |
| C2 | `accounts-setup.md` §5.1 posts the plate Reel as **Pin 2 on Sat 8/29** and the LIVE Reel as **Pin 3 on Sun 8/30**. `launch-plan.md` §6 runs `WIW-01` **Tue 9/1 16:00** and `WIW-02` **Thu 9/3**. | Both, from one shoot, as **different cuts**. Pin 2 / Pin 3 open on alternate hook B (§2.5, §3.5) with the grid-seeding caption. The 9/1 and 9/3 feed posts open on hook A with the launch caption. Different first 1.5s, different caption, 3+ days apart, different audience intent. This is `accounts-setup.md` §5.3's own cross-post rule applied to the same platform. | George |
| C3 | `launch-plan.md` §6 specifies `RYW-01` as a **4-slide carousel**; this pack ships it as a **20s Reel**. | Reel. The slot table (`launch-plan.md` line 295) permits "Reel or carousel". The payoff is a card opening and a written line appearing, which is motion. And the still library cannot carry it: per the manifest, `progress-*.webp` is the Training Log and contains **no** weight-trend chart, so a 4-slide still deck would be four crops of one page. The Read Your Week hard cap of one item per week is preserved: the Reel **is** the item. | Stated here; George may overrule |
| C4 | `launch-plan.md` §6 runs `MECH-01` Thu 9/3 10:00. This pack does not script `MECH-01` and puts `GEN-01` in that slot. | `GEN-01` takes Thu 9/3 10:00. `MECH-01` moves to Mon 9/8 10:00 (week-2 Watch It Work). Reason: the plan gave the plate mechanic two moving pieces in one week (`WIW-01`, `MECH-01`) while the generator, a named differentiator in `become-context.md` §7, got zero. Its footage is already in the Saturday batch, so nothing is added. **`MECH-01` script owed by Fri 9/5, producer `reels-scripts`, and it films off Saturday setup 1, so no second session.** | George |
| C5 | UTM campaign is `launch-0901` in `accounts-setup.md` §3, `202609_public_launch` in `launch-plan.md` T-4 13:00. | This pack writes `utm_content` only (the script ID, lowercase). Campaign and source come from whichever convention `analytics-tracking` lands. Untagged is the only unacceptable outcome. | George, Fri 8/28 13:00 |

---

## D. Slate: what runs, when, and where the file comes from

| ID | Topic | Archetype | Runtime | Camera | Theme | First run | `utm_content` |
|---|---|---|---|---|---|---|---|
| `LAUNCH-HERO` | Launch-day hero announcement | Coach answer (launch cut) | 38s | Jon | Room | Tue 9/1 10:00, Jon + brand | `launch-hero` |
| `WARM-01` | Warm-audience ask, story frames | Named recipient | 15s (3 frames) | Jon | Room | Tue 9/1 09:30, Jon story | `warm-01` |
| `WIW-01` | Plate-photo logging demo | Mechanism demo | 22s | Screen + hands | Light | Sat 8/29 pin 2 (hook B) / Tue 9/1 16:00 (hook A) | `wiw-01` |
| `LAUNCH-BTS` | Warm-audience direct ask | Coach answer (direct ask) | 36s | Jon | Room | Wed 9/2 10:00, Jon + brand | `launch-bts` |
| `CA-01` | Coach answer, starting weight | Coach answer | 40s | Jon | Room | Wed 9/2 12:00, Jon | `ca-01` |
| `GEN-01` | AI generator demo | Day in the plan | 30s | Screen + doorway | Light | Thu 9/3 10:00, brand | `gen-01` |
| `WIW-02` | LIVE set-logging demo | Mechanism demo | 24s | Screen | Dark | Sun 8/30 pin 3 (hook B) / Thu 9/3 12:00 TikTok (hook A) | `wiw-02` |
| `CA-02` | Misconception flip, food scales | Misconception flip | 28s | Jon + inserts | Room / light inserts | Sun 9/6 10:00, Jon | `ca-02` |
| `RYW-01` | Weekly recap, the one Becoming beat | Recap reveal | 20s | Screen | Light | Mon 9/7 09:00, brand | `ryw-01` |

**The Becoming mention budget is spent once, in `RYW-01` beat 11.5-15.0, and nowhere else in this
pack.** If check V1 fails Wednesday, the beat is cut and the budget goes unspent. It is never spent
twice, and `carousels.md` deck 3 does not name it.

---

# 1. `LAUNCH-HERO`: "The thing I kept asking people to do by hand"

**Slot:** launch-only. **Archetype:** coach answer, launch cut. **Band:** 30-45s, at 38s.
**Runs:** Tue 9/1 10:00 on Jon's account; 10:05 on the brand account with the strangers-facing
caption. **Camera:** Jon, first person, `coach-brand-voice` register. Never product second person.

**Hook, first 1.5s:** Jon already mid-sentence, gym floor, phone in his hand. No greeting, no logo,
no title card. Overlay reads something the line does not say.

| Time | Shot | On-screen text | Jon | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.5 | Waist-up, gym floor, racks soft behind him, phone in hand, already talking | The thing I kept asking for | "I kept asking people to write down what they lifted." | Gym ambience under. Hard cut at 1.5 |
| 1.5-3.5 | Half-step closer, same eyeline | Nobody keeps a notes file | "Nobody does it. Not because they are lazy. Because it lives in four different places." | Reframe |
| 3.5-6.0 | Insert, his hand, phone screen filling frame: `/dashboard`, tiles populated | One screen. Training, food, mind. | "So it is one app now." | Hard cut to screen |
| 6.0-9.0 | Screen: workout hub, Continue Training card, Phase 1 Day 2 | The phases are the ones he writes | "The programs in it are mine. Phase by phase, in the order I would actually run them." | Cut at 7.5 to a tighter crop of the phase line |
| 9.0-14.0 | Screen: LIVE set entry, empty weight field, "Last set: 155 lbs × 10 reps" sitting under it | Last session's numbers, under the field | "When you go to log a set, what you lifted last time is already sitting under the box you are typing into." | Reframe at 11.5. Keypad tap audible |
| 14.0-19.0 | Screen: camera over a plate, shutter, itemized rows land | One photo. Every item, its own line. | "You photograph the plate instead of typing four foods into a search bar." | Cut on the shutter at 15.2 |
| 19.0-24.0 | Jon back on camera, same mark as 1.5 | Not a tracker. A plan. | "It is not a tracker you have to feed. It is the plan, and it holds everything else." | Hard cut back |
| 24.0-30.0 | Jon, wider, half body | Free today. Email link, no card. | "It is free. There is no paid version and there is no card. You put in an email, it sends you a link." | Hold. No music swell |
| 30.0-34.0 | Jon, same wide | Link is on my profile | "It is early. I would rather you find what is broken in it than tell me it was nice." | Hold, let it land |
| 34.0-38.0 | Same framing as 0.0-1.5, phone back in hand | Tell me what is broken | "Tell me what is broken. That is what I actually want this week." | Loop-close |

**Caption, Jon's account, final:**

```
I kept asking people to write down what they lifted and nobody ever did, so the app does it.

The programs in it are mine, phase by phase. Log a set and what you lifted last time is already on
the screen. Photograph the plate instead of typing four foods into a search bar. The short mind
session is there because the week goes sideways in your head before it goes sideways on the sheet.

It is early and some of it is rough. Free today, email link, no card.

Tell me what is broken in the comments. Link is on my profile.
```

**Caption, brand account 10:05, final** (product voice, second person, strangers-facing):

```
Coach-built training app with food logging and a weekly recap in the same place.

Coach Jon Don writes the multi-phase programs and the app runs them. Log a set and last session's
numbers are already under the field. Photograph a plate and it comes back itemized against your
calorie and macro targets.

Free today. Email link, no card.

Tell us what breaks. We would rather hear it this week.
```

**CTA:** one, reply in the comments. The bio link appears **on screen only** at 30.0-34.0 and is
never spoken, so the single spoken ask stays the comment ask. The link itself is carried by the
09:30 story sticker (`WARM-01`) and both bios.

**Cover frame:** 24.0-26.0, Jon wide, "Free today. Email link, no card." legible in the centre 60%.
Crops to 1:1 without losing his face or the line.

**Alternate hooks (trial variants, same body):**
- **B, shape 7 objection-first:** frame one, Jon: "You already have a workout app you do not open."
  Overlay: "This is not another one." Might beat A because it names the viewer's actual state before
  it names Jon's, and A spends its first two seconds on him.
- **C, shape 2 POV realism:** frame one is not Jon at all. It is a phone home screen with four
  fitness app icons, thumb hovering. Overlay: "Four apps. One plan. None of them talk." Jon's voice
  comes in at 1.5. Might beat A on cold reach because a stranger has no reason to care who Jon is in
  second one; the counter-argument is that this post's job on his account is precisely that he is
  the one saying it.

**Capture list:**
- Filmed Sat 8/29, batch A.1 item 1.
- Insert 3.5-6.0: Saturday setup 2 recording, or fall back to `webapp/public/screenshots/v2/dashboard-light.webp` as a held still with a slow 2% push.
- Insert 6.0-9.0: `webapp/public/screenshots/v2/workout-hub-light.webp`. **Frame above the Recommended row until check V4 clears.**
- Insert 9.0-14.0: Saturday setup 2 (LIVE). Reference state: `webapp/public/screenshots/v2/workout-log-dark.webp`. Lat Pulldown, Exercise 4/8, Set 3/3, "Last set: 155 lbs × 10 reps", PR badge 160 lbs. Film the same exercise so the still and the video match.
- Insert 14.0-19.0: Saturday setup 1 (plate). **No still substitute exists.** `nutrition-meal-*.webp` was seeded by typing through food search, so it cannot stand in for a photo claim.

**Sign-off flags. Jon must confirm each before this ships (`jon-checklist.md` Fri 8/28):**

| Beat | Line | Why it needs him |
|---|---|---|
| 0.0-1.5 | "I kept asking people to write down what they lifted" | Claim about his own coaching practice. Only he can say it is true. |
| 1.5-3.5 | "Nobody does it" | Claim about his clients' behaviour. Generalisation about people he coached. |
| 6.0-9.0 | "The programs in it are mine" | Verified in principle (`become-context.md` §11) but the exact phrasing is his. Related open question 4: "the same system he runs with his own clients" is already public on the landing page and still unconfirmed. Do **not** add that phrasing here. |
| 30.0-34.0 | "It is early" | Fine, and deliberately kept. It is the honest frame and it lowers the bar for a rough first week. |

**Banned in this script, restated:** no user count, no results figure, no timeline, no price other
than "free today", no client story, no "fifteen years" or any tenure number unless Jon supplies the
true one (`accounts-setup.md` §3.3 marks it a placeholder).

---

# 2. `WIW-01`: "One photo. The whole plate."

**Slot:** Watch It Work. **Archetype:** mechanism demo. **Band:** 15-30s, at 22s. **Runs:** Sat
8/29 (Pin 2, hook B) and Tue 9/1 16:00 (feed, hook A). **Camera:** no person. Hands and screen.
**Theme:** light.

**Hook, first 1.5s:** a hand lowering a phone over a full plate in kitchen daylight, shutter about
to fire. Motion in frame one, no VO yet.

| Time | Shot | On-screen text | VO | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.2 | Hand lowering a phone over a full plate, real kitchen light, plate fills the lower third | One photo. The whole plate. | (none) | Kitchen ambience. Shutter fires at 1.0 |
| 1.2-3.5 | Screen record: Nutrition tab, thumb taps the camera control | Nutrition tab, camera icon | "One photo of the whole plate." | Cut on the tap. White ellipse annotation on the camera control, 0.4s |
| 3.5-6.0 | Camera view from above framing the plate, capture fires | One frame, from above | "You do not shoot the chicken, then the rice, then the broccoli." | Hard cut at 6.0 |
| 6.0-11.0 | Screen: itemized rows appearing, per-item calories arriving one line at a time | Every item, its own line | "It comes back itemized. Each thing on its own line, with its own calories." | Cut at 8.5 to a tighter crop of the rows |
| 11.0-15.0 | Screen: thumb opens one row and corrects the portion | Correct what it read wrong | "It guesses. When it guesses wrong you fix that line and move on." | Reframe. Keypad tap audible |
| 15.0-19.0 | Screen: day ring and macro bars updating against the day's targets | Against your targets, not a generic number | "Then it lands against the calories and macros you set." | Hold, no cut. Let the bars finish |
| 19.0-22.0 | Back to the plate, same framing and same light as frame one, phone lifting away | Send this to whoever quit tracking | "Send this to whoever quit tracking because of the typing." | Loop-close |

**Caption, launch-day feed post (hook A), final:**

```
App that logs food from one photo of your plate. Point the camera at the meal and every item comes
back on its own line with its own calories, then lands against your calorie and macro targets.

It estimates. When it reads something wrong you correct that line in about ten seconds, which is
still faster than typing four foods into a search bar.

Free today. Email link, no card.

Send this to whoever quit tracking because of the typing.
```

**Caption, Pin 2 on Sat 8/29 (hook B), final:**

```
Food logging from a photo, itemized. One frame of the whole plate comes back as a list you can
correct, with the macros landing against your targets.

Nutrition tab, camera icon, done.

Free today. Email link, no card.

Save this for the next meal you cannot be bothered to type in.
```

**CTA:** one per cut. Feed cut = send, naming the recipient. Pin 2 cut = save, naming the moment.
Never both in one post.

**Cover frame:** 6.4s, the first two itemized rows legible over the plate photo thumbnail.

**Alternate hooks:**
- **B, shape 2 POV realism (used for Pin 2):** frame one is a food-search box with "chick" typed
  and a list of eleven near-identical results. Overlay: "POV: it is 9pm and you are on food four."
  Cuts to the plate at 1.4. Might beat A because it opens on the pain rather than the product, and
  the pain is the more universal image.
- **C, shape 6 number on screen:** frame one is the itemized result already on screen, four rows
  visible, then the video rewinds to the shutter. Overlay: "Four lines. One photo." Might beat A
  because it shows the payoff before it asks for any attention; the risk is that a stranger reads
  the rows as a generic calorie app and scrolls.

**Capture list:**
- Saturday setup 1, filmed end to end. **This mechanic has no still in the v2 set and none can be
  substituted.** The manifest records that `nutrition-meal-*.webp` meals were seeded through food
  search, so a photo claim over that still would be a fabrication.
- 15.0-19.0 may fall back to `webapp/public/screenshots/v2/nutrition-day-light.webp` (ring at 263
  remaining of 2000, protein 156/150, carbs 145/200, fats 61/65) **only** if the day-view beat of
  the recording is unusable. That still is a legitimate targets screen; it is only the photo path it
  cannot cover.

**Numbers rule for this script:** whatever the app returns on the day is what goes on screen. Do
not overlay the manifest's seeded values (Lunch 516 cal: Chicken Breast 280 / White Rice 205 /
Broccoli 31) onto a different plate. Those were typed, not photographed.

**Sign-off flags:** none. No Jon, no experience claim.

---

# 3. `WIW-02`: "It already knows what I did last time"

**Slot:** Watch It Work. **Archetype:** mechanism demo. **Band:** 15-30s, at 24s. **Runs:** Sun
8/30 (Pin 3, hook B) and Thu 9/3 12:00 to TikTok as the first cross-post (hook A). **Camera:**
screen, plus one wide of the bench. **Theme:** dark.

**Hook, first 1.5s:** the screen, already open, empty reps field with last session's numbers under
it. No setup shot, no walking into a gym.

| Time | Shot | On-screen text | VO | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.4 | Close on the phone, dark UI: Lat Pulldown, Set 3/3, empty weight field, "Last set: 155 lbs × 10 reps" underneath | It already knows last Tuesday | (none) | Gym ambience, a plate clanks at 0.8 |
| 1.4-3.4 | Wide: phone propped on the bench, hands chalking, bar in the background | Set 3 of 3 | "I am not trying to remember what I did last week." | Hard cut |
| 3.4-6.5 | Screen: thumb types 160 into the weight field | 160 goes in | "Weight, reps, tick." | Cut on the keypad at 5.0. Annotation ellipse on the reference line, 0.5s |
| 6.5-9.0 | Screen: reps typed, the set row ticks green | Two numbers and a checkbox | (none) | Checkbox click carries it. Hard cut on the tick |
| 9.0-13.0 | Screen: rest timer counting itself down | Timer starts on the tick | "The rest timer starts itself, so I am not watching a clock." | Reframe at 11.0 |
| 13.0-17.0 | Screen: PR badge lands on the exercise row | PR, 160 | "And it flags it when that was the most I have put on the thing." | Slow push, held under 1s |
| 17.0-20.5 | Screen: the demo clip playing behind the logging controls | The demo runs behind the controls | "On the big lifts the demo clip is playing behind the controls while you log." | Cut. **Film on iOS/Safari or this frame is black** |
| 20.5-24.0 | Same angle as frame one, next exercise loaded, its own "Last set" line sitting under an empty field | Comment LIVE for the three steps | "Comment LIVE and I will send you the three steps to start one." | Loop-close |

**Caption, Thu 9/3 feed and TikTok (hook A), final:**

```
Workout app that puts your last weight on the screen while you log the next set. LIVE mode holds
one set at a time with what you lifted last session sitting under the field, and the rest timer
starts when you tick the set off.

Nothing here watches you train. You type two numbers. The point is that you are not guessing at
them.

Free today. Email link, no card.

Comment LIVE and I will send you the three steps to start one.
```

**Caption, Pin 3 on Sun 8/30 (hook B), final:**

```
Set logging that remembers: last session's weight and reps sit under the field you are typing into,
and a PR badge lands on the row when it is your best on that lift.

Demo clip plays behind the controls on the big lifts.

Free today. Email link, no card.

Save this for your next session.
```

**CTA:** feed cut = keyword `LIVE`. **The reply is already written** in `accounts-setup.md` §6.1
and must be saved somewhere pasteable on George's phone before this posts (task G11). Pin 3 cut =
save, because Sunday 8/30 is not a day either account is watching DMs.

**Cover frame:** 13.6s, the PR badge legible with the set row and the reference line both in frame.

**Alternate hooks:**
- **B, shape 4 direct question (used for Pin 3):** frame one is the screen with the reference line
  masked. Overlay: "What did you lift on this exact machine last Tuesday?" The mask lifts at 1.4 to
  reveal it. Might beat A because it forces an internal answer the viewer cannot produce, and then
  hands them the answer.
- **C, shape 5 mid-action open:** frame one is the thumb already mid-keypad, 1 and 6 pressed, the
  reference line in soft focus below. No overlay until 0.6s, then "160 going in." Might beat A on
  pure motion, and it is the cheapest to cut; the risk is that the reference line, the actual
  mechanism, reads too late.

**Capture list:**
- Saturday setup 2, filmed end to end on the same account and the same exercise as
  `webapp/public/screenshots/v2/workout-log-dark.webp`, so the still and the Reel match across the
  grid. Reference state from the manifest: Exercise 4/8, Set 3/3, 46% complete, 3 green exercise
  dots, "Last set: 155 lbs × 10 reps", PR badge 160 lbs.
- No light twin exists and none is needed. `accounts-setup.md` §9 lists the light LIVE capture as
  optional, Tue 9/8.

**Hard line for this script, restated:** nothing in Become watches a set or tallies reps. Beat
17.0-20.5 shows a demo clip playing, not a camera reading anything. If a caption, a comment reply
or an overlay ever implies otherwise, it is a fabrication that spreads
(`become-context.md` changelog 2.0.0; the same false claim reached ~133 sites once already).

**Sign-off flags:** none.

---

# 4. `GEN-01`: "The plan said barbell. The barbells are gone."

**Slot:** Watch It Work (takes `MECH-01`'s Thu 9/3 10:00 slot, per conflict C4). **Archetype:**
day in the plan. **Band:** 30-45s, at 30s. **Camera:** doorway plus screen, no face. **Theme:**
light (see §B.1).

**Hook, first 1.5s:** walking into a busy gym, phone in hand, the constraint stated as an overlay
before anything is explained.

| Time | Shot | On-screen text | VO | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.4 | Gym doorway, walking in, phone in hand, occupied racks visible past the frame edge | Five exercises. Two dumbbells. | (none) | Room noise. Motion carries frame one. **Truth note: the sheet has no minutes input; never overlay a time the UI cannot show** |
| 1.4-4.0 | Over-shoulder: the violet Generate sheet opening, Session and Program tabs visible | Session, or a whole program | "The plan said barbell. Every barbell is taken." | Cut on the sheet landing |
| 4.0-7.5 | Screen: Focus and Difficulty chips being selected | Focus. Level. | "You tell it what you are training and roughly where you are." | Cut per tap. Ellipse annotation on the Focus chip |
| 7.5-12.0 | Screen: equipment chips, barbell deselected, dumbbell and cable left on | Only what is in the room | "Then only the equipment that is actually in front of you." | Reframe at 10.0. Ellipse on the equipment row |
| 12.0-15.0 | Screen: exercise-count slider set to 5, cardio finisher toggled off | Five exercises. No finisher. | "How many exercises, and whether you want a finisher on the end." | Cut |
| 15.0-20.0 | Screen: "Generate session" tapped, the session list returning | It comes back built | "It writes that session instead of the one you cannot do today." | Cut on the tap at 16.2. Let the list land unedited |
| 20.0-25.0 | Floor: first exercise underway, phone on the bench showing the set row | Set 1, logged | "It logs like any other session, and it counts toward the week." | Reframe at 22.5 |
| 25.0-30.0 | Doorway again, same angle and same lens as frame one, walking out | Comment WEEK1 for how week one works | "Comment WEEK1 and I will send you what the first week actually contains." | Loop-close |

**Caption, final:**

```
AI workout generator that builds a session around the equipment actually in front of you.
Pick the focus, the level, how many exercises, and only the kit in the room. It writes that
session and it logs like every other one.

The coach-built programs are still the default. This is for the day the plan does not fit the room
you are standing in.

Free today. Email link, no card.

Comment WEEK1 and I will send you what the first week contains.
```

**CTA:** one, keyword `WEEK1`. Reply already written in `accounts-setup.md` §6.1. **Do not run
this slot on a day nobody can answer within a few hours.** Thu 9/3 has George on the brand handle,
so it holds.

**Cover frame:** 9.2s, the equipment row with barbell visibly off and the annotation ellipse still
on screen. The single most legible expression of the mechanic at thumbnail size.

**Alternate hooks:**
- **B, shape 9 two-option contrast:** frame one is a split screen: left, a written program page
  with "Barbell Bench Press" at the top; right, the empty rack. Overlay: "The plan, and the room."
  Might beat A because the conflict is legible in one frame with sound off, where A needs the
  overlay to be read.
- **C, shape 1 specific outcome:** frame one is the returned session list already on screen, five
  exercises. Overlay: "Built in the doorway, in about a minute." Then rewind to the doorway. Might
  beat A because it leads with the payoff; the risk is that "AI generated a workout" is now a
  crowded claim and the interesting part, the equipment filter, arrives too late.

**Capture list:**
- Saturday setup 3, which requires one real generation on the dummy account (§A.2).
- Stills that exist and match the sheet state: `webapp/public/screenshots/v2/generate-light.webp`
  (Session tab, Focus = Pull, Difficulty = Intermediate, Equipment = Barbell + Dumbbell + Cable, 5
  exercises, cardio finisher off). Useful as a framing reference for beats 4.0-15.0 and as a
  fallback still if a beat is unusable.
- **The still cannot cover beat 15.0-20.0.** The capture was filled and never submitted, so no
  generated-output still exists anywhere in the repo. If check V2 fails Wednesday, this script is
  cut, not faked.

**Sign-off flags:** none. **Claim guard:** never say or imply the generator replaces the coach-built
programs. `become-context.md` §7 sells both, and the honest framing, "structure when you want it, a
session in seconds when you do not", is the one in beat 25.0-30.0's caption.

---

# 5. `RYW-01`: "Sunday"

**Slot:** Read Your Week. **One item per week, hard cap, and this is it.** **Archetype:** recap
reveal. **Band:** 15-25s, at 20s. **Runs:** Mon 9/7 09:00, brand account. **Camera:** screen only.
**Theme:** light, mandatory. See §B.1.

**This script carries the launch window's single The Becoming mention, at 11.5-15.0.** Nothing else
in this pack or in `carousels.md` names it.

**Hook, first 1.5s:** the card already moving. No logo, no "Sunday recap" title card.

| Time | Shot | On-screen text | VO | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.3 | Screen already in motion: the recap card sliding open, a thumb at the edge of frame | Sunday | "Sunday." | One soft UI sound. No music yet |
| 1.3-4.0 | Screen: Training Log header, workouts count and all-time volume | Every line came from something logged | "Eleven sessions. Two hundred and twenty one thousand pounds moved, all time." | Cut at 2.6 into a tighter crop of the header |
| 4.0-7.5 | Screen: Weekly Volume bars across six weeks | Six weeks, side by side | "Volume week by week, not one number pretending to mean something." | Cut at 6.0 |
| 7.5-11.5 | Screen: Workout History list, the PR badge visible on Day 1 | PR landed on Day 1 | "Which sessions, which day, and where a personal record landed." | Reframe |
| 11.5-15.0 | Screen: the written recap line on the dashboard | The Becoming | "And a line that writes the week back to you in plain language instead of a wall of numbers." | Cut. **Single Becoming beat. See V1** |
| 15.0-17.5 | Screen: Up Next card, tomorrow's session | Then it shows you Monday | "Then it shows you the next one." | Hard cut |
| 17.5-20.0 | Back to the recap card, same framing as frame one | Save this for Sunday | "Save this for Sunday." | Loop-close |

**Caption, final:**

```
Weekly recap in a training app: what you logged, what moved, and what is next. Sessions, volume
week by week, where a PR landed, and a written line about your week instead of a wall of numbers.

Every figure on that screen came from something you logged. Nothing is estimated and nothing is
compared to anybody else.

Free today. Email link, no card.

Save this for Sunday.
```

**CTA:** one, save, and it names the moment it will be used.

**Cover frame:** 5.4s, the Weekly Volume bars across six weeks. It reads as a real record at
thumbnail size and it carries no number that could be misread as an outcome.

**Alternate hooks:**
- **B, shape 2 POV realism:** frame one is a lock screen reading Sunday evening, thumb about to
  open the app. Overlay: "POV: it is Sunday and you cannot tell if the week was good." Might beat A
  because it names the feeling before it shows the fix; the cost is 1.5 seconds before the product
  appears at all.
- **C, shape 8 result then rewind:** frame one is the written recap line, held, readable. Overlay:
  "Every sentence came from a tap." Then rewind through the stats. Might beat A because the written
  line is the genuinely unusual thing and A saves it until 11.5s.

**Capture list:**
- Saturday setup 4, filmed light. **Drop-first item in the batch.**
- Stills that exist: `webapp/public/screenshots/v2/progress-light.webp` (Training Log, 11 workouts,
  221.6K lbs all-time, Weekly Volume across six weeks, Workout History with a PR badge, Personal
  Records below the fold) and `dashboard-light.webp` (which carries The Becoming summary row).
- **Do not use `progress-dark.webp` for any beat.** Its bars only read because six rects were
  recolored in the DOM at capture time; the live dark screen shows an empty axis.

**Conditional cut:** if check V1 fails, delete beat 11.5-15.0, retime 15.0-17.5 to 11.5-14.0 and
17.5-20.0 to 14.0-16.5, and the runtime becomes 16.5s. **The Becoming budget then goes unspent for
the whole launch**, which is an acceptable outcome and a better one than filming a placeholder.

**Numbers rule:** 11 workouts and 221.6K lbs are dummy-account figures the product itself produced,
which is what the skill permits. They are not outcome claims and must never be captioned as one.
Whatever the account reads on 8/29 is what goes on screen; do not re-use the manifest's figures over
a different state.

**Sign-off flags:** none.

---

# 6. `CA-02`: "The food scale is not what makes tracking work"

**Slot:** Coach Answer (Sun 9/6 10:00, Jon's account). **Archetype:** misconception flip, not
blended with the coach-answer structure, only fronted by the coach. **Band:** 21-34s, at 28s.
**Camera:** Jon on camera, two screen inserts cut from Saturday setup 1.

**Hook, first 1.5s:** the misconception stated flatly, no preamble, no greeting.

| Time | Shot | On-screen text | Jon | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.4 | Jon, mid-sentence, gym floor, same mark as `CA-01` | You do not need a food scale | "The food scale is not what makes tracking work." | No intro. Hard cut at 1.4 |
| 1.4-3.4 | Half-step closer | Precision was never the failure point | "People think they failed at tracking because they were not accurate enough." | Reframe |
| 3.4-5.6 | Tighter, chest-up | That is not what happened | "That is not what happened." | Cut |
| 5.6-9.0 | Wider again | Nobody quits over forty calories | "Nobody quits because a number was off by forty calories. They quit because of the typing." | Reframe at 7.5 |
| 9.0-14.0 | Insert: plate photo, shutter, itemized rows landing | One photo, itemized | "You photograph the plate. It comes back as a list, each item on its own line." | Insert. Shutter audible at 9.4 |
| 14.0-19.0 | Insert continues: thumb correcting one row | An estimate you can fix | "An estimate you corrected in ten seconds is a logged day. A perfect number you never entered is a blank one." | Reframe at 16.5 |
| 19.0-24.0 | Jon back on camera, wider | Get the day down first | "Get the day down. You can get fussier later, if you ever actually need to." | Hard cut back |
| 24.0-28.0 | Same framing as 0.0-1.4 | Send this to whoever owns a scale they used twice | "Send this to whoever bought a food scale and used it twice." | Loop-close |

**Caption, final:**

```
Food tracking does not fail on accuracy, it fails on effort. A photo of the plate comes back
itemized, you correct the line it read wrong, and the day is logged.

An estimate you fixed in ten seconds beats a perfect number you never entered.

Free today. Email link, no card.

Send this to whoever bought a food scale and used it twice.
```

**CTA:** one, send, and it names the recipient.

**Cover frame:** 1.2s, Jon with "You do not need a food scale" legible. The line is the whole hook
and it survives at thumbnail size with the sound off.

**Alternate hooks:**
- **B, shape 3 unpopular opinion:** frame one, Jon: "Weighing your food is not what makes tracking
  work, and it never was." Overlay: "Unpopular, in this gym." Slightly stronger curiosity gap; the
  risk is that "unpopular opinion" framing invites an argument in the comments Jon then has to
  spend Sunday having.
- **C, shape 10 named recipient:** frame one is a kitchen drawer opening on an unused food scale.
  Overlay: "If this is in your drawer, this is for you." Jon's voice comes in at 1.2. Might beat A
  because it is an object, not a face, and objects read faster muted; the cost is that it delays the
  coach's authority, which is the reason this post lives on his account.

**Capture list:**
- Filmed Sat 8/29, batch A.1 item 3.
- Inserts 9.0-19.0: Saturday setup 1, the same recording that feeds `WIW-01`. Use different
  seconds of it so the two posts do not read as the same file. `WIW-01` uses the shutter and the
  targets beat, `CA-02` uses the rows landing and the correction.
- No still substitute for the inserts. See `WIW-01`.

**Sign-off flags. Jon must confirm before this ships:**

| Beat | Line | Why it needs him, and the safe default |
|---|---|---|
| 1.4-3.4 | "People think they failed at tracking because they were not accurate enough" | A claim about what people he has coached believed. **Safe default as written.** It describes a belief, not a result, and names nobody. |
| 5.6-9.0 | "They quit because of the typing" | An experience claim about why his clients stopped. **Ships as written only with his sign-off.** If he will not sign it, the safe rewrite is "Typing four foods into a search bar every night is what people actually quit over". Same idea, stated as a general observation rather than as his caseload. |
| any beat | Any specific number of minutes, clients, or weeks | **Banned outright.** An earlier draft carried "it took eleven minutes a night." That number is invented and does not appear in the shooting script. Do not let it back in on the day. |

**Restated:** no client story, not even a composite. No before and after. Injury, medical, and
pregnancy questions in the comments get the referral answer from `coach-brand-voice` §5 and nothing
after it.

---

# 7. `CA-01`: "What weight do I start with?"

**Slot:** Coach Answer (Wed 9/2 12:00, Jon's account). **Archetype:** coach answer. **Band:**
30-45s, at 40s. **Camera:** Jon on camera, one screen insert cut from Saturday setup 2.

**Hook, first 1.5s:** Jon already answering, question stated the way a viewer would ask it.

| Time | Shot | On-screen text | Jon | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.5 | Jon mid-answer, gym floor, chest-up | What weight do I start with | "Everybody asks this like there is a right answer." | No greeting. Hard cut |
| 1.5-3.5 | Half-step closer | There is not one | "There is not a number I can give you from here." | Reframe |
| 3.5-6.0 | Tighter | There is a way to find it | "There is a way to find it in one session." | Cut |
| 6.0-11.0 | Wider, half body | Pick light. Finish every rep. | "Pick something you are confident you can finish for every rep on the sheet." | Reframe at 8.5 |
| 11.0-16.0 | Same | Clean last rep means you were light. Good. | "If the last rep of the last set was still clean, you were light, and that is the correct place to be." | Hold |
| 16.0-21.0 | Same | Too light costs one session | "Starting too light costs you one session. Starting too heavy costs you the week." | Reframe at 18.5 |
| 21.0-28.0 | Screen insert: LIVE set entry, empty field, "Last set: 155 lbs × 10 reps" underneath | Next time the number is already there | "It only costs you one session because the app keeps it. Next time you open that exercise, what you did is sitting under the box you are typing into." | Insert. Cut at 24.5 to the tighter crop |
| 28.0-33.0 | Screen: the PR badge landing on the row | And it flags your best | "So you are adding to a number that is already on the screen, instead of deciding from memory." | Cut |
| 33.0-36.5 | Jon back on camera, wider | Session one is a measurement | "Treat the first session of a program as the measurement. Not the workout." | Hard cut back |
| 36.5-40.0 | Same framing as 0.0-1.5 | Reply with the lift you are stuck on | "Reply with the lift you are stuck on and I will answer it." | Loop-close |

**Caption, final:**

```
How to pick a starting weight: choose the load you are confident you can finish for every rep on
the sheet. If the last rep of the last set is still clean, you were light, and that is the right
place to be.

Starting light costs you one session, because the app keeps the number. Open that exercise next
time and last session's weight and reps are sitting under the field you are typing into.

Treat session one of a program as the measurement, not the workout.

Reply with the lift you are stuck on and I will answer it.
```

**CTA:** one, reply. **This creates an obligation.** Jon's reply window is already blocked
09:00-20:00 on 9/1 (`launch-plan.md` T-1 09:00) and this post runs Wed 9/2 at noon, so the window
must extend to Wednesday afternoon. If it cannot, swap the CTA to send: "Send this to whoever has
been doing the same three sets since March."

**Cover frame:** 12.4s, Jon with "Clean last rep means you were light. Good." The counter-intuitive
line is what earns the tap.

**Alternate hooks:**
- **B, shape 2 POV realism:** frame one is hands standing at a rack holding a 10 kg plate, not
  loading it. Overlay: "POV: you have been standing here for a minute." Jon comes in at 1.4. Might
  beat A because the paralysis is the actual moment, and A only describes it.
- **C, shape 3 unpopular opinion:** frame one, Jon: "Your first session should be too easy."
  Overlay: "On purpose." Might beat A on the curiosity gap; the risk is it reads as permission to
  undertrain if a viewer stops at three seconds, which is the majority of them.

**Capture list:**
- Filmed Sat 8/29, batch A.1 item 2.
- Insert 21.0-33.0: Saturday setup 2, the same recording that feeds `WIW-02`. Use the seconds
  either side of what `WIW-02` uses. Reference still:
  `webapp/public/screenshots/v2/workout-log-dark.webp`.
- The insert is dark and Jon is lit by the room. Grade the insert down slightly rather than trying
  to match; a screen is expected to look like a screen.

**Sign-off flags. Jon must confirm before this ships:**

| Beat | Line | Why it needs him, and the safe default |
|---|---|---|
| 0.0-1.5 | "Everybody asks this" | Mild experience claim about his coaching. Low risk. **Safe default as written.** |
| 16.0-21.0 | "Starting too heavy costs you the week" | Sits close to an injury claim. **Kept deliberately general and kept away from anything that reads as medical advice.** An earlier draft ended it with "and sometimes it costs you the shoulder"; that phrasing is out of the shooting script and must not come back in on the day. If Jon wants a stronger version, the ceiling is "and it can cost you more than the week", with nothing anatomical after it. |
| 33.0-36.5 | "Treat session one as the measurement" | Coaching guidance, his register, his call on phrasing. |

---

# 8. `LAUNCH-BTS`: the warm-audience direct ask

**Slot:** launch-only, T+1. **Archetype:** coach answer, direct-ask cut. **Band:** 30-45s, at 36s.
**Runs:** Wed 9/2 10:00 on Jon's account, and on the brand account with a product-voice caption.
**Camera:** Jon, seated, off the gym floor, window light. Deliberately different from the other
three so it does not read as another take from the same batch.

**Who this is for:** the people who already know him. This is the piece that asks his warm audience
for the thing they can actually give on day two, which is not a signup. It is a complaint.

**Hook, first 1.5s:** an admission, stated first. No greeting.

| Time | Shot | On-screen text | Jon | Audio and cut note |
|---|---|---|---|---|
| 0.0-1.4 | Jon seated, phone in hand, window light, already talking | The first version was wrong | "The first version of this was a workout tracker, and it was boring." | No intro. Hard cut |
| 1.4-3.4 | Slightly closer | Tracking was never the problem | "Tracking was never the thing anybody needed help with." | Reframe |
| 3.4-5.8 | Tighter | Deciding was | "Deciding what to do was." | Cut |
| 5.8-9.0 | Insert: workout hub, Continue Training card, Phase 1 Day 2 | The plan decides. You run it. | "So the programs went in first. Phases, in order, the way I write them." | Insert, cut at 7.5 to the phase line |
| 9.0-14.0 | Insert: `/dashboard`, tiles populated | Then food. Then mind. Then the week. | "Then the food, because it was living in a second app. Then a short mind session, because a week goes sideways in your head before it goes sideways on the sheet." | Reframe at 11.5 |
| 14.0-19.0 | Jon back on camera | Still early. Still rough in places. | "It is early. Some of it is rough. There are things in there I would still change." | Hard cut back |
| 19.0-25.0 | Jon, wider | Free. No card. No paid version. | "It is free, there is no card, and there is no paid version. I am not selling you anything today." | Hold |
| 25.0-31.0 | Same | I want the list of things that annoy you | "What I want from the people who already train with me is the list of things in it that annoy you." | Hold, let it land |
| 31.0-36.0 | Same framing as 0.0-1.4 | Reply with the first thing that breaks | "Use it this week and reply with the first thing that breaks. That is the whole ask." | Loop-close |

**Caption, Jon's account, final:**

```
The first version of this was a workout tracker and it was boring, because tracking was never the
part anybody needed help with. Deciding what to do was.

So the programs went in first, phases in order, the way I write them. Then the food, because it was
living in a second app. Then a short mind session.

It is early and some of it is rough. It is free, there is no card, and there is no paid version.

Use it this week and reply with the first thing that breaks. That is the whole ask.
```

**Caption, brand account, final** (product voice, second person, no first-person coach claims):

```
Coach-built training app, one week old in public and honest about it. Multi-phase programs from
coach Jon Don, food logged from a photo of the plate, a short mind session, and a weekly recap that
uses only what you logged.

Free today. Email link, no card.

Tell us the first thing that breaks. That is more useful to us this week than a signup.
```

**CTA:** one, reply. Same obligation note as `CA-01`: this only runs on a day Jon is in the
comments.

**Cover frame:** 15.8s, Jon with "Still early. Still rough in places." The admission is the reason
this post earns trust, and putting it on the cover is the point.

**Alternate hooks:**
- **B, shape 7 objection first:** frame one, Jon: "You are going to find things wrong with it."
  Overlay: "Good. That is the ask." Might beat A because it hands the viewer a job in second one
  rather than starting with product history.
- **C, shape 1 specific outcome:** frame one is the dashboard on his phone, five tiles filled.
  Overlay: "Four apps, one screen, still rough." Jon at 1.3. Might beat A on cold reach; the cost is
  that this post's whole value is that it is a person admitting something, and a UI in frame one
  spends that.

**Capture list:**
- Filmed Sat 8/29, batch A.1 item 4. Different location and framing from items 1-3, same wardrobe.
- Insert 5.8-9.0: `webapp/public/screenshots/v2/workout-hub-light.webp`, framed above the
  Recommended row until check V4 clears.
- Insert 9.0-14.0: `webapp/public/screenshots/v2/dashboard-light.webp`, or the Saturday setup 2
  recording if a live dashboard pass was captured.

**Sign-off flags. Jon must confirm before this ships:**

| Beat | Line | Why it needs him, and the safe default |
|---|---|---|
| 0.0-1.4 | "The first version of this was a workout tracker" | A product-history claim. **George verifies it is true** before Jon says it. If the first build was not a tracker, the line changes to whatever it actually was; do not keep a good line that is false. |
| 3.4-5.8 | "Deciding what to do was" | An experience claim about what his clients needed. Low risk, but it is the thesis of the video, so it is his to own. |
| 5.8-9.0 | "the way I write them" | Verified in principle. Do not extend it toward "the same system he runs with his own clients", which is `become-context.md` open question 4 and still unconfirmed even though it is already live on the landing page. |
| 25.0-31.0 | "the people who already train with me" | Direct reference to his current clients. **His call, and it is the reason the piece works.** |

### 8.5 `WARM-01`: the launch-morning story, three frames

Cut from `LAUNCH-BTS` and `LAUNCH-HERO` offcuts plus the 5-minute Saturday pickup. **Posts Tue 9/1
09:30 on Jon's story**, thirty minutes ahead of the feed post, per `jon-checklist.md`. This is the
frame that carries the link.

| Frame | Duration | Shot | On-screen | Jon | Sticker |
|---|---|---|---|---|---|
| 1 | 5s | Jon, phone-held, vertical, pickup take | It is up | "The thing I have been building is up." | **Link sticker**, Jon's tagged bio URL, `utm_content=warm-01` |
| 2 | 5s | 3 seconds of the plate photo returning itemized rows, from Saturday setup 1 | One photo. Every item. | (none, shutter) | None. Keep the frame clean |
| 3 | 5s | Jon, pickup take, same framing as frame 1 | Tell me what breaks | "It is free. Go break it and tell me what broke." | **Link sticker** again, same URL |

**Rules:** link **sticker**, never "link in bio". A story sticker is measurable and a bio
instruction is not. Both stickers use the tagged link George sends Monday night, not a URL Jon
types, or the 9/1 attribution splits and the T+7 review cannot read it.

**Fallback if the Saturday pickup does not happen:** Jon films all three frames live on 9/1 at
09:25, one take each, from these lines. It costs four minutes and it is genuinely fine. The pickup
exists only so that the first thing his audience sees is not improvised at 09:29.

---

## E. Not in this pack, and owed

| ID | What | Why it is not here | Producer | Due |
|---|---|---|---|---|
| `MECH-01` | Watch It Work, 25-35s, deeper plate logging **including where it guesses badly** | **C4 overruled (see C.0): runs Thu 9/3 10:00 with caption `C-17`, keyword `PLATE`.** Its footage is Saturday setup 1, so the script must exist before the batch. | `reels-scripts` | **Thu 8/27 22:00**, runs Thu 9/3 10:00 |
| `QA-01` | Coach Answer, Reel or carousel, from the real most-asked launch-day question | Cannot be pre-scripted. Writing it before launch day defeats it. | George drafts Fri 9/4 09:00 from comments and DMs, Jon films one take | Fri 9/4, runs 17:00 |
| Light LIVE-mode capture | `workout-log-light.webp` | Asset debt, `accounts-setup.md` §9. Not needed for launch week; `WIW-02` is deliberately dark. | `screenshot-capture` | Optional, Tue 9/8 |
| Barcode-scan capture | No still and no footage of the barcode path | Out of launch-week scope. It is mentioned nowhere in this pack for exactly that reason. | `screenshot-capture` | Week of 9/8 |

## F. Quality bar, checked against this pack

- Frame one is a face, a motion, or a legible 4-7 word overlay in all eight. No logo, no title card, no slow push-in anywhere.
- Spoken line and on-screen text carry different information in every beat of every script.
- A cut or reframe lands every 1.5-2.5s through the first eight seconds of all eight.
- Every last frame rhymes with its first.
- Exactly one CTA each. Two are keyword CTAs (`LIVE`, `WEEK1`) and both replies are already written in `accounts-setup.md` §6.1; George must have them pasteable on the phone (task G11) before those posts go up.
- Every caption carries its search phrase inside the first 125 characters.
- Every product behaviour shown exists today and could be filmed against a real screen. Nothing in any script implies the camera watches a set.
- Every Jon line that makes a claim about his own coaching history is flagged, with a safe default written for the ones that would otherwise ship unconfirmed.
- Zero results claims, zero user counts, zero pricing beyond "free today", zero testimonials, zero before/after, zero invented client stories, zero tenure numbers.
- The Becoming appears in exactly one beat, in one script, and is dropped entirely if check V1 fails.
- Every capture path cited resolves in this worktree. Everything that does not exist yet is named with a setup, an owner, and a day. `marketing/out/` is **absent from this worktree** and is referenced by no script in this pack.
- Every runtime sits in a band and no beat exists to fill time.
