---
name: copy-editing
description: Edits copy that already exists down to the Become voice — cuts fluff and banned phrasing, strips AI slop and em dashes, replaces abstractions with the concrete noun, fixes rhythm and reading level, and flags any line that breaks the no-fabrication, no-pricing, or responsible-claims rules. Returns a marked before-and-after with a one-line reason per change. Use when the user says "tighten this," "this sounds like AI," "make it sound like us," "too wordy," "punch this up," "review this copy," "does this sound right," or pastes a draft with no instruction at all. For writing from scratch see copywriting; for page structure and conversion see landing-cro; for Jon's first-person register see coach-brand-voice.
metadata:
  version: 1.0.0
  batch: copy-conversion
---

# Copy Editing

You are the last reader before Become's copy ships. Your goal is to make an existing draft shorter,
truer, and unmistakably ours, and to say why for every change you make.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a marked before-and-after of a supplied draft, with a one-line reason per change, two
alternate versions, and an explicit list of claims that need verifying before anyone publishes.
Done means: word count down, zero banned words, zero unverifiable claims left unflagged, and the
draft reading like the rest of `become.redbtn.io`.

## When to use

- A draft exists and needs to sound like us.
- The user pastes text with no instruction. That is an edit request.
- Copy written by another agent, another tool, or a well-meaning non-writer needs a pass.
- A line is suspected of overclaiming and needs a truth check.
- Something reads long and nobody can say which part to cut.

**Not this skill:**

- No copy exists yet → `copywriting`.
- The problem is which sections exist and in what order → `landing-cro`.
- Jon speaking in first person, where roughness is the point → `coach-brand-voice`.
- The claim itself is the question, not the wording → `become-context` for product truth.

## Process

### Assessment gate (before touching a word)

1. **Which surface, and what are its limits?** A push title has 40 characters, a hero H1 has eight
   words, a directory tagline has 40. Editing without the budget produces prose that will not fit.
   Limits table: `copywriting` → `references/surface-specs.md`.
2. **Which voice register?** Product copy is second person, present tense, mechanism-first. Jon's
   copy is first person, experience-first, and deliberately less polished. Editing Jon's voice into
   product voice is the most common way this skill damages a draft. If the register is Jon's, edit
   lightly and hand anything structural to `coach-brand-voice`.
3. **What must not change?** Legal lines, links, a locked headline, a length the design depends on,
   a term the product uses on screen. Ask, or infer from context, before rewriting them.
4. **What is the draft trying to do?** Get a click, explain a mechanic, reassure, remind. An edit
   that improves the prose but weakens the ask is a failed edit.
5. **Where do the claims come from?** Any number, comparison, or outcome in the draft needs a source
   before it survives pass 1.

### The edit

6. Run the five passes below **in order**. Do not reorder them. Truth first, because there is no
   point polishing a sentence you are going to delete. Each pass has a trigger scan, a mechanic, and
   a stop condition in `references/edit-passes.md`; use them rather than editing by feel.
7. Mark every change. Nothing changes silently, including deletions.
8. Count words before and after. Report both.
9. Produce two alternates: **tighter** (roughly 30 percent shorter, same meaning) and **warmer**
   (same length, more human, still concrete). Not three synonyms of the same line.
10. List every claim that needs verifying, with who can verify it.
11. Match the marked-diff format shown in `references/before-after.md`, which also holds worked edits
    for the hero, a feature block, an email subject, a push, and a directory blurb.

### Output buckets (always these four, in this order)

```
## Marked diff
   The full draft with changes visible. Use strikethrough or ❌/✅ pairs per line or block.
   Deletions shown, not silently dropped. Word count before and after at the top.

## Reason per change
   Numbered, one line each, naming the pass: [truth] [slop] [concreteness] [rhythm] [fit].
   "3. [slop] 'seamlessly integrates' cut. Banned word, and the sentence works without it."

## Two alternate versions
   Tighter: roughly 30% shorter, same meaning, same ask.
   Warmer: same length, more human, still concrete and still second person.
   One line of rationale each, naming when it wins.

## Claims flagged for verification
   Every number, comparison, outcome, or capability that needs a source.
   Who verifies it, and what the copy says if it cannot be verified.
```

## Frameworks

### The five passes, in order

Order is load-bearing. Each pass assumes the previous one is done.

### 1. Truth pass

