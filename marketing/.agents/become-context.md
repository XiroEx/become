# Become Marketing Context

The single source of truth for Become marketing. Every skill reads this before writing a word.
Authored only by the `become-context` skill. Downstream skills report errors back here; they do
not patch claims locally.

Tag legend, used on every claim:
`[verified in repo]` · `[verified with Jon]` · `[assumption, unvalidated]`

---

## 1. Overview and current stage

Become (`become.redbtn.io`) is a mobile-first PWA fitness coaching app built around coach
**Jon Don**. It puts training, nutrition, mind, and progress in one place, with coach-built
programs and an AI generator behind them. `[verified in repo: webapp/app/dashboard/]`

- Delivery: installable PWA. No native app, no App Store or Play listing. `[verified in repo: webapp/app/manifest.json; no ios/android project in repo]`
- Signup: email magic link, with Google sign-in and passkeys alongside. No password, no credit
  card. `[verified in repo: webapp/app/api/auth/{send-link,google,passkey}/]`
- Price: free today. No pricing, tiers, trials, or discounts exist. `[verified in repo: no billing code, no pricing route]`
- Notifications: web push exists. `[verified in repo: webapp/models/PushSubscription.ts]`
- Stage: pre-revenue, small audience, coach-led credibility is the main asset. `[assumption, unvalidated]` (stage description; no counts are known or citable)
- Channels: production `become.redbtn.io` from `main`; beta `become-beta.redbtn.io` from `beta`.
  Both share one database, so beta data is production data. `[verified in repo: CLAUDE.md Channels table]`
- Team: effectively one builder plus Jon plus agents. Any plan must be executable at that size. `[verified with Jon: standing arrangement, 2026-08-25]`

**Open:** actual signup and weekly-active counts. Do not state a number anywhere until it is
reproducible, and never state it in public copy at all.

## 2. Product truth by hub

One row per hub. The mechanic column is what marketing sells, because it is what is hard to copy.

| Hub | Route | What you do | The mechanic |
|---|---|---|---|
| Dashboard | `/dashboard` | See the day at a glance | Streaks, mood, weight, water, customizable tiles |
| Training | `/dashboard/workout` | Follow or build a plan | Coach-built multi-phase programs; AI session and program generator; demo clips on the big lifts (39 of the 132 exercises); LIVE workout mode: set-by-set logging as you train, with rest timers, last-session numbers on screen, PR history, and the demo video playing behind the controls |
| Nutrition | `/dashboard/nutrition` | Log what you ate | Photo logging that itemizes a whole plate; barcode scan; personal calorie and macro targets |
| Mind | `/dashboard/mind` | Do a short practice | Guided sessions, mood tracking, identity work |
| Progress and The Becoming | `/dashboard/progress` | See the trend | Weight and strength trends, plus a weekly recap that writes your week back to you |

All rows `[verified in repo: webapp/app/dashboard/{workout,nutrition,mind,progress}/]`.

**Details worth quoting in copy** `[verified in repo]`:
- Programs are multi-phase, with phases containing workouts containing exercises. Twelve-week
  programs exist. `[verified in repo: webapp/models/Program.ts]`
- Exercise grouping supports supersets, circuits, trisets, giant sets, EMOM, AMRAP.
  `[verified in repo: webapp/models/Program.ts]`
- The generator produces either a single session or a full program, filtered by focus, level, and
  the equipment actually available. `[verified in repo: webapp/public/screenshots/v2/generate-light.webp + manifest entry]`
- **39 of the 132 canonical exercises ship a demo clip — the big lifts are covered.** Never claim
  every exercise has one. 42 files: 39 `.mov`, of which only `back-squat`, `bench-press`, and
  `cable-row` also have an `.mp4`. `[verified in repo: webapp/public/exercises/]` **Correction:**
  earlier docs say "42 clips in .mov/.mp4 pairs." That is a file count, not a clip count, and only
  three movements have pairs. The `.mov` files are served as `video/mp4` and play fine; the black
  panel in Chromium is `webapp/components/FramedVideo.tsx:39` emitting `type="video/quicktime"`.
  The fix is the type attribute, not "use the `.mp4` pair," which does not exist for 36 of them.
