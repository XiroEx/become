---
name: remotion-assets
description: Renders Become campaign assets from the existing Remotion project in marketing/ — 1080x1080 square posts, 1080x1920 story and reel covers, 1200x628 landscape, the open-graph still, the reel, and the reviewed video collection — by editing src/campaigns.json and the composition components, running the npm render scripts, and refreshing source images with assets:sync. Use when the user says "render the campaign assets," "make a story graphic," "we need an OG image," "add a new campaign to the collection," "regenerate the videos," "change the copy on asset 12," "make a video ad," or "design a social post." Reuse existing compositions before writing new ones; outputs land in the gitignored marketing/out/. For the product captures the assets sit on see screenshot-capture; for one-off resizing and export see image-production; for the visual patterns worth copying see inspo-library.
metadata:
  version: 1.0.0
  batch: production-pipelines
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Remotion Assets

You are the render operator for Become's campaign asset system. Your goal is to get a finished,
on-brand file out of the existing Remotion project in `marketing/` with the smallest possible
change to it.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce rendered brand assets from the real project: 1080x1080 squares, 1080x1920 stories and reel
covers, 1200x628 landscapes, the 1200x630 open graph still, the 12 second reel, and the two video
collections. Done means files exist under `marketing/out/`, dimensions verified, copy checked
against the voice rules, and the paths reported. `marketing/out/` is **gitignored**, so a rendered
file is a local deliverable, not something a merge ships.

## When to use

- A campaign needs a square, story, landscape, or OG asset and no existing render fits.
- Copy on an existing campaign row needs changing and the asset re-rendering.
- A new campaign concept should join the 46 asset collection.
- The source screenshots behind the renders are stale and everything needs regenerating.
- A short motion spot is wanted and filming is not an option.

**Not this skill:** producing the underlying product capture is `screenshot-capture`. A one-off
resize, crop, frame, or format conversion is `image-production` and does not need Remotion at all.
Deciding what the asset should say is `copywriting`. A filmed video is `reels-scripts`.

## Process

### Assessment gate

1. **Does the asset already exist?** `marketing/out/collection/{square,story,landscape}/` holds 46
   rendered JPEGs named by campaign slug. `marketing/out/videos/` and `out/videos-reviewed/` hold
   19 MP4s each. If `out/` is absent in a fresh clone, that is expected: it is gitignored and
   rebuilt by a render. Check `marketing/src/campaigns.json` for the row before assuming a gap.
2. **Which format?** `square` 1080x1080, `story` 1080x1920, `landscape` 1200x628. These are the
   only three in the dimensions map in `marketing/src/Root.tsx`. A different size is
   `image-production` work, not a new composition.
3. **Which source image?** The layouts composite one of the eight files in `marketing/public/`:
   `dashboard.png`, `programs.png`, `progress.png`, `nutrition.png`, `mindset.png`, `calendar.png`,
   `chat.png`, `logo.png`. An `image` value not in that list renders broken.
4. **Is the copy approved?** Headline, body, and CTA go through the voice rules before they go into
   JSON. Re-rendering because a banned word slipped through costs a full bundle.

### Render recipe

Run everything from `marketing/`. Node dependencies are not installed in a fresh worktree.

```bash
timeout 600 npm install                 # first time only
timeout 120 npm run typecheck           # tsc --noEmit. Cheap, run before every render
timeout 120 npm run assets:sync         # refresh marketing/public/ from webapp/public/
timeout 1800 npm run render:collection  # 46 stills -> out/collection/<format>/<slug>.jpg
```

Every npm script, what it emits, and how long it runs is in `references/render-recipes.md`. Read it
before the first render of a session. Full renders are long; always wrap in `timeout` and never
poll for an output file in an unbounded loop.

### Output buckets (pipeline-shaped, always these five, in this order)

- **Preflight checks** — what already exists in `out/`, which campaign rows are affected, whether
  `assets:sync` is needed, `typecheck` result.
- **Files edited** — `src/campaigns.json` rows, `src/reviewedCampaigns.ts` entries, component
  changes, with the old and new values for any copy.
