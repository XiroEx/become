# Platform Mechanics (internal reference, current to Aug 2026)

Everything here steers **our** decisions. **Nothing here may be restated in public Become copy**,
and no figure may be reframed as a Become result.

**Source tiers.** Tier A = platform-published or large-sample study. Tier B = named case study
with corroboration across outlets. Tier C = vendor or SEO blog with an unverifiable sample.
Treat Tier C as a directional heuristic only.

---

## Instagram ranking, 2026

| Signal | Weight in practice | Tier |
|---|---|---|
| Watch time, including replays | Entry ticket. Without it nothing else is evaluated. | A |
| Sends and shares per reach | The scaling lever for unconnected reach. Weighting matters more than likes (A); the specific "3-5x a like" multiplier is a creator-community figure with no published sample (C). | A + C |
| Saves | Primary distribution signal for carousels. | A/B |
| Likes | Weakest of the four. Do not design for it. | A/B |
| Comments | Useful mostly as a conversion path (keyword to DM), not as reach. | B |

**Practical rule.** Design every Reel so one specific person would DM it to one specific friend.
Name the sender and the recipient before filming. If you cannot name them, the idea is not ready.

## Format economics

Socialinsider, 35M posts across 447k accounts, **Jan-Dec 2025** (Tier B: a large single-vendor
sample, published by the vendor, not independently reproduced). Every figure below is that study's
period, not the current quarter.

| Format | Engagement rate (Jan-Dec 2025) | What it buys |
|---|---|---|
| Carousel | ~0.50% | Authority and saves |
| Reel | ~0.48% | Reach, especially non-follower reach |
| Static image | ~0.33% | The weakest slot |

Overall average ~0.48%, down roughly 24% year over year. Median monthly posting in 2025 was
8 Reels, 5 carousels, 7 images. Follower growth for 1-5K accounts fell from ~38% (2024) to
~22% (2025). All Tier B, all 2025.

**Read for Become:** a viral-only strategy is not available. The account grows on a
Reels-for-reach plus carousels-for-trust split, and statics are used only when a still can carry
the information.

## Length bands

| Platform | Band | Why | Tier |
|---|---|---|---|
| TikTok | 15-30s | Highest completion rate | C |
| TikTok | 21-34s | Most shares and likes | C |
| TikTok | 11-18s | Skews viral | C |
| TikTok / Reels | 45-60s+ | Teaching, only when the payoff justifies it | C |
| Reels (fitness) | 30-60s | The working band | C |
| Repurposed for paid | 30-45s | Most flexible across placements | C |

Every band above is Tier C: agency and vendor round-ups, no published sample, and they drift with
each algorithm change. Use them to pick a starting length, never to justify a length in a report.
Our own completion data, once `analytics-tracking` is live, outranks all of it.

Hooks land under 1.5 seconds on every platform. See `reels-scripts` for the production rules.

## The first 1.5 seconds

Meta uses roughly a 1.0s early-retention signal for delivery; around half of viewers drop within
three seconds (direction Tier A, magnitudes Tier C). Encode as production rules, never as stats:

- Frame one holds a face, a motion, or a legible 4-7 word overlay. Never a logo, never a title
  card, never a slow push-in.
- No "hey guys," no intro, no branding before the payoff.
- Spoken hook and on-screen text carry different information, not the same sentence twice.
- Cut or reframe every 1.5-2.5s for the first eight seconds.
- Last frame visually rhymes with the first so replays are earned.

## Captions and CTAs

- Instagram truncates the caption at roughly 125 characters behind a "more" tap. That is a
  visibility limit, not an indexing limit: the whole caption is searchable, but only the first line
  gets read. Front-load the search phrase anyway (Tier B on the truncation point, C on the exact
  character count, which varies by device).
- "Link in bio" carries a measured reach penalty in at least one dataset (293 vs 444 average
  reach, about 34% worse, Tier C). Avoid it as the primary CTA.
- Comment-keyword-to-DM flows are reported at 3-5x link-in-bio conversion, with in-DM CTA button
  click-through of 25-45% when the link matches the post topic. **Tier C**: both numbers come from
  DM-automation vendors selling the mechanic, with no sample disclosed. The direction is worth
  acting on. The magnitudes are not worth quoting.

Become keywords and what each DM must deliver:

| Keyword | Post topic | DM must open with |
|---|---|---|
| `LIVE` | Logging a set in LIVE mode | The three steps to start a LIVE set, then the link |
| `PLATE` | Photo nutrition logging | What one photo returns, then the link |
| `WEEK1` | Programs and planning | What the first week looks like, then the link |
| `BECOME` | Anything general | One sentence on what the app does, then the link |

Every keyword needs its reply written before the post ships. A keyword with no reply is a dead
conversion path and it reads as a bait.

**These replies are sent by hand.** Become runs no DM-automation tool and none is assumed. At our
volume that is fine: write the four replies once, keep them in a note, and paste the right one. It
also means a keyword post ships only when somebody is actually around to answer it. Do not plan a
keyword campaign that depends on an automation we do not have.

## Social search

64% of Gen Z use TikTok as a search engine (Adobe consumer survey, Tier B). The "roughly 40% of
Gen Z prefer TikTok or Instagram for some searches" line is **Tier C**: it traces to an offhand
remark by Google's Prabhakar Raghavan at a 2022 conference, describing internal studies that were
never published, and it has been requoted ever since as though it were a statistic. Do not put a
number on it in anything we write. TikTok lets creators edit the keyword metadata attached to a
video.

Actions:

- Put the primary keyword in the **display name**, not just the handle: "Become | Train, Eat, Track".
- Carry the full query in on-screen text at 0:00.
- Target intent phrases the product genuinely satisfies: "app that logs food from a photo," "free
  workout tracker," "workout app that remembers your last weight," "beginner gym program," "how to
  log a superset," "AI workout generator."
- Do not target a phrase the product cannot answer today. A search win that ends in a
  disappointed visitor is worse than no win.

## Trial Reels

Shown to non-followers first. Mosseri's own caveat, stated on his account: trial numbers under-read
published performance because they lack the follower boost (Tier A, from the platform). Scheduling
support rolled out during 2026; confirm it is present in the account before planning around it
rather than trusting a date in this file.

- Use trials for **relative hook A/B only**, never as an absolute go or no-go.
- Cadence: 4-7 trials per week, same body, different first 1.5 seconds.
- Promote the winner, then log the hook shape in the hook library so the pattern compounds.

## What we do not do

- No engagement bait ("comment 1 or 2," follow-loops, giveaway follows).
- No gamified ranking content. Leaderboard energy pulls against empowering-not-preachy.
- No trend audio used against a hook that does not fit it.
- No reposting the identical file to two handles in the same hour.
