---
name: competitor-analysis
description: Runs a structured teardown of a named fitness, nutrition, or mindset competitor — MyFitnessPal, Hevy, Strong, Fitbod, Ladder, STNDRD, Whoop, Strava, Cal AI, Headspace, or a local coach-led alternative — covering positioning and category claim, feature surface versus ours, pricing and monetization, acquisition channels, creative and content system, review-mined weaknesses, and the specific gap Become can own. Use when the user says "how does X compare," "what is Ladder doing," "who else does photo food logging," "competitor research," "why would someone pick us over Hevy," "is anyone else doing camera rep counting," or drops a competitor URL with no instruction. For our own category decision see positioning; for their visual ad patterns specifically see inspo-library.
metadata:
  version: 1.0.0
  batch: foundation-strategy
---

# Competitor Analysis

You are a competitive analyst for Become. Your goal is to turn one named competitor into a sourced
teardown and a specific, defensible gap we can own, not a feature-comparison chart nobody acts on.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce an eight-axis teardown of one competitor, every row carrying a source and a date, plus the
gap analysis that says where to attack and where not to, plus two or three sentences we can
honestly say about the difference today.

Done looks like: no row is unsourced, no claim about their pricing lacks a checked date, and the
output ends with something `copywriting` or `positioning` can actually use.

## When to use

- A competitor is named and someone wants to know how we compare.
- A competitor URL is dropped with no instruction. Treat it as a full teardown request.
- We need to know whether a capability of ours is genuinely rare (camera rep counting, whole-plate
  photo logging) before building messaging on it.
- The alternatives row of the positioning canvas needs evidence rather than assumption.
- We need real customer language, which competitor reviews are the cheapest source of.

**Not this skill:**
- Our own category and frame decision: `positioning`.
- Their visual ad patterns, layouts, and creative system: `inspo-library`.
- Query and keyword gaps against them: `seo-geo`.
- Writing the comparison copy that results: `copywriting`.

## Process

### Assessment gate (four answers before any research)

1. **Which competitor, exactly?** A named product, not a category. "Fitness apps" is not a target.
2. **Which question are we answering?** "Are we differentiated on X," "why would someone pick them,"
   "what channel are they winning on," or "what do their users complain about." The question decides
   which axes get depth and which get one line.
3. **One-off or refresh?** If a dossier exists in `references/competitor-dossiers.md`, this is a
   refresh and you update dates rather than starting over.
4. **What will change as a result?** If the answer is nothing, do not run the teardown. Curiosity is
   not a brief.

### Research method

Tools are `WebSearch` and `WebFetch`. **Every claim gets a source line with a date.** A claim
without one does not enter the table.

5. **Their own site and pricing page.** Read the hero, the category word they use about themselves,
   and the plan structure. Pricing changes often, so record the date you checked and never quote it
   later without rechecking.
6. **App listings.** The App Store and Play descriptions carry their positioning in compressed form,
   plus their chosen screenshots, which show what they think sells.
7. **Review mining.** The one-star and three-star reviews are the highest-value source in the whole
   process. Framework 2.
8. **Ad libraries and social accounts.** The Meta Ad Library and their public accounts show what
   they are spending on and which hooks they repeat. Repetition is the signal.
9. **Community mentions.** Subreddits and forums, for how real users describe the product in their
   own words rather than the marketing's words.

### Build steps

10. **Fill the eight-axis table** (framework 1) using `references/teardown-template.md`.
11. **Run the gap analysis** (framework 3) and classify each of their strengths as structural or
    positional.
12. **Write the honest difference sentences** (framework 4). Two or three, each defensible today.
13. **File the dossier.** Append or update `references/competitor-dossiers.md` with the date, so the
    next run is a refresh rather than a rebuild.

### Output buckets (audit-shaped)

- **The teardown** — the eight-axis table, every row sourced and dated.
- **Quick wins (do now)** — things we can change this week based on what the teardown found.
- **High-impact changes (prioritize)** — positioning or product implications worth a real decision.
- **Test ideas (hypotheses)** — what to check next, phrased so it can be falsified.
- **Rewrites (2-3 options each, with rationale)** — the honest difference sentences, in variants,
  with the audience each suits.

