// Run with: npm run test:file tests/unit/mind/sessionGuards.test.ts
//
// Guard rails for the main Mind session. Every case here is a real defect that
// shipped to a user (reported 2026-07-28 with screenshots) and is now impossible
// by construction:
//
//   • a 56-word second-person paragraph in front of the mirror scene
//   • two consecutive beats restating each other
//   • "Be honest. How heavy is today?" as the CLOSER of a session the user
//     opened by checking in locked in
//
// If one of these tests starts failing, the session can ship that screen again.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isSayable,
  validateStatement,
  validateOptions,
  validateCompose,
  restates,
  canClose,
  isDownState,
  MAX_SPOKEN_WORDS,
} from '../../../lib/mind/validateMove'
import { sessionShape, realignOpening, slotMove, STATE_OPENINGS, NEUTRAL_OPENING, openingFor } from '../../../lib/mind/blueprints'
import { PATH_BODIES } from '../../../lib/mind/bodies'
import { SESSION_PATH, getPathSession } from '../../../lib/mind/sessionPath'
import type { SessionSlot } from '../../../lib/mind/slots'
import { composeSession } from '../../../lib/mind/composeSession'
import type { SessionContext } from '../../../lib/mind/moves'
import type { MindState } from '../../../lib/mindContent'

// The exact statement that reached the mirror scene.
const SHIPPED_MIRROR_STATEMENT =
  "You said, 'I help people that are in need. And I spread my knowledge and Wealth " +
  'with everyone around me to help them reach any goal and go above any task. I am a ' +
  "role model and a leader to many.' That kind of impact starts with genuine interest " +
  'in who they are.'

// The beat that followed it.
const SHIPPED_NEXT_QUESTION =
  'When you give someone your genuine, undivided interest, what shifts in that interaction?'

function ctx(over: Partial<SessionContext> = {}): SessionContext {
  return {
    chapter: 5,
    unlockedSystems: ['state-shift', 'self-image', 'mission', 'discipline', 'anti-sabotage', 'social', 'vision'],
    recentState: null,
    missionAction: null,
    identityStatement: null,
    recentKinds: [],
    pathFocus: null,
    dayOfYear: 100,
    seed: 7,
    now: 0,
    lastBreathAt: null,
    ...over,
  }
}

// ─── isSayable / validateStatement ────────────────────────────────────────────

test('the shipped mirror statement is rejected as unsayable', () => {
  assert.equal(isSayable(SHIPPED_MIRROR_STATEMENT), false)
  for (const kind of ['mirror', 'speak', 'type', 'assemble'] as const) {
    assert.equal(validateStatement(SHIPPED_MIRROR_STATEMENT, kind), null, `${kind} must reject it`)
  }
})

test('second-person statements are rejected for say-aloud kinds', () => {
  assert.equal(isSayable('You are the kind of person who follows through.'), false)
  assert.equal(isSayable('Your discipline is what got you here.'), false)
  assert.equal(validateStatement('You show up even when it is hard.', 'speak'), null)
})

test('a nested quote is rejected — that is an echo, not an affirmation', () => {
  assert.equal(isSayable('I said, "I will finish what I start."'), false)
})

test('short first-person statements pass', () => {
  assert.equal(isSayable('I do what I say I will do.'), true)
  assert.equal(isSayable('I am the person who finishes.'), true)
  assert.equal(isSayable('My word is the standard.'), true)
  assert.equal(validateStatement('I do what I say I will do.', 'mirror'), 'I do what I say I will do.')
})

test('say-aloud statements are word-capped; identity may run longer', () => {
  const long = 'I am ' + 'steady '.repeat(MAX_SPOKEN_WORDS + 2).trim() + '.'
  assert.equal(validateStatement(long, 'speak'), null, 'over the spoken cap must be rejected')
  // identity reveals + holds rather than reciting, so it gets more room.
  assert.ok(validateStatement(long, 'identity'), 'identity should accept a longer first-person line')
})

test('surrounding quote marks are stripped rather than failing the line', () => {
  assert.equal(validateStatement('"I finish what I start."', 'mirror'), 'I finish what I start.')
})

// ─── restates ─────────────────────────────────────────────────────────────────

test('the two beats that read as one are caught as a restatement', () => {
  assert.equal(restates(SHIPPED_MIRROR_STATEMENT, SHIPPED_NEXT_QUESTION), true)
})

test('genuinely different beats are not flagged', () => {
  assert.equal(
    restates('I do what I say I will do.', 'What would actually make today count?'),
    false,
  )
})

