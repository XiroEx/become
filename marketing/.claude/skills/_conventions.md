# Become Marketing Skills — Authoring Conventions

**Read this before writing a single SKILL.md.** Every skill in this library follows the same
frontmatter, the same section spine, the same cross-reference syntax, and the same hard
constraints. Six builders work in parallel; consistency is what makes 28 skills read as one
system instead of 28 prompts.

Authoritative catalog: `marketing/.claude/skills/_catalog.json`. Your batch's `name`,
`description`, `sections_hint`, `crossRefs`, and `referenceFiles` are already decided there.
**Do not rename a skill, do not rewrite its `description`, do not add or drop skills.** The
descriptions are the always-loaded trigger surface and were tuned for non-overlap across all
28 at once. If you believe a description is wrong, note it in your return message; do not
silently change it.

---

## 1. File layout

```
marketing/.claude/skills/<skill-name>/
├── SKILL.md            # REQUIRED. The whole actionable core. < 500 lines, hard cap.
├── references/         # Optional. Detail docs, one level deep, loaded on demand.
│   └── <topic>.md
└── assets/             # Optional. Templates, checklists, JSON/CSV data files.
```

- Directory name **must equal** the `name` in frontmatter, exactly.
- `references/` files are named in `_catalog.json` as `referenceFiles`. Create exactly those.
  Add one more only if a SKILL.md section would otherwise blow the line budget.
- No `scripts/` in this library except in **B6 production-pipelines**, where scripts are real
  and already exist in the repo — point at the real ones, do not fork copies.
- Do not create `evals/`. Not in scope for v1.

---

## 2. Frontmatter (exact)

Only these fields. Anything else breaks portability.

```yaml
---
name: landing-cro
description: When the user wants to raise conversion on become.redbtn.io — including hero clarity, section order, proof placement, CTA friction, and mobile-first layout. Use when the user says "the landing page isn't converting," "nobody signs up," "audit our landing page," "should the CTA be above the fold," "what's wrong with our hero," or just pastes a URL and asks for feedback. For writing the words themselves see copywriting; for tightening words that already exist see copy-editing; for what happens after the click see signup-activation.
metadata:
  version: 1.0.0
  batch: copy-conversion
---
```

Rules:

- **`name`** — 1-64 chars, `[a-z0-9-]` only, no leading/trailing hyphen, no `--`. Must never
  contain the words `anthropic` or `claude`. Must match the directory name.
- **`description`** — 1-1024 chars, plain text, no XML tags, **third person, always**.
  "Produces X…" / "When the user wants to X…". Never "I can help you…" or "You can use this to…".
  Copy it **verbatim from `_catalog.json`**.
- **`metadata`** — free-form. Use exactly `version` (start at `1.0.0`) and `batch` (the batch
  slug: `foundation-strategy`, `copy-conversion`, `social-content`, `lifecycle-launch`,
  `measure-growth`, `production-pipelines`).
- **YAML safety.** `description` is written as an unquoted plain scalar. Catalog descriptions
  are already checked to contain no `": "`, no leading quote or `[`/`{`/`&`/`*`/`!`/`|`/`>`/`%`/`@`,
  and no ` #`. Paste them unchanged and the file parses. If you ever add a colon-space, the
  frontmatter silently breaks.
- Optional: `license`, `compatibility`, `allowed-tools`. Only add `allowed-tools` if the skill
  genuinely needs to constrain tools (B6 skills that shell out may list `Bash, Read, Write, Edit`).
- **Do not** use `when_to_use`, `argument-hint`, `model`, `agent`, or any other Claude Code-only
  field. This library must stay portable.

### The description formula (all 28 already follow it)

```
When the user wants to <job> — including <surface 1>, <surface 2>, <surface 3>.
Use when the user says "<verbatim phrase>," "<verbatim phrase>," … (5-10, including sloppy
and emotional ones). Use this even if <edge trigger>.
For <adjacent job> see <sibling-skill>; for <adjacent job> see <sibling-skill>.
```

