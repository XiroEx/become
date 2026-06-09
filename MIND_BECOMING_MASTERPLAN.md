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
| **A. Sourced methods** | Relatable material — book methods, voiced 100% as Become (sources admin-only) | `mindContent.ts` → unified content model |
| **B. Chapters (as-is)** | XP-gated progression spine; coursework deferred to last | `lib/mindXP.ts` (unchanged) |
| **C. Pacing model** | Growth that volume can't rush or scarcity starve | session API + new fields |
| **D. AI MoveEngine** | Endless, personal, never-repetitive content | 2nd `composeSession` impl |
| **E. Becoming tab** | *Seeing* the change — then → now → next | new surface |

---

## 2. Pillar A — Resurrect the content as METHODS, voiced 100% as Become (do this FIRST)

**Problem:** the relatable, book-sourced content (`lib/mindContent.ts`, 30 pieces
with `source:` attribution and a real voice) was orphaned by the redesign; the new
linear engine reads the generic `lib/mind/library.ts`.

**The rule (user-locked 2026-06-09):** the books are our *private R&D*, NOT our
branding. We mine their **inspiration, methods, ideas, and perspective-shifts** —
but everything a user sees is **pure Become voice**. A user must NEVER see
"Reality Transurfing", "David Goggins", or any book/person name anywhere in the
mindset section or while doing a modality. **`source` is admin-only metadata.**

**Fix:** one unified content model whose *methods* power the modalities.

- The lineage we mine (internal only): Reality Transurfing/Tufti (reduce
  importance, stop reacting, outer vs inner intention), Becoming Supernatural/
  Dispenza (future-self rehearsal; the nervous system can't tell rehearsal from
  real), Psycho-Cybernetics/Maltz (self-image as master controller, identity
  installation), Goggins / Outwitting the Devil (do it anyway; drift vs choice),
  Carnegie (genuine interest in others → our `social`).
- Each content item carries: `text` (Become-voiced), **`source` (ADMIN-ONLY tag)**,
  `register` (affirm/reflect/regulate/plan/evidence/action/open), `states[]` it
  suits, optional `chapter`. The *methods* shape what the modalities **ask, offer,
  and reframe** — the questions, the perspective flips, the prompts.
- This is the raw material both the deterministic engine AND the AI layer draw
  from, so even AI sessions are grounded in a real method — but the AI writes in
  **Become's voice**, never naming a source to the user.
- **Attribution is admin-only:** the Mind Lab / admin mindset area MAY show
  "Reality Transurfing–inspired" / "Goggins–inspired" on content + features so we
  track lineage. Nowhere user-facing.

**Deliverable:** migrate `mindContent.ts` + `library.ts` into one
`lib/mind/content/` module keyed by register (+ admin `source`); rewire
`composeSession`, the scenes, and the Mind Lab to it. User-facing strings are
Become-voiced; strip every source name from anything a user can reach.

---

## 3. Pillar B — Chapters stay AS-IS; coursework is LATER (post-AI)

**Keep the existing 5 chapters exactly as they are** (`lib/mindXP.ts`): XP-gated
unlocking of modalities/features. No restructure, no user-facing "course" framing
now. The chapters remain the progression spine.

The 5 chapters still have internal *thematic leanings* that guide which methods/
content feel right per chapter (state & awareness → self-image → discipline →
vision/rehearsal → social/architect), but this is just content-mapping guidance,
not a visible curriculum.

**A real coursework section is explicitly deferred — built AFTER the AI layer is
done** (user-locked 2026-06-09). Don't build lessons/curriculum yet.

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
   book *methods* for your current chapter — written entirely in Become's voice
   (never naming a source).
3. You do the work (scenes, speech, etc.) → wins/reflections/state logged.
4. **Pacing** decides: was this a *growth moment* (advance a chapter / reveal a
   modality) or *training* (full session, XP banks)?
5. Progress + evidence flow back to the **Becoming tab** → you *see* the change.
6. Repeat. Casuals feel steady growth; grinders train endlessly and bank score;
   everyone is following a real course in becoming.

---

## 8. Phasing (build order)

- **P1 — Content reunification (no AI):** unified content model whose *methods*
  power the modalities; user-facing strings Become-voiced; `source` kept as
  admin-only metadata; rewire engine/scenes/Lab. Chapters stay as-is.
  *Low risk, big felt impact, needs no open decision — recommend building first.*
- **P2 — Pacing + XP bank + data model:** growth-moment gate, bank, modality
  reveal cadence, training-mode framing.
- **P3 — Becoming tab:** then/now/next, arc path, evidence wall, score.
- **P4 — AI MoveEngine (a→b→c):** sequencing → authoring → conversational, behind
  the existing seam, deterministic fallback, Become-voiced (never names a source).
- **P5 — Coursework (LATER, after AI):** the curriculum/lessons section, built
  only once the AI layer is done.

P1 + P3 deliver felt value without any AI. P4 is the endgame and the only part
needing the backend decision. P5 is explicitly last.

---

## 9. Open decisions

- **AI backend (needed before P4):** redbtn graph (recommended) vs direct Claude
  API.
- **XP bank meaning (needed before P2):** score-only for now (recommended) vs tie
  to milestones now.

Resolved (user-locked 2026-06-09):
- **Attribution:** admin-only ("…–inspired" tags in the Mind Lab/admin); NEVER
  user-facing. All user-facing copy is pure Become voice.
- **Chapters:** keep the existing 5 XP-gated chapters as-is; no course restructure.
- **Coursework:** deferred to P5, after the AI layer.
