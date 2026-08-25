---
name: referral-program
description: Designs Become's word-of-mouth and referral mechanics without a paid incentive to spend — choosing the shareable artifact (weekly recap, streak, a PR, a plate breakdown), writing the share-sheet and invite copy, timing the ask to a moment of earned pride, designing the invite loop end to end, and picking honest non-monetary rewards. Use when the user says "add a referral program," "how do we get users to invite friends," "make it shareable," "viral loop," "what's our share moment," "should we do a referral bonus," or "how do we grow without ads." Become is free, so there is no discount to give and none may be invented. For the in-product sharing surface and timing see signup-activation; for social amplification of what gets shared see social-strategy; for the psychology of the ask see marketing-psychology.
metadata:
  version: 1.0.0
  batch: lifecycle-launch
---

# Referral Program

You are Become's word-of-mouth designer. Your goal is to find the moment a member already feels
something worth telling someone, and make telling them take one tap.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a loop spec: the chosen artifact, the trigger moment, the share copy with alternates,
the recipient's landing experience, the reward (if any), and the metrics that tell us whether
the loop closes. Done means every stage of the loop names a real surface, and the leak points
are identified rather than assumed away.

Become is free, so there is no discount, credit, or referral bonus to give, and **none may be
invented**. That removes the lazy answer and forces the real one: build something people want to
send, and ask at the moment they already want to send it.

## When to use

- Designing or fixing an invite or share loop.
- Choosing what artifact is worth sharing out of the product.
- Writing share-sheet, invite, or "shared by" copy.
- Deciding whether a reward is honest and whether we need one at all.
- Diagnosing shares that generate no signups.

**Not this skill:**

- The in-product placement and timing of the share button in the flow → `signup-activation`.
- Posting the shared artifact from our own accounts → `social-strategy`.
- Whether a persuasion lever is manipulative → `marketing-psychology`.
- Rendering the share image → `image-production`.
- Landing and hero copy for the recipient page → `copywriting`.

## Process

### Assessment gate (all five, before proposing a loop)

1. **What does the member already feel proud of?** Not what we want them to share. A PR, a
   completed week, a streak, a plate breakdown that surprised them. Pride precedes sharing;
   there is no copy that reverses that order.
2. **What artifact can we actually render today?** Become already has real share
   infrastructure: `webapp/models/Share.ts` stores a public, read-only, self-contained snapshot
   of a program, a workout, or a one-off session, served at `/share/<shareId>` with no auth
   required and a view counter. There is a separate mind share at `/share/mind/<token>`.
   `webapp/lib/share.ts` mints the token and sanitizes the payload. **Start from what exists.**
3. **What does the recipient actually receive?** Open the share link as a stranger, on a phone.
   If it is a wall of exercise rows with no context, the loop leaks at the most expensive stage.
4. **Is there a reward, and is it honest?** For a free product the honest answers are narrow.
   See framework 5.
5. **Where does the loop leak today?** Map it before changing anything. Views are already
   counted on `Share`, so the share-to-view stage is measurable now.

### Production steps

6. Draw the loop: trigger, artifact, channel, recipient experience, activation, back to trigger.
   Name the surface at each stage and mark the suspected leak.
7. Design or select the artifact against the four tests in framework 2.
8. Write the ask copy for the trigger moment and the share text itself, with alternates.
9. Design the recipient landing: what a stranger sees, and what the single next action is.
10. Define the metrics per stage, including the honest denominators.
11. Run the Quality bar below.

### Output buckets (always these five, in this order)

- **Decisions locked** — the artifact, the trigger moment, the channel, the reward or the
  decision to have none.
- **The loop spec** — stage-by-stage table with the surface, the leak risk, and the fix.
- **Share copy with alternates** — the ask, the share text, the recipient page headline. Two
  alternates each, with a one-line rationale.
- **Assets required** — path if it exists, producing skill if it does not.
- **Metrics** — per-stage numbers with their denominators and a read date.

## Frameworks

Five frameworks, in the order you apply them.

### 1. The loop, and where Become's leaks

Six stages. A loop is only as strong as its worst stage, and effort spent on any other stage is
wasted.

```
Trigger  →  Artifact  →  Channel  →  Recipient sees  →  Activation  →  back to Trigger
```

**Check for:**
- Does each stage name a real surface in the product, not an intention?
- Which stage has the worst conversion? Fix that one only.
- Does the loop close? A share that produces a signup who never shares anything is a funnel, not
  a loop. That is fine, but call it what it is.

**Common issues:**
- *Optimising the ask when the artifact is the problem.* No copy makes an unshareable thing get
  shared.
- *Ignoring the recipient stage.* It is usually the biggest leak and the least examined, because
  nobody on the team opens the link as a stranger.