Descriptions live in context permanently and the skill listing truncates at ~1,536 chars per
entry, so the **key use case goes first**. Trigger phrases second. Boundary pointers last.

---

## 3. Section spine (same order in every SKILL.md)

```markdown
# <Title Case Skill Name>

<One or two sentences: role + goal. "You are a conversion strategist for Become. Your goal is
to find the specific reason a visitor did not sign up, and fix it.">

**Load `become-context` first.** <one line, see §4>

## Purpose
## When to use
## Process
## Frameworks
## Become-specific rules
## Quality bar
## Related skills
```

What goes in each:

| Section | Contents | Typical length |
|---|---|---|
| **Purpose** | 3-6 lines. What this skill produces and what "done" looks like. Name the deliverable explicitly (a file, a set of variants, a calendar, a brief). | 3-6 lines |
| **When to use** | Bullets: the 3-5 real situations. Then a short **Not this skill:** list pointing to siblings. Prose form of the description's boundaries. | 8-15 lines |
| **Process** | A **numbered** sequence that starts with an **assessment gate** — 3-5 things to establish before producing anything (who, what surface, what constraint, what already exists in the repo). Then the production steps. Then the mandated output format with **named buckets**. | 40-90 lines |
| **Frameworks** | The named, **ordered-by-impact** models. Each framework section carries the triad (§5). This is the bulk of the file. | 60-200 lines |
| **Become-specific rules** | Non-negotiable. Product truth, brand, banned moves, the real asset paths, the exact things a generic marketing agent gets wrong about Become. Every skill has this section; it is what makes the library ours. | 25-60 lines |
| **Quality bar** | A pass/fail checklist the agent runs against its own output before returning. Written as checkable assertions, not aspirations. Include the constraint checks from §8. | 10-25 lines |
| **Related skills** | Table: `| Skill | Use it when |`. Only real siblings from `_catalog.json`. | 5-12 lines |

Sub-headings inside **Process** and **Frameworks** are free — `sections_hint` in the catalog
tells you which ones this skill needs.

---

## 4. Pointing at `become-context` (verbatim block)

`become-context` is the anchor skill. It produces and maintains
`marketing/.agents/become-context.md` — product truth, brand system, voice, ICP, positioning,
constraint list, and the asset inventory. Every other skill reads it before asking the user
anything.

**Every SKILL.md except `become-context` itself** carries this block immediately after the role
line, word for word:

```markdown
**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.
```

`become-context` itself instead carries a `## Document version` + `## Changelog` convention for
the file it generates: newest entry first, one line each — what changed and why. Downstream
skills generate against that document, so a silent edit is a silent break.

---

## 5. The triad (mandatory inside every framework section)

Do not write "evaluate the headline." Write:

```markdown
### 1. Value proposition clarity

**Check for:**
- Does the hero say what Become does in the visitor's words, above the fold, on a 390px screen?
- ...

**Common issues:**
- *Category vagueness* — "your fitness journey, reimagined" tells a visitor nothing.
- ...

**Strong patterns:**
- `<Concrete outcome> without <the thing they hate>` → "One app instead of five."
- ...
```

Three of each, minimum. Frameworks are **named and ordered by impact**, not alphabetised, and
the ordering must be stated ("in order of impact", "in the order you should fix them").

**Concrete beats abstract.** Include weak-vs-strong pairs everywhere:

```
Weak:   "Start your fitness journey"
Strong: "Get this week's workout"
```

Use ❌ / ✅ marking for rewrites. Examples convey the voice better than any adjective.

---

## 6. Mandated output buckets

Every skill's Process ends with a **fixed output format with named buckets**, so runs are
comparable. Pick the shape that fits, and name it explicitly in the SKILL.md:

