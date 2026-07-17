// The Mind "move" system — the heart of the redesigned, linear, full-screen
// Mind experience. A session is an ordered chain of MOVES; each move is one
// interactive full-screen beat (a scene). The session is produced by a
// MoveEngine: composeSession(context) -> MindSessionPlan.
//
// CRITICAL (endgame): the deterministic composer in composeSession.ts is just
// ONE implementation of MoveEngine. The future generative-AI layer is a SECOND
// implementation of this exact interface — it sequences moves, writes prompts,
// and personalizes — with NO changes to the player or scenes. Keep this module
// pure + client-safe (no server/DOM imports) so both engines and the UI share it.

import type { MindState } from '@/lib/mindContent'

export type MoveKind =
  | 'state-check'
  | 'breath'
  | 'identity'
  | 'win'
  | 'challenge'
  | 'mission'
  | 'vision'
  | 'antisabotage'
  | 'social'
  | 'mirror'
  | 'choice'
  | 'type' // type the declaration yourself (active recall)
  | 'speak' // say it out loud — record + hear yourself back
  | 'assemble' // rebuild the declaration from a shuffled word bank (legacy; replaced by 'compose')
  | 'compose' // fill blanks in a mostly-built affirmation with positive words (no wrong answers)
  | 'acknowledge' // validate the hard feeling + self-compassion (non-affirm; for off days)
  | 'interrogative' // ask, don't declare — "Will you?" reflective self-talk
  | 'contrast' // mental contrasting: see the outcome, name the obstacle, make an if-then plan

// ─── Breath protocols (decoupled from the old StateShiftTab) ──────────────────

export interface BreathPhase {
  label: string
  durationMs: number
  instruction: string
}

export interface BreathProtocol {
  id: string
  name: string
  bestFor: string
  /** A fuller explanation shown on the breath ready screen. */
  description: string
  rounds: number
  phases: BreathPhase[]
}

export const BREATH_PROTOCOLS: Record<string, BreathProtocol> = {
  sigh: {
    id: 'sigh',
    name: 'Physiological Sigh',
    bestFor: 'Fastest stress drop',
    description:
      'A double inhale then a long, slow exhale — the quickest way to calm your nervous system. Offloads CO₂ fast and downshifts stress in about a minute.',
    rounds: 3,
    phases: [
      { label: 'Inhale', durationMs: 2200, instruction: 'Inhale through your nose' },
      { label: 'Inhale again', durationMs: 1000, instruction: 'Top it off — a second sip of air' },
      { label: 'Exhale', durationMs: 6000, instruction: 'Long, slow exhale through the mouth' },
    ],
  },
  box: {
    id: 'box',
    name: 'Box Breathing',
    bestFor: 'Calm, locked-in focus',
    description:
      'Equal counts — in, hold, out, hold. Steadies your heart rate and sharpens focus under pressure. A favorite of Navy SEALs before high-stakes moments.',
    rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'In through the nose' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — still and steady' },
      { label: 'Exhale', durationMs: 4000, instruction: 'Out through the mouth' },
      { label: 'Hold', durationMs: 4000, instruction: 'Hold — empty and calm' },
    ],
  },
  '478': {
    id: '478',
    name: '4-7-8',
    bestFor: 'Wind down',
    description:
      'A long hold and an even longer exhale to put the body in rest mode. Best for unwinding tension or settling down before sleep.',
    rounds: 4,
    phases: [
      { label: 'Inhale', durationMs: 4000, instruction: 'In through the nose' },
      { label: 'Hold', durationMs: 7000, instruction: 'Hold the breath' },
      { label: 'Exhale', durationMs: 8000, instruction: 'Slow exhale through the mouth' },
    ],
  },
  coherence: {
    id: 'coherence',
    name: 'Coherence',
    bestFor: 'Balance & steady nerves',
    description:
      'Slow, even breaths at about 5.5 per minute — the rhythm that brings your heart rate and nervous system into balance. Calm, without going sleepy.',
    rounds: 6,
    phases: [
      { label: 'Inhale', durationMs: 5500, instruction: 'Smooth inhale through the nose' },
      { label: 'Exhale', durationMs: 5500, instruction: 'Smooth, even exhale' },
    ],
  },
  energize: {
    id: 'energize',
    name: 'Energizing Breath',
    bestFor: 'Wake up & power on',
    description:
      "Brisk, even breaths to raise alertness and shake off the fog. Use it when you're flat and need to come online fast.",
    rounds: 12,
    phases: [
      { label: 'Inhale', durationMs: 1600, instruction: 'Quick, full inhale through the nose' },
      { label: 'Exhale', durationMs: 1600, instruction: 'Sharp exhale through the mouth' },
    ],
  },
}

