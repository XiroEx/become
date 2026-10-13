import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  lbsToKg,
  kgToLbs,
  toKg,
  fromKg,
  roundWeight,
  displayWeight,
  ftInToCm,
  cmToFtIn,
  roundHeightCm,
} from '../src/bodyUnits'

describe('bodyUnits conversion', () => {
  it('converts exactly and round-trips', () => {
    assert.equal(lbsToKg(210), 210 / 2.20462)
    assert.equal(kgToLbs(95), 95 * 2.20462)
    assert.equal(Math.round(kgToLbs(lbsToKg(210))), 210)
    assert.equal(Math.round(kgToLbs(lbsToKg(185))), 185)
  })

  it('honours the member unit instead of assuming pounds', () => {
    assert.equal(toKg(95, 'kg'), 95)
    assert.equal(toKg(210, 'lbs'), 210 / 2.20462)
    assert.equal(toKg(210), 210 / 2.20462)
    assert.equal(fromKg(95, 'kg'), 95)
    assert.equal(Math.round(fromKg(95, 'lbs')), 209)
  })

  it('rounds only for display', () => {
    assert.equal(roundWeight(95.2543871), 95.3)
    assert.equal(displayWeight(95.2543871, 'lbs'), 210)
    assert.equal(displayWeight(95.2543871, 'kg'), 95.3)
  })

  it('never renders a height as 5\'12"', () => {
    // 182 cm is ~71.65 inches. Without rounding BEFORE splitting feet and
    // inches, 71.65 / 12 = 5 with 11.65 remainder → 5'12".
    assert.deepEqual(cmToFtIn(182), { ft: 6, inches: 0 })
    assert.deepEqual(cmToFtIn(180), { ft: 5, inches: 11 })
    assert.deepEqual(cmToFtIn(185), { ft: 6, inches: 1 })
  })

  it('converts height back and forth accurately', () => {
    const cm = ftInToCm(6, 0)
    assert.equal(cm, 72 * 2.54)
    assert.equal(roundHeightCm(cm), 183)
    assert.deepEqual(cmToFtIn(cm), { ft: 6, inches: 0 })
  })
})
