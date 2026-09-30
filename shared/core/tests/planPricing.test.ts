import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PLAN_PRICING,
  ANNUAL_SAVING_LINE,
  ROW_ORDER,
  orderRows,
  freeCell,
  plusCell,
  FREE_FOREVER,
  type PlanFeatureRow,
} from '../src/planCopy'

describe('planCopy / PLAN_PRICING', () => {
  it('has consistent arithmetic between monthly and annual plans', () => {
    const monthlyTotal = PLAN_PRICING.monthly.amount * 12
    const saving = monthlyTotal - PLAN_PRICING.annual.amount
    const perMonth = PLAN_PRICING.annual.amount / 12

    assert.equal(PLAN_PRICING.currency, 'USD')
    assert.equal(PLAN_PRICING.monthly.amount, 14.99)
    assert.equal(PLAN_PRICING.monthly.display, '$14.99')

    assert.equal(PLAN_PRICING.annual.amount, 119.99)
    assert.equal(PLAN_PRICING.annual.display, '$119.99')

    // annual.savesDisplay is $59.89
    assert.equal(PLAN_PRICING.annual.savesDisplay, `$${saving.toFixed(2)}`)

    // annual.perMonthDisplay is $10.00
    assert.equal(PLAN_PRICING.annual.perMonthDisplay, `$${perMonth.toFixed(2)}`)

    // saving line matches constants
    assert.equal(
      ANNUAL_SAVING_LINE,
      `Save ${PLAN_PRICING.annual.savesDisplay} a year, ${PLAN_PRICING.annual.savesPercentDisplay} off the monthly price.`
    )
  })

  it('formats cell values properly', () => {
    const row1: PlanFeatureRow = {
      feature: 'custom-exercises',
      requiresTier: 'plus',
      limit: 3,
      kind: 'inventory',
      window: 'lifetime',
    }
    assert.equal(freeCell(row1), '3')
    assert.equal(plusCell(row1, 50), 'Unlimited')

    const row2: PlanFeatureRow = {
      feature: 'ai-food-estimate',
      requiresTier: 'plus',
      limit: 1,
      kind: 'window',
      window: 'day',
    }
    assert.equal(freeCell(row2), '1 a day')

    const row3: PlanFeatureRow = {
      feature: 'vision',
      requiresTier: 'plus',
      limit: 0,
      kind: 'inventory',
      window: 'lifetime',
    }
    assert.equal(freeCell(row3), 'Not included')
    assert.equal(plusCell(row3, 50), 'Included')

    const row4: PlanFeatureRow = {
      feature: 'mind-sessions',
      requiresTier: 'plus',
      limit: 10,
      kind: 'milestone',
      window: 'lifetime',
    }
    assert.equal(freeCell(row4), 'First 10')
    assert.equal(plusCell(row4, 50), 'All 50')
  })

  it('orders rows according to ROW_ORDER', () => {
    const rows: PlanFeatureRow[] = [
      { feature: 'vision', requiresTier: 'plus', limit: 0, kind: 'inventory', window: 'lifetime' },
      { feature: 'custom-meals', requiresTier: 'plus', limit: 3, kind: 'inventory', window: 'lifetime' },
    ]
    const sorted = orderRows(rows)
    assert.equal(sorted[0].feature, 'custom-meals')
    assert.equal(sorted[1].feature, 'vision')
  })

  it('defines non-empty FREE_FOREVER items', () => {
    assert.ok(FREE_FOREVER.length >= 5)
    for (const item of FREE_FOREVER) {
      assert.ok(item.label)
      assert.ok(item.detail)
      assert.ok(item.evidence.length > 0)
    }
  })
})
