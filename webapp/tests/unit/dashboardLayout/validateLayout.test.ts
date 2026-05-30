// Run with: npx tsx --test tests/unit/dashboardLayout/validateLayout.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateLayoutPayload } from '../../../lib/dashboardLayout/validateLayout'
import { MAX_DASHBOARD_TILES } from '../../../lib/dashboardLayout/types'

describe('validateLayoutPayload', () => {
  it('rejects a non-object body', () => {
    assert.equal(validateLayoutPayload(null).ok, false)
    assert.equal(validateLayoutPayload('x').ok, false)
  })
  it('rejects a missing/non-array layout', () => {
    assert.equal(validateLayoutPayload({}).ok, false)
    assert.equal(validateLayoutPayload({ layout: 'nope' }).ok, false)
  })
  it('accepts a valid mixed-kind layout', () => {
    const r = validateLayoutPayload({
      layout: [
        { id: 'streak', kind: 'stat', size: '1x1' },
        { id: 'strength-curve', kind: 'metric', size: '2x1' },
        { id: 's1', kind: 'smart-rotating', size: '2x1', locked: 'strength-curve' },
      ],
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.layout.length, 3)
  })
  it('rejects an invalid tile shape (bad kind)', () => {
    assert.equal(validateLayoutPayload({ layout: [{ id: 'x', kind: 'nope', size: '1x1' }] }).ok, false)
  })
  it('rejects an invalid size', () => {
    assert.equal(validateLayoutPayload({ layout: [{ id: 'x', kind: 'stat', size: '9x9' }] }).ok, false)
  })
  it('rejects locked on a non-smart-rotating tile', () => {
    assert.equal(
      validateLayoutPayload({ layout: [{ id: 'streak', kind: 'stat', size: '1x1', locked: 'x' }] }).ok,
      false
    )
  })
  it('rejects a layout larger than the max', () => {
    const layout = Array.from({ length: MAX_DASHBOARD_TILES + 1 }, (_, i) => ({ id: `t${i}`, kind: 'stat', size: '1x1' }))
    assert.equal(validateLayoutPayload({ layout }).ok, false)
  })
  it('accepts exactly the max tiles', () => {
    const layout = Array.from({ length: MAX_DASHBOARD_TILES }, (_, i) => ({ id: `t${i}`, kind: 'stat', size: '1x1' }))
    assert.equal(validateLayoutPayload({ layout }).ok, true)
  })
  it('accepts an empty layout', () => {
    assert.equal(validateLayoutPayload({ layout: [] }).ok, true)
  })
})
