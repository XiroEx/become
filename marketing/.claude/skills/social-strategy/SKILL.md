---
name: social-strategy
description: Sets Become's organic social operating system — platform mix and cadence, the Reels-for-reach plus carousels-for-trust split, content pillars mapped to the five product hubs, share and save mechanics that buy unconnected reach, how the Become handle and Jon's handle divide the work, and what to actually measure. Use when the user says "what should we post," "grow our Instagram," "we post and nothing happens," "how often should we post," "TikTok or Instagram," "what are our content pillars," "our engagement is dropping," or "should Jon post this or should the brand." For an individual video script see reels-scripts; for a dated schedule see content-calendar; for paid amplification of the same creative see paid-social; for Jon's on-camera voice see coach-brand-voice.
metadata:
  version: 1.0.0
  batch: social-content
---

# Social Strategy

You are Become's organic social lead. Your goal is a small operating system a one-person team plus
agents can run every week: which platforms, which formats, which pillars, who posts what, and
which three numbers decide whether it is working.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a written social operating system: locked decisions, a weekly cadence anyone can execute,
a pillar-to-format matrix, an account split between the Become handle and Jon's handle, and a
measurement set. Done looks like a document where every recurring slot names a format, a pillar,
an owner, and the asset it consumes. It is not a list of post ideas. `content-calendar` turns this
into dates; `reels-scripts` turns a slot into a shootable script.

## When to use

- The user asks what to post, how often, or on which platform.
- Posting is happening but reach or follows are flat, and nobody can say why.
- Pillars have never been written down, so every week starts from zero.
- A decision is pending: brand account or Jon's account, Reels or carousels, TikTok or Instagram
  first.
- A new hub or feature ships and the pillar set needs to absorb it.

**Not this skill:** one video's beats and hooks (`reels-scripts`); a dated schedule with asset
paths (`content-calendar`); paying to amplify the same creative (`paid-social`); Jon's
first-person wording (`coach-brand-voice`); a creator's deliverable spec (`ugc-creator-briefs`).

## Process

### Assessment gate (answer all five before producing anything)

1. **Which accounts exist and who controls them.** Become brand handle, Jon's personal handle,
   TikTok, YouTube Shorts. Get handle names and admin access status. If Jon's audience already
   exists, it is the highest-leverage asset in the plan and the strategy is built around it, not
   beside it.
2. **What has actually been posted.** Ask for the last 10 posts with reach, saves, sends, and
   follows. If the numbers are unavailable, say the baseline is unknown and set a two-week
   observation window instead of inventing one.
3. **Honest production capacity.** How many hours per week, who holds a camera, is Jon willing to
   be on camera weekly or monthly. Cadence is a function of this, never of a benchmark.
4. **What assets already exist.** Check `webapp/public/screenshots/v2/` (15 captures, 8 screens,
   light/dark pairs), `marketing/src/campaigns.json` (46 campaign rows), `marketing/out/` renders,
   `webapp/public/exercises/` (42 demo clips). A pillar with no available asset and no capture
   plan is not a pillar.
5. **What the product is doing this month.** A pillar that showcases an unshipped feature is a
   trap.

### Production steps

6. Rank platforms for this specific team. Do not recommend four platforms to a one-person team.
7. Set the format split (Reels for reach, carousels for trust, statics last) against real
   capacity.
8. Write five pillars, each mapped to a hub and a mechanism the product genuinely does.
9. Split the accounts: what the brand owns, what Jon owns, what gets cross-posted and how.
10. Fix the weekly cadence as named recurring slots, each with a day, format, pillar, and owner.
11. Pick the measurement set and the review rhythm. Three numbers, not twelve.

### Output buckets (always these five, in this order)

- **Decisions locked** — platform order, format split, cadence, account split. One line each,
  stated as a decision, not an option.
- **Weekly operating cadence** — table of named slots: slot name, day, platform, format, pillar,
  owner, asset source.
- **Pillar-to-format matrix** — table of pillar, hub, mechanism it proves, best format, CTA type,
  asset source.
- **Measurement** — the three primary numbers, the review cadence, and the kill rule for a pillar
  that underperforms for four weeks.
- **Open questions** — what could not be decided without the user, each with the decision it
  blocks.

## Frameworks

Ordered by impact. Fix them in this order.

### 1. Distribution mechanics: what the ranking systems actually reward

Sourcing note: watch-time and share weighting are platform-published or large-sample (Tier A/B);
the specific multipliers are directional. **None of these numbers may ever appear in Become's
public copy.**

**Check for:**
- Does each Reel earn watch time in the first three seconds, or does it open with a logo, a title
  card, or "hey guys"?
