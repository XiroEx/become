// Authored SESSION BLUEPRINTS — the main session's container, built the same way
// the arsenal's protocol flows are built (see RESET_FLOWS in StateShiftDashboard).
//
// WHY THIS EXISTS. The main session used to be assembled move-by-move out of
// separate pools, and the AI engine was allowed to choose the moves, their order,
// their titles AND their payload. Nothing checked the result was coherent, so
// sessions restated themselves beat to beat, closed on the wrong register (a
// "how heavy is today?" check-in as the CLOSER, right after the user checked in
// locked in), and put unsayable second-person paragraphs in front of a scene that
// asks you to say the line out loud.
//
// A blueprint is a COMPLETE session authored as one unit: an ordered set of slots
// (regulate → core → close) each carrying a brief for what that beat is FOR, plus
// authored copy so the blueprint runs perfectly with ZERO AI. The AI no longer
// designs the session; it writes copy INTO these slots, and any field that fails
// validation falls back to the authored line. Same trade the arsenal already
// makes, and the reason its flows read better.
//
// Pure + client-safe (no server/DOM imports), same as the rest of lib/mind.

import { buildMove } from './moveBuilders'
import type { MindState } from '@/lib/mindContent'
import type { Move, MoveKind, SessionContext } from './moves'

/** The three authored beats. state-check is structural and always prepended. */
export type SlotRole = 'regulate' | 'core' | 'close'

/** Copy a blueprint may author over the deterministic builder's output. */
export interface SlotContent {
  title?: string
  subtitle?: string
  statement?: string
  prompt?: string
  options?: { label: string; response?: string }[]
}

export interface SessionSlot {
  kind: MoveKind
  role: SlotRole
  /** Composer-facing: what this beat is FOR. Handed to the AI, never rendered. */
  brief: string
  /** Authored copy layered over buildMove(kind) — the zero-AI version of the beat.
   *  Deliberately omits `statement` on affirm slots so the user's OWN identity
   *  statement still comes through. */
  content?: SlotContent
  /** Other modalities that serve this same brief, rotated by seed so replaying a
   *  blueprint doesn't feel identical. Only ever used where the beat's payload is
   *  interchangeable (the recite-the-statement family) — never where authored
   *  options belong to one specific question. When a rotated kind is chosen the
   *  slot's authored copy is dropped, since that copy was written for `kind`. */
  alternates?: MoveKind[]
}

export interface SessionBlueprint {
  id: string
  title: string
  subtitle: string
  /** Check-in states this session was written for. 'any' fits anyone. */
  states: MindState[] | 'any'
  /** Never serve a blueprint whose moves aren't unlocked yet. */
  minChapter: number
  /** Per-session finish line, like the arsenal's per-system DONE_TEXT. */
  doneText: string
  /** Used when the regulate slot is a breath and breath is on cooldown, and as
   *  the live "you came in strong" swap the player makes at play time. */
  regulateAlt: SessionSlot
  /** regulate → core → close, authored together so beats can't restate each other. */
  slots: SessionSlot[]
}

// ─── The blueprints ───────────────────────────────────────────────────────────
// Each one is a whole session. Read them top to bottom: the arc has to work as a
// unit or the blueprint is wrong. Never add a slot without reading the ones
// around it.