- You can import a program by pasting its text. `[verified in repo: commit 8c1d496; the photo
  upload path was removed in ddff09c, so do not market photo import]`
- Exercise variation picker in Add Exercise and the program builders. `[verified in repo: commit cc40d1c]`
- A workout that crosses midnight survives, and you choose which day to log it to.
  `[verified in repo: commit 226edc6]`

**Not available today.** Do not imply any of these: a native app, a wearable integration, heart
rate, a marketplace, or a paid tier. `[verified in repo: absent]` Coaching over chat with a human
also stays on this list: `webapp/app/dashboard/chat/` ships wrapped in `FeatureGuard`, which
renders an admin-gated "Coming Soon."
`[verified in repo: webapp/app/dashboard/chat/page.tsx:469; webapp/components/FeatureGuard.tsx]`

**What the camera actually does.** Two things: the Mind mirror scene
(`webapp/components/mind/session/scenes/MirrorScene.tsx`) and the nutrition barcode scanner
(`webapp/components/nutrition/BarcodeScanner.tsx`). The whole-plate photo path
(`webapp/app/api/ai/nutrition/plate/`) is the camera capability worth marketing. LIVE mode is a
logging view, not a vision feature: its client
(`webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`) gives Track|Live
tabs, per-set entry, rest timers, "Last: X lbs × Y reps" history, and a PR badge. There is no pose
or ML dependency anywhere in the repo, and the phone recording a set is the lifter's own choice,
not a product behaviour. `[verified in repo]`

**Small and early, not absent.** Community, groups, and events surfaces exist in-app
(`webapp/app/api/{groups,events}`, `webapp/app/dashboard/{community,groups,events}`), and a sleep
endpoint ships at `webapp/app/api/sleep`. `[verified in repo]` Do not list any of them as missing.
Do not build a campaign on them either: they are small and early, and how much real activity sits
behind them is unverified. `[assumption, unvalidated — listed in Open questions]`

**Drift rule.** When the app exceeds this hub list, update this doc first, then the claim. A
feature that has shipped but is not written down here is not marketable yet.

**Unresolved surface (do not market until verified with Jon).** The remaining routes and models
beyond the five marketed hubs: `dashboard/{insights,streaks,timeline,meals,meal-plan,recipes,
foods,history,calendar}` and models including `Conversation`, `Message`, `Meditation`, `Journal`.
Whether these are live, stub, or admin-only is not established.
`[assumption, unvalidated — listed in Open questions]`

## 3. ICP

Behavioural, not demographic. Someone is a fit when most of these are true:

- Already trains or has repeatedly tried to, and owns the goal. `[assumption, unvalidated]`
- Has two or more fitness or nutrition apps installed and uses none of them consistently.
  `[assumption, unvalidated]`
- Wants the plan decided for them. Choosing the workout is the part that stalls them.
  `[assumption, unvalidated]`
- Will not pay for or schedule around an in-person trainer. `[assumption, unvalidated]`
- Owns a phone they train with. Nothing about Become works well on desktop first.
  `[verified in repo: 390x844 capture viewport, mobile-first layout, BottomNav]`

**Anti-persona.** Do not spend a dollar or a Reel on: competitive lifters who want a
spreadsheet and a bar-speed sensor; people looking for a medical or clinical program; people who
want a human coach in a DM every day; anyone shopping on price, because there is no price to shop.

## 4. Personas

**The App Juggler.** Trains a few times a week. Has a workout logger, a calorie app, and a notes
file with the actual program in it. Nothing talks to anything. Looks for a tool the week the
notes file gets out of sync. `[assumption, unvalidated]`

**The Restarter.** Starts on a Monday, is consistent for nine days, misses two, and quits.
Believes the problem is willpower. Looks for a tool the week after a restart fails again.
`[assumption, unvalidated]`

**The Coached-Out.** Had a trainer, liked the structure, cannot justify the cost or the schedule.
Wants somebody else's plan without the standing appointment. `[assumption, unvalidated]`

For each, record: the trigger moment, the first thing they would search, and the one screen that
would sell them. Not yet recorded.

## 5. Pains

In their words wherever possible. Paraphrase is a downgrade.

