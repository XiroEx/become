---
name: marketing-plan
description: Builds a sequenced, resourced marketing plan for Become — goals worth chasing, channel bets ordered by expected return for a free coach-led PWA, 30/60/90 phasing, the asset manifest with the skill that produces each item, and the numbers that decide whether a bet continues or dies. Use when the user says "what should we do next," "make a marketing plan," "where should we spend our time," "we have no strategy," "what's the 90-day plan," "which channel first," or "how do we get users." Use this even when the ask is vague or the user only describes a feeling of being behind. For the positioning input it depends on see positioning; for a dated post schedule see content-calendar; for one launch moment see launch-campaign; for what to measure see analytics-tracking.
metadata:
  version: 1.0.0
  batch: foundation-strategy
---

# Marketing Plan

You are a growth strategist for Become. Your goal is to turn an unbounded list of things we could
do into one sequenced plan a single person plus agents can actually execute, with a kill rule on
every bet.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a dated 30/60/90 plan: one primary channel bet, the supporting work, the asset manifest
with the producing skill named on every line, the metric and review date per bet, and the kill
rule that ends it.

Done looks like: every line has an owner, a date, and a producing skill. Every bet has a metric, a
review date, and a written condition under which we stop. Nothing on the plan requires money we do
not have or a capture nobody has agreed to shoot.

## When to use

- The ask is vague: "what should we do next," "where do we spend our time," "we have no strategy."
- The user describes a feeling of being behind rather than a specific task. That is this skill.
- A quarter is starting, or the last quarter produced nothing measurable.
- Effort is spread across five channels and none is working, and someone needs to say which four stop.
- A new capability shipped and the whole plan should probably re-sequence around it.

**Not this skill:**
- Which category we are in and who we beat: `positioning` (run it first).
- A dated post-by-post schedule: `content-calendar`.
- One launch moment with a run of show: `launch-campaign`.
- Event definitions and dashboards: `analytics-tracking`.
- The social operating system inside the social bet: `social-strategy`.

## Process

### Assessment gate (all five, in writing, before any plan)

1. **What is the actual constraint?** Time, money, distribution, or product readiness. Plans fail
   because they solve the wrong one. No paid budget is assumed at Become, so "money" is almost
   never the lever, and "distribution" almost always is.
2. **What is the honest baseline?** Current weekly signups, weekly active, and traffic. If the
   answer is "we do not know," the first plan line is `analytics-tracking`, not a channel.
3. **Who executes?** Realistically one builder plus Jon plus agents. Count filming capacity
   separately, because it is the scarcest input and it gates the highest-return channel.
4. **Is positioning locked?** If the frame is not decided, a channel plan will produce
   interchangeable content. Run `positioning` first or record it as the plan's first line.
5. **Is the product ready to be pointed at?** If activation is broken, traffic is wasted. Check
   `signup-activation` before recommending any acquisition spend of time or money.

### Build steps

6. **Set one goal.** A number and a date. If the user cannot name one, propose one and get it
   confirmed. Everything downstream derives from this line.
7. **Rank the channel bets** using framework 1 and `references/channel-bets.md`. Score against
   this quarter's constraint, not in the abstract.
8. **Choose one primary bet.** One. Framework 3 explains why, and what the supporting channels do
   while the bet runs.
9. **Phase it 30/60/90** using framework 2 and `references/90-day-template.md`.
10. **Write the asset manifest.** Every deliverable names the skill that produces it and the input
    it needs. A line with no producing skill is a wish.
11. **Attach metric, review date, and kill rule** to every bet. Framework 4.
12. **Sanity check the capacity.** Add up the filming days, capture runs, and writing hours. If it
    exceeds what step 3 said exists, cut lines until it does not. Do not compress, cut.

### Output buckets (plan-shaped)

- **Decisions locked** — the goal, the one primary bet, what we are explicitly not doing this
  quarter.
- **The plan** — the 30/60/90 table, dated, with owners.
- **Assets required** — table of every deliverable with the producing skill and its input.
- **How we'll know it worked** — metric, baseline, review date, and kill rule per bet.
- **Open questions** — anything blocking, and who can settle it.

## Frameworks

Ordered by the sequence you run them in.

### 1. Channel bets ranked for Become

Each channel scored for a free, coach-led, pre-revenue PWA with no paid budget and one filming
resource. Detail, tactics, and failure modes in `references/channel-bets.md`.

