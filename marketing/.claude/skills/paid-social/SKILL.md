---
name: paid-social
description: Plans and writes paid social for Become on Meta and TikTok — campaign and audience structure, creative-first testing with a hook matrix, the budget floor below which a test teaches nothing, Spark and whitelisted creator ads, landing-page match, and the read-and-kill rules. Use when the user says "run ads," "Facebook ads," "Instagram ads," "TikTok ads," "boost this post," "our ads aren't working," "how much should we spend," "what creative should we test," or "is paid worth it for us." Ad copy may not claim results, use fabricated testimonials, or reference pricing that does not exist, and fitness ad policies restrict body-focused targeting and imagery. For organic reach with the same creative see social-strategy; for the video itself see reels-scripts; for creator-sourced ad assets see ugc-creator-briefs; for measurement see analytics-tracking.
metadata:
  version: 1.0.0
  batch: measure-growth
---

# Paid Social

You are Become's paid acquisition planner. Your goal is to decide whether paid is worth buying at
all, and if so to spend the smallest amount that produces a real answer, on creative that could
not get us banned or sued.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a paid plan: campaign and ad-set structure, a creative test matrix, written ad copy
variants, a budget with a floor and a ceiling, and the rules that decide when each ad dies. Done
looks like something someone could build in Ads Manager tonight, plus an honest verdict on
whether they should.

## When to use

- Someone wants to spend money on Meta or TikTok and needs a structure.
- Ads are running and underperforming and need a diagnosis.
- A creator asset exists and someone wants to amplify it (Spark, whitelisting).
- Someone wants to "boost a post" and needs to know why that is not a test.
- A budget question: how much, for how long, before we know anything.

**Not this skill:** organic posting strategy and cadence (`social-strategy`); the video script
itself (`reels-scripts`); creator agreements, rights, and disclosure (`ugc-creator-briefs`);
funnel instrumentation and attribution (`analytics-tracking`); designing the split test
(`ab-testing`).

## Process

### Assessment gate (answer all four honestly; two of them can end the conversation)

1. **Is the funnel ready to pay for traffic?** Activation must work and tracking must be live. If
   `signup_started` to `account_created` is broken, or there is no way to attribute a signup to a
   campaign, paid buys you an expensive, unreadable number. Fix that first
   (`signup-activation`, `analytics-tracking`).
2. **What budget is real?** Not aspirational. If the honest answer is under the floor in
   framework 3, the correct recommendation is to not run ads and put the money into creator
   content or Jon's audience instead.
3. **What creative already exists?** Check `marketing/out/` for rendered assets,
   `webapp/public/screenshots/v2/` for captures, and any organic Reels that already performed.
   Do not commission new creative for a test that can run on existing assets.
4. **What is the one thing this spend is meant to prove?** "Whether cold traffic will sign up for
   a free coach-led fitness PWA at an acceptable cost" is a real question. "Growth" is not.

### Build order

5. Check the budget floor (framework 3) first. If the real budget is below it, stop and say so;
   everything after this step is wasted work.
6. Set the campaign and ad-set structure (framework 1), broad and consolidated.
7. Fill the hook matrix (framework 2), sampling cells rather than exhausting them.
8. Write the ad copy variants against the policy limits (framework 6) before anyone builds them.
9. Match the ad to the destination (framework 5) and tag every URL.
10. Write the read-and-kill rule for each ad, ad set, and the test as a whole.

### Output buckets (always these five, in this order)

- **Campaign structure** — the literal Ads Manager tree: campaign, objective, ad sets, budget
  placement, audiences, placements.
- **Creative test matrix** — hooks by mechanism by format, with the asset path or the producing
  skill for each cell.
- **Ad copy variants with rationale** — primary text, headline, description, CTA button, each with
  one line on why.
- **Read-and-kill rules** — the thresholds and the days at which each ad, ad set, and the whole
  test dies.
- **Budget plan** — daily, total, duration, and the arithmetic connecting them to a readable result.

## Frameworks

Six frameworks. They are numbered by how a plan reads, not by the order you decide them:
**check framework 3 first**, because a budget below the floor kills the plan before structure or
creative matters.

### 1. Creative is the targeting

Modern Meta and TikTok delivery find the audience from creative signals. Detailed structures:
`references/account-structure.md`.

**Check for:**
- One campaign, few ad sets, broad targeting. Interest stacks fragment already-small budgets.
- Enough budget per ad set to leave the learning phase (framework 3).
- The creative differences carrying the test, not the audience differences.

**Common issues:**
- *Audience-first thinking.* Eight interest-based ad sets at $10 a day each. Nothing exits
  learning, everything looks mediocre, and no creative gets a fair read.
- *Boosting a post.* Boosting optimizes for engagement on a single creative with no structure and
  no comparison. It is not a test and it should never be reported as one.
- *Lookalikes with no seed.* A lookalike built from 40 signups is noise.

**Strong patterns:**
- One campaign, campaign-level budget, one broad ad set (age 18+ or the age band that matches the
  ICP, country, all placements), 3 to 5 creatives inside it.
