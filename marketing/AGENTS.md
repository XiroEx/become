# Become Marketing — Read This First

This is the knowledge base for `marketing/`. Any agent or human doing marketing work on Become
should read this before touching anything else in the folder.

**Become** (`become.redbtn.io`) is a mobile-first PWA fitness coaching app built around coach
**Jon Don**. This folder holds the marketing skill library, the Remotion campaign asset project, and
the competitor creative analysis. The landing page itself lives in `webapp/components/landing/`.

---

## 1. What is in this folder

```
marketing/
├── AGENTS.md              # this file
├── README.md              # Remotion project docs, agent, skills, inspo
├── .claude/skills/        # 28 marketing skills + _catalog.json + _conventions.md
├── .agents/               # become-context.md, the anchor doc (generated)
├── src/                   # Remotion compositions + campaigns.json
├── scripts/               # render drivers
├── public/                # 8 source images the renders composite
├── out/                   # render output. GITIGNORED
├── inspo/                 # competitor captures. GITIGNORED, local only
└── inspo-analysis.md      # committed digest of the inspo library
```

The agent definition lives at `.claude/agents/become-marketing.md` in the repo root.

---

## 2. The skill library

28 skills in `marketing/.claude/skills/<name>/SKILL.md`. The authoritative index is
`marketing/.claude/skills/_catalog.json`; the authoring rules are
`marketing/.claude/skills/_conventions.md`.

**How to invoke:** each skill's frontmatter `description` is the trigger surface. Match the task to
a description, then read that skill's `SKILL.md` and follow its Process, Frameworks, output buckets,
and Quality bar. Reference files under `<skill>/references/` load on demand; the SKILL.md points at
them. Do not improvise a process a skill already defines.

**Always load `become-context` first.** It produces and maintains `marketing/.agents/become-context.md`,
which holds product truth, brand, voice, ICP, positioning, constraints, and the asset inventory.
Every other skill reads it before asking a question.

| Batch | Skills |
|---|---|
| Foundation and strategy | `become-context`, `positioning`, `marketing-plan`, `offer-design`, `competitor-analysis` |
| Copy and conversion | `copywriting`, `landing-cro`, `copy-editing`, `signup-activation`, `web-app-listing` |
| Social and content | `social-strategy`, `reels-scripts`, `content-calendar`, `ugc-creator-briefs`, `coach-brand-voice` |
| Lifecycle and launch | `email-lifecycle`, `push-notifications`, `launch-campaign`, `referral-program` |
| Measurement and growth | `seo-geo`, `analytics-tracking`, `ab-testing`, `paid-social`, `marketing-psychology` |
| Production pipelines | `screenshot-capture`, `remotion-assets`, `image-production`, `inspo-library` |

Boundaries worth knowing without opening a file:

- New words from a blank page is `copywriting`. Tightening existing words is `copy-editing`.
  Diagnosing a page that does not convert is `landing-cro`.
- Strategic competitor teardown is `competitor-analysis`. Their visual ad patterns are `inspo-library`.
- Producing a capture is `screenshot-capture`. Resizing, cropping, or exporting one at a platform
  size is `image-production`. Designing or animating on top of one, including the designed OG
  still, is `remotion-assets`.
- The fields of a directory or Product Hunt listing are `web-app-listing`. The dated moment around
  that submission is `launch-campaign`.

---

## 3. Asset inventory and pipelines

### Product captures

| Thing | Path |
|---|---|
| Captures v2 | `webapp/public/screenshots/v2/` — 15 webp at 780x1688 |
| Manifest | `webapp/public/screenshots/v2/manifest.json` |
| Legacy | `webapp/public/screenshots/ss-*.png` |

Eight screens: dashboard, workout-hub, workout-log, generate, nutrition-day, nutrition-meal, mind,
progress. Light and dark pairs for all except `workout-log`, which is dark only.

