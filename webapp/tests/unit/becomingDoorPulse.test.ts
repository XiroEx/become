// Run with: npm run test:file tests/unit/becomingDoorPulse.test.ts
//
// The Becoming doorway turns purple when a new week has been written (the
// week rolls over on Sunday, see localWeekKey in BecomingDoor.tsx) and has
// not been opened since. It should also pulsate in that state to draw the
// eye — calm once the member has opened it for the week.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { doorClassName } from '../../components/dashboard/BecomingDoor'

test('an unread new week pulses purple', () => {
  const cls = doorClassName(true)
  assert.match(cls, /becoming-door-pulse/)
  assert.match(cls, /from-violet-600/)
})

test('a read/caught-up week is calm — no pulse', () => {
  const cls = doorClassName(false)
  assert.doesNotMatch(cls, /becoming-door-pulse/)
})