- **Commands to run** — in order, each bounded by `timeout`.
- **Outputs and where they land** — absolute-from-repo-root paths, dimensions, byte sizes. State
  plainly that `out/` is gitignored.
- **Verification checklist** — dimensions, copy check, brand check, both themes where applicable.

## Frameworks

Four frameworks, in the order a render task hits them.

### 1. Reuse before you build

**Check for:**
- Is there a campaign row whose copy is close enough that editing it beats adding one?
- Is there a rendered file in `out/` already, from a previous session?
- Does an existing layout variant produce the composition being described?

**Common issues:**
- *A new composition for a copy change.* Six layouts already exist and are selected by
  `variant % 6`. Changing `variant` on a row restyles it completely, for free.
- *A new format.* Adding a fourth entry to the dimensions map means every layout has to be checked
  at that aspect ratio. Crop an existing render with `image-production` instead.
- *Regenerating everything to change one asset.* `render:collection` renders all 46. Use Remotion
  Studio or a single-still render for one asset.

**Strong patterns:**
- ❌ Write a seventh layout component because the fifth is "not quite right".
  ✅ Try `variant` 0 through 5 on the row and pick. That is what the variant field is for.
- Open `npm run studio` and iterate live before committing to a render. The studio is the fast loop.
- Reuse burns no credits and holds the brand steady. Regenerating drifts it.

### 2. The campaign row is the interface

**Check for:**
- `id` unique and matching `Campaign\d{2}` so `Root.tsx` registers a composition for it.
- `slug` unique; it becomes the output filename.
- `format` one of `square` / `story` / `landscape`, and `image` one of the eight files in
  `marketing/public/`.
- `headline` an array of lines, because the array **is** the line break.

**Common issues:**
- *Treating `headline` as a sentence.* `["START WHERE","YOU ARE."]` renders as two typeset lines.
  A single long string overflows the frame at story aspect.
- *A missing composition.* `render-collection.mjs` throws `Missing composition <id>` when a row's
  `id` is not registered. That means the id does not match what `Root.tsx` maps.
- *A stale or missing image.* `image` is resolved against `marketing/public/`. A typo renders an
  empty product window with no error.

**Strong patterns:**
- ❌ `"headline": "Consistency compounds into visible progress over time"`.
  ✅ `"headline": ["CONSISTENCY","COMPOUNDS."]` with the sentence moved to `body`.
- Write to the break. Two or three lines, each a readable unit, roughly balanced in width.
- `cta` is a verb phrase, not a sentence and not a URL: "Choose a program", "Track your food".

Full field table and the add-a-row procedure are in `references/campaign-schema.md`.

### 3. Copy that survives the constraints

**Check for:**
- Does any line imply a result, a timeline, a pound count, or a price?
- Does the CTA promise something the product does not do?
- Is The Becoming leading the asset rather than appearing at most once?

**Common issues:**
- *Numbers that read as claims.* The reviewed collection uses `metric` values like `+12.5 LB` and
  `+8.4%` as design elements. In a marketing frame a number reads as a promise. Keep metrics
  illustrative of a mechanism, never of an outcome we are offering.
- *Banned vocabulary.* "journey", "unlock your potential", "seamless", "effortless", "crush it",
  "no excuses" and the rest of the list. `render:collection` will happily bake them in.
- *Shame framing.* Competitor creative in `marketing/inspo-analysis.md` includes a shame tagline.
  It is recorded there as a thing to avoid, not to copy.

**Strong patterns:**
- ❌ "Drop 10 lbs in 6 weeks."
  ✅ "See what you lifted last Tuesday."
- ❌ "Transform your fitness journey."
  ✅ "One app instead of five."
- Sell the mechanism. The strongest existing rows do: "Log the work. See the trend. Know what
  changed."

### 4. The project's design system, reconciled with brand

**Check for:**
- Which pillar the asset belongs to, and therefore which accent the layout will use.
- Whether the accent the project ships matches the brand token the context doc defines.
- Whether more than one accent would land in a single frame.

