# Positioning Canvas Worksheet

Fill top to bottom. Do not jump to the category row. Every line gets a tag:
`[verified in repo]` · `[verified with Jon]` · `[assumption, unvalidated]`

---

## 0. Baggage (shed before you start)

> How we currently describe Become in one sentence:
>
> `____________________________________________`

Strike it through. Do not optimise it. It was written before the current product existed.

---

## 1. Competitive alternatives

Prompt: *if Become vanished tonight, what does this person do tomorrow morning?*

| Alternative | Why they pick it | Where it fails them | Tag |
|---|---|---|---|
| | | | |

Rules:
- Five rows minimum.
- One row must be "nothing" or "the Notes app."
- At least one must be free.
- At least one must be non-software (a trainer, a class, a friend).
- Write the failure in their words, not ours.

Pre-filled draft in `references/alternatives-map.md`.

---

## 2. Unique attributes

Prompt: *what can Become do that every row above cannot?*

| Attribute (capability) | Proof pointer | Which alternatives lack it | Tag |
|---|---|---|---|
| | | | |

Rules:
- Capabilities only. If the cell contains "smart," "personalized," "intuitive," "seamless," or
  "powerful," it is a benefit and belongs in the next section.
- Proof pointer must be a route, a file, a model, or a capture path. "It's on the site" is not a
  pointer.
- If two attributes have the same proof, they are one attribute.

Self-test on each row: *could a competitor's marketer write this exact sentence?* If yes, it is
not unique.

---

## 3. Value themes

Prompt: *so what? what does that attribute produce for the person?*

| Theme (in the user's words) | Attributes behind it | Which alternative it beats |
|---|---|---|
| | | |

Rules:
- Two to four themes. Six means you restated the feature list.
- Written as a sentence a user would say out loud, not as a headline.
- Each theme must name at least one attribute from section 2.
- Each theme must beat at least one alternative from section 1. A theme that beats nobody is a
  feature description.

---

## 4. Target market characteristics

Prompt: *who cares about theme 1 far more than average, and how would we spot them?*

| Theme | Behavioural trait | Observable signal | Trigger moment |
|---|---|---|---|
| | | | |

Rules:
- Behaviour, not demographics.
- Every trait must change a real decision (what we build, where we post, what we say).
- Every row needs a trigger moment: the week they go looking.
- Write the anti-persona underneath, explicitly.

---

## 5. Market category / frame of reference

Prompt: *what context makes our strengths look obvious and our gaps look irrelevant?*

| | |
|---|---|
| Chosen frame | |
| Stated as a user would say it | |
| Strategy | head-to-head / dominate a subsegment / new category |
| Incumbent this invites comparison to | |
| Table stakes inside this frame, and whether we meet them | |
| What this frame costs us | |
| Survives the next two features? | |

Scoring in `references/frame-options.md`.

---

## 6. Relevant trends (optional, and usually skip)

Only if the link is one clause and the trend adds urgency rather than borrowed credibility.

| Trend | Why it makes Become more urgent now | Risk of attaching to it |
|---|---|---|
| | | |

---

## Worked Become pass (DRAFT, not settled)

**Alternatives.** Nothing plus the Notes app. Free YouTube programs. A stitched stack of a
workout logger, a calorie app, and a meditation app. An in-person trainer. A general AI chatbot.

**Attributes.**

| Attribute | Proof |
|---|---|
| Coach-built multi-phase programs with progression | `webapp/models/Program.ts`, `workout-hub-light.webp` |
| AI generator for a single session or a full program, filtered by focus, level, and available equipment | `generate-light.webp` |
| LIVE mode counts reps through the camera | `webapp/app/dashboard/workout/[programId]/workout/live/` |
| Demo clip on every movement, 42 of them | `webapp/public/exercises/` |
| Set logging with last-session numbers and PR history | `workout-log-dark.webp` |
| Photo logging itemizes a whole plate | `nutrition-meal-light.webp` |
| Training, nutrition, mind, and progress on one dashboard | `dashboard-light.webp` |
| Weekly recap writes your week back to you | `progress-light.webp` |

**Value themes.**
1. One app instead of five. (Beats: the stitched stack, the Notes app.)
2. A coach's structure without a coach's price or schedule. (Beats: the trainer, YouTube.)
3. Evidence about yourself, not vibes. (Beats: nothing, the chatbot.)

**Who cares.** People running three or more apps and keeping none of them. Repeat restarters who
blame willpower. People who liked having a trainer and will not schedule around one again.

**Frame.** Candidate: a coach-led all-in-one training system. Alternative candidate: "your coach,
in your pocket." Not locked. Scored in `references/frame-options.md`.

Every line above is `[assumption, unvalidated]` except the proof pointers, which are
`[verified in repo]`.
