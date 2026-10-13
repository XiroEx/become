// Run with: npm run test:file tests/unit/programNudge/modalRender.test.tsx
//
// The rendered half of the fix. route.test.ts proves the account remembers the
// sighting; this proves the modal actually DRAWS the way out once it has one,
// because "there should be a don't-show-again button and it should work" is two
// claims and this is the first of them.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import ProgramNudgeModal from '../../../components/ProgramNudgeModal'

const OPT_OUT = /Don’t show this again/

function sheet(priorShowings: number, open = true): string {
  return renderToStaticMarkup(
    <ProgramNudgeModal
      open={open}
      fitnessGoal="gain_muscle"
      priorShowings={priorShowings}
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
  // One prior sighting — the exact state in the bug report, where the modal
  // came back with no way to stop it.
  const html = sheet(1)
  assert.match(html, OPT_OUT)
  // Still a real button, not a paragraph of text.
  assert.match(html, /<button[^>]*>(?:(?!<\/button>)[\s\S])*Don’t show this again/)
})

test('the opt-out is a button, not a footnote', () => {
  // It shipped as faint underlined 12px text under a caption, which is why the
  // card is titled "needs a do not show again BUTTON". It has to carry the same
  // weight as the action above it or it reads as decoration and gets missed.
  const html = sheet(1)
  const button = html.match(
    /<button[^>]*>(?:(?!<\/button>)[\s\S])*Don’t show this again[\s\S]*?<\/button>/,
  )
  assert.ok(button, 'the opt-out must render as a <button>')
  const markup = button[0]
  assert.match(markup, /\bw-full\b/, 'full width, like the CTAs above it')
  assert.match(markup, /\brounded-xl\b/, 'a button shape, not a link')
  assert.match(markup, /\btext-sm\b/, 'the same type size as the other actions')
  assert.doesNotMatch(markup, /\bunderline\b/, 'a button, not an underlined link')
})

test('it stays offered on every later showing', () => {
  for (const n of [2, 5, 20]) {
    assert.match(sheet(n), OPT_OUT, `missing on the showing after ${n} sightings`)
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