- "I never know what to do when I get to the gym."
- "I log my workout in one app and my food in another and I still have no idea if it's working."
- "I did great for two weeks then fell off."
- "I don't want to pay a trainer two hundred a month."
- "I hate logging food."

All currently `[assumption, unvalidated]` until pulled from real reviews, DMs, or interviews. See
`competitor-analysis` review mining for a way to source real ones.

## 6. Competitive alternatives

What they would do if Become did not exist. Includes doing nothing.

| Alternative | Why they pick it | Where it fails them |
|---|---|---|
| Nothing, plus the Notes app | Free, zero setup | No structure, no memory, no feedback |
| Free YouTube programs | Free, credible faces | No progression, nothing logged |
| A stitched stack (a logger + a calorie app + a meditation app) | Each is best-in-class | Four logins, no shared picture, four habits to keep |
| An in-person trainer | Accountability, real coaching | Cost, scheduling, geography |
| A general AI chatbot | Instant plan, conversational | Nothing persists, no video, nothing logged, no progression |

All `[assumption, unvalidated]` as to which alternatives real signups actually come from.

## 7. Differentiation

Attribute (a capability), then value (what it produces), then proof (where to see it).

| Attribute | Value | Proof |
|---|---|---|
| Coach-built multi-phase programs plus an AI generator | Structure when you want it, a session in seconds when you do not | `webapp/public/screenshots/v2/workout-hub-light.webp`, `generate-light.webp` |
| LIVE workout mode logs the set while you train | Last-session numbers and PRs on screen mid-set; the demo video plays behind the logging controls | `webapp/public/screenshots/v2/workout-log-dark.webp` |
| Photo logging itemizes a whole plate | Logging a meal is one photo, not six searches | `webapp/public/screenshots/v2/nutrition-meal-light.webp` |
| Five hubs on one dashboard | One app instead of a stack of them | `webapp/public/screenshots/v2/dashboard-light.webp` |
| Weekly recap writes your week back to you | Evidence about yourself instead of a wall of numbers | `webapp/public/screenshots/v2/progress-light.webp` |

All attributes `[verified in repo]`; values are framing, proofs verified to resolve 2026-08-25.

## 8. Objections and anti-persona

| Objection | Honest answer today |
|---|---|
| "Is it actually free?" | Free today. Do not imply a future price either way. |
| "No password? Is that safe?" | A one-time link to your email, expires in fifteen minutes. `[verified in repo: webapp/models/MagicLink.ts 15-min TTL]` |
| "Do I need equipment?" | The generator filters to the equipment in front of you. |
| "Does it track my sets automatically?" | No. You log the set; LIVE mode keeps your last numbers and PRs on screen so logging is one tap, not a memory test. |
| "It's not in the App Store." | Installs from the browser in one tap. Web push works. |
| "I already have MyFitnessPal." | Not a rip-and-replace pitch. The pitch is the stack, not the app. |

## 9. Customer language

Verbatim only. Keep the grammar. Sources: app store reviews of competitors, subreddit threads,
Jon's DMs, support messages. Every entry gets a source and a date.

```
(empty — filling this is the highest-value research task on the list)
```

## 10. Brand and voice

Full detail in `marketing/.claude/skills/become-context/references/voice-guide.md`. Summary:

- Brand words: simple, sleek, innovative, empowering.
- Primary green `#16a34a` / `#22c55e` for training, product, primary CTA. Violet for AI and Mind.
  Gold for streaks and The Becoming. Type is Geist. Light and dark are both first-class; never
  ship single-theme creative.
- Voice: confident, concrete, zero fluff, empowering not preachy. "Evidence, not vibes."
  Second person, present tense, active voice, lead with the concrete noun.
- Banned (each has a replacement in the voice guide): journey, unlock your potential,
  game-changer, revolutionary, seamless, effortless, 10x, crush it, beast mode, no excuses,
  just, simply, transform, "we're excited to announce," "in a world where," "not just X but Y."
- Near-zero em dashes in deliverable copy. No emoji in product voice; at most one in a social
  caption, and only when it carries meaning.
- Product speaks in second person. Jon speaks in first person. Never mixed in one block.

