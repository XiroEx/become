// Run with: npm run test:file tests/unit/weightLogSheet.test.tsx
//
// The weight button used to live at the bottom of the Training Log
// (Progress) page, opening this same bottom sheet in place of an inline
// auto-submit form. That placement was then rejected: weight tracking moved
// off Training Log entirely, onto a "Weight" tab on the Nutrition Goals page
// (where logging a new weight also has to refresh the TDEE-derived calorie
// and macro targets), and the Home Screen's Weight tile now opens this same
// sheet in place instead of navigating to Progress.
//
// No jsdom/testing-library in this repo (see customExerciseTrackingType.test.ts),
// so interaction (typing, submit) isn't exercised here. This covers the static
// shape via renderToStaticMarkup — closed renders nothing, open renders the
// bottom-sheet markup — plus source scans confirming each surface wires up
// (or, for Training Log, no longer wires up) the sheet.

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

test('Training Log (Progress) no longer tracks weight at all', () => {
  const src = readSource('app/dashboard/progress/ProgressClient.tsx')

  // Neither the old inline form nor the sheet this card replaced it with —
  // weight tracking left this page entirely, it didn't just change widgets.
  assert.doesNotMatch(src, /LogWeightForm/)
  assert.doesNotMatch(src, /WeightLogSheet/)
  assert.doesNotMatch(src, /Body Weight/)
})

test('Nutrition Goals page has a Weight tab that opens WeightLogSheet', () => {
  const src = readSource('app/dashboard/nutrition/goals/page.tsx')

  // A Goals/Weight segmented control, not a second standalone page.
  assert.match(src, /SegmentedControl/)
  assert.match(src, /value:\s*'goals'/)
  assert.match(src, /value:\s*'weight'/)

  // The tab's Log Weight button opens the sheet; the sheet is mounted once,
  // wired to a handler that updates the weight chart AND — since TDEE feeds
  // calories/macros — re-applies the daily targets against the new weight.
  assert.match(src, /onClick=\{\(\) => setWeightSheetOpen\(true\)\}/)
  assert.match(src, /<WeightLogSheet/)
  assert.match(src, /isOpen=\{weightSheetOpen\}/)
  assert.match(src, /onLogged=\{handleWeightLogged\}/)
  assert.match(src, /applyTargets\(macroPreset, goals\.goalType, goals\.activityLevel, nextTdee/)
})

test('Home Screen Weight tile opens WeightLogSheet in place instead of navigating', () => {
  const tilesSrc = readSource('lib/dashboardTiles.tsx')

  // renderWeight no longer links to /dashboard/progress — it opens the sheet.
  const renderWeightFn = tilesSrc.slice(tilesSrc.indexOf('function renderWeight'))
  assert.doesNotMatch(renderWeightFn.slice(0, renderWeightFn.indexOf('\nfunction renderWorkouts')), /href="\/dashboard\/progress"/)
  assert.match(tilesSrc, /onOpenWeightSheet: \(\) => void/)
  assert.match(renderWeightFn, /onClick=\{ctx\.onOpenWeightSheet\}/)

  const dashboardSrc = readSource('app/dashboard/DashboardClient.tsx')
  assert.match(dashboardSrc, /<WeightLogSheet/)
  assert.match(dashboardSrc, /onOpenWeightSheet: \(\) => setWeightSheetOpen\(true\)/)
})