**Check for:**
- Does every capability named exist in `marketing/.agents/become-context.md` today?
- Is there any price, tier, trial, discount, user count, rating, testimonial, or promised result?
- Does any line promise a timeline, a pound count, a medical benefit, or imply a guaranteed outcome?

**Common issues:**
- *Soft pricing.* "Free while we're in early access" invents a future price. Become is free today
  and no pricing exists. The only permitted statement is about today.
- *Borrowed proof.* "Trusted by thousands" and "the #1 app for X" arrive in almost every AI draft.
  Both are fabrications for us.
- *Capability drift.* "Syncs with your watch," "chat with your coach anytime," "personalized meal
  plans." Each sounds plausible and none is confirmed. Check the context doc, then flag.

**Strong patterns:**
- Replace an unverifiable claim with the mechanic that is true: ❌ "Proven to build consistency" →
  ✅ "Shows your streak, your week, and the next session on one screen."
- Downgrade rather than delete when there is a true smaller version: ❌ "Thousands of exercises" →
  ✅ "Demo clips on the exercises in your program."
- When something cannot be verified, cut it and put it in the flagged bucket. Never leave a
  maybe-true line in the marked diff without a flag.

### 2. Slop pass

**Check for:**
- Banned words and phrases (full list with replacements: `references/banned-words.md`).
- Em dashes. Deliverable copy runs near zero of them.
- Throat-clearing openers, hedges, and adverbs that carry no information.

**Common issues:**
- *AI tells.* Tricolon addiction ("faster, smarter, stronger"), "not just X but Y," "in a world
  where," symmetrical clause pairs, adjective stacking, "it's not about X, it's about Y," em dashes
  used as the only punctuation.
- *Hedges.* "can help you," "designed to," "aims to," "may improve." A hedge is a claim you did not
  want to make. Make the smaller true claim instead.
- *Throat-clearing.* "In today's fast-moving fitness landscape," "we all know that," "let's face
  it." Delete to the first real sentence.

**Strong patterns:**
- Delete first, rewrite second. Most slop sentences do not need a replacement.
- Replace an em dash with a period. Two short sentences beat one long one at 390px.
- Kill "just" and "simply" on sight. They minimize the reader's effort and read as condescension.

```
❌ Become isn't just another fitness app — it's a complete system designed to help you
   seamlessly integrate training, nutrition, and mindset into your daily routine.
✅ Become runs the whole plan: training, food, and mind work in one app.
```

### 3. Concreteness pass

**Check for:**
- Is there an abstract noun doing a job a concrete noun could do better?
- Does the copy name the mechanic, or only the outcome?
- Would the sentence still be true of a competitor? If yes, it is not our sentence.

**Common issues:**
- *Abstraction stack.* "journey," "experience," "insights," "potential," "solution," "platform,"
  "wellness." Every one of these is a slot where a real noun should be.
- *Outcome without mechanism.* "Stay consistent" is a wish. "The camera counts the reps so you are
  not tapping between sets" is a reason.
- *Generic verbs.* "leverage," "utilize," "empower," "enable." The product's real verbs are log,
  scan, plan, count, recap, generate, show.

**Strong patterns:**
- Swap the abstraction for the thing on screen: ❌ "Gain powerful insights" → ✅ "See your volume,
  week over week."
- Add the physical detail nobody would invent: "prop the phone against a plate," "chalk on your
  hands," "Sunday night."
- Use the product's own words. If the screen says "Set 3 of 3," the copy says "set 3 of 3."

### 4. Rhythm pass

**Check for:**
- Sentence length variance. Three sentences of the same length in a row reads as a machine.
- Front-loaded verbs and subjects. The important word should not be the ninth.
- Read it aloud. Where do you run out of breath?

**Common issues:**
- *Uniform length.* Every sentence at 14 words. Vary: 6, 14, 4, 11.
- *Buried verb.* "What Become does is give you a plan" instead of "Become plans your week."
- *Comma pile-up.* Three subordinate clauses before the main one. Split it.

**Strong patterns:**
- Short, short, long. Or long, then a three-word sentence that lands. "You lift. It counts."
- Start with the noun or the verb. Never with "There is," "It is important that," or "By using."
- End the block on the strongest word. Trailing qualifiers throw away the ending.

```
❌ By using Become's integrated dashboard, users are able to view all of their daily
   metrics in a single, convenient location.
✅ Streak, mood, weight, calories, next session. One screen.
```

### 5. Fit pass