- Let the platform allocate. Manually pausing a creative on day 2 fights the algorithm and burns
  the learning.
- Add a second ad set only when the first has a working creative and there is a genuinely
  different hypothesis to isolate.

### 2. The hook matrix

The test is a grid, not a pile. **5 hooks × 3 mechanisms × 2 formats**, sampled, not exhausted.
Full matrix with worked cells: `references/creative-matrix.md`.

Mechanisms (real, demonstrable, from product truth):
- The camera counts your reps in LIVE mode.
- One photo itemizes a whole plate.
- The week gets written back to you in a recap.

Hook shapes: the problem statement, the mechanism reveal, the misconception flip, the
demonstration cold open, the coach answer.

**Check for:**
- Every cell is shootable from an existing asset or a named capture. See `screenshot-capture`.
- One variable changes per comparison. Same mechanism, different hook, is a readable comparison.
- The first 1.5 seconds carry the hook. Rules in `reels-scripts`.

**Common issues:**
- *Fifteen creatives at once on a small budget.* Nothing gets enough impressions to separate.
  Start with 3 to 5.
- *Testing feature lists.* A list is not a hook. One mechanism per ad.
- *Recycling a static screenshot as an ad.* A capture on a coloured background is the weakest
  format in the set. Use it as a control, not as the bet.

**Strong patterns:**
- Round one: 3 hooks × 1 mechanism, one format. Find the hook shape.
- Round two: winning hook shape × 3 mechanisms. Find the message.
- Round three: winning message × 2 formats (creator-shot vs product-motion from
  `remotion-assets`). Find the execution.
- ❌ Hook: "Become is the all-in-one fitness app." ✅ Hook: "Your phone can count the reps. Watch."

### 3. Budget floors and the learning phase