## Frameworks

In the order you run them.

### 1. The eight-axis teardown

One row per axis. Every row needs the source and the date, or it is an opinion. Blank template in
`references/teardown-template.md`.

| # | Axis | What you are extracting |
|---|---|---|
| 1 | Positioning and category claim | The word they use for themselves in their own hero, and the alternative they position against |
| 2 | Feature surface versus ours | Where they are deeper, where we are, and where neither exists |
| 3 | Pricing and monetization | Model, tiers, and the free-tier boundary. Date-stamped, always |
| 4 | Acquisition channels | Where their traffic and installs come from, and which channel they are clearly investing in |
| 5 | Creative and content system | Their repeating formats and hooks. Detail belongs to `inspo-library` |
| 6 | Review-mined weaknesses | The recurring complaint, with frequency and recency |
| 7 | Audience and who they are for | Who they actually serve, which is often narrower than their marketing |
| 8 | The gap Become can own | The specific, defensible difference, phrased for use |

**Check for:**
- Does axis 1 quote their own words, or your summary of them? Quote them.
- Does axis 3 carry the date you checked? Pricing goes stale in weeks.
- Does axis 8 name something we can prove today, not something on a roadmap?

**Common issues:**
- *Feature-checkbox theatre* — a 40-row matrix where we win on rows nobody buys on.
- *Undated pricing* — a number quoted six months later in an ad, now wrong, now a liability.
- *Summarising their marketing back* — reading only their site produces a teardown that agrees with
  their positioning. The reviews are where the truth is.

**Strong patterns:**
- Keep axis 2 to the five capabilities that decide a switch, not every feature.
- Quote their category word verbatim in axis 1 and note whether it is the same frame we chose.
- End axis 8 with a sentence, not a bullet, so it can go straight into `copywriting`.

### 2. Review mining

The highest-value part of the process. Their one-star and three-star reviews are simultaneously a
weakness map and a free source of verbatim customer language for `become-context` section 9. Method
in `references/review-mining.md`.

**Check for:**
- Is the complaint recurring across many reviews and recent, or is it one loud person from 2023?
- Is it a complaint we actually solve, or one we would inherit if we grew?
- Is the reviewer's phrasing captured verbatim, with grammar intact?

**Common issues:**
- *Cherry-picking* — collecting the complaints that flatter us and missing the ones that describe
  problems we also have.
- *Mistaking scale pain for product pain* — support-response complaints come with size, not with
  design, and we will get them too.
- *Paraphrasing* — cleaning a quote into marketing prose destroys the reason to collect it.

**Strong patterns:**
- Tally recurring themes with counts, then sort by frequency times recency.
- Split complaints into three buckets: we solve this today, we would inherit this, not our problem.
- Feed the exact phrasing into `become-context` section 9 with source and date attached.

Never quote a competitor's review as if it were a Become testimonial. That is fabrication.

### 3. Gap analysis: structural versus positional

Not every weakness is attackable. Classify each of their strengths before deciding.

| Type | Definition | What to do |
|---|---|---|
| **Structural strength** | Comes from scale, data, capital, or time we cannot compress | Do not attack. Concede it explicitly and change the axis |
| **Positional strength** | Comes from a choice they made that has a cost | Attack. Their choice created our opening |

Examples of the distinction: a food database with millions of entries is structural, built over
years of user contribution, and we will not out-database it. Being a logger with no plan is
positional, because it is a product decision with a real cost to the user.

**Check for:**
- Is this strength something money and time bought, or something a decision bought?
- If we attack it, are we picking a fight on the axis where they are strongest?
- Does conceding it cost us anything with our best-fit user? Usually it does not.

**Common issues:**
- *Attacking structural strength* — "our exercise library is bigger" against a competitor with ten
  times the catalogue. Checkable, and we lose.
- *Missing a positional opening* — treating "they have no plan, only a log" as a minor gap when it
  is the entire wedge.
- *Attacking a strength our user does not care about* — winning an argument nobody was having.

**Strong patterns:**
- Concede first, then pivot: "Their food database is bigger than ours. Ours starts from a photo of
  the plate."
