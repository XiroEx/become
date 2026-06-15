# AI Slop Overhaul Plan

Status: **planned, not started.** Grounded in a full dump of the 12 `become-tasks`
registry prompts/schemas + the runner nodes + the webapp client seams (2026-06-15).

The trigger: an AI Mind move rendered "You've Got This Momentum" above options
written for a different question. Root cause was a seam bug (AI overriding crafted
structure it couldn't see). That class of problem — **AI output that is generic,
off-brand, wrong-shaped, or mismatched with the deterministic structure around it**
— exists in more places. This is the systematic pass to kill it.

## The principle (the rule we enforce everywhere)
1. **The model owns generative free-text + selection.** Deterministic code owns
   crafted structure (titles, options, scaffolding, the exercise library).
2. **Never render AI text into a slot paired with deterministic content the model
   can't see.** (That was the title bug.)
3. **Validate/sanitize AI output at the client seam** before rendering — shape,
   length, voice, resolvability — and fall back deterministically on failure.
4. **One voice, defined once.** Anti-slop style rules live in a single shared
   persona, not copy-pasted per task.

## Concrete slop found (evidence)
- `mind.composeSession`: AI overrode move titles → incoherent question/answer pairing. **(client fixed 2026-06-15; prompt still mismatched — see below.)**
- `mind.generateContent` `kind:identity`: returned a multi-sentence coach message, NOT a short first-person identity line. Wrong shape — the prompt is too vague ("match the tone and length implied").
- Coach chats: formulaic empathy openers ("That feeling is real, and it happens…") trend toward sameness.
- `workout.generate*`: exercise NAMES that don't resolve to a library slug currently synthesize a fake slug → a tile with no video/metadata = looks broken (latent jank).
- Registry hygiene: the 47-word coach preamble is hand-duplicated into all 12 prompts (no central voice seam); `consultant.nutrition` and `nutrition.consultant` are near-duplicate tasks; vision prompts are inert placeholders (covered by VISION_AI_PLAN).

## Phase 1 — Graph: one voice + anti-slop rules + tighter per-task prompts (redbtn agent)
- **Centralize the persona**: have the runners PREPEND a single shared Become voice
  block; strip the duplicated preamble from the 12 task prompts so each is just its
  task-specific instruction. One place to tune voice.
- **Add anti-slop style rules** to that shared block: second-person, concrete and
  specific to the user's context; NO Title Case headings; NO empty hype/affirmation-
  speak ("You've Got This"); no "as an AI/model/source"; no lists unless asked; vary
  openers (ban the formulaic "That's real, and it happens" cadence); respect length.
- **Fix `mind.generateContent`**: per-`kind` shape guidance — `identity`/`affirmation`
  = ONE short first-person line (≤ ~12 words), no preamble, no quotes; `vision`/`mission`
  = the requested artifact only; `reframe` = 1–2 sentences. Output the content, nothing else.
- **Realign `mind.composeSession`** with the client contract: the client now keeps
  deterministic titles/subtitles/options and only uses the AI `statement` (identity/
  win/contrast/acknowledge) + `prompt` (where the scene renders it) + move selection/
  order. Rewrite the prompt so the model spends effort ONLY there (stop asking for
  punchy titles that are discarded), and tighten what "statement" should be per kind.
  DECISION TO MAKE: tighten vs. scope down AI's role here (it competes with an already-
  rich deterministic composer; keep only if it clearly beats deterministic).
- **Consolidate** `consultant.nutrition` + `nutrition.consultant` into one task.

## Phase 2 — Client: validate/sanitize at every seam (webapp)
- New `lib/ai/sanitize.ts`: helpers — `sentenceCaseIfTitleCased`, `clampWords`,
  `stripQuotes`, `stripAiLeakage` ("as an AI"…), `dedupeBy`.
- **composeSession** (`lib/mind/aiEngine.ts`): done — AI no longer touches title/
  subtitle/options. Add: clamp statement/prompt length; drop moves whose required
  payload is empty after hydrate.
- **generateContent** (VisionBuilder + any generate buttons): enforce shape per kind
  (single line, strip quotes/preamble, word cap); reject + keep existing field on miss.
- **generateFlow** (`lib/ai/runClient` consumers — AntiSabotage/Discipline): validate
  steps (≥1 input step, choices length 2–4, scale has both labels, cap body length);
  fall back to static flow if invalid.
- **workout.generateSession/Program** (GenerateModal/QuickSessionModal): the big one —
  resolve every AI exercise name to a REAL library slug; **drop (don't synthesize)
  unresolved names**; dedupe; validate sets/reps/rest formats + clamp; ensure day count
  == daysPerWeek; if too few resolve, fall back to the deterministic generator. Goal:
  no janky no-metadata exercise tiles ever reach the user.

## Phase 3 — Verify each surface live, hunting for slop
- Drive each AI surface with real inputs, eyeball output for the patterns above,
  iterate on prompt/guard. Screenshot review is the fastest signal.

## Sequencing note
Phase 1 (graph voice) and Phase 2 (client guards) are independent and can land in
either order; do the voice centralization first so all surfaces improve at once,
then the per-surface client guards, then verify. Coordinate with VISION_AI_PLAN
(vision prompts get written for real in that effort, using the same shared voice).