export const SESSION_BLUEPRINTS: SessionBlueprint[] = [
  {
    id: 'settle-then-aim',
    title: 'Settle, then aim',
    subtitle: 'Take the edge off first. Then point it somewhere.',
    states: ['stressed'],
    minChapter: 1,
    doneText: 'Steadier than you started.',
    regulateAlt: {
      kind: 'acknowledge',
      role: 'regulate',
      brief: 'Meet the pressure honestly before doing anything with it. No fixing yet.',
      content: {
        title: 'Where is the pressure sitting right now?',
        subtitle: 'Nothing to fix yet.',
        options: [
          { label: 'In my chest, all at once', response: 'That is the body running ahead of the facts. It settles faster than it feels like it will.' },
          { label: 'In my head, on a loop', response: 'A loop is a thought that has not been finished. Naming it is most of the way to closing it.' },
          { label: 'Everywhere, honestly', response: 'Then we are not solving today. We are just bringing it down a notch, and that is enough.' },
        ],
      },
    },
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Down-regulate first. Nothing useful happens on top of a spiked nervous system.',
        content: { title: 'Bring it down first', subtitle: 'Follow the circle. Nothing else to do.' },
      },
      {
        kind: 'acknowledge',
        role: 'core',
        brief: 'Name what is actually driving the pressure. Validate it, do not argue with it.',
        content: {
          title: 'What is actually driving the pressure right now?',
          subtitle: 'No need to spin it.',
          options: [
            { label: 'Too much at once', response: 'Then nothing moves until the pile gets smaller. One item. That is the whole job.' },
            { label: 'One specific thing', response: 'A named problem is a smaller problem. You are already past the worst part of it.' },
            { label: 'I honestly do not know', response: 'That is worth knowing too. Not every weight announces itself, and you can still choose the next move without naming it.' },
          ],
        },
      },
      {
        kind: 'identity',
        role: 'close',
        brief: 'Close on the line they hold when it gets heavy. Their own statement if they have one.',
        alternates: ['mirror', 'speak', 'compose', 'type'],
        content: { title: 'This is the line you hold', subtitle: 'Hold to lock it in.' },
      },
    ],
  },

  {
    id: 'one-point',
    title: 'One point',
    subtitle: 'Pull it back to a single thing.',
    states: ['distracted'],
    minChapter: 1,
    doneText: 'Back on one thing.',
    regulateAlt: {
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
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Even, boxed breathing to gather scattered attention back to one point.',
        content: { title: 'Gather it back', subtitle: 'Even in, even out.' },
      },
      {
        kind: 'choice',
        role: 'core',
        brief: 'Force the single highest-leverage thing for today out of them.',
        content: {
          title: 'What would actually make today count?',
          subtitle: 'Pick the one that is true.',
          options: [
            { label: 'Finishing the thing I keep pushing', response: 'Then that is the day. Everything else is optional and you can stop negotiating with it.' },
            { label: 'Starting something I have been avoiding', response: 'Starting is the whole hurdle. Ten minutes in, the avoidance is gone.' },
            { label: 'Just not losing the day', response: 'Fair. Holding the line counts. Pick one small thing and hold it.' },
          ],
        },
      },
      {
        kind: 'type',
        role: 'close',
        brief: 'Write the line out word for word. Typing forces attention where reading does not.',
        alternates: ['identity', 'speak', 'compose', 'mirror'],
        content: { title: 'Write it out', subtitle: 'Word for word. That is the point.' },
      },
    ],
  },

  {
    id: 'small-input',
    title: 'Small input',
    subtitle: 'Low days still count. We keep this light.',
    states: ['low_energy'],
    minChapter: 1,
    doneText: 'That counts. Especially today.',
    regulateAlt: {
      kind: 'acknowledge',
      role: 'regulate',
      brief: 'Validate the flatness instead of arguing with it. No forced positivity.',
      content: {
        title: 'How much is in the tank?',
        subtitle: 'No need to spin it.',
        options: [
          { label: 'Close to empty', response: 'Then today is maintenance, not progress. Maintenance still keeps the streak alive.' },
          { label: 'Enough for one thing', response: 'One thing is a full day when the tank is low. Choose it carefully.' },
          { label: 'More than I expected', response: 'Good. Flat mornings turn around more often than people give them credit for.' },
        ],
      },
    },
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Brisk breathing to raise alertness. Wake the system up rather than calm it.',
        content: { title: 'Come online', subtitle: 'Quick in, sharp out.' },
      },
      {
        // The register this question was WRITTEN for. It belongs here, in the core
        // slot of the low-energy session, not tacked onto the end of a session
        // the user opened feeling locked in.
        kind: 'acknowledge',
        role: 'core',
        brief: 'Let them say how heavy it is without spinning it, then meet that answer honestly.',
        content: {
          title: 'Be honest. How heavy is today?',
          subtitle: 'No need to spin it.',
          options: [
            { label: 'Heavy', response: 'Then showing up here was the hard part and you already did it. Keep today small.' },
            { label: 'Manageable', response: 'Manageable is workable. Pick one thing and let the rest be average.' },
            { label: 'Light', response: 'Then use it. Light days are where you build the buffer for the heavy ones.' },
          ],
        },
      },
      {
        kind: 'compose',
        role: 'close',
        brief: 'Lowest-effort affirm modality. Fill blanks rather than recite. No wrong answers.',
        alternates: ['identity', 'type', 'mirror'],
        content: { title: 'Fill it in', subtitle: 'Choose the words that fit today.' },
      },
    ],
  },

  {
    id: 'pour-it-in',
    title: 'Pour it in',
    subtitle: 'You came in dialed. Let us aim it.',
    states: ['locked_in'],
    minChapter: 1,
    // No breath here on purpose. You do not down-regulate someone who is already
    // on. The arsenal figured this out first (State Shift routes "Dialed in" to
    // Protect the State, not to breathwork).
    doneText: 'Spent on purpose.',
    regulateAlt: {
      kind: 'win',
      role: 'regulate',
      brief: 'Bank the evidence while it is fresh.',
      content: { title: 'Bank what you already did', subtitle: 'It counts. Log it.' },
    },
    slots: [
      {
        kind: 'win',
        role: 'regulate',
        brief: 'Start from evidence, not calming. They are already up; give the state something real to stand on.',
        content: { title: 'Bank what you already did', subtitle: 'One thing. It counts.' },
      },
      {
        kind: 'mission',
        role: 'core',
        brief: 'Aim the state at ONE concrete thing before it fades. The prompt is the NUDGE that helps them name it; the user writes the actual move. Never write the move for them.',
        content: { title: 'What is the one thing to attack while this lasts?', subtitle: 'Highest leverage. Not the easiest.' },
      },
      {
        kind: 'speak',
        role: 'close',
        brief: 'Say it out loud. A dialed-in state is the one time saying it aloud lands hardest.',
        alternates: ['mirror', 'identity', 'type', 'compose'],
        content: { title: 'Say it out loud', subtitle: 'Like you mean it.' },
      },
    ],
  },

  {
    id: 'evidence',
    title: 'Evidence',
    subtitle: 'Proof beats hype.',
    states: 'any',
    minChapter: 2,
    doneText: 'That is who you are now.',
    regulateAlt: {
      kind: 'win',
      role: 'regulate',
      brief: 'Open on a real thing they did. Evidence, not affirmation.',
      content: { title: 'Name one thing you actually did', subtitle: 'Small is fine. Real is the requirement.' },
    },
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Even, balanced breathing. Settle without sedating.',
        content: { title: 'Level out', subtitle: 'Smooth in, smooth out.' },
      },
      {
        kind: 'win',
        role: 'core',
        brief: 'Bank a specific win and connect it to who they are becoming, not to a streak.',
        content: { title: 'Name one thing you actually did', subtitle: 'Small is fine. Real is the requirement.' },
      },
      {
        kind: 'mirror',
        role: 'close',
        brief: 'Look at yourself and say the line. Must be short and first person to be sayable.',
        alternates: ['speak', 'type', 'identity', 'compose'],
        content: { title: 'Look at yourself and say it', subtitle: 'Short line. Mean it.' },
      },
    ],
  },

  {
    id: 'future-self',
    title: 'The one ahead of you',
    subtitle: 'See them clearly enough to move like them.',
    states: 'any',
    minChapter: 2,
    doneText: 'Coming into focus.',
    regulateAlt: {
      kind: 'choice',
      role: 'regulate',
      brief: 'One quick orienting decision about where they are pointed today.',
      content: {
        title: 'Are you moving toward that person today, or away?',
        subtitle: 'No wrong answer.',
        options: [
          { label: 'Toward', response: 'Then keep the direction and stop auditing it. Momentum does not need permission.' },
          { label: 'Away', response: 'Useful to know before the day gets away from you. One choice flips the direction.' },
          { label: 'Standing still', response: 'Standing still is a direction too. One small move today is enough to break it.' },
        ],
      },
    },
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Slow, balanced breathing to get out of reactive mode before looking forward.',
        content: { title: 'Get quiet first', subtitle: 'You cannot see far from a loud room.' },
      },
      {
        kind: 'vision',
        role: 'core',
        brief: 'Put them in one specific scene from the life they are building. Sensory, not abstract.',
        content: { title: 'See it', subtitle: 'One scene. Make it specific.' },
      },
      {
        kind: 'identity',
        role: 'close',
        brief: 'Collapse the vision into the one line they carry out of here.',
        alternates: ['mirror', 'speak', 'type', 'compose'],
        content: { title: 'This is who that makes you', subtitle: 'Hold to lock it in.' },
      },
    ],
  },

  {
    id: 'hold-the-line',
    title: 'Hold the line',
    subtitle: 'One hard thing, done anyway.',
    states: 'any',
    minChapter: 3,
    doneText: 'That is how it gets built.',
    regulateAlt: {
      kind: 'interrogative',
      role: 'regulate',
      brief: 'Ask, do not declare. Interrogative self-talk outperforms declarative before hard work.',
      content: {
        title: 'Will you do the hard thing today?',
        subtitle: 'Answer for today.',
        options: [
          { label: 'Yes', response: 'Then it is decided and you can stop spending energy on the decision.' },
          { label: 'Probably', response: 'Probably is how it gets negotiated away later. Make it a yes or make it smaller.' },
          { label: 'I do not want to', response: 'Not wanting to is the normal condition. It has never once been a reason.' },
        ],
      },
    },
    slots: [
      {
        kind: 'breath',
        role: 'regulate',
        brief: 'Boxed breathing to steady the nerves before committing to something hard.',
        content: { title: 'Steady up', subtitle: 'In, hold, out, hold.' },
      },
      {
        kind: 'challenge',
        role: 'core',
        brief: "Today's discipline rep. One hard thing, named and committed to.",
        content: { title: "Today's hard thing", subtitle: 'Name it. Then do it anyway.' },
      },
      {
        kind: 'identity',
        role: 'close',
        brief: 'Tie the rep back to identity. They are not doing a task, they are becoming someone.',
        alternates: ['speak', 'type', 'mirror', 'compose'],
        content: { title: 'This is what that makes you', subtitle: 'Hold to lock it in.' },
      },
    ],
  },
]

