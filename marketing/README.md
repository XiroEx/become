# Become marketing

Everything that gets a stranger to sign up for Become and keeps them logging: the marketing skill
library, the Remotion campaign asset project, and the competitor creative analysis.

**Start with [`AGENTS.md`](./AGENTS.md).** It is the knowledge base: product truth, brand system,
hard constraints, asset inventory, and where marketing currently stands. Read it before doing
anything in this folder.

---

## The marketing agent

`.claude/agents/become-marketing.md` (repo root) defines the `become-marketing` subagent: strategy,
copy, social, lifecycle, growth, and asset production. It loads `marketing/AGENTS.md` and the
`become-context` skill first, routes the task to the matching specialist skill, and ships landing
changes through the normal branch flow.

Invoke it for any marketing task touching `marketing/` or Become's landing, brand, or campaigns.

---

## The skill library

28 skills in `.claude/skills/<name>/SKILL.md`.

| File | What it is |
|---|---|
| `.claude/skills/_catalog.json` | The authoritative index: name, batch, description, section hints, cross-references, reference files |
| `.claude/skills/_conventions.md` | Authoring rules. Read before writing or editing any skill |
| `.claude/skills/<name>/SKILL.md` | The actionable core of one skill |
| `.claude/skills/<name>/references/` | Detail docs the SKILL.md loads on demand |

Each skill's frontmatter `description` is the trigger surface. Match the task to a description, read
that `SKILL.md`, and follow its Process, Frameworks, output buckets, and Quality bar.

| Batch | Skills |
|---|---|
| Foundation and strategy | `become-context`, `positioning`, `marketing-plan`, `offer-design`, `competitor-analysis` |
| Copy and conversion | `copywriting`, `landing-cro`, `copy-editing`, `signup-activation`, `web-app-listing` |
| Social and content | `social-strategy`, `reels-scripts`, `content-calendar`, `ugc-creator-briefs`, `coach-brand-voice` |
| Lifecycle and launch | `email-lifecycle`, `push-notifications`, `launch-campaign`, `referral-program` |
| Measurement and growth | `seo-geo`, `analytics-tracking`, `ab-testing`, `paid-social`, `marketing-psychology` |
| Production pipelines | `screenshot-capture`, `remotion-assets`, `image-production`, `inspo-library` |

`become-context` runs first and maintains `.agents/become-context.md`, the anchor document every
other skill reads.

---

## Remotion campaign assets

Remotion-based campaign assets derived from Become's existing product design and source screenshots.

### Outputs

- `out/become-social-square.png` — 1080 × 1080 social post
- `out/become-story-poster.png` — 1080 × 1920 story/reel cover
- `out/become-open-graph.png` — 1200 × 630 link preview
- `out/become-reel.mp4` — 1080 × 1920, 12-second vertical motion spot

`out/` is **gitignored**. A render is a local deliverable; report it by path rather than assuming a
merge shipped it.

#### Video collection

`out/videos/` contains 19 additional 6-second vertical social spots at 1080 × 1920.
Each video turns one campaign concept into a three-beat sequence: promise, real
product view, and call to action.

`out/videos-reviewed/` contains the rebuilt 19-video collection: 19 separate
storyboards, subject-specific motion instruments, 8-second runtimes, and a
documented ten-pass critique process.

#### Campaign collection

`out/collection/` contains 46 additional ready-to-publish JPEG assets:

- `square/` — 16 social posts at 1080 × 1080
- `story/` — 15 story/reel covers at 1080 × 1920
- `landscape/` — 15 ads and link graphics at 1200 × 628

The filenames are numbered in campaign order. The editable copy, pillar, screenshot, and layout assignments live in `src/campaigns.json`.

### Work locally

```bash
cd marketing
npm install
npm run studio
```

Run `npm run assets:sync` after the source logo or app screenshots change. Run `npm run render` to regenerate every deliverable.

Use `npm run render:collection` to regenerate only the 46-image campaign collection.
Use `npm run render:videos` to regenerate only the 19-video collection.
Use `npm run render:reviewed` to regenerate the reviewed collection. Run
`npm run review:pass -- N` (1–10) to render the evidence sheet for critique pass N.

Wrap long renders in `timeout`. A full `npm run render` is a very long job; the per-script table
and expected runtimes are in `.claude/skills/remotion-assets/references/render-recipes.md`.

**Note:** `npm run assets:sync` copies from the legacy `webapp/public/screenshots/ss-*.png`, not
from `webapp/public/screenshots/v2/`. If a render needs the current v2 look, update the mapping in
`scripts/sync-assets.mjs` or place the file into `public/` by hand.

### Design system

The campaign keeps Become's monochrome shell and rounded product geometry. Green, purple, and orange map to training, mindset, and nutrition. The upward arrow acts as a progress spine linking the three parts of the product.

The project's pillar colour map does not exactly match the brand tokens in `AGENTS.md`. Reconcile
against `.agents/become-context.md` before anything ships externally, and change the map in
`src/campaignCollection.tsx` rather than overriding a colour inline.

---

## Inspo library

Competitor creative reference.

| Path | State |
|---|---|
| `inspo/` | **Gitignored, local only.** Dated folders, e.g. `2026-08-24-marketing-inspo/`. May be absent in a fresh worktree |
| `inspo-analysis.md` | **Committed.** The durable artifact |

`inspo-analysis.md` covers STNDRD's 25 Instagram Story ads and Ladder's 5-slide meal-logging
carousel: a per-image index, six synthesized pattern sections (formats, layout systems, colour and
type, CTA styles, premium versus cheap, fit and clash with Become), and "Steal this" and "Avoid
this" lists.

**Read the analysis before opening an image.** It is a two-minute read and it answers nearly every
design question the library can answer.

File new captures into `inspo/YYYY-MM-DD-<slug>/` and update `inspo-analysis.md` in the same pass.
The procedure is in `.claude/skills/inspo-library/references/filing-guide.md`.

Competitor creative is a reference, never a source asset. Never trace it, reuse it, or publish it.

---

## Hard constraints

Summarised here; the full list with rationale is in [`AGENTS.md`](./AGENTS.md).

- No fabricated testimonials, user counts, results claims, or pricing. Become is free today and no
  pricing exists.
- Product screenshots come only from dummy accounts via the documented capture pipeline
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- No personal camera-roll photos of the coach.
- The Becoming is design inspiration and at most one section or mention, never the headline theme.
- Health and fitness claims stay responsible: no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- Never write a secret into a file, log, commit, or report.
