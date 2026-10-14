import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

import {
  bellCountLabel,
  bellMemoryKey,
  bellsFromPerformances,
  defaultBellCount,
  getBellWeightInfo,
  readBellCount,
  resolveBellCount,
  sanitizeBellCounts,
  showsBellTotal,
  type BellCount,
} from '../src/index'

// ONE DUMBBELL OR TWO (`ISetLog.bells`), the member's own answer.
//
// The rule shipped on the web first (webapp/lib/workout/bellCount.ts, #1986);
// `src/training/workout/bellCount.ts` is the COPY both apps run, so the native
// Live and Track views default, remember and hint off exactly the same answers.
// What this file pins is the half the native app depends on:
//
//   * ABSENT means the automatic per-exercise answer — never a stored default,
//     and never a migration of an older set;
//   * the "= X total" hint follows the choice, not the catalogue;
//   * the copy has not drifted from its web source (byte-for-byte after the
//     copy header — the re-copy procedure's own guarantee).
//
// The behaviour comparison against the web module itself lives in
// webapp/tests/unit/nativeParity/trainingModules.test.ts, which webapp CI runs
// on every PR (this job only runs when shared/ or expo/ changed).

const DB_PAIR = getBellWeightInfo({ name: 'Dumbbell Bench Press', equipment: ['dumbbell'] })
const DB_SINGLE = getBellWeightInfo({
  name: 'Single-Arm Dumbbell Row',
  equipment: ['dumbbell'],
  laterality: 'unilateral',
})
const KB_SINGLE = getBellWeightInfo({ name: 'Goblet Squat', equipment: ['kettlebell'] })
const BARBELL = getBellWeightInfo({ name: 'Barbell Back Squat', equipment: ['barbell'] })

describe('bellCount — one dumbbell or two', () => {
  it('reads 1 and 2 (numbers or strings) and nothing else', () => {
    assert.equal(readBellCount(1), 1)
    assert.equal(readBellCount(2), 2)
    assert.equal(readBellCount('1'), 1)
    assert.equal(readBellCount('2'), 2)
    for (const junk of [0, 3, 1.5, -1, '', 'two', null, undefined, NaN, {}, [1]]) {
      assert.equal(readBellCount(junk), undefined, `${JSON.stringify(junk)} must read as absent`)
    }
  })

  it("defaults to today's automatic answer, so ignoring the control changes nothing", () => {
    assert.equal(defaultBellCount(DB_PAIR), 2)
    assert.equal(defaultBellCount(DB_SINGLE), 1)
    assert.equal(defaultBellCount(KB_SINGLE), 1)
    assert.equal(defaultBellCount(BARBELL), 1)
  })

  it('prefers this session, then last time, then the automatic answer', () => {
    // The member's pick wins over the remembered one…
    assert.equal(resolveBellCount(DB_PAIR, 1, 2), 1)
    // …the remembered one wins over the automatic answer…
    assert.equal(resolveBellCount(DB_PAIR, undefined, 1), 1)
    assert.equal(resolveBellCount(DB_SINGLE, undefined, 2), 2)
    // …and nothing recorded leaves the automatic answer standing.
    assert.equal(resolveBellCount(DB_PAIR, undefined, undefined), 2)
    assert.equal(resolveBellCount(KB_SINGLE, null, 'nonsense'), 1)
  })

  it('shows the combined total only for bell work loaded with TWO', () => {
    assert.equal(showsBellTotal(DB_PAIR, 2), true)
    assert.equal(showsBellTotal(DB_PAIR, 1), false)
    assert.equal(showsBellTotal(KB_SINGLE, 2), true)
    assert.equal(showsBellTotal(KB_SINGLE, 1), false)
    // A barbell/machine/bodyweight exercise is never asked the question.
    assert.equal(showsBellTotal(BARBELL, 2), false)
  })

  it('labels the choice by implement', () => {
    assert.equal(bellCountLabel(DB_PAIR, 1), '1 DB')
    assert.equal(bellCountLabel(DB_PAIR, 2), '2 DB')
    assert.equal(bellCountLabel(KB_SINGLE, 1), '1 KB')
    assert.equal(bellCountLabel(KB_SINGLE, 2), '2 KB')
  })

  it('remembers per exercise under the slug last-performance answers with', () => {
    assert.equal(bellMemoryKey({ exerciseSlug: 'Dumbbell-Bench-Press' }), 'dumbbell-bench-press')
    assert.equal(bellMemoryKey({ name: 'Single-Arm DB Row (heavy)' }), 'single-arm-db-row-heavy')
    assert.equal(bellMemoryKey(null), '')

    const remembered = bellsFromPerformances({
      'dumbbell-bench-press': { bells: 1 },
      'dumbbell-fly': { bells: 2 },
      // A legacy set, a barbell lift, a junk value: all LEFT OUT, so the
      // caller falls back to the automatic answer instead of inventing one.
      'back-squat': {},
      'goblet-squat': { bells: null },
      nothing: null,
      junk: { bells: 7 },
    })
    assert.deepEqual(remembered, { 'dumbbell-bench-press': 1, 'dumbbell-fly': 2 })
  })

  it('keeps `bells` on a set only when it is 1 or 2', () => {
    const [exercise] = sanitizeBellCounts([
      {
        sets: [
          { setNumber: 1, bells: 1 as BellCount },
          { setNumber: 2, bells: 2 as BellCount },
          { setNumber: 3 },
          { setNumber: 4, bells: 7 as unknown as BellCount },
        ],
      },
    ])
    assert.deepEqual(exercise?.sets, [
      { setNumber: 1, bells: 1 },
      { setNumber: 2, bells: 2 },
      { setNumber: 3 },
      { setNumber: 4 },
    ])
  })

  it('drift test: the copy still matches webapp/lib/workout/bellCount.ts', () => {
    const copyPath = path.resolve(HERE, '../src/training/workout/bellCount.ts')
    const webPath = path.resolve(HERE, '../../../webapp/lib/workout/bellCount.ts')
    assert.ok(fs.existsSync(webPath), 'the web source must exist — the copy is not the original')

    const copy = fs.readFileSync(copyPath, 'utf8')
    const web = fs.readFileSync(webPath, 'utf8')
    assert.match(copy, /A COPY\. DO NOT EDIT THIS FILE\./)
    assert.match(copy, /^\/\/ Source: webapp\/lib\/workout\/bellCount\.ts$/m)
    // Everything after the copy header is the web file, unchanged: the re-copy
    // procedure (expo/README.md) is an overwrite, so this is what it produces.
    const marker = '// ──────────────────────────────────────────────────────────────────────────\n'
    const body = copy.slice(copy.indexOf(marker) + marker.length).trimStart()
    assert.equal(
      body,
      web.trimStart(),
      'the copy has drifted from webapp/lib/workout/bellCount.ts — re-copy the web file, never edit the copy',
    )
  })
})
