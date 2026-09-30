// Run with: npm run test:file tests/unit/becomingLayout.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutWeeks, boundsOf, fitScale, neighbourFor, swipeDirection, nearestCard, cardSize, scrubTarget, exitEdge, horizonDelta, peakIndexes } from '../../lib/becoming/layout'

const size = cardSize(390, 844)
const wk = (index: number, altitude: number, step: 'up' | 'flat' | 'down' | 'start' = 'flat') => ({ index, altitude, step, score: 50, daysElapsed: 7 })
const weeks = [wk(0, 0, 'start'), wk(1, 1, 'up'), wk(2, 1.25, 'flat'), wk(3, 0.9, 'down')]
const pos = layoutWeeks(weeks, size)

test('card size follows the stage; positions step forward and climb; horizon sits one past the last week', () => {
  assert.equal(size.w, 350); assert.ok(size.h <= 844 - 200)
  assert.deepEqual(pos[1], { index: 1, x: size.col, y: -size.row })
  assert.ok(pos[3].y > pos[2].y, 'a down step sits lower')
  assert.equal(pos.length, 5); assert.equal(pos[4].horizon, true); assert.equal(pos[4].x, 4 * size.col)
  // last week is 'down' → horizon eases slightly but never below 0
  assert.ok(pos[4].y >= pos[3].y - 1)
  assert.equal(horizonDelta(wk(3, 0.9, 'up')), 1)
  assert.equal(horizonDelta({ ...wk(3, 0.9, 'up'), daysElapsed: 1 }), 0.25, 'day 1 → gentle default')
})

test('swipe semantics: left forward, right back, up toward the higher card, down toward the lower', () => {
  assert.equal(neighbourFor(pos, 1, 'left'), 2)
  assert.equal(neighbourFor(pos, 1, 'right'), 0)
  assert.equal(neighbourFor(pos, 2, 'down'), 3, 'next is lower')
  assert.equal(neighbourFor(pos, 1, 'up'), 2, 'next is higher')
  assert.equal(neighbourFor(pos, 1, 'down'), 0, 'prev is lower')
  assert.equal(neighbourFor(pos, 4, 'left'), null)
  assert.equal(neighbourFor(pos, 0, 'right'), null)
})

test('scrub: the drag is projected onto the segment the finger moves along', () => {
  // From week 1, dragging the finger LEFT (world moves right) → forward to week 2 (which is up-right)
  const f = scrubTarget(pos, 1, -120, 0, 1)!
  assert.equal(f.target, 2); assert.ok(f.progress > 0 && f.progress < 1)
  // Dragging DOWN from week 1 (world moves up) → the higher neighbour, week 2
  const u = scrubTarget(pos, 1, 0, 160, 1)!
  assert.equal(u.target, 2)
  // Dragging RIGHT → back to week 0 (which is lower-left of week 1)
  const b = scrubTarget(pos, 1, 140, 0, 1)!
  assert.equal(b.target, 0)
  // Full segment length → progress 1
  const seg = Math.hypot(pos[2].x - pos[1].x, pos[2].y - pos[1].y)
  const full = scrubTarget(pos, 1, -(pos[2].x - pos[1].x), -(pos[2].y - pos[1].y), 1)!
  assert.ok(Math.abs(full.progress - 1) < 1e-9, String(full.progress) + ' ' + seg)
})

test('exit edge faces the next card; a hold (+¼ row) is right, not up', () => {
  assert.equal(exitEdge(pos, 0, size.row), 'up')      // 0 → 1: +1 climb
  assert.equal(exitEdge(pos, 1, size.row), 'right')   // 1 → 1.25: a hold
  assert.equal(exitEdge(pos, 2, size.row), 'right')   // 1.25 → 0.9: −0.35, under the 0.4 threshold
  assert.equal(exitEdge(pos, 4, size.row), null)
  const steep = layoutWeeks([wk(0, 0, 'start'), wk(1, 1, 'up'), wk(2, 0.5, 'down')], size)
  assert.equal(exitEdge(steep, 1, size.row), 'down')
})

test('peaks: weeks that set a new high (never week 0, never the live week)', () => {
  const p = peakIndexes([{ index: 0, altitude: 0 }, { index: 1, altitude: 1 }, { index: 2, altitude: 0.75 }, { index: 3, altitude: 1.5 }, { index: 4, altitude: 1.5, isCurrent: true }])
  assert.deepEqual([...p], [1, 3])
})

test('swipe direction from deltas', () => {
  assert.equal(swipeDirection(-60, 10), 'left'); assert.equal(swipeDirection(60, 10), 'right')
  assert.equal(swipeDirection(10, -60), 'up'); assert.equal(swipeDirection(10, 60), 'down')
  assert.equal(swipeDirection(10, 10), null)
})

test('bounds, fit scale and nearest card', () => {
  const b = boundsOf(pos, size)
  assert.ok(b.width > 4 * size.col)
  const s = fitScale(b, 390, 700)
  assert.ok(s >= 0.03 && s < 0.5)
  assert.equal(nearestCard(pos, size.col + 10, -size.row + 5), 1)
})