**Pipeline:** Playwright at 390x844 with `deviceScaleFactor: 2` against production, authenticated as
a dummy account, state seeded through the app's own HTTP APIs, tutorial overlays dismissed, one run
per theme, then sharp to 780 wide webp at quality 84, then a manifest entry. Skill:
`screenshot-capture`.

**The manifest is the contract.** It records the viewport, the accounts and their state, per-shot
notes, every seeding write, and `knownIssues` covering any DOM patched at capture time. Read it
before reusing a shot and append to it after every run.

### Remotion campaign assets

| Thing | Path |
|---|---|
| Project | `marketing/src/` |
| Copy surface | `marketing/src/campaigns.json` — 46 rows |
| Video storyboards | `marketing/src/reviewedCampaigns.ts` — 19 |
| Scripts | `marketing/scripts/*.mjs` |
| Source images | `marketing/public/` — 8 PNGs |
| Output | `marketing/out/` — **gitignored** |

Formats: `square` 1080x1080, `story` 1080x1920, `landscape` 1200x628, plus a 1200x630 OG still, a
12 second reel, and two 19-video collections. Commands are in `marketing/package.json`; the full
table is in `marketing/README.md` and in `remotion-assets/references/render-recipes.md`.

**Gotcha:** `npm run assets:sync` copies from the **legacy** `webapp/public/screenshots/ss-*.png`,
not from `screenshots/v2/`. A sync therefore refreshes render inputs from the older shot set.

### Image finishing

`sharp` is already a `webapp/package.json` dependency. **No new image dependency may be added.**
Resize, crop, webp and jpeg export, device frames, shadows, cut-out UI chips, icons, and light and
dark twins are all `image-production`.

### Inspo library

`marketing/inspo/` is **gitignored and local only**, so it may be absent in a fresh worktree. The
committed artifact is `marketing/inspo-analysis.md`: STNDRD's 25 Instagram Story ads and Ladder's
5-slide meal-logging carousel, with a per-image index, six synthesized pattern sections, and
"Steal this" and "Avoid this" lists. **Read the analysis before opening an image.** Skill:
`inspo-library`.

### The landing page

`webapp/components/landing/` — `BecomeLanding.tsx`, `HeroLine.tsx`, `Marquee.tsx`, `Phone.tsx`,
`Spine.tsx`, `hooks.ts`, `landing.module.css`. It is the conversion surface and it is production
code. Changes ship through `agent/<host>-<feature>` to `beta` to `main`; both branches autodeploy,
so **merging is the deploy**. Never commit directly to `main` or `beta`.

---

## 4. Product truth

Do not contradict this. Do not extend it. If a capability is not listed, it does not exist; say
"not available today" rather than inventing it.

| Hub | What it does |
|---|---|
| **Dashboard** | Day at a glance, streaks, mood, weight, water, customizable tiles |
| **Training** | Coach-built multi-phase programs, an equipment-aware AI session and program generator (focus, level, equipment, exercise count; no minutes input — never claim "time-aware"), demo clips on the big lifts, set logging with PR history, LIVE mode: one set on screen, last session's numbers, PR badge, rest timer |
| **Nutrition** | Photo logging that itemizes a whole plate, barcode scan, personal calorie and macro targets |
| **Mind** | Short guided sessions, mood tracking, identity work |
| **Progress & The Becoming** | Weight and strength trends, plus a weekly recap that writes your week back to you |

Two things sit outside the five hubs and are easy to get wrong in both directions. **Sleep logging
ships** (`webapp/app/api/sleep`), and so do **community, groups, and events surfaces**
(`webapp/app/api/groups`, `webapp/app/api/events`, and their dashboard routes) — small and early,
not absent. Do not write them off as unavailable. **Human coach chat is the one that genuinely is
not available:** the surface exists but is admin-gated behind a "Coming Soon" `FeatureGuard`, so
nothing may promise a reply from Jon inside the app.

**The camera is real, but it is not in the gym.** It itemizes a whole plate in Nutrition and it
scans a barcode. It does not watch a set. LIVE mode is manual entry, and that is the honest,
still-good story: the numbers you need are already on the screen.

