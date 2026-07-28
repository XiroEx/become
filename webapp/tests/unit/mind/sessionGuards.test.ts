// Run with: npx tsx --test tests/unit/mind/sessionGuards.test.ts
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
import { SESSION_BLUEPRINTS, pickBlueprint, slotMove } from '../../../lib/mind/blueprints'
import { composeSession } from '../../../lib/mind/composeSession'
import type { SessionContext } from '../../../lib/mind/moves'

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

// ─── blueprints ───────────────────────────────────────────────────────────────

test('every blueprint is structurally sound', () => {
  for (const bp of SESSION_BLUEPRINTS) {
    const roles = bp.slots.map((s) => s.role)
    assert.ok(roles.includes('regulate'), `${bp.id} needs a regulate slot`)
    assert.ok(roles.includes('core'), `${bp.id} needs a core slot`)
    assert.ok(roles.includes('close'), `${bp.id} needs a close slot`)
    assert.ok(bp.doneText.trim().length > 0, `${bp.id} needs a finish line`)
    for (const slot of bp.slots) {
      assert.ok(slot.brief.trim().length > 0, `${bp.id}/${slot.kind} needs a brief`)
      if (slot.role === 'close') {
        assert.ok(canClose(slot.kind), `${bp.id} must not close on ${slot.kind}`)
      }
    }
    // A breath regulate slot must have a non-breath alternative for the cooldown
    // and the locked-in swap.
    assert.notEqual(bp.regulateAlt.kind, 'breath', `${bp.id} regulateAlt must not be breath`)
  }
})

test('authored option slots always render at least two choices', () => {
  const c = ctx()
  for (const bp of SESSION_BLUEPRINTS) {
    for (const slot of [...bp.slots, bp.regulateAlt]) {
      if (!['choice', 'acknowledge', 'interrogative'].includes(slot.kind)) continue
      const move = slotMove(slot, c)
      assert.ok((move.options?.length ?? 0) >= 2, `${bp.id}/${slot.kind} needs 2+ options`)
      assert.ok(move.title.trim().length > 0, `${bp.id}/${slot.kind} needs a question`)
    }
  }
})

test('authored say-aloud slots produce a sayable statement', () => {
  // Uses a long identity statement on purpose: the builder must fall back to a
  // short pool line rather than handing a paragraph to a scene that speech-matches.
  const c = ctx({ identityStatement: SHIPPED_MIRROR_STATEMENT })
  for (const bp of SESSION_BLUEPRINTS) {
    for (const slot of [...bp.slots, bp.regulateAlt]) {
      if (!['mirror', 'speak', 'type', 'assemble'].includes(slot.kind)) continue
      const move = slotMove(slot, c)
      assert.ok(move.statement, `${bp.id}/${slot.kind} needs a statement`)
      assert.ok(
        validateStatement(move.statement!, slot.kind) !== null,
        `${bp.id}/${slot.kind} produced an unsayable line: ${move.statement}`,
      )
    }
  }
})

test('a locked-in check-in gets the locked-in blueprint, not a breath', () => {
  const bp = pickBlueprint(ctx({ recentState: 'locked_in' }))
  assert.equal(bp.id, 'pour-it-in')
  assert.ok(!bp.slots.some((s) => s.kind === 'breath'), 'do not down-regulate someone already on')
})

test('a low-energy check-in is where the heaviness question belongs', () => {
  const bp = pickBlueprint(ctx({ recentState: 'low_energy' }))
  assert.equal(bp.id, 'small-input')
  const core = bp.slots.find((s) => s.role === 'core')
  assert.equal(core?.kind, 'acknowledge')
  assert.match(core?.content?.title ?? '', /how heavy is today/i)
})

// ─── the deterministic session end to end ─────────────────────────────────────

test('a locked-in session never asks how heavy today is', () => {
  const plan = composeSession(ctx({ recentState: 'locked_in' }))
  assert.equal(plan.moves[0].kind, 'state-check')
  assert.ok(!plan.moves.some((m) => m.kind === 'acknowledge'), 'no acknowledge on a locked-in session')
  assert.ok(!plan.moves.some((m) => /how heavy is today/i.test(m.title)))
  assert.ok(plan.doneText, 'session needs its own finish line')
})

test('every composed session opens on a check-in and closes on a valid register', () => {
  const states = ['stressed', 'distracted', 'low_energy', 'locked_in', null] as const
  for (const state of states) {
    for (const chapter of [1, 2, 3, 5]) {
      for (const seed of [0, 1, 2, 3, 11]) {
        const plan = composeSession(ctx({ recentState: state, chapter, seed }))
        assert.equal(plan.moves[0].kind, 'state-check', `${state}/${chapter}/${seed} must open on a check-in`)
        assert.ok(plan.moves.length >= 4, `${state}/${chapter}/${seed} is too thin`)
        const last = plan.moves[plan.moves.length - 1]
        assert.ok(canClose(last.kind), `${state}/${chapter}/${seed} closed on ${last.kind}`)
        // No beat may restate the one before it.
        for (let i = 1; i < plan.moves.length; i++) {
          const text = (m: (typeof plan.moves)[number]) =>
            [m.title, m.statement, m.prompt].filter(Boolean).join(' ')
          assert.equal(
            restates(text(plan.moves[i - 1]), text(plan.moves[i])),
            false,
            `${state}/${chapter}/${seed}: move ${i} restates move ${i - 1}`,
          )
        }
      }
    }
  }
})

test('chapter 1 never serves a blueprint gated behind a later chapter', () => {
  for (const seed of [0, 1, 2, 3, 4, 5]) {
    const bp = pickBlueprint(ctx({ chapter: 1, recentState: null, seed }))
    assert.ok(bp.minChapter <= 1, `${bp.id} is gated to chapter ${bp.minChapter}`)
  }
})

test('the breath cooldown swaps the regulate beat instead of dropping it', () => {
  const now = 1_000_000_000
  const warm = composeSession(ctx({ recentState: 'stressed', now, lastBreathAt: now - 60_000 }))
  const cold = composeSession(ctx({ recentState: 'stressed', now, lastBreathAt: now - 9 * 60 * 60 * 1000 }))
  assert.equal(cold.moves[1].kind, 'breath', 'outside the cooldown the breath stays')
  assert.notEqual(warm.moves[1].kind, 'breath', 'inside the cooldown it swaps')
  assert.equal(warm.moves.length, cold.moves.length, 'the beat is replaced, not removed')
})
