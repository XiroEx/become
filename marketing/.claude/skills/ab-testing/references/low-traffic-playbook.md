# The Low-Traffic Playbook

What to do instead of an underpowered split test. This is Become's default mode, not a fallback.

The governing idea: at low volume, **learning is cheap and proof is expensive.** Spend on
learning.

---

## 1. Ship-and-watch

The primary method.

**How:**
1. Reason the change out using `landing-cro`, `marketing-psychology`, and `copywriting`.
2. Write down what you expect to happen and by how much, before shipping. This is the whole
   discipline: a prediction you can be wrong about.
3. Ship to 100% of traffic.
4. Measure a pre window and a post window of equal length, whole weeks, 4 and 4 where possible.
5. Report directionally, with confounds listed.

**When it is valid:** the change is large, the metric is stable, and no launch, seasonal shift, or
big content moment sits inside either window.

**When it is not:** across January, across a Product Hunt launch, or when a Reel spiked traffic in
one window. Note the confound and refuse the causal claim.

**The honest framing:** ❌ "The new hero increased signups by 22%." ✅ "Signups per visitor moved
from 3.9% to 4.8% across the 4 weeks after the hero change. A Reel drove atypical traffic in
week 2, so this is directional, not causal."

## 2. Five-second tests

The fastest way to kill a bad hero.

Show the top of the page for five seconds, then take it away and ask:
- What does this product do?
- Who is it for?
- What would happen if you tapped the button?

Ten people is enough to find a clarity problem. If five of ten cannot say what Become does, no
statistical test was going to save that hero.

Recruit from anyone outside the project: friends, a Discord, a subreddit that allows it, gym
members with permission. Never present it as a Become endorsement, and never turn the responses
into a testimonial. They are diagnostic, not proof.

## 3. Session review

Watch or reconstruct 10 real sessions on the landing page and the signup flow, on mobile.

What to look for:
- Where the thumb stops scrolling.
- Whether the CTA is ever reached.
- Whether the magic-link handoff confuses them (they switch to mail, then never come back to the
  tab).
- Rage taps on non-interactive elements.

Ten sessions routinely produce a bigger fix than a quarter of split testing. Respect privacy:
never review a session containing another person's health data, and never export one.

## 4. Painted-door and demand tests

Measure intent for something that does not exist yet.

**Legitimate:** a link or a button that leads to an honest "not available today" message, plus a
way to be told when it is. Count taps as intent.

**Never:** a fake checkout, an invented price, a fake trial, a countdown to nothing. Become has no
pricing and none may be simulated, including as a test. See `offer-design`.

Report a painted-door result as intent, not adoption. People tap things they would not use.

## 5. Test where the volume is

| Surface | Why it resolves faster | Owner skill |
|---|---|---|
| Ad creative | The platform buys thousands of impressions in days | `paid-social` |
| Email subject lines | The whole list is the sample, and open or click is immediate | `email-lifecycle` |
| Push copy | Same, with a strict opt-out guardrail | `push-notifications` |
| Organic hooks | Every Reel is a hook test with real reach | `reels-scripts`, `social-strategy` |
| Directory taglines | Multiple surfaces, same product, different framing | `web-app-listing` |

The pattern: learn the **angle** where impressions are cheap, then bring the winning angle to the
landing page as a reasoned ship. Organic hook performance is the closest thing Become has to a
free message-testing lab. It is noisy and confounded by the algorithm, so treat it as direction,
never as a rate.

## 6. Big swings only

If you are going to spend weeks of traffic, spend them on something that could plausibly move the
metric by half.

| Not worth testing here | Worth testing here |
|---|---|
| Button colour, corner radius, microcopy on a secondary link | An entirely different first screen |
| Reordering two mid-page sections | Proof element present versus absent above the fold |
| Subhead wording | A different primary action (start a session vs create an account) |
| Adding a third feature card | Removing half the page |

A useful screening question: "If this wins, would we change anything else we do?" If not, ship the
better version and move on.

## 7. Qualitative signal, labelled

Five people is a direction. Say so.

❌ "60% of users said the hero was confusing."
✅ "Six of ten people, in a five-second test, could not say what Become does after seeing the
hero. Small sample, diagnostic only."

Never convert a qualitative comment into a testimonial, a quote in an ad, or a claim. If a real
member says something usable, it needs written permission (see `ugc-creator-briefs`).

## 8. The stack, in order

Run down this list before anyone proposes a split test:

1. Is there a funnel number that already tells us where the leak is? (`analytics-tracking`)
2. Have ten people looked at this for five seconds?
3. Have we watched ten mobile sessions?
4. Is this angle testable in ads, email, or organic hooks this week?
5. Is the change big enough that a split test could resolve it in under 6 weeks?
6. Only then: design the test.

Most questions die at step 1, 2, or 3, which is the point.

## 9. What we never do at low traffic

- Run four variants and pick the top one. That is a lottery.
- Stop a test the day it crosses p < 0.05 without a sequential method declared in advance.
- Slice a null result until a segment wins.
- Use beta as a test arm against production. Both channels share one database and beta carries
  different `NEXT_PUBLIC_APP_URL` and app-name values, which confound everything.
- Test a variant that violates a hard constraint (invented pricing, a results claim, a shaming
  hook) on the theory that we would only ship it if it wins. It does not get built.
