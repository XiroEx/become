# Mind — The Becoming Masterplan

The unifying plan that conjoins everything we've discussed for Mindset into one
coherent system: **relatable (sourced) content + visible progression + paced
growth + endless AI-generated content + coursework**, so a user genuinely *feels
a change in their life* — not a random pile of generic modules.

> Status: **PLAN ONLY.** Nothing here is built yet. Phasing + open decisions at the
> bottom. This supersedes the loose threads in `MIND_SPEECH_DETECTION.md` (shipped)
> and the Phase-4 notes in memory.

---

## 1. North Star

A user should be able to look at the **Becoming tab** and *see who they were when
they started, who they are now, and where they're headed* — and every session
should feel like it came from a real philosophy/person who gets them, not a
fortune cookie. Volume shouldn't break it (grinders) and scarcity shouldn't gate
it (casuals). Over weeks it should feel like a **course in becoming**, not a toy.

Five things have to work *in tandem* (the whole point of this doc — none works
alone):

| Pillar | What it gives the user | Where it lives |
|---|---|---|
| **A. Sourced content** | Relatable, voiced material from books/people | `mindContent.ts` → unified content model |
| **B. Coursework / curriculum** | A structured arc — "a course in becoming" | chapters → courses |
| **C. Pacing model** | Growth that volume can't rush or scarcity starve | session API + new fields |
| **D. AI MoveEngine** | Endless, personal, never-repetitive content | 2nd `composeSession` impl |
| **E. Becoming tab** | *Seeing* the change — then → now → next | new surface |

---

## 2. Pillar A — Resurrect & unify the sourced content (do this FIRST)

**Problem:** the relatable, book-sourced content (`lib/mindContent.ts`, 30 pieces
with `source:` attribution and a real voice) was orphaned by the redesign; the new
linear engine reads the generic `lib/mind/library.ts`.

**Fix:** one unified, **sourced** content model that the new engine consumes.

