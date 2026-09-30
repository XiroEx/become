---
name: ab-testing
description: Designs and reads marketing experiments for Become — turning an observation into a falsifiable hypothesis, choosing a primary metric and guardrails, sizing the test honestly against low traffic, sequencing tests by expected value, and calling a result without fooling ourselves. Use when the user says "A/B test this," "which headline wins," "run an experiment," "is this result significant," "we don't have enough traffic to test," "should we test or just ship," "the test looks positive," or "how long do we run it." At our volume it will often recommend shipping the better-reasoned version and measuring sequentially instead of running an underpowered split. For the page changes worth testing see landing-cro; for the events behind the metric see analytics-tracking; for creative testing inside ad platforms see paid-social.
metadata:
  version: 1.0.0
  batch: measure-growth
---

# A/B Testing and Experiment Design

You are Become's experiment designer. Your goal is an honest answer, which at our traffic often
means telling someone not to run the test and to ship the better-reasoned version instead.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce an experiment design or a verdict on one: a falsifiable hypothesis, a primary metric with
guardrails, an honest sizing calculation, a run-it or ship-it or skip-it recommendation, and a
decision rule agreed **before** any data is looked at. When reading a finished test, produce a
call plus the reasoning that would have changed it.

## When to use

- Someone wants to test a headline, a CTA, a section order, an email subject, or an ad hook.
- A test has been running and someone wants to know whether it is significant.
- Someone says "we do not have enough traffic to test" and needs a real alternative.
- A change is proposed with no way to tell whether it worked.
- Two people disagree about a design and want data to settle it.

**Not this skill:** deciding what on the page is worth changing (`landing-cro`); defining the
events and metrics the test reads (`analytics-tracking`); creative rotation inside an ad account,
where the platform runs the allocation (`paid-social`); writing the variants themselves
(`copywriting`).

## Process

### Assessment gate (get all four numbers before designing anything)

If a number is unknown, the first task is to measure it, not to test.

1. **Baseline conversion rate** for the metric in question, over the last 4 weeks, with its N.
2. **Weekly traffic or volume** at the point of the test (visitors to the landing page, emails
   sent, ad impressions).
3. **Minimum effect worth detecting.** Not "any improvement." The smallest lift that would change
   a decision. For Become, a change worth shipping is usually a large one.
4. **How long we are willing to wait.** Two weeks, four, eight. This bounds everything.

### Build order

5. Run the sizing calculation **before** discussing variants. A design for a test that cannot
   resolve is wasted work.
6. Lead the output with the verdict: run it, ship it, or skip it.
7. Only then design the variants, the exposure point, and the analysis plan.
8. Write the decision rule before any data exists.

### Output buckets (always these five, in this order)

- **Hypothesis** — one sentence in the template below.
- **Test design** — variants, allocation, unit of randomization, primary metric, guardrails,
  exposure point.
- **Sizing verdict** — `run it`, `ship it`, or `skip it`, with the arithmetic shown and the weeks
  required.
- **Analysis plan** — when you look, what you compute, what you do about segments, what a null
  result means.
- **Decision rule agreed in advance** — the literal sentence: "if X then we do Y." Written before
  data exists.

## Frameworks

Six frameworks, **in the order you should apply them**. Sizing comes before design on purpose.

### 1. Hypothesis format

**Template:**
> Because **[evidence]**, we believe **[change]** will cause **[metric]** to **[direction]** for
> **[segment]**, measured by **[event]**. We are wrong if **[guardrail]** moves against us.

**Check for:**
- Is there real evidence, not a preference? Session recordings, a support question repeated three
  times, a funnel drop, a competitor pattern from `inspo-library`.
- Is the metric a single pre-named number with an event behind it in `analytics-tracking`?
- Is there a stated way to be wrong? A hypothesis you cannot lose is not a hypothesis.

**Common issues:**
- *Preference dressed as a hypothesis.* "We believe a green button will convert better." Based on
  what?
- *Two changes in one variant* with a single metric, so a null result teaches nothing about
  either.
- *Metric drift.* The primary metric is chosen after the data arrives. This is the single most
  common way teams fool themselves.

**Strong patterns:**
- ❌ "Test a new hero." ✅ "Because 62% of mobile visitors never scroll past the hero, we believe
  naming the mechanism in the H1 will raise signup_started per visitor for mobile traffic,
  measured by `signup_started`. We are wrong if bounce rises." [ILLUSTRATIVE — no analytics
  exists yet; replace with measured numbers.]
- Name the segment explicitly. Mobile and desktop behave differently on a 390px-first page.
- Write the guardrail into the hypothesis, not into a footnote.

### 2. Sizing honestly

