# Sizing Guide

How many people a test needs, why the answer is usually "more than we have," and what to do
about it.

---

## The formula

For a two-arm test of a proportion, 95% confidence (two-sided), 80% power:

```
n per arm ≈ 16 × p × (1 − p) / δ²
```

where `p` is the baseline rate and `δ` is the **absolute** difference you want to detect. If you
think in relative lift `r` (0.20 for +20%), then `δ = p × r` and the formula simplifies to:

```
n per arm ≈ 16 × (1 − p) / (p × r²)
```

The 16 comes from `2 × (1.96 + 0.84)²`, rounded. It is close enough for a decision. Nothing here
hinges on the third digit.

## The table

Visitors (or emails, or impressions) needed **per arm**.

| Baseline p | +10% rel | +20% rel | +30% rel | +50% rel | +100% rel |
|---|---|---|---|---|---|
| 1% | 158,400 | 39,600 | 17,600 | 6,340 | 1,590 |
| 2% | 78,400 | 19,600 | 8,710 | 3,140 | 780 |
| 3% | 51,700 | 12,900 | 5,750 | 2,070 | 520 |
| 5% | 30,400 | 7,600 | 3,380 | 1,220 | 300 |
| 10% | 14,400 | 3,600 | 1,600 | 580 | 144 |
| 20% | 6,400 | 1,600 | 710 | 260 | 64 |
| 30% | 3,730 | 930 | 415 | 150 | 37 |
| 50% | 1,600 | 400 | 178 | 64 | 16 |

Read it as a wall, not a target. At a 5% baseline, detecting the kind of tweak most people want to
test (+10%) costs 60,800 visitors total.

## Converting to weeks

```
weeks = (n per arm × number of arms) / weekly volume at the exposure point
```

The exposure point matters. If the test is on the hero, the denominator is landing-page visitors.
If it is on the verify page, it is far smaller. Use the real number from `analytics-tracking`,
not the site total.

Worked examples at plausible Become volumes:

| Surface | Weekly volume | Baseline | Target lift | Weeks |
|---|---|---|---|---|
| Landing hero | 350 visitors | 4% | +20% | about 54 |
| Landing hero | 350 visitors | 4% | +50% | about 9 |
| Landing hero | 2,000 visitors (post-launch) | 4% | +50% | about 2 |
| Magic-link email subject | 120 sends | 60% click | +10% | about 18 |
| Ad creative on Meta | 40,000 impressions | 1.2% CTR | +30% | about 1 |

Two things fall out of this table immediately:

1. **Landing tests are only viable for big swings, or after a traffic event.** Plan landing tests
   for the weeks after a launch or a January push, when volume exists.
2. **Ad creative resolves fastest** because the platform buys the sample. Push creative learning
   into `paid-social` and bring the winning angle back to the landing page as a reasoned ship.

## More than two arms

Traffic divides by the number of arms and the false-positive risk compounds. Three arms at a 5%
baseline chasing +20% is 22,800 visitors. Unless the platform is doing the allocation (ad
accounts do), keep it to two.

If you must compare several creatives, do it where the volume is: an ad account, or an email list
split, not a landing page.

## Continuous metrics

For an average rather than a rate (sessions per user, minutes per session), use:

```
n per arm ≈ 16 × σ² / δ²
```

`σ` is the standard deviation of the metric, which for engagement counts is usually large relative
to the mean. This makes continuous metrics **harder** to power, not easier. Prefer a binary
version of the question ("did they log a session this week, yes or no") when you can.

## Sequential and Bayesian alternatives

Fixed-horizon statistics assume you look once, at the end. Looking daily and stopping at the first
p < 0.05 can push the real false-positive rate several times above the nominal 5%.

Two legitimate ways to look continuously:

**Always-valid p-values / mSPRT.** Designed for continuous monitoring. You may stop any time the
boundary is crossed. Costs perhaps 20 to 40% more sample than a fixed-horizon test for the same
power, which is a bargain against the cost of being wrong. **Tier C** on that overhead figure: it
is the range quoted in experimentation-platform vendor write-ups, and the true cost depends on the
mixture variance you choose. Treat it as "meaningfully more, not double."

**Bayesian posterior with a pre-declared threshold.** Stop when `P(B > A) > 0.95` **and** the
expected loss from choosing wrong is below a stated threshold. The second condition is the one
people skip, and it is the one that prevents shipping a coin flip.

Either way the rule is the same: **declare the stopping rule before the test starts.** A method
chosen after seeing the data is not a method.

## Checks before you read any result

1. **Sample ratio mismatch.** Test it, do not eyeball it. Run a chi-square goodness-of-fit test
   on the observed counts against the intended split and investigate if p < 0.001. "Within about a
   point" is not a rule: at 1,240 per arm, one percentage point is roughly one standard deviation
   of the split, so a 51/49 result is unremarkable while at 40,000 per arm it would be alarming.
   A real SRM means the assignment or logging is broken and the result is void, not adjustable.
2. **Whole weeks.** Weekday composition differs. A 10-day test overweights one weekend.
3. **Exclusions applied.** Test accounts (`@become.test`), staff, and bots out of both arms.
4. **Guardrails first.** Read the guardrails before the primary metric so a regression is not
   rationalized after a win is seen.
5. **Novelty window.** Compare week 1 against week 3. A lift that decays is a novelty effect.

## When the answer is "never"

Say it plainly, with the arithmetic:

> At 350 landing visitors a week and a 4% baseline, detecting a 10% relative lift needs about
> 38,400 per arm — 76,800 exposures, or roughly 4.2 years at our volume. This is not testable.
> Ship the better-reasoned version and measure a 4-week pre/post window.

That sentence is a complete and correct deliverable. Producing a beautiful test design for an
experiment that cannot resolve is the failure mode this document exists to prevent.

## Pre/post measurement, when you ship instead

If you ship on reasoning, measure honestly:

- Equal-length windows, whole weeks, ideally 4 and 4.
- Note every confound in the window: a launch, a Reel, a directory listing, a seasonality shift.
  January invalidates any pre/post that crosses it.
- Report as directional with the confounds listed. Never as causal.
- If the pre/post move is smaller than the historical week-to-week variance of that metric, the
  correct report is "no detectable change."