// ─── Selection ────────────────────────────────────────────────────────────────

/** Merge authored slot copy over the deterministic builder, skipping undefined
 *  keys so the builder's personalization (the user's own statement, their mission
 *  action) survives wherever the blueprint stayed quiet. */
export function slotMove(slot: SessionSlot, ctx: SessionContext): Move {
  const base = buildMove(slot.kind, ctx)
  const c = slot.content
  if (!c) return base
  return {
    ...base,
    ...(c.title !== undefined && { title: c.title }),
    ...(c.subtitle !== undefined && { subtitle: c.subtitle }),
    ...(c.statement !== undefined && { statement: c.statement }),
    ...(c.prompt !== undefined && { prompt: c.prompt }),
    ...(c.options !== undefined && { options: c.options }),
  }
}

function eligible(ctx: SessionContext): SessionBlueprint[] {
  const byChapter = SESSION_BLUEPRINTS.filter((b) => b.minChapter <= ctx.chapter)
  const state = ctx.recentState
  // A blueprint written FOR their state wins outright — that is the arsenal's
  // "the check-in is the shift" rule applied to the main session.
  const matched = state ? byChapter.filter((b) => b.states !== 'any' && b.states.includes(state)) : []
  if (matched.length > 0) return matched
  const general = byChapter.filter((b) => b.states === 'any')
  if (general.length > 0) return general
  return byChapter.length > 0 ? byChapter : [SESSION_BLUEPRINTS[0]]
}

