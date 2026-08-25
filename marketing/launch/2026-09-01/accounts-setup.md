# Accounts setup: social bootstrap from zero

**Owner of this document:** social bootstrap agent, executing `social-strategy` (+ `coach-brand-voice`
for the handle split).
**Window:** Tue 2026-08-25 (accounts created) → Tue 2026-09-01 (launch) → Tue 2026-09-08 (T+7 review).
**Starting state:** zero brand accounts. Jon has a personal Instagram in the `@jondon275` handle family,
reach unknown. Verified today: 15 product captures in `webapp/public/screenshots/v2/`, 19 reviewed
vertical spots in `marketing/out/videos-reviewed/`, 46 campaign stills in `marketing/out/collection/`
(5 of them stale by slug against `marketing/src/campaigns.json`, see Asset debt).

Dated run of show for launch day itself belongs to the `launch-campaign` deliverable in this folder.
Dates for individual posts belong to the `content-calendar` deliverable. This document decides the
platforms, the handles, the copy, the assets, and who does what to get the surfaces standing.

---

## 1. Decisions locked

1. **Three surfaces, not five: Jon's Instagram, a Become brand Instagram, a Become TikTok.** Jon's
   handle is the launch's number one channel and the strategy is built around it, not beside it.
2. **YouTube Shorts is cut from launch week.** One line: it is the cheapest re-export we have (same
   vertical file, same captions) but it is the slowest cold start of the three and it costs a channel
   setup, branding, and per-video descriptions that George does not have hours for between Wed 8/26
   and Mon 8/31. Re-enters as a batch re-upload of the month's Reels on **Tue 9/15**, once the files
   exist anyway.
3. **X is cut, permanently for this launch.** One line: the only launch-week reason to want X is a
   Product Hunt day driving referral chatter, and Product Hunt is deferred to Tue 10/6 (see
   `listings.md`), so X would be a zero-audience account posting into a category that does not live
   there.
4. **One handle string across Instagram and TikTok.** Whichever candidate is free on both wins. We do
   not split handles across platforms, because the handle is spoken aloud in Reels and printed in
   captions.
5. **Jon's handle is not renamed and not rebuilt.** Renaming an existing account breaks every link
   already pointing at it and resets its search association. He changes his display name, his bio, and
   his link. Nothing else.
6. **Format split: Reels for reach, carousels for trust, statics only when a still carries the
   information.** Four slots per week, not five (see §6). We cut a line rather than compress five into
   a week that a one-builder team cannot hold for eight weeks.
7. **CTA ladder order: send > comment keyword > save > profile link.** "Link in bio" is never the
   primary CTA on a Reel. All four keyword DM replies are written below and are sent by hand, because
   we run no DM-automation tool and none is assumed.
8. **The brand account never speaks in the first person, and Jon never reads a feature bullet.** The
   register split is enforced per post, per §4.

---

## 2. Handles

### 2.1 Availability was NOT verified, and here is the evidence

Checked today from this machine: `https://www.instagram.com/<handle>/` and
`https://www.tiktok.com/@<handle>` return **HTTP 200 for every string tested, including the nonsense
control `zzqx9v3nothinghere`**. Both platforms serve a login interstitial rather than a 404, so an
HTTP probe carries no availability signal at all. The candidates below are ranked on plausibility,
spoken clarity, and search value. **George checks real availability inside the signup form on Tue 8/25**
and takes the highest-ranked candidate free on both platforms.

### 2.2 Brand handle, ranked

| Rank | Handle | Chars | Why it ranks here |
|---|---|---|---|
| 1 | `becomeapp.fit` | 13 | Says the product and the category. "Become" alone is a common word and almost certainly taken on both platforms; the two-token form is where an unclaimed string realistically lives. Reads cleanly when spoken: "become app dot fit". |
| 2 | `trainbecome` | 11 | Verb first, no punctuation to dictate aloud, shortest to type into a search bar. Loses the category signal that `.fit` carries. |
| 3 | `become.training` | 15 | Most descriptive and the best social-search string. Weakest spoken, and 15 characters is a long tag to type in a comment. |

Rejected and why, so nobody re-proposes them: `becomefitness` (generic, reads as a gym chain),
`getbecome` (SaaS-shaped, means nothing to a lifter), `becomecoach` (implies we sell coach services,
which the admin-gated chat surface does not deliver), anything containing `redbtn` (the domain is a
subdomain of an unrelated brand and a first-party domain decision is still open).

