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
}

/** Pick the breath protocol that best fits the user's current state. */
export function breathForState(state: MindState | null | undefined): BreathProtocol {
  switch (state) {
    case 'stressed':
    case 'low_energy':
      return BREATH_PROTOCOLS.sigh
    case 'distracted':
    case 'locked_in':
      return BREATH_PROTOCOLS.box
    default:
      return BREATH_PROTOCOLS.sigh
  }
}

// ─── Identity statements (decoupled from the old SelfImageTab) ────────────────

export const IDENTITY_POOL: string[] = [
  "I am someone who does the work even when I don't feel like it.",
  'I am disciplined, focused, and consistent.',
  'I am becoming stronger every single day.',
  'I am the type of person who shows up.',
  'I am in control of my choices and my outcomes.',
  'I am a high performer who protects my standards.',
  "I am building a body and mind I'm proud of.",
  'I am mentally tough.',
  'I am exactly where I need to be to become what I want.',
  'I am someone who finishes what they start.',
  "I am not driven by comfort — I'm driven by purpose.",
  'I am the hardest worker in any room I enter.',
  'I am capable of far more than I currently believe.',
  'I am growing through every challenge placed in front of me.',
  "I am not defined by how I feel — I'm defined by what I do.",
]

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
  source?: string // attribution (e.g. a book) when drawn from the content library
  /** XP this move contributes to the session payoff (display only; server is source of truth). */
  xp: number
}

export interface SessionContext {
  chapter: number
  unlockedSystems: string[]
  /** Most recent logged state (yesterday/today) — seeds the opening; the live
   *  state-check answer overrides downstream moves at play time. */
  recentState?: MindState | null
  missionAction?: string | null
  identityStatement?: string | null
  /** Deterministic rotation seed (day-of-year) so the same day is stable. */
  dayOfYear: number
  /** Optional explicit seed — overrides dayOfYear so replays vary run-to-run. */
  seed?: number
}

export interface MindSessionPlan {
  intro: { title: string; subtitle: string }
  moves: Move[]
  /** Flat XP awarded once per day on first completion (gated server-side). */
  rewardXp: number
}

/** The contract both the deterministic composer and the future AI engine fulfill. */
export interface MoveEngine {
  composeSession(ctx: SessionContext): MindSessionPlan
}

// ─── Scene contract (UI) ──────────────────────────────────────────────────────

export interface SceneProps {
  move: Move
  /** Breath scenes: the resolved protocol (player resolves 'auto' from live state). */
  protocol?: BreathProtocol
  /** Advance to the next move. */
  onDone: () => void
  /** state-check only: report the chosen state up to the player. */
  onState?: (state: MindState) => void
}