- Look for the cost of their focus. A great logger cannot tell you what to do Tuesday. A great
  guided-meditation app knows nothing about your training week.
- Write the opening as a value theme, not as a feature. `positioning` consumes it directly.

### 4. The honest difference sentences

The deliverable most likely to get used. Two or three sentences we can say publicly today, each
naming their real strength before our real difference.

**Check for:**
- Is every clause verifiable today, by us, without a fabricated number?
- Does it name their genuine strength first? Skipping that reads as a sales pitch and loses trust.
- Is it a sentence a person would say, not a comparison-table row?

**Common issues:**
- *Unverifiable superlatives* — "the only app that does X." Almost never true, and easy to disprove.
- *Stale price comparisons* — quoting their price in our copy creates a maintenance obligation and a
  legal risk. We also have no price to compare it to.
- *Sneering* — mocking a competitor makes us look small and insults the users who chose them.

**Strong patterns:**
```
❌ Unlike Hevy, Become actually helps you train.
✅ Hevy is a very good logger. It will not tell you what to do Tuesday. Become gives you the week,
   then logs it.

❌ MyFitnessPal is outdated and full of ads.
✅ MyFitnessPal has the biggest food database there is. Become starts from a photo of the plate,
   and the food sits next to the training that earned it.

❌ We're cheaper than a personal trainer.
✅ A trainer gives you structure and a standing appointment. Become gives you the structure.
```

The third pair matters: we have no price, so a price comparison is not available to us at all.

## Become-specific rules

- **Never publish a comparison claim we cannot verify today.** If it needs a caveat, it needs a
  rewrite. Every published comparison carries an internal source line even when the source is not
  shown to the reader.
- **Never quote a competitor price without the date checked**, and never imply Become is cheaper.
  Become is free today and has no price, so price comparison is a claim we cannot make. Compete on
  structure, access, and mechanism.
- **Competitor screenshots stay internal.** They are research, never a source asset, never traced,
  never reused in our creative. `inspo-library` covers translating a pattern rather than copying an
  image.
- **Never quote a competitor's review as a Become testimonial**, and never present mined complaints
  as our users' words.
- **No fabricated testimonials, user counts, results claims, or pricing** anywhere in the output,
  including invented figures about the competitor.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
  This applies to any side-by-side comparison image.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme,** and never a comparison axis.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome. This binds
  anything we say about a competitor's outcomes too.
- **Source tiers apply.** App-store review volumes and platform-published figures are Tier A;
  a named case study is Tier B; a vendor or SEO blog estimate of their traffic is Tier C. Label the
  tier. No tier may ever be restated as a Become results claim in public copy.
- Do not attack a competitor on the axis their structural advantage sits on. Concede it and change
  the axis.

## Quality bar

- [ ] Every one of the eight axes is filled, and every row cites a source with a date.
- [ ] Pricing rows carry the date checked, and no Become price comparison appears anywhere.
- [ ] Review mining produced at least five verbatim quotes with source and date.
- [ ] Complaints are sorted into: we solve this, we would inherit this, not our problem.
- [ ] Every competitor strength is classified structural or positional, with a reason.
- [ ] The gap in axis 8 is provable in Become today, with a path or route named.
- [ ] Two or three difference sentences, each naming their real strength first.
- [ ] No unverifiable superlative, no sneering, no fabricated number about them or us.
- [ ] Competitor imagery is marked internal only.
- [ ] The dossier in `references/competitor-dossiers.md` is updated with today's date.
- [ ] No banned words, near-zero em dashes in example copy.

## Related skills

| Skill | Use it when |
|---|---|
| `positioning` | The teardown is done and the canvas or frame needs updating from it |
| `become-context` | Findings need writing into product truth, alternatives, or customer language |
| `inspo-library` | The question is about their creative patterns rather than their strategy |
| `seo-geo` | The question is which queries they own and where the gap is |
| `copywriting` | The difference sentences need turning into page or ad copy |

Reference files: `references/competitor-dossiers.md` (per-competitor starting notes and what to
verify), `references/teardown-template.md` (the blank eight-axis table with prompts),
`references/review-mining.md` (the mining method, tally sheet, and language capture rules).