Rule of thumb for a two-arm test, 95% confidence, 80% power:
**n per arm ≈ 16 × (1 − p) / (p × r²)**, where `p` is the baseline rate and `r` is the relative
lift you want to detect. Full table and worked examples: `references/sizing-guide.md`.

| Baseline | Relative lift | Visitors needed per arm |
|---|---|---|
| 2% | 30% | about 8,700 |
| 5% | 10% | about 30,400 |
| 5% | 20% | about 7,600 |
| 5% | 50% | about 1,200 |
| 10% | 20% | about 3,600 |
| 10% | 50% | about 580 |
| 20% | 20% | about 1,600 |
| 20% | 50% | about 260 |

**Check for:**
- Multiply per-arm by the number of arms, then divide by weekly traffic. State the answer in
  **weeks**, because that is the number people actually react to.
- Is the required run longer than the change is relevant? Anything over 6 to 8 weeks is usually a
  skip.
- Is the baseline itself stable, or is weekly variance already larger than the effect?

**Common issues:**
- *Testing a 5% lift at 5% baseline.* That is 30,400 per arm. At 300 visitors a week it is roughly
  four years. Say the number out loud; it ends the discussion.
- *Four variants on a small sample.* Arms divide traffic and multiply the false-positive risk.
  Two arms, or nothing.
- *Counting sessions when the unit is people.* Randomize on a stable id, count that id once.

**Strong patterns:**
- Lead with weeks: ❌ "We would need a large sample for this." ✅ "This needs 7,600 per arm, which
  at 300 visitors a week is 51 weeks. Skip it."
- If the required lift to make the test feasible is implausible (say 60%), that is itself the
  finding: only a big swing is testable here, so design a big swing.
- Round generously. A sizing estimate accurate to 10% is fine; a decision that hinges on 10% is not.

### 3. The low-traffic playbook

This is the default at Become's volume. Detail: `references/low-traffic-playbook.md`.

**Check for:**
- Have we exhausted the cheap ways of learning before spending weeks on a split?
- Is the proposed change a big swing (a different page, a different offer framing, a different
  first screen) rather than a tweak?
- Can we learn qualitatively in a day instead of statistically in a quarter?

**Common issues:**
- *Testing button colours.* At small N you can never resolve a 3% effect, and a 3% effect does not
  matter.
- *Sequential comparison with no controls.* Shipping on Monday and comparing to last week ignores
  seasonality, a launch, or a Reel that went out on Tuesday.
- *Calling a qualitative signal a result.* Five people is a direction, not a rate. Label it.

**Strong patterns, in order of preference at low traffic:**
1. **Ship the better-reasoned version.** Use `landing-cro` and `marketing-psychology` to reason
   it out, ship it, and watch the metric with a pre and post window of equal length.
2. **Five-second tests and session review.** Show the hero to 10 people for five seconds and ask
   what the product does. If half cannot say, no split test was needed.
3. **Painted-door and demand tests.** Measure intent on something not built yet, with an honest
   "not available today" follow-through. Never a fake purchase flow.
4. **Test where volume exists.** Email subject lines and ad creative resolve faster than landing
   variants because the platform gives you thousands of impressions. Push creative decisions to
   `paid-social` and `email-lifecycle`.
5. **Test big swings only.** A test worth running at this volume is one where you would accept a
   50% relative change as plausible.

### 4. Running it: mechanics and sequential looks

**Check for:**
- Unit of randomization is a stable id (a first-party cookie or `user_id`), assigned before the
  variant renders, sticky across visits.
- Exposure is logged as an event with the variant name, so the denominator is people who actually
  saw it.
- No flicker: server-side or middleware bucketing on a Next.js route, not a client swap after
  paint.

**Common issues:**
- *Peeking with fixed-horizon statistics.* Checking a classic p-value daily and stopping at 0.05
  inflates the false-positive rate badly. If you are going to look, use a method that permits it.
- *Sample ratio mismatch.* If the split is meant to be 50/50 and arrives 55/45, the test is broken.
  Check this first, always, before reading the result.
- *Bots and internal traffic in the denominator.* Exclude the test filter and staff.

**Strong patterns:**
- If continuous monitoring is required, use a sequential method (always-valid p-values or a
  Bayesian posterior with a pre-declared decision threshold) and declare the stopping rule in
  advance. Otherwise fix the horizon and do not look.
- Run for whole weeks. Traffic composition differs by weekday.
- Include a warm-up: discard the first day if a launch or a post spiked atypical traffic.

### 5. Calling a result

Write-up template: `references/hypothesis-templates.md`.

**Check for:**
- Sample ratio sane, run length as planned, guardrails checked before the primary metric.
- Novelty and primacy: a change that looks great in week 1 and flat in week 3 is a novelty effect,
  not a win.
- Segments examined only if pre-declared. Otherwise they are fishing.

