// Run with: npm run test:file tests/unit/programNudge/modalRender.test.tsx
//
// The rendered half of the fix. route.test.ts proves the account remembers the
// dismissal; this proves the modal actually DRAWS the way out once it has one,
// because "there should be a don't-show-again button and it should work" is two
// claims and this is the first of them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgramNudgeModal from '../../../components/ProgramNudgeModal'

const OPT_OUT = /Don’t show this again/

function sheet(dismissCount: number, open = true): string {
  return renderToStaticMarkup(
    <ProgramNudgeModal
      open={open}
      fitnessGoal="gain_muscle"
      dismissCount={dismissCount}
      onExplore={() => {}}
      onDismissForever={() => {}}
    />,
  )
}

test('first showing: the two CTAs, and no invitation to suppress it', () => {
  const html = sheet(0)
  assert.match(html, /Find My Program/)
  assert.match(html, /Explore first/)
  assert.doesNotMatch(html, OPT_OUT)
})

test('second showing: the opt-out is on screen', () => {
  // One prior dismissal — the exact state in the bug report, where the modal
  // came back with no way to stop it.
  const html = sheet(1)
  assert.match(html, OPT_OUT)
  // Still a real button, not a paragraph of text.
  assert.match(html, /<button[^>]*>[^<]*Don’t show this again/)
})

test('it stays offered on every later showing', () => {
  for (const n of [2, 5, 20]) {
    assert.match(sheet(n), OPT_OUT, `missing on showing after ${n} dismissals`)
  }
})

test('the opt-out sits at the bottom, below both CTAs', () => {
  // The card asked for it "at the bottom" — under the primary action, so it
  // never competes with starting a program.
  const html = sheet(1)
  assert.ok(html.indexOf('Find My Program') < html.indexOf('Explore first'))
  assert.ok(
    html.indexOf('Explore first') < html.search(OPT_OUT),
    'the opt-out must come after both CTAs',
  )
})

test('closed renders nothing at all', () => {
  assert.equal(sheet(5, false), '')
})
