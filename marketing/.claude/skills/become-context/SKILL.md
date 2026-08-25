---
name: become-context
description: Establishes and maintains the single source of truth every other Become marketing skill loads first — product truth and hub-by-hub feature inventory, brand system, voice rules, ICP and personas, positioning summary, honest proof points, the hard constraint list, and the repo asset inventory — written to marketing/.agents/become-context.md. Use when the user says "set up marketing context," "what is Become again," "update the brand doc," "our messaging is inconsistent," "the copy keeps making things up about the product," or "remind yourself what we're selling." Use this before any other marketing skill, and re-run it whenever the product ships something new. For the category decision see positioning; for channel sequencing see marketing-plan.
metadata:
  version: 1.0.0
  batch: foundation-strategy
---

# Become Context

You are the keeper of Become's marketing truth. Your goal is to produce and maintain one
document that every other marketing skill reads before it writes a word, so that twenty-eight
skills describe the same product, in the same voice, to the same person.

The document is `marketing/.agents/become-context.md`. This skill is the **only** place product
truth is authored. Every other skill reads it and never redefines it.

## Purpose

Produce or refresh `marketing/.agents/become-context.md`: a twelve-section brief covering
product truth by hub, ICP and personas, pains, competitive alternatives, differentiation,
objections, customer language, brand and voice, honest proof points, constraints, assets, and
current goals. Every claim in it is tagged verified or assumed.

Done looks like: the file exists, every feature named in it exists in the app, every repo path
in it resolves, every unvalidated claim is tagged, and the changelog has a new dated line
explaining what changed and why.

## When to use

- No `marketing/.agents/become-context.md` exists yet and any marketing work is about to start.
- The product shipped something (a new hub, a new mechanic, a renamed screen) and the doc is stale.
- Copy across surfaces has drifted: the landing page, a Reel, and an email describe the product
  differently.
- An agent invented a feature, a price, or a user count, and the fix is to write the truth down once.
- Someone new (human or agent) needs to be useful on Become marketing in ten minutes.

**Not this skill:**
- Deciding the market category and competitive frame: `positioning`.
- Sequencing channels and phases: `marketing-plan`.
- Tearing down a named competitor: `competitor-analysis`.
- Writing Jon's first-person voice: `coach-brand-voice`.
- Writing any actual marketing copy: `copywriting`.

## Process

### Assessment gate (do all four before writing anything)

1. **Does the doc exist and how stale is it?** Read `marketing/.agents/become-context.md`. Note
   its `Document version` and the newest changelog date. If it does not exist, you are doing a
   full build, not a refresh.
2. **What shipped since?** Check the app for anything the doc misses. Fast reads:
   `webapp/app/dashboard/` for the hub list, `webapp/models/` for the data model,
   `webapp/components/landing/BecomeLanding.tsx` for what the public surface already claims.
   Recent commit subjects are a cheap changelog.
3. **What is unverified?** Anything about audience, motivation, or competitive alternatives is an
   assumption until Jon or a real user confirms it. Anything about features is verifiable in the
   repo. Sort every claim into one of the three tags before you write it.
4. **What does the requester actually need?** A full rebuild, a single-section patch (new
   feature, new persona), or a read-back. Do not rewrite twelve sections to add one bullet.

### Build steps

5. **Inventory the product hub by hub.** Walk Dashboard, Training, Nutrition, Mind, Progress and
   The Becoming. For each: what the user does there, the specific mechanic that is hard to copy,
   and the route. If you cannot point at code or a capture, it does not go in.
6. **Write the twelve sections** using `references/context-template.md`. The template is
   pre-filled with what is already verified; your job is to correct it, extend it, and tag it.
7. **Tag every claim** with `[verified in repo]`, `[verified with Jon]`, or
   `[assumption, unvalidated]`. Untagged lines are a defect.
8. **Copy the asset inventory** from `references/asset-inventory.md` and confirm each path
   resolves in this worktree. A path that does not resolve gets removed, not guessed at.
9. **Bump the version and write the changelog line.** Newest first, one line, what changed and why.
10. **Report deltas.** Tell the user which sections changed and which downstream skills are
    affected. A change to differentiation invalidates copy; a change to hubs invalidates captures.

### Output buckets (plan-shaped)

Return in this order, always:

- **Decisions locked** — what is now settled truth in the doc.
- **The plan** — the doc itself, or the diff if this was a refresh.
- **Assets required** — anything the doc says exists but does not yet (a capture, a proof point).
- **How we'll know it worked** — the downstream skills that will now stop guessing.
- **Open questions** — every `[assumption, unvalidated]` line, listed for Jon to confirm or kill.

## Frameworks

### 1. The twelve sections of the context document

In order of how often downstream skills read them. Full template in
`references/context-template.md`.