**Rule if rank 1 is free on Instagram and taken on TikTok:** drop to rank 2 and take it on both. Do not
run `becomeapp.fit` on one platform and `trainbecome` on the other.

### 2.3 Jon's handle

Keep `@jondon275` exactly as it is on Instagram. If a TikTok account under the same handle does not
exist, George registers it on Tue 8/25 and parks it (bio + avatar only); Jon's TikTok posting starts at
week 3 at the earliest, and only if the Instagram slot is holding.

---

## 3. Account cards, final copy

Limits stated are as of Aug 2026 and are re-checked in the form at signup. Counts below are exact
(spaces and punctuation included).

### 3.1 Become brand, Instagram

| Field | Final copy | Count / limit |
|---|---|---|
| Username | `becomeapp.fit` (or the highest-ranked free candidate) | 13 / 30 |
| Display name | `Become \| Train, Eat, Track` | 26 / 30 |
| Category (Professional account) | Health & Fitness Website | — |
| Bio | `Coach-built training programs. Food logged from one photo of the plate. Short mind sessions. Free today, email link, no card.` | 125 / 150 |
| Link 1 (label "Open Become") | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=brand_bio` | — |
| Link 2 (label "How it works") | `https://become.redbtn.io/#how` | — |
| Contact button | Email only. No phone, no address. | — |

The display name carries the search phrase, which is the field Instagram search actually weights;
"Become" on its own returns a dictionary word.

**Account type:** Professional → Creator is wrong here (Creator is for a person), so choose
**Business**. Business exposes the second link slot, the contact button, and reach breakdowns we need
for the measurement set in §7.

### 3.2 Become brand, TikTok

| Field | Final copy | Count / limit |
|---|---|---|
| Username | same string as Instagram | 13 / 24 |
| Nickname | `Become \| Train, Eat, Track` | 26 / 30 |
| Bio | `Coach-built training. Food logged from a photo. Free today.` | 59 / 80 |
| Website field | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=brand_bio_tt` | — |

**Gotcha to check in the form:** TikTok's clickable website field has historically been gated behind a
follower threshold on personal accounts. Switch the account to **Business** at signup, which exposes
the field without a follower minimum. If the field is still gated on the day, the bio becomes
`Coach-built training. Food from a photo. become.redbtn.io` (56) and the link moves into the first
comment of each post. Do not fake a link.

### 3.3 Jon Don, Instagram (existing account, edited in place)

Jon speaks in the first person everywhere. This copy is his, not the product's.

| Field | Final copy | Count / limit |
|---|---|---|
| Username | `jondon275`, unchanged | — |
| Display name | `Jon Don \| Coach` | 15 / 30 |
| Bio | `Coach. I write the programs inside Become: training, food and mind in one app. Free today, email link. Ask me anything in the comments.` | 135 / 150 |
| Link 1 (label "The app I built") | `https://become.redbtn.io/?utm_source=linkinbio&utm_medium=social_organic&utm_campaign=202609_public_launch&utm_content=jon_bio` | — |

Alternate bio if Jon wants his coaching identity ahead of the product (his call, he owns the account):
`Coach. Fifteen years of writing programs. I put the whole system in an app called Become. Free today, email link.` (113). **The "fifteen years" number is a placeholder Jon must replace with the true one or delete. It ships only with his sign-off.**

### 3.4 UTM grammar

**Resolved at the 8/25 review:** the canonical grammar is the one in `george-checklist.md` Fri
13:00 — campaign `202609_public_launch`, `utm_source=linkinbio` / `utm_medium=social_organic` for
bios — and the three links above are already rewritten to it. Record all three in `measurement.md`
at the Fri 8/28 minting pass. What must not happen is untagged bio links, because then every
signup on 9/1 reports as direct and the T+7 review is unreadable.

---

## 4. Brand handle vs Jon's handle

Per `coach-brand-voice` §1. Registers never mix inside one block; a product CTA under a Jon post sits on
its own line after a visible break.

| | Become brand handle | Jon's handle |
|---|---|---|
| Person | Second person, "you" | First person, "I" |
| Owns | Mechanism demos, one-tap teaching carousels, product updates, the weekly recap slot | Coach answers, opinions on camera, replies, behind-the-programming |
| Proof it may use | The product does it, on screen | He has watched it happen, and he wrote the phases |
| May never | Say "I have coached people through this" | Read a feature bullet, or claim a client result |
| Slots (see §6) | Mon Watch It Work, Wed One Tap, Sun Read Your Week | Thu Coach Answer |
| Cross-posting rule | Jon reshares brand posts to his **story** with one line of his own. Never the same feed file on both handles in the same hour. | Brand reshares Jon's Reel to story with a product line under a visible break. |