/**
 * The blueprint today's session is built on. Deterministic: state first, then a
 * seed rotation across the ones that fit, preferring a closing modality the user
 * did not just get. No AI in this decision, by design.
 */
export function pickBlueprint(ctx: SessionContext): SessionBlueprint {
  const pool = eligible(ctx)
  const seed = ctx.seed ?? ctx.dayOfYear
  const avoid = new Set(ctx.recentKinds ?? [])
  if (avoid.size > 0) {
    const fresh = pool.filter((b) => !b.slots.some((s) => s.role === 'close' && avoid.has(s.kind)))
    if (fresh.length > 0) return fresh[Math.abs(seed) % fresh.length]
  }
  return pool[Math.abs(seed) % pool.length]
}

/** Resolve a blueprint's regulate slot against the breath cooldown. */
export function regulateSlot(bp: SessionBlueprint, onBreathCooldown: boolean): SessionSlot {
  const slot = bp.slots.find((s) => s.role === 'regulate') ?? bp.slots[0]
  return slot.kind === 'breath' && onBreathCooldown ? bp.regulateAlt : slot
}

/**
 * Which modality this slot runs today. Rotating the close beat across the
 * recite-the-statement family is what stops a replayed blueprint feeling like the
 * same session twice. The authored copy is written for `slot.kind`, so a rotated
 * kind drops it and uses the builder's own (already scene-appropriate) titles.
 */
