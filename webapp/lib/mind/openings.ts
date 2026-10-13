// STATE OPENINGS — the part of the session the user's check-in owns.
//
// A session is now composed from two halves:
//
//   OPENING  = f(state)      ← this file. Meets them where they are.
//   BODY     = f(path)       ← lib/mind/bodies.ts. Today's curriculum theme.
//
// Before this split, one blueprint owned all three beats and was chosen purely by
// state, so the 50-session path never reached the session's shape — it was only a
// hint in the AI prompt. Worse, checking in differently mid-session rebuilt every
// beat, which threw away the path theme AND all the AI personalization while the
// intro still displayed the path focus. Intro and body disagreed.
//
// Splitting them fixes both: realigning swaps ONLY the opening, so the path body
// (and its personalized copy) survives untouched. Recognise the feeling, then
// continue the path — which is exactly the intent.
//
// Pure + client-safe.

import type { MindState } from '@/lib/mindContent'
import type { SessionSlot } from './slots'

export interface StateOpening {
  id: string
  /** How the app frames the session it is about to run, given this state. */
  title: string
  subtitle: string
  /** The regulate beat. */
  slot: SessionSlot
  /** Used when breath is on cooldown, and as the live "came in strong" swap. */
  alt: SessionSlot
}

/** Default when we have no check-in yet (first ever session). */
export const NEUTRAL_OPENING: StateOpening = {
  id: 'open-neutral',
  title: 'Settle in',
  subtitle: 'A minute to arrive before the work.',
  slot: {
    kind: 'breath',
    role: 'regulate',
    brief: 'Arrive. A short breath to land in the session before the real work starts.',
    content: { title: 'Arrive', subtitle: 'Follow the circle.' },
  },
  alt: {
    kind: 'choice',
    role: 'regulate',
    brief: 'One quick orienting question so the session starts from something true.',
    content: {
      title: 'How are you walking into this?',
      subtitle: 'No wrong answer.',
      options: [
        { label: 'Ready', response: 'Good. We will not waste it.' },
        { label: 'Going through the motions', response: 'Honest. Motions still count, and they often turn into momentum halfway through.' },
        { label: 'Not sure yet', response: 'Fine. You do not have to know before you start.' },
      ],
    },
  },
}

export const STATE_OPENINGS: Record<MindState, StateOpening> = {
  stressed: {
    id: 'open-settle',
    title: 'Settle first',
    subtitle: 'Take the edge off, then do the work.',
    slot: {
      kind: 'breath',
      role: 'regulate',
      brief: 'Down-regulate first. Nothing useful lands on top of a spiked nervous system.',
      content: { title: 'Bring it down first', subtitle: 'Follow the circle. Nothing else to do.' },
    },
    alt: {
      kind: 'acknowledge',
      role: 'regulate',
      brief: 'Meet the pressure honestly before doing anything with it. No fixing yet.',
      content: {
        title: 'Where is the pressure sitting right now?',
        subtitle: 'Nothing to fix yet.',
        options: [
          { label: 'In my chest, all at once', response: 'That is the body running ahead of the facts. It settles faster than it feels like it will.' },
          { label: 'In my head, on a loop', response: 'A loop is a thought that has not been finished. Naming it is most of the way to closing it.' },
          { label: 'Everywhere, honestly', response: 'Then we are not solving today. We are bringing it down a notch, and that is enough.' },
        ],
      },
    },
  },

  distracted: {
    id: 'open-one-point',
    title: 'One point',
    subtitle: 'Pull it back to a single thing, then go.',
    slot: {
      kind: 'breath',
      role: 'regulate',
      brief: 'Even, boxed breathing to gather scattered attention back to one point.',
      content: { title: 'Gather it back', subtitle: 'Even in, even out.' },
    },
    alt: {
      kind: 'choice',
      role: 'regulate',
      brief: 'Cheap first decision that collapses the number of open loops.',
      content: {
        title: 'How many things are you holding right now?',
        subtitle: 'No wrong answer.',
        options: [
          { label: 'Two or three', response: 'Manageable. Rank them and the top one is your day.' },
          { label: 'More than I can name', response: 'Then the list is the problem, not you. Everything but one thing can wait an hour.' },
          { label: 'One, and I am avoiding it', response: 'That is not distraction. That is avoidance wearing a costume. You already know the move.' },
        ],
      },
    },
  },

  low_energy: {
    id: 'open-small-input',
    title: 'Small input',
    subtitle: 'Low days still count. We keep this light.',
    slot: {
      kind: 'breath',
      role: 'regulate',
      brief: 'Brisk breathing to raise alertness. Wake the system up rather than calm it.',
      content: { title: 'Come online', subtitle: 'Quick in, sharp out.' },
    },
    alt: {
      kind: 'acknowledge',
      role: 'regulate',
      brief: 'Let them say how heavy it is without spinning it, then meet that answer honestly.',
      content: {
        title: 'Be honest. How heavy is today?',
        subtitle: 'No need to spin it.',
        options: [
          { label: 'Heavy', response: 'Then showing up here was the hard part and you already did it. Keep today small.' },
          { label: 'Manageable', response: 'Manageable is workable. Pick one thing and let the rest be average.' },
          { label: 'Light', response: 'Then use it. Light days build the buffer for the heavy ones.' },
        ],
      },
    },
  },

  locked_in: {
    // No breath here on purpose. You do not down-regulate someone already on — the
    // arsenal figured this out first (State Shift routes "Dialed in" to Protect the
    // State, not to breathwork).
    id: 'open-pour-it-in',
    title: 'Pour it in',
    subtitle: 'You came in dialed. Let us aim it.',
    slot: {
      kind: 'win',
      role: 'regulate',
      brief: 'Start from evidence, not calming. They are already up; give the state something real to stand on.',
      content: { title: 'Bank what you already did', subtitle: 'One thing. It counts.' },
    },
    alt: {
      kind: 'win',
      role: 'regulate',
      brief: 'Bank the evidence while it is fresh.',
      content: { title: 'Bank what you already did', subtitle: 'It counts. Log it.' },
    },
  },
}

export function openingFor(state: MindState | null | undefined): StateOpening {
  return state ? STATE_OPENINGS[state] : NEUTRAL_OPENING
}
