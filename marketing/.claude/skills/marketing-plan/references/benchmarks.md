# Benchmarks

**Internal use only.** Every number here is a reference point for our own planning. **No tier may
ever be restated as a Become results claim in public copy.** A benchmark about how Instagram
carousels perform across the industry is not a statement about Become, and using it as one would
break the no-fabricated-results constraint.

## Source tiers

| Tier | What it is | How much weight |
|---|---|---|
| **A** | Platform-published data or a large-sample study with a stated method | Plan against it |
| **B** | A named case study with corroboration from a second source | Steer with it, verify before it matters |
| **C** | Vendor or SEO blog with an unverifiable sample | Directional only, never load-bearing |

Label the tier every time you quote a number, including inside internal documents. An unlabelled
number gets treated as Tier C by the next reader, which is usually the correct default.

## Social format economics

| Format | Median engagement rate | Read |
|---|---|---|
| Carousel | ~0.50% | Buys trust and saves |
| Reels | ~0.48% | Buys unconnected reach |
| Static image | ~0.33% | The weakest slot |

Source: Socialinsider's Instagram benchmark study, roughly 35 million posts, study period
January-December 2025. **Tier B** — the sample is large, but it is a vendor study whose method and
account mix are not independently reproducible, so it steers rather than sets targets. Note the
period: it is the study's window, not ours, and it is not a current-quarter reading.

Median observed cadence in the same dataset: about 8 Reels, 5 carousels, and 7 images per month.
**Tier B**, same study, same caveat.

**How to plan against it.** Reels are the reach instrument, carousels are the trust instrument,
statics are filler. Engagement rate is not the goal metric for us; signups are. Use these to
allocate production effort, not to set targets. Full treatment in `social-strategy`.

## Search click economics

| Fact | Number | Source | Tier |
|---|---|---|---|
| US Google queries ending without a click | ~68% | SparkToro / Datos clickstream analysis, Rand Fishkin, 2024 | B |
| Searches showing an AI Overview | 20%+ | Third-party SERP-tracking samples; no Google-published figure exists, and the share moves month to month | C |
| CTR reduction when an AI Overview is present | roughly 60% | Reported by SEO vendors from their own client sets; Google disputes the framing | C |
| AI Mode queries ending without a click | ~93% | Single vendor sample, no method published | C |

Only the first row has a named, reproducible source. The other three circulate widely without one,
so they are Tier C: use them to argue a direction, never to size an outcome. If a plan line depends
on one of these being true, the plan line is wrong.

**How to plan against it.** Optimize to be the cited answer, not the blue link. This is why
directories and structured answer content rank above a conventional blog in the channel bets, and
why `seo-geo` treats citation as the primary outcome.

## Short-form length bands

| Band | Property |
|---|---|
| 15-30s | Highest completion rate |
| 21-34s | Most shares |
| 11-18s | Skews viral |
| 45-60s+ | Teaching content, lower reach, higher intent |
| 30-45s | The most repurposable cut for paid |

**Tier B**, aggregated from platform creator guidance and agency reporting. Treat as production
guidance, not as a promise. `reels-scripts` owns this in detail.

## What we do not have a benchmark for

Be explicit about these, because the temptation is to borrow a number from a different context:

- Signup rate for a magic-link-only signup on a free fitness PWA. No credible public figure exists.
- Activation and day-7 return for a coach-led all-in-one app. Ours will be our own baseline.
- Referral share rate for a fitness recap artifact.
- Any conversion rate for our landing page before we measure it.

When one of these is needed, the honest answer is "we will measure it," and the plan line is
`analytics-tracking`. Do not import a SaaS median and treat it as our target.

## Our own baseline is the only benchmark that matters

Record on day 0 of every plan:

| Metric | Day 0 value | Where it comes from |
|---|---|---|
| Signups per week | | `analytics-tracking` |
| Weekly active users | | |
| Sessions logged per active user per week | | |
| Landing sessions per week | | |
| Landing to signup rate | | |

Everything in the plan is measured against these, not against an industry median. At our volume,
a comparison to our own trailing four weeks is more informative than any external figure, and it
cannot be misread as a public claim.