export function resolveSlot(slot: SessionSlot, ctx: SessionContext): SessionSlot {
  if (!slot.alternates || slot.alternates.length === 0) return slot
  const seed = Math.abs(ctx.seed ?? ctx.dayOfYear)
  const options = [slot.kind, ...slot.alternates]
  const avoid = new Set(ctx.recentKinds ?? [])
  // Prefer a modality they did not just get.
  const fresh = options.filter((k) => !avoid.has(k))
  const pool = fresh.length > 0 ? fresh : options
  const kind = pool[seed % pool.length]
  if (kind === slot.kind) return slot
  return { kind, role: slot.role, brief: slot.brief }
}

/** Breath is spaced out: once done it goes on cooldown so back-to-back sessions
 *  in the same few hours don't repeat the same breathing. */
export const BREATH_COOLDOWN_MS = 4 * 60 * 60 * 1000 // ~4h

/** Is the breath beat on cooldown for this context? */
export function breathOnCooldown(ctx: SessionContext, cooldownMs: number = BREATH_COOLDOWN_MS): boolean {
  const now = ctx.now ?? 0
  return ctx.lastBreathAt != null && now > 0 && now - ctx.lastBreathAt < cooldownMs
}

/** The slots a blueprint runs today, regulate → core → close, cooldown applied. */
export function blueprintSlots(
  bp: SessionBlueprint,
  ctx: SessionContext,
  onBreathCooldown: boolean,
): SessionSlot[] {
  return [
    regulateSlot(bp, onBreathCooldown),
    ...bp.slots.filter((s) => s.role !== 'regulate'),
  ].map((s) => resolveSlot(s, ctx))
}

/** The moves a blueprint renders today (without the leading state-check). */
export function blueprintMoves(
  bp: SessionBlueprint,
  ctx: SessionContext,
  onBreathCooldown: boolean,
): Move[] {
  const moves = blueprintSlots(bp, ctx, onBreathCooldown).map((s) => slotMove(s, ctx))
  // A positive live check-in swaps the regulate breath for the blueprint's
  // alternative rather than forcing calm on someone who came in hot.
  if (moves[0]?.kind === 'breath') moves[0].altPositive = slotMove(bp.regulateAlt, ctx)
  return moves
}

/**
 * Rebuild a session around the state the user JUST reported.
 *
 * The session is composed before it is played (and the AI plan is cached for up
 * to 8h), so `ctx.recentState` is whatever they felt LAST time — possibly days
 * ago. Without this, answering "low energy" changed nothing but the breath
 * protocol: the core and close beats were already fixed. The arsenal never had
 * that problem because naming your state there routes you straight into the
 * matching reset.
 *
 * Returns null when today's answer lands on the same blueprint (nothing to do),
 * so the personalized copy already on screen is kept.
 */
export function realignPlan(
  currentBlueprintId: string | undefined,
  liveState: MindState,
  ctx: SessionContext,
): { blueprint: SessionBlueprint; moves: Move[] } | null {
  const bp = pickBlueprint({ ...ctx, recentState: liveState })
  if (bp.id === currentBlueprintId) return null
  return { blueprint: bp, moves: blueprintMoves(bp, ctx, breathOnCooldown(ctx)) }
}
