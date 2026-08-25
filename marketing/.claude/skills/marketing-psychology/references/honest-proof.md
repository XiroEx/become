# Honest Proof

Become has no user counts, no star ratings, no reviews, no testimonials, and no revenue figures.
None of them may be invented. This document is the complete inventory of what we can honestly
show, ranked by persuasive strength.

The governing idea: **proof a skeptic can verify beats proof they have to take on faith.** Since
we cannot offer the second kind, we should be glad we are forced into the first.

---

## Tier 1: Mechanism proof

The strongest proof available to us, and the pattern the strongest competitor creative uses too
(`inspo-library`: both reference brands sell the mechanism, not a promise).

**What it is:** show the capability working, on a real screen, in the time it takes to watch it.

| Mechanism | The proof | Asset |
|---|---|---|
| Camera counts reps | Footage of a set with the counter advancing untouched | Film it; reference `webapp/public/screenshots/v2/workout-log-dark.webp` |
| Photo itemizes a plate | One photo becoming separate line items with macros | `nutrition-meal-light.webp`, `nutrition-day-light.webp` |
| The week written back | The recap and the trend on one screen | `progress-light.webp`, `dashboard-light.webp` |
| Coach-built phases | The actual phase structure with days named | `workout-hub-light.webp` |
| AI generator | The sheet filled in, before submission | `generate-light.webp` |

Why it works: it is a falsifiable claim. The viewer can check it in under a minute, which is
precisely why they believe it without checking.

Rules: captures come only from dummy accounts through the documented pipeline
(`webapp/public/screenshots/v2/manifest.json`), never show a bug, an empty state, or "(beta)", and
appear in both light and dark across a set.

## Tier 2: Coach credibility

**What it is:** Jon Don built the programs, and the programs are inspectable. That is the claim.

Usable:
- The structure of what he built: multi-phase programs, named sessions, progression rules.
- His coaching perspective in his own first-person voice (`coach-brand-voice`).
- Verified credentials, only after they are confirmed with him and recorded in
  `marketing/.agents/become-context.md` tagged `[verified with Jon]`.

Not usable:
- Invented client results, invented client stories, invented years of experience.
- A client count we have not verified.
- Personal camera-roll photos.

✅ "Every program in Become is built in phases by coach Jon Don, with each session named in
advance."
❌ "Trusted by hundreds of clients over 15 years." (unless every word is verified, and then it
still needs a date)

## Tier 3: Specificity as proof

Precision reads as truth. Vagueness reads as marketing.

| Vague | Specific |
|---|---|
| "Track your nutrition easily" | "One photo, every item on the plate, with macros" |
| "Detailed progress tracking" | "See what you lifted last Tuesday, and whether it went up" |
| "Personalized programs" | "Phase 1, day 2 of 8, named before you get to the gym" |
| "Quick signup" | "One email field. No password. No card." |

This costs nothing and it is the single easiest upgrade to any Become page. See `copywriting`.

## Tier 4: Transparency as proof

Naming a limitation buys credibility for everything else on the page, and it is the trait that
makes content get cited by AI answers too (`seo-geo`).

Honest limitations we can state:
- Photo logging estimates. It gets you close, faster than weighing everything.
- It is a web app, not an App Store download. It installs to the home screen.
- It is free today. We do not say "free forever," because we do not know that.

✅ "Photo logging estimates the plate. It is faster than weighing, and close enough to steer the
day."
❌ "The most accurate food logging available." (unverifiable and probably false)

## Tier 5: Member words, with permission

Real member words are legitimate proof. They are the most constrained category, so treat the bar
as high.

Required before any member content is used:
1. Written permission for the specific use, recorded.
2. No minors.
3. No other person's health data visible.
4. No results claim in the quote. "I lost 12 pounds" does not run, even if it is true, because it
   implies a guaranteed outcome and it is a health claim.
5. No camera-roll body photos.

What survives that filter is usually a behavioural statement, which is more useful anyway:
✅ "I stopped keeping three apps open."
❌ "I lost 12 pounds in 6 weeks."

See `ugc-creator-briefs` for the permission and disclosure workflow.

---

## What we never use

| Never | Why |
|---|---|
| User counts, download counts, "join thousands" | We have no figure and would not publish one |
| Star ratings or review counts | We are a PWA. There is no store rating. Fabricating one is also a schema violation (`seo-geo`) |
| Invented testimonials or personas | Fabrication |
| "As seen in" logos we did not earn | Fabrication |
| "Backed by science" with no citation | Vague authority, the weakest sentence in fitness marketing |
| Before/after imagery | Hard constraint and a platform policy violation (`paid-social`) |
| Average member results | We have no such figure, and publishing one would be a results claim |
| An internal metric restated publicly | A retention number or a test lift is internal, always |

---

## Building a proof block for a page or an ad

Pick one from each tier, in this order, and stop at three:

1. **A mechanism shown** (Tier 1). The hero or the first frame.
2. **A specific sentence** (Tier 3). Directly under it.
3. **The coach** (Tier 2) or **a stated limitation** (Tier 4), whichever fits the objection this
   surface actually faces.

Three honest proof elements outperform six trust badges. Placement guidance for the landing page
belongs to `landing-cro`; the words belong to `copywriting`.

## The skeptic test

Before shipping any proof element, read it as the most cynical member of the audience:

- "How would they know that?" If there is no answer, cut it.
- "Can I check this myself in a minute?" If yes, it is Tier 1 and it should be more prominent.
- "Is this a claim about me, or about the product?" Claims about the viewer's body are out on
  both policy and constraint grounds.
- "Would this still be true if the product had ten users or ten thousand?" If it depends on the
  number, we cannot say it.
