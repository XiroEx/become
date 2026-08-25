# Asset Sourcing

Every calendar row resolves to an asset. This is the order to try, cheapest first, and the checks
each source needs before a row is marked sourced.

---

## Preference order

| # | Source | Where | Check before using |
|---|---|---|---|
| 1 | Existing render | `marketing/out/` | Directory is **gitignored**, so verify the file is present in the working tree. Confirm the source screenshot it was built from is still current. |
| 2 | Existing capture | `webapp/public/screenshots/v2/` | Read `manifest.json` for that file: page, account, theme, state notes, known issues. |
| 3 | Existing campaign row | `marketing/src/campaigns.json` (46 rows) | Confirm the copy still passes the constraint list, then render via `remotion-assets`. |
| 4 | New render | `remotion-assets` | Needs a campaign row and a source image in `marketing/public/`. |
| 5 | New capture | `screenshot-capture` | Needs a dummy account, a seeded state, and a manifest entry. Schedule at least 3 days before the post date. |
| 6 | New footage | `reels-scripts` or `ugc-creator-briefs` | Needs a script and a film session on the calendar. |

Regenerating an asset that already exists burns credits, risks a worse output, and drifts the
brand. Reuse is the default.

---

## What exists today

**Product captures.** `webapp/public/screenshots/v2/` holds 15 `.webp` files across 8 screens:
dashboard, workout-hub, workout-log, generate, nutrition-day, nutrition-meal, mind, progress.
Light and dark pairs for all except `workout-log`, which is dark only. Viewport 390x844 at 2x.

**Capture manifest.** `webapp/public/screenshots/v2/manifest.json` records `capturedAt`, `origin`,
`viewport`, per-shot `page` / `account` / `theme` / `notes`, the dummy `accounts` used, the
`seeding` record (every write went through the app's own HTTP APIs), and `knownIssues`.

Known issues that change what you can schedule:

- Weight and mood cannot be backdated through any app API, so trend charts on a fresh dummy
  account are single-point. Do not schedule a post promising a multi-week chart without confirming
  the capture.
- The progress Weekly Volume bar uses a hardcoded dark fill that is invisible on the dark card.
  The dark capture was DOM-patched at capture time and that is disclosed in the manifest.
- Exercise demo `.mov` files are served as `video/quicktime` and fail in Chromium. Use the `.mp4`.
- The Generate sheet range-slider track stays light in dark mode. Cosmetic, captured as-is.

**Legacy captures.** `webapp/public/screenshots/ss-*.png`. Pre-v2. Prefer v2.

**Remotion project.** `marketing/src/Root.tsx`, `marketing/src/compositions.tsx`,
`marketing/src/campaignCollection.tsx`, `marketing/src/videoCollection.tsx`, `marketing/src/reviewedVideo.tsx`,
`marketing/src/campaigns.json` (46 assets), `marketing/src/reviewedCampaigns.ts`. Render scripts in
`marketing/scripts/`, npm scripts in `marketing/package.json`.

**Render inputs.** `marketing/public/`: `dashboard.png`, `programs.png`, `progress.png`,
`nutrition.png`, `mindset.png`, `calendar.png`, `chat.png`, `logo.png`. Refreshed by
`npm run assets:sync` in `marketing/`.

**Render outputs.** `marketing/out/`, gitignored: `marketing/out/collection/square|story|landscape`,
`marketing/out/videos/`, `marketing/out/videos-reviewed/`.

**Exercise demos.** `webapp/public/exercises/`, 42 files, `.mov` and `.mp4` pairs.

**Creative reference.** `marketing/inspo-analysis.md`, the committed digest. `marketing/inspo/`
is gitignored and may be absent in a fresh worktree; the analysis is not.

---

## Sourcing a row

For each calendar row, fill the Asset cell with one of:

- A repo path that resolves today: `webapp/public/screenshots/v2/nutrition-meal-dark.webp`.
- A producing skill plus a due date and an owner: `screenshot-capture, due 2026-09-05, George`.
- A batch reference: `film session 2026-09-02, shot 4`.

Never `TBD`, never "a screenshot of the nutrition screen." A row whose asset cannot be named is
an idea, and ideas live in the backlog, not on a date.

---

## Freshness rules

- **Recapture after a UI change.** If the screen shipped a visual change since `capturedAt`, the
  capture is stale. Do not ship a marketing asset that no longer matches the product.
- **Never edit a screenshot to hide a bug.** Fix the bug or recapture. Any DOM patching at capture
  time must be disclosed in the manifest and the underlying bug filed.
- **Never ship a capture showing an empty state, a zero row, a dev banner, or "(beta)".** The
  inspo analysis documents exactly how much a leaked empty state costs a competitor's ad.
- **Light and dark ship together** unless the row states which theme it is and why.
- **Never capture a real user account.** Dummy accounts only, and both channels share one
  production database, so treat every seeded write as production.

---

## Reuse-first checklist

Before adding any production task to the batch plan:

- [ ] Searched `marketing/out/` for an existing render.
- [ ] Searched `webapp/public/screenshots/v2/` and read the relevant `manifest.json` entries.
- [ ] Checked `marketing/src/campaigns.json` for an existing campaign row that covers the message.
- [ ] Checked `webapp/public/exercises/` for a demo clip that removes the need to film.
- [ ] Confirmed the new asset is needed by more than one row, or is worth a session on its own.
