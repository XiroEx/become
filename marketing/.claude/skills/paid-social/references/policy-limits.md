# Policy Limits for Fitness Ads

Platform policy and our own constraints overlap almost completely here. Where they differ, ours
is stricter. Policies change; re-check the platform's current text before a launch and note the
date you checked.

---

## 1. Personal attributes

Both Meta and TikTok prohibit ad content that implies or asserts knowledge of a person's personal
attributes, including health, physical condition, and weight. This is the rule fitness advertisers
break most often, usually in the first line of the primary text.

The tell is second person plus a body noun.

| ❌ Violating | ✅ Compliant |
|---|---|
| "Struggling with your belly fat?" | "Five apps for one workout. Become does all of it." |
| "Are you overweight and out of options?" | "A coach-built plan, phase by phase." |
| "You know you need to lose weight." | "Log the set. Scan the plate. See the week." |
| "Your body is holding you back." | "Your phone counts the reps." |
| "Tired of being out of shape?" | "Tired of five apps that do not talk to each other?" |

Rule of thumb: describe the **product** and the **friction with tools**, never the viewer's body.
This is also exactly what our voice rules require, so there is no tension to manage.

## 2. Before and after, and body imagery

Prohibited or heavily restricted on both platforms, and prohibited outright by our own
constraints:

- Side-by-side before/after images or any implied transformation sequence.
- Zoomed-in body parts, isolated abs, isolated waistlines.
- Idealized or unexpected body imagery used to create negative self-perception.
- Images implying a specific physical outcome from using the product.

Become never runs any of these regardless of platform policy. Our proof is the mechanism and the
coach, not a body.

## 3. Health claims

No claim of diagnosis, treatment, cure, prevention, or medical outcome. No implied clinical
authority.

| ❌ | ✅ |
|---|---|
| "Fix your metabolism." | "Set your calorie and macro targets." |
| "Heal your relationship with food." | "See what is actually on the plate." |
| "Clinically proven approach." | "Programs built by coach Jon Don." |
| "Reduce your risk of injury." | "Form cues and a demo clip on every exercise." |

Anything touching injury, pain, pregnancy, or a medical condition gets the referral response, not
an ad. See `coach-brand-voice`.

## 4. Results and timelines

Our constraint, stricter than policy: **no promised timelines, no pound counts, no guaranteed
outcomes**, in our copy or in creator copy we amplify.

| ❌ | ✅ |
|---|---|
| "Lose 10 pounds in 30 days." | "Log every session and see the trend." |
| "Get shredded by summer." | "A plan for the next twelve weeks, phase by phase." |
| "Guaranteed results." | "Coach-built programs. Free today." |
| "Members lose an average of X." | Say nothing. We have no such figure and would not publish it. |

## 5. Pricing

There is no pricing. There is no tier, no trial, no discount, no founder rate, no "limited time
free."

Permitted price statements, exhaustively:
- "Free today."
- "Free, no credit card."
- "No card required."

Never: "Free for a limited time," "Free while in beta," "Normally $X," "Get 50% off," a countdown
to a price change, or a CTA button implying a purchase. See `offer-design`.

## 6. Fabricated proof

Banned in every ad, every caption, every creator cut:

- Invented testimonials or member quotes.
- Star ratings or review counts (we are a PWA and have none).
- User counts ("join 10,000 people").
- Download numbers.
- Screenshots of fabricated app-store reviews or fabricated DMs.
- Any internal metric restated as a public claim. A test lift or a retention number is internal.

What we can show as proof: the mechanism working on a real screen, the coach and what he has
actually built, real product captures from `webapp/public/screenshots/v2/`, and member words only
with written permission (`ugc-creator-briefs`).

## 7. Creator content is our content

The moment we pay to amplify a creator asset, their claims become our claims for both policy and
constraint purposes.

Required before any Spark or whitelisted ad runs:
1. Written paid-amplification rights, with a usage window and territory.
2. Disclosure present in the video and in the caption, and preserved in the paid cut. Material
   connection includes gifted access, not only cash.
3. A claims review against sections 1 through 6 above. If the creator says a number, it comes out
   or the ad does not run.
4. No minors. No other person's health data visible on screen.

Full brief and do-not-say list: `ugc-creator-briefs`.

## 8. Age gating and targeting

- Weight-management-adjacent messaging is restricted to adults on both platforms. Set the minimum
  age to 18 on any ad that touches nutrition targets or body composition, even indirectly.
- Do not build custom audiences from health-related signals.
- Do not upload any customer list containing health information. If a list upload is ever
  considered, it carries email only, with consent, and never a weight, a goal, or a program name.

## 9. Landing-page compliance

The destination is reviewed too. The landing page must:
- Not contain a price, a discount, or a trial that does not exist.
- Not contain before/after imagery or body-shaming copy.
- Match the ad's promise. A mismatch is both a policy risk and the top conversion killer.
- Be the real page on `become.redbtn.io`. Never beta, never an invented offer page.

## 10. If an ad is rejected

1. Read the stated policy, not the guess. Screenshot it.
2. Fix the copy or the frame; do not resubmit the identical asset hoping for a different reviewer.
3. If the rejection is for personal attributes, the fix is almost always in the first line of the
   primary text or the first frame's on-screen text.
4. Repeated violations restrict the whole ad account. Two rejections in a week means stop and
   review the whole set, not resubmit a third.
5. Record the rejection and the fix in the campaign notes so the same copy is not written again in
   three months.

## 11. Pre-flight checklist

- [ ] No second-person body copy anywhere in text, captions, or on-screen overlays.
- [ ] No before/after, no isolated body parts, no idealized-body framing.
- [ ] No medical claim, no timeline, no pound count, no guaranteed outcome.
- [ ] No price other than "free today," no discount, no trial, no countdown.
- [ ] No fabricated testimonial, rating, user count, or download number.
- [ ] Creator rights signed, disclosure visible in both video and caption.
- [ ] Age minimum set to 18 where nutrition or body composition is referenced.
- [ ] Captures verified against `webapp/public/screenshots/v2/manifest.json`: no bug, no empty
      state, no "(beta)".
- [ ] Destination is the real production page with conforming UTMs.
- [ ] Policy text re-checked this month, with the date recorded in the plan.