**Common issues:**
- *Palette drift.* The project's pillar map in `src/campaignCollection.tsx` uses `training #00D26A`,
  `mindset #9818FF`, `nutrition #FF981A`, `progress #3887FF`, `coaching #FF496C`,
  `system #F7F7F5`. The brand tokens are green `#16a34a` / `#22c55e`, violet for AI and Mind, gold
  for streaks and The Becoming. **These do not fully agree.** Reconcile against
  `marketing/.agents/become-context.md` before shipping externally, and change the map in one place
  rather than overriding a colour inline.
- *Three accents in a frame.* The inspo analysis is explicit: one accent per frame, matched to the
  in-app primary.
- *Inventing a colour.* If a pillar needs a new accent, it belongs in the `colors` map, not in a
  component.

**Strong patterns:**
- One accent per frame, chosen by pillar.
- Monochrome shell, rounded product geometry, the upward arrow spine as the progress motif. That is
  the project's existing language; extend it rather than replacing it.
- ❌ Hardcode `#22c55e` inside a layout to "fix" a green.
  ✅ Update `colors.training` once and re-render.

Project structure, composition registry, and which file to edit for what are in
`references/project-map.md`.

## Become-specific rules

- **`marketing/out/` is gitignored.** Renders are local deliverables. Report paths; never assume a
  merge shipped a file. If an asset must live in the repo, it goes to `webapp/public/` deliberately.
- **`npm run assets:sync` copies from `webapp/public/screenshots/ss-*.png`, the legacy captures, not
  from `screenshots/v2/`.** So a sync refreshes the eight render inputs from older shots. If a
  render needs the current v2 look, either update the mapping in `marketing/scripts/sync-assets.mjs`
  or hand-place the file in `marketing/public/`. Do not silently ship a stale product screen.
- **`marketing/public/` filenames are load-bearing.** `dashboard.png`, `programs.png`, `progress.png`,
  `nutrition.png`, `mindset.png`, `calendar.png`, `chat.png`, `logo.png`. Renaming breaks every row.
- **Three formats only:** 1080x1080, 1080x1920, 1200x628, plus the 1200x630 OG still and the
  1080x1920 reel.
- **Brand type is Geist, and the render project does not use it.** `src/compositions.tsx:25` and
  `src/campaignCollection.tsx:35` both hardcode `'Arial, Helvetica, sans-serif'`. Every asset
  rendered from this project today is off-brand type, and no amount of render configuration
  changes that — it needs a font loader (`@remotion/google-fonts` or a `loadFont` call against a
  local Geist file) plus a change at those two constants. Treat it as a real brand gap, flag it in
  any deliverable, and do not describe a render as on-brand until it is fixed. Two weights per
  frame at most.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never render a price, a tier, a trial length, or a discount into an asset.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Assets are reused, not regenerated.** Check `out/` and `campaigns.json` first, every time.
- Bound every command with `timeout`. A full `npm run render` is long; never poll for its output in
  an unbounded loop.

## Quality bar

- [ ] `npm run typecheck` passes before any render.
- [ ] Every new or edited row has a unique `id` and `slug`, a valid `format`, and an `image` that
      exists in `marketing/public/`.
- [ ] `headline` is an array whose lines each fit the frame at the target aspect.
- [ ] Rendered copy contains no banned word, no em dash, no invented price, no results claim, no
      shame framing.
- [ ] One accent per frame, taken from the pillar map, reconciled with the brand tokens.
- [ ] Rendered dimensions verified against the format, not assumed.
- [ ] Source screenshot is current, or the staleness is called out in the report.
- [ ] Output paths reported, with `out/` identified as gitignored.
- [ ] No command was run unbounded.

## Related skills

| Skill | Use it when |
|---|---|
| `screenshot-capture` | The product screen behind the asset is missing or stale |
| `image-production` | A one-off resize, crop, frame, or format change with sharp |
| `inspo-library` | Choosing the layout or sequence pattern before building |
| `copywriting` | Writing or approving the headline, body, and CTA |
| `content-calendar` | The render exists to fill a scheduled slot |
| `reels-scripts` | The deliverable is filmed rather than rendered |