Worked pair, same mechanism, so the difference is legible:

> **Brand:** LIVE mode holds one set on screen with last session's numbers underneath. Two taps and the
> rest timer starts itself. Free today, email link, no card.
>
> **Jon:** I used to write your last weight on an index card so you would stop guessing at the rack.
> This is the card, and it never gets lost.

---

## 5. Day one on a three-day-old account

> **Superseded on dates and counts by `content-calendar.md` §2 (R-1 to R-4): the grid seed is 6
> squares on Sun 8/30, the film batch is Sat 8/29 (not Wed 8/26), TikTok starts Thu 9/3, and the
> three pins collapse into calendar rows (pin 1 → `ONETAP-01` Fri 9/4, pin 2 → `WIW-01`, pin 3 →
> `WIW-02`).** The copy, highlight specs and asset choices below stand.

A visitor on Tue 9/1 hits a profile created Tue 8/25. It has to read as a launch, not as an empty shell.
Original target below; the operative plan is the calendar's.

### 5.1 Pinned posts, brand Instagram (Instagram allows three)

**Pin 1, carousel, 6 slides, "What Become actually is."** Posted Fri 8/28.
Slides built by `image-production` from existing captures. Slide files land at
`marketing/out/social/pin1-01.png` … `pin1-06.png`, 1080x1350.

| Slide | Source capture | On-slide line |
|---|---|---|
| 1 | `webapp/public/screenshots/v2/dashboard-light.webp` | Your day on one screen |
| 2 | `webapp/public/screenshots/v2/workout-hub-light.webp` | A coach's phases, in order |
| 3 | `webapp/public/screenshots/v2/workout-log-dark.webp` | Log the set. Last session's numbers are already there |
| 4 | `webapp/public/screenshots/v2/nutrition-meal-light.webp` | Every item, itemized against your targets |
| 5 | `webapp/public/screenshots/v2/mind-light.webp` | A short session for the mind |
| 6 | text only, brand field | Free today. Email link, no card. |

Caption, final:

```
Five hubs, one app: training, food, mind, progress, and the day in front of you.

Coach Jon Don writes the multi-phase programs and the app runs them for you. When the plan does not fit
the room you are standing in, the generator builds a session around the equipment actually in front
of you. Log a set and your last numbers are already on the screen. Photograph the plate and it
comes back itemized against your calorie and macro targets.

Save this if you are the one running a plan across three apps and a notes file.

Free today. Email link, no card. The link on this profile opens it.
```

**Pin 2, Reel, 20-25s, plate photo.** Posted Sat 8/29. Screen recording, filmed for the post by George
on a phone against a dummy account (`webapp/public/screenshots/v2/manifest.json` names the accounts).
Never a real member account, never a camera-roll photo.

Caption, final (first 125 characters carry the search phrase, because that is what gets read before the
"more" tap):

```
App that logs food from one photo of the plate. Point the camera at lunch and every item comes back with
calories and macros against your targets. Correct anything it read wrong and it is logged.

Send this to whoever gave up on tracking because typing four foods into a search bar at 9pm is miserable.

Free today. Email link, no card.
```

**Pin 3, Reel, 20-30s, LIVE set logging.** Posted Sun 8/30. Screen recording on a phone, filmed against
a dummy account. **Never say or imply the camera watches the set.** LIVE mode is a logging view.

Caption, final:

```
Workout app that remembers your last weight. LIVE mode holds one set on the screen with what you lifted
last time sitting underneath it, and the rest timer starts when you tick the set off.

Comment LIVE and I will send you the three steps to start one.

Free today. Email link, no card.
```

### 5.2 The other six tiles

Posted three per day is a spam-flag risk on a five-day-old account, so **two per day, spaced at least
three hours**, Fri 8/28 through Mon 8/31.

| # | Format | Source asset | Pillar |
|---|---|---|---|
| 4 | Static | `marketing/out/collection/square/10-one-coach-one-system.jpg` (re-rendered, see Asset debt) | Plan the week |
| 5 | Reel | `marketing/out/videos-reviewed/12-open-know-move.mp4` | Watch it work |
| 6 | Carousel, 4 slides | `generate-light.webp` + `workout-hub-light.webp` | One tap at a time |
| 7 | Static | `marketing/out/collection/square/03-never-miss-twice.jpg` (re-rendered) | Read your week |
| 8 | Reel | `marketing/out/videos-reviewed/18-week-without-surprises.mp4` | Plan the week |
| 9 | Carousel, 5 slides | `progress-light.webp` + `dashboard-light.webp` | Read your week |