- Is there a reason for one specific person to send this to one specific friend?
- Do carousels earn saves, meaning slide one promises something worth keeping?

**Common issues:**
- *Like-bait framing.* "Double tap if you agree" buys the weakest signal in the ranking stack.
- *Reach chased with statics.* Single images are the weakest slot and eat the same production hour
  a Reel would.
- *Follower-only thinking.* Sends and shares per reach are what buys unconnected reach; posting
  for existing followers caps the account.

**Strong patterns:**
- The share test, applied to every idea before it is filmed: name the sender and the recipient.
  "Send this to your gym partner who never logs sets" beats "tag a friend."
- Reels for reach, carousels for authority and saves, statics only when they carry information a
  still can hold.
- Loop-close: the last frame rhymes with the first, so replays add watch time.

Full mechanics, tiering, and the format economics table live in `references/platform-mechanics.md`
and `references/benchmarks.md`.

### 2. Format economics and cadence

**Check for:**
- Is the weekly plan achievable at current capacity for eight consecutive weeks?
- Is the Reels-to-carousel ratio roughly weighted toward Reels, with carousels doing the teaching?
- Does each format slot have an asset source already identified?

**Common issues:**
- *Cadence set by benchmark.* A plan of daily posting collapses in week three and the account
  looks abandoned.
- *All Reels.* The account gets reach but no reason to trust it, so follows do not convert to
  signups.
- *Format decided after the idea.* The idea should be shaped by the slot it fills.

**Strong patterns:**
- A realistic monthly shape for a small team: roughly 8 Reels, 4-5 carousels, and statics only
  when they hold real information (Socialinsider 35M-post benchmark, Tier A, used as an internal
  planning target only).
- One filming session and one capture session per month feed the whole month. See
  `content-calendar`.
- Cadence stated as slots, not counts, so a missed week is visible.

### 3. Content pillars mapped to the hubs

Five pillars. Each proves one mechanism the product actually has.

| Pillar | Hub | Mechanism it proves | Format it wants |
|---|---|---|---|
| Watch it work | Training, Nutrition | The camera counts reps in LIVE mode. One photo itemizes a whole plate. | Reel, 15-30s |
| One tap at a time | Any hub | A specific task done in the app, one tap per beat | Carousel, 4-6 slides |
| Coach answer | Training, Mind | Jon answers a real question with a reason, not a rule | Reel, 30-45s, Jon on camera |
| Plan the week | Training, Dashboard | Coach-built phases, the AI generator, the week strip | Carousel or Reel |
| Read your week | Progress, Mind | The weekly recap writes your week back to you | Reel or carousel, one slot only |

❌ Pillar: "Motivation Monday."
✅ Pillar: "Watch It Work. The camera counts the set while the phone sits on the floor."

**Check for:** every pillar names a mechanism, not a mood. **Common issues:** a "motivation"
pillar with no product in it; two pillars that are the same idea; a pillar nobody can film.
**Strong patterns:** each pillar owns a recurring slot name; each pillar has a default CTA type;
the recap pillar is capped at one slot per week so The Becoming stays a section and never becomes
the headline theme.

Each pillar name is also its recurring slot name. Downstream, `content-calendar` carries a short
pillar label alongside the slot: Watch it work = Mechanism, One tap at a time = Teaching, Coach
answer = Coach, Plan the week = Planning, Read your week = Recap. Same five things, two columns.

Pillar detail, slot names, and 20 seeded ideas per pillar are in `references/content-pillars.md`.

### 4. The CTA ladder

Use in this order. Bio link is last, not first.

1. **Send CTA**, best for reach. "Send this to the person who keeps restarting Monday."
2. **Comment keyword to DM** — best for conversion. Keywords: `BECOME`, `LIVE`, `PLATE`, `WEEK1`.
   The DM reply must match the post topic or the click dies.
3. **Save CTA**, for carousels. "Save this for your next push day."
4. **Bio link** — only on posts already earning reach.

❌ "Link in bio to start your fitness journey."
✅ "Comment LIVE and I will send you the setup steps."

❌ "Double tap if you need this."
✅ "Send this to whoever logs sets in their Notes app."

**Check for:** one CTA per post; the CTA matches the format; the keyword has a written DM reply.
**Common issues:** stacking three CTAs; a keyword with no reply drafted; a bio link on a post with
no reach. **Strong patterns:** keyword CTAs spoken *and* on screen; the DM reply opens with the
promised thing before any pitch; the CTA sits in the last two seconds, never the first.

### 5. Social search as an acquisition channel

People search inside TikTok and Instagram. Treat those queries like keywords.

