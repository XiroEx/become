// Run with: npx tsx --test tests/unit/quickSession/naming.test.tsx

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import QuickSessionNamePrompt from '../../../components/workout/QuickSessionNamePrompt'
import {
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