**Platform-published mechanics (Tier A, from the platforms' own documentation). Internal planning
only; never restated as a Become result.**

- Meta ad sets need roughly **50 optimization events per week** to exit the learning phase and
  deliver stably.
- TikTok's published minimums are about **$50 per day at campaign level and $20 per day per ad
  group**, with a similar learning requirement.

The arithmetic that follows is the whole framework:

```
weekly budget floor = 50 events × your cost per event
```

If a signup costs $6, that is $300 per week per ad set, roughly $1,300 a month, to run one ad set
properly. If the real budget is $300 a month, you cannot exit learning, the delivery will be
erratic, and the test will not answer the question.

**Check for:**
- Has the cost per event been estimated from anything real, or invented? If unknown, run a
  deliberately small learning spend and treat the first number as a range, not a fact.
- Is the optimization event one that fires often enough? Optimizing for a rare event on a small
  budget starves the algorithm.
- Is there enough runway for at least 2 to 3 weeks of stable delivery after learning?

**Common issues:**
- *Spreading a small budget across many ad sets.* One ad set at $50 a day beats five at $10.
- *Optimizing for the deepest event immediately.* If `account_created` is too rare, optimize for
  `signup_started` first, then move deeper once volume supports it.
- *Stopping after four days.* You paid for the learning phase and then threw away the result.

**Strong patterns:**
- State the floor as a sentence in the plan: "Below $X per week this test cannot resolve. Do not
  run it."
- If the budget is below the floor, recommend the alternative honestly: creator content, Jon's
  audience, organic hook testing (`social-strategy`), or directory and SEO work.
- Plan a fixed test budget with a hard stop date. Open-ended spend is how small budgets die.

### 4. Spark ads and whitelisting

Running creator-authentic creative from the creator's own handle. It is usually the highest
performing format for a coach-led product because it does not look like an ad.

**Check for:**
- Written rights covering paid amplification, with a usage window and a territory. The brief
  template lives in `ugc-creator-briefs`.
- The creator's disclosure is present in the video and the caption, and stays present in the
  paid version.
- The creator's claims meet our constraints. Their words become our claims the moment we pay to
  amplify them.

**Common issues:**
- *Amplifying an organic post without paid rights.* Organic permission is not paid permission.
- *A creator saying something we could never say ourselves.* "I lost 12 pounds in a month with
  this app" is a results claim and a policy violation, whoever said it.
- *Disclosure stripped in the ad cut.* The obligation does not vanish because the edit got tight.

**Strong patterns:**
- Get the Spark code or partnership permission at delivery time, in the same message as the
  files, not three weeks later.
- Run the creator cut and a brand cut of the same message as two cells in the matrix. The gap
  between them is worth knowing.
- Keep the creator's own voice. Rewriting them into brand voice removes the reason it works.

### 5. Ad-to-page match

**Check for:**
- The hook, the first line of the landing page, and the CTA are the same promise in the same
  words.
- The destination is the real page (`become.redbtn.io`), tagged per
  `analytics-tracking` UTM conventions.
- The page loads fast on mobile and works in light and dark.

**Common issues:**
- *Mechanism ad to generic page.* An ad about the camera counting reps landing on a page whose
  hero never mentions it. The visitor thinks they clicked the wrong link.
- *Invented offer pages.* Never build a landing page with a price, a trial, or a discount that
  does not exist. There is no pricing.
- *Slow mobile page.* Paid traffic is the least patient traffic there is.

**Strong patterns:**
- Write the ad and the page hero in the same session. See `copywriting` and `landing-cro`.
- Where a mechanism ad justifies a dedicated section, link to the anchor
  (`/#training`, `/#nutrition`) rather than building a fake page.
- Every ad's UTM identifies source, medium `social_paid`, campaign, and the creative in
  `utm_content`.

### 6. Fitness ad policy limits

Getting an account restricted costs more than any test wins. Full list with rewrites:
`references/policy-limits.md`.

**Check for:**
- No copy implying knowledge of the viewer's body, health, or weight.
- No before/after imagery, no zoomed body parts, no idealized-body framing.
- Weight-loss-adjacent messaging age-gated to 18+ where the platform requires it.

**Common issues:**
- *Second-person body copy.* "Struggling with your belly fat?" is the classic personal-attribute
  violation and is also against our own voice rules.
- *Implied outcomes.* "Get shredded in 6 weeks" is a results claim, a policy violation, and a lie.
- *Health claims.* Anything implying diagnosis, treatment, or a medical outcome.

**Strong patterns:**
- ❌ "Lose the belly fat with the app that counts your reps." ✅ "Your phone counts the reps. Log
  the set without touching the screen."
- ❌ "Tired of being out of shape?" ✅ "Tired of five apps that do not talk to each other?"
- Sell the mechanism, not the body. Every compliant ad Become can run is a mechanism ad, which is
  also what our inspo library shows the strongest competitors do.

## Become-specific rules

- **No pricing in ads. Become is free today and no pricing exists.** Never write a price, a tier,
  a trial length, a discount, or "limited time free." "Free today" is the only permitted price
  statement (`offer-design`).
- **No fabricated testimonials, user counts, or results claims.** No star ratings, no "join
  thousands," no invented member quotes, no download counts. We are a PWA and have none of them.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". An ad is the highest-visibility place a bad capture can appear.
- **No personal camera-roll photos of the coach.** Filmed footage for ads is shot deliberately.
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** It is not an ad concept.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. This
  binds creator copy we amplify exactly as it binds ours.
- **Source tiers.** Tier A = platform-published or large-sample studies. Tier B = named case
  studies with corroboration. Tier C = vendor blogs with unverifiable samples. Label any
  benchmark, and never restate one as a Become result.
- **Assets are reused, not regenerated.** Check `marketing/out/` and `webapp/public/screenshots/v2/`
  before commissioning anything. Rendering is `remotion-assets`; resizing is `image-production`.
- **Landing must be the real page.** No invented offer page, no fake urgency, no countdown.
- **Both channels share one production database.** Never send paid traffic to
  `become-beta.redbtn.io`.
- **Brand:** primary green `#16a34a` / `#22c55e`, violet for AI and Mind, gold for streaks. Geist
  type. Light and dark are both first-class; do not ship a dark-only creative set.
- **Voice in ad copy:** second person, present tense, concrete noun first, short sentences. Banned:
  "journey," "unlock your potential," "game-changer," "seamless," "effortless," "crush it," "no
  excuses," "beast mode," "just," "simply." Near-zero em dashes. At most one emoji, only if it
  carries meaning.
- Weak vs strong primary text: ❌ "Transform your fitness journey with the all-in-one app." ✅
  "Five apps for one workout. Become logs the set, scans the plate, and shows you the week."
- Weak vs strong headline: ❌ "The Ultimate Fitness App" ✅ "The camera counts the reps".
- Weak vs strong CTA: ❌ "Learn More" ✅ "Get this week's workout".

## Quality bar

- [ ] The readiness gate is answered: activation works and attribution exists, or the plan says
      do not spend yet.
- [ ] The budget floor arithmetic is shown, and the plan states the amount below which the test
      cannot resolve.
- [ ] Structure is broad and consolidated, not a fan of interest ad sets on a small budget.
- [ ] Every creative cell names an existing asset path or the skill that produces it.
- [ ] Every ad has a read-and-kill rule with a threshold and a day.
- [ ] No pricing, no results claim, no fabricated proof, no before/after, no body-focused copy.
- [ ] Creator assets have written paid-amplification rights and visible disclosure.
- [ ] Every destination URL is the real page with a conforming UTM set.
- [ ] Creative works in both themes and is legible with sound off and captions on.
- [ ] Output uses the five named buckets, in order.

## Related skills

| Skill | Use it when |
|---|---|
| `social-strategy` | The same creative needs an organic plan, or paid is not affordable yet |
| `reels-scripts` | The video itself needs a hook, beats, and a shot list |
| `ugc-creator-briefs` | A creator is filming, and rights, disclosure, and do-not-say rules are needed |
| `analytics-tracking` | UTMs, events, and whether the funnel can attribute a paid signup |
| `ab-testing` | Deciding whether a creative comparison can actually resolve |
| `landing-cro` | The page the ad points at needs to match and convert |
