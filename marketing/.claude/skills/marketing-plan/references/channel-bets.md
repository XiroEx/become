# Channel Bets

Per-channel detail for a free, coach-led, pre-revenue PWA with no paid budget, one filming
resource, and one builder. Ranked by expected return per hour available to us this quarter, not
by ceiling.

Every number quoted anywhere in this file carries a source tier and is for internal decisions
only. See `references/benchmarks.md`.

---

## 1. Jon's owned audience

**What it is.** Direct activation of the coach's existing following, client list, and DMs.

**Why it ranks first.** It is the only distribution that exists today, it is free, and it is the
one asset the competitive alternatives cannot copy. Coach-led credibility is the differentiator
the positioning rests on, so using it is also proof of the positioning.

**What good looks like.** A first-person launch post from Jon, a story sequence walking through
the app, a DM to warm clients, and a standing weekly slot where he answers one training question
using a real product screen.

**Failure modes.** Treating his account as a billboard for brand posts. His register is first
person and experience-first; brand copy pasted onto his handle reads as an ad and burns trust.
See `coach-brand-voice`.

**Metric.** Signups in the 72 hours after each of his posts, measured against the trailing weekly
baseline.

**Kill rule.** This one does not get killed. It gets rationed. If it produces nothing after five
genuine attempts, the problem is the offer or the landing page, not the channel.

---

## 2. Organic short-form (Reels, TikTok, Shorts)

**What it is.** Unconnected reach from short vertical video, on the Become handle and Jon's.

**Why it ranks second.** It is the only realistic path to reaching people who have never heard of
us, at zero media cost. Our differentiating mechanics are inherently visual: a phone counting reps
through the camera, a photo of a plate resolving into items, a week being written back to you.
Those are demonstrations, and demonstrations travel.

**What good looks like.** A batch: one filming session producing eight to twelve pieces, each
built on one real mechanic, each designed so a specific person would send it to a specific friend.
`social-strategy` owns pillars and cadence; `reels-scripts` owns the individual script.

**Failure modes.**
- Posting product tours instead of demonstrations.
- Filming without a mechanic. "Motivation" content has no ceiling for us because it is not
  differentiated.
- Running out of filming capacity in week three and quietly stopping. Batch or do not start.
- Engagement bait and shame hooks. Both are banned, both work short-term, both poison the account.

**Metric.** Signups attributed to social per week. Secondary: sends and shares per reach, which is
the mechanic that buys unconnected distribution.

**Kill rule.** 20 posts over 6 weeks with no week above baseline signups and no post above our own
median reach. Then stop and reallocate.

**Gate.** Filming capacity. Count the days before committing. This is the binding constraint.

---

## 3. Directories and launch surfaces

**What it is.** Product Hunt, AlternativeTo, BetaList, PWA and web-app directories, fitness tool
roundups, and resource threads.

**Why it ranks third.** Low ceiling on direct referral, but the cost is a few days once and the
tail is long. More importantly, these listings are what AI answer engines cite when someone asks
for alternatives to a named app. That is durable distribution we cannot otherwise buy.

**What good looks like.** A complete listing kit produced once by `web-app-listing` and reused
across surfaces, plus a gallery drawn from `webapp/public/screenshots/v2/`. One Product Hunt
launch handled by `launch-campaign` rather than fired off casually.

**Failure modes.** Submitting a half-filled listing to the biggest surface first. Writing "(beta)"
into a listing. Using a capture with an empty state. Ignoring per-directory rules and getting the
submission pulled.

**Metric.** Referral sessions per directory, and whether the listing appears in AI answers to
"alternatives to X" queries within 60 days.

**Kill rule.** No kill rule; it is a one-time cost. But cap it: do not spend a second week on
directories that each send single-digit visits.

---

## 4. SEO and GEO

**What it is.** Search and AI-answer visibility, from an effectively greenfield state. There is no
`robots.txt`, no `sitemap.ts`, no `llms.txt`, and zero JSON-LD today.

**Why it ranks fourth.** Highest durable ceiling of the free channels, worst time-to-signal. Three
to six months before anything is readable. The plan should start the technical groundwork early
precisely because it is slow, while the fast bet runs alongside.

**What good looks like.** Technical basics first (they are cheap and one-time), then a three-tier
query map, then the exercise library as a programmatic corpus. 42 demo videos plus the Exercise
model is a real content asset most competitors at our size do not have.

**Failure modes.** Writing a blog before the technical basics exist. Chasing head terms like "best
fitness app" where incumbents with domain authority and budget live. Optimizing for clicks in a
zero-click search environment instead of optimizing to be the cited answer.

**Metric.** Indexed pages, then impressions, then citations in AI answers. Signups last, because
they lag by months.

**Kill rule.** Do not kill the technical basics; they are permanent infrastructure. Kill the
content programme if six months of published pages produce no impressions growth.

Owned by `seo-geo`.

---

## 5. Referral and share loops

**What it is.** In-product sharing of an artifact the user is proud of: a weekly recap, a PR, a
streak, a plate breakdown.

**Why it ranks fifth.** Cheap to build, honest for a free product, and it uses assets we already
generate. But a loop multiplies an existing base. With a small base, a good loop still produces a
small number.

**What good looks like.** One artifact chosen, rendered so it is legible out of context, offered
at a moment of earned pride, landing the recipient on something better than the cold homepage.

**Failure modes.** Forced sharing to unlock a feature. Leaderboards that shame. Exposing another
user's data in a share image. Inventing a referral credit, which would be inventing pricing.

**Metric.** Share rate per eligible moment, and signups per share.

Owned by `referral-program`.

---

## 6. Community

**What it is.** Reddit, Discord, forums, and gym communities.

**Why it ranks sixth.** It works only as genuine participation over months, and the ban risk for
treating it as a channel is high. Its real value at this stage is research: it is the cheapest
source of verbatim customer language for `become-context` section 9.

**What good looks like.** Jon answering training questions as himself, with the product mentioned
only when it is the literal answer. Reading threads for language, not posting links.

**Failure modes.** Drive-by promotion. A brand account posting anywhere. Astroturfing, which is
also a fabrication and therefore banned.

**Metric.** For the research use, count verbatim quotes collected. For the distribution use, do not
plan on one.

---

## 7. Paid social

**What it is.** Meta and TikTok ads.

**Why it ranks seventh despite a high ceiling.** There is no budget, and with no pricing there is
no payback model, so a positive result cannot be valued. It is also wasted if activation is not
working, which is unproven.

**Preconditions before it becomes a bet.** Activation measurably working, tracking live, at least
three organic creatives that outperformed our own median, and a real budget the user has named.

**Failure modes.** Boosting a post and calling it a test. Spending below the level where the
platform can exit the learning phase. Running fitness creative that trips policy limits on
body-focused imagery or personal-attribute implication.

Owned by `paid-social`.

---

## 8. Email list building

**What it is.** Growing a list independent of app signup.

**Why it ranks last.** We already send lifecycle email to signups, which is the high-value use. A
standalone list needs an audience to build from, so it follows bets 1 and 2 rather than leading
them. Revisit once short-form produces consistent reach.

Owned by `email-lifecycle`.

---

## Choosing between them this quarter

1. If the baseline is unknown, the first bet is instrumentation, not a channel.
2. If activation is broken, fix it before pointing any traffic at it.
3. If filming capacity exists, bet 2 with bet 1 as the accelerant.
4. If filming capacity does not exist, bet 1 plus bet 3, and use the quarter to build capacity.
5. Start the bet-4 technical groundwork in every quarter regardless. It is cheap, one-time, and
   only pays if it starts early.
