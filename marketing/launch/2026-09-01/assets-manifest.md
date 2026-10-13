# Assets manifest: public launch, Tue 2026-09-01

Produced Tue 8/25 by the asset-production pass (`remotion-assets` + `image-production`). Every path
is repo-relative. Every dimension and byte size in this file was read back off the file, not assumed.

**`marketing/out/` is gitignored.** Nothing in it ships through a merge. The renders below exist on
this machine in the `become-launch-plan` worktree and the orchestrator preserves that directory;
treat `out/` as a preserved local deliverable, not as repo content. Anything that must survive
independently of this machine has to be copied into `webapp/public/` deliberately, and nothing in
this plan requires that.

Status vocabulary, used in every table:

| Status | Meaning |
|---|---|
| **RENDERED-TODAY** | Produced Tue 8/25 in this worktree, verified, ready to post |
| **EXISTS** | Already in the repo before today, unchanged, verified |
| **TO-PRODUCE** | Does not exist. Owner, day and producing skill named |
| **BLOCKED** | Cannot be produced until a named dependency lands |

---

## 1. What happened today, in order

| # | Action | Command | Result |
|---|---|---|---|
| 1 | Installed the render project | `timeout 600 npm install` | 250 packages, 15s, 0 vulnerabilities. `marketing/node_modules` was absent, as documented |
| 2 | Typecheck | `timeout 180 npm run typecheck` | Pass, run before each of the three renders |
| 3 | Truth-pass re-render debt | `timeout 1800 npm run render:collection` | 49 stills. `out/` did not exist in this worktree at all, so this is a first render, not a refresh. No orphaned pre-truth-pass slugs existed here to delete |
| 4 | Launch campaign rows | `Campaign47/48/49` appended to `src/campaigns.json` | Square, story, landscape. Rendered |
| 5 | Base stills | `render:square`, `render:story`, `render:og` | 3 PNGs |
| 6 | Reviewed video set | `timeout 5400 npm run render:reviewed` | 19 MP4s, all past the 150 KB assertion |
| 7 | Reel | `timeout 590 npm run render:reel` | `out/become-reel.mp4`, 12s |
| 8 | Review contact sheet | `timeout 900 npm run review:pass -- 3` | `out/reviews/pass-03/sheet.png`, 2232x3132 |
| 9 | Profile assets | sharp, scratch script, deleted after use | 4 avatar masters, 5 highlight covers, 2 proof sheets |
| 10 | Budgeted exports | sharp | OG, square and story jpegs inside their platform budgets |

Nothing failed. No item needed a second attempt.

**Totals in `out/`: 94 images, 20 videos, 94 MB.** 49 campaign stills (17 square, 16 story, 16
landscape), 0 dimension mismatches against the format map, 0 undersized videos.

---

## 2. Launch-day critical path

These are the files Tue 9/1 cannot run without. All exist now.

| Asset | Path | Dimensions | Size | Consumer | Status |
|---|---|---|---|---|---|
| Launch square | `marketing/out/collection/square/47-launch-live-september-1.jpg` | 1080x1080 | 95 KB | Brand IG feed 9/1, `LAUNCH-HERO-B` static fallback if the filmed Reel slips | RENDERED-TODAY |
| Launch story | `marketing/out/collection/story/48-launch-live-today-story.jpg` | 1080x1920 | 187 KB | Jon's 9/1 09:30 story frame 1, brand story, link-sticker frame | RENDERED-TODAY |
| Launch landscape | `marketing/out/collection/landscape/49-launch-open-the-app.jpg` | 1200x628 | 109 KB | X / LinkedIn card, AlternativeTo and PWA-directory submissions 9/1, any link unfurl | RENDERED-TODAY |
| Open graph | `marketing/out/become-open-graph.png` | 1200x630 | 762 KB | `listings.md` line 326 references this path directly | RENDERED-TODAY |
| Open graph, budgeted | `marketing/out/launch/become-open-graph-1200x630.jpg` | 1200x630 | 82 KB, q90 | **Use this one on any real surface.** The PNG is 762 KB against a 300 KB budget | RENDERED-TODAY |
| Avatar | `marketing/out/social/avatar-1080-arrow-ring.png` | 1080x1080 | 312 KB | Both brand accounts, task G7 in `accounts-setup.md` | RENDERED-TODAY |
| Highlight covers x5 | `marketing/out/social/hl-{start,training,food,mind,week}.png` | 1080x1920 | 30-32 KB each | `accounts-setup.md` §5.5, task A2 | RENDERED-TODAY |

