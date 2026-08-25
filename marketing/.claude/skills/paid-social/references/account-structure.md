# Account Structure

The literal Ads Manager tree for Become, at a small budget, on Meta and TikTok. Platform
mechanics cited here are Tier A (published by the platforms) and are for internal planning only.

---

## Meta: the first test

```
Campaign
  Objective:        Sales (with a Complete Registration / custom conversion) if the pixel has
                    volume; otherwise Traffic to landing-page views, upgraded once events flow.
  Budget:           Campaign budget (Advantage campaign budget), $50-70/day
  Attribution:      7-day click, 1-day view (state it, so the report is comparable later)

  Ad set  "broad_us_18plus"
    Audience:       Country, age 18+ (or 25-54 if the ICP says so). No interests. No lookalikes.
    Placements:     Advantage+ placements (all)
    Optimization:   The event chosen in framework 3 of SKILL.md
    Ads:            3 to 5 creatives, one mechanism per creative
```

Why one broad ad set:
- Budget is small. Splitting it means nothing exits the learning phase.
- Delivery finds the audience from creative signals. Interest stacks mostly re-target people the
  system would have found anyway, at a higher CPM.
- One ad set makes the creative the only variable, which is the point of round one.

Add a second ad set only when you have a working creative and a genuinely different hypothesis
(for example, a retargeting set for landing-page visitors who did not sign up). Retargeting needs
audience size to be worth it; below a few thousand site visitors a month it is not.

## Meta: what "learning phase" means for the plan

Meta's published guidance is roughly **50 optimization events per ad set per week** for stable
delivery. Practically:

| Cost per signup | Weekly floor per ad set | Monthly |
|---|---|---|
| $3 | $150 | about $650 |
| $6 | $300 | about $1,300 |
| $10 | $500 | about $2,150 |

If the real budget is below the floor, do not run the test. Say so and redirect the spend.
Alternatives ranked for Become: creator content (`ugc-creator-briefs`), Jon's own audience
(`social-strategy`), directories and SEO (`web-app-listing`, `seo-geo`).

If the deep event is too rare, optimize one step shallower (`signup_started` instead of
`account_created`) and move deeper when volume supports it. State this as a deliberate step, and
change only one thing at a time.

## TikTok: the first test

```
Campaign
  Objective:        Website conversions (or Traffic if the pixel has no volume)
  Budget:           Campaign daily budget at or above the published minimum (about $50/day)

  Ad group "broad_us_18plus"
    Budget:         At or above the published ad-group minimum (about $20/day)
    Audience:       Country, age 18+. No interest stacking at this budget.
    Placements:     TikTok only (not the audience network) for the first read
    Ads:            3 to 5 creatives, native vertical, sound-on, captions burned in
```

TikTok notes:
- Creative decays faster than on Meta. Plan a refresh cadence of every 1 to 2 weeks.
- Spark ads (running from a real handle) typically outperform brand-account ads for coach-led
  products. See the Spark section below.
- Sound matters more than on Meta. A silent ad reads as a banner.

## Pixel, events, and attribution

Before any spend:
1. Pixel or TikTok pixel installed on `become.redbtn.io` and firing on the public routes.
2. A conversion event on `signup_started`, and a deeper one on `account_created`, matching the
   names in `analytics-tracking`.
3. Conversions API or server events if possible, since browser-only signal is lossy.
4. UTMs on every destination URL, following `analytics-tracking` conventions:
   `utm_medium=social_paid`, creative in `utm_content`.
5. **No health data in any event payload.** Never send weight, mood, calories, or meal contents to
   an ad platform. `user_id` and a boolean is the maximum.

Attribution reality: platform-reported conversions and the app database will disagree. Report
both. The database is the truth for "how many accounts exist"; the platform number is a delivery
signal. Never present the platform number as the company number.

## Read-and-kill rules

Write these into the plan before launch, with dates.

| Level | Rule |
|---|---|
| Ad | After 2,000 impressions with no landing-page views at a rate near the ad-set average, pause it. Judge hooks on 3-second view rate and hook rate first, cost per signup second. |
| Ad | Never pause before it has spent roughly 1 to 2 times the target cost per signup. Earlier is superstition. |
| Ad set | If cost per `signup_started` is above 2x the acceptable number after the learning window plus one week, pause and rewrite the creative, not the audience. |
| Creative refresh | Frequency above about 2.5 on Meta, or a visible CTR decline over 3 days on TikTok, means fatigue. Refresh the creative, do not raise the bid. |
| Whole test | Hard stop date and hard stop budget, both set before launch. When either is hit, write the result and stop. |

Do not edit budgets or audiences daily. Every meaningful edit restarts learning. Batch changes
into one weekly review.

## Naming convention

Mirror the UTM grammar so the platform and the database can be joined.

```
Campaign:  202610_paid_test1
Ad set:    broad_us_18plus
Ad:        reel_repcount_hooka_creatorname
```

Lowercase, underscores, `yyyymm` prefix on the campaign. `utm_content` equals the ad name. One
naming mistake at launch costs a month of unreadable reporting.

## What we do not do

- **Boosting.** No structure, no comparison, engagement-optimized. It is not a test and it is not
  reported as one.
- **Interest fans on a small budget.** Eight ad sets at $10 a day learns nothing.
- **Lookalikes from a tiny seed.** Below a few thousand converters it is noise.
- **Special-offer campaigns.** There is no price, no discount, and no trial to promote.
- **Sending paid traffic to beta.** `become-beta.redbtn.io` shares the production database and
  carries different app-name and URL values.
- **Automated rules that pause ads on day one.** They will kill the eventual winner during
  learning.

## Weekly review checklist

1. Sample sanity: did the platform actually deliver roughly the intended split across creatives?
2. Guardrails: frequency, CPM trend, negative comments, any policy warning in the account.
3. Delivery metrics by creative: hook rate (3-second views over impressions), hold rate, CTR.
4. Cost per `signup_started`, then cost per `account_created`.
5. Database check: did the accounts actually appear, tagged with the campaign?
6. One decision, batched: refresh creative, hold, or stop. Then leave it alone for a week.