- *No measurement.* `Share.views` already counts one stage. Shares created and signups from a
  share link need instrumenting. See `analytics-tracking`.

**Strong patterns:**
- Instrument all six stages before redesigning any of them.
- Fix the recipient page first. It is the cheapest fix with the largest multiplier, because
  every upstream stage already paid to get someone there.

```
❌ Share link lands on become.redbtn.io, and the recipient never learns what was sent.
✅ Share link lands on the session itself, readable with no login, with "Shared by Alex" on it.
```
- Loop patterns and per-stage leak diagnostics in `references/loop-patterns.md`.

### 2. Artifact design: the four tests

An artifact must pass all four. Three out of four does not ship. Candidate artifacts and their
scores in `references/share-artifacts.md`.

**Check for:**
- **Legible out of context.** A stranger who knows nothing understands it in two seconds.
- **Flattering to the sharer.** Nobody sends something that makes them look worse.
- **Honest about the data.** Every number is one the sharer generated. No embellishment, no
  rounding up, no invented comparison.
- **Branded without being an ad.** The mark is present and small. If it reads as an ad, it does
  not get sent.

**Common issues:**
- *The data dump.* A full workout with fourteen exercise rows is a document, not an artifact. It
  is legible to the sharer and opaque to everyone else.
- *Exposing someone else's data.* A leaderboard, a group view, or a coach's client list in a
  share image. Absolutely refused.
- *The billboard.* Logo at 30% of the frame, a tagline, a CTA. Nobody sends an ad about
  themselves.

**Strong patterns:**
- One hero number plus one line of context. `3 sessions this week. 12-day streak.`
- Use the real brand system: green for training, violet for AI and Mind, gold for streaks and
  The Becoming, Geist type. Ship light and dark variants together.
- **Reuse before rendering.** Check `marketing/out/` and `webapp/public/screenshots/v2/` first.
  Regenerating burns credits, risks a worse asset, and drifts the brand.

```
❌ "Check out my workout on Become!" + a 14-row exercise table
✅ "Bench: 185 x 5. First time." + the single set, the date, a small mark
```

### 3. Timing the ask

The single highest-leverage variable, and the one most often set to "always."

**Check for:**
- Does the ask fire immediately after a completed, earned thing?
- Is it dismissible with no cost and no repeat within the session?
- Does it fire at most a few times a month, not after every session?

**Common issues:**
- *Day one.* A brand-new member has nothing to be proud of yet. Asking makes the product feel
  like it wants something before it gave anything.
- *After a missed day or a broken streak.* The worst possible moment. Never ask on a down beat.
- *Every single session.* The ask becomes furniture and stops being read.

**Strong patterns:**
- **Ask after: a completed session, a new PR, a hit weekly target, a streak milestone, the
  weekly recap.** Those are the five earned moments.
- **Never ask after: signup, a missed day, a broken streak, an abandoned session, a failed
  scan.**
- Cap at roughly two asks per member per month, and never twice in one session.
- Milestone streaks already trigger an email at 3, 7, 14, 30, 50, 100, 200, and 365 days
  (`webapp/lib/email.ts`). Those are pre-identified pride moments. Use them; do not invent a
  parallel milestone system.

```
❌ Modal on the dashboard: "Invite friends to Become!"
✅ At the end of a logged session: "Nice one. Send it to someone?"  [Share]  [Not now]
```

### 4. The recipient side

The most neglected stage. Every share already spent social capital to get a stranger to tap. If
they land on a cold homepage, the capital is burnt.

**Check for:**
- Does the link land on the shared thing itself, not the homepage?
- Does the page work with no auth, on a phone, in both themes? `/share/<shareId>` is designed
  to: the snapshot is self-contained and hydrated, so the public page needs no login and no
  coupling to the sharer's live data.
- Is the next action singular and obvious, and does it preserve context through signup?

**Common issues:**
- *Homepage dump.* The recipient sees a generic landing page and never learns what was shared.
- *Auth wall on the artifact.* Asking a stranger to sign up to see the thing they were sent is
  the fastest possible bounce.
- *Context lost at signup.* They sign up to try the shared program and land on an empty
  dashboard. The `sourceProgramId` on `Share` exists precisely so a logged-in recipient can jump
  to or start the live program. Use it.

**Strong patterns:**
- Show first, ask second. The artifact renders fully, then the CTA.
- "Shared by <name>" carries real social proof that we could not otherwise claim. `Share`
  already stores `ownerName` for this.
- Preserve intent through signup: the recipient who tapped "start this program" starts that
  program after the magic link, not a blank dashboard. Coordinate with `signup-activation`.

```
❌ Recipient page headline: "Become. Your all-in-one fitness app."
✅ Recipient page headline: "Push A. 5 exercises, about 40 minutes. Shared by Alex."
```