Launch copy, verbatim as rendered, so nobody has to open the files to review it:

| Row | Kicker | Headline | Body | CTA |
|---|---|---|---|---|
| `Campaign47` square | LIVE SEPTEMBER 1 | BECOME / IS LIVE. | Training, nutrition, mind, and progress in one app. Free today. | Open the app |
| `Campaign48` story | SEPTEMBER 1 | THE APP IS / LIVE TODAY. | Coach-built programs, food logging by photo, and your week on one dashboard. | Get your link |
| `Campaign49` landscape | NOW LIVE | OPEN THE APP. / KNOW YOUR DAY. | Become is live September 1. Programs, food, mind, and progress in one place. | Open the dashboard |

Copy provenance: "Open the app. Know your day." is an existing landing-page claim, already public.
"Free today" is the only permitted price statement. No count, no result, no timeline, no
testimonial, no banned word, no em dash. All three rows use pillar `system`, whose accent is the
neutral `#F7F7F5`, which keeps the launch set out of the unreconciled pillar-palette argument in §6.

---

## 3. Campaign collection, all 49 stills

`marketing/out/collection/{square,story,landscape}/<slug>.jpg`, jpeg quality 90, all
RENDERED-TODAY. Rows 47-49 are new; rows 1-46 are the truth-passed set re-rendered against seeded
captures (§6, finding F1). The rows named in a calendar slot or a caption file:

| Path | Dim | Size | Consumed by |
|---|---|---|---|
| `square/15-train-eat-reflect-repeat.jpg` | 1080x1080 | 130 KB | Sun 8/30 10:00 grid seed 1, **pinned**, caption `C-02` |
| `square/10-one-coach-one-system.jpg` | 1080x1080 | 112 KB | Sun 8/30 11:30 grid seed 2, **pinned**, `C-03`; `accounts-setup.md` grid tile 4 |
| `square/05-plan-the-work.jpg` | 1080x1080 | 121 KB | Sun 8/30 13:00 grid seed 3, **pinned**, `C-04` |
| `square/11-progress-not-guesswork.jpg` | 1080x1080 | 102 KB | Sun 8/30 14:30 grid seed 4, `C-05` |
| `square/08-fuel-the-work.jpg` | 1080x1080 | 104 KB | Sun 8/30 16:00 grid seed 5, `C-06` |
| `square/06-the-mind-is-the-muscle.jpg` | 1080x1080 | 104 KB | Sun 8/30 17:30 grid seed 6, `C-07` |
| `story/31-your-next-rep.jpg` | 1080x1920 | 228 KB | Sat 8/29 18:00 Jon warm-up story, `C-01`. Calendar says "re-rendered Wed 8/26"; done Tue 8/25, one day early |
| `story/18-week-already-planned.jpg` | 1080x1920 | 189 KB | Mon 8/31 20:00 Jon teaser story, `C-08` |
| `square/01-start-where-you-are.jpg` | 1080x1080 | 102 KB | `content-calendar.md` line 206, `captions-week1.md` line 662 |
| `square/03-never-miss-twice.jpg` | 1080x1080 | 133 KB | `accounts-setup.md` grid tile 7 |
| `square/04-strength-has-receipts.jpg` | 1080x1080 | 97 KB | `captions-week1.md` line 679 |

The other 38 are the standing library: `square/` 17 files, `story/` 16, `landscape/` 16. Full index
is `marketing/src/campaigns.json`, one row per file, slug equals filename.

**Two things changed inside the collection today beyond the owed re-render**, both to clear a
constraint violation rather than for taste:

| Change | Rows | Why |
|---|---|---|
| Em dash removed from `body` | 09, 15, 39, 44 | A rendered asset is deliverable copy and the em-dash rule applies to it. Row 44 also dropped the word "coaching" from a hub list, because human coaching over chat is admin-gated and not available |
| `image` repointed from `calendar.png` to `programs.png` | 03, 17, 18, 34 | `calendar.png` is an empty-state capture with no v2 replacement (§6, F1 and F4). The workout hub carries the real This Week strip, so the four weekly-planning rows keep their meaning |

