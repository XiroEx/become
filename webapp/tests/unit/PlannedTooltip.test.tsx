// Run with: npx tsx --test tests/unit/PlannedTooltip.test.tsx
//
// The floater that answers "where do those numbers land if I include the
// planned items" for the calorie ring and macro bars. Content only — the
// open/close state lives in the caller (usePlannedTooltip).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import PlannedTooltip from '../../components/nutrition/PlannedTooltip'

test('closed renders nothing', () => {
  const html = renderToStaticMarkup(
    <PlannedTooltip open={false} label="Calories" current={1530} planned={320} goal={2200} />,
  )
  assert.equal(html, '')
})

test('open shows the logged + planned = total breakdown against goal', () => {
  const html = renderToStaticMarkup(
    <PlannedTooltip open={true} label="Calories" current={1530} planned={320} goal={2200} />,
  )
  assert.match(html, /role="tooltip"/)
  assert.match(html, /Calories with today&#x27;s plan/)
  assert.match(html, /1530 logged \+ 320 planned = 1850 \/ 2200/)
  assert.match(html, /350 left after plan/)
})

test('applies the unit suffix to every number for gram-based macros', () => {
  const html = renderToStaticMarkup(
    <PlannedTooltip open={true} label="Protein" current={80} planned={40} goal={200} unit="g" />,
  )
  assert.match(html, /80g logged \+ 40g planned = 120g \/ 200g/)
})

test('rounds fractional totals rather than showing raw decimals', () => {
  const html = renderToStaticMarkup(
    <PlannedTooltip open={true} label="Fats" current={45.6} planned={12.2} goal={70} unit="g" />,
  )
  assert.match(html, /46g logged \+ 12g planned = 58g \/ 70g/)
  assert.match(html, /12g left after plan/)
})

test('says exactly how far the plan goes over instead of making the member subtract', () => {
  const html = renderToStaticMarkup(
    <PlannedTooltip open={true} label="Carbs" current={180} planned={45} goal={200} unit="g" />,
  )
  assert.match(html, /25g over after plan/)
})
