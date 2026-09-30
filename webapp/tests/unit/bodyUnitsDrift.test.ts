// Run with: npm run test:file tests/unit/bodyUnitsDrift.test.ts
//
// Lockstep drift test for body units and pace modules (NP-017 / NP-048).
//
// Shared pure domain logic lives in `@become/core` (`shared/core/src/`), imported by
// `expo/` through Metro and eventually by `webapp/` once published.
// Today, the webapp maintains its own source files under `webapp/lib/` to satisfy
// isolated Docker build contexts.
//
// This test asserts that `bodyUnits.ts` and `goals/pace.ts` in `shared/core/src/` are
// strictly in lockstep with their web sources in `webapp/lib/`. If any web module is
// modified without syncing the copy, this test fails the CI job.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import * as webBodyUnits from '../../lib/bodyUnits'
import * as sharedBodyUnits from '../../../shared/core/src/bodyUnits'
import * as webPace from '../../lib/goals/pace'
import * as sharedPace from '../../../shared/core/src/goals/pace'

const WEBAPP_LIB = path.resolve(__dirname, '../../lib')
const SHARED_CORE_SRC = path.resolve(__dirname, '../../../shared/core/src')

interface ModuleSpec {
  name: string
  webRelative: string
  sharedRelative: string
  rewrite: (src: string) => string
}

export const BODY_MODULES: ModuleSpec[] = [
  {
    name: 'bodyUnits',
    webRelative: 'bodyUnits.ts',
    sharedRelative: 'bodyUnits.ts',
    rewrite: s => s,
  },
  {
    name: 'goals/pace',
    webRelative: 'goals/pace.ts',
    sharedRelative: 'goals/pace.ts',
    rewrite: s => s,
  },
]

describe('bodyUnits lockstep drift (NP-017 / NP-048)', () => {
  it('covers bodyUnits and goals/pace modules', () => {
    assert.equal(BODY_MODULES.length, 2)
  })

  for (const mod of BODY_MODULES) {
    it(`fails if ${mod.name} in shared/core differs from its web source`, () => {
      const webPath = path.join(WEBAPP_LIB, mod.webRelative)
      const sharedPath = path.join(SHARED_CORE_SRC, mod.sharedRelative)

      assert.ok(fs.existsSync(webPath), `Web source missing: ${webPath}`)
      assert.ok(fs.existsSync(sharedPath), `Shared core copy missing: ${sharedPath}`)

      const webContent = fs.readFileSync(webPath, 'utf8')
      const sharedContent = fs.readFileSync(sharedPath, 'utf8')
      const expectedShared = mod.rewrite(webContent)

      assert.equal(
        sharedContent,
        expectedShared,
        `Lockstep drift detected in ${mod.name}!`
      )
    })

    it(`${mod.name} in webapp does not import from @become/core or ../shared`, () => {
      const webPath = path.join(WEBAPP_LIB, mod.webRelative)
      const content = fs.readFileSync(webPath, 'utf8')
      assert.doesNotMatch(content, /from\s+['"]@become\/core/)
      assert.doesNotMatch(content, /from\s+['"]\.\.\/shared/)
    })
  }

  it('fails when any synthetic modification is introduced into a web source', () => {
    const mod = BODY_MODULES[0]!
    const webPath = path.join(WEBAPP_LIB, mod.webRelative)
    const webContent = fs.readFileSync(webPath, 'utf8')
    const driftedContent = webContent + '\n// drifted change\n'
    const expected = mod.rewrite(driftedContent)
    const sharedContent = fs.readFileSync(path.join(SHARED_CORE_SRC, mod.sharedRelative), 'utf8')

    assert.notEqual(
      sharedContent,
      expected,
      'Drift check must catch differences between web source and shared core'
    )
  })

  it('verifies exact behavioral parity on conversions and rounding (NP-048 e015c7af)', () => {
    // Test conversion values from webapp/shared/core
    const testWeights = [100, 150, 180, 182.5, 200, 210, 220.462, 250]
    for (const w of testWeights) {
      assert.equal(webBodyUnits.lbsToKg(w), sharedBodyUnits.lbsToKg(w))
      assert.equal(webBodyUnits.kgToLbs(w), sharedBodyUnits.kgToLbs(w))
      assert.equal(webBodyUnits.toKg(w, 'lbs'), sharedBodyUnits.toKg(w, 'lbs'))
      assert.equal(webBodyUnits.toKg(w, 'kg'), sharedBodyUnits.toKg(w, 'kg'))
      assert.equal(webBodyUnits.fromKg(w, 'lbs'), sharedBodyUnits.fromKg(w, 'lbs'))
      assert.equal(webBodyUnits.fromKg(w, 'kg'), sharedBodyUnits.fromKg(w, 'kg'))
      assert.equal(webBodyUnits.displayWeight(w, 'lbs'), sharedBodyUnits.displayWeight(w, 'lbs'))
      assert.equal(webBodyUnits.displayWeight(w, 'kg'), sharedBodyUnits.displayWeight(w, 'kg'))
      assert.equal(webBodyUnits.roundWeight(w), sharedBodyUnits.roundWeight(w))
    }

    const testHeightsCm = [150, 160, 175, 180, 182, 182.88, 185, 200]
    for (const cm of testHeightsCm) {
      assert.deepEqual(webBodyUnits.cmToFtIn(cm), sharedBodyUnits.cmToFtIn(cm))
      assert.equal(webBodyUnits.roundHeightCm(cm), sharedBodyUnits.roundHeightCm(cm))
    }

    for (let ft = 4; ft <= 7; ft++) {
      for (let inch = 0; inch < 12; inch++) {
        assert.equal(webBodyUnits.ftInToCm(ft, inch), sharedBodyUnits.ftInToCm(ft, inch))
      }
    }

    // Pace parity
    assert.equal(webPace.defaultPaceKg('lose'), sharedPace.defaultPaceKg('lose'))
    assert.equal(webPace.defaultPaceKg('gain'), sharedPace.defaultPaceKg('gain'))
    assert.equal(webPace.defaultPaceKg('maintain'), sharedPace.defaultPaceKg('maintain'))
    assert.deepEqual(webPace.PACE_OPTIONS_LB, sharedPace.PACE_OPTIONS_LB)
    assert.deepEqual(webPace.PACE_OPTIONS_KG, sharedPace.PACE_OPTIONS_KG)
    assert.equal(webPace.etaWeeks(90, 80, 0.5), sharedPace.etaWeeks(90, 80, 0.5))
    assert.equal(webPace.formatEta(3.2), sharedPace.formatEta(3.2))
    assert.equal(webPace.formatEta(0.4), sharedPace.formatEta(0.4))
    assert.equal(webPace.formatEta(0), sharedPace.formatEta(0))
  })
})