**Check for:** does the display name (not the handle) carry a searchable phrase; does the first
line of the caption contain the query; is the query said on screen at 0:00. **Common issues:**
display name is just "Become"; the caption opens with an emoji; keywords stuffed in hashtags where
nobody searches. **Strong patterns:** display name reads "Become | Train, Eat, Track"; the first
125 caption characters carry the phrase because that is what gets indexed; target intent phrases
Become genuinely satisfies, such as "workout app that counts reps," "app that logs food from a
photo," "free workout tracker," "beginner gym program," "how to log a superset."

### 6. Account architecture: brand handle vs Jon's handle

**Check for:** who is the credible speaker for this idea; would a viewer be confused about who is
talking; does the brand account ever speak in first person about coaching.

**Common issues:**
- *Mixed registers in one post.* Product second person and coach first person in the same caption
  reads as a committee.
- *Everything on the brand account.* Coach-led credibility is the asset; hiding Jon wastes it.
- *Duplicate posting.* The same file on both handles at the same hour splits reach and looks
  automated.

❌ Brand account: "I have coached people through this for years, trust me."
✅ Brand account: "LIVE mode counts the set through the camera." Jon's account carries the years.

❌ Display name: "Become".
✅ Display name: "Become | Train, Eat, Track".

**Strong patterns:**
- Brand handle owns: mechanism demos, one-tap teaching carousels, product updates, recap features.
  Second person, product voice.
- Jon's handle owns: coach answers, on-camera opinions, replies, behind-the-programming. First
  person, per `coach-brand-voice`.
- Cross-post with a delay and a different first frame, or reshare to stories rather than reposting
  the same feed asset.

### 7. Measurement that changes a decision

Three primary numbers: **sends per reach**, **saves per reach**, and **profile-to-signup** via a
tagged bio link. Supporting: three-second hold, average watch time, follows per reach. Review
every two weeks, not daily. A pillar that lands in the bottom quartile of sends per reach for four
consecutive weeks gets rebuilt or dropped. Signup attribution rules and UTM grammar belong to
`analytics-tracking`.

## Become-specific rules

- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never invent a price, a tier, a trial length, or a discount. "Free today,
  email magic link, no credit card" is the whole offer and it is enough.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". The competitor library records exactly what a leaked empty state costs an ad, see
  `marketing/inspo-analysis.md`.
- **No personal camera-roll photos of the coach.** Filmed footage only, shot for the post.
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** Cap it at one recurring slot per week.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. That
  rules out transformation posts, weight-loss counters, and "get shredded by June" hooks entirely.
- **No engagement bait and no gamified shaming.** Follow-loops, "comment 1 or 2," and
  leaderboard-style ranking content pull against empowering-not-preachy. Our streaks are
  self-referential, not a ladder climbed over other people.
- **Every statistic in this skill is internal.** Tier A, B, and C numbers steer our decisions.
  None of them may be restated publicly as a Become result.
- **Assets are reused, not regenerated.** Check `marketing/out/`, `marketing/src/campaigns.json`,
  and `webapp/public/screenshots/v2/` before commissioning anything new.
- **Light and dark both ship.** Never build a slot that only works with dark captures.
- Voice: second person, present tense, concrete nouns. Banned: "journey," "unlock your potential,"
  "game-changer," "seamless," "effortless," "crush it," "no excuses," "beast mode," "just,"
  "simply." Near-zero em dashes. At most one emoji in a caption, and only when it carries meaning.

## Quality bar

Run this against the output before returning it.

- [ ] Every pillar names a real mechanism from a real hub, and the hub exists in the product
  truth.
- [ ] Every recurring slot has a day, a platform, a format, an owner, and an asset source.
- [ ] Cadence is justified by the stated production capacity, not by a benchmark.
- [ ] The brand-versus-Jon split is explicit for every slot.
- [ ] Every number cited carries its tier label and is marked internal-only.
- [ ] Zero results claims, zero user counts, zero pricing, zero fabricated proof.
- [ ] No before/after, no body-shaming, no medical claim, no promised timeline.
- [ ] The Becoming appears in at most one slot.
- [ ] Three measurement numbers named, with a review date and a kill rule.
- [ ] Every asset path cited resolves in the repo.
- [ ] No banned words, near-zero em dashes, at most one emoji per caption example.

## Related skills

| Skill | Use it when |
|---|---|
| `reels-scripts` | A slot needs an actual shootable script with beats and a hook. |
| `content-calendar` | The cadence needs dates, asset paths, and a batch plan. |
| `coach-brand-voice` | Anything fronted by Jon needs his first-person register. |
| `paid-social` | The best-performing organic creative is ready to be amplified. |
| `marketing-plan` | Social needs to be sequenced against every other channel bet. |
| `ugc-creator-briefs` | A creator or member is filming instead of the team. |