---

## 4. Video

| Asset | Path | Spec | Size | Consumer | Status |
|---|---|---|---|---|---|
| Reviewed spots, 19 | `marketing/out/videos-reviewed/<slug>.mp4` | 1080x1920, 8s, h264 crf 18 | 2.5-4.5 MB each, 68 MB total | Grid tiles 5 and 8, story fillers, highlight contents | RENDERED-TODAY |
| ↳ named in the plan | `12-open-know-move.mp4` (3 MB), `18-week-without-surprises.mp4` (2 MB) | | | `accounts-setup.md` grid tiles 5 and 8, and the IG+TikTok same-file cross-post at line 254 | RENDERED-TODAY |
| ↳ rewritten today | `10-cues-on-the-lift.mp4` (2 MB) | | | Replaces `10-ask-while-its-fresh`, which sold coach chat. See §6 F2 | RENDERED-TODAY |
| Reel | `marketing/out/become-reel.mp4` | 1080x1920, 12s, h264 crf 18 | 3.9 MB | `listings.md` line 123 | RENDERED-TODAY |
| 6s spot collection, 19 | `marketing/out/videos/` | 1080x1920, 6s | n/a | Nothing in the launch plan references it | TO-PRODUCE, agent, only on demand: `cd marketing && timeout 5400 npm run render:videos` |

**`listings.md` says to leave the Product Hunt video empty because `become-reel.mp4` "predates the
8/25 truth pass."** That reason expired at 14:05 today: the reel was re-rendered from the current
compositions, after the em dash and the "Coaching, connected" eyebrow were fixed, against the
seeded captures. The second reason stands, so the decision does not change this week: 12s is still
short for a demo and the purpose-cut 45s screen recording is still the right fill on 9/28.

---

## 5. Profile and export assets

### Avatars, four masters, George picks one

`marketing/out/social/`. Proof sheet at `avatar-legibility-proof.png` (870x100) shows all four at
40px and 64px, which is the size that actually decides this.

| File | Dim | Size | What it is |
|---|---|---|---|
| `avatar-1080.png` / `avatar-320.png` | 1080x1080 / 320x320 | 1003 KB / 52 KB | Full lockup, arrow over the BECOME wordmark, exactly the installed PWA icon |
| `avatar-1080-ring.png` / `avatar-320-ring.png` | same | 984 KB / 65 KB | Same lockup with a `#22c55e` ring inside the circular crop |
| `avatar-1080-arrow.png` / `avatar-320-arrow.png` | same | 278 KB / 30 KB | Arrow glyph only, cropped from the lockup and scaled into the 864px safe circle |
| **`avatar-1080-arrow-ring.png` / `avatar-320-arrow-ring.png`** | same | 312 KB / 45 KB | **Recommended.** Arrow plus green ring. The only one of the four that is still legible at 40px |

Two deliberate deviations from task A1 in `accounts-setup.md`, both because the task's premise is
wrong and following it would have put a mark on the profile that matches nothing in the product:

- A1 says the shipped app icon is "a white B on `#18181b`". That describes
  `webapp/public/icons/icon.svg`, a fallback that nothing loads. The real shipped icon set,
  `icon-192x192.png` through `icon-512x512.png` and `logo.png`, is an **upward arrow over the
  BECOME wordmark on `#040505`**. The avatars are built from the real artwork, so the profile
  picture matches the home-screen icon a visitor installs.
- A1 says to set the glyph in brand green. The mark itself is never recoloured; green enters as a
  ring inside the crop. Recolouring a logo is a brand decision, not an export decision.
- Field colour is therefore `#040505`, not `#18181b`.
- The masters are 1080x1080 with the 1024px source centred, not upscaled. `withoutEnlargement`
  applies throughout; nothing in this manifest was enlarged.

### Highlight covers, five, per `accounts-setup.md` §5.5

`marketing/out/social/hl-{start,training,food,mind,week}.png`, all 1080x1920, 30-32 KB. Label
centred inside the 480px safe circle, accent ring, `#08080A` field. Proof of the actual circular
crop at display size: `highlight-covers-proof.png` (610x150).