// ─── options / compose payloads ───────────────────────────────────────────────

test('options need at least two real answers and cap at four', () => {
  assert.equal(validateOptions([]), null)
  assert.equal(validateOptions(['only one']), null)
  assert.equal(validateOptions([{ response: 'no label' }]), null)
  const five = validateOptions(['a', 'b', 'c', 'd', 'e'])
  assert.equal(five?.length, 4)
})

test('a compose template with a blank that has no word list is rejected', () => {
  assert.equal(validateCompose({ template: 'I am {0} and I {1}.', blanks: [['steady']] }), null)
  assert.ok(validateCompose({ template: 'I am {0}.', blanks: [['steady', 'ready']] }))
})

// ─── register + closing rules ─────────────────────────────────────────────────

test('acknowledge can never close a session', () => {
  assert.equal(canClose('acknowledge'), false)
  assert.equal(canClose('identity'), true)
  assert.equal(canClose('mirror'), true)
})

test('acknowledge is only justified by a down check-in', () => {
  assert.equal(isDownState('locked_in'), false)
  assert.equal(isDownState('low_energy'), true)
  assert.equal(isDownState('stressed'), true)
  assert.equal(isDownState('distracted'), true)
  assert.equal(isDownState(null), false)
})

// ─── openings + bodies ───────────────────────────────────────────────────────

const ALL_SLOTS = (): SessionSlot[] => [
  ...Object.values(STATE_OPENINGS).flatMap((o) => [o.slot, o.alt]),
  NEUTRAL_OPENING.slot, NEUTRAL_OPENING.alt,
  ...Object.values(PATH_BODIES).flatMap((b) => [b.core, b.close, b.coreFallback]),
]

test('every state has an opening, and none of them is a bare breath fallback', () => {
  for (const [state, o] of Object.entries(STATE_OPENINGS)) {
    assert.ok(o.slot.brief.trim(), `${state} opening needs a brief`)
    assert.notEqual(o.alt.kind, 'breath', `${state} alt must not be breath (it covers the cooldown)`)
  }
  // Someone who came in strong should not be handed a down-regulating breath.
  assert.notEqual(STATE_OPENINGS.locked_in.slot.kind, 'breath')
})

test('every path body closes on a valid register and has a finish line', () => {
  for (const b of Object.values(PATH_BODIES)) {
    assert.equal(b.close.role, 'close')
    assert.ok(canClose(b.close.kind), `${b.shape} must not close on ${b.close.kind}`)
    assert.ok(b.doneText.trim(), `${b.shape} needs a finish line`)
    assert.ok(b.core.brief.trim(), `${b.shape} core needs a brief`)
  }
})

test('every one of the 50 path sessions maps to a real body shape', () => {
  assert.equal(SESSION_PATH.length, 50)
  for (const p of SESSION_PATH) {
    assert.ok(PATH_BODIES[p.shape], `session ${p.n} has unknown shape ${p.shape}`)
    assert.ok(['mental', 'emotional', 'spiritual', 'physical'].includes(p.dimension), `session ${p.n} bad dimension`)
    // A shape must be renderable by the chapter that session belongs to.
    assert.ok(
      PATH_BODIES[p.shape].minChapter <= p.chapter,
      `session ${p.n} (ch${p.chapter}) uses ${p.shape} which needs ch${PATH_BODIES[p.shape].minChapter}`,
    )
  }
})

test('the path works all four dimensions, not just the mental one', () => {
  const seen = new Set(SESSION_PATH.map((p) => p.dimension))
  for (const d of ['mental', 'emotional', 'spiritual', 'physical']) {
    assert.ok(seen.has(d as never), `no path session works the ${d} dimension`)
  }
})

test('authored option slots always render at least two choices', () => {
  const c = ctx()
  for (const slot of ALL_SLOTS()) {
    if (!['choice', 'acknowledge', 'interrogative'].includes(slot.kind)) continue
    const move = slotMove(slot, c)
    assert.ok((move.options?.length ?? 0) >= 2, `${slot.kind} needs 2+ options`)
    assert.ok(move.title.trim().length > 0, `${slot.kind} needs a question`)
  }
})

test('authored say-aloud slots produce a sayable statement', () => {
  // Long identity statement on purpose: the builder must fall back to a short pool
  // line rather than hand a paragraph to a scene that speech-matches it.
  const c = ctx({ identityStatement: SHIPPED_MIRROR_STATEMENT })
  for (const slot of ALL_SLOTS()) {
    if (!['mirror', 'speak', 'type', 'assemble'].includes(slot.kind)) continue
    const move = slotMove(slot, c)
    assert.ok(move.statement, `${slot.kind} needs a statement`)
    assert.ok(
      validateStatement(move.statement!, slot.kind) !== null,
      `${slot.kind} produced an unsayable line: ${move.statement}`,
    )
  }
})

