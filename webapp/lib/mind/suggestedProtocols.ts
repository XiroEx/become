// Central catalog of arsenal PROTOCOLS across all 7 segments — the pool the
// post-session "suggested actions" picker (AI + deterministic fallback) chooses
// from. Each dashboard still owns the protocol's actual steps; this is just the
// lightweight reference (system + id + title + blurb) used to suggest + deep-link
// into the right segment. Client-safe (no server imports).

export interface ProtocolRef {
  system: string
  id: string
  title: string
  blurb: string
  /** Position of this protocol in ITS dashboard's rendered list — the in-tool
   *  progressive unlock opens 1 + reps entries, so a protocol is unlocked when
   *  idx < 1 + (reps in that tool). Suggestions must respect this. */
  idx: number
}

export interface SuggestedAction extends ProtocolRef {
  /** Short second-person reason this is a good next move right now. */
  reason: string
}

// Per-segment presentation — matched to each dashboard's signature color.
export const SEGMENT_STYLE: Record<string, { label: string; bg: string; text: string; ring: string; dot: string }> = {
  'state-shift':   { label: 'State Shift',   bg: 'bg-cyan-500/10',    text: 'text-cyan-500 dark:text-cyan-300',       ring: 'border-cyan-500/30',    dot: 'bg-cyan-500' },
  'self-image':    { label: 'Self-Image',    bg: 'bg-violet-500/10',  text: 'text-violet-500 dark:text-violet-300',   ring: 'border-violet-500/30',  dot: 'bg-violet-500' },
  'mission':       { label: 'Mission',       bg: 'bg-blue-500/10',    text: 'text-blue-500 dark:text-blue-300',       ring: 'border-blue-500/30',    dot: 'bg-blue-500' },
  'vision':        { label: 'Vision',        bg: 'bg-emerald-500/10', text: 'text-emerald-500 dark:text-emerald-300', ring: 'border-emerald-500/30', dot: 'bg-emerald-500' },
  'social':        { label: 'Social',        bg: 'bg-pink-500/10',    text: 'text-pink-500 dark:text-pink-300',       ring: 'border-pink-500/30',    dot: 'bg-pink-500' },
  'discipline':    { label: 'Discipline',    bg: 'bg-red-500/10',     text: 'text-red-500 dark:text-red-300',         ring: 'border-red-500/30',     dot: 'bg-red-500' },
  'anti-sabotage': { label: 'Anti-Sabotage', bg: 'bg-orange-500/10',  text: 'text-orange-500 dark:text-orange-300',   ring: 'border-orange-500/30',  dot: 'bg-orange-500' },
}

export const PROTOCOL_CATALOG: ProtocolRef[] = [
  // state-shift
  { system: 'state-shift', id: 'name-next-action', idx: 0, title: 'Name the Next Action', blurb: 'What is the next action? Only that.' },
  { system: 'state-shift', id: 'cut-the-noise', idx: 2, title: 'Cut the Noise', blurb: 'Silence is the sharpest tool.' },
  { system: 'state-shift', id: 'move-to-shift', idx: 3, title: 'Move to Shift', blurb: 'Move the body, move the mind.' },
  { system: 'state-shift', id: 'snap-out', idx: 4, title: 'Snap Out of It', blurb: 'This is a moment, not your identity.' },
  // self-image
  { system: 'self-image', id: 'kill-the-old', idx: 0, title: 'Kill the Old Version', blurb: 'The old you would stop here. You don’t.' },
  { system: 'self-image', id: 'identity-install', idx: 2, title: 'Identity Installation', blurb: 'I do what I say I will do.' },
  { system: 'self-image', id: 'act-as-if', idx: 3, title: 'Act As If', blurb: 'Act like who you’re becoming until you are them.' },
  { system: 'self-image', id: 'self-respect', idx: 4, title: 'Self-Respect Check', blurb: 'Would your future self respect this?' },
  // mission
  { system: 'mission', id: 'find-your-why', idx: 0, title: 'Find Your Why', blurb: 'Dig past the surface reason to the real one.' },
  { system: 'mission', id: 'one-move', idx: 1, title: 'One Move Forward', blurb: 'Movement makes energy. Energy makes life.' },
  { system: 'mission', id: 'north-star', idx: 3, title: 'North Star Check', blurb: 'Did today actually point where you’re going?' },
  { system: 'mission', id: 'reconnect', idx: 4, title: 'Reconnect to Purpose', blurb: 'When you drift, come back to the why.' },
  // vision
  { system: 'vision', id: 'see-future-you', idx: 0, title: 'See the Future You', blurb: 'Rehearse being them until it’s real.' },
  { system: 'vision', id: 'which-domain', idx: 1, title: 'Which Domain Needs You?', blurb: 'Aim at the part that’s furthest behind.' },
  { system: 'vision', id: 'close-the-gap', idx: 2, title: 'Close the Gap', blurb: 'Where does now differ most from the vision?' },
  { system: 'vision', id: 'act-from-vision', idx: 3, title: 'Act From the Vision', blurb: 'Make one choice the future you would make.' },
  // social
  { system: 'social', id: 'circle-audit', idx: 0, title: 'Circle Audit', blurb: 'Your environment is your fate. Know it.' },
  { system: 'social', id: 'genuine-interest', idx: 1, title: 'Genuine Interest', blurb: 'People feel when you actually care.' },
  { system: 'social', id: 'hard-conversation', idx: 2, title: 'Hard Conversation', blurb: 'Avoiding it is the expensive option.' },
  { system: 'social', id: 'raise-average', idx: 3, title: 'Raise Your Average', blurb: 'You’re the average of your five closest.' },
  // discipline
  { system: 'discipline', id: 'do-it-anyway', idx: 0, title: 'Do It Anyway', blurb: 'Feelings are data, not instructions.' },
  { system: 'discipline', id: 'eat-the-frog', idx: 1, title: 'Eat the Frog', blurb: 'Hardest thing first. The day is won.' },
  { system: 'discipline', id: 'find-your-40', idx: 2, title: 'Find Your 40%', blurb: 'When you think you’re done, you’re at 40%.' },
  { system: 'discipline', id: 'excuse-callout', idx: 4, title: 'Excuse Callout', blurb: 'An excuse is a lie told too many times.' },
  // anti-sabotage
  { system: 'anti-sabotage', id: 'pattern-recognition', idx: 0, title: 'Pattern Recognition', blurb: 'Name the pattern — it can’t survive the light.' },
  { system: 'anti-sabotage', id: 'stop-lying', idx: 1, title: 'Stop Lying to Yourself', blurb: 'Self-deception is the most expensive habit.' },
  { system: 'anti-sabotage', id: 'action-override', idx: 2, title: 'Action Override', blurb: 'You can’t think your way to action.' },
  { system: 'anti-sabotage', id: 'break-the-loop', idx: 3, title: 'Break the Loop', blurb: 'Interrupt the signal, interrupt the loop.' },
]

export const CATALOG_BY_SYSTEM: Record<string, ProtocolRef[]> = PROTOCOL_CATALOG.reduce(
  (acc, p) => { (acc[p.system] ??= []).push(p); return acc },
  {} as Record<string, ProtocolRef[]>,
)

/** Look up a protocol by system + id (used to validate AI picks). */
export function findProtocol(system: string, id: string): ProtocolRef | undefined {
  return CATALOG_BY_SYSTEM[system]?.find((p) => p.id === id)
}