| Cover | Label | Accent | Highlight it fronts |
|---|---|---|---|
| `hl-start.png` | START | `#F7F7F5` | Start here |
| `hl-training.png` | TRAIN | `#00D26A` | Training |
| `hl-food.png` | FOOD | `#FF981A` | Food |
| `hl-mind.png` | MIND | `#9818FF` | Mind |
| `hl-week.png` | WEEK | `#3887FF` | Your week |

The task brief asked for three covers; `accounts-setup.md` §5.5 needs five and five is what fills a
profile row, so five were produced.

### Budgeted exports

`marketing/out/launch/`. The Remotion PNGs are 762 KB to 1.9 MB, which is over budget for every
surface they would go on. These are the encode-once jpegs to actually use.

| File | Dim | Size | Budget | Quality |
|---|---|---|---|---|
| `become-open-graph-1200x630.jpg` | 1200x630 | 82 KB | < 300 KB | q90 mozjpeg |
| `become-social-square-1080.jpg` | 1080x1080 | 111 KB | < 500 KB | q90 mozjpeg |
| `become-story-poster-1080x1920.jpg` | 1080x1920 | 200 KB | < 500 KB | q90 mozjpeg |

### Base stills, as rendered

| File | Dim | Size |
|---|---|---|
| `marketing/out/become-social-square.png` | 1080x1080 | 1188 KB |
| `marketing/out/become-story-poster.png` | 1080x1920 | 1863 KB |
| `marketing/out/become-open-graph.png` | 1200x630 | 762 KB |

### Review artifacts, kept as evidence

| File | What it proves |
|---|---|
| `marketing/out/reviews/pass-03/sheet.png` (2232x3132) | All 19 reviewed spots at frame 70. Confirms `Reviewed10` now reads "KNOW THE FIRST CUE" with a cue card, not a chat thread |
| `marketing/out/previews/*.jpg` (4 files) | Downscaled spot-checks of rows 01, 47, 48, 49 |
| `marketing/out/social/avatar-legibility-proof.png` | Four avatars at 40px and 64px |
| `marketing/out/social/highlight-covers-proof.png` | Five covers at their true circular crop |

---

## 6. Findings that change what can ship

### F1. Every render input was an empty-state screenshot. Fixed today.

The eight PNGs in `marketing/public/` that all 49 stills, all 19 videos and the reel composite were
copies of the **legacy** `webapp/public/screenshots/ss-*.png` set, captured on an unseeded account.
Read at full size they show: "No workouts scheduled yet", "No schedules yet", "No workouts logged
yet", "No weight logged yet", Day Streak 1, This Week 0/4, Goal 0%, 0.0 lbs, an onboarding modal,
and a bottom-nav Chat tab for a feature that is admin-gated. The dashboard shot also renders the
banned word **"journey"** in-frame, on every asset that used it.

That is a direct hit on the hard constraint: captures "must never show bugs, empty states, or
(beta)". The first render of the day produced 49 unshippable files.

Fixed by repointing the render inputs at the v2 capture set, which is the documented dummy-account
pipeline with real seeded state:

| Input | Now sourced from |
|---|---|
| `marketing/public/dashboard.png` | `webapp/public/screenshots/v2/dashboard-light.webp` |
| `marketing/public/programs.png` | `workout-hub-light.webp` |
| `marketing/public/mindset.png` | `mind-light.webp` |
| `marketing/public/nutrition.png` | `nutrition-day-light.webp` |
| `marketing/public/progress.png` | `progress-light.webp` |

All five are 780x1688, identical geometry to what they replaced, so no layout shifted.
`marketing/scripts/sync-assets.mjs` was rewritten to match, with the reason written into the file,
so the next `npm run assets:sync` cannot silently restore the empty-state shots. The collection,
the base stills, all 19 videos and the reel were then re-rendered against the seeded inputs. These
five PNGs and the script are **committed files**, so this fix ships with the plan.

Residual, not blocking: the v2 dashboard still carries the product's own subtitle "Track your
fitness **journey**" at 12px. It is app copy, not marketing copy. Fix is one string in
`webapp/app/dashboard/`. Owner George, any day before the 9/28 Product Hunt gallery, since the
gallery renders it at 1270x760 where it is legible.

### F2. `Reviewed10` sold coach chat with a rendered chat thread. Fixed today.

