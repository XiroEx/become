# Incentives Without a Price

Become is free today and no pricing exists. There is no discount, credit, free month, or paid
tier to give away, and **none may be invented**. That closes the lazy path and forces the real
question: what can we honestly offer that a member actually wants?

---

## The honesty test

Before proposing any reward, all four must be yes:

1. **Can we deliver it every time, without an exception process?**
2. **Is it exactly what it says it is?** "Early access" means access, earlier, to a real thing.
3. **Does it avoid implying a future price?** Anything shaped like "stay free" implies the
   product will not be free, which we have not decided and cannot claim.
4. **Does it survive volume?** A reward that breaks at 100 referrals is a promise that will be
   broken publicly.

Fail any one and the reward is out.

---

## Options, ranked by honesty and durability

### 1. No reward at all

**The default, and frequently the correct answer.** For a free product, the strongest word of
mouth comes from a good artifact at a proud moment, not a bribe. A reward attached to an
unshareable artifact does not fix the artifact, it just adds an obligation.

Ship the loop with no reward. Measure. Only add one if the ask acceptance rate is genuinely the
bottleneck, and it usually is not.

**Honesty: perfect. Durability: perfect. Effort: none.**

### 2. Early access to something real

Members who invited someone get a new feature or program a week before general availability.

- Deliverable every time, as long as there is a real release pipeline.
- Costs nothing marginal.
- Requires an actual thing to be early to. Do not promise early access to a roadmap.

```
❌ Refer a friend and unlock exclusive premium features
✅ Members who invited someone this month get the new program a week early
```

**Honesty: high. Durability: high, if the release cadence is real.**

### 3. Input on what gets built

An invitation to a feedback round, a vote on the next program, a question that actually gets read.

- Cheap and genuinely valued by engaged members.
- **Only offer it if someone will actually read the responses.** An unread feedback form is worse
  than no reward.

**Honesty: high. Durability: moderate. It stops being special if it becomes a mass survey.**

### 4. Recognition inside the product, with permission

A member's name on a program they helped shape, a named slot, a thank-you surface.

- Requires **explicit written permission**, every time, no exceptions.
- No minors. No body photos. No other member's data visible.
- Never automatic. Never opt-out.

**Honesty: high, if consent is real. Durability: moderate. It does not scale past a certain
volume, and it should not.**

### 5. A coach answer

A question answered by Jon.

- Genuinely valuable, and it leans on the real differentiator: coach-led credibility.
- **Breaks at volume.** Jon's time is finite and non-substitutable.
- Only offer it as a bounded, occasional thing: a monthly Q&A, a specific window, a capped
  number. Never "for every referral."
- Anything Jon says in this context follows `coach-brand-voice`: no invented client stories, no
  promised results, and injury or medical questions get the referral response.

**Honesty: high. Durability: low. Bound it explicitly or do not offer it.**

---

## Prohibited outright

| Reward | Why it is refused |
|---|---|
| Credits, points, coins | Invented currency for a product with no economy |
| A free month | Implies a paid month exists. It does not |
| "Stay free forever if you refer 3" | Implies a future price we have not decided and cannot claim |
| Founder or early-adopter pricing | Invented pricing |
| A discount of any size | There is nothing to discount |
| Cash or gift cards | Turns members into affiliates, invites gaming, and triggers disclosure obligations we are not set up for |
| Prize draws | Regulated, jurisdiction-dependent, and off-brand |
| A guaranteed physical or health outcome | Prohibited by the responsible-claims rule |
| Anything unlocked only by sharing | Forced sharing. Refused |

**The pattern to watch for:** almost every prohibited reward smuggles in a claim about a price
that does not exist. If a reward's copy only makes sense in a world where Become costs money, it
is out.

---

## Two-sided rewards

The recipient side is usually the more valuable half, and the harder one for us.

**What the recipient can honestly receive today:**
- The shared artifact itself, viewable with no signup. Already true at `/share/<shareId>`.
- The program, ready to start after signup rather than a blank dashboard. `sourceProgramId` on
  `Share` exists precisely for this.
- The context of who sent it. `ownerName` powers "Shared by <name>", which is real social proof
  we could not otherwise claim.

**That is a genuinely good recipient experience and it costs nothing.** Build it before
considering any reward at all. A recipient who lands on the exact program a friend recommended,
already loaded, is better served than one who lands on a generic homepage holding a coupon.

---

## If a reward ships, the copy rules

- State exactly what it is and when it arrives. No "surprise" rewards, no vague "perks."
- State the condition precisely. "Invited someone who created an account" is a condition.
  "Referred a friend" is ambiguous and will produce disputes.
- State the limit up front if there is one.
- Never use countdowns, scarcity language, or invented deadlines. Honest urgency comes from a
  real cohort start, a real program drop, or a real week boundary. See `offer-design`.
- Never imply the reward is worth money.

```
❌ Refer friends and unlock exclusive rewards! Limited time only!
✅ Invited someone who created an account this month? The new strength program lands for you
   on the 3rd, a week before everyone else.
```

---

## Measuring whether the reward did anything

Do not assume. Compare ask acceptance in the periods before and after the reward exists, with the
same artifact and the same trigger moment. If acceptance did not move, the reward was not the
bottleneck and should be removed rather than enlarged.

At Become's volume this comparison will be noisy. Read it sequentially over several weeks rather
than declaring a result from one good week, and see `ab-testing` for the sizing reality and the
low-traffic playbook. Any external benchmark used to argue for a reward design must carry its
tier label (Tier A platform-published, Tier B named case study, Tier C vendor blog) and may never
be restated as a Become results claim in public copy.