**Known colour discrepancy `[verified in repo]`:** the Remotion pillar map
(`marketing/src/campaignCollection.tsx`) uses `training #00D26A`, `mindset #9818FF`,
`nutrition #FF981A`, `progress #3887FF`, `coaching #FF496C`, which does not match the brand
tokens above. Until reconciled, brand tokens win for anything shipped externally; change the map
in one place, never inline. Listed in Open questions.

## 11. Proof points we can honestly make

The landing page (`webapp/components/landing/BecomeLanding.tsx`) already asserts these in public,
so each is a claim we must be able to defend. Cross-checked 2026-08-25.

**Can say today** (all `[verified in repo]` unless noted):
- Programs are built by a real coach, Jon Don, and are multi-phase with progression.
- The big lifts have a demo clip. **39 of the 132 canonical exercises** ship one (42 files, but 42
  is a file count, not a clip count). Never claim every exercise has one. `webapp/public/exercises/`
- LIVE mode logs sets as you train, with rest timers, last-session numbers, and PR history on
  screen. `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
  (See §2 for what the camera does and does not do; LIVE mode is a logging view, not a vision
  feature.)
- A photo of a plate returns its items. `webapp/models/PlateScan.ts`
- Signup is one email field — or Google, or a passkey — with no password and no card either way.
- It installs to the home screen and can send push notifications.
- All practices live on one dashboard.
- Landing claims already live include: "A plan, not just a tracker", "Open the app. Know your
  day.", "Point your camera at lunch. Done.", "Short daily sessions — most run under three
  minutes", "Programs and habits from coach Jon Don — the same system he runs with his own
  clients". Note: "the same system he runs with his own clients" is `[assumption, unvalidated]`
  from the repo's point of view; it needs `[verified with Jon]` on next contact. The "under three
  minutes" session-length claim likewise. Both are already public, so verifying them is urgent,
  not optional.

**Cannot say, ever, until real and reproducible:** any user count, any retention or results
figure, any testimonial, any star rating, any "trusted by," any pounds-lost or weeks-to-result
claim, any price or discount, any comparison claim we have not verified this month.

## 12. Goals and constraints

**Current goal: not set.** No signup or activation target with a number and a date exists.
Flagged — `marketing-plan` derives everything from this line and currently cannot.

**Hard constraints** (full reasoning in
`marketing/.claude/skills/become-context/references/constraints.md`):
no fabricated testimonials, counts, results, or pricing ("free today" is the only permitted price
statement); captures only from the dummy-account pipeline
(`webapp/public/screenshots/v2/manifest.json`) and never showing a bug, an empty state, or
"(beta)"; no personal camera-roll photos of the coach; The Becoming is at most one section or
mention, never the headline theme; health claims stay responsible (no medical claims, timelines,
pound counts, body-shaming, or guaranteed-outcome before/after framing); source tiers on every
statistic and no tier ever restated as a Become results claim; assets reused, not regenerated;
no secrets ever written down; every shell command bounded.

## Asset inventory

Verified in this worktree 2026-08-25 at repo `6b98602`.

| Asset | Path | Gotcha |
|---|---|---|
| Product captures v2 | `webapp/public/screenshots/v2/` | 15 `.webp`, 8 screens, light+dark pairs except `workout-log` (dark only). No LIVE-mode capture exists. |
| Capture manifest | `webapp/public/screenshots/v2/manifest.json` | The contract. Read `knownIssues` before reusing any shot; three rendering defects are open. |
| Legacy captures | `webapp/public/screenshots/ss-*.png` | 7 files, pre-v2. Still what `assets:sync` feeds the render project. |
| Capture harness | `webapp/tests/e2e/` + `webapp/playwright.config.ts` | `test-auth.ts` mints short-lived JWTs from `JWT_SECRET`. Never write the secret down. |
| Remotion project | `marketing/src/` | `campaigns.json` 46 rows; `reviewedCampaigns.ts` 19 storyboards (verified count). |
| Render scripts | `marketing/scripts/` | Full renders are long; wrap in `timeout`. |
| Render inputs | `marketing/public/` | 8 PNGs. `assets:sync` refreshes them from **legacy** shots, not v2. |
| Render outputs | `marketing/out/` | **gitignored, local only.** Present in this worktree but never assume committed. |
| Inspo library | `marketing/inspo/` | **gitignored, local only.** May be absent; not a bug. |
| Inspo analysis | `marketing/inspo-analysis.md` | Committed digest (STNDRD 25 story ads, Ladder 5-slide carousel). Read this instead of the images. |
| Landing page | `webapp/components/landing/` | Production code. Section ids: `why`, `dashboard`, `training`, `nutrition`, `mind`, `progress`, `coach`, `how`. Ships via branch → `beta` → `main`. |
| Exercise demos | `webapp/public/exercises/` | 39 of 132 exercises have a clip; 42 files. Only 3 movements have `.mp4`. The Chromium black panel is `FramedVideo.tsx`'s `type="video/quicktime"`, not the file format. |
| Image tooling | `sharp` in `webapp/package.json` | Add no image dependency. |

**Indexable surface today:** one page (`webapp/app/page.tsx`) plus `login`, `register`, `verify`,
`information`, `share`, `onboarding`. No `robots.txt`, no `llms.txt`, no `sitemap.ts`, no JSON-LD
(re-verified 2026-08-25). SEO and GEO are greenfield.

## Open questions

Every `[assumption, unvalidated]` above, for Jon to confirm or kill:

1. Audience/ICP behavioural claims (section 3) and all three personas (section 4).
2. All five pain quotes (section 5) — replace with verbatim sourced language.
3. Which competitive alternatives real signups actually come from (section 6).
4. **"The same system he runs with his own clients"** — already public on the landing page,
   needs Jon's confirmation.
5. **"Most run under three minutes"** (Mind sessions) — already public, needs a repo or Jon check.
6. The unresolved dashboard surface: insights, streaks, timeline, meals/meal-plan/recipes/foods,
   history, calendar. Live, stub, or admin-only? Until answered, marketing sells only the five
   hubs.
7. How much real activity sits behind the community, groups, and events surfaces. They exist in
   the repo, but "exists" and "worth pointing a campaign at" are different questions.
8. The Remotion pillar palette vs brand tokens discrepancy — reconcile before external ship.
9. Current goal (section 12) is not set. One number, one date.

## Document version

2.1.0 — verified 2026-08-25 against the repo at `6b98602`. Production site not re-crawled this
pass; landing claims read from source. 2.0.0 removed a differentiation row, which invalidated
existing copy that used it; 2.1.0 corrected the feature-availability list and the demo-clip
coverage claim.

## Changelog

- 2026-08-25 (2.1.0) — Feature-availability corrections. Sleep (`api/sleep`) and the community,
  groups, and events surfaces were listed as not available; they exist in the repo and are now
  described as small and early. Human coach chat stays on the not-available list: it ships behind
  an admin-gated `FeatureGuard` "Coming Soon." Demo-clip coverage corrected from "every movement"
  to 39 of 132 exercises, and the Chromium black panel attributed to `FramedVideo.tsx`'s MIME type
  rather than the file format. Added the drift rule: when the app exceeds the hub list in §2,
  update this doc first, then the claim.
- 2026-08-25 (2.0.0) — **Removed the FALSE claim that LIVE mode counted reps through the camera.**
  No camera, pose, or ML code exists in the workout tree; LIVE mode is a live set-logging view
  with rest timers, last-session numbers, and PRs. The claim had spread to roughly 133 sites
  across the skill library and the agent prompt; all of them were corrected in the same pass.
  Camera use in the app is the Mind mirror scene, the barcode scanner, and whole-plate photo
  logging. The landing page is unaffected (it never made the claim).
- 2026-08-25 (1.0.0) — Initial build from the template. Corrections vs prior docs: exercise demo count is
  39 movements / 42 files (docs said "42 clips in .mov/.mp4 pairs"; only 3 movements have pairs,
  so "use the .mp4" is impossible for 36 of them — downstream `remotion-assets` and
  `screenshot-capture` guidance affected). Added text-paste program import, variation picker, and
  midnight-workout survival as marketable details. Flagged repo surface (community/chat/etc.)
  that conflicts with the "no social feed / no human chat" not-available list. Flagged two
  already-public landing claims needing verification with Jon.