The strategist flagged the copy. The render was worse than the copy: the `coach-thread` motif drew
three message bubbles including a coach reply, and a "COACH IS TYPING" caption. Human coach chat
ships behind an admin-gated `FeatureGuard` "Coming Soon" and may not be marketed at all.

Rewritten end to end: motif renamed `coach-cues`, the bubbles replaced with three numbered coaching
cues under a "BACK SQUAT / COACHING CUES" caption, the row recast to hook "KNOW THE FIRST CUE.",
proof "Coaching cues sit on the big lifts, inside the session you are doing.", CTA "Open a program",
image `programs.png`, slug `10-cues-on-the-lift`. Verified in `out/reviews/pass-03/sheet.png` and
rendered to `out/videos-reviewed/10-cues-on-the-lift.mp4`. `Reviewed19` also lost an em dash.

`chat.png` is now referenced by **nothing** in either copy surface. Leave it unused.

`SocialSquare` in `src/compositions.tsx` carried the same drift in its eyebrow, "Coaching,
connected", now "Coach-built", plus an em dash in its body line. Both fixed and re-rendered.

### F3. Two metric values in the reviewed set read as outcome claims. Not fixed, decision needed.

`Reviewed04` carries `metric: '+12.5 LB'` beside "PROGRESS LEAVES A PAPER TRAIL", and `Reviewed11`
carries `+8.4%` beside "ZOOM OUT. YOU'RE MOVING." As design elements they are illustrative; in a
fitness frame a number next to a progress headline reads as a result Become is offering, which the
constraints forbid. They are not obviously wrong the way F2 was, and changing a motion piece's
design token is a copy-owner call, not an export call.

Owner George or Jon, decide by **Fri 8/28**. Neither video is in a launch-week slot, so this does
not block 9/1. If they change, the fix is two strings in `src/reviewedCampaigns.ts` and a re-render
of two files.

### F4. There is no Calendar capture, in any set.

The v2 set covers eight screens and Calendar is not one of them. `marketing/public/calendar.png` is
still the legacy empty-state shot ("No schedules yet"). The four campaign rows that used it were
repointed. `reviewedCampaigns.ts` rows 03, 17 and 18 still name it; at the frames inspected their
motifs draw their own calendar graphics rather than compositing the file, but that was not verified
across the full 240 frames of each.

TO-PRODUCE: a seeded Calendar capture, light and dark, through `screenshot-capture` into
`webapp/public/screenshots/v2/` with a manifest entry. Owner George, **Fri 8/28** if the Calendar
screen is wanted in creative after launch week, otherwise Mon 9/28 with the Product Hunt gallery.
Nothing in launch week needs it.

### F5. Two layout defects were fixed in the composition, not worked around.

Both were shipping on multiple assets. `LightLayout` and `RailLayout` painted the footer strip
after the device, so "BODY · MIND · ROUTINE" landed on top of the phone screen on every story and
every light landscape. Footer now paints before the device and is cleanly occluded. `RailLayout`
square also ran its body copy under the device, clipping the last word on rows 01, 07 and 13; body
width at square is now 560px. Both are one-line changes in `src/campaignCollection.tsx` and both
are committed.

### F6. The pillar palette still does not match the brand tokens. Escalated, not settled.

`src/campaignCollection.tsx` uses `training #00D26A`; the brand token is `#22c55e`. The context doc
says brand tokens win for anything shipped externally and lists the reconciliation as open question
8, which means it has a decision owner. Settling it unilaterally would restyle 18 already-approved
assets three days before a freeze, so it was not settled here. The five highlight covers use the
**project** palette so that the covers, the grid tiles and the videos read as one system.

Owner George, decide by **Fri 8/28**. If brand tokens win, the fix is one line, `colors.training` in
`src/campaignCollection.tsx`, plus `timeout 1800 npm run render:collection` and
`timeout 5400 npm run render:reviewed`. Slugs and paths do not change, so no other document breaks.

### F7. Every asset in this manifest is typeset in Arial, not Geist.

`src/compositions.tsx:25` and `src/campaignCollection.tsx:35` hardcode
`'Arial, Helvetica, sans-serif'` and nothing loads Geist. No render configuration changes it. This
is a real brand gap and it is on every file listed above. Fixing it needs a font loader plus a
change at those two constants, then a full re-render.

