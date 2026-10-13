// Run with: npm run test:file tests/unit/fireNumber.test.tsx
//
// The Super Streak number, and the fire around it.
//
// Found capturing store screenshots (2026-10-13): on the Home dashboard's
// streak tile, the Super Streak page drew the flame ON TOP OF the digits on
// both platforms — the tongues hung in a band from 8% to 33% of the number's
// height and the ember bed covered its bottom 40%, so both sat inside the
// numerals. The "Day Streak" page, which has no fire, was fine.
//
// The fix is geometric, not cosmetic: the fire lives in two bands OUTSIDE the
// digits' line box and each band CLIPS what it draws, so no part of a tongue
// (or of the ember's blur) can reach a numeral at any point of its animation.
// Every number is a FRACTION of the text's own box, so there is nothing to
// re-tune per streak length or per text size — which is what this file pins:
//
//   * the geometry is disjoint from the digits at 1, 2 and 3 digits and from
//     a 16px number up to a 64px one (the tile's 30px at the largest
//     accessibility text size);
//   * the component actually renders those bands, and clips them;
//   * the CSS that moves a tongue only ever moves it AWAY from the digits,
//     in `em` so it scales with the text;
//   * the native copy of the geometry answers identically.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import FireNumber from '../../components/streaks/FireNumber'
import StreakTile from '../../components/dashboard/StreakTile'
import type { StreaksLite } from '../../lib/streaks/tile'
import {
  DIGIT_ADVANCE,
  EMBER_BAND,
  FLAME_BAND,
  FLAME_RISE,
  FLAME_TONGUES,
  fireNumberGeometry,
  percent,
  rectsOverlap,
  type Rect,
} from '../../lib/streaks/fireNumberLayout'
// The native copy, imported the way tests/unit/nativeParity/* import
// shared/core: by relative path, from a test, never from app code.
import * as native from '../../../expo/lib/streaks/fireNumberLayout'

// Streak lengths that actually happen, and the type sizes they happen at: the
// tile's `text-3xl` (30px), the Streaks page's and the smaller pages' sizes,
// and 48/64px for a phone at its largest accessibility text size.
const DIGITS = [1, 2, 3]
const BOXES = [16, 24, 30, 48, 64]

function area(r: Rect): number {
  return r.width * r.height
}

test('no part of the fire overlaps the digits — 1, 2 and 3 digits, every text size', () => {
  for (const digits of DIGITS) {
    for (const boxPx of BOXES) {
      const g = fireNumberGeometry({ digits, boxPx })
      const where = `${digits} digit(s) at ${boxPx}px`

      // The bands themselves are outside the digits' box, so nothing drawn
      // inside them can be on a numeral however it is animated.
      assert.equal(rectsOverlap(g.flameBand, g.digits), false, `flame band is clear of the digits (${where})`)
      assert.equal(rectsOverlap(g.emberBand, g.digits), false, `ember band is clear of the digits (${where})`)
      assert.equal(g.flameBand.top + g.flameBand.height, g.digits.top, `flame band stops at the digits' top edge (${where})`)
      assert.equal(g.emberBand.top, g.digits.top + g.digits.height, `ember band starts at the digits' bottom edge (${where})`)

      for (const [i, painted] of g.paintedTongues.entries()) {
        assert.equal(rectsOverlap(painted, g.digits), false, `tongue ${i} paints nothing on the digits (${where})`)
        assert.ok(area(painted) > 0, `tongue ${i} is still visible (${where})`)
        // And it stays over its own number: a tongue that ran past the end of
        // the digits would land on the label or the unit beside them.
        assert.ok(painted.left >= g.digits.left, `tongue ${i} starts inside the number (${where})`)
        assert.ok(
          painted.left + painted.width <= g.digits.left + g.digits.width + 1e-9,
          `tongue ${i} ends inside the number (${where})`,
        )
      }
    }
  }
})