Every one of these is an asset that already exists or a re-render of one. Nothing here needs a new
capture. Two gaps are named in Asset debt below and neither blocks the grid.

### 5.3 TikTok on day one

TikTok does not reward a seeded grid, it rewards the first video's watch time. **Three videos by 9/1**,
not nine: the two pin Reels re-cut with a different first 1.5 seconds and a different on-screen hook,
plus `marketing/out/videos-reviewed/12-open-know-move.mp4`. Posting the identical file to both platforms
in the same hour is against §1.8 of `platform-mechanics` and it looks automated.

### 5.4 Jon's account on launch day

One pinned feed post, filmed Wed 8/26. His voice, one idea, no feature list. Final copy, **pending his
sign-off on the first line**:

```
I built the thing I kept asking clients to do by hand.

Write down what you lifted. Take a picture of what you ate. Look at the week on Sunday instead of
guessing at how it felt. Nobody keeps that up across three apps and a notes file, and I stopped
pretending they would.

So it is one app now. The programs are mine, phase by phase. The app holds the rest.

Free today. Email link, no card. Link on my profile.
```

Plus a five-frame story sequence on 9/1, posted by Jon: (1) the app open on his phone, filmed, (2) "the
programs are the ones I write", (3) plate photo in three seconds, (4) LIVE set logging, (5) link sticker
to `become.redbtn.io`. Story link sticker, not "link in bio".

### 5.5 Highlights, five covers

| Highlight | Cover asset (produced by `image-production`) | Contents on 9/1 |
|---|---|---|
| Start here | `marketing/out/social/hl-start.png` | Pin 1 slides re-posted to story, plus the link sticker |
| Training | `marketing/out/social/hl-training.png` | Pin 3 Reel, tile 6 carousel |
| Food | `marketing/out/social/hl-food.png` | Pin 2 Reel |
| Mind | `marketing/out/social/hl-mind.png` | `mind-light.webp` story frame |
| Your week | `marketing/out/social/hl-week.png` | Tile 9 carousel |

Highlights are what a three-day-old profile uses to look deliberate. Five is the number that fills the
row on a 390px viewport without wrapping.

---

## 6. Weekly operating cadence

Four slots, sustained. The fifth pillar ("Plan the week") is deliberately **not** a weekly slot for the
launch month; it runs inside Wednesday's carousel when the idea calls for it and re-enters as its own
slot on Mon 9/29 only if the four have held for four weeks. This is the 90-day-template overload lesson
applied by cutting a line rather than compressing five into a week that collapses in week three.

| Slot | Day | Platform | Format | Pillar | Owner | Asset source |
|---|---|---|---|---|---|---|
| Watch It Work | Mon | IG + TikTok (delayed, different first frame) | Reel 15-30s | Watch it work | Brand (George posts) | Screen recording filmed for the post; `workout-log-dark.webp` for stills |
| One Tap | Wed | IG | Carousel 4-6 slides | One tap at a time | Brand (George posts) | `webapp/public/screenshots/v2/` via `image-production` |
| Coach Answer | Thu | Jon IG + TikTok | Reel 30-45s | Coach answer | Jon films, George posts | Batch filmed, 4-6 per session |
| Read Your Week | Sun | IG | Reel or carousel | Read your week | Brand (George posts) | `progress-light.webp`, `mind-light.webp` |

Hard caps: **Read Your Week is one slot per week and it is the only slot where The Becoming may be
named at all.** Coach Answer never answers an injury, medical, or pregnancy question; the referral
response in `coach-brand-voice` §5 is the only response.

Capacity this is sized against, stated plainly so it can be argued with: one filming session per month
from Jon (Wed 8/26 is the first), one screen-capture session per month from George, and roughly three
hours per week of posting and replies. Four slots is what that buys. It is not what a benchmark
recommends.

### 6.1 Keyword DM replies (written before any keyword post ships)

Sent by hand, from the brand account, in product voice. Paste from here.

- **`LIVE`** → "Three steps: open your program, tap the session, hit Live. Log each set as you finish it
  and the rest timer starts itself. What you lifted last time sits under the field you are typing into.
  become.redbtn.io"