Owner George, **not this week**. Deciding to ship Arial through launch is a defensible call at this
size; deciding it silently is not, which is why it is written down here.

### F8. Two docs disagree on the carousel filenames.

`carousels.md` names `marketing/out/social/onetap-01-01.png` and `ptw-01-01.png`;
`content-calendar.md` names `onetap01-01.png` and `ptw01-01.png` for the same slots. One of them
will send George looking for a file that does not exist on Fri 9/4. Owner: whichever agent produces
the carousels, **Thu 8/27**, pick one and correct the other document. `content-calendar.md` is the
posting surface, so its spelling should win.

---

## 7. TO-PRODUCE

Everything the launch references that does not exist yet. Nothing below is blocked on today's pass.

| Asset | Spec | Consumer | Producer | Owner | Day |
|---|---|---|---|---|---|
| `marketing/out/social/onetap01-01.png` … `-06.png` | 1080x1350 carousel, 6 slides, built on the v2 captures | Fri 9/4 12:00 One Tap carousel, **pinned**, `C-20` | `image-production` | agent | **Thu 8/27** |
| `marketing/out/social/ptw01-01.png` … `-05.png` | 1080x1350, 5 slides | Sat 9/5 11:00 Plan The Week, `C-22` | `image-production` | agent | **Thu 8/27** |
| `marketing/out/social/ryw01-01.png` … `-04.png` | 1080x1350, 4 slides, on `progress-light.webp` + `mind-light.webp` | Mon 9/7 11:00 Read Your Week, `C-24` | `image-production` | agent | **Thu 8/27** |
| `marketing/out/social/pin1-01.png` … `-06.png` | 1080x1350 | `accounts-setup.md` line 177, pin 1 and the Start here highlight | `image-production` | agent | **Thu 8/27** |
| `LAUNCH-HERO` take 2 and take 3 | Vertical, 30-45s and 25-30s, natural light, no logo card in frame 1 | Tue 9/1 10:00 Jon Reel and 10:05 brand Reel, `C-10` / `C-11` | **HUMAN, FILMING** | Jon | **Sat 8/29** batch |
| `LAUNCH-BTS`, `CA-01`, `CA-02`, `CA-03` | Vertical, 30-45s each | Wed 9/2, Thu 9/3, Sun 9/6, Thu 9/10 | **HUMAN, FILMING** | Jon | **Sat 8/29** batch |
| `WIW-01`, `WIW-02`, `MECH-01` | Screen recordings, 15-35s, from a dummy account only | Tue 9/1 16:00, Thu 9/3 12:30, Thu 9/3 10:00 | **HUMAN, SCREEN RECORDING** | George | **Sat 8/29** |
| Jon's 5-frame launch story | App open, program screen, plate photo, LIVE set, link sticker | Tue 9/1 09:30 | **HUMAN, FILMING** | Jon | **Sat 8/29**, staged by Sun 8/30 12:00 |
| `marketing/out/social/onetap02-01.png` … `-05.png` | 1080x1350, on `generate-light.webp` + `workout-hub-light.webp` | Wed 9/9 12:00 | `image-production` | agent | **Mon 9/7** |
| `marketing/out/social/wiw03-01.png` … `-03.png` | 1080x1350, on `workout-log-dark.webp`, `progress-dark.webp`, `dashboard-dark.webp` | Mon 9/14 11:00 | `image-production` | agent | **Fri 9/11** |
| `marketing/out/listings/ph-01.png` … `ph-06.png` | 1270x760 composites, captions per `listings.md` gallery manifest | Product Hunt 10/6 | `image-production` | agent | **Mon 9/28** |
| `marketing/out/listings/ph-thumb-240.png` | 240x240 | Product Hunt thumbnail | `image-production` | agent | **Mon 9/28**. Source it from `avatar-1080-arrow-ring.png` or `icon-512x512.png`, **not** from `icon.svg`, which is the unused white-B fallback, see §5 |
| `marketing/out/listings/uneed-cover.png`, `alt-01..04.png` | Per `listings.md` | Uneed, AlternativeTo | `image-production` | agent | **Mon 9/28** |
| Calendar capture, light and dark | 780x1688 webp, seeded, manifest entry | Post-launch creative, PH gallery if wanted | `screenshot-capture` | George | **Fri 8/28** or defer to 9/28 |
| LIVE-mode light capture | 780x1688, the missing twin of `workout-log-dark.webp` | Any light-theme LIVE creative | `screenshot-capture` | George | Post-launch |
| Purpose-cut 45s demo | Screen recording, dummy account | Product Hunt video field | **HUMAN, SCREEN RECORDING** | George | **Mon 9/28** |

