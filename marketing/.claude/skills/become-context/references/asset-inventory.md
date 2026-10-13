# Asset Inventory

Verified 2026-08-25. Copy this table into `marketing/.agents/become-context.md` and re-verify
every path when you refresh the doc. The gotcha column is the valuable one.

## Product captures

| Asset | Path | Notes |
|---|---|---|
| Product captures v2 | `webapp/public/screenshots/v2/` | 15 `.webp`. Eight screens: dashboard, workout-hub, workout-log, generate, nutrition-day, nutrition-meal, mind, progress. Light and dark pairs except `workout-log`, which is dark-only because the live logger is dark in both app themes. |
| Capture manifest | `webapp/public/screenshots/v2/manifest.json` | The pipeline record: `capturedAt`, origin `https://become.redbtn.io`, viewport 390x844 at deviceScaleFactor 2, dummy accounts, per-shot state notes, `seeding` (every write went through the app's own HTTP APIs), and `knownIssues`. **Read before reusing any shot.** |
| Legacy captures | `webapp/public/screenshots/ss-*.png` | Pre-v2. Prefer v2. |
| Capture harness | `webapp/tests/e2e/` plus `playwright.config.ts` | `test-auth.ts` mints short-lived JWTs from `JWT_SECRET`. `app-shots.spec.ts` and `nutri-shots.spec.ts` are the shot specs. Mobile projects use the iPhone 14 profile. |

**Known capture traps recorded in the manifest:** weight and mood cannot be backdated through any
app API, so trend charts are single-point; the progress Weekly Volume bar uses a hardcoded dark
fill that is invisible on the dark card; `.mov` exercise demos are served correctly as `video/mp4`
but `FramedVideo.tsx` emits `type="video/quicktime"`, which Chromium refuses, so the panel goes
black (the fix is the type attribute, not swapping to an `.mp4` — only three movements have one);
auto-rotating carousels must be clicked back to match their light/dark twin. Any DOM patching done
at capture time is disclosed in `knownIssues`.

## Motion and design

| Asset | Path | Notes |
|---|---|---|
| Remotion project | `marketing/` | `src/Root.tsx` registers compositions. `src/compositions.tsx` holds the hero pieces. `src/campaignCollection.tsx` renders the collection from `src/campaigns.json` (46 assets). `src/videoCollection.tsx`, `src/reviewedVideo.tsx`, `src/reviewedCampaigns.ts` hold the video systems. |
| Render scripts | `marketing/scripts/` | `sync-assets.mjs`, `render-collection.mjs`, `render-videos.mjs`, `render-reviewed.mjs`, `render-review-pass.mjs`. npm scripts in `marketing/package.json`. Full renders are long; wrap in `timeout`. |
| Render inputs | `marketing/public/` | `dashboard.png`, `programs.png`, `progress.png`, `nutrition.png`, `mindset.png`, `calendar.png`, `chat.png`, `logo.png`. Refreshed by `npm run assets:sync`. |
| Render outputs | `marketing/out/` | **gitignored.** `out/collection/square/ story/ landscape/`, `out/videos/`, `out/videos-reviewed/`. Deliverables must be reported by path, not assumed committed. |
| Campaign rows | `marketing/src/campaigns.json` | Row schema is `id`, `slug`, `format`, `pillar` (system, training, progress, nutrition, mindset), `kicker`, `headline` (an array of lines), `body`, `cta`, `image`, `variant`. |

## Reference library

| Asset | Path | Notes |
|---|---|---|
| Inspo library | `marketing/inspo/` | **gitignored, local only.** Dated folders, e.g. `2026-08-24-marketing-inspo/`. May be absent in a fresh worktree. That is not a bug. |
| Inspo analysis | `marketing/inspo-analysis.md` | Committed digest. STNDRD (25 Instagram Story ads) plus Ladder (5-slide meal-logging carousel). **Read this instead of the images.** |

## Public surface

| Asset | Path | Notes |
|---|---|---|
| Landing page | `webapp/components/landing/` | `BecomeLanding.tsx`, `HeroLine.tsx`, `Marquee.tsx`, `Phone.tsx`, `Spine.tsx`, `hooks.ts`, `landing.module.css`. The conversion surface. Section ids: `why`, `dashboard`, `training`, `nutrition`, `mind`, `progress`, `coach`, `how`. |
| Exercise demos | `webapp/public/exercises/` | 39 of the 132 exercises ship a demo clip — the big lifts are covered. Never claim every exercise has one. 42 files: 39 `.mov` plus `.mp4` duplicates for `back-squat`, `bench-press`, `cable-row` only. |
| Image tooling | `sharp`, already in `webapp/package.json` | No new image dependency should be added. |

**Indexable surface today:** essentially one page (`webapp/app/page.tsx`) plus `login`,
`register`, `verify`, `information`, `share`, `onboarding`. There is **no** `robots.txt`, **no**
`llms.txt`, **no** `sitemap.ts`, and zero JSON-LD. Treat SEO and GEO work as greenfield.

## Preference order when a skill needs an asset

1. An existing render in `marketing/out/`.
2. An existing capture in `webapp/public/screenshots/v2/`, cleared against `manifest.json`.
3. A new render through `remotion-assets`.
4. A new capture through `screenshot-capture`.
5. New filmed footage through `reels-scripts` or `ugc-creator-briefs`.

Never regenerate at step 3 what already exists at step 1.
