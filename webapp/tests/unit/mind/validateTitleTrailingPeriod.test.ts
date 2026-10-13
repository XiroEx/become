// Run with: npm run test:file tests/unit/mind/validateTitleTrailingPeriod.test.ts
//
// NP-379: the Mind session card's title/chip read differently on native than
// on the web for the same AI-composed plan. The reproducible half of that is
// here — a model-authored title sometimes ends in a period ("Let's lock in.")
// while every authored title in the product (library.ts's INTROS, openings.ts's
// STATE_OPENINGS, sessionPath.ts's SESSION_PATH) never does. validateTitle is
// the one seam every AI title (the session card's `intro.title` AND each
// move's own title) passes through, so stripping the trailing full stop there
// fixes the headline style everywhere it is used, on both platforms (the same
// source file is vendored into shared/core/src/mind/validateMove.ts verbatim —
// see scripts/vendor-mind.mjs).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTitle } from '../../../lib/mind/validateMove'

test('strips a single trailing period from a model title', () => {
  assert.equal(validateTitle("Let's lock in."), "Let's lock in")
  assert.equal(validateTitle('Reset.'), 'Reset')
})

test('leaves a title with no trailing period alone', () => {
  assert.equal(validateTitle('Reset'), 'Reset')
})

test('leaves a question mark alone — an OPTION_KINDS title IS the question', () => {
  assert.equal(validateTitle('How are you walking into this?'), 'How are you walking into this?')
})

test('leaves an exclamation mark alone', () => {
  assert.equal(validateTitle('Show up!'), 'Show up!')
})

test('leaves a trailing ellipsis alone (a genuinely trailed-off line)', () => {
  assert.equal(validateTitle('Still deciding…'), 'Still deciding…')
  assert.equal(validateTitle('Still deciding...'), 'Still deciding...')
})

test('null/empty input still returns null', () => {
  assert.equal(validateTitle(undefined), null)
  assert.equal(validateTitle(''), null)
  assert.equal(validateTitle('   '), null)
})
