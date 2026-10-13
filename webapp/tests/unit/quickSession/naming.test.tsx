// Run with: npm run test:file tests/unit/quickSession/naming.test.tsx

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import QuickSessionNamePrompt from '../../../components/workout/QuickSessionNamePrompt'
import {
  fallbackQuickSessionName,
  isDefaultQuickSessionName,
  shouldPromptForQuickSessionName,
} from '../../../lib/quickSession/naming'

test('only blank/product-copy titles count as unnamed', () => {
  assert.equal(isDefaultQuickSessionName(''), true)
  assert.equal(isDefaultQuickSessionName(' Quick Session '), true)
  assert.equal(isDefaultQuickSessionName('Workout Now'), true)
  assert.equal(isDefaultQuickSessionName('Thursday Push'), false)
})

test('new unnamed sessions prompt, while already-named sessions and historical repeats do not', () => {
  assert.equal(shouldPromptForQuickSessionName({ title: 'Quick Session' }), true)
  assert.equal(shouldPromptForQuickSessionName({ title: 'Thursday Push' }), false)
  assert.equal(shouldPromptForQuickSessionName({ title: 'Generated Upper Body', needsName: true }), true)
  assert.equal(shouldPromptForQuickSessionName({ title: 'Quick Session', needsName: false }), false)
  assert.equal(
    shouldPromptForQuickSessionName({ title: 'Quick Session', sourceSessionId: 'historical-id', needsName: true }),
    false,
  )
})

test('the prompt asks for a recognizable workout name and does not prefill product copy', () => {
  const html = renderToStaticMarkup(
    <QuickSessionNamePrompt
      initialName="Quick Session"
      confirmLabel="Save name & finish"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  )

  assert.match(html, /Name this workout/)
  assert.match(html, /you&#x27;ll recognize in your workout history/)
  assert.match(html, /placeholder="Thursday Push"/)
  assert.match(html, /Save name &amp; finish/)
  assert.doesNotMatch(html, /value="Quick Session"/)
})

test('the fallback name is the local day the workout was done', () => {
  // The card's own example.
  assert.equal(fallbackQuickSessionName('2026-09-09'), '9/9/26 workout')
  assert.equal(fallbackQuickSessionName('2026-12-25'), '12/25/26 workout')
  // Padded parts are read as numbers, not printed back with their zeroes.
  assert.equal(fallbackQuickSessionName('2026-01-05'), '1/5/26 workout')
})

test('the fallback name never drifts a day through UTC parsing', () => {
  // `new Date('2026-09-09')` is UTC midnight, which is Sept 8 in every western
  // zone. The key is split as a string precisely so the name matches the day
  // the member actually trained, wherever they are.
  const original = Date.prototype.getTimezoneOffset
  try {
    Date.prototype.getTimezoneOffset = () => 480 // UTC-8
    assert.equal(fallbackQuickSessionName('2026-09-09'), '9/9/26 workout')
    Date.prototype.getTimezoneOffset = () => -660 // UTC+11
    assert.equal(fallbackQuickSessionName('2026-09-09'), '9/9/26 workout')
  } finally {
    Date.prototype.getTimezoneOffset = original
  }
})

test('a missing or malformed day falls back to today rather than throwing', () => {
  const now = new Date(2026, 8, 9, 13, 30) // local Sept 9 2026
  assert.equal(fallbackQuickSessionName(undefined, now), '9/9/26 workout')
  assert.equal(fallbackQuickSessionName(null, now), '9/9/26 workout')
  assert.equal(fallbackQuickSessionName('not-a-date', now), '9/9/26 workout')
  assert.equal(fallbackQuickSessionName('2026-9-9', now), '9/9/26 workout')
})

test('a date-shaped fallback name is a real name, so it never re-prompts', () => {
  assert.equal(isDefaultQuickSessionName('9/9/26 workout'), false)
  assert.equal(shouldPromptForQuickSessionName({ title: '9/9/26 workout' }), false)
})

test('the prompt offers an exit that finishes under the day it was done', () => {
  const html = renderToStaticMarkup(
    <QuickSessionNamePrompt
      initialName="Quick Session"
      confirmLabel="Save name & finish"
      fallbackName="9/9/26 workout"
      onConfirm={() => {}}
      onSkip={() => {}}
      onCancel={() => {}}
    />,
  )

  // The skip says what it will do, and the close button in the corner says the
  // same thing to a screen reader.
  assert.match(html, /Skip, save as .9\/9\/26 workout./)
  assert.match(html, /aria-label="Close and save as 9\/9\/26 workout"/)
  // Back is still there for someone who meant to keep training.
  assert.match(html, />Back</)
})

test('without a fallback there is no exit that could finish an unnamed workout', () => {
  const html = renderToStaticMarkup(
    <QuickSessionNamePrompt
      initialName=""
      confirmLabel="Save name & log"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  )

  assert.doesNotMatch(html, /Skip, save as/)
  assert.doesNotMatch(html, /Close and save as/)
})