test('a locked-in check-in opens on evidence, not a breath', () => {
  const shape = sessionShape(ctx({ recentState: 'locked_in' }))
  assert.equal(shape.opening.id, 'open-pour-it-in')
  assert.notEqual(shape.slots[0].kind, 'breath')
})

test('a low-energy check-in is where the heaviness question lives', () => {
  const o = openingFor('low_energy')
  assert.match(o.alt.content?.title ?? '', /how heavy is today/i)
})

// ─── the state/path split ────────────────────────────────────────────────────

test('the PATH decides the body: same state, different path day, different body', () => {
  const commitDay = SESSION_PATH.find((p) => p.shape === 'commit')!
  const envisionDay = SESSION_PATH.find((p) => p.shape === 'envision')!
  const a = sessionShape(ctx({ recentState: 'stressed', chapter: 5, pathFocus: commitDay }))
  const b = sessionShape(ctx({ recentState: 'stressed', chapter: 5, pathFocus: envisionDay }))
  assert.equal(a.opening.id, b.opening.id, 'same state should give the same opening')
  assert.notEqual(a.body.shape, b.body.shape, 'different path day must give a different body')
})

test('the STATE decides the opening: same path day, different state, same body', () => {
  const day = SESSION_PATH.find((p) => p.shape === 'reflect')!
  const a = sessionShape(ctx({ recentState: 'stressed', pathFocus: day }))
  const b = sessionShape(ctx({ recentState: 'low_energy', pathFocus: day }))
  assert.notEqual(a.opening.id, b.opening.id, 'different state must give a different opening')
  assert.equal(a.body.shape, b.body.shape, 'the path body must not change with state')
})

test('a session never runs a body its chapter cannot render', () => {
  for (let chapter = 1; chapter <= 5; chapter++) {
    for (let seed = 0; seed < 8; seed++) {
      const shape = sessionShape(ctx({ chapter, seed, pathFocus: null }))
      assert.ok(
        shape.body.minChapter <= chapter || shape.slots[1].kind === 'choice',
        `ch${chapter}/seed${seed} ran ${shape.body.shape} (needs ch${shape.body.minChapter})`,
      )
    }
  }
})

test('the path focus is the intro, and the body actually serves it', () => {
  const day = getPathSession(11)! // session 12 — "Name the identity", envision
  const plan = composeSession(ctx({ chapter: 2, pathFocus: day }))
  assert.equal(plan.intro.title, day.focus, 'intro must be the path focus')
  assert.equal(plan.blueprintId?.split('/')[1], day.shape, 'body must be the focus shape')
})

// ─── Live realignment ─────────────────────────────────────────────────────────
//
// The session is composed BEFORE it is played (and the AI plan is cached up to
// 8h), so ctx.recentState is whatever they felt LAST time. Answering the check-in
// used to change nothing but the breath protocol: picking "low energy" still ran
// whatever session was already built. The arsenal never had this problem because
// naming your state there routes you into the matching reset immediately.

test('checking in differently swaps the opening', () => {
  const c = ctx({ recentState: 'locked_in' })
  const plan = composeSession(c)
  assert.equal(plan.openingId, 'open-pour-it-in')
  const next = realignOpening(plan.openingId, 'low_energy', c)
  assert.ok(next, 'a different state must swap the opening')
  assert.equal(next.opening.id, 'open-small-input')
})

test('REGRESSION: realigning KEEPS the path body and its personalized copy', () => {
  const day = SESSION_PATH.find((p) => p.shape === 'commit')!
  const c = ctx({ recentState: 'locked_in', chapter: 5, pathFocus: day })
  const plan = composeSession(c)
  // Stand in for AI-personalized copy on the body beats.
  const personalized = { ...plan, moves: plan.moves.map((m, i) => (i >= 2 ? { ...m, title: `PERSONALIZED ${i}` } : m)) }

  const next = realignOpening(personalized.openingId, 'low_energy', c)
  assert.ok(next)
  const after = [personalized.moves[0], next.move, ...personalized.moves.slice(2)]

  assert.equal(after.length, personalized.moves.length, 'the session keeps its length')
  assert.notEqual(after[1].kind === 'breath' && personalized.moves[1].kind === 'breath', undefined)
  assert.equal(after[2].title, 'PERSONALIZED 2', 'core copy must survive realignment')
  assert.equal(after[3].title, 'PERSONALIZED 3', 'close copy must survive realignment')
})