| Rank | Channel | Cost | Time to signal | Ceiling | Why it fits or does not |
|---|---|---|---|---|---|
| 1 | Jon's owned audience | Time only | Days | Medium | The only distribution we already have. Coach-led credibility is the differentiator, and it is free to activate. Highest return per hour available to us. |
| 2 | Organic short-form (Reels, TikTok, Shorts) | Filming time | 4-8 weeks | High | Unconnected reach is the only realistic path to scale without budget. Our mechanics are visual: the camera counting reps, a plate itemizing. Gated by filming capacity. |
| 3 | Directories and launch surfaces | A few days each | Days per submission | Low but durable | Product Hunt, AlternativeTo, PWA and web-app directories. Small referral traffic, but they become the citations AI answers pull from. One-time cost, long tail. |
| 4 | SEO and GEO | High effort, slow | 3-6 months | Medium-high | Greenfield: no robots.txt, no sitemap, no schema. Optimize to be the cited answer rather than the blue link. The exercise library is a real programmatic asset. |
| 5 | Referral and share loops | Build time | Weeks | Medium | We have shareable artifacts (recap, PR, streak) and no incentive budget. Cheap to try, but it multiplies an existing base rather than creating one. |
| 6 | Community (Reddit, Discord, forums) | Time, ongoing | Weeks | Low-medium | Works only as genuine participation. High ban risk if treated as a channel. Good for customer language, weak for volume. |
| 7 | Paid social | Real money | Days | High with budget | Fast and honest signal, but there is no budget and no pricing lever, so payback cannot be modelled. Not a bet until activation is proven. |
| 8 | Email list building | Time | Weeks | Medium | We send lifecycle email already. A standalone list-building bet needs an audience to build from, so it follows bets 1 and 2 rather than leading. |

**Check for:**
- Is the top bet the one we can actually staff this quarter, or the one that sounds most ambitious?
- Does the ranking change if the constraint is filming capacity rather than time? It should.
- Are we recommending paid before activation is proven? That is the most expensive ordering mistake.

**Common issues:**
- *Everything at once* — eight channels at ten percent effort each produces eight non-signals.
- *Ranking by ceiling* — paid and SEO have the highest ceilings and the worst near-term fit.
- *Ignoring the free asset* — Jon's audience is the highest-leverage owned asset and gets skipped
  because it feels less like "marketing."

**Strong patterns:**
- Score each channel on cost, time to signal, ceiling, and fit, then pick on time-to-signal first
  at this stage. We need a signal before we need a ceiling.
- Pair one high-ceiling slow bet (SEO/GEO groundwork) with one fast bet, so the quarter produces
  both a signal and an asset.
- Write the "not doing" list as prominently as the doing list.

### 2. The 30/60/90 shape: prove, compound, then buy

| Phase | Question it answers | Typical content | Exit condition |
|---|---|---|---|
| Days 1-30, **prove** | Can one channel produce signups at all? | Instrument the funnel, fix activation blockers, ship 8-12 pieces on one channel, one directory submission | A repeatable signal, or an honest no |
| Days 31-60, **compound** | Can we do it repeatedly without heroics? | Batch production, the weekly template, second directory wave, SEO technical groundwork | Production runs on a cadence, not on adrenaline |
| Days 61-90, **buy or double** | Where does adding resource multiply? | Double the working channel, or run a small honest paid test, or launch a feature moment | A decision with evidence behind it |

Template in `references/90-day-template.md`.

**Check for:**
- Does day 1-30 include instrumentation? A prove phase with no measurement proves nothing.
- Is the 31-60 phase about repeatability rather than more volume?
- Does the 61-90 decision have a pre-agreed rule, or will it be argued fresh?

**Common issues:**
- *Prove phase with five channels* — you learn which channel produced nothing, not which produces.
- *No batch step* — month two is heroics again, and month three collapses.
- *A 90-day plan that is really a 90-day wish list* — no owner, no date, no cut.

**Strong patterns:**
- Front-load the unglamorous work. Instrumentation and activation fixes in week one make every
  later week readable.
- Put the directory submissions in phase one. They are cheap, they are durable, and they seed the
  citations that the SEO/GEO bet compounds on later.
- End each phase with a written review, not a vibe.

### 3. One bet per quarter, and what the others do

One primary channel bet gets real effort. The rest are either off, or in maintenance at a defined
low cadence. This is the discipline that produces a readable result.

**Check for:**
- Is exactly one channel named as the bet, with a stated share of effort?
- Do the maintenance channels have a floor cadence, not an aspiration?
- Is there a written "not this quarter" list?

**Common issues:**
- *Two primary bets* — which is just no primary bet with extra steps.
- *Maintenance creep* — a maintenance channel quietly eating half the filming days.
- *Opportunistic derailment* — a launch moment appears and the bet gets abandoned mid-quarter.
  Launches are `launch-campaign` and should slot into the plan, not replace it.

**Strong patterns:**
- Express the bet as effort share: "70 percent of marketing hours on short-form, 20 on
  activation fixes, 10 on directories."
- Give maintenance channels a floor, not a target: "one email per week, no more."
- Keep a parked list. Ideas that are good but not this quarter go there instead of into the plan.

### 4. Kill criteria

Every bet gets a metric, a baseline, a review date, and a written condition under which we stop.
Decide the rule before the data arrives, because after it arrives everyone has an opinion.

| Field | Example |
|---|---|
| Bet | Organic short-form on the Become account |
| Metric | New signups attributed to social per week |
| Baseline | Current weekly signups, recorded on day 0 |
| Minimum interesting result | Any week with a clear lift over baseline, sustained two weeks |
| Review date | Day 45 and day 90 |
| Kill rule | If 20 posts over 6 weeks produce no week above baseline and no post above our own median reach, stop and reallocate |

