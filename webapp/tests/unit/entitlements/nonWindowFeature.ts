// Compile-time half of "requireAiFeature cannot be handed a feature that spends
// a unit" (tests/unit/entitlements/mindVisionGates.test.ts).
//
// Not a .test.ts: there is nothing to run. tsc type-checks it with the rest of
// the project, so the @ts-expect-error lines below FAIL THE BUILD if the type
// ever widens back to Feature — which is the only way a windowed allowance
// could be charged with nothing able to refund it.

import type { NonWindowFeature } from '../../../lib/ai/allowance'

// Countable or binary: safe to ask, nothing is spent.
const milestone: NonWindowFeature = 'mind-sessions'
const binary: NonWindowFeature = 'vision'
const inventory: NonWindowFeature = 'custom-exercises'

// Windowed: asking IS charging. These must not compile.
// @ts-expect-error 'ai-food-estimate' is a windowed allowance
const daily: NonWindowFeature = 'ai-food-estimate'
// @ts-expect-error 'workout-generation' is a windowed allowance
const weekly: NonWindowFeature = 'workout-generation'

export const _pin = [milestone, binary, inventory, daily, weekly]