test('the clip is load-bearing: a tongue is taller than its band and gets cut at both edges', () => {
  // The tongues are taller than the band on purpose — that half-out-of-view
  // shape is what reads as a flame licking off the top edge — so what keeps
  // them off the digits BELOW and off the tile's label ABOVE is the band's
  // `overflow-hidden`. The same clip is what stops the ember's 5px blur, which
  // spreads outside its own box, bleeding back up onto the numerals.
  const g = fireNumberGeometry({ digits: 2, boxPx: 30 })
  assert.ok(FLAME_TONGUES.every(t => t.height > FLAME_BAND), 'every tongue is taller than its band')
  assert.ok(
    g.tongues.some(t => t.top < g.flameBand.top),
    'at least one tongue reaches past the band before it is clipped',
  )
  for (const [i, painted] of g.paintedTongues.entries()) {
    assert.ok(painted.top >= g.flameBand.top, `tongue ${i} paints nothing above the band — the label lives up there`)
    assert.ok(
      painted.top + painted.height <= g.flameBand.top + g.flameBand.height,
      `tongue ${i} paints nothing below the band`,
    )
  }
})

test('the rendered number draws both bands, outside the digits, clipped', () => {
  const html = renderToStaticMarkup(<FireNumber>124</FireNumber>)

  // The flame band: above the digits (`bottom-full`), clipped, em-sized.
  assert.match(html, /data-testid="fire-flames"/)
  const flames = html.slice(html.indexOf('data-testid="fire-flames"'))
  assert.match(flames.slice(0, 200), /bottom-full/, 'the flame band hangs off the top edge')
  assert.match(flames.slice(0, 200), /overflow-hidden/, 'the flame band clips its tongues')
  assert.ok(html.includes(`height:${FLAME_BAND}em`), 'the flame band is sized in em, from the shared geometry')

  // The ember band: below the digits (`top-full`), clipped — the clip is what
  // stops the blur bleeding back up onto the numerals.
  const embers = html.slice(html.indexOf('data-testid="fire-embers"'))
  assert.match(embers.slice(0, 200), /top-full/, 'the ember band sits under the digits')
  assert.match(embers.slice(0, 200), /overflow-hidden/, 'the ember band clips the blur')
  assert.ok(html.includes(`height:${EMBER_BAND}em`), 'the ember band is sized in em, from the shared geometry')

  // Nothing absolutely positioned is left inside the digits' own box: no
  // `inset-x-0 bottom-0 h-2/5` ember, no `top-[8%] h-1/4` tongue band.
  assert.equal(html.includes('h-2/5'), false, 'the old ember bed is gone')
  assert.equal(html.includes('top-[8%]'), false, 'the old tongue band is gone')

  // Still a fire: five tongues, each with the CSS animation (which runs from
  // first paint — see the note in the component), and the gradient digits.
  assert.equal((html.match(/fire-lick/g) ?? []).length, FLAME_TONGUES.length)
  assert.match(html, /class="fire-digits/)
  assert.match(html, /124<\/span>/)
  for (const t of FLAME_TONGUES) {
    assert.ok(html.includes(`left:${percent(t.left)}`), `tongue at ${t.left} is placed as a fraction of the number's width`)
    assert.ok(html.includes(`width:${percent(t.width)}`), `tongue at ${t.left} is sized as a fraction of the number's width`)
  }
})

test("the dashboard tile's Super Streak page draws the number through the fixed FireNumber", () => {
  // The screen the card is about: Home → streak tile → Super Streak page. The
  // Day Streak page has no fire and never had the bug; it must stay plain.
  const streaks: StreaksLite = {
    overall: { current: 9, best: 18, nextMilestone: 14, activeToday: true, freezes: 1 },
    pillars: {
      workout: { unit: 'days', current: 9, best: 9, thisWeek: 3, target: 4, weekLost: false },
      nutrition: { current: 9, best: 9, activeToday: true },
      mindset: { current: 9, best: 9, activeToday: true },
      super: {
        current: 124, best: 124, activeToday: true,
        today: { nutrition: true, mindset: true, trained: true, restDay: false, weekOnTrack: true },
      },
    },
  }
  const html = renderToStaticMarkup(<StreakTile streaks={streaks} />)
  assert.match(html, /data-page="super"/, 'the super streak leads the tile')
  const value = html.slice(html.indexOf('data-testid="streak-super-value"'))
  assert.match(value.slice(0, 600), /data-testid="fire-flames"/, 'the tile draws the clipped flame band')
  assert.ok(value.includes('bottom-full'), 'the flame band hangs above the digits on the tile too')
  assert.ok(value.includes('overflow-hidden'), 'and is clipped there too')
  // Three digits still render as one number next to its unit.
  assert.match(value, /124<\/span>/)
  assert.match(html, /days<\/span>/)
})

test('the flame animation only ever travels AWAY from the digits, and scales with the text', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'app', 'globals.css'), 'utf8')
  const block = css.slice(css.indexOf('@keyframes fire-lick'))
  const frames = block.slice(0, block.indexOf('}\n}') + 3)
  const travels = [...frames.matchAll(/translateY\((-?[\d.]+)(em|px|rem)?\)/g)]
  assert.ok(travels.length >= 4, 'the keyframes still move the tongue')
  for (const [whole, value, unit] of travels) {
    const n = Number(value)
    assert.ok(n <= 0, `${whole} must not push the tongue down into the digits`)
    // `px` would stay the same size while the number grew, which is how the
    // old band ended up proportionally deeper into bigger digits.
    if (n !== 0) assert.equal(unit, 'em', `${whole} must be in em so it scales with the text`)
    assert.ok(Math.abs(n) <= FLAME_RISE + 1e-9, `${whole} stays within FLAME_RISE`)
  }
})

