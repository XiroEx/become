// Run with: npm run test:file tests/unit/nutritionQuickAddParam.test.ts
//
// Acceptance test (e015ca0a):
// Quick add on the card opens the quick-add sheet on the web and natively.
//
// Web parity: NutritionSummaryCard links to /dashboard/nutrition?quickAdd=true,
// and /dashboard/nutrition initializes quickAddOpen to true and opens QuickAddModal
// when quickAdd=true is present in the query parameters.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

describe('Web Quick Add param parity (e015ca0a)', () => {
  it('NutritionSummaryCard links Quick Add button to /dashboard/nutrition?quickAdd=true', () => {
    const cardPath = path.resolve(__dirname, '../../components/nutrition/NutritionSummaryCard.tsx')
    const content = fs.readFileSync(cardPath, 'utf8')
    assert.match(
      content,
      /href="\/dashboard\/nutrition\?quickAdd=true"/,
      'NutritionSummaryCard must link to /dashboard/nutrition?quickAdd=true'
    )
  })

  it('NutritionPage honors quickAdd=true by initializing and syncing quickAddOpen', () => {
    const pagePath = path.resolve(__dirname, '../../app/dashboard/nutrition/page.tsx')
    const content = fs.readFileSync(pagePath, 'utf8')

    // Initial state derived from searchParams
    assert.match(
      content,
      /const \[quickAddOpen, setQuickAddOpen\] = useState\(\(\) => searchParams\?\.get\('quickAdd'\) === 'true'\)/,
      'NutritionPage must initialize quickAddOpen from searchParams.get("quickAdd")'
    )

    // Sync effect for navigation updates
    assert.match(
      content,
      /searchParams\?\.get\('quickAdd'\) === 'true'/,
      'NutritionPage must react to quickAdd query parameter'
    )

    // QuickAddModal rendered with quickAddOpen
    assert.match(
      content,
      /<QuickAddModal\s+isOpen=\{quickAddOpen\}/,
      'NutritionPage must wire quickAddOpen to QuickAddModal isOpen prop'
    )
  })
})
