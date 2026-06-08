# Mind Lab — Admin Modality Tester & Content Library (build plan)

_Status: spec for another agent. Author: Become agent, 2026-06-05._
_Goal: an admin-only surface to exercise EVERY Mind modality (and each variant/
portion of it) on demand, browse the full content library, and build/play ad-hoc
sessions — without grinding real daily sessions to see everything._

---

## 1. What the admin must be able to do

1. **Launch any single modality on the fly** in the real `SessionPlayer`/scene,
   with controls to pick the exact variant (which breath protocol, which template,
   which pool item, etc.) — not random.
2. **Test each "portion"** of a modality (e.g. breath: every protocol + the
   ready/active/completion screens; state-check: the full 20-feeling grid AND the
   "welcome back" supplementary opener; the regulate beat: breath vs amplify swap;
   reveal scaling on long statements; the write/speak modality switches).
3. **Browse a library** of all content (every affirmation, template, prompt,
   choice set, breath protocol, discipline challenge, etc.) as plain text — read
   it all without playing.
4. **Build a custom session** — pick an ordered list of moves and play them in
   sequence to test transitions and whole flows.
5. **Preview mode** — none of this should farm XP, write streaks/recency, or log
   state/wins to the admin's account.

---

## 2. Where it lives + access

- Extend the existing admin Mind area: `webapp/app/dashboard/admin/mind/`
  (currently `page.tsx` + `MindAdminClient.tsx` = chapter/XP controls).
- Add a new route **`/dashboard/admin/mind/lab`** (`page.tsx` + `MindLabClient.tsx`),
  linked from the existing admin mind page and the admin nav.
- **Access control:** admin only. Match how other admin pages gate
  (`role === 'admin'` via `verifyAuth` on any API + the admin layout guard at
  `app/dashboard/admin/layout.tsx`). The lab is client-rendered; the page should
  redirect non-admins (copy the guard the sibling admin pages use).

---

## 3. Prerequisite code changes (small, do these first)

### 3.1 `SessionPlayer` preview prop  (REQUIRED)
`components/mind/session/SessionPlayer.tsx` currently always `POST`s
`/api/mind/session` on completion (grants XP, streak, recency). Add:

```ts
export interface SessionPlayerProps {
  plan: MindSessionPlan
  onExit: () => void
  preview?: boolean   // NEW — when true, skip the completion POST entirely
}
```
In `complete()`: `if (preview) { setStage('payoff'); setResult({ xpAwarded: 0, readyToLevelUp: false }); return }` — show the payoff UI but do NOT call the API and do NOT offer level-up.

### 3.2 `SceneProps.preview` (RECOMMENDED — for clean isolation)
Three scenes write to the DB on their own:
- `StateCheckScene` → `POST /api/mind/state` (logs mood + grants XP)
- `WinScene` → `POST /api/mind/wins`
- `ChallengeScene` → `POST /api/mind/discipline`

Add `preview?: boolean` to `SceneProps` (`lib/mind/moves.ts`), thread it from
`SessionPlayer` to each scene, and in those three scenes skip the `fetch` when
`preview` (still run the UI + `onState`/advance). `ChallengeScene` also GETs the
day's challenge — in preview, let the move supply the text instead (see §5).
If skipping this is too much for v1, document that single-move tests of
state/win/challenge will write to the admin's own account.

### 3.3 A modality registry  (REQUIRED)
Create `lib/mind/modalities.ts` — the single source the lab iterates over. One
entry per testable modality with metadata describing its inputs:

```ts
import type { MoveKind } from './moves'
export interface ModalitySpec {
  kind: MoveKind
  label: string                 // "Affirm it", "Breathe", …
  category: 'open' | 'regulate' | 'affirm' | 'reflect' | 'plan' | 'evidence' | 'action'
  blurb: string                 // one line of what it is
  inputs: ModalityInput[]       // what the lab lets you set before launching
  writes?: boolean              // true if it POSTs (state/win/challenge) — warn in UI
  needsDevice?: 'camera' | 'mic'
}
type ModalityInput =
  | { key: 'protocol'; type: 'breathProtocol' }       // pick from BREATH_PROTOCOLS
  | { key: 'liveState'; type: 'state' }               // stressed/distracted/low_energy/locked_in (drives breath-for-state + regulate swap)
  | { key: 'statement'; type: 'text' }                // identity/mirror/type/speak/vision/contrast
  | { key: 'poolItem'; type: 'index'; pool: string }  // pick a specific library item by index
  | { key: 'seed'; type: 'number' }                   // rotation seed (controls which pooled item buildMove picks)
  | { key: 'sentences'; type: 'number' }              // generate an N-sentence statement to test reveal scaling
```
Export `MODALITIES: ModalitySpec[]` covering ALL kinds from `MoveKind`:
`state-check, breath, identity, win, challenge, mission, vision, antisabotage,
social, mirror, choice, type, speak, compose, acknowledge, interrogative,
contrast` (skip `assemble` — legacy/out of rotation, or include it tagged
"legacy"). This registry is what the "Modalities" grid renders.