| # | Section | Answers | Read most by |
|---|---|---|---|
| 1 | Overview and current stage | What is this, who runs it, how far along | Everything |
| 2 | Product truth by hub | What each hub does and its hard-to-copy mechanic | `copywriting`, `reels-scripts` |
| 3 | ICP | Who this is for, behaviourally | `positioning`, `paid-social` |
| 4 | Personas | Two or three named, with the moment they look for a tool | `reels-scripts`, `email-lifecycle` |
| 5 | Pains | The specific friction, in their words | `landing-cro`, `copywriting` |
| 6 | Competitive alternatives | Including "nothing" and the Notes app | `positioning`, `competitor-analysis` |
| 7 | Differentiation | Attribute, then value, with proof for each | `positioning`, `copywriting` |
| 8 | Objections and anti-persona | What stops a yes, and who we do not want | `landing-cro`, `offer-design` |
| 9 | Customer language | Verbatim phrases, never paraphrased | `copywriting`, `seo-geo` |
| 10 | Brand and voice | Tokens, register, banned list | `copy-editing`, `image-production` |
| 11 | Proof points we can honestly make | The full honest list, and what is off-limits | `landing-cro`, `paid-social` |
| 12 | Goals and constraints | What we are trying to move, and the hard rules | `marketing-plan`, `ab-testing` |

**Check for:**
- Does every hub entry name a mechanic, not a benefit? "Counts your reps through the camera" is a
  mechanic. "Keeps you accountable" is not.
- Does the ICP describe behaviour, not demographics? "Has three fitness apps open" beats "25-40, urban."
- Does section 11 contain only things that are true today with no number we cannot reproduce?

**Common issues:**
- *Feature list masquerading as product truth* — twenty bullets, no hierarchy, no mechanic.
- *Demographic ICP* — age and gender bands that no copy decision ever turns on.
- *Proof drift* — a proof point that was true in a demo and never shipped.

**Strong patterns:**
- One line per hub in the form `<Hub>: <what you do> <the mechanic that makes it different>`.
- Personas named after the moment, not the person: "The Restarter," "The App Juggler."
- Customer language kept as raw quotes in quotation marks, never cleaned up into marketing prose.

### 2. Verified versus assumed

Every line in the document carries exactly one tag. This is the single highest-value convention
in the file, because it is what stops an agent quoting a guess as a fact.

| Tag | Means | Test |
|---|---|---|
| `[verified in repo]` | You can point at a file, route, model, or capture | Name the path |
| `[verified with Jon]` | A human confirmed it | Name the date |
| `[assumption, unvalidated]` | Plausible, unproven | Must appear in Open questions |

**Check for:**
- Is every audience or motivation claim tagged as an assumption unless someone confirmed it?
- Does every `[verified in repo]` line carry the path that verifies it?
- Do assumptions get reviewed at each refresh, or do they quietly harden into facts?

**Common issues:**
- *Tag decay* — an assumption survives three refreshes and loses its tag.
- *Path-free verification* — "verified in repo" with nothing to check.
- *Over-tagging* — tagging every sentence in a paragraph instead of the claim.

**Strong patterns:**
- ✅ `LIVE mode counts reps through the camera. [verified in repo: webapp/app/dashboard/workout/[programId]/workout/live/]`
- ✅ `Most signups already use two or more other fitness apps. [assumption, unvalidated]`
- ❌ `Users love the weekly recap.` (no tag, no proof, and a results claim in disguise)

### 3. Asset inventory

Copy the table from `references/asset-inventory.md` into the doc, then verify each path in the
current worktree. This table is how every production skill avoids regenerating something that
already exists.

**Check for:**
- Does every path resolve? Run a check, do not trust the previous version of the doc.
- Is `webapp/public/screenshots/v2/manifest.json` referenced as the gate on reusing any capture?
- Are the gitignored paths (`marketing/out/`, `marketing/inspo/`) marked as such, so an agent in a
  fresh worktree does not report them missing as a bug?

**Common issues:**
- *Phantom assets* — a path that existed on someone's machine and never in git.
- *Silent staleness* — captures dated months ago cited as current.
- *Missing the manifest* — an agent reuses a capture that the manifest flags as having a known issue.

**Strong patterns:**
- Each row carries path, what it is, and one gotcha. The gotcha is the valuable column.
- Gitignored rows say **gitignored, local only** in bold, inline.
- Captures cite their `capturedAt` from the manifest, so staleness is visible without opening it.

### 4. Document version and changelog convention

The generated document ends with two sections. Downstream skills generate against this document,
so a silent edit is a silent break.

```markdown
## Document version

1.3.0 — last verified 2026-08-25 against become.redbtn.io and the repo at <short sha>.

## Changelog

- 2026-08-25 — Added Mind hub identity-work detail. Copy kept describing it as meditation only.
- 2026-08-24 — Replaced legacy screenshot paths with screenshots/v2. Old paths no longer resolve.
- 2026-08-20 — Initial build.
```