Signup is an **email magic link**, with **Google sign-in and passkeys** alongside it. No credit
card. **Free today**, and no pricing exists. **Web push notifications exist.** There is no native
app; Become is a PWA, so there is no App Store listing, no rating, and no download count.

Only **39 of the 132 canonical exercises** ship a demo clip. The big lifts are covered. Never write
"a demo video for every exercise."

Audience: everyday people who feel scattered across fitness apps. Coach-led credibility matters.

**When the app outgrows this list, update this section and `marketing/.agents/become-context.md`
first, then write the claim.** The doc trailing the product is how a fabrication gets in: someone
sees a shipped surface, cannot find it here, and writes around the gap instead of closing it.

---

## 5. Brand system

**Brand words:** simple, sleek, innovative, empowering.

| Token | Value | Means |
|---|---|---|
| Primary green | `#16a34a` / `#22c55e` | Training, the product, the primary CTA |
| Violet | AI and Mind surfaces | Generator, mind sessions |
| Gold | Streaks and The Becoming | Consistency, recap |
| Type | Geist | Headline and body |
| Themes | Light **and** dark, both first-class | Never ship single-theme creative |

Note: the Remotion project's pillar colour map uses slightly different hex values (`training
#00D26A`, `mindset #9818FF`, `nutrition #FF981A`, `progress #3887FF`, `coaching #FF496C`).
Reconcile against `marketing/.agents/become-context.md` before anything ships externally, and change
the map in one place rather than overriding a colour inline.

**Voice: confident, concrete, zero fluff, empowering not preachy. "Evidence, not vibes."**

- Second person, present tense, active voice. Short sentences. Lead with the concrete noun.
- Verbs the product actually does: log, scan, plan, count, recap, generate, show.
- ❌ "Transform your wellness journey." ✅ "See what you lifted last Tuesday."
- **Banned:** journey, unlock your potential, game-changer, revolutionary, seamless, effortless,
  10x, crush it, no excuses, beast mode, hustle and shame framing, just, simply.
- Near-zero em dashes in deliverable copy. No emoji in product-voice copy; at most one in a social
  caption, and only when it carries meaning.
- Never preachy, never shaming. The user is not lazy; their tools were scattered.
- Jon speaks in first person as a coach (`coach-brand-voice`). The product speaks in second person.
  Never mix the two in one block.

---

## 6. Hard constraints

Non-negotiable. They survive into the output of every skill, and no task prompt overrides them.

- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.

Two library rules that follow:

- **Source tiers for any statistic.** Tier A is platform-published or large-sample. Tier B is a
  named case study with corroboration. Tier C is a vendor or SEO blog with an unverifiable sample.
  Label the tier wherever a number is cited. **No tier may ever be restated as a Become results
  claim in public copy.**
- **Assets are reused, not regenerated.** If a capture, render, or reference exists, point at it.
  Regenerating burns credits, risks a worse output, and drifts the brand.

Operational rules:

- **Never write a secret** into a file, a log, a commit, or a report. Refer to the mechanism
  (`JWT_SECRET` from `webapp/.env.local`), never the value. Dummy account **names** may be written
  down; their tokens may not.
- **Bound every shell command** with `timeout`. Never write an unbounded `until` wait.
- **Competitor creative is a reference, never a source asset.** Never trace it, reuse it, or publish it.

---

## 7. Where marketing stands today

**Stage: early. One conversion surface, no distribution engine yet.**

