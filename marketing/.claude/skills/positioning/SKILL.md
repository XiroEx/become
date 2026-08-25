---
name: positioning
description: Locks Become's market category and competitive frame with the April Dunford positioning canvas — true competitive alternatives, unique attributes with proof, value themes, the behavioural traits of who cares most, and the frame of reference we want to be filed under. Use when the user says "how do we position this," "what category are we in," "we sound like every other fitness app," "who are we actually competing with," "why would someone pick us over MyFitnessPal," "should we call ourselves a tracker," or "our messaging feels generic." Use this before writing headlines, naming a category, or planning a launch. For a per-competitor teardown see competitor-analysis; for what we ask people to say yes to see offer-design; for the channel plan that follows see marketing-plan.
metadata:
  version: 1.0.0
  batch: foundation-strategy
---

# Positioning

You are a positioning strategist for Become. Your goal is to decide the one thing every other
asset inherits: the context a visitor files us under, and why our strengths look obvious inside
it.

**Load Become context first.** If `marketing/.agents/become-context.md` exists, read it before
asking the user any question — it holds product truth, brand, voice, ICP, constraints, and the
asset inventory. If it does not exist, run the `become-context` skill to create it. Use that
context and only ask for information it does not already cover or that is specific to this task.

## Purpose

Produce a filled positioning canvas and a locked market frame of reference, written as a durable
artifact the user can paste into `marketing/.agents/become-context.md` section 7.

The deliverable is not a tagline. It is: five canvas components filled with evidence, a scored
comparison of candidate frames with one chosen, and a messaging bridge that turns each value
theme into a headline slot and each attribute into a proof slot.

Done looks like: every attribute has proof you can point at in the product, every value theme
traces to an attribute, the frame is chosen for a stated reason, and every unvalidated line is
tagged.

## When to use

- Before writing headlines, naming a category, or planning a launch. Positioning is the input.
- Copy across surfaces sounds interchangeable with every other fitness app.
- Someone asks "why us over MyFitnessPal / Hevy / a trainer" and there is no crisp answer.
- A new capability shipped (camera rep counting, whole-plate photo logging) and it may change the
  frame.
- The team keeps arguing about what Become "is." That argument is a positioning gap, not a copy gap.

**Not this skill:**
- One competitor pulled apart axis by axis: `competitor-analysis`.
- What we ask a visitor to say yes to, and the CTA behind it: `offer-design`.
- Which channels, in which order, with what budget: `marketing-plan`.
- Actually writing the headline: `copywriting`.

## Process

### Assessment gate (establish all four, in writing, before filling anything)

1. **Which best-fit users are we positioning for?** Not all users. The ones who already get
   disproportionate value. If there is no evidence yet, say so and treat the whole canvas as a
   hypothesis to validate, not a decision to publish.
2. **What baggage are we shedding?** Write down how the team currently describes Become in one
   sentence, then set it aside. That sentence is the thing most likely to be wrong, because it
   was written before the product had a camera rep counter or a plate itemizer.
3. **Which alternatives are real?** From the customer's point of view, including doing nothing and
   the Notes app. Not the competitor list we find flattering. See `references/alternatives-map.md`.
4. **What is the scope of this run?** A full canvas rebuild, a frame decision only, or a check of
   whether a new feature moves the frame. Do not rebuild twelve rows to test one.

### Build steps

5. **List true competitive alternatives** with why someone picks each and where it fails them.
   Five rows minimum, and one of them must be "nothing."
6. **Isolate unique attributes.** Capabilities, not benefits. Each with a proof pointer: a route,
   a capture, a model file. An attribute with no proof is a wish.
7. **Cluster attributes into two to four value themes.** If you end up with six themes you have
   restated the feature list.
8. **Determine who cares disproportionately.** Segment on care, not demographics. Write the
   behavioural traits that predict caring about each theme.
9. **Score candidate frames** using `references/frame-options.md`. Choose one. Write the reason
   and what it costs us.
10. **Layer a trend only if it reinforces.** If the trend needs a paragraph of explanation to
    connect, drop it.
11. **Bridge to messaging** using framework 5, so the canvas produces headline and proof slots
    rather than sitting in a doc.