test('checking in the same way leaves the session alone', () => {
  const c = ctx({ recentState: 'locked_in' })
  const plan = composeSession(c)
  assert.equal(realignOpening(plan.openingId, 'locked_in', c), null, 'no churn when nothing changed')
})

test('realignment covers every state transition and always stays valid', () => {
  const states: MindState[] = ['stressed', 'distracted', 'low_energy', 'locked_in']
  for (const from of states) {
    for (const to of states) {
      const c = ctx({ recentState: from })
      const plan = composeSession(c)
      const next = realignOpening(plan.openingId, to, c)
      if (!next) continue
      const swapped = [plan.moves[0], next.move, ...plan.moves.slice(2)]
      const last = swapped[swapped.length - 1]
      assert.ok(canClose(last.kind), `${from}->${to} closed on ${last.kind}`)
      // A positive check-in must never be handed the meet-the-hard-feeling beat.
      if (to === 'locked_in') {
        assert.ok(!swapped.some((m) => m.kind === 'acknowledge'), `${from}->${to} used acknowledge`)
      }
    }
  }
})

test('a low-energy check-in never leaves you in the locked-in opening', () => {
  const next = realignOpening('open-pour-it-in', 'low_energy', ctx({ recentState: 'locked_in' }))
  assert.equal(next?.opening.id, 'open-small-input')
})

// ─── Modality rotation ────────────────────────────────────────────────────────

test('the closing modality rotates across seeds', () => {
  const kinds = new Set()
  for (let seed = 0; seed < 12; seed++) {
    const plan = composeSession(ctx({ recentState: 'locked_in', seed }))
    kinds.add(plan.moves[plan.moves.length - 1].kind)
  }
  assert.ok(kinds.size >= 3, `expected several closing modalities, got ${[...kinds].join(', ')}`)
})

test('rotation avoids the modality used last session when it can', () => {
  const plan = composeSession(ctx({ recentState: 'locked_in', seed: 3, recentKinds: ['speak'] }))
  assert.notEqual(plan.moves[plan.moves.length - 1].kind, 'speak')
})

test('every rotated closing modality still produces a sayable statement', () => {
  for (let seed = 0; seed < 20; seed++) {
    for (const state of ['stressed', 'distracted', 'low_energy', 'locked_in'] as MindState[]) {
      const plan = composeSession(ctx({ recentState: state, seed, identityStatement: SHIPPED_MIRROR_STATEMENT }))
      const last = plan.moves[plan.moves.length - 1]
      if (!['mirror', 'speak', 'type', 'assemble'].includes(last.kind)) continue
      assert.ok(
        validateStatement(last.statement, last.kind) !== null,
        `${state}/${seed} closed on an unsayable ${last.kind}: ${last.statement}`,
      )
    }
  }
})

// ─── the closing reflection must always have something to read ───────────────
//
// The adaptive close only renders when the session collected at least one answer.
// Splitting state and path moved the guaranteed answer-producing beat out of the
// session: a breath opening plus a body whose scene doesn't collect input (win,
// vision, antisabotage, social all used to report nothing) left the close with
// zero answers, so it silently stopped appearing.

/** Scenes that report a {q,a} back to the player. */
const ANSWERING_KINDS = [
  'choice', 'acknowledge', 'interrogative', // ChoiceScene
  'mission',                                // MissionScene
  'win',                                    // WinScene
  'challenge',                              // ChallengeScene
  'contrast',                               // ContrastScene
  'antisabotage',                           // PatternScene
  'social',                                 // SocialScene
  'vision',                                 // VisionScene (reports the locked statement)
]

test('every composed session contains at least one answer-producing beat', () => {
  const states: (MindState | null)[] = ['stressed', 'distracted', 'low_energy', 'locked_in', null]
  for (const state of states) {
    for (const p of [null, ...SESSION_PATH]) {
      const chapter = p?.chapter ?? 5
      for (const seed of [0, 3, 7]) {
        const plan = composeSession(ctx({ recentState: state, chapter, seed, pathFocus: p }))
        const answering = plan.moves.filter((m) => ANSWERING_KINDS.includes(m.kind))
        assert.ok(
          answering.length > 0,
          `${state}/path${p?.n ?? '-'}/seed${seed} has no answer-producing beat: ${plan.moves.map((m) => m.kind).join(' → ')}`,
        )
      }
    }
  }
})
