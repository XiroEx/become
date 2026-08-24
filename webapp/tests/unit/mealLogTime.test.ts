import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { mealLogTimeInputValue, mealLogTimePatch } from '../../lib/nutrition/logTime'

const ROOT = path.join(__dirname, '../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('an untimed log never exposes its storage timestamp as a meal time', () => {
  assert.equal(mealLogTimeInputValue('2026-08-24T18:42:00.000Z', true), '')
})

test('a timed log initializes the editor from the member local clock', () => {
  const stored = new Date(2026, 7, 24, 18, 42)
  assert.equal(mealLogTimeInputValue(stored, false), '18:42')
})

test('editing a time preserves the log date and clears the untimed marker', () => {
  const stored = new Date(2026, 7, 24, 18, 42)
  const patch = mealLogTimePatch(stored, '07:15')
  const changed = new Date(patch.loggedAt!)

  assert.equal(changed.getFullYear(), stored.getFullYear())
  assert.equal(changed.getMonth(), stored.getMonth())
  assert.equal(changed.getDate(), stored.getDate())
  assert.equal(changed.getHours(), 7)
  assert.equal(changed.getMinutes(), 15)
  assert.equal(patch.untimed, false)
})

test('clearing time records explicit day-only intent', () => {
  assert.deepEqual(mealLogTimePatch('2026-08-24T18:42:00.000Z', ''), { untimed: true })
})

test('plan promotion defaults to untimed and every current client says so explicitly', () => {
  const route = readSource('app/api/meal-plans/[id]/promote/route.ts')
  assert.match(route, /typeof body\.loggedAt !== 'string'/)
  assert.match(route, /MealLog\.create\(\{[\s\S]*untimed,/)

  for (const rel of [
    'app/dashboard/nutrition/page.tsx',
    'app/dashboard/timeline/page.tsx',
  ]) {
    const source = readSource(rel)
    const promoteBodies = source.match(/body: JSON\.stringify\(\{ untimed: true \}\)/g) ?? []
    assert.ok(promoteBodies.length >= 1, `${rel} must promote plans as untimed`)
  }
})

test('the food editor sends time changes through the item PATCH route', () => {
  const modal = readSource('components/nutrition/EditFoodModal.tsx')
  const route = readSource('app/api/meal-logs/[id]/items/[itemId]/route.ts')

  assert.match(modal, /id="edit-food-time"/)
  assert.match(modal, /mealLogTimePatch\(loggedAt, logTime\)/)
  assert.match(route, /nextLoggedAt = parsed/)
  assert.match(route, /log\.loggedAt = nextLoggedAt/)
  assert.match(route, /log\.untimed = nextUntimed/)
})
