// Modality registry — the single source the admin Mind Lab iterates over. One
// entry per testable modality, with metadata describing which inputs the lab
// should offer before launching it. Pure data; client-safe.

import type { MoveKind } from './moves'

export type ModalityInputKey =
  | 'statement' // identity/mirror/type/speak/vision/contrast — the line to reinforce
  | 'sentences' // generate an N-sentence statement (test reveal-speed scaling)
  | 'protocol' // breath — pick a specific BREATH_PROTOCOLS key (or 'auto')
  | 'liveState' // seed the live state (breath-for-state + regulate amplify swap)
  | 'seed' // rotation seed — cycles which pooled item buildMove selects
  | 'poolItem' // pick a specific item from this modality's pool by index

export interface ModalitySpec {
  /** Stable lab id. Usually the MoveKind; 'regulate' is a synthetic daily-beat tester. */
  id: string
  /** The move kind to build/render (regulate → breath with an amplify alt). */
  kind: MoveKind
  label: string
  category: 'open' | 'regulate' | 'affirm' | 'reflect' | 'plan' | 'evidence' | 'action'
  blurb: string
  inputs: ModalityInputKey[]
  /** The library pool this draws from (for the poolItem picker + library cross-links). */
  pool?: string
  writes?: boolean // POSTs to the DB in normal use (suppressed in preview)
  needsDevice?: 'camera' | 'mic'
}

export const MODALITIES: ModalitySpec[] = [
  { id: 'state-check', kind: 'state-check', label: 'Check in', category: 'open', blurb: 'The 20-feeling opener (+ welcome-back).', inputs: [], writes: true },
  { id: 'breath', kind: 'breath', label: 'Breathe', category: 'regulate', blurb: 'Animated pacer — pick any protocol.', inputs: ['protocol', 'liveState'] },
  { id: 'regulate', kind: 'breath', label: 'Regulate beat (daily)', category: 'regulate', blurb: 'Breath when off, amplify when locked-in.', inputs: ['liveState', 'seed'] },
  { id: 'identity', kind: 'identity', label: 'Affirm it', category: 'affirm', blurb: 'Hold-to-affirm; word reveal + skip.', inputs: ['statement', 'sentences', 'seed', 'poolItem'], pool: 'IDENTITY_POOL' },
  { id: 'mirror', kind: 'mirror', label: 'Mirror', category: 'affirm', blurb: 'Front camera + affirm; write/speak switch.', inputs: ['statement', 'seed', 'poolItem'], pool: 'IDENTITY_POOL', needsDevice: 'camera' },
  { id: 'type', kind: 'type', label: 'Type it', category: 'affirm', blurb: 'Active recall — type the line.', inputs: ['statement', 'seed'] },
  { id: 'speak', kind: 'speak', label: 'Say it out loud', category: 'affirm', blurb: 'Record + hear yourself; write switch.', inputs: ['statement', 'seed'], needsDevice: 'mic' },
  { id: 'compose', kind: 'compose', label: 'Fill it in', category: 'affirm', blurb: 'Fill-in-the-blank affirmation.', inputs: ['poolItem', 'seed'], pool: 'COMPOSE_TEMPLATES' },
  { id: 'choice', kind: 'choice', label: 'Reflect', category: 'reflect', blurb: 'Multiple-choice reflection + reframe.', inputs: ['poolItem', 'seed'], pool: 'CHOICE_POOL' },
  { id: 'acknowledge', kind: 'acknowledge', label: 'Acknowledge', category: 'reflect', blurb: 'Validate the hard feeling (self-compassion).', inputs: ['poolItem', 'seed'], pool: 'ACKNOWLEDGE_POOL' },
  { id: 'interrogative', kind: 'interrogative', label: 'Interrogative', category: 'reflect', blurb: 'Ask, don’t declare — "Will you?"', inputs: ['poolItem', 'seed'], pool: 'INTERROGATIVE_POOL' },
  { id: 'contrast', kind: 'contrast', label: 'Plan it (contrast)', category: 'plan', blurb: 'Outcome + obstacle + if-then plan.', inputs: ['statement'] },
  { id: 'vision', kind: 'vision', label: 'See it (vision)', category: 'affirm', blurb: 'Reads your Vision; reveal scales w/ length.', inputs: ['statement', 'sentences'] },
  { id: 'win', kind: 'win', label: 'Bank a win', category: 'evidence', blurb: 'Log one win.', inputs: ['seed', 'poolItem'], pool: 'WIN_PROMPTS', writes: true },
  { id: 'challenge', kind: 'challenge', label: "Today's discipline", category: 'action', blurb: 'One hard thing (fetches your day).', inputs: [], writes: true },
  { id: 'mission', kind: 'mission', label: 'Lock in (mission)', category: 'action', blurb: 'Your one move today.', inputs: ['statement'] },
  { id: 'antisabotage', kind: 'antisabotage', label: 'Pattern check', category: 'plan', blurb: 'Catch a sabotage pattern + override.', inputs: ['seed'], pool: 'SABOTAGE_PATTERNS' },
  { id: 'social', kind: 'social', label: 'Accountability', category: 'action', blurb: 'Pull someone into your progress.', inputs: ['seed'], pool: 'ACCOUNTABILITY_ACTIONS' },
]
