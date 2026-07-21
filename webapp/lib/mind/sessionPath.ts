// The 50-session directed path — the main-session CURRICULUM. Ten sessions per
// chapter, walking a deliberate arc (Reset → Foundation → Edge → Defense →
// Architect) instead of a fully free-styled theme each day. The composer still
// personalizes every move to the user's real data and past answers; the path
// prescribes the SPINE. After session 50 the path ends and sessions go fully
// adaptive (the composer's free mode). Client-safe, no server imports.

export interface PathSession {
  /** 1-based session number (== mainSessionCount + 1 when it's the NEXT one). */
  n: number
  chapter: number
  /** Short focus title — shown on the session card + used for the intro. */
  focus: string
  /** The composer directive: what this session is FOR. One thread, deep. */
  directive: string
}

const P = (n: number, chapter: number, focus: string, directive: string): PathSession =>
  ({ n, chapter, focus, directive })

export const SESSION_PATH: PathSession[] = [
  // ── Chapter 1 · Reset — learn to run your own state ──
  P(1, 1, 'Notice where you are', 'First session: teach them to NOTICE their current state without judging it. Naming a state creates distance from it. Keep it gentle — this is day one.'),
  P(2, 1, 'The pause', 'Build the pause: one breath between trigger and reaction. Have them find a real recent moment they reacted on autopilot and replay it with a pause.'),
  P(3, 1, 'Drop the story', 'Separate what HAPPENED from what they made it MEAN. Use a real recent frustration; strip the story from the fact.'),
  P(4, 1, 'Come back to now', 'Anchor into the present on demand. Most stress lives in the past or future; train one concrete anchor (breath, senses, the next task).'),
  P(5, 1, 'Move the state', 'The body leads the mind. Have them pick a physical state-shifter (move, posture, breath, cold) and commit to using it today.'),
  P(6, 1, 'Cut the noise', 'Identify ONE source of mental static (feed, person, tab, habit) and cut it for 24 hours. Silence sharpens everything.'),
  P(7, 1, 'Name the next action', 'Collapse overwhelm into the single next action. Take something they are avoiding and reduce it to one concrete move.'),
  P(8, 1, 'Choose your state', 'Flip from reacting to choosing: decide how they want to show up today, then step into that state deliberately.'),
  P(9, 1, 'Reset under pressure', 'Rehearse the snap-back for a high-pressure moment they actually have coming. Pressure is where the reset earns its keep.'),
  P(10, 1, 'Steady by default', 'Cap the chapter: calm is becoming their baseline, not their exception. Review how far their state control has come; set the standard going forward.'),

  // ── Chapter 2 · Foundation — who, where, and why ──
  P(11, 2, 'Meet the future you', 'Introduce the future self: have them picture who they are becoming in vivid detail — one scene, one day in that life.'),
  P(12, 2, 'Name the identity', 'Distill it to one identity sentence: who they are NOW becoming. Build on their existing identity statement if they have one — deepen, not repeat.'),
  P(13, 2, 'The five domains', 'Widen the vision across the five domains: body, mind, habits, relationships, environment. Find the domain they see least clearly.'),
  P(14, 2, 'Find the gap', 'Contrast: where does today differ MOST from the future self? Name the single widest gap without shame — clarity, not judgment.'),
  P(15, 2, 'The why beneath the why', 'Dig past their surface reason to the real one. Ask why until it gets personal. Their mission statement is the raw material.'),
  P(16, 2, 'What matters most', 'Priority: of everything they want, what is the ONE thing worth building everything else around?'),
  P(17, 2, 'Kill the old version', 'Retire the old story: name one belief or label from the old self they are done carrying, and what replaces it.'),
  P(18, 2, 'Act as if', 'Bridge identity to action: one choice TODAY made as the future self would make it.'),
  P(19, 2, 'The north star', 'Alignment check: did today (and this week) actually point toward the vision? Honest audit, one course-correction.'),
  P(20, 2, 'Foundation set', 'Cap the chapter: lock identity + vision + mission into one integrated picture they can say out loud. This is the foundation everything else builds on.'),

  // ── Chapter 3 · Edge — forge the habit ──
  P(21, 3, 'The one non-negotiable', 'Introduce the non-negotiable: ONE daily rep that changes everything. Have them choose it and define what counts as done.'),
  P(22, 3, 'Do it anyway', 'Act before the feeling arrives. Feelings are data, not instructions — train moving while unmotivated, today.'),
  P(23, 3, 'Eat the frog', 'Hardest thing first. Identify tomorrow\'s frog tonight and commit to doing it before anything else.'),
  P(24, 3, 'Discomfort on purpose', 'Voluntary hardship: pick one uncomfortable thing to seek out today. Comfort is the cage.'),
  P(25, 3, 'Find your 40%', 'The 40% rule: when they think they are done, they are not. Find a recent quit-point and push one step past it.'),
  P(26, 3, 'Kill the excuse', 'Name their most-used excuse verbatim, then dismantle it. An excuse repeated becomes a belief.'),
  P(27, 3, 'Cold reality', 'Ownership: where they are is the sum of what they have done. No blame, full responsibility — and therefore full power to change it.'),
  P(28, 3, 'Keep the streak', 'Protect the chain: their streak and reps are real evidence. Plan for the day the streak is threatened.'),
  P(29, 3, 'Standards over moods', 'Hold the line when they do not feel like it. Define the minimum standard that stands even on the worst day.'),
  P(30, 3, 'Forged', 'Cap the chapter: the habit is now who they are, not what they do. Consolidate what became non-negotiable and claim it as identity.'),

  // ── Chapter 4 · Defense — stop stopping yourself ──
  P(31, 4, 'Spot the pattern', 'Introduce pattern-awareness: how have they stopped themselves before? Name their signature sabotage pattern from their own history.'),
  P(32, 4, 'The fork you always miss', 'Find the decision-moment right before the slip — the fork they usually sail past. Train catching it in real time.'),
  P(33, 4, 'What it\'s protecting', 'Go under the sabotage: what is the pattern protecting them from (failure, exposure, change)? Compassion plus truth.'),
  P(34, 4, 'Stop lying to yourself', 'Face the self-deception costing them most right now. Have them say the true version plainly.'),
  P(35, 4, 'Interrupt the loop', 'Build the interrupt: a concrete pattern-breaker (move, speak, environment change) deployed at the first signal.'),
  P(36, 4, 'Action override', 'You cannot think your way out of a loop — act your way out. Smallest possible action that breaks today\'s loop.'),
  P(37, 4, 'Plan for the dip', 'Pre-decide the response to the next low moment: if X happens, I do Y. Write the if-then before it is needed.'),
  P(38, 4, 'Rebuild fast', 'Shrink recovery time: the skill is not never slipping, it is the speed of getting back. Review their last slip and cut the comeback time in half.'),
  P(39, 4, 'Guard the wins', 'Protect momentum: identify how they typically undermine progress right after wins, and set one guard for it.'),
  P(40, 4, 'Defended', 'Cap the chapter: the old pattern no longer runs them. Name the pattern, the interrupt, the comeback — their full defense, consolidated.'),

  // ── Chapter 5 · Architect — design the world around you ──
  P(41, 5, 'Circle audit', 'Introduce environment design: audit who and what shapes them daily — people, spaces, inputs. Honest inventory, no judgment.'),
  P(42, 5, 'Raise your average', 'They are the average of their closest five. Choose one relationship to invest in deliberately this week.'),
  P(43, 5, 'Set the standard', 'Define the standard for how they are treated and how they treat. Standards teach people how to show up around you.'),
  P(44, 5, 'Genuine interest', 'Train real connection: one person today gets their genuine, undivided interest. Care is a practice.'),
  P(45, 5, 'The hard conversation', 'The conversation they have been avoiding is the expensive one. Identify it and script the first sentence.'),
  P(46, 5, 'Design your space', 'Engineer the physical environment: one change to their space that makes the right thing easier and the wrong thing harder.'),
  P(47, 5, 'Cut the drain', 'Remove one input that reliably pulls them down (account, feed, habit, obligation). Addition by subtraction.'),
  P(48, 5, 'Be the influence', 'Flip it: they shape their circle too. How does the person they are becoming influence the room?'),
  P(49, 5, 'Build your table', 'Gather the people they are becoming-with: who belongs at their table, and what is the next move to build it?'),
  P(50, 5, 'Architect', 'The capstone: they have engineered state, identity, habits, defenses, and world. Review the whole arc in their own words and set the horizon beyond the path.'),
]

/** The NEXT path session for a user with `mainSessionCount` completed main
 *  sessions. Null once the path is finished (sessions go fully adaptive). */
export function getPathSession(mainSessionCount: number): PathSession | null {
  const n = Math.max(0, Math.floor(mainSessionCount || 0))
  return n < SESSION_PATH.length ? SESSION_PATH[n] : null
}
