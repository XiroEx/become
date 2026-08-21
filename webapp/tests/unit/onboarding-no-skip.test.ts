// Run with: npx tsx --test tests/unit/onboarding-no-skip.test.ts
//
// "You should not be able to skip any of the onboarding (back & forth is
// fine)" — the wizard used to have a "Skip for now" link that called
// submit() with whatever partial profile existed and immediately marked
// onboardingCompleted: true, from any step including the very first one.
// That is gone. Free navigation between steps the member has already
// reached — Back, and the Review step's per-section Edit links — stays.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ONBOARDING = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8')

describe('the onboarding wizard cannot be skipped', () => {
  test('there is no "Skip for now" affordance', () => {
    assert.doesNotMatch(ONBOARDING, /Skip for now/)
  })

  test('submit() can no longer be called with a partial-profile override', () => {
    // The skip link used to call submit(profile) to short-circuit past
    // unfinished steps. Only the Finish button may call it now, with no args.
    assert.doesNotMatch(ONBOARDING, /submit\(profile\)/)
    assert.match(ONBOARDING, /async function submit\(\)/)
  })

  test('finishing still requires reaching the last step', () => {
    // The only submit() call site left is the Finish button, which only
    // renders once step === TOTAL_STEPS.
    const submitCalls = [...ONBOARDING.matchAll(/onClick=\{\(\) => submit\(\)\}/g)]
    assert.equal(submitCalls.length, 1)
    assert.match(ONBOARDING, /step < TOTAL_STEPS \? \(/)
    assert.match(ONBOARDING, /data-testid="onboarding-finish"/)
  })

  test('back-and-forth navigation is untouched', () => {
    // Back button, and the Review step's per-section Edit buttons.
    assert.match(ONBOARDING, /function goBack\(\)/)
    assert.match(ONBOARDING, /onClick=\{goBack\}/)
    assert.match(ONBOARDING, /function goToStep\(target: number\)/)
    assert.match(ONBOARDING, /onEdit=\{goToStep\}/)
  })
})
