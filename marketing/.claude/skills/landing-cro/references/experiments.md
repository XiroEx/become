# Experiment Backlog

Candidate changes to the Become entry surface, written as hypotheses. Ordered by expected value, not
by how interesting they are. Nothing here is a decision. Hand any of these to `ab-testing` for sizing
before running a split; at our traffic the honest answer is often to ship the better-reasoned version
and measure sequentially with pre and post windows.

Hypothesis format used throughout:

> Because [evidence], we believe [change] will cause [metric] to [direction] for [segment], measured
> by [event], and we are wrong if [guardrail].

Primary metric for the entry surface: **landing to `/register` rate**, with a downstream guardrail of
**register to account-created rate** so a change that pulls unqualified clicks is caught. Event
naming and definitions belong to `analytics-tracking`.

---

## Tier 1: highest expected value

### E1. Inline email capture in the hero

Because both CTAs currently navigate to `/register` before the visitor sees a field, we believe
putting an email input directly in the hero, posting to the same magic-link endpoint, will cause the
landing to email-submitted rate to rise for mobile visitors, measured by the send-link event, and we
are wrong if account-created per visitor falls or the send-link to link-clicked rate drops.

Effort: medium. Touches `Hero` in `BecomeLanding.tsx` and reuses the `AuthForm` submit path.
Risk: it puts the highest-commitment element in the highest-attention slot; if the value is not clear
yet, it can read as a mailing-list capture.

### E2. Mechanism-first hero versus possession-claim hero

Because the current H1 makes a claim about the app's completeness while our two most distinctive
mechanics are camera rep counting and whole-plate photo logging, we believe a mechanism-first H1
will cause the landing to `/register` rate to rise for cold social traffic, measured by CTA clicks,
and we are wrong if scroll depth past the why section falls.

Variants to draft through `copywriting`:
- A (control): "The only fitness app your goal actually needs."
- B (mechanism): "Put the phone down. It still counts."
- C (contrast): "A coach builds the phases. Your phone runs them."
- D (reframe): "You did not lack discipline. Your plan was in four apps."

### E3. Sticky CTA after the hero leaves the viewport

Because the page currently offers only two asks, nine sections apart, we believe a sticky bottom CTA
that appears once the hero scrolls out will cause CTA clicks per session to rise, measured by clicks
attributed to the sticky element, and we are wrong if scroll depth or time on page falls, which would
suggest it is covering content.

Must respect `env(safe-area-inset-bottom)` and `prefers-reduced-motion`.

### E4. Move coach credibility above the fold

Because the only substantial proof on the page sits ninth in the section order while the belief
question forms in the first second, we believe surfacing Jon as the coach who built the programs in
or immediately under the hero will cause the landing to `/register` rate to rise, measured by CTA
clicks, and we are wrong if it pushes the CTA below the fold on 390px.

The hero footnote already does a minimal version. The test is whether a stronger, still compact
treatment beats it.

### E5. Answer the magic-link objection at the CTA

Because signup requires trusting a passwordless flow that many visitors have not used, we believe
adding a one-line explanation directly under both CTAs will cause the register to send-link rate to
rise, measured by the send-link event per `/register` view, and we are wrong if landing CTA clicks
fall, which would mean the explanation reads as friction rather than reassurance.

Candidate line: "No password. We email you a link that signs you in."

---

## Tier 2: structural, higher cost

### E6. Condense five hub sections into a tour plus two deep dives

Because the current order walks the product's org chart rather than the visitor's question order, we
believe replacing Dashboard, Training, Nutrition, Mind, and Progress with one scannable five-hub tour
plus deep dives on the two differentiating mechanics will cause completion to the closing CTA to
rise, measured by closing-section CTA clicks per session, and we are wrong if per-hub interest
signals disappear entirely.

### E7. Move "Three steps to day one" above the hub sections

Because "is this a lot of work" forms in the hero but is answered eighth, we believe moving
`StepsSection` directly after `WhySection` will cause the landing to `/register` rate to rise,
measured by CTA clicks, and we are wrong if scroll depth into the hub sections falls sharply.

Cheap to try. This is an order change, not a rebuild.

### E8. Per-hub contextual CTAs

Because a visitor convinced by one hub has to scroll to the closing section to act, we believe adding
a contextual CTA to each hub section, using that section's language and the same destination, will
cause total CTA clicks to rise, measured per section, and we are wrong if the closing conversion falls
without a matching rise elsewhere.

### E9. Reduce hero motion cost

Because the hero runs staggered entrances plus two infinite float loops plus a five-chip 21-second
loop, we believe rendering hero text and CTA at final position immediately, keeping motion as
enhancement, will cause LCP and interaction readiness to improve, measured by Lighthouse on
production, and we are wrong if the page reads as visually flat to Jon and George on review.

Design intent is a real constraint here. This is a negotiation, not a unilateral fix.

### E10. Purpose-built landing for share traffic

Because `/share/[shareId]` visitors arrive with a specific artifact and a specific sender, we believe
a share-aware entry treatment will cause share-to-signup to rise, measured by registrations
attributed to a share link, and we are wrong if it adds a step for people who only wanted to look.

Coordinate with `referral-program`, which owns the loop, and `signup-activation`, which owns what the
recipient meets after the click.

---

## Tier 3: measure first, then decide

- **E11.** Meta description and OG card copy: currently thin, no OG image. Owned by `seo-geo` for the
  fields, `copywriting` for the words. Measure click-through from shared links first.
- **E12.** Demo clip in the hero instead of static phones. Uses `webapp/public/exercises/` `.mp4`
  files; the `.mov` variants fail in Chromium. Weigh against E9.
- **E13.** Nav simplification. Low expected value until the primary path is settled.
- **E14.** Light versus dark default framing in captures. Neither theme is optional, so this is a
  question about which twin leads, not which one exists.

---

## What we do not test

- Anything requiring fabricated proof: counters, ratings, testimonial cards, "trusted by" strips.
- Anything requiring invented pricing, a trial length, a discount, or a founder rate.
- Fake urgency: countdowns, "limited spots," expiring offers we do not have.
- Confirmshaming exit intents ("No thanks, I like being out of shape").
- Any variant that shows a real user's data, or a capture with a bug, an empty state, or "(beta)".
- Button colour tests and micro-copy tweaks on a single word. At our volume they are unreadable and
  they crowd out the four or five changes that could actually move the number.

## Running any of these

1. Size it with `ab-testing`. Get an explicit run it, ship it, or skip it verdict.
2. Confirm the metric exists as an event. If it does not, `analytics-tracking` comes first.
3. Isolate by channel or route. Production and beta share one database, so a naive split can mix
   channels silently.
4. Agree the decision rule before the first visitor sees the variant.
5. Ship through the repo pipeline: feature branch, then `beta`, then `main`.