- **Audit-shaped** (landing-cro, copy-editing, seo-geo, competitor-analysis):
  `Quick wins (do now)` / `High-impact changes (prioritize)` / `Test ideas (hypotheses)` /
  `Rewrites (2-3 options each, with rationale)`.
- **Artifact-shaped** (copywriting, reels-scripts, email-lifecycle, ugc-creator-briefs):
  `The artifact` / `Annotations (why this choice, which principle)` / `Alternatives (A/B/C with
  rationale)` / `What to capture or build to ship it`.
- **Plan-shaped** (marketing-plan, launch-campaign, content-calendar, positioning):
  `Decisions locked` / `The plan (dated or sequenced)` / `Assets required (with the skill that
  makes each)` / `How we'll know it worked` / `Open questions`.
- **Pipeline-shaped** (all of B6): `Preflight checks` / `Commands to run` / `Outputs and where
  they land` / `Verification` / `Known failure modes`.

Every alternative carries a one-line rationale. No unlabelled option dumps.

---

## 7. Length, density, and cost

- **SKILL.md: 170-400 lines is the target band. 500 lines is a hard cap.** Median across this
  library should land near 300.
- The body loads on invocation and **stays in context for the rest of the session**. Every line
  is a recurring cost. Cut restatement, cut throat-clearing, cut "in today's fast-moving
  landscape."
- If a section exceeds ~60 lines of pure detail (channel-by-channel specs, long checklists,
  worked examples, benchmark tables), move it to `references/<topic>.md` and leave a one-line
  pointer in SKILL.md. Aim for 2-4 reference files per skill; 5-25 KB each.
- Tables beat prose for anything with more than three parallel items.
- No table of contents. No "Overview" section that repeats Purpose.

---

## 8. Hard constraints (verbatim — reproduce these in every skill's Become-specific rules or Quality bar)

These are non-negotiable and must survive into the generated output of every skill:

