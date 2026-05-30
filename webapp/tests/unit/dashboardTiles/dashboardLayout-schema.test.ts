import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import UserProgress from '../../../models/UserProgress'

// Mongoose applies schema defaults + sync validation on document
// instantiation without a live DB connection, so these run purely in-memory.

describe('UserProgress.dashboardLayout', () => {
  it('defaults to an empty array for a legacy doc (no dashboardLayout)', () => {
    const doc = new UserProgress({ userId: new mongoose.Types.ObjectId() })
    assert.ok(Array.isArray(doc.dashboardLayout))
    assert.equal(doc.dashboardLayout.length, 0)
  })

  it('validates a legacy doc carrying only pinnedTiles', () => {
    const doc = new UserProgress({
      userId: new mongoose.Types.ObjectId(),
      pinnedTiles: ['streak', 'mood'],
    })
    assert.equal(doc.validateSync(), undefined)
  })

  it('accepts valid unified tiles and applies the size default', () => {
    const doc = new UserProgress({
      userId: new mongoose.Types.ObjectId(),
      dashboardLayout: [
        { id: 'streak', kind: 'stat', size: '1x1' },
        { id: 'smart-1', kind: 'smart-rotating', size: '2x1', locked: 'strength-curve' },
        { id: 'no-size', kind: 'metric' },
      ],
    })
    assert.equal(doc.validateSync(), undefined)
    assert.equal(doc.dashboardLayout[2].size, '1x1')
    assert.equal(doc.dashboardLayout[1].locked, 'strength-curve')
  })

  it('rejects an invalid tile kind via the schema enum', () => {
    const doc = new UserProgress({
      userId: new mongoose.Types.ObjectId(),
      dashboardLayout: [{ id: 'x', kind: 'bogus', size: '1x1' }],
    })
    const err = doc.validateSync()
    assert.ok(err)
    assert.ok(err.errors['dashboardLayout.0.kind'])
  })

  it('rejects an invalid tile size via the schema enum', () => {
    const doc = new UserProgress({
      userId: new mongoose.Types.ObjectId(),
      dashboardLayout: [{ id: 'x', kind: 'stat', size: '9x9' }],
    })
    const err = doc.validateSync()
    assert.ok(err)
    assert.ok(err.errors['dashboardLayout.0.size'])
  })
})