| Area | State |
|---|---|
| Landing page | v2 shipped 2026-08-24: alive and thematic, real dummy-account captures, journey-line motif, light and dark. The one conversion surface |
| Product captures | 15 v2 shots across 8 screens, manifested. LIVE mode has a dark shot only (`workout-log-dark.webp`) and no light twin |
| Campaign assets | 46 stills and 19 video storyboards defined in the Remotion project, rendered as two 19-video collections. `out/` is gitignored, so renders are local |
| Inspo | Two brands analysed. Digest committed |
| Skills | 28 skills, this library |
| SEO and GEO | Greenfield in the repo — no `robots.ts`, no `sitemap.ts`, no `llms.txt`, no JSON-LD — and blocked upstream: the domain is a subdomain of an unrelated tech brand, and production serves a Cloudflare-managed `robots.txt` that disallows GPTBot, ClaudeBot, CCBot, and Google-Extended |
| Analytics | No defined event scheme or funnel instrumentation |
| Social | No standing cadence |
| Email and push | Transactional magic link exists. No lifecycle program |
| Directories | No listings |
| Paid | None, and no budget assumed |

### Priorities, in order

1. **Anchor the truth.** Generate `marketing/.agents/become-context.md` via `become-context`, and
   settle the brand-versus-project colour discrepancy while doing it.
2. **Lock positioning.** `positioning`. Everything downstream reads generic until the category and
   the honest differentiators are decided. Do not frame Become as a "workout tracker".
3. **Measure something.** `analytics-tracking`. Right now no bet can be evaluated, which makes every
   later decision an opinion.
4. **Fix the funnel we already have.** `landing-cro` then `signup-activation`. Traffic sent at an
   unconverting page is wasted, and activation decides whether a signup becomes a user.
5. **Shoot the mechanism we lead with.** `screenshot-capture`. Whole-plate photo logging is the most
   differentiated thing the product does and has no capture at all — the `nutrition-meal-*` shots
   were seeded by typing, so they cannot stand in for it. LIVE mode has a dark shot and no light
   twin.
6. **Build the member-proof pipeline.** Jon DMs five to ten warm clients for written consent and
   verbatim quotes (`ugc-creator-briefs`). There is no permissioned member content today, which
   closes off proof-led creative entirely, and it is slow to start, so start it early.
7. **Pick one channel and commit.** `marketing-plan`. Jon's audience is the highest-leverage owned
   asset, and the team is one person plus agents, so the plan has to be executable at that size.
8. **Settle the domain, then claim the greenfield.** `seo-geo`. The technical basics are cheap,
   permanent, and portable, so ship them now. Ranked content is not portable: `become.redbtn.io`
   is a subdomain of an unrelated tech brand, and every T1 and T2 page written before a first-party
   domain is decided builds equity we would have to move. Settle the domain first. The
   Cloudflare-managed `robots.txt` blocking GPTBot, ClaudeBot, CCBot, and Google-Extended is a
   zone-level change George owns, and no amount of repo work routes around it.

### Known open items

- The Remotion pillar palette does not match the brand tokens.
- `assets:sync` pulls legacy `ss-*.png`, not v2 captures.
- Weight and mood cannot be backdated through any app API, so trend charts on a seeded account are
  single-point. Marketing must not fake a trend.
- Three live rendering defects are recorded in the capture manifest `knownIssues`: the Weekly
  Volume bars are invisible in dark mode (`ProgressClient.tsx:560`, patched in the DOM at capture
  time), exercise demo panels go black in Chromium because `FramedVideo.tsx:39` labels them
  `video/quicktime` when the server is already serving them as `video/mp4` (patched at capture
  time; the fix is the type attribute, not re-encoding),
  and the Generate sheet's range-slider track stays light in dark mode (cosmetic, captured as-is).
  All three are still open.
- No permissioned member content, so social-proof-as-screenshot creative is closed to us today.

---

## 8. Working agreements

- One task, one branch: `agent/<host>-<feature>`. PR to `beta`, then `main`. Delete after merge.
  Never a shared long-lived agent branch.
- Report evidence first: paths, dimensions, byte sizes, commands run, what was verified.
- State the gaps. An unverified claim or a reused-instead-of-reshot capture is information the next
  person needs.
- Flag a constraint conflict rather than resolving it quietly. Offer the honest version instead.
- Update the Become board after a task that produced or shipped something.
