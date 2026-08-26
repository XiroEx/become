// Run with: npx tsx --test tests/unit/noTimeDefaultLog.test.ts
//
// "No time" is the default for a freshly-opened logging flow: unless a member
// deliberately picks a clock time, a logged food should carry `untimed: true`
// so the day view places it by its tag's anchor instead of inventing a clock
// reading nobody chose. Every place that can log food to /api/meal-logs has to
// honour this, or the same action reads "timed" from one screen and "no time"
// from another for no reason a member could see.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

test('FoodSearchModal opens with no time chosen by default', () => {
  const ui = read('components/nutrition/FoodSearchModal.tsx')
  assert.match(ui, /const \[timeMode, setTimeMode\] = useState<'now' \| 'custom' \| 'none'>\('none'\)/)
})

test('FoodSearchModal resets back to "no time", not "now", after logging or closing', () => {
  const ui = read('components/nutrition/FoodSearchModal.tsx')
  // Only the dedicated "Now" button is still allowed to set 'now' — that is a
  // deliberate member choice, not a fallback. Every reset/clear path (init,
  // close, post-submit, date-cleared, native time-input cleared) has to land
  // on 'none' to match the new default.
  assert.equal((ui.match(/setTimeMode\('now'\)/g) ?? []).length, 1,
    'only the explicit "Now" button should still set timeMode to \'now\'')
  assert.ok((ui.match(/setTimeMode\('none'\)/g) ?? []).length >= 5,
    'every close/reset/clear path should default to "none"')
})

test('MealApplySheet (logging a saved meal) matches the food picker default', () => {
  const ui = read('components/meals/MealApplySheet.tsx')
  assert.match(ui, /const \[timeMode, setTimeMode\] = useState<'now' \| 'custom' \| 'none'>\('none'\)/)
})

test('FoodLogSheet has no time control at all, so every entry it creates is untimed', () => {
  const ui = read('components/meals/FoodLogSheet.tsx')
  const postBody = ui.slice(ui.indexOf("fetch('/api/meal-logs'"))
  assert.match(postBody.slice(0, 400), /untimed:\s*true/)
})

test('SnapPlateModal (photo/describe scans) logs untimed — no time control in that flow either', () => {
  const ui = read('components/nutrition/SnapPlateModal.tsx')
  const postBody = ui.slice(ui.indexOf("fetch('/api/meal-logs'"))
  assert.match(postBody.slice(0, 400), /untimed:\s*true/)
})

test('re-logging a past scan from history is untimed too', () => {
  const ui = read('app/dashboard/nutrition/scans/page.tsx')
  const postBody = ui.slice(ui.indexOf("fetch('/api/meal-logs'"))
  assert.match(postBody.slice(0, 400), /untimed:\s*true/)
})

test('the timeline page\'s Add Food no longer drops the untimed flag on its way to the API', () => {
  // Regression: FoodSearchModal always passed `untimed` as its 5th
  // onSelectFood argument, but the timeline page's handleAddFood never
  // accepted it, so every food logged from /dashboard/timeline was silently
  // forced to a real timestamp regardless of what the picker showed.
  const ui = read('app/dashboard/timeline/page.tsx')
  assert.match(ui, /const handleAddFood = async \(\s*entry: IFoodEntry[^)]*?untimed\?:\s*boolean,\s*\) => \{/)
  const postBody = ui.slice(ui.indexOf("fetch('/api/meal-logs'"))
  assert.match(postBody.slice(0, 400), /untimed:\s*untimed === true/)
  assert.match(ui, /onSelectFood=\{\(entry, tag, loggedAt, planOptions, untimed\) => handleAddFood\(/)
})