- **`PLATE`** → "One photo of the plate comes back as a list: each item, its calories, and the macros
  against your targets. Correct anything it read wrong and it is logged. Nutrition tab, camera icon.
  become.redbtn.io"
- **`WEEK1`** → "Week one is three or four sessions depending on the program, in order, with the
  progression already written. Pick a program, set your training days, and the week fills in.
  become.redbtn.io"
- **`BECOME`** → "It is a coach-built training app that also holds your food and a short mind session,
  so the plan is in one place. Free today, email link, no card. become.redbtn.io"

A keyword post ships only when somebody is around to answer it. Do not run a keyword slot on a day
neither George nor Jon can reply within a few hours.

---

## 7. Measurement

Three numbers. Reviewed **Tue 9/8** and every second Tuesday after.

1. **Sends per reach** (Instagram Insights, per post). The lever for unconnected reach.
2. **Saves per reach** (per carousel). Whether the teaching slot earns trust.
3. **Profile-to-signup**, read from the tagged bio links against signups in the same window.

Supporting, read but not steered by: three-second hold, average watch time, follows per reach.

**Baseline, recorded before launch:** zero on all three for the brand handles, which is honest and
trivially recorded. For Jon's handle the baseline is **not known today** and is a Day 1 task (§8, task
J1): his follower count, his median reach per post over the last ten posts, and whether those posts have
insights at all. Without that number, nothing on 9/8 can be called a lift.

**Kill rule:** a pillar in the bottom quartile of sends per reach for four consecutive weeks gets rebuilt
or dropped. First possible kill date is Mon 9/28.

**Not measured, deliberately:** follower count as a headline number, and any figure from
`social-strategy/references/`. Every benchmark in that library is internal and none of it may be
restated as a Become result.

---

## 8. Setup checklist

Owner, day, and realistic minutes. Anything needing account creation, phone verification, or filming is
a human task and is marked.

### Tue 8/25 (today)

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| G1 | **HUMAN.** Create brand Instagram: check candidate handles in-form, take the highest free on both platforms, verify email and phone, switch to Business. | George | 20 | Phone verification. Use the brand email, not a personal one. |
| G2 | **HUMAN.** Create brand TikTok on the same handle string, verify, switch to Business. | George | 15 | Phone verification. |
| G3 | Park `jondon275` on TikTok if free. Bio + avatar, no posts. | George | 5 | Defensive only. |
| J1 | **HUMAN.** Jon reports: follower count, median reach over his last ten posts, whether Insights are enabled, and whether his account is Personal or Creator. | Jon | 10 | This is the launch's number one channel and its size is currently unknown. Blocks the 9/8 review. |
| J2 | **HUMAN.** Jon confirms Wed 8/26 filming and reads §5.4 for sign-off on the pinned copy. | Jon | 10 | The "fifteen years" placeholder is his to fill or cut. |
| G4 | Set both brand bios, display names, and tagged links from §3. | George | 10 | Copy is final. Paste it. |

### Wed 8/26

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| J3 | **MOVED to Sat 8/29 09:00-13:00** (calendar R-1; `jon-checklist.md` already says Saturday). | Jon | — | One batch, one morning. |
| G5 | **MOVED to Sat 8/29**, same session (calendar R-1). | George | — | Dummy account only. No "(beta)" in frame. Prod host only. iOS/Safari only. |
| G6 | Warm the new accounts: browse, follow 20 relevant accounts, no posting yet. | George | 10 | New-account spam-limit hygiene. |

### Thu 8/27

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| A1 | `image-production`: avatar 1080x1080, subject inside a centered 864px circle. Field `#18181b`, glyph "B" in `#22c55e`, sourced from `webapp/public/icons/icon.svg`. Output `marketing/out/social/avatar-1080.png`. Check legibility at 40px. | agent | 20 | The shipped app icon is a white B on `#18181b`; the avatar adds brand green so the profile is findable in a feed. The app icons are **not** changed. |
| A2 | `image-production`: five highlight covers, 1080x1920, glyph centered inside a 480px circle safe area, paths per §5.5. | agent | 25 | |
| A3 | `image-production`: pin 1 slides ×6 and tiles 6 and 9 carousel slides, 1080x1350, from the v2 captures named in §5.2. | agent | 45 | |
| A4 | `remotion-assets`: re-render the collection (`npm run render:collection`, wrapped in `timeout`). Resolves the stale slugs in Asset debt. | agent | 40 | Long render. Bound it. |
| G7 | Upload avatar and highlight covers to both accounts. | George | 10 | |

