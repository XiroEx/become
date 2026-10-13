# The Five Edit Passes

Run them in this order on every draft. Each pass has a trigger list, a mechanic, and a stop
condition. Do not merge passes: merging is how a slop fix quietly introduces an untrue claim.

---

## Pass 1: Truth

**Trigger scan.** Search the draft for: any digit, any superlative, any comparison, any time period,
any currency symbol, any word ending in "-est," any capability noun, and the words "proven,"
"guaranteed," "trusted," "rated," "clinically," "free," "trial," "plan," "tier."

**Mechanic.**

1. For each hit, ask: is this true on `become.redbtn.io` today?
2. If yes and verifiable, keep it and note the source in the reasons list.
3. If yes but unverifiable by us, downgrade to the smaller true version.
4. If no, cut it and move it to the flagged bucket with a named verifier.

**Downgrade ladder**, from strongest to safest. Take the highest rung you can actually stand on.

```
"Proven to build consistency"                      <- fabricated, cut
"Built to build consistency"                       <- hedge, still weak
"Shows your streak and your next session"          <- mechanic, true
"Streak, mood, weight, calories, next session"     <- the screen itself, unarguable
```

**Stop condition.** Every claim in the draft is either verified, downgraded, or flagged. No maybes.

---

## Pass 2: Slop

**Trigger scan.** Full banned list in `references/banned-words.md`. Plus: em dashes, sentences
opening with "In," "There," "It is," "By," "Whether," "Tired of," and any three-item list of
adjectives.

**Mechanic.**

1. Delete first. Reread. Most slop sentences do not need a replacement.
2. If the sentence collapsed, it was carrying nothing and should stay deleted.
3. If it collapsed and mattered, rewrite it in pass 3 as a concrete statement.
4. Replace each em dash with a period, a comma, or a colon.

**Deletion test.** Cover the sentence with your hand. Does the paragraph still make the same point
and the same ask? If yes, the sentence goes.

**Stop condition.** Zero banned words, near-zero em dashes, no throat-clearing opener, no closing
summary paragraph.

---

## Pass 3: Concreteness

**Trigger scan.** Every abstract noun (Tier 2 in `references/banned-words.md`), every generic verb,
every sentence that would be equally true of MyFitnessPal, Hevy, or a coach's Google Sheet.

**Mechanic.**

1. For each abstraction, ask "what is on the screen when this is true?" That answer is the
   replacement.
2. For each outcome claim, add or substitute the mechanic that produces it.
3. Add one physical detail per block, if the surface has room. Details are what make copy sound like
   it came from someone who trains.

**The competitor test.** Rewrite the sentence with a competitor's name in it. If it is still true,
you have not written a Become sentence yet.

```
Draft:      "Become helps you stay on track with your nutrition goals."
Test:       "MyFitnessPal helps you stay on track with your nutrition goals."  <- also true, fail
Rewrite:    "Photograph the plate. It comes back split into chicken, rice, and sauce."
Test again: MyFitnessPal does not itemize a plate from one photo.              <- pass
```

**Stop condition.** Every block names at least one thing that exists on a Become screen.

---

## Pass 4: Rhythm

**Trigger scan.** Count words per sentence and write the sequence down. Look for runs of three
sentences within two words of each other. Look for sentences over 25 words. Look for the main verb
appearing after word eight.

**Mechanic.**

1. Break any sentence over 25 words into two.
2. Vary the sequence deliberately. A good block reads something like 6, 14, 4, 11.
3. Move the subject and verb to the front. "Become plans your week" beats "What Become does is plan
   your week for you."
4. End every block on the strongest word. Delete trailing qualifiers.
5. Read it aloud once. Every place you stumble is a place the reader stumbles.

**Stop condition.** No run of three same-length sentences, no sentence over 25 words, every block
ending on a strong word.

---

## Pass 5: Fit

**Trigger scan.** The surface's character and word limits (`copywriting` →
`references/surface-specs.md`), the component the copy lives in, the image it sits beside.

**Mechanic.**

1. Count characters or words for every limited field. Count, do not estimate.
2. If over, cut in this order: adverbs, adjectives, the second idea, the article, the verb if an
   imperative fragment still reads.
3. Check the copy against its component. Landing copy goes back to
   `webapp/components/landing/BecomeLanding.tsx`. Does it still fit the slot's shape (an array of
   headline lines, a card body that has to match its siblings, a two-line label)?
4. Check the copy against its image. If it sits beside a capture from
   `webapp/public/screenshots/v2/`, does it still describe what is in that shot?
5. Confirm the ask survived. Read the final block as the visitor and name the next action out loud.

**Stop condition.** Every field within limits, counts printed, ask intact, copy consistent with the
image beside it.

---

## Register handling

Before pass 2, decide the register. It changes which passes apply.

| Register | Marker | Passes to run | Passes to skip |
|---|---|---|---|
| Product | Second person, present tense, mechanism-first | All five | none |
| Coach (Jon) | First person, experience-first, direct address | 1 and 5 only | 2, 3, 4 |
| Mixed in one block | Both persons present | Flag it as a finding | edit after the split |

Editing Jon's voice into product voice is the most common way this skill damages a draft. His
roughness is the authenticity. Truth and fit still apply, because the constraints apply to everyone.

Anything structural in Jon's copy goes to `coach-brand-voice`.

---

## Worked run

**Draft in (58 words):**

> Become isn't just another fitness app — it's a comprehensive, all-in-one platform designed to
> seamlessly integrate your training, nutrition, and mindset journey. Trusted by thousands of users,
> our revolutionary AI helps you unlock your potential and finally achieve the results you deserve.
> Start your transformation today, completely free!

**Pass 1 (truth).** "Trusted by thousands" is a fabrication, cut and flag. "the results you deserve"
is a promised outcome, cut. "completely free" survives as a statement about today, but "Start your
transformation" implies a result, so it is rewritten in pass 3.

**Pass 2 (slop).** Cut: "isn't just another... it's," "comprehensive," "all-in-one," "platform,"
"designed to," "seamlessly integrate," "journey," "revolutionary," "unlock your potential,"
"finally," "transformation." One em dash removed. One exclamation mark removed.

**Pass 3 (concreteness).** "AI" becomes what it does. "Training, nutrition and mindset" becomes the
five hubs on one screen. The free line becomes what is actually true: no credit card, nothing gated.

**Pass 4 (rhythm).** Sequence in: 27, 24, 7. Sequence out: 9, 13, 5.

**Pass 5 (fit).** Section lead budget is 20 to 35 words. Final is 27.

**Draft out (27 words):**

> Become runs the whole plan: coach-built programs, food logged from a photo, mind sessions, and a
> weekly recap. One app. Sign up with your email, no credit card.

**Reported:** 58 words to 27, down 53 percent. One claim flagged: "trusted by thousands," no source,
cut permanently, do not reintroduce.