test('the native copy of the geometry is the same geometry', () => {
  // Constants first — a changed fraction fails here even when no function did.
  assert.deepEqual(native.FLAME_TONGUES, FLAME_TONGUES)
  assert.equal(native.FLAME_BAND, FLAME_BAND)
  assert.equal(native.EMBER_BAND, EMBER_BAND)
  assert.equal(native.FLAME_RISE, FLAME_RISE)
  assert.equal(native.DIGIT_ADVANCE, DIGIT_ADVANCE)
  for (const f of [0, 0.02, 0.09, 0.16, 0.2, 2.125, 1]) assert.equal(native.percent(f), percent(f))

  // Then every exported function, over the same fixture table.
  for (const digits of DIGITS) {
    for (const boxPx of BOXES) {
      assert.deepEqual(
        native.fireNumberGeometry({ digits, boxPx }),
        fireNumberGeometry({ digits, boxPx }),
        `same geometry for ${digits} digit(s) at ${boxPx}px`,
      )
      const g = fireNumberGeometry({ digits, boxPx })
      assert.equal(native.rectsOverlap(g.flameBand, g.digits), rectsOverlap(g.flameBand, g.digits))
      assert.deepEqual(native.clipRect(g.tongues[0], g.flameBand), g.paintedTongues[0])
    }
  }

  // And the copy is a COPY: identical but for its "DO NOT EDIT" header, so the
  // re-copy procedure (expo/README.md) cannot quietly become a rewrite.
  const web = fs.readFileSync(path.join(process.cwd(), 'lib', 'streaks', 'fireNumberLayout.ts'), 'utf8')
  const copy = fs.readFileSync(
    path.join(process.cwd(), '..', 'expo', 'lib', 'streaks', 'fireNumberLayout.ts'),
    'utf8',
  )
  assert.ok(copy.startsWith('// ── A COPY. DO NOT EDIT THIS FILE.'), 'the copy says it is one')
  assert.equal(copy.slice(copy.indexOf(web)), web, 'the copy is byte-identical to the web source')
})