**Check for:**
- Newest entry first, one line each, and each line says *what changed and why*.
- Does the version line name what it was verified against, not only a date?
- Did a refresh that changed nothing still get a line? It should not. No-op refreshes are noise.

**Common issues:**
- *Changelog as diff dump* — "updated section 7." Useless. Say what the change corrects.
- *Version bump without verification* — the date moves, nothing was checked.
- *Rewrites with no entry* — the worst case, because downstream skills cannot see the break.

**Strong patterns:**
- Minor version for a section edit, patch for a typo or path fix, major when differentiation or
  the market frame changes, because that invalidates existing copy.
- A line that names the downstream consequence: "Nutrition now says whole-plate itemizing, not
  calorie counting. Existing ad copy is wrong."

### 5. The condensed truth (what a fresh agent must know in one screen)

Everything below is `[verified in repo]` unless marked.

**Product.** Become at `become.redbtn.io` is a mobile-first PWA fitness coaching app built around
coach Jon Don. Five hubs:

| Hub | What you do | The mechanic |
|---|---|---|
| Dashboard | Day at a glance | Streaks, mood, weight, water, customizable tiles |
| Training | Follow or generate a plan | Coach-built multi-phase programs, AI session and program generator, demo video on every movement, set logging with PR history, LIVE mode that counts reps through the camera |
| Nutrition | Log what you ate | Photo logging that itemizes a whole plate, barcode scan, personal calorie and macro targets |
| Mind | Short practice | Guided sessions, mood tracking, identity work |
| Progress and The Becoming | See the trend | Weight and strength trends, plus a weekly recap that writes your week back to you |

**Signup.** Email magic link. No password, no credit card. Free today. Web push notifications
exist. There is no native app and no app store listing.

**Stage.** Pre-revenue, no pricing of any kind, small audience, coach-led credibility is the main
asset. One production channel (`main` to `become.redbtn.io`) and a beta channel that shares the
same database.

**Audience.** Everyday people who feel scattered across fitness apps. `[assumption, unvalidated]`
until user interviews exist.

**Channels available today.** Owned: the landing page, email over SMTP, web push, in-app.
Rented: Instagram and TikTok accounts, directories such as Product Hunt and AlternativeTo.
Borrowed: Jon's own audience, creators, communities. No paid budget assumed.

If a capability is not on this page, it does not exist. Say "not available today" rather than
inventing it.

## Become-specific rules

- **This document is the only place product truth is edited.** Downstream skills read it and never
  redefine it. If `copywriting` discovers the doc is wrong, it reports back here; it does not patch
  the claim locally and move on.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
  In this document it lives inside the Progress hub row, not as a pillar of its own.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Source tiers for any statistic.** Tier A is platform-published or large-sample research, Tier B
  is a named case study with corroboration, Tier C is a vendor blog with an unverifiable sample.
  Label the tier wherever a number appears. No tier may ever be restated as a Become results claim
  in public copy.
- **Assets are reused, not regenerated.** If a capture or render already exists in the repo, the
  doc points at it.
- **Never write a token, connection string, or dummy-account credential into the document.** Dummy
  account *names* are already in a committed manifest and may be named. Their tokens may not.
- The landing page already asserts things in public: read
  `webapp/components/landing/BecomeLanding.tsx` before writing section 11, because anything on the
  landing page is a claim we are already making and must be able to defend.

## Quality bar

Run this against the generated document before returning.

- [ ] Every one of the twelve sections is present and non-empty.
- [ ] Every claim carries exactly one tag: verified in repo, verified with Jon, or assumption.
- [ ] Every `[verified in repo]` claim names a path, and that path resolves in this worktree.
- [ ] No feature appears that is not in the hub table or the app. No invented hub, no roadmap item
      written as shipped.
- [ ] No price, tier, trial, discount, user count, testimonial, or results claim anywhere.
- [ ] Gitignored asset paths are marked as gitignored.
- [ ] The Becoming appears once, inside Progress, not as a theme.
- [ ] Voice section carries the banned-word list with a replacement for each entry.
- [ ] Version bumped and a changelog line added that says what changed and why.
- [ ] Every `[assumption, unvalidated]` line is repeated in Open questions.
- [ ] No secrets, no absolute paths.

## Related skills

| Skill | Use it when |
|---|---|
| `positioning` | The category and competitive frame need locking, before any headline is written |
| `marketing-plan` | The context is set and you need channel sequencing and phasing |
| `competitor-analysis` | A named competitor needs a teardown to fill sections 6 and 7 |
| `coach-brand-voice` | Jon is speaking in first person and needs his own register |
| `copywriting` | The doc is current and it is time to write actual copy against it |

Reference files: `references/context-template.md` (the fillable twelve-section document),
`references/voice-guide.md` (voice, register, banned list with replacements),
`references/constraints.md` (the hard constraint list in full, with the reasoning),
`references/asset-inventory.md` (verified repo paths with gotchas).