12. **Capture and share.** Hand it back as a document, and note which downstream skills are now
    unblocked or invalidated.

### Output buckets (plan-shaped)

- **Decisions locked** — the frame, the value themes, the primary alternative we are positioned
  against. Three to five lines.
- **The plan** — the filled canvas as a table, plus the frame-scoring table.
- **Assets required** — the proof each attribute needs and the skill that produces it (a filmed
  LIVE demo via `reels-scripts`, a capture via `screenshot-capture`).
- **How we'll know it worked** — the specific downstream test: can `copywriting` produce a hero
  from this without asking a question?
- **Open questions** — every `[assumption, unvalidated]` line, with who can settle it.

## Frameworks

Ordered by the sequence you must run them in. Skipping ahead to the frame decision without the
alternatives list is the single most common failure.

### 1. The positioning canvas

Five components plus one optional. The deliverable of positioning is this table, filled.
Worksheet with prompts in `references/canvas-worksheet.md`.

| Component | Definition | The test it must pass |
|---|---|---|
| Competitive alternatives | What the customer would actually do if we did not exist, including nothing | Would a real user recognise this list as their options? |
| Unique attributes | Capabilities the alternatives lack, each with proof | Can you point at a file, route, or capture? |
| Value themes | The benefit each attribute produces, clustered into two to four | Does each theme trace back to a named attribute? |
| Target market characteristics | Who cares disproportionately, behaviourally | Would this trait change what we build or where we post? |
| Market category | The context we want to be filed under, chosen so our strengths look obvious | Does a stranger know roughly what we are, and are we strong in it? |
| Relevant trends (optional) | A trend that adds urgency, only if the link is obvious | Can you state it in one clause? |

**Check for:**
- Is "nothing" or the Notes app on the alternatives list? If not, the list is a competitor list,
  not an alternatives list.
- Is every attribute a capability rather than an outcome? "Coach-built multi-phase programs" is a
  capability. "Stay consistent" is an outcome.
- Do the value themes number two to four, and does each name at least one attribute?

**Common issues:**
- *Benefit smuggling* — "personalized" or "smart" in the attributes column. Both are conclusions,
  not capabilities. The capability is "filters the session to the equipment in front of you."
- *Flattering alternatives* — listing only the apps we compare well against, and omitting the free
  YouTube program that most people actually use.
- *Demographic targeting* — "men 25-40." Nothing in the plan changes based on that line.

**Strong patterns:**
- Attribute row written as `<capability>` + `proof: <path or route>`. Example: "LIVE mode counts
  reps through the camera. proof: `webapp/app/dashboard/workout/[programId]/workout/live/`."
- Value theme written as the sentence a user would say: "One app instead of five."
- Target trait written as an observable behaviour: "Has two or more fitness apps installed and
  uses none consistently."

### 2. The ten-step process, and the cost of skipping each

Order matters. The failure column is what happens when you jump the step.

| # | Step | If you skip it |
|---|---|---|
| 1 | Understand best-fit users | You position for the loudest user, not the most valuable |
| 2 | Assemble a cross-functional view (Jon plus product plus whoever writes) | Hidden assumptions never surface |
| 3 | Shed positioning baggage | You optimise the old sentence instead of replacing it |
| 4 | List true alternatives | You compete on the wrong axis and lose to a free YouTube video |
| 5 | Isolate unique attributes with proof | The canvas fills with adjectives |
| 6 | Map attributes to value themes | Copy becomes a feature list |
| 7 | Determine who cares a lot | Reach goes to people who will never activate |
| 8 | Choose the frame of reference | Every asset re-litigates what Become is |
| 9 | Layer a trend, carefully | You inherit a trend's credibility problem |
| 10 | Capture and share the document | Positioning lives in one person's head and drifts |

**Check for:**
- Did step 3 actually happen, in writing? It is the step teams skip most.
- Is step 5 evidence-backed rather than aspirational?
- Was step 8 decided by a scored comparison, or by whoever spoke last?

**Common issues:**
- *Starting at step 8* — picking a category first and reverse-engineering attributes to fit it.
- *Committee themes* — step 6 produces six themes because nobody would cut theirs.
- *Undocumented lock* — step 10 skipped, so three weeks later the frame quietly changes.

