# Review Mining

The cheapest research we have. Competitor reviews are simultaneously a weakness map, a
differentiation source, and the only free supply of verbatim customer language for
`marketing/.agents/become-context.md` section 9.

## Where to look, in order of value

| Source | Why | Watch out for |
|---|---|---|
| App Store and Play reviews, 1 and 3 star | Highest signal. People describe the exact moment they gave up | Version-specific bug complaints age out fast |
| Reddit threads asking "is X worth it" | Comparison language in the user's own words | Small samples, strong opinions |
| Reviews sorted by "most recent" | Tells you whether a complaint is current | Recency bias in the other direction |
| Trustpilot or similar, where present | Cancellation and billing friction | Skews to the angry end |
| Their own subreddit or community | Power-user complaints, which predict our future ones | Insiders, not switchers |

**Why 3-star over 1-star.** One-star reviews are often about billing, a crash, or a single bad
week. Three-star reviews are the most useful in the set: the person likes the product, kept using
it, and is describing a real, structural limitation. That limitation is the positional cost we
attack.

## Method

1. **Collect 30 to 50 reviews** across 1 and 3 star, sorted by most recent. Stop when new reviews
   stop producing new themes.
2. **Tally themes,** do not summarise reviews. One row per theme, count the mentions.
3. **Capture five or more verbatim quotes** with grammar intact, plus source and date.
4. **Score each theme** by frequency times recency. A theme mentioned 12 times in the last three
   months beats one mentioned 30 times in 2023.
5. **Classify each theme** into the three buckets below.
6. **Feed the language back** into `become-context` section 9 with attribution.

## The tally sheet

| Theme | Mentions | Most recent | Verbatim example | Bucket |
|---|---|---|---|---|
| | | | | |

## The three buckets

| Bucket | Meaning | What to do |
|---|---|---|
| **We solve this today** | Our product has a real answer, provable now | This is differentiation. Feed it to `positioning` |
| **We would inherit this at scale** | It comes with size, not with design | Note it as a future risk. Do not use it as a differentiator |
| **Not our problem** | Different job, different audience | Drop it |

Examples of the middle bucket: slow support responses, notification volume complaints, and pricing
resentment. All three arrive with growth regardless of product quality. Using them as
differentiation is the classic mistake, because we will be accused of the same thing within a year.

## Capturing language

Verbatim means verbatim.

```
✅ "I never know what to do when I get to the gym so I just do the same thing every time"
   — Play Store 3-star review of <app>, 2026-07-14

❌ Users report a lack of workout guidance leading to repetitive training.
   (This is our sentence, not theirs. It has lost everything that made it worth collecting.)
```

Rules:
- Keep the grammar, the lowercase, the run-on sentence. That texture is the value.
- Always carry source and date.
- Store in `marketing/.agents/become-context.md` section 9, never in an ad without the rules below.

## What you may and may not do with a mined quote

| Use | Allowed |
|---|---|
| Internal research and positioning input | Yes |
| Source of pain language for our own copy, rewritten in our voice | Yes |
| Quoting it as a Become testimonial | **Never.** That is fabrication |
| Quoting it as "what users say about <competitor>" in public copy | Only with the source shown, the date shown, and a check that it is representative. Usually not worth it |
| Screenshotting a competitor's review page into our creative | No. Competitor imagery stays internal |

## Turning a complaint into differentiation

The move is: their real strength, their positional cost, our mechanism. Never mockery.

```
Complaint theme: "logging food takes forever, I gave up after two weeks"

❌ Tired of spending 10 minutes logging every meal? Switch to Become.
✅ Their food database is enormous, and searching it six times a meal is why most people stop.
   Become starts from a photo of the plate.
```

```
Complaint theme: "great for tracking but I still don't know what workout to do"

❌ Other apps leave you guessing. We don't.
✅ A logger records the session you chose. Become gives you the week, then logs it.
```

Both strong versions concede a real strength first. That concession is what makes the second
clause believable, and it is the pattern that survives a comment thread.

## Guardrails

- Never present mined complaints as our own users' words.
- Never invent a quote, a count of complaints, or a rating.
- Label the source tier: app-store review text is **Tier A** as evidence of what that reviewer
  said, but any inference about how common it is across the whole user base is **Tier C** unless
  you counted a real sample and say how many.
- No tier may ever be restated as a Become results claim in public copy.