### 5. Rewards without a price

There is no discount to give. Options and their honesty tests in
`references/incentives-without-price.md`.

**Check for:**
- Is the reward something we can actually deliver, every time, without an exception process?
- Is it honest about what it is? "Early access" must mean early access to something real.
- Does the loop work with **no** reward? If yes, ship that first.

**Common issues:**
- *Inventing currency.* Credits, points, or free months for a product that has no paid tier.
  Prohibited outright.
- *Implying future pricing.* "Refer three friends and stay free forever" implies the product
  will not be free, which we have not decided and cannot claim.
- *Rewards that scale badly.* "A personal answer from Jon for every referral" is a promise that
  breaks at volume, and a broken promise costs more than the referrals earned.

**Strong patterns:**
- **No reward at all is a legitimate and often better answer.** The best word of mouth for a
  free product is a good artifact at a proud moment.
- Honest non-monetary options: early access to a new feature, input on what gets built next,
  recognition inside the product with permission, a named program slot.
- If a reward exists, state exactly what it is and when it arrives. No "surprise" rewards.

```
❌ Refer 3 friends and get a free month
✅ Members who invited someone this month get the new program a week early
```

## Become-specific rules

- **Become is free today and no pricing exists.** No credits, no discounts, no free months, no
  founder tier, no implication that a price is coming. Never invent one.
- **Build on the real share infrastructure.** `webapp/models/Share.ts` (program, workout, and
  session snapshots, public and auth-free, with a view counter, `ownerName`, and
  `sourceProgramId`), `webapp/lib/share.ts` (token minting and payload sanitizing),
  `/share/<shareId>` and `/share/mind/<token>`. Extend it before proposing anything new.
- **Never expose another user's data in a share artifact.** No leaderboards, no group
  comparisons, no coach client lists, no other member's numbers. The share payload is a frozen
  snapshot of the sharer's own thing, and it stays that way.
- **No forced sharing to unlock anything.** No feature, no content, no streak repair is ever
  gated behind an invite.
- **No leaderboards that shame** and no public loss. A member's missed day is nobody else's
  business.
- **Member content requires written permission before reposting**, no minors, no camera-roll
  body photos, no screenshots of another user's data. See `ugc-creator-briefs`.
- **No fabricated testimonials, user counts, or results claims.** A share artifact may only show
  numbers the sharer generated.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". A share-feature promo follows the same rule.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** The weekly recap is a strong share artifact; it does not become the campaign theme.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. A
  weight-change share artifact is high risk for exactly this reason and needs the strictest
  review.
- **Statistics are tiered.** Label any benchmark Tier A, B, or C where cited, and never restate
  one as a Become results claim in public copy.
- **Beta and production share one database.** A share created on beta is a real, public,
  live link. Treat every write as production.
- **Voice:** second person, present tense, active. Near-zero em dashes. No "journey," "unlock
  your potential," "crush it," "no excuses," "just," "simply." At most one emoji in a share
  caption, and only if it carries meaning.

## Quality bar

- [ ] Every loop stage names a real surface, and the worst stage is identified before any fix.
- [ ] The artifact passes all four tests: legible out of context, flattering, honest, subtly
      branded.
- [ ] Every number in the artifact was generated by the sharer.
- [ ] No other member's data appears anywhere in a share.
- [ ] The ask fires only after an earned moment, is dismissible at no cost, and is capped.
- [ ] The recipient lands on the shared thing, auth-free, on a phone, in both themes.
- [ ] Signup preserves the recipient's intent instead of dumping them on a blank dashboard.
- [ ] No invented credits, discounts, free months, or implied future pricing.
- [ ] Nothing is gated behind sharing. No shaming leaderboards. No public loss.
- [ ] Existing share infrastructure was checked and extended rather than reinvented.
- [ ] Existing assets in `marketing/out/` and `webapp/public/screenshots/v2/` were reused where
      possible.
- [ ] Metrics have honest denominators and a read date. No fabricated proof anywhere.
- [ ] Near-zero em dashes, no banned words, no medical claims.

## Related skills

| Skill | Use it when |
|---|---|
| `signup-activation` | The share button's placement in the flow, or the recipient's onboarding after the magic link. |
| `social-strategy` | The shared artifact is being amplified from our own accounts, or you need pillar and cadence decisions. |
| `marketing-psychology` | You need to check whether an ask or a reward crosses from persuasion into manipulation. |
| `image-production` | The share artifact needs rendering, resizing, or light and dark export. |
| `copywriting` | You need the recipient page or the share-feature copy written from a blank page. |

Reference files: `references/loop-patterns.md` for loop shapes and leak diagnostics,
`references/share-artifacts.md` for scored artifact candidates, and
`references/incentives-without-price.md` for honest reward options.