---

## 4. The Lab UI (`MindLabClient.tsx`) — three tabs

### Tab A — Modalities (the tester)
- A grid/list of `MODALITIES` (grouped by `category`). Each card: label + blurb +
  badges (`writes` ⚠, `needsDevice` 📷/🎤).
- Tap a card → an **input panel** showing that modality's `inputs` (from the
  registry): e.g. breath → protocol dropdown (all 5) + liveState; identity →
  statement textarea OR "pick from IDENTITY_POOL" dropdown OR "generate N-sentence"
  to test reveal scaling; compose → template dropdown; choice/acknowledge/
  interrogative → pool-item dropdown; mission → action text; etc.
- **"Launch" button** → builds a one-move `MindSessionPlan` and opens
  `SessionPlayer` with `preview`. Build the move via `buildMove(kind, ctx)` from
  `composeSession.ts` (pass a `ctx` assembled from the inputs: `seed`,
  `identityStatement`, `missionAction`, `recentState`, `now`, `lastBreathAt`,
  `chapter`, `dayOfYear`) — OR hand-construct the `Move` for full control of
  fields the builder doesn't expose (e.g. force a specific breath `protocolId`, a
  specific `compose.template`, a specific `options` set).
  - Plan shape: `{ intro: { title: label, subtitle: 'Admin preview' }, moves: [move], rewardXp: 0 }`.
- **"Portions" coverage** the panel must make reachable:
  - **breath**: dropdown over all `BREATH_PROTOCOLS` (sigh/box/478/coherence/
    energize) → ready screen, then play to see active + completion visual. Also a
    "resolve from state" option to verify `breathForState()`.
  - **state-check**: a toggle to preview the **full 20-feeling grid** (first run)
    vs the **"welcome back" supplementary opener** (simulate a recent check-in —
    the scene reads `/api/mind/state`; in preview, pass a prop/flag to force the
    opener, or seed a recent StateLog). Document the simplest path.
  - **regulate beat**: a dedicated entry that builds `regulateMove(ctx)` with a
    `liveState` toggle so the tester sees **breath (off/negative)** vs the
    **amplify swap (locked_in)** and the **cooldown skip** (set `lastBreathAt = now`).
  - **identity / vision**: a "sentences" input that generates a 1→8 sentence
    statement so the **reveal speed scaling** (Affirm ramps past 4 sentences;
    Vision past 4) is directly observable.
  - **mirror / speak**: launch the scene; the **Write / Speak modality switch**
    links are testable in-scene. Mark `needsDevice`.
  - **compose / choice / acknowledge / interrogative**: dropdown to pick the exact
    template/question so every library entry can be exercised.

### Tab B — Library (browse all content)
Read-only. Import the pools directly from `lib/mind/library.ts` (all client-safe)
and render each as a labeled, scannable list:
- `IDENTITY_POOL` (affirmations), `WIN_PROMPTS`, `INTROS`, `CHOICE_POOL`,
  `SABOTAGE_PATTERNS`, `ACCOUNTABILITY_ACTIONS`, `DISCIPLINE_CHALLENGES`,
  `COMPOSE_TEMPLATES`, `ACKNOWLEDGE_POOL`, `INTERROGATIVE_POOL`,
  `CONTRAST_OBSTACLES`, `CONTRAST_PLANS`, plus `BREATH_PROTOCOLS` (from
  `lib/mind/moves.ts`).
- Each item gets a **"Test this" affordance** → jumps to Tab A pre-filled to launch
  that exact item (pass the pool + index). This is the "generate on the fly" loop.
- Show counts per pool (e.g. "Affirmations · 40").

