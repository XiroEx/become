// Run with: npm run test:file tests/unit/MacroBar.test.tsx
//
// Fiber counts toward total carbohydrate on the label, so a member eating a
// high-fiber meal could cross the carb goal on fiber alone and see the bar
// (and the "123g / 200g" text, and the "+Xg" chip) turn red — even though net
// carbs, the number that actually matters for blood sugar/energy, were still
// under goal. The colour must be judged against NET carbs (total − fiber);
// the displayed grams stay honest to the label.
//
// Rendered via JSX (not called as a plain function) because MacroBar now
// pulls in a hook (usePlannedTooltip) — React's hook dispatcher is only
// active while an element is actually going through render, so a bare
// `MacroBar({...})` call throws "Cannot read properties of null" here.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import MacroBar from '../../components/nutrition/MacroBar'

const GOAL = 200

test('REGRESSION: going over on total carbs via fiber alone does not turn the bar red', () => {
  // 210g total carbs on a 200g goal, but 15g of that is fiber — net carbs
  // (195g) are still under goal.
  const html = renderToStaticMarkup(
    <MacroBar label="Carbs" current={210} goal={GOAL} color="bg-green-600" fiber={15} />,
  )
  assert.doesNotMatch(html, /bg-red-500/)
  assert.doesNotMatch(html, /text-red-500/)
  assert.match(html, /bg-emerald-500/)
})

test('a genuine net-carb overage (not just fiber) still turns the bar red', () => {
  // 230g total, 10g fiber -> 220g net, 10% over a 200g goal.
  const html = renderToStaticMarkup(
    <MacroBar label="Carbs" current={230} goal={GOAL} color="bg-green-600" fiber={10} />,
  )
  assert.match(html, /bg-red-500/)
})

test('with no fiber passed, status still falls back to total carbs', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Carbs" current={230} goal={GOAL} color="bg-green-600" />,
  )
  assert.match(html, /bg-red-500/)
})

test('the displayed grams stay honest to the label even though the colour reads net', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Carbs" current={210} goal={GOAL} color="bg-green-600" fiber={15} />,
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

test('plannedExtra renders a light shadow past the solid fill, in the macro colour at low opacity', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={80} goal={GOAL} color="bg-blue-600" kind="floor" plannedExtra={40} />,
  )
  // Shadow layer: the macro's own colour, at reduced opacity.
  assert.match(html, /opacity-25 bg-blue-600/)
})

test('no plannedExtra renders no shadow layer at all', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={80} goal={GOAL} color="bg-blue-600" kind="floor" />,
  )
  assert.doesNotMatch(html, /opacity-25/)
})

test('plannedExtra that does not push past the current fill renders no shadow', () => {
  // Already-logged amount alone clears the goal — nothing left to preview.
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={200} goal={GOAL} color="bg-blue-600" kind="floor" plannedExtra={10} />,
  )
  assert.doesNotMatch(html, /opacity-25/)
})

test('an excessive plannedExtra still just renders one shadow layer (clamped internally, not left to overflow)', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Fats" current={50} goal={GOAL} color="bg-yellow-400" plannedExtra={300} />,
  )
  assert.match(html, /opacity-25 bg-yellow-400/)
})

test('a visible planned shadow makes the whole macro item the tap/hover target', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={80} goal={GOAL} color="bg-blue-600" kind="floor" plannedExtra={40} />,
  )
  // The semantic trigger is the outer wrapper, so its hit area includes the
  // title, numbers/chip, and meter rather than only the thin track.
  assert.match(html, /^<div class="space-y-1\.5 cursor-pointer[^"]*" role="button"/)
  const triggerStart = html.indexOf('role="button"')
  assert.ok(triggerStart < html.indexOf('Protein'))
  assert.ok(triggerStart < html.indexOf('opacity-25 bg-blue-600'))
  // The trigger announces the planned-inclusive total up front, for anyone
  // who can't see (or trigger) the floating tooltip at all.
  assert.match(html, /Protein including today&#x27;s plan: 120g of 200g/)
})

test('with no visible planned shadow, the bar stays a plain non-interactive track', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={80} goal={GOAL} color="bg-blue-600" kind="floor" />,
  )
  assert.doesNotMatch(html, /role="button"/)
  assert.doesNotMatch(html, /including today&#x27;s plan/)
})

test('the tooltip itself is closed on first render (nothing to dismiss before any tap/hover)', () => {
  const html = renderToStaticMarkup(
    <MacroBar label="Protein" current={80} goal={GOAL} color="bg-blue-600" kind="floor" plannedExtra={40} />,
  )
  assert.doesNotMatch(html, /role="tooltip"/)
})
