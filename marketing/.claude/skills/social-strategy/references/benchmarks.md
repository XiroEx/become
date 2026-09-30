# Benchmarks and Reporting (internal only)

Every number here is an internal planning input. **No tier may be restated as a Become claim in
public copy**, and no benchmark may be presented as our performance.

Tiers: **A** platform-published or large-sample study. **B** named case study with corroboration.
**C** vendor or SEO blog with an unverifiable sample, directional only.

---

## Engagement baselines

All seven rows come from one source: Socialinsider, 35M posts across 447k accounts, **Jan-Dec
2025**. That is a large sample published by the vendor who sells the analytics, with no independent
reproduction, so the whole block is **Tier B** and the period is 2025 rather than the current
quarter. Label it that way in any report.

| Metric | Reference value (Jan-Dec 2025) | Tier | Use it for |
|---|---|---|---|
| Instagram engagement rate, all formats | ~0.48% average | B | Sanity-checking whether a post underperformed or the whole platform did |
| Carousel engagement rate | ~0.50% | B | Justifying the carousel slot |
| Reel engagement rate | ~0.48% | B | Reach expectations |
| Static image engagement rate | ~0.33% | B | Deprioritising statics |
| Year-over-year change | roughly -24% | B | Do not read a flat month as failure |
| Follower growth, 1-5K accounts | ~22% in 2025, down from ~38% | B | Setting an honest growth expectation |
| Median monthly cadence | 8 Reels, 5 carousels, 7 images | B | Capacity planning ceiling |

## The numbers we actually review

Three primary, three supporting. Reviewed every two weeks.

**Primary**

| Metric | Definition | Why it is primary |
|---|---|---|
| Sends per reach | Sends divided by accounts reached | The scaling lever for non-follower reach |
| Saves per reach | Saves divided by accounts reached | The trust signal, and the carousel's job |
| Profile to signup | Tagged bio-link clicks that become magic-link signups | The only number that ties social to the product |

**Supporting**

| Metric | Definition | Read |
|---|---|---|
| Three-second hold | Viewers still watching at 3s | Diagnoses the hook, nothing else |
| Average watch time | Seconds watched, replays included | Diagnoses the middle of the video |
| Follows per reach | New follows divided by reach | Diagnoses whether the account is worth following, not whether the post was good |

Attribution mechanics, UTM grammar, and the signup event definitions belong to
`analytics-tracking`. Do not invent a parallel scheme here.

## Reading a result honestly

- **N matters.** Below roughly 1,000 accounts reached, a single post tells you almost nothing.
  Compare rolling four-post medians, not individual posts.
- **Compare within format.** A carousel's reach and a Reel's reach are different animals.
- **One variable per comparison.** Changing the hook, the length, and the CTA at once teaches nothing.
- **Trial Reels under-read.** Trials lack the follower boost, so use them for relative hook
  comparison only and never as a publish or kill decision on absolute numbers.
- **Novelty fades.** A format's first outing usually overperforms. Judge on the third and fourth.

## Kill rules

| Situation | Rule |
|---|---|
| A pillar sits in the bottom quartile of sends per reach for 4 consecutive weeks | Rebuild the pillar's hook shapes once, then drop it |
| A slot is missed twice in a row | Cut the cadence, do not "catch up" with a double post |
| A keyword CTA gets fewer than 5 comments across 3 posts | The DM promise is not specific enough; rewrite it before dropping the mechanic |
| Follows per reach rises while profile-to-signup stays flat for 6 weeks | The account is entertaining and not selling; add mechanism content, not more reach content |

## Review template

Every two weeks, produce this and nothing more:

```
Window: <dates>
Posts shipped: <n> (<reels> reels, <carousels> carousels, <statics> statics)
Median sends/reach: <x>  (prev window: <y>)
Median saves/reach: <x>  (prev window: <y>)
Profile to signup: <n>   (prev window: <m>)
Best post: <link> — why it worked, in one sentence
Worst post: <link> — the single fixable reason
Decision: <one decision, taken now>
```

One decision per review. A review with no decision was a status update, and status updates do not
change anything.