### Tab C — Session Builder
- Add moves to an ordered list (pick kind + per-move inputs, reuse Tab A's panel).
- Reorder / remove.
- "Play sequence" → one `SessionPlayer` with `preview` and the full `moves[]` so
  transitions, the progress bar, and the payoff are testable end-to-end.
- Optional: "Load today's real plan" button → calls `composeSession(ctx)` with the
  admin's real context to preview exactly what a user would get.

(Keep the existing chapter/XP controls from `MindAdminClient` as a fourth tab or a
link — useful alongside.)

---

## 5. Building a Move for the player — reference

- Preferred: `buildMove(kind, ctx)` (exported from `lib/mind/composeSession.ts`).
  `ctx: SessionContext` fields the lab should set: `chapter`, `dayOfYear`,
  `seed` (controls which pooled item is chosen — increment to cycle), `recentState`,
  `identityStatement`, `missionAction`, `now`, `lastBreathAt`.
- For exact control beyond what `ctx` exposes, hand-construct the `Move`:
  - breath: `{ id:'breath', kind:'breath', protocolId:<id|'auto'>, ... }` (set a
    concrete `protocolId` to force a specific protocol; `'auto'` resolves from
    `liveState` via `breathForState`).
  - compose: `{ kind:'compose', compose: COMPOSE_TEMPLATES[i], ... }`.
  - choice/acknowledge/interrogative: `{ kind, title: q, options }` from the pool item.
  - challenge: pass `prompt`/text so `ChallengeScene` shows it in preview without the
    daily `/api/mind/discipline` GET (or let it fetch — admin's own day).
- `liveState` for the regulate swap is set INSIDE the player from the state-check
  answer. For a standalone breath/regulate test, the lab can pass an initial
  `liveState` — add an optional `initialLiveState?: MindState` prop to
  `SessionPlayer` so the tester can force breath-for-state / the amplify swap
  without first playing a state-check. (Small addition; document it.)

---

## 6. Implementation order
1. `SessionPlayer` `preview` (+ optional `initialLiveState`) prop. (§3.1, §5)
2. `SceneProps.preview` threaded to State/Win/Challenge scenes. (§3.2)
3. `lib/mind/modalities.ts` registry. (§3.3)
4. `/dashboard/admin/mind/lab` route + `MindLabClient` with Tabs A/B/C. (§4)
5. Link from `/dashboard/admin/mind` (and admin nav).
6. QA: launch every `MODALITIES` entry; confirm each completes and writes nothing
   (verify no new `MindSession`/`StateLog`/`DailyWin`/`MindProgress` rows for the
   admin during preview).

---

## 7. Acceptance criteria
- Every move kind in `MoveKind` (except legacy `assemble`) is launchable from the
  lab and reaches its completion/escape with **zero DB writes** in preview.
- Every breath protocol, every `COMPOSE_TEMPLATES` / `CHOICE_POOL` /
  `ACKNOWLEDGE_POOL` / `INTERROGATIVE_POOL` entry is individually selectable + testable.
- The library tab lists 100% of the content pools with counts.
- The regulate beat can be shown as breath (off-state), amplify (locked_in), and
  cooldown-skip, on demand.
- Reveal-speed scaling (Affirm/Vision) is observable via the "sentences" input.
- Session Builder plays an arbitrary ordered set of moves in one player.

## 8. Files
- **New:** `app/dashboard/admin/mind/lab/page.tsx`, `app/dashboard/admin/mind/lab/MindLabClient.tsx`, `lib/mind/modalities.ts`.
- **Edit:** `components/mind/session/SessionPlayer.tsx` (preview + initialLiveState),
  `lib/mind/moves.ts` (`SceneProps.preview`), `StateCheckScene.tsx` / `WinScene.tsx`
  / `ChallengeScene.tsx` (honor `preview`), `app/dashboard/admin/mind/page.tsx`
  (link to lab).

## 9. Gotchas
- **Writes:** State/Win/Challenge scenes + the session-complete POST all hit the
  DB — `preview` must suppress them or you'll pollute the admin account + skew
  streak/recency.
- **Camera/mic:** mirror/speak need permissions; tag them so it's expected.
- **State-adaptive composer:** the daily session's tone now branches on
  `recentState` and the regulate beat on live state + breath cooldown — the lab
  should expose those inputs so admins can reproduce each branch deterministically
  (not just random daily output).
- **`buildMove` rotation is seed-based** — to step through a pool, increment `seed`;
  to hit a specific item, prefer hand-constructing the move or a `poolItem` index.
- Content pools live in `lib/mind/library.ts` (client-safe, import directly);
  breath protocols in `lib/mind/moves.ts`.