### Fri 8/28 → Mon 8/31

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| G8 | Post pin 1 (Fri), pin 2 (Sat), pin 3 (Sun). Pin each after posting. | George | 15/day | |
| G9 | Post tiles 4-9, two per day, three hours apart. | George | 20/day | Spam-limit hygiene. |
| G10 | Post the three TikTok videos, one per day Sat-Mon, each with a different first frame from its Instagram twin. | George | 15/day | |
| G11 | Save the four keyword DM replies (§6.1) somewhere pasteable on the phone. | George | 5 | A keyword with no reply reads as bait. |
| J4 | **HUMAN.** Jon posts one warm-up story on Sat 8/29: "something I have been building is up on Tuesday." No link yet. | Jon | 5 | |
| G12 | Mon 8/31: dry run. Open each profile on a phone, in light and dark, signed out. Fix anything that reads empty. | George | 20 | This is `launch-campaign` readiness gate row 3.1 for the social surfaces. |

### Tue 9/1 (launch)

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| G13 | Brand launch post goes live; Jon's pinned post goes live; Jon's five story frames go live with the link sticker. | George + Jon | 30 | Sequencing owned by `launch-campaign`. |
| G14 | **HUMAN.** Reply window: both accounts, comments and DMs, blocked hours. | George am / Jon pm | 120 | Readiness gate row 5.1 requires a named owner with hours blocked. |

### Tue 9/8 (T+7)

| # | Task | Owner | Min | Notes |
|---|---|---|---|---|
| G15 | Record the three measurement numbers against the 8/25 baselines. Decide nothing yet on a single week; note the direction. | George | 30 | |
| G16 | YouTube Shorts decision revisited on 9/15, not now. | George | — | |

---

## 9. Asset debt (named, with a producer and a day)

| Gap | Impact | Producer | Due |
|---|---|---|---|
| 5 rendered campaign stills are stale by slug against `campaigns.json`: story `26-coaching-after-the-gym` → `26-the-plan-comes-home`, `27-ask-your-coach` → `27-not-a-random-workout`, `31-start-transformation` → `31-your-next-rep`; landscape `40-direct-coaching` → `40-coach-built`, `41-questions-answered` → `41-show-me-how`. More rows changed copy in place at commit `4e3a1c4`. | Any post using an un-re-rendered still risks shipping pre-truth-pass copy, including a "start your transformation" CTA that is a banned line. | `remotion-assets` (task A4) | Thu 8/27 |
| No LIVE-mode light capture. `workout-log-dark.webp` is dark only. | Pin 3 and the Monday slot are dark-only creative. Acceptable (it reads as the in-gym screen) but it caps what the Wednesday carousel can pair. | `screenshot-capture` | Optional, Tue 9/8 |
| No capture of the whole-plate photo path. `nutrition-meal-*.webp` was seeded by typing through food search, per the capture manifest. | The plate mechanic is our most differentiated one and has no still. Pin 2 covers it with a filmed screen recording instead, which is stronger anyway. | `screenshot-capture` | Optional, Tue 9/8 |
| `marketing/out/` is gitignored and empty in this worktree; the renders live in the main checkout. | Any agent assuming these files are committed will find nothing. | n/a, stated as fact | — |

---

## 10. Open questions

| # | Question | Decision it blocks | Owner |
|---|---|---|---|
| 1 | Jon's actual reach (task J1). | The entire 9/8 review, and whether the brand handle or Jon's handle carries launch day. | Jon, Tue 8/25 |
| 2 | Which handle string is genuinely free on both platforms. | Every printed handle in every other launch deliverable. | George, Tue 8/25 |
| 3 | Is Jon willing to be on camera weekly, or is monthly the truth? | Whether Thursday is a weekly slot or a fortnightly one. | Jon, Tue 8/25 |
| 4 | The Remotion pillar palette does not match the brand tokens (`training #00D26A` vs `#16a34a`). | Any re-rendered still shipping to a public feed. Brand tokens win until reconciled, and the map changes in one place. | George, before task A4 |
| 5 | First-party domain. Every bio link currently points at a subdomain of an unrelated tech brand. | Nothing this week. Flagged because bios are cheap to edit and links printed on video are not. | George, post-launch |
| 6 | Whether Jon's account has Insights at all (Personal accounts do not). | Whether sends per reach is measurable on the highest-leverage channel. | Jon, Tue 8/25 |