> - **No fabricated testimonials, user counts, results claims, or pricing.** Become is free
>   today and no pricing exists — never invent a price, a tier, a trial length, or a discount.
> - **Product screenshots come only from dummy accounts via the documented capture pipeline**
>   (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
>   "(beta)".
> - **No personal camera-roll photos of the coach.**
> - **The Becoming is design inspiration and at most one section or mention — never the
>   headline theme.**
> - **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
>   pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome.

Two additional library rules that follow from them:

- **Source tiers for any statistic.** Research embedded in these skills is tiered: Tier A =
  platform-published or large-sample studies; Tier B = named case studies with corroboration;
  Tier C = vendor/SEO blogs with unverifiable samples. Tier B and C numbers may steer *our*
  internal decisions and must be labelled where cited. **No tier may ever be restated as a
  Become results claim in public copy.** Say so explicitly wherever you cite a number.
- **Assets are reused, not regenerated.** If a capture, render, or reference already exists in
  the repo, point at it. Regenerating burns AI credits, risks a worse capture, and drifts the
  brand.

---

## 9. Product truth (single source — do not contradict, do not extend)

Become (`become.redbtn.io`) is a mobile-first PWA fitness coaching app built around coach
**Jon Don**. Hubs:

- **Dashboard** — day at a glance, streaks, mood, weight, water, customizable tiles.
- **Training** — coach-built multi-phase programs, AI session/program generator, demo clips on
  the big lifts (39 of the 132 exercises, never "every exercise"), set logging with PR history,
  LIVE mode that logs the set as you train, with last session's numbers and your PR on screen.
- **Nutrition** — photo logging that itemizes a whole plate, barcode scan, personal
  calorie/macro targets.
- **Mind** — short guided sessions, mood tracking, identity work.
- **Progress & The Becoming** — weight/strength trends plus a weekly recap that writes your week
  back to you.

Signup is an **email magic link**, with **Google sign-in and passkeys** as the other two doors.
No credit card. Free today. **Web push notifications exist.**
Audience: everyday people who feel scattered across fitness apps; coach-led credibility matters.

If a skill needs a capability not on this list, it does not exist. Say "not available today"
rather than inventing it.

---

## 10. Brand and voice

**Brand words:** simple · sleek · innovative · empowering.

| Token | Value | Means |
|---|---|---|
| Primary green | `#16a34a` / `#22c55e` | Training, the product, the primary CTA |
| Violet | AI and Mind surfaces | Generator, mind sessions |
| Gold | Streaks and The Becoming | Consistency, recap |
| Type | Geist | Headline and body |
| Themes | Light **and** dark, both first-class | Never ship dark-only or light-only creative |

**Voice: confident, concrete, zero fluff, empowering not preachy. "Evidence, not vibes."**

Tone rules every skill enforces on its own output:

- Second person, present tense, active voice. Short sentences.
- Lead with the concrete noun. ❌ "Transform your wellness journey." ✅ "See what you lifted last Tuesday."
- Verbs the product actually does: log, scan, plan, count, recap, generate, show.
- **Banned:** "journey," "unlock your potential," "game-changer," "revolutionary," "seamless,"
  "effortless," "10x," "crush it," "no excuses," "beast mode," hustle/shame framing, "just," "simply."
- **Near-zero em dashes** in deliverable copy. Use a period, a comma, or a colon. (Frontmatter
  `description` fields are metadata, not deliverable copy, and follow the catalog's formula
  em dashes included. Do not "fix" them.)
- No emoji in product-voice copy. Social captions may use at most one, and only when it carries
  meaning.
- Never preachy, never shaming. The user is not lazy; their tools were scattered.
- Jon speaks as a coach in first person (`coach-brand-voice` owns that register). The product
  speaks in second person. Do not mix the two in one block.

---

## 11. Cross-reference syntax

- **Sibling skill in prose or a table:** backtick the bare name — `` `copy-editing` ``. No paths,
  no `.md`, no `@`. Only names that exist in `_catalog.json`.
- **Reference file inside your own skill:** relative, one level —
  `` See `references/experiments.md` for the full test list. ``
- **Repo file or asset:** repo-relative path from the repo root, backticked —
  `` `webapp/public/screenshots/v2/manifest.json` ``, `` `marketing/src/campaigns.json` ``.
  Never absolute paths, never `/home/...`.
- **The context doc:** always `marketing/.agents/become-context.md`.
- Every skill's `Related skills` table must include at least the `crossRefs` listed for it in
  `_catalog.json`, and must not invent others.

---

## 12. Asset inventory (real, verified 2026-08-25 — cite these paths, do not invent)

| Asset | Path | Notes |
|---|---|---|
| Product captures v2 | `webapp/public/screenshots/v2/` | 15 `.webp` — 8 screens (dashboard, workout-hub, workout-log, generate, nutrition-day, nutrition-meal, mind, progress), light/dark pairs except `workout-log` which is dark-only. |
| Capture manifest | `webapp/public/screenshots/v2/manifest.json` | The pipeline record: viewport 390×844 @2x, origin, dummy accounts, per-shot state notes, `seeding` (every write went through the app's own HTTP APIs), and `knownIssues`. **Read before reusing a shot.** |
| Legacy captures | `webapp/public/screenshots/ss-*.png` | Older, pre-v2. Prefer v2. |
| Remotion project | `marketing/` | `src/Root.tsx`, `src/compositions.tsx`, `src/campaignCollection.tsx`, `src/videoCollection.tsx`, `src/reviewedVideo.tsx`, `src/campaigns.json` (46 assets), `src/reviewedCampaigns.ts`. |
| Render scripts | `marketing/scripts/` | `sync-assets.mjs`, `render-collection.mjs`, `render-videos.mjs`, `render-reviewed.mjs`, `render-review-pass.mjs`. npm scripts in `marketing/package.json`. |
| Render inputs | `marketing/public/` | `dashboard.png`, `programs.png`, `progress.png`, `nutrition.png`, `mindset.png`, `calendar.png`, `chat.png`, `logo.png`. Refreshed by `npm run assets:sync`. |
| Render outputs | `marketing/out/` | **gitignored.** `square/` `story/` `landscape/` under `out/collection/`, `out/videos/`, `out/videos-reviewed/`. |
| Inspo library | `marketing/inspo/` | **gitignored, local only.** Dated folders, e.g. `2026-08-24-marketing-inspo/`. |
| Inspo analysis | `marketing/inspo-analysis.md` | Committed digest of the library. STNDRD (25 story ads) + Ladder (5-slide carousel). The durable artifact — read this instead of the images. |
| Landing page | `webapp/components/landing/` | `BecomeLanding.tsx`, `HeroLine.tsx`, `Marquee.tsx`, `Phone.tsx`, `Spine.tsx`, `hooks.ts`, `landing.module.css`. The conversion surface. |
| Capture harness | `webapp/tests/e2e/` + `playwright.config.ts` | `test-auth.ts` mints short-lived JWTs from `JWT_SECRET`; `app-shots.spec.ts`, `nutri-shots.spec.ts` are the shot specs. Mobile projects use iPhone 14. |
| Exercise demos | `webapp/public/exercises/` | 42 files — 39 `.mov` plus 3 `.mp4` (back-squat, bench-press, cable-row), covering 39 of the 132 canonical exercises. Never claim every exercise has a clip. Known bug: the files are served as `video/mp4` and play fine, but `webapp/components/FramedVideo.tsx:39` emits `type="video/quicktime"`, which Chromium refuses — the fix is the type attribute, not swapping to an `.mp4` that mostly does not exist. |
| Image tooling | `sharp` in `webapp/package.json` | Already a dependency. No new image dependency should be added. |

Public surface today is essentially one indexable page (`webapp/app/page.tsx`) plus
`login` / `register` / `verify` / `information` / `share` / `onboarding`. There is **no**
`robots.txt`, **no** `llms.txt`, **no** `sitemap.ts`, and **zero** JSON-LD. Treat SEO/GEO work
as greenfield.

---

## 13. Secrets and safety

- **Never** write a token, connection string, password, API key, or dummy-account credential
  into a skill file, a reference file, or generated output. Refer to the mechanism
  (`JWT_SECRET` from `webapp/.env.local`), never the value.
- Dummy accounts may be named (`playwright-test-mobile1@become.test`) because they are already
  in a committed manifest; their tokens may not.
- Any shell command a skill instructs an agent to run must be **bounded**: wrap long-running
  commands in `timeout`, and never write an unbounded `until` wait.

---

## 14. Before you hand off

Self-check each SKILL.md you write:

1. Frontmatter has exactly `name`, `description`, `metadata` (+ `allowed-tools` only if needed).
2. `name` matches the directory and the catalog, character for character.
3. `description` is byte-identical to `_catalog.json`.
4. The `become-context` block from §4 is present, verbatim, right after the role line.
5. Section spine present and in order: Purpose / When to use / Process / Frameworks /
   Become-specific rules / Quality bar / Related skills.
6. Process opens with an assessment gate and closes with named output buckets.
7. Every framework carries Check-for / Common-issues / Strong-patterns, three each.
8. At least four weak-vs-strong or ❌/✅ pairs in the file.
9. The §8 constraints appear in Become-specific rules or Quality bar.
10. Line count between 170 and 400 (hard cap 500). `wc -l` it.
11. Every backticked skill name exists in `_catalog.json`; every backticked path exists in the repo.
12. No em dashes in example copy, no banned words, no invented pricing, no invented metrics.
13. All `referenceFiles` listed in the catalog exist and are actually pointed at from SKILL.md.
14. No secrets, no absolute paths, no unbounded waits.