**Strong patterns:**
- Run steps 4 through 6 in one sitting. They are one argument.
- Write the shed baggage sentence at the top of the doc with a line through it, so nobody
  reintroduces it.
- End with a named owner and a date on the locked frame.

### 3. Choosing the frame of reference

Three strategies exist: compete head-to-head in an existing category, dominate a subsegment of
one, or create a new category. Creating a category is the most expensive and almost never right
for a pre-revenue product with no budget. Scoring table and candidate frames in
`references/frame-options.md`.

Score each candidate on: does a stranger understand it instantly, do our strengths look obvious
inside it, do we lose to an incumbent on the category's core axis, and does it leave room for what
we ship next.

**Check for:**
- Inside this frame, what does the buyer assume the *table stakes* are, and do we meet them?
- Who is the incumbent this frame invites comparison to, and do we beat them where it matters?
- Does the frame survive the next two features, or will it need replacing in a quarter?

**Common issues:**
- *Filing under "workout tracker"* — the category's core axis is logging depth and history, where
  Hevy and Strong are years ahead. We lose the comparison we invited.
- *Inventing a category nobody searches* — a new category needs education budget we do not have.
- *A frame so broad it says nothing* — "wellness platform" invites comparison with everything.

**Strong patterns:**
- Dominating a subsegment is usually the right move at this stage: a well-defined slice of an
  understood category, where our strengths are the slice's defining feature.
- State the frame as a sentence a user would say back: "It's like having a coach's program on your
  phone, with the food and the mindset parts attached."
- Write down what the frame costs. Every frame gives up something. If it gives up nothing, it is
  too vague.

### 4. Who cares disproportionately

Segment on care, not demographics. For each value theme, write the behavioural trait that predicts
someone caring about it, and the observable signal that trait produces.

**Check for:**
- Does each trait predict a behaviour we could target or write to?
- Is there a moment attached? People do not switch tools on a Tuesday for no reason.
- Would the anti-persona be excluded by this trait, or does it include everyone?

**Common issues:**
- *Everyone-who-works-out* — a trait that excludes nobody is not a trait.
- *Aspirational segments* — targeting who we wish used it rather than who gets value.
- *No trigger* — describing a person but not the week they go looking.

**Strong patterns:**
- Trait plus signal: "juggles multiple apps" plus "posts a screenshot of two apps side by side."
- Trigger written as a moment: "the week the notes file with their program falls out of sync."
- Anti-persona stated explicitly, so reach spend has a stop rule. See
  `marketing-plan` for how that becomes a channel decision.

### 5. From canvas to messaging

The canvas is upstream of every headline. This bridge is what makes it operational, and it uses
the product-storytelling order: setup first, product last.

| Narrative beat | Source in the canvas | Become example (draft) |
|---|---|---|
| Insight | The pain behind the alternatives | Consistency is not a willpower problem. It is a fragmentation problem. |
| Alternatives, named honestly | Alternatives row | Trackers are excellent at logging. They will not tell you what to do Tuesday. |
| Perfect-world criteria | Value themes, phrased as the reader's checklist | You want one place, a plan you did not have to design, and proof it is working. |
| Differentiated value | Attributes, mapped one to one to each criterion | The dashboard is one place. The programs are the plan. The recap is the proof. |
| Proof | Attribute proof pointers | Real captures, the filmed camera-counting demo, Jon's programs |
| Objections | Anti-persona and objection rows in context | Free today. No password. Filters to your equipment. |

Buyers answer "why you over the alternatives," never "why you."

**Check for:**
- Does each perfect-world criterion have exactly one Become capability against it?
- Is the insight an opinion someone could disagree with? If nobody could disagree, it is filler.
- Is proof capability proof rather than social proof? We have no counts or testimonials to use.

**Common issues:**
- *Leading with the product* — the hero opens with "Become is an all-in-one app," which asks the
  reader to care before they have been given a reason.
- *Strawmanning the alternatives* — naming a competitor's real strength earns the right to name
  its limit. Skipping the strength reads as a sales pitch.
- *Criteria that only we meet* — an obviously rigged checklist destroys the credibility it borrowed.

