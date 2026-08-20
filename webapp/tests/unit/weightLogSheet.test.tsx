// Run with: npx tsx --test tests/unit/weightLogSheet.test.tsx
//
// The weight button on the Progress page used to submit an inline form in
// place — logging happened right there in the card, no confirmation step. The
// ask was a footer-anchored sheet instead (see FoodLogSheet / MealApplySheet
// for the established bottom-sheet pattern this mirrors): tap the button, a
// panel slides up from the bottom of the screen to log the weight, same as
// every other quick-log flow in the app.
//
// No jsdom/testing-library in this repo (see customExerciseTrackingType.test.ts),
// so interaction (typing, submit) isn't exercised here. This covers the static
// shape via renderToStaticMarkup — closed renders nothing, open renders the
// bottom-sheet markup — plus a source scan confirming ProgressClient wires the
// button to the sheet instead of the old inline auto-submit form.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import WeightLogSheet from '../../components/WeightLogSheet'

const ROOT = path.join(__dirname, '../..')

test('closed sheet renders nothing (no backdrop, no sheet in the DOM)', () => {
  const html = renderToStaticMarkup(
    <WeightLogSheet isOpen={false} onClose={() => {}} onLogged={() => {}} />,
  )
  assert.equal(html, '')
})

test('open sheet is bottom-anchored (slide-up sheet, not a centered dialog)', () => {
  const html = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} />,
  )
  // Rounded top corners + starts translated fully off-screen below the
  // viewport (framer-motion's `initial={{ y: '100%' }}`) is what makes this a
  // footer sheet rather than a centered modal like the old WeightModal.
  assert.match(html, /rounded-t-2xl/)
  assert.match(html, /transform:translateY\(100%\)/)
  assert.match(html, /items-end/)
})

test('open sheet shows the weight input and a Log Weight submit', () => {
  const html = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} />,
  )
  assert.match(html, /Log Weight/)
  assert.match(html, /Weight \(lbs\)/)
  assert.match(html, /id="weight-sheet-input"/)
  assert.match(html, /type="submit"/)
})

test('open sheet surfaces the goal when a target weight is passed', () => {
  const withGoal = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} targetWeight={175} />,
  )
  assert.match(withGoal, /Goal: 175 lbs/)

  const withoutGoal = renderToStaticMarkup(
    <WeightLogSheet isOpen={true} onClose={() => {}} onLogged={() => {}} targetWeight={null} />,
  )
  assert.doesNotMatch(withoutGoal, /Goal:/)
})

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('ProgressClient opens WeightLogSheet from the weight button instead of logging inline', () => {
  const src = readSource('app/dashboard/progress/ProgressClient.tsx')

  // The old inline auto-submit form is gone.
  assert.doesNotMatch(src, /LogWeightForm/)

  // The button that used to submit weight now just opens the sheet.
  assert.match(src, /onClick=\{\(\) => setWeightSheetOpen\(true\)\}/)

  // The sheet is mounted once, wired to the same onLogged callback the old
  // inline form used to call directly, so the chart still updates on log.
  assert.match(src, /<WeightLogSheet/)
  assert.match(src, /isOpen=\{weightSheetOpen\}/)
  assert.match(src, /onLogged=\{handleWeightLogged\}/)
})