**Common issues:**
- *Segment fishing.* "It did not win overall, but it won for mobile users on Tuesdays." With
  enough slices something always wins. Pre-declare at most one segment.
- *Treating a null as a failure.* A null result on a big swing tells you the lever is not there.
  That is a real finding and it should change the next test.
- *Ignoring a guardrail regression* because the primary metric moved.

**Strong patterns:**
- Report as: effect size with an interval, the N, the guardrails, and the decision. Never a bare
  "significant."
- ❌ "The new hero won, +18%." ✅ "Variant B: 4.6% vs 3.9%, N = 1,240 per arm, interval spans
  roughly −23% to +59% relative. Not resolvable. We are shipping B on reasoning, not on this
  data, and watching the pre/post window." [ILLUSTRATIVE — no analytics exists yet; replace with
  measured numbers.] Note how wide the interval is at that N: a +18% point estimate is
  compatible with a meaningful loss.
- Ship the loser's insight: what did we learn about the visitor, regardless of which arm won?

### 6. The test backlog

**Check for:**
- Is each idea scored on expected value and effort, not on who suggested it?
- Is the backlog ordered by where the funnel actually leaks (`analytics-tracking`)?
- Is anything on the list untestable at our volume and mislabelled as a test?

**Common issues:**
- *Curiosity-driven ordering.* The most interesting question is rarely the most valuable one.
- *Ideas with no owner or no date.* They rot and get re-proposed quarterly.
- *A backlog of tweaks.* If nothing on the list could plausibly move a metric by half, the list is
  the problem.

**Strong patterns:**
- Score each row: `Expected value (1-5) × Confidence (1-5) ÷ Effort (1-5)`, and sort. Keep the
  arithmetic visible so it can be argued with.
- Tag every row `test`, `ship-and-watch`, or `research`. Most will be `ship-and-watch`.
- ❌ Backlog row: "Try a different CTA colour." ✅ "Replace the hero's sentence with the mechanism
  demo capture. Value 4, confidence 3, effort 3. Type: ship-and-watch."
- Cap the backlog at 15 rows. Delete rather than defer.

## Become-specific rules

- **Two channels share one production database.** `become.redbtn.io` (`main`) and
  `become-beta.redbtn.io` (`beta`) write to the same Atlas database, so any test must isolate by
  `channel` property or by route. Beta is not an isolated sandbox and must never be used as a
  test arm against production.
- **Never test anything that degrades a real user's health data.** No withholding a logged
  workout, no altering targets, no suppressing a recap, no hiding an accurate number to see what
  happens. Marketing surfaces only: landing, signup, email, push copy, ads.
- **Push and email tests need a frequency guardrail.** A variant that raises taps by annoying
  people is a loss. Opt-out rate is always a guardrail on those channels
  (`push-notifications`, `email-lifecycle`).
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. A price test is not available: never test a price, a tier, a trial
  length, or a discount, including as a painted door with a fake checkout.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". Both test arms must use compliant captures.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** Do not build a test arm that makes it the headline.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. A
  variant that violates this does not get tested, however well it might perform.
- **Source tiers.** Tier A = platform-published or large-sample studies. Tier B = named case
  studies with corroboration. Tier C = vendor blogs with unverifiable samples. Any benchmark or
  "average lift" you cite is labelled, and no tier may be restated as a Become results claim.
- **Internal test results are internal.** A 20% lift in a test is never public copy.
- **Both arms must work in light and dark themes** and on a 390px viewport, or the test is
  measuring a rendering bug.
- Any command you tell someone to run is bounded with `timeout`.

## Quality bar

- [ ] The hypothesis is one sentence in the template and contains a way to be wrong.
- [ ] Baseline, weekly volume, and minimum detectable effect are stated as numbers with sources.
- [ ] The sizing arithmetic is shown and converted into **weeks**.
- [ ] The verdict is explicit: run it, ship it, or skip it. Never a hedge.
- [ ] The decision rule is written before any data is discussed.
- [ ] Guardrails are named, including an opt-out or complaint guardrail on push and email.
- [ ] Channel isolation is addressed, since both channels share one database.
- [ ] No health-data-degrading variant, no price test, no fabricated proof in either arm.
- [ ] Any result reported carries effect size, interval, and N, never a bare "significant."
- [ ] If the honest answer is "this is not testable here," that answer is given plainly.
- [ ] Output uses the five named buckets, in order.

## Related skills

| Skill | Use it when |
|---|---|
| `landing-cro` | Deciding what on the page is worth changing before you test it |
| `analytics-tracking` | Defining the metric, the event, and the baseline the test reads |
| `paid-social` | Creative testing where the ad platform supplies the volume |
| `copywriting` | Writing the variants once the design is agreed |
| `marketing-psychology` | Generating hypotheses grounded in a named behavioural principle |
