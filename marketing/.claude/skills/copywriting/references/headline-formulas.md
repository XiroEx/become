# Headline Formulas

Ten shapes, ordered by how often they work for Become. Each carries the formula, when it wins, and a
worked pair per hub. Every example is true of the product today.

Rules that apply to all ten: concrete noun in the first four words, no banned words, near-zero em
dashes, second person or no person, and it must read alone with no image.

---

## 1. Outcome without the pain

`<What you get> without <what they hate>`

Wins on cold traffic and on the hero, because the pain is what they came in carrying.

| ❌ Weak | ✅ Strong |
|---|---|
| An all-in-one fitness platform | One plan. Not five apps. |
| Personalized programming for everyone | A coach's structure, without the scheduling. |
| Nutrition tracking made easy | Log the plate without typing a single food. |

The pain half must be a pain they name themselves: app-hopping, retyping food, forgetting what they
lifted, restarting Monday. Not a pain we invented so the sentence balances.

## 2. The concrete noun

`<The thing literally on screen>`

Wins on section headers and feature blocks, where the reader is already scrolling and wants to know
what this part is.

| ❌ Weak | ✅ Strong |
|---|---|
| Track your progress | Your week, written back to you. |
| Smart workout logging | Set 3 of 3. Last set 155 by 10. |
| AI-powered planning | Tell it your equipment. It builds the session. |

## 3. The specific moment

`<Day> <time> <situation>` or `<The exact instant the product earns its place>`

Wins in ads and Reels captions, where a scene beats a claim.

| ❌ Weak | ✅ Strong |
|---|---|
| Stay consistent with your training | It is 6:40 on a Tuesday and you already know the lift. |
| Never lose track of your meals | You photographed the plate. That was the whole log. |
| Build a habit that sticks | Sunday night, the recap tells you what your week actually was. |

## 4. The honest contrast

`<What we do> <What you do>` as two clauses of equal weight

Wins where the differentiator is a division of labour. This is the shape that carries the coach plus
AI story without overclaiming either side.

| ❌ Weak | ✅ Strong |
|---|---|
| AI-generated workouts tailored to you | A coach builds the phases. The AI fills the gaps. |
| Complete fitness tracking | You lift. It counts. |
| Personalized nutrition guidance | You photograph the plate. It itemizes it. |

## 5. The mechanism as headline

`<The strange thing it does>`

Reserve for the two mechanics strange enough to stop a scroll: camera rep counting and whole-plate
photo logging. Overused, it becomes a spec sheet.

- ✅ "Put the phone down. It still counts."
- ✅ "One photo. The whole plate, itemized."
- ❌ "Computer-vision-powered repetition detection." Correct, unreadable.

## 6. The number that is ours

`<A real count from the product>`

Only counts that exist in the product and can be verified: hubs, program phases, onboarding steps,
demo videos in `webapp/public/exercises/`. Never a user count, never a result.

- ✅ "Five hubs. One screen."
- ✅ "Three steps to day one." (already live in the how-it-works section)
- ❌ "Join 10,000 lifters." Fabricated. Never.

## 7. The objection answered first

`<The thing they were about to worry about>, <the answer>`

Wins directly above a signup form and in the closing CTA.

- ✅ "No password to remember. We email you a link."
- ✅ "No credit card. Nothing is gated today."
- ❌ "Sign up risk-free!" Says nothing and sounds like a trial that ends.

## 8. The reframe

`You are not <the thing they blame themselves for>. Your <tools> were <the real problem>.`

The single most on-brand shape we have, because it refuses the shame framing the whole category
runs on. Use sparingly, once per surface at most.

- ✅ "You did not lack discipline. Your plan was in four apps."
- ❌ "No more excuses." Banned framing, and untrue about the reader.

## 9. The instruction

`<Verb> <object>.`

Wins on buttons, push titles, and short ad hooks. Imperative, present tense, no adverbs.

- ✅ "Log the set." / "Scan the barcode." / "Read the recap."
- ❌ "Start tracking your nutrition today with Become." Three ideas in a button.

## 10. The category claim

`Become is <the category we chose>.`

Only usable once positioning is locked. Check `marketing/.agents/become-context.md` for the current
frame before writing one. Do not frame Become as a "workout tracker": that frame loses on depth to
the dedicated loggers and hides everything we are better at.

---

## Working a headline down to length

Start long, cut in this order: adverbs, then adjectives, then the second idea, then the article, then
the verb if an imperative fragment still reads.

```
1. Become organizes your training, nutrition, and mindset into one clear plan.     (11 words)
2. Become puts training, nutrition, and mindset on one screen.                     (9 words)
3. Training, nutrition, and mind. One screen.                                      (6 words)
4. One plan. Not five apps.                                                        (5 words)
```

At 390px, a hero line over 8 words wraps to three lines and the CTA falls below the fold. Eight words
is the hard ceiling for line one.

## Live reference

The current landing hero is in `webapp/components/landing/BecomeLanding.tsx` (the `Hero` component).
Read it before writing a replacement so the new line sits in the same register as the sections
underneath it, and so the eyebrow, lead, and footnote stay coherent with whatever you change.
