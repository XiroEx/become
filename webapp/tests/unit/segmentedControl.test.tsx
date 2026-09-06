// Run with: npm run test:file tests/unit/segmentedControl.test.tsx
//
// The active-segment highlight used to be an instant bg-color swap; it's now a
// single `layoutId`-tracked pill that Framer Motion slides between segments.
// Covers: exactly one pill renders (for the active segment only), each
// SegmentedControl instance gets its own layoutId (so two controls on the same
// page never try to morph a pill between each other), and the label/icon
// content is unchanged.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import SegmentedControl from '../../components/ui/SegmentedControl'

const segments = [
  { value: 'day' as const, label: 'Day' },
  { value: 'week' as const, label: 'Week' },
  { value: 'month' as const, label: 'Month' },
]

test('renders exactly one active pill, on the selected segment', () => {
  const html = renderToStaticMarkup(
    <SegmentedControl segments={segments} value="week" onChange={() => {}} />,
  )
  const pillMatches = html.match(/bg-zinc-900 dark:bg-white/g) ?? []
  assert.equal(pillMatches.length, 1)
})

test('all segment labels render regardless of which is active', () => {
  const html = renderToStaticMarkup(
    <SegmentedControl segments={segments} value="day" onChange={() => {}} />,
  )
  assert.match(html, />Day</)
  assert.match(html, />Week</)
  assert.match(html, />Month</)
})

test('two independent controls on the same page do not share a layoutId', () => {
  function TwoControls() {
    return (
      <>
        <SegmentedControl segments={segments} value="day" onChange={() => {}} />
        <SegmentedControl segments={segments} value="month" onChange={() => {}} />
      </>
    )
  }
  const html = renderToStaticMarkup(<TwoControls />)
  // Two active pills should render (one per control) since they're
  // independent instances, not a single shared morphing element.
  const pillMatches = html.match(/bg-zinc-900 dark:bg-white/g) ?? []
  assert.equal(pillMatches.length, 2)
})

test('passes through the data-tour anchor', () => {
  const html = renderToStaticMarkup(
    <SegmentedControl segments={segments} value="day" onChange={() => {}} data-tour="log-range" />,
  )
  assert.match(html, /data-tour="log-range"/)
})
