// Run with: npm run test:file tests/unit/progressChartInk.test.ts
//
// Training Log (/dashboard/progress) drew its charts in a hardcoded `#18181b`:
// the Weekly Volume bars, and the PR trend line plus its dots. That ink is a
// light-mode value, so on the dark theme's near-black canvas the series were
// invisible and the page rendered what looked like an empty axis. The same bug
// in hairline form sat on the body-composition grid and the Weekly Volume hover
// cursor, both hardcoded `rgba(0, 0, 0, …)`.
//
// The fix is to paint with `currentColor`, which inherits the theme's own ink:
// redstyle sets `body { color: var(--text-primary) }` and tokens.css gives
// `--text-primary` #18181b under `.light` and #ffffff under `.dark` (the class
// app/layout.tsx's colour-scheme script toggles on <html>). One declaration,
// legible in both modes — the same way this file's axis ticks already resolve
// their colour.
//
// ProgressClient renders behind fetch + hooks, and there is no jsdom/testing
// library in this repo (see tests/unit/animationSweepChrome.test.ts), so this
// pins the exported paint tokens plus a source scan of the chart call sites.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { CHART_INK, CHART_HAIRLINE_OPACITY } from '../../app/dashboard/progress/ProgressClient'

const SOURCE_REL = 'app/dashboard/progress/ProgressClient.tsx'
const src = fs.readFileSync(path.join(__dirname, '../..', SOURCE_REL), 'utf8')

/**
 * Code only. The comments in that file (and in this one) quote the old
 * `#18181b` / `rgba(0, 0, 0, …)` ink on purpose, to say why it is gone — a scan
 * for baked colours must not read prose as paint.
 */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:"'`])\/\/[^\n]*$/gm, '$1')

test('chart ink is the theme ink, not a literal colour', () => {
  // `currentColor` is the whole point: it resolves to body's
  // `color: var(--text-primary)`, which flips with the .light/.dark class.
  assert.equal(CHART_INK, 'currentColor')
  assert.doesNotMatch(CHART_INK, /^#|^rgba?\(|^hsla?\(/)
})

test('no achromatic hex is baked into the Progress charts', () => {
  // Categorical series colours (body fat orange, lean mass violet) are fine in
  // both modes and stay literal. A grey/black/white hex is ink, and ink must
  // come from the theme — that is the colour that disappeared in dark mode.
  const hexes = code.match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g) ?? []
  const achromatic = hexes.filter((hex) => {
    const full = hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(full.slice(i, i + 2), 16))
    return Math.max(r, g, b) - Math.min(r, g, b) < 16
  })
  assert.deepEqual(achromatic, [], `hardcoded ink in ${SOURCE_REL}: ${achromatic.join(', ')}`)
})

test('no hardcoded black/white rgb() paint either', () => {
  assert.doesNotMatch(code, /rgba?\(\s*0\s*,\s*0\s*,\s*0/)
  assert.doesNotMatch(code, /rgba?\(\s*255\s*,\s*255\s*,\s*255/)
})

test('Weekly Volume bars paint with the theme ink', () => {
  const bar = code.slice(code.indexOf('<Bar'), code.indexOf('</BarChart>'))
  assert.ok(bar.length > 0, 'expected a <Bar> in the Weekly Volume chart')
  assert.match(bar, /fill=\{CHART_INK\}/)
})

test('the PR trend line and its dots paint with the theme ink', () => {
  const lineStart = code.indexOf('<Line ')
  assert.notEqual(lineStart, -1, 'expected a <Line> in the PR chart')
  const line = code.slice(lineStart, code.indexOf('/>', lineStart))
  assert.match(line, /stroke=\{CHART_INK\}/)
  assert.match(line, /dot=\{\{[^}]*fill: CHART_INK/)
})

test('grid and hover cursor are the same ink, held back by opacity', () => {
  assert.ok(
    CHART_HAIRLINE_OPACITY > 0 && CHART_HAIRLINE_OPACITY < 1,
    'a hairline is visible but quiet',
  )
  assert.match(code, /<CartesianGrid[^/]*stroke=\{CHART_INK\}[^/]*strokeOpacity=\{CHART_HAIRLINE_OPACITY\}/)
  assert.match(code, /cursor=\{\{ fill: CHART_INK, fillOpacity: CHART_HAIRLINE_OPACITY \}\}/)
})
