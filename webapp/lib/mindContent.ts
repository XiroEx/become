// Central content library — 30 mindset protocols mapped to states and sections.
// The hub uses this to serve one piece per state check-in.

export type MindState = 'stressed' | 'distracted' | 'low_energy' | 'locked_in'
export type SectionId =
  | 'home' | 'state-shift' | 'self-image' | 'mission'
  | 'discipline' | 'anti-sabotage' | 'social'

export interface ContentPiece {
  id: string
  title: string
  mantra: string
  instruction: string
  source: string
  section: SectionId
  states: MindState[]
  cta: string // button label to go deeper
}

export const CONTENT_PIECES: ContentPiece[] = [
  // ── STATE SHIFT ────────────────────────────────────────────────────────────
  {
    id: 'snap-out',
    title: 'Snap Out of It',
    mantra: 'This is a moment, not my identity.',
    instruction: 'Breathe 4 counts in, 4 hold, 4 out. Repeat 3 times. Say the mantra once out loud.',
    source: 'Reality Transurfing',
    section: 'state-shift',
    states: ['stressed'],
    cta: 'Do the reset',
  },
  {
    id: 'control-what-you-can',
    title: 'Control What You Can',
    mantra: 'What is the next action? Only that.',
    instruction: 'Stop thinking about the full problem. Write down the one next physical action you can take in the next 10 minutes.',
    source: 'David Goggins',
    section: 'state-shift',
    states: ['stressed', 'distracted'],
    cta: 'Lock in',
  },
  {
    id: 'youre-drifting',
    title: "You're Drifting",
    mantra: 'Are you acting or reacting right now?',
    instruction: 'Stop. Answer honestly: are your actions right now chosen — or are you just responding to whatever showed up? One conscious choice. Make it.',
    source: 'Outwitting the Devil',
    section: 'state-shift',
    states: ['distracted'],
    cta: 'Make a conscious choice',
  },
  {
    id: 'cut-the-noise',
    title: 'Cut the Noise',
    mantra: 'Silence is the sharpest tool.',
    instruction: 'Put the phone face down. Close every tab. Set a 60-second timer. Just sit. No input. When the timer ends, move to the one thing that matters.',
    source: 'Tufti',
    section: 'state-shift',
    states: ['distracted', 'stressed'],
    cta: 'Start the silence',
  },
  {
    id: 'shift-state-now',
    title: 'Shift Your State Now',
    mantra: 'Move the body, move the mind.',
    instruction: 'Stand up. Roll your shoulders back. Take a deep breath and expand your chest. Do 10 jumping jacks or 10 push-ups. You cannot feel low after you move.',
    source: 'Becoming Supernatural',
    section: 'state-shift',
    states: ['low_energy', 'stressed'],
    cta: 'Move now',
  },

  // ── MEDITATIONS ────────────────────────────────────────────────────────────
  {
    id: 'future-self-viz',
    title: 'Future Self Visualization',
    mantra: 'See it clearly. Then become it.',
    instruction: 'Close your eyes for 3 minutes. See yourself 12 months from now — not what you have, but how you move, speak, and carry yourself. Feel it. The nervous system cannot tell the difference.',
    source: 'Psycho-Cybernetics',
    section: 'self-image',
    states: ['low_energy', 'locked_in'],
    cta: 'Visualize',
  },
  {
    id: 'detach-from-thought',
    title: 'Detach From Thought',
    mantra: 'You are not the thought. You are the one watching it.',
    instruction: 'For 2 minutes, observe your thoughts like cars passing on a highway. Do not chase them. Do not fight them. Watch them pass. Come back to your breath when you drift.',
    source: 'Reality Transurfing',
    section: 'self-image',
    states: ['stressed', 'distracted'],
    cta: 'Practice detachment',
  },
  {
    id: 'identity-installation',
    title: 'Identity Installation',
    mantra: 'I do what I say I will do.',
    instruction: 'Repeat this 10 times slowly: "I do what I say I will do." Not as a wish. As a fact. You are installing this as a core operating belief.',
    source: 'Self-Image Work',
    section: 'self-image',
    states: ['low_energy', 'distracted'],
    cta: 'Install it',
  },
  {
    id: 'kill-old-version',
    title: 'Kill the Old Version',
    mantra: 'The old me would stop here. I don\'t.',
    instruction: 'Picture the version of you that quits, makes excuses, and settles. Name what they do. Then consciously choose to do the opposite. The new version acts now.',
    source: 'StephIsCold',
    section: 'self-image',
    states: ['low_energy', 'stressed'],
    cta: 'Make the switch',
  },
  {
    id: 'focus-training',
    title: 'Focus Training',
    mantra: 'Attention is a muscle. Train it.',
    instruction: 'Pick one thing. Set a 10-minute timer. Every time your mind wanders — and it will — bring it back without judgment. This is the rep. The wandering is not failure. Coming back is the training.',
    source: 'Mental Discipline',
    section: 'state-shift',
    states: ['distracted'],
    cta: 'Start focus reps',
  },

  // ── SELF-IMAGE / IDENTITY ──────────────────────────────────────────────────
  {
    id: 'who-are-you-becoming',
    title: 'Who Are You Becoming?',
    mantra: 'If I was disciplined, what would I do right now?',
    instruction: 'Answer that question. Then do that thing. This is how identity is built — one decision that aligns with the person you\'re becoming.',
    source: 'Identity Work',
    section: 'self-image',
    states: ['low_energy', 'distracted'],
    cta: 'Answer honestly',
  },
  {
    id: 'rewrite-story',
    title: 'Rewrite the Story',
    mantra: 'The story you believe about yourself becomes true.',
    instruction: 'Name one belief that\'s limiting you right now. Then rewrite it — not as an affirmation, but as evidence. What has already happened that proves the new story could be true?',
    source: 'Psycho-Cybernetics',
    section: 'self-image',
    states: ['low_energy', 'stressed'],
    cta: 'Rewrite it',
  },
  {
    id: 'evidence-builder',
    title: 'Evidence Builder',
    mantra: 'Small wins compound into unshakeable confidence.',
    instruction: 'Log one win from today. It does not have to be big. It has to be real. Each one is evidence that you are becoming who you said you would.',
    source: 'Self-Image Work',
    section: 'self-image',
    states: ['locked_in', 'low_energy'],
    cta: 'Log a win',
  },
  {
    id: 'act-as-if',
    title: 'Act As If',
    mantra: 'Act like who you\'re becoming until you are them.',
    instruction: 'Today, make three decisions that your future self would make — not your current self. How do they eat? How do they respond to setbacks? How do they spend the first hour of the day?',
    source: 'Think and Grow Rich',
    section: 'self-image',
    states: ['low_energy'],
    cta: 'Make a future-self decision',
  },
  {
    id: 'self-respect-check',
    title: 'Self-Respect Check',
    mantra: 'Would your future self respect this choice?',
    instruction: 'Before your next decision — what you eat, how you spend the next hour, whether you skip the thing you planned — ask that question. Then answer it honestly.',
    source: 'Identity Work',
    section: 'self-image',
    states: ['distracted', 'low_energy'],
    cta: 'Run the check',
  },

  // ── MISSION ────────────────────────────────────────────────────────────────
  {
    id: 'define-mission',
    title: 'Define the Mission',
    mantra: 'One goal. All energy. No split focus.',
    instruction: 'If you are pursuing multiple goals right now — pick one. The one that, if achieved, makes everything else easier or irrelevant. Focus is not limitation. It is power.',
    source: 'The One Thing',
    section: 'mission',
    states: ['distracted', 'low_energy'],
    cta: 'Set your mission',
  },
  {
    id: 'why-it-matters',
    title: 'Why It Matters',
    mantra: 'A deep why makes the how automatic.',
    instruction: 'Write down why your goal matters — not the surface reason, but the emotional core. Go three levels deep. Ask "why" three times. The third answer is what actually drives you.',
    source: 'Purpose Work',
    section: 'mission',
    states: ['low_energy'],
    cta: 'Find the real why',
  },
  {
    id: 'one-move-today',
    title: 'One Move Today',
    mantra: 'Clarity on the next step eliminates hesitation.',
    instruction: 'Your mission is big. Today, it is one move. What is the single action that moves the needle most right now? Write it. Do it before anything else.',
    source: 'Think and Grow Rich',
    section: 'mission',
    states: ['distracted', 'stressed'],
    cta: 'Name the one move',
  },
  {
    id: 'no-distractions',
    title: 'No Distractions',
    mantra: 'What you eliminate matters as much as what you add.',
    instruction: 'Identify one thing you are doing today that is not aligned with your mission. Eliminate it. Not tomorrow. Now.',
    source: 'Essentialism',
    section: 'mission',
    states: ['distracted'],
    cta: 'Cut something',
  },
  {
    id: 'daily-lock-in',
    title: 'Daily Lock-In',
    mantra: 'Commitment before motivation. Always.',
    instruction: 'State your commitment for today out loud or in writing. "Today I will ___." Full sentence. No hedge words like "try" or "maybe." Commitment is a decision, not a feeling.',
    source: 'Execution Work',
    section: 'mission',
    states: ['locked_in'],
    cta: 'Lock in',
  },

  // ── DISCIPLINE ─────────────────────────────────────────────────────────────
  {
    id: 'do-it-anyway',
    title: 'Do It Anyway',
    mantra: 'Feelings are data. Not instructions.',
    instruction: 'You don\'t feel like it. That is irrelevant. The plan doesn\'t care how you feel. Execute the plan. Every time you do what you said you would regardless of how you feel, you become someone who does what they say.',
    source: 'David Goggins',
    section: 'discipline',
    states: ['low_energy', 'stressed'],
    cta: 'Execute anyway',
  },
  {
    id: 'excuse-callout',
    title: 'Excuse Callout',
    mantra: 'An excuse is just a lie you told yourself too many times.',
    instruction: 'Name the excuse you\'re about to use. Say it out loud. Then ask: is this actually true, or is it your body protecting you from discomfort? Discomfort is not danger.',
    source: 'Accountability Work',
    section: 'discipline',
    states: ['low_energy', 'stressed'],
    cta: 'Name and destroy the excuse',
  },
  {
    id: 'hard-thing-first',
    title: 'Hard Thing First',
    mantra: 'Do the hard thing first and the day is won.',
    instruction: 'Identify the hardest, most important, most-avoided task you have today. Do not check your phone, eat, or do anything else until you have started it. The momentum from this carries everything else.',
    source: 'Eat the Frog',
    section: 'discipline',
    states: ['distracted', 'locked_in'],
    cta: 'Do the hard thing',
  },
  {
    id: 'youre-not-tired',
    title: "You're Not Tired",
    mantra: "You're 40% done. The body always has more.",
    instruction: 'David Goggins: when you think you\'re done, you\'re at 40%. The fatigue signal is your comfort system, not your actual limit. Push to the next small checkpoint. Just the next one.',
    source: 'David Goggins',
    section: 'discipline',
    states: ['low_energy'],
    cta: 'Push to the next checkpoint',
  },
  {
    id: 'cold-reality',
    title: 'Cold Reality',
    mantra: 'Where you are is the result of what you\'ve done.',
    instruction: 'Be brutally honest for 60 seconds. No blame. No excuses. Just facts: what are the habits and choices that got you to your current situation? What changes if you keep them? What changes if you don\'t?',
    source: 'Accountability Work',
    section: 'discipline',
    states: ['low_energy', 'stressed'],
    cta: 'Face the truth',
  },

  // ── ANTI-SABOTAGE ──────────────────────────────────────────────────────────
  {
    id: 'pattern-recognition',
    title: 'Pattern Recognition',
    mantra: 'You can\'t break a pattern you haven\'t named.',
    instruction: 'Where do you always quit? Be specific — what point, what feeling, what trigger causes you to stop? Name it. The pattern cannot survive the light.',
    source: 'The Mountain Is You',
    section: 'anti-sabotage',
    states: ['stressed', 'low_energy'],
    cta: 'Name the pattern',
  },
  {
    id: 'fear-breakdown',
    title: 'Fear Breakdown',
    mantra: 'Fear loses power when you look directly at it.',
    instruction: 'What are you avoiding right now? Name it. Then ask: what is the actual worst case? How likely is it? Could you recover? Most fears are fictional consequences of real discomfort.',
    source: 'Anti-Sabotage Work',
    section: 'anti-sabotage',
    states: ['stressed'],
    cta: 'Break down the fear',
  },
  {
    id: 'stop-lying',
    title: 'Stop Lying to Yourself',
    mantra: 'Self-deception is the most expensive habit.',
    instruction: 'Where are you bullshitting yourself right now? Not to others — to yourself. About your effort, your habits, your excuses. Write it down. You cannot fix what you won\'t admit.',
    source: 'Radical Honesty',
    section: 'anti-sabotage',
    states: ['low_energy', 'distracted'],
    cta: 'Tell yourself the truth',
  },
  {
    id: 'action-override',
    title: 'Action Override',
    mantra: 'You cannot think your way to action. You act your way to clarity.',
    instruction: 'Stop planning. Stop thinking about whether you\'re ready. Take the smallest possible physical action toward the thing you\'ve been overthinking. Motion creates momentum. Nothing else does.',
    source: 'Execution',
    section: 'anti-sabotage',
    states: ['distracted', 'stressed'],
    cta: 'Take the first action',
  },
  {
    id: 'break-the-loop',
    title: 'Break the Loop',
    mantra: 'A pattern continues until you interrupt it.',
    instruction: 'Right now, change something physical. Get up. Go to a different room. Drink water. Do 10 push-ups. The loop you\'re in is a signal pattern — interrupt the signal, interrupt the loop.',
    source: 'Pattern Interruption',
    section: 'anti-sabotage',
    states: ['distracted', 'stressed'],
    cta: 'Break it now',
  },
]

// Get one content piece for a given state, rotating daily
export function getDailyPiece(state: MindState, offsetSeed = 0): ContentPiece {
  const pool = CONTENT_PIECES.filter((p) => p.states.includes(state))
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24)
  )
  return pool[(dayOfYear + offsetSeed) % pool.length]
}

// Get all pieces for a section
export function getPiecesBySection(section: SectionId): ContentPiece[] {
  return CONTENT_PIECES.filter((p) => p.section === section)
}
