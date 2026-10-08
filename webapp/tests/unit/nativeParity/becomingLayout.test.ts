// Run with: npm run test:file tests/unit/nativeParity/becomingLayout.test.ts
//
// ─── The Becoming's layout, run TWICE ────────────────────────────────────────
//
// NP-204 applies NP-017/NP-058 to the journey stage: where a week sits, where
// the Horizon sits, how a drag projects onto the path and where the overview
// camera lands is pure, so the native stage runs the SAME maths as the web and
// a week sits in the same place on both. The shared home is `@become/core`
// (shared/core/src/becoming/layout.ts), a copy of the webapp module imported
// here.
//
// The webapp still imports its OWN module (RedRun builds `webapp/` alone), so
// there are two files — and THIS test is what stops them from becoming two
// behaviours. It drives every exported function of both over one fixture
// table and fails the moment an answer differs. It lives in `verify`, the job
// that always runs, because that is where web changes are. When it fails, the
// fix is to RE-COPY the web file into shared/core/src/becoming/ (expo/README.md,
// "Re-copying a training module") — never to edit the copy into agreement.
//
// Three things it checks, as trainingModules.test.ts does: every export of
// the web module exists on the copy with constants deep-equal; every exported
// FUNCTION is exercised by at least one fixture; and the comparator bites.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── The web module (canonical) ──────────────────────────────────────────────
import * as web from '../../../lib/becoming/layout'
import type { WeekSnapshot } from '../../../lib/becoming/weeks'

// ── The copy in @become/core ────────────────────────────────────────────────
import * as core from '../../../../shared/core/src/becoming/layout'

// ───────────────────────────────────────────────────────────────────────────
// The harness
// ───────────────────────────────────────────────────────────────────────────

const covered = new Set<string>()
let comparisons = 0

type Outcome = { ok: true; value: unknown } | { ok: false; threw: string }