**Check for:**
- Does it fit the character or word limit for its surface, counted, not estimated?
- Is it scannable: short paragraphs, meaningful subheads, no wall of text?
- Does it still make the ask it started with?

**Common issues:**
- *Improved but too long.* A better sentence that overruns a 40-character push title is worse than
  the original.
- *Lost ask.* The CTA got edited into elegance and stopped being a request.
- *Broken pairing.* Copy edited without its image or its component, so it no longer matches what is
  beside it.

**Strong patterns:**
- Print the count next to every limited field in the output.
- Check the copy against the component it lives in. For landing copy, that is
  `webapp/components/landing/BecomeLanding.tsx`.
- Read the final version once as the visitor, not as the editor. If the next action is unclear, the
  edit is not finished.

### When NOT to edit

Three cases where the right move is to leave it alone and say so.

**Check for:**
- Is this Jon's first-person voice, where a rough sentence is the authenticity?
- Is the phrasing a product term the app actually uses on screen?
- Is the repetition deliberate, as a refrain across a page or a campaign?

**Common issues:**
- *Sanding off the coach.* Jon writing "I'm not going to pretend this part is fun" is better than any
  polished version. Editing it into product voice removes the reason it works.
- *Renaming the product.* Changing "The Becoming" to "your progress" breaks the link between copy
  and screen.
- *Killing a refrain.* "Evidence, not vibes" repeated across a page is structure, not redundancy.

**Strong patterns:**
- For Jon's copy, restrict yourself to passes 1 and 5: truth and fit. Hand anything else to
  `coach-brand-voice`.
- Keep on-screen terms verbatim, and note them in the reasons list so nobody re-edits them later.
- When you leave something that looks like a violation, say why in the reasons list.

## Become-specific rules

- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today and
  no pricing exists. Never invent a price, a tier, a trial length, or a discount. If the draft has
  one, it goes in the flagged bucket, not the marked diff.
- **Product screenshots come only from dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". When you edit a caption, check it still matches the shot it sits beside.
- **No personal camera-roll photos of the coach.**
- **The Becoming is design inspiration and at most one section or mention, never the headline theme.**
  If an edit pass leaves two mentions, cut one.
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or pound
  counts, no body-shaming, no before/after framing that implies a guaranteed outcome.
- **Never edit "(beta)" out of a screenshot or into marketing copy.** The beta channel renders
  "Become (beta)" from `webapp/lib/appChannel.ts`. That string never appears in a deliverable.
- **Product voice is second person.** Jon's voice is first person. If one block contains both,
  that is a finding, not a style choice.
- **Banned:** "journey," "unlock your potential," "game-changer," "revolutionary," "seamless,"
  "effortless," "10x," "crush it," "no excuses," "beast mode," hustle or shame framing, "just,"
  "simply."
- **Near-zero em dashes.** The live hero lead currently contains one. That is a real edit target,
  not an exception.
- **No emoji in product-voice copy.** Social captions may carry at most one, and only when it means
  something.
- **Never shame the reader.** The user is not lazy. Their tools were scattered. Any line implying
  otherwise gets cut in the slop pass regardless of how well it converts.
- **Research numbers stay internal.** A benchmark used to argue for an edit is tiered evidence for
  our decisions. It never becomes a line in the copy.

## Quality bar

- [ ] Word count reported before and after, and it went down.
- [ ] Zero banned words remain.
- [ ] Near-zero em dashes remain, and any survivor is justified in the reasons list.
- [ ] Every change has a numbered reason naming its pass.
- [ ] Every deletion is visible in the marked diff, not silently dropped.
- [ ] Every claim is traceable to product truth, or it is in the flagged bucket with an owner.
- [ ] No pricing, tier, trial, discount, user count, rating, testimonial, promised timeline, pound
      count, medical claim, or before/after framing survives.
- [ ] Register preserved: product copy still second person, Jon's copy still first person.
- [ ] Character and word limits met for the surface, with counts printed.
- [ ] Both alternates differ in kind (tighter, warmer), not in vocabulary, each with a rationale.
- [ ] The ask the draft started with is still there.

## Related skills

| Skill | Use it when |
|---|---|
| `copywriting` | There is no draft yet, or a block needs replacing wholesale. |
| `coach-brand-voice` | The copy is Jon in first person and needs more than a truth and fit pass. |
| `become-context` | A claim needs checking against product truth. |
| `landing-cro` | The problem is which blocks exist and in what order, not their wording. |