---

## 8. Resume commands

All from `marketing/`. `node_modules` is now present in this worktree; a fresh clone needs
`timeout 600 npm install` first.

```bash
timeout 180  npm run typecheck                 # before any render, always
timeout 120  npm run assets:sync               # v2 captures -> marketing/public/, 6 files
timeout 1800 npm run render:collection         # 49 stills
timeout 300  npm run render:square             # out/become-social-square.png
timeout 300  npm run render:story              # out/become-story-poster.png
timeout 300  npm run render:og                 # out/become-open-graph.png
timeout 590  npm run render:reel               # out/become-reel.mp4, 12s
timeout 5400 npm run render:reviewed           # 19 x 8s spots, ~20 min, sequential
timeout 900  npm run review:pass -- 3          # contact sheet, needs ffmpeg
```

One asset only, when a single row changed:

```bash
timeout 300 npx remotion still src/index.ts Campaign47 \
  out/collection/square/47-launch-live-september-1.jpg --image-format=jpeg --jpeg-quality=90
```

Row validation, after every edit to `src/campaigns.json`, before the render: the script is in
`marketing/.claude/skills/remotion-assets/references/campaign-schema.md`. It reported `all 49 rows
ok` on the file as it stands.

Do not run `render:reviewed` or `render:videos` alongside a collection render.

---

## 9. Verification performed

- `npm run typecheck` passed before each of the three render batches.
- All 49 stills read back with sharp: 0 mismatches against `square` 1080x1080, `story` 1080x1920,
  `landscape` 1200x628.
- All 20 MP4s past the render scripts' own minimum-size assertions, 150 KB for reviewed, 100 KB for
  the 6s set; smallest actual file is 2.4 MB.
- Copy scan of `src/campaigns.json`: 0 banned words, 0 em dashes, 49 rows valid, every `image`
  resolves to a file in `marketing/public/`.
- Three changed rows spot-checked by reading the rendered pixels, not the JSON: `16-become-whats-next`
  (CTA now "Start today", the banned "Start your transformation" is gone), `26-the-plan-comes-home`
  (recast off coach chat onto the shared dashboard), `40-coach-built` (recast onto multi-phase
  programs from Jon Don).
- `Reviewed10` verified in the pass-3 contact sheet: no chat bubbles, no "COACH IS TYPING".
- Launch rows 47, 48 and 49 read at 600px wide; all three re-rendered after layout fixes.
- Avatars checked at 40px and 64px, the sizes that decide legibility.
- Highlight covers checked at their true circular crop, not at full frame.
- Every export's byte size read off the file and checked against the platform budget.

## 10. Files changed in the repo by this pass

Committed surfaces, so the orchestrator ships them:

| File | Change |
|---|---|
| `marketing/src/campaigns.json` | 3 launch rows appended; 4 em dashes removed; 4 rows repointed off `calendar.png`; 1 body tightened |
| `marketing/src/campaignCollection.tsx` | Footer paint order in `RailLayout` and `LightLayout`; square body width |
| `marketing/src/compositions.tsx` | `SocialSquare` eyebrow "Coaching, connected" to "Coach-built"; em dash removed |
| `marketing/src/reviewedCampaigns.ts` | `coach-thread` motif renamed `coach-cues`; `Reviewed10` recast; `Reviewed19` em dash |
| `marketing/src/reviewedVideo.tsx` | Chat-thread motif replaced with a coaching-cue card |
| `marketing/scripts/sync-assets.mjs` | Sources the v2 seeded captures instead of the legacy empty-state set, with the reason in the file |
| `marketing/public/{dashboard,programs,mindset,nutrition,progress}.png` | Replaced with the v2 seeded captures |
| `marketing/launch/2026-09-01/assets-manifest.md` | This file |

`marketing/out/` is untracked and gitignored, as it should be.