- Introduce a `Source` concept — the inspiration behind a piece:
  - `Reality Transurfing` / Tufti (Vadim Zeland) — pendulums, importance, the
    "wave of fortune," outer vs inner intention
  - `Becoming Supernatural` (Joe Dispenza) — future-self rehearsal, the nervous
    system can't tell rehearsal from reality, heart-brain coherence
  - `Psycho-Cybernetics` (Maxwell Maltz) — self-image as the master controller,
    "the servo-mechanism," 21-day identity change
  - `How to Win Friends and Influence People` (Carnegie) — the social/architect
    register (genuine interest, the other person's view) — maps to our `social`
  - plus the voices already in the file (Goggins, Outwitting the Devil, etc.)
- Every content item (affirmation, reflection, challenge, prompt, breath, vision)
  carries: `text`, `source`, `register` (affirm/reflect/regulate/plan/evidence/
  action/open), `states[]` it suits, and an optional `chapter`/`course` it belongs
  to. This is the **raw material** both the deterministic engine AND the AI layer
  draw from — so even AI-generated sessions are *grounded in a real philosophy*
  and can attribute it ("In the language of Psycho-Cybernetics…").
- Surface attribution lightly in-scene (a small "— Reality Transurfing" tag) so it
  feels like wisdom from somewhere, which is what makes it relatable vs generic.

**Deliverable:** migrate `mindContent.ts` + `library.ts` into one
`lib/mind/content/` module keyed by source + register; rewire `composeSession`,
the scenes, and the Mind Lab to it. No behavior change yet — just the soul back.

---

## 3. Pillar B — Coursework / curriculum

Reframe the existing 5 chapters (`lib/mindXP.ts`) as **Courses** — each a themed
arc anchored to a philosophy, so progression *teaches* something:

1. **Foundation** — state & awareness (Reality Transurfing: stop reacting,
   reduce importance)
2. **Self-Image** — identity installation (Psycho-Cybernetics: become the person
   first)
3. **Discipline** — doing it anyway (Goggins / Outwitting the Devil)
4. **Vision & Rehearsal** — future-self (Becoming Supernatural)
5. **The Architect** — environment & people (Carnegie / social)

Each course = an ordered set of **lessons** (a lesson ≈ a guided session with a
teaching beat + practice). Completing a course's lessons is what advances you.
This is the "coursework we will eventually do" given a concrete spine now, so the
other pillars have something real to pace and visualize.

---

## 4. Pillar C — Pacing model (grinders vs casuals)

(From our last discussion — locked in here.)

- **Decouple two axes:** *Arc/growth* (paced) vs *Effort/XP* (unlimited).
- **One growth moment per window** (window = day, ties to streak). A growth moment
  = a new lesson/chapter beat or a *newly revealed modality*. Advancement requires
  XP threshold **AND** the window gate.
- **XP bank:** overflow XP earned while gated accrues to a visible bank/score.
  Becomes the grinder's reward + fuel for future milestones (decide meaning later).
- **Gate advancement, never access.** Extra same-day sessions are *full* sessions,
  reframed as **training/reinforcement** ("You've done today's growth — this is
  training"), still earning banked XP + protecting the streak. No energy system,
  no lockout.
- **Pace introductions of new modalities**, not just chapter numbers — seeing
  something new is what *feels* like growth. Reveal one new modality per growth
  moment; grinders get variety within what's unlocked.
- Net effect: casuals advance on a clock so low volume isn't penalized; grinders
  can train endlessly but can't fast-forward the story.

**Data model additions** (`MindSession`/`UserProgress`): `lastGrowthAt`,
`xpBank`, `revealedModalities[]`, per-course/lesson completion.

---

## 5. Pillar D — AI MoveEngine + endless content (Phase 4)

The Duolingo "never run out" property, done our way. Duolingo never runs out
because it has infinite content; **we get there with AI generation grounded in the
sourced library + the user's real data.**

- **The seam is ready:** `MoveEngine.composeSession(ctx) → MindSessionPlan`
  (`lib/mind/moves.ts:192`). The AI engine is a **second implementation** — no
  changes to the SessionPlayer or the 18 scenes.
- **Grounding (why it won't feel generic):** the engine is fed (a) the user's
  state/mood history, wins, streak, adherence, recent reflections + "what changed"
  notes; (b) their current course/chapter; (c) the sourced content library as the
  *voice/knowledge base*. It **sequences and writes** moves in the voice of the
  relevant source, personalized to where the user actually is.
- **Three escalating capabilities** (ship in order):
  1. **Sequencing** — AI picks which moves + order, selecting prompts from the
     sourced library based on the user's data. (Lowest risk; reuses all scenes.)
  2. **Authoring** — AI writes the affirmation/prompt text personalized to the
     user, *in the voice of* a source. This is the "endless content."
  3. **Conversational** — AI responds in-scene to the user's reflection (their
     check-in note, the choice they made). The headline "it knows me" moment.
- **Endless ≠ unbounded pacing:** generation is gated by Pillar C — the AI can
  always produce a fresh *training* session, but *new ground* (new lesson/
  modality) still arrives on the growth cadence. Endless content fills the
  "between" so grinders never hit a wall, without spending the arc.
- **Backend:** OPEN DECISION — redbtn graph (in-house, tunable, our infra) vs
  direct Claude API. Recommendation: **redbtn graph** for a visual, tunable
  pipeline + in-house data handling.
- **Safety:** AI output is constrained to the sourced library's themes + a
  validated move schema; fall back to the deterministic engine on any failure, so
  a bad generation never breaks a session.

---

## 6. Pillar E — The Becoming tab (seeing the change)

The surface where progress becomes *felt*. A "training log for the mind":

- **Then → Now → Next.** A timeline: where you started (first state-checks, early
  identity statement, baseline mood) vs now (streak, mood trend, wins banked,
  course progress) vs the next growth moment / next course.
- **The Becoming arc:** the 5 courses as a visible path with your position, what's
  unlocked, what's ahead.
- **Evidence wall:** your banked wins + reflections over time — concrete proof the
  story changed (ties to the marketing principle: "you stayed consistent through a
  hard week" beats "7-day streak").
- **Mood/state trend** (we already log it) rendered as the visible "difference."
- **The XP bank/score** lives here as the grinder's trophy.
- **"Where to work on"**: surfaces the register/course you've engaged least, or a
  recurring sabotage pattern from your logs — a gentle next focus.

This is where Pillars A–D pay off: the sourced courses give it structure, the
pacing gives it cadence, the AI gives it personalization, and the tab makes all of
it *visible* as a life changing.

---

## 7. How it all conjoins (the loop)

1. Open Mind → **Becoming tab** shows where you are + today's growth moment.
2. Start a session → **AI MoveEngine** composes it, grounded in your data + the
   **sourced** content for your current **course**, in a real voice.
3. You do the work (scenes, speech, etc.) → wins/reflections/state logged.
4. **Pacing** decides: was this a *growth moment* (advance the course / reveal a
   modality) or *training* (full session, XP banks)?
5. Progress + evidence flow back to the **Becoming tab** → you *see* the change.
6. Repeat. Casuals feel steady growth; grinders train endlessly and bank score;
   everyone is following a real course in becoming.

---

## 8. Phasing (build order)

- **P1 — Content reunification (no AI):** unified sourced content model; rewire
  the engine/scenes/Lab. Immediately makes sessions relatable again. *Low risk,
  big felt impact, needs no open decision — recommend building first.*
- **P2 — Coursework spine:** chapters → courses → lessons; map sourced content to
  courses.
- **P3 — Pacing + XP bank + data model:** growth-moment gate, bank, modality
  reveal cadence, training-mode framing.
- **P4 — Becoming tab:** then/now/next, arc path, evidence wall, score.
- **P5 — AI MoveEngine (a→b→c):** sequencing → authoring → conversational, behind
  the existing seam, deterministic fallback.

P1 + P4 deliver felt value without any AI. P5 is the endgame and the only part
needing the backend decision.

---

## 9. Open decisions (need user input before P5)

1. **AI backend:** redbtn graph (recommended) vs direct Claude API.
2. **Course structure depth:** lightweight (themed chapters) vs full
   lessons-with-teaching-beats curriculum.
3. **Attribution display:** how visible are sources in-scene (subtle tag vs a
   "today's wisdom from…" framing)?
4. **XP bank meaning:** score-only for now (recommended) vs tie to milestones now.
