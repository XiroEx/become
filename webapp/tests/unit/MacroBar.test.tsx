// Run with: npx tsx --test tests/unit/MacroBar.test.tsx
//
// Fiber counts toward total carbohydrate on the label, so a member eating a
// high-fiber meal could cross the carb goal on fiber alone and see the bar
// (and the "123g / 200g" text, and the "+Xg" chip) turn red — even though net
// carbs, the number that actually matters for blood sugar/energy, were still
// under goal. The colour must be judged against NET carbs (total − fiber);
// the displayed grams stay honest to the label.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import MacroBar from '../../components/nutrition/MacroBar'

const GOAL = 200

test('REGRESSION: going over on total carbs via fiber alone does not turn the bar red', () => {
  // 210g total carbs on a 200g goal, but 15g of that is fiber — net carbs
  // (195g) are still under goal.
  const html = renderToStaticMarkup(
    MacroBar({ label: 'Carbs', current: 210, goal: GOAL, color: 'bg-green-600', fiber: 15 }),
  )
  assert.doesNotMatch(html, /bg-red-500/)
  assert.doesNotMatch(html, /text-red-500/)
  assert.match(html, /bg-emerald-500/)
})

test('a genuine net-carb overage (not just fiber) still turns the bar red', () => {
  // 230g total, 10g fiber -> 220g net, 10% over a 200g goal.
  const html = renderToStaticMarkup(
    MacroBar({ label: 'Carbs', current: 230, goal: GOAL, color: 'bg-green-600', fiber: 10 }),
  )
  assert.match(html, /bg-red-500/)
})

test('with no fiber passed, status still falls back to total carbs', () => {
  const html = renderToStaticMarkup(
    MacroBar({ label: 'Carbs', current: 230, goal: GOAL, color: 'bg-green-600' }),
  )
  assert.match(html, /bg-red-500/)
})

test('the displayed grams stay honest to the label even though the colour reads net', () => {
  const html = renderToStaticMarkup(
    MacroBar({ label: 'Carbs', current: 210, goal: GOAL, color: 'bg-green-600', fiber: 15 }),
  )
  // Total current/goal still shown, not net.
  assert.match(html, /210g\s*\/\s*200g/)
  // Fiber breakdown still shown.
  assert.match(html, /15g fiber/)
  // The "+10g" chip is honest about total carbs — but it renders in the net
  // (hit) colour, not the over/red colour.
  assert.match(html, /\+10g/)
  assert.doesNotMatch(html, /bg-red-100/)
})