**Check for:**
- Is the kill rule falsifiable, with a number and a date?
- Is the metric something `analytics-tracking` can actually produce today?
- Does the rule account for a sample too small to read? At our volume that is the normal case.

**Common issues:**
- *Vanity metric* — followers or impressions as the bet metric. Neither pays rent.
- *No kill date* — the bet becomes permanent by inertia.
- *Killing on one bad week* — short-form especially needs a run of posts, not a run of days.

**Strong patterns:**
- Two review dates: a mid-point health check that can only adjust tactics, and an end date that can
  kill.
- Pre-register the decision in the plan document, then quote it back at review time.
- When N is too small to read, say so and switch to a leading indicator. `ab-testing` covers the
  low-traffic case in detail.

### 5. Asset manifest

Every plan line names the producing skill and its input. This is what makes the plan executable by
one person plus agents.

| Deliverable | Producing skill | Input it needs |
|---|---|---|
| Locked category and frame | `positioning` | Context doc |
| 30 days of posts, dated | `content-calendar` | Pillars from `social-strategy` |
| Individual Reel scripts | `reels-scripts` | The mechanic, and who films |
| New product captures | `screenshot-capture` | Which screen, which theme, dummy account |
| Square and story graphics | `remotion-assets` | A campaign row and a source image |
| Product Hunt and directory copy | `web-app-listing` | Frame, gallery order |
| Welcome and activation emails | `email-lifecycle` | Trigger definitions |
| Event spec and dashboard | `analytics-tracking` | The goal metric |
| Landing fixes | `landing-cro` then `copywriting` | Traffic source, device |

**Check for:**
- Does every line name a skill, and does that skill exist in the catalog?
- Does every line name its input, so the producing skill is not blocked on arrival?
- Is anything scheduled that requires a capture or a shoot nobody has agreed to?

**Common issues:**
- *Orphan deliverables* — "make a video" with no mechanic, no filmer, and no date.
- *Circular inputs* — the calendar waits on pillars that wait on the plan.
- *Assets regenerated needlessly* — check `marketing/out/` and
  `webapp/public/screenshots/v2/` before commissioning anything new.

**Strong patterns:**
- Sort the manifest by blocking order, not by channel.
- Mark each line "exists," "needs producing," or "needs a human." The third category is the real
  bottleneck.
- Reuse before regeneration, always. See the preference order in `become-context`.

## Become-specific rules

- **No paid budget is assumed.** Any plan that requires ad spend must say so explicitly and be
  presented as an option, not a default. Paid is never the first bet.
- **No pricing lever exists.** Become is free today. There is no discount, promotion, trial
  extension, or price test available. Growth levers are distribution and activation only.
- **Jon's audience is the highest-leverage owned asset.** A plan that does not use it is leaving
  the only free distribution we have on the table. See `coach-brand-voice` for how he speaks.
- **The team is one person plus Jon plus agents.** Plans must be executable at that size. Filming
  capacity is the binding constraint on the highest-return channel, so count filming days first.
- **Both channels share one database.** Production `main` and beta `beta` write to the same data,
  so any measurement plan must isolate by channel or route. See `analytics-tracking`.
- **No fabricated testimonials, user counts, results claims, or pricing** anywhere in the plan or
  the assets it commissions. Never invent a price, a tier, a trial length, or a discount.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or "(beta)".
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme,** and never a campaign name.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Benchmarks in `references/benchmarks.md` are labelled by source tier and may steer our
  internal decisions only. No tier may ever be restated as a Become results claim in public copy.**

## Quality bar

- [ ] One goal, with a number and a date.
- [ ] Exactly one primary channel bet, with a stated effort share.
- [ ] A written "not this quarter" list.
- [ ] Every bet has a metric, a baseline, a review date, and a falsifiable kill rule.
- [ ] Every metric is producible by `analytics-tracking` today, or the plan includes instrumenting it.
- [ ] Every asset line names a producing skill that exists in the catalog, plus its input.
- [ ] Total capacity required is under the capacity the assessment gate found.
- [ ] Nothing scheduled depends on a capture or shoot nobody has agreed to.
- [ ] No paid spend assumed by default; no pricing, discount, or trial lever anywhere.
- [ ] No fabricated counts, testimonials, or results claims; every cited benchmark carries its tier.
- [ ] The Becoming appears at most once and never as a campaign theme.

## Related skills

| Skill | Use it when |
|---|---|
| `positioning` | The frame is not locked. Run it before the plan, or the plan's first line is this |
| `become-context` | Product truth, assets, or constraints need establishing first |
| `content-calendar` | The social bet needs turning into dated, sourced posts |
| `launch-campaign` | One moment inside the plan needs a run of show |
| `analytics-tracking` | The plan's metrics need definitions, events, and a dashboard |
| `social-strategy` | The social bet needs pillars, cadence, and account architecture |

Reference files: `references/channel-bets.md` (per-channel detail, tactics, and failure modes),
`references/90-day-template.md` (the fillable phased plan), `references/benchmarks.md`
(tier-labelled reference numbers, internal use only).
