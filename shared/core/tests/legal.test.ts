import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LEGAL_ENTITY,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_VERSION,
  AI_CONSENT_REASON,
  RENEWAL_TERMS,
  renewalLine,
  counselTodos,
} from '../src/legal/index'
import { TERMS } from '../src/legal/terms'
import { PRIVACY } from '../src/legal/privacy'
import { SUPPORT } from '../src/legal/support'
import { HEALTH_DATA } from '../src/legal/healthData'
import { DELETE_ACCOUNT } from '../src/legal/deleteAccount'
import {
  RESTORE_WINDOW_DAYS,
  DELETE_CONFIRMATION,
  DELETION_COVERS,
  DELETION_EXCEPTIONS,
  planDeletion,
  deletionStatus,
  isPurgeDue,
} from '../src/accountDeletion'

describe('legal', () => {
  it('declares legal entity metadata', () => {
    assert.equal(LEGAL_ENTITY, 'Become LLC')
    assert.equal(LEGAL_CONTACT_EMAIL, 'info@becomeurbest.com')
    assert.ok(LEGAL_LAST_UPDATED)
    assert.ok(LEGAL_VERSION)
    assert.equal(AI_CONSENT_REASON, 'ai_consent_required')
  })

  it('provides automatic renewal lines matching terms', () => {
    assert.ok(RENEWAL_TERMS.length >= 2)
    assert.ok(renewalLine('monthly').includes('$14.99'))
    assert.ok(renewalLine('annual').includes('$119.99'))
  })

  it('documents have valid structure', () => {
    for (const doc of [TERMS, PRIVACY, SUPPORT, HEALTH_DATA, DELETE_ACCOUNT]) {
      assert.ok(doc.title, `${doc.slug} has title`)
      assert.ok(doc.sections.length > 0, `${doc.slug} has sections`)
      const todos = counselTodos(doc)
      assert.ok(Array.isArray(todos))
    }
  })
})

describe('accountDeletion', () => {
  it('constants match store and policy promises', () => {
    assert.equal(RESTORE_WINDOW_DAYS, 7)
    assert.equal(DELETE_CONFIRMATION, 'DELETE')
    assert.ok(DELETION_COVERS.length > 0)
    assert.ok(DELETION_EXCEPTIONS.length > 0)
  })

  it('planDeletion creates a 7-day reversal window', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const req = planDeletion(now, 'web')
    assert.equal(req.requestedFrom, 'web')
    assert.equal(req.requestedAt.toISOString(), now.toISOString())
    assert.equal(
      req.purgeAfter.getTime() - req.requestedAt.getTime(),
      7 * 24 * 60 * 60 * 1000
    )
  })

  it('deletionStatus correctly calculates days left', () => {
    const now = new Date('2026-09-30T12:00:00Z')
    const req = planDeletion(now, 'ios')
    const status = deletionStatus(req, now)
    assert.equal(status.pending, true)
    assert.equal(status.daysLeft, 7)

    const twoDaysLater = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
    const status2 = deletionStatus(req, twoDaysLater)
    assert.equal(status2.daysLeft, 5)

    const eightDaysLater = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000)
    assert.equal(isPurgeDue(req, eightDaysLater), true)
  })
})