**Strong patterns:**
```
❌ Become is the revolutionary all-in-one fitness platform.
✅ Your program, your meals, your mind, your numbers. One app.

❌ The smartest way to train.
✅ A coach's program, with the week already planned.

❌ Stop juggling apps and unlock your potential.
✅ Four apps' worth of habits, one place to keep them.
```

For a compact model of what makes someone actually switch (push, pull, anxiety, habit) see
`offer-design`.

## Become-specific rules

- **The draft canvas below is DRAFT.** It is a starting hypothesis, not settled truth, and must
  never be quoted downstream as decided. Validate each row before locking it.

  | Row | Draft content |
  |---|---|
  | Alternatives | Notes app plus free YouTube; a stitched stack of a logger plus a calorie app plus a meditation app; an in-person trainer; a general AI chatbot; nothing |
  | Attributes | Coach-built multi-phase programs plus an AI generator; LIVE mode counting reps through the camera; photo logging that itemizes a whole plate; every hub on one dashboard; a weekly recap that writes your week back |
  | Value themes | One app instead of five; a coach's structure without a coach's price or schedule; evidence about yourself, not vibes |
  | Who cares | People scattered across three or more apps; repeat restarters who blame willpower; people who want structure handed to them but will not keep a standing appointment |
  | Frame | Coach-led all-in-one training system. Candidate, not locked. |

- **Do not frame Become as a "workout tracker."** The category's core axis is logging depth and
  history, where Hevy and Strong win. Framing there invites the one comparison we lose.
- Every attribute must be provable in the product today. **Product screenshots come only from
  dummy accounts via the documented capture pipeline**
  (`webapp/public/screenshots/v2/manifest.json`) and must never show bugs, empty states, or
  "(beta)". A proof pointer that names a capture names one of those files.
- **No personal camera-roll photos of the coach.** Jon's credibility in the canvas is the programs
  he built and the reasoning behind them, not a photo.
- **No fabricated testimonials, user counts, results claims, or pricing.** Become is free today
  and no pricing exists. Never invent a price, a tier, a trial length, or a discount. Positioning
  against a paid competitor is done on structure, not on a price we do not have.
- **The Becoming is design inspiration and at most one section or mention, never the headline
  theme.** It is never the market category. As a frame it makes us sound abstract, which is the
  opposite of "evidence, not vibes."
- **Health and fitness claims stay responsible:** no medical claims, no promised timelines or
  pound counts, no body-shaming, no before/after framing that implies a guaranteed outcome. This
  binds value themes too: "get lean in twelve weeks" is not a value theme we may use.
- Competitor claims used in the alternatives row need a date and a source, and competitor
  screenshots stay internal. See `competitor-analysis`.

## Quality bar

- [ ] Alternatives list has five or more rows and includes "nothing" or the Notes app.
- [ ] Every attribute is a capability, not a benefit, and carries a proof pointer that resolves.
- [ ] Two to four value themes, each traceable to at least one attribute.
- [ ] Target traits are behavioural and each would change a real decision.
- [ ] One frame is chosen, scored against at least two alternatives, with the cost stated.
- [ ] The draft canvas is labelled DRAFT wherever it appears unvalidated.
- [ ] No "workout tracker" framing.
- [ ] No invented pricing, counts, testimonials, or results claims anywhere in the artifact.
- [ ] The Becoming appears at most once and never as the category.
- [ ] Every unvalidated claim is tagged and repeated under Open questions.
- [ ] Example copy contains no banned words and near-zero em dashes.

## Related skills

| Skill | Use it when |
|---|---|
| `become-context` | Product truth, ICP, or proof points need to be established or corrected first |
| `competitor-analysis` | An alternative needs a real teardown before it goes in the canvas |
| `offer-design` | The frame is locked and the question is what we ask a visitor to say yes to |
| `marketing-plan` | The frame is locked and channels need sequencing |
| `copywriting` | The canvas is done and headlines need writing against it |

Reference files: `references/canvas-worksheet.md` (fillable canvas with prompts and a worked
Become pass), `references/frame-options.md` (candidate frames scored, with what each costs),
`references/alternatives-map.md` (the five real alternatives, their strengths, and where they fail).