function run(fn: (...args: never[]) => unknown, args: unknown[]): Outcome {
  try {
    return { ok: true, value: (fn as (...a: unknown[]) => unknown)(...args) }
  } catch (err) {
    return { ok: false, threw: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
}

function show(value: unknown): string {
  return JSON.stringify(value, (_k, v) => {
    if (v instanceof Set) return { '#set': [...v].sort() }
    if (v instanceof Map) return { '#map': [...v.entries()] }
    return v
  }) ?? String(value)
}

function compare<F extends (...args: never[]) => unknown>(name: string, w: F, c: F, cases: Array<Parameters<F>>): void {
  assert.equal(typeof w, 'function', `${name}: the web export is not a function`)
  assert.equal(typeof c, 'function', `${name}: the copy is not a function`)
  for (const args of cases) {
    const a = run(w, args as unknown[])
    const b = run(c, args as unknown[])
    assert.deepStrictEqual(
      b,
      a,
      `DRIFT in ${name}(${show(args)}):\n`
        + `  webapp/lib says   ${show(a)}\n`
        + `  @become/core says ${show(b)}\n`
        + `Re-copy the web file into shared/core/src/becoming/ — do not edit the copy.`,
    )
    comparisons += 1
  }
}

function same<F extends (...args: never[]) => unknown>(name: string, w: F, c: F, cases: Array<Parameters<F>>): void {
  covered.add(name)
  compare(name, w, c, cases)
}

function manifest(id: string, w: Record<string, unknown>, c: Record<string, unknown>): void {
  const expected = Object.keys(w).sort()
  const actual = Object.keys(c).sort()
  assert.deepStrictEqual(
    actual,
    expected,
    `${id}: the copy's exports do not match the web module's. `
      + `Missing: ${expected.filter(k => !actual.includes(k)).join(', ') || 'none'}; `
      + `extra: ${actual.filter(k => !expected.includes(k)).join(', ') || 'none'}.`,
  )
  for (const key of expected) {
    const v = w[key]
    if (typeof v === 'function') {
      assert.ok(covered.has(`${id}.${key}`), `${id}.${key} is exported but no fixture compares it. Add a case to the table.`)
      continue
    }
    assert.deepStrictEqual(c[key], v, `${id}.${key}: the copied constant differs from the web's`)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Fixtures: viewports, a year of weeks, and the awkward cases
// ───────────────────────────────────────────────────────────────────────────

const VIEWPORTS: Array<[number, number]> = [[390, 844], [375, 812], [320, 568], [430, 932], [768, 1024], [1024, 768], [0, 0], [200, 300], [-10, 500]]
const SIZES = VIEWPORTS.map(([w, h]) => web.cardSize(w, h))

type Step = WeekSnapshot['step']
type Lite = Pick<WeekSnapshot, 'index' | 'altitude' | 'step' | 'score' | 'daysElapsed'>

const lite = (index: number, altitude: number, step: Step = 'flat', score = 50, daysElapsed = 7): Lite => ({ index, altitude, step, score, daysElapsed })

/** The web's path rules, deterministically: a year of climbs, holds and dips. */
function year(count: number): Lite[] {
  const PATTERN: Step[] = ['up', 'up', 'flat', 'down', 'up', 'flat', 'up', 'down', 'down', 'up', 'flat', 'up', 'up']
  const out: Lite[] = []
  let altitude = 0, peak = 0, last: Step = 'start'
  for (let i = 0; i < count; i++) {
    let step: Step = i === 0 ? 'start' : PATTERN[(i - 1) % PATTERN.length]
    const live = i === count - 1
    if (i > 0 && !live) {
      const delta = step === 'up' ? 1 : step === 'flat' ? 0.25 : -0.5
      const floor = Math.max(0, peak - 1.5)
      const effective = step === 'down' && last === 'down' ? 0 : delta
      const next = Math.max(floor, altitude + effective)
      if (step === 'down' && next >= altitude) step = 'flat'
      altitude = next; peak = Math.max(peak, altitude); last = step
    }
    out.push(lite(i, altitude, step, step === 'up' ? 80 : step === 'flat' ? 45 : 15, live ? 5 : 7))
  }
  return out
}

const WEEK_SETS: Lite[][] = [
  [],
  [lite(0, 0, 'start', 55, 3)],
  [lite(0, 0, 'start'), lite(1, 1, 'up'), lite(2, 1.25, 'flat'), lite(3, 0.9, 'down')],
  [lite(0, 0, 'start'), lite(1, 1, 'up'), lite(2, 0.5, 'down')],
  [lite(0, 0, 'start'), lite(1, 0.25, 'flat'), lite(2, 0.5, 'flat', 40, 1)],
  [lite(0, 0, 'start'), lite(1, 1, 'up'), lite(2, 2, 'up'), lite(3, 3, 'up'), lite(4, 3, 'up', 90, 6)],
  year(12),
  year(26),
  year(27),
  year(52),
  year(53),
]

const POS_SETS = WEEK_SETS.flatMap(weeks => SIZES.map(size => ({ weeks, size, pos: web.layoutWeeks(weeks, size) })))

const DRAGS: Array<[number, number]> = [[0, 0], [-120, 0], [120, 0], [0, -160], [0, 160], [-300, -200], [300, 200], [-40, 90], [40, -90], [-600, 10], [5, -5], [-1, 0], [0, 1]]
const SCALES = [1, 0.5, 0.2, 0.02, 1.6]

function sunday(i: number, from = '2025-10-05'): string {
  const [y, m, d] = from.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + i * 7)).toISOString().slice(0, 10)
}

type SnapOverrides = Omit<Partial<WeekSnapshot>, 'training' | 'mind' | 'nutrition'> & {
  training?: Partial<WeekSnapshot['training']>
  mind?: Partial<WeekSnapshot['mind']>
  nutrition?: Partial<WeekSnapshot['nutrition']>
}

function snap(i: number, over: SnapOverrides = {}): WeekSnapshot {
  return {
    index: i, weekKey: sunday(i), label: `W${i}`, isCurrent: false, isFirst: i === 0, daysElapsed: 7, score: 50, step: i === 0 ? 'start' : 'flat', altitude: i * 0.25, subject: 'training',
    days: [], uses: { training: true, fuel: true, mind: true, mindMode: 'sessions' },
    headline: '', sub: '', said: [], tags: [],
    ...over,
    mind: { sessions: 0, moodDays: 0, dominant: null, wins: [], chapterUnlocked: null, ...(over.mind ?? {}) },
    nutrition: { logDays: 0, proteinDays: 0, avgCalories: null, weightStart: null, weightEnd: null, delta: null, ...(over.nutrition ?? {}) },
    training: { workouts: 0, target: 3, hit: false, prs: [], prCount: 0, ...(over.training ?? {}) },
  }
}

const SNAPSHOT_SETS: WeekSnapshot[][] = [
  [],
  [snap(0)],
  [snap(0, { step: 'up' }), snap(1, { step: 'up', training: { prCount: 2 } }), snap(2, { mind: { sessions: 3 } })],
  [snap(0, { nutrition: { weightStart: 190, weightEnd: 189 } }), snap(1), snap(2, { nutrition: { weightEnd: 185.2 } })],
  [snap(0, { nutrition: { weightStart: 180 } }), snap(1, { nutrition: { weightStart: 180.3 } })],
  [snap(0, { nutrition: { weightEnd: 70 } }), snap(1, { step: 'up', nutrition: { weightStart: 72.6 } })],
  [snap(0, { training: { prCount: 1 } }), snap(1, { mind: { sessions: 1 } }), snap(2, { step: 'up' })],
  Array.from({ length: 52 }, (_, i) => snap(i, { step: i % 3 === 0 ? 'up' : 'flat', training: { prCount: i % 7 === 0 ? 1 : 0 }, mind: { sessions: i % 2 }, nutrition: i % 10 === 0 ? { weightStart: 200 - i, weightEnd: 199.5 - i } : {} })),
]

// ───────────────────────────────────────────────────────────────────────────
// 1. Card size and the positions — "a week sits in the same place on both"
// ───────────────────────────────────────────────────────────────────────────

test('becoming/layout: cardSize, horizonDelta and layoutWeeks', () => {
  same('becoming/layout.cardSize', web.cardSize, core.cardSize, VIEWPORTS.map(v => v as [number, number]))

  const lives: Array<[Lite | undefined]> = [
    [undefined],
    [lite(3, 0.9, 'up', 80, 5)], [lite(3, 0.9, 'down', 10, 7)], [lite(3, 0.9, 'flat', 40, 7)], [lite(0, 0, 'start', 50, 7)],
    [lite(3, 0.9, 'up', 80, 1)], [lite(3, 0.9, 'down', 10, 0)], [lite(3, 0.9, 'up', 80, 2)],
  ]
  same('becoming/layout.horizonDelta', web.horizonDelta, core.horizonDelta, lives)

  same('becoming/layout.layoutWeeks', web.layoutWeeks, core.layoutWeeks,
    WEEK_SETS.flatMap(weeks => SIZES.map(size => [weeks, size] as [Lite[], web.CardSize])))

  // The rule that travels, stated once more in plain terms: a year of weeks at
  // a phone's viewport lands every card on the same world point.
  const size = web.cardSize(390, 844)
  assert.deepStrictEqual(core.layoutWeeks(year(52), size), web.layoutWeeks(year(52), size))
})

// ───────────────────────────────────────────────────────────────────────────
// 2. Bounds and the overview camera
// ───────────────────────────────────────────────────────────────────────────

test('becoming/layout: boundsOf, fitScale, boundsCenter, overviewCamera', () => {
  same('becoming/layout.boundsOf', web.boundsOf, core.boundsOf,
    POS_SETS.flatMap(({ pos, size }) => [[pos, size], [pos, size, 0], [pos, size, 120]] as Array<[web.CardPos[], web.CardSize, number?]>))

  const bounds = POS_SETS.map(({ pos, size }) => web.boundsOf(pos, size))
  same('becoming/layout.fitScale', web.fitScale, core.fitScale,
    bounds.flatMap(b => VIEWPORTS.flatMap(([vw, vh]) => [[b, vw - 32, vh - 240], [b, vw, vh], [b, vw, vh, 0.1, 0.9]] as Array<[web.Bounds, number, number, number?, number?]>)))
  same('becoming/layout.boundsCenter', web.boundsCenter, core.boundsCenter, bounds.map(b => [b] as [web.Bounds]))
  same('becoming/layout.overviewCamera', web.overviewCamera, core.overviewCamera,
    POS_SETS.flatMap(({ pos, size }) => VIEWPORTS.map(([vw, vh]) => [web.boundsOf(pos, size), pos, vw - 32, vh - 240] as [web.Bounds, web.CardPos[], number, number])))
})

// ───────────────────────────────────────────────────────────────────────────
// 3. Steering: neighbours, the scrub projection, swipes, hits and edges
// ───────────────────────────────────────────────────────────────────────────

test('becoming/layout: neighbourFor, scrubTarget, swipeDirection, nearestCard, exitEdge', () => {
  const DIRS: web.Dir[] = ['left', 'right', 'up', 'down']
  same('becoming/layout.neighbourFor', web.neighbourFor, core.neighbourFor,
    POS_SETS.flatMap(({ pos }) => Array.from({ length: pos.length + 2 }, (_, i) => i - 1).flatMap(current => DIRS.map(dir => [pos, current, dir] as [web.CardPos[], number, web.Dir]))))

  same('becoming/layout.scrubTarget', web.scrubTarget, core.scrubTarget,
    POS_SETS.flatMap(({ pos }) => Array.from({ length: pos.length + 2 }, (_, i) => i - 1).flatMap(current =>
      DRAGS.flatMap(([dx, dy]) => SCALES.map(s => [pos, current, dx, dy, s] as [web.CardPos[], number, number, number, number])))))

  same('becoming/layout.swipeDirection', web.swipeDirection, core.swipeDirection,
    DRAGS.flatMap(([dx, dy]) => [[dx, dy], [dx, dy, 10], [dx, dy, 1000]] as Array<[number, number, number?]>))

  same('becoming/layout.nearestCard', web.nearestCard, core.nearestCard,
    POS_SETS.flatMap(({ pos, size }) => [
      [pos, 0, 0], [pos, size.col + 10, -size.row + 5], [pos, -5000, 5000], [pos, pos.length * size.col, -3 * size.row],
    ] as Array<[web.CardPos[], number, number]>))

  same('becoming/layout.exitEdge', web.exitEdge, core.exitEdge,
    POS_SETS.flatMap(({ pos, size }) => Array.from({ length: pos.length + 2 }, (_, i) => i - 1).flatMap(current =>
      [[pos, current, size.row], [pos, current]] as Array<[web.CardPos[], number, number?]>)))
})

// ───────────────────────────────────────────────────────────────────────────
// 4. The graph: peaks, month ticks and the aggregate line
// ───────────────────────────────────────────────────────────────────────────

test('becoming/layout: peakIndexes, monthTicks, aggregate', () => {
  const peakSets: Array<[Array<{ index: number; altitude: number; isCurrent?: boolean }>]> = [
    [[]],
    [[{ index: 0, altitude: 0 }]],
    [[{ index: 0, altitude: 0 }, { index: 1, altitude: 1 }, { index: 2, altitude: 0.75 }, { index: 3, altitude: 1.5 }, { index: 4, altitude: 1.5, isCurrent: true }]],
    [[{ index: 0, altitude: 2 }, { index: 1, altitude: 1 }, { index: 2, altitude: 2 }, { index: 3, altitude: 2 + 1e-12 }]],
    ...WEEK_SETS.map(weeks => [weeks.map(w => ({ index: w.index, altitude: w.altitude, isCurrent: w.daysElapsed < 7 }))] as [Array<{ index: number; altitude: number; isCurrent?: boolean }>]),
  ]
  same('becoming/layout.peakIndexes', web.peakIndexes, core.peakIndexes, peakSets)

  const tickSets: Array<[Array<{ index: number; weekKey: string }>]> = [
    [[]],
    [[{ index: 0, weekKey: '2026-01-04' }]],
    [Array.from({ length: 52 }, (_, i) => ({ index: i, weekKey: sunday(i) }))],
    [Array.from({ length: 60 }, (_, i) => ({ index: i, weekKey: sunday(i, '2024-12-29') }))],
    [[{ index: 0, weekKey: '2025-12-28' }, { index: 1, weekKey: '2026-01-04' }, { index: 2, weekKey: '2026-02-01' }, { index: 3, weekKey: '2026-02-08' }]],
    // A collapsed gap re-numbers indexes; the tick follows the index it is given.
    [[{ index: 0, weekKey: '2026-03-01' }, { index: 1, weekKey: '2026-03-22' }, { index: 2, weekKey: '2026-05-03' }]],
  ]
  same('becoming/layout.monthTicks', web.monthTicks, core.monthTicks, tickSets)

  same('becoming/layout.aggregate', web.aggregate, core.aggregate,
    SNAPSHOT_SETS.flatMap(weeks => (['lbs', 'kg'] as const).map(unit => [weeks, unit] as [WeekSnapshot[], 'lbs' | 'kg'])))

  manifest('becoming/layout', web, core)
})

// ───────────────────────────────────────────────────────────────────────────
// 5. The copy names the file it was copied from
// ───────────────────────────────────────────────────────────────────────────

test('the copy declares its web source, and that source exists', () => {
  const REPO = path.join(__dirname, '../../../..')
  const copyPath = path.join(REPO, 'shared/core/src/becoming/layout.ts')
  assert.ok(fs.existsSync(copyPath), 'the copy is missing from shared/core/src/becoming/')
  const head = fs.readFileSync(copyPath, 'utf8').slice(0, 2000)
  const declared = /^\/\/ Source: (\S+)$/m.exec(head)?.[1]
  assert.equal(declared, 'webapp/lib/becoming/layout.ts', 'the copy must declare "// Source: webapp/lib/becoming/layout.ts" in its header')
  assert.ok(fs.existsSync(path.join(REPO, declared)), `${declared} no longer exists — the copy has become a fork`)
  assert.match(head, /A COPY\. DO NOT EDIT THIS FILE\./, 'the copy lost its "do not edit" header')
})

// ───────────────────────────────────────────────────────────────────────────
// 6. Does this test actually bite?
// ───────────────────────────────────────────────────────────────────────────

test('the comparator catches a copy that answers differently', () => {
  // A copy with one wrong answer in the branch nobody would notice: a hold
  // reading as a climb.
  const mutant = ((pos: web.CardPos[], current: number, row = 366) =>
    (web.exitEdge(pos, current, row) === 'right' ? 'up' : web.exitEdge(pos, current, row))) as typeof web.exitEdge
  const pos = web.layoutWeeks(WEEK_SETS[2], web.cardSize(390, 844))
  assert.throws(() => compare('mutant.exitEdge', web.exitEdge, mutant, [[pos, 1, 366]]), /DRIFT in mutant\.exitEdge/)
  // A changed constant.
  assert.throws(() => manifest('mutant', { OVERVIEW_MAX_SCALE: 0.5 }, { OVERVIEW_MAX_SCALE: 0.6 }), /mutant\.OVERVIEW_MAX_SCALE: the copied constant differs/)
  // A lost export, and an uncompared one.
  assert.throws(() => manifest('mutant', { a: 1, b: 2 }, { a: 1 }), /the copy's exports do not match/)
  assert.throws(() => manifest('mutant', { untested: () => 1 }, { untested: () => 1 }), /mutant\.untested is exported but no fixture compares it/)
})

test('the table is not hollow', () => {
  assert.ok(comparisons > 20_000, `only ${comparisons} comparisons ran — the fixture table has shrunk`)
  assert.equal(covered.size, 15, `${covered.size} exports were compared; the web module has 15 functions`)
})
