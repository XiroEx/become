// NP-379 — Visual QA caught the Mind session card's title rendering with a
// trailing period ("Reset.") where the web's authored copy never ends a
// title in one (library.ts / openings.ts / sessionPath.ts: zero matches).
// A model-authored title occasionally closes with a full stop; validateTitle
// is the belt-and-suspenders render-seam guard, so it strips exactly one.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateTitle } from '../../../lib/mind/validateMove'

describe('validateTitle — trailing period (NP-379)', () => {
  it('strips a single trailing full stop', () => {
    assert.equal(validateTitle('Reset.'), 'Reset')
  })

  it('strips a trailing full stop even with surrounding whitespace', () => {
    assert.equal(validateTitle('  Lock in your focus.  '), 'Lock in your focus')
  })

  it('leaves a title with no trailing period untouched', () => {
    assert.equal(validateTitle('Reset'), 'Reset')
  })

  it('leaves an ellipsis alone (not a single trailing stop)', () => {
    assert.equal(validateTitle('Still deciding...'), 'Still deciding...')
  })

  it('leaves a trailing question mark alone', () => {
    assert.equal(validateTitle('Where are you right now?'), 'Where are you right now?')
  })

  it('leaves a trailing exclamation mark alone', () => {
    assert.equal(validateTitle('Lock in!'), 'Lock in!')
  })

  it('rejects non-string and empty input the same as before', () => {
    assert.equal(validateTitle(42), null)
    assert.equal(validateTitle('   '), null)
    assert.equal(validateTitle('.'), null)
  })
})