/** Pick the breath protocol that best fits the user's current state. */
export function breathForState(state: MindState | null | undefined): BreathProtocol {
  switch (state) {
    case 'stressed':
      return BREATH_PROTOCOLS.sigh
    case 'distracted':
      return BREATH_PROTOCOLS.box
    case 'low_energy':
      return BREATH_PROTOCOLS.energize
    case 'locked_in':
      return BREATH_PROTOCOLS.coherence
    default:
      return BREATH_PROTOCOLS.sigh
  }
}

// ─── Identity statements — sourced from the central content library. ──────────
export { IDENTITY_POOL } from './library'

// ─── Move + session shapes ────────────────────────────────────────────────────

export interface Move {
  id: string
  kind: MoveKind
  /** Headline shown at the top of the scene. */
  title: string
  subtitle?: string
  // Kind-specific payload (only the relevant field is set):
  protocolId?: string // breath  → key in BREATH_PROTOCOLS ('auto' = resolve from live state)
  statement?: string // identity → the affirmation
  prompt?: string // win        → the reflection prompt
  /** choice → multiple-choice options, each with an optional reframe shown on pick. */
  options?: { label: string; response?: string }[]
  /** compose → a mostly-written affirmation with {0},{1}… blanks + positive word
   *  choices per blank. Every option is valid — it just personalizes the line. */
  compose?: { template: string; blanks: string[][] }
  source?: string // attribution (e.g. a book) when drawn from the content library
  /** Adaptive swap: if the live state-check answer is positive ('locked_in'), the
   *  player uses THIS move instead — so a good mood isn't forced into a breath.
   *  Set on the "regulate" beat: breath by default, amplify when locked-in. */
  altPositive?: Move
  /** XP this move contributes to the session payoff (display only; server is source of truth). */
  xp: number
}

/** The "recite the statement" register — every kind here presents the user's
 *  identity statement (or a pool line) to affirm in some medium. A session must
 *  include AT MOST ONE of these, or it degenerates into saying the same phrase
 *  three different ways back-to-back. */
export const AFFIRM_STATEMENT_KINDS: MoveKind[] = [
  'identity', 'mirror', 'type', 'speak', 'compose', 'assemble',
]

export interface SessionContext {
  chapter: number
  unlockedSystems: string[]
  /** Most recent logged state (yesterday/today) — seeds the opening; the live
   *  state-check answer overrides downstream moves at play time. */
  recentState?: MindState | null
  missionAction?: string | null
  identityStatement?: string | null
  /** Effective move kinds from the user's PREVIOUS session — the composer avoids
   *  repeating them so back-to-back sessions feel different. */
  recentKinds?: string[] | null
  /** Deterministic rotation seed (day-of-year) so the same day is stable. */
  dayOfYear: number
  /** Optional explicit seed — overrides dayOfYear so replays vary run-to-run. */
  seed?: number
  /** Current time (ms) — used with lastBreathAt to space out breath work. */
  now?: number
  /** When the user last did breath work (ms). Breath is put on cooldown so
   *  back-to-back sessions don't repeat it; spaced sessions can include it again. */
  lastBreathAt?: number | null
}

export interface MindSessionPlan {
  intro: { title: string; subtitle: string }
  moves: Move[]
  /** Flat XP awarded once per day on first completion (gated server-side). */
  rewardXp: number
  /** The arsenal segment this session leads into next, chosen by the composer
   *  from what the session actually surfaced (their reflections + its theme), with
   *  a second-person reason. The player prefers this over the deterministic pick,
   *  falling back to it when absent/invalid — so the session flows INTO the
   *  arsenal instead of dead-ending. */
  cta?: { system: string; reason: string }
}

/** The contract both the deterministic composer and the future AI engine fulfill. */
export interface MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan
}

// ─── Scene contract (UI) ──────────────────────────────────────────────────────

/** A reflective answer the user gave during a session move (a picked option, a
 *  typed line). Reported up so the session can persist it to MindJournal and the
 *  NEXT session can build on what they actually said (like the arsenal flows). */
export interface SessionAnswer {
  q: string
  a: string
}

export interface SceneProps {
  move: Move
  /** Breath scenes: the resolved protocol (player resolves 'auto' from live state). */
  protocol?: BreathProtocol
  /** Advance to the next move. Scenes that elicit a real reflection (a choice, a
   *  typed answer) pass it so the session can remember it; recitation/structural
   *  scenes just call onDone(). */
  onDone: (answer?: SessionAnswer) => void
  /** state-check only: report the chosen state up to the player. */
  onState?: (state: MindState) => void
  /** Admin lab preview: scenes that persist (state/win/discipline) skip their
   *  network writes so testing never pollutes the account. */
  preview?: boolean
}
