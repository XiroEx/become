# Hard Constraints

Non-negotiable. These survive into the generated output of every marketing skill. Copy the short
form into `marketing/.agents/become-context.md` section 12; keep this file as the reasoning.

## The five

**1. No fabricated testimonials, user counts, results claims, or pricing.**
Become is free today and no pricing exists. Never invent a price, a tier, a trial length, or a
discount. Never invent a member quote, a star rating, a "trusted by," a download number, or a
retention figure.

*Why it bites here:* a free pre-revenue product has nothing to anchor value against, so the
temptation to reach for social proof is constant. The honest substitute is mechanism proof.
Show one photo of a plate coming back itemized. That is more persuasive than "5,000 users" and it
is true.

*Edge cases:* "free today" is the only permitted price statement. Do not write "free forever,"
because we cannot promise it. Do not write "free while in beta," because it implies a future
price and puts "(beta)" in the copy. Do not write "no credit card required for your trial,"
because there is no trial.

**2. Product screenshots come only from dummy accounts via the documented capture pipeline.**
The pipeline is recorded in `webapp/public/screenshots/v2/manifest.json`: 390x844 viewport at 2x,
against production, with state seeded through the app's own HTTP APIs, on named dummy accounts.
A shot must never show a bug, an empty state, a zero row, a locked-card wall, a dev banner, a
mid-animation frame, or the string "(beta)".

*Why it bites here:* production and beta share one database. Every capture write is a production
write. And the manifest's `knownIssues` list exists precisely because some shots needed DOM
patching at capture time. Read it before reusing a shot.

*Never:* capture a real user's account. Never publish a screenshot showing another person's data.

**3. No personal camera-roll photos of the coach.**
Jon's own phone photos are not brand assets. Anything fronted by him is either a deliberate shoot
or a product capture. This protects him and keeps the visual system consistent.

**4. The Becoming is design inspiration and at most one section or mention.**
It is a strong internal idea and a weak headline. As a theme it makes the product sound abstract
and spiritual, which is the opposite of "evidence, not vibes." Use it as one Progress-hub
feature, one landing section at most, one beat in a script at most. Never the hero line, never
the category, never the campaign name.

**5. Health and fitness claims stay responsible.**
No medical claims. No promised timelines or pound counts. No body-shaming. No before/after
framing that implies a guaranteed outcome. Injury, medical, and pregnancy questions get a
referral response, not an answer. This applies to creator and member content too: their claims
become our claims the moment we amplify them.

## Two library rules that follow

**Source tiers for any statistic.**

| Tier | What it is | May be used to |
|---|---|---|
| A | Platform-published or large-sample study | Steer internal decisions; cite internally with the tier named |
| B | Named case study with corroboration | Steer internal decisions; cite with the tier named |
| C | Vendor or SEO blog, unverifiable sample | Weakly steer; always label; never lean on |

**No tier may ever be restated as a Become results claim in public copy.** A benchmark about
Instagram carousels is not a claim about Become. Say so explicitly wherever a number is cited.

**Assets are reused, not regenerated.** If a capture, render, or reference already exists in the
repo, point at it. Regenerating burns credits, risks a worse capture, and drifts the brand.

## Safety rules that apply to every skill

- Never write a token, connection string, password, API key, or dummy-account credential into a
  skill file, a reference file, or generated output. Refer to the mechanism, never the value.
- Dummy account names may be written down because they are already in a committed manifest.
  Their tokens may not.
- Any shell command a skill instructs an agent to run must be bounded. Wrap long-running commands
  in `timeout`. Never write an unbounded `until` wait.
- Repo paths are always repo-relative and backticked. Never absolute paths.

## The one-question test

Before any line ships, ask: **is every word of this literally true today?**

If a word is aspirational, a rounding, a "basically," or a thing that will be true next sprint,
it fails. Rewrite it as the thing that is true now. There is always a true version, and it is
usually more concrete and therefore better.
