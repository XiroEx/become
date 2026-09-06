// Run with: npm run test:file tests/unit/entitlements/aiGateThreading.test.ts
//
// The subtlest failure in this whole area, and the reason it gets its own file.
//
// Every nutrition AI call goes through the durable run store, which used to
// throw away `res.status` and read a 403 as "no runId, not ok" — filing it as a
// generic fallback. The member was then told "Couldn't reach the food AI",
// which is a lie: nothing was wrong with the service, they had simply used
// today's free scan. They would retry, and retry.
//
// Nothing in the type system stops that regression, because dropping the status
// again still compiles and still "works". So the chain is asserted end to end:
//   runStore (captures status + gate)
//     → runClient (carries `gate` on AiTaskResult)
//       → aiEngine (throws EntitlementRequiredError BEFORE PlateUnavailableError)
//         → SnapPlateModal (handles it in BOTH catch blocks)
//
// Pure source scans: these modules touch localStorage, fetch and React, and the
// property under test is structural, not behavioural.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

// ─── runStore ────────────────────────────────────────────────────────────────

test('runStore captures the POST status instead of discarding it', () => {
  const src = readSource('lib/ai/runStore.ts')
  assert.match(
    src,
    /httpStatus\s*=\s*res\.status/,
    'start() must record res.status — a 403 is indistinguishable from a fallback without it',
  )
  assert.match(src, /httpStatus\?:\s*number/, 'RunRecord must declare httpStatus')
  assert.match(src, /gate\?:\s*GatePayload/, 'RunRecord must declare the gate payload')
})

test('runStore files a refused run as an entitlement error, silently', () => {
  const src = readSource('lib/ai/runStore.ts')
  assert.match(src, /gateFrom\(httpStatus,\s*started\)/, 'must parse the 403 body into a gate')

  const at = src.indexOf('gateFrom(httpStatus')
  assert.ok(at > 0)
  const branch = src.slice(at, at + 600)
  assert.match(branch, /error:\s*'entitlement'/, "the record's error must be 'entitlement'")
  // silent, or the global "generating…" indicator flashes for a run that never
  // started.
  assert.match(branch, /silent:\s*true/, 'a refused run must not show in the activity indicator')
})

// ─── runClient ───────────────────────────────────────────────────────────────

test('runAiTask carries the gate through to its caller', () => {
  const src = readSource('lib/ai/runClient.ts')
  assert.match(src, /gate\?:\s*GatePayload/, 'AiTaskResult must declare gate')
  assert.match(src, /gate:\s*rec\.gate/, 'runAiTask must pass the stored gate through')
})

// ─── aiEngine ────────────────────────────────────────────────────────────────

test('aiEngine exports the entitlement sentinel', () => {
  const src = readSource('lib/nutrition/aiEngine.ts')
  assert.match(src, /export class EntitlementRequiredError extends Error/)
  assert.match(src, /readonly gate: GatePayload/, 'the sentinel must carry the payload')
})

test('both estimator methods check the gate BEFORE PlateUnavailableError', () => {
  const src = readSource('lib/nutrition/aiEngine.ts')
  const entitlementChecks = src.match(/r\.error === 'entitlement'/g) ?? []
  assert.equal(
    entitlementChecks.length,
    2,
    'estimate() and estimateFromText() must each check for a gate',
  )

  // Order matters: PlateUnavailableError is the catch-all for "nothing usable
  // came back", so a gate check placed after it is dead code.
  for (const method of ['estimate(', 'estimateFromText(']) {
    const start = src.indexOf(method)
    assert.ok(start > 0, `${method} not found`)
    const body = src.slice(start, src.indexOf('}', src.indexOf('PlateUnavailableError', start)))
    const gateAt = body.indexOf("r.error === 'entitlement'")
    const unavailableAt = body.indexOf('throw new PlateUnavailableError')
    assert.ok(gateAt >= 0, `${method} must check for a gate`)
    assert.ok(
      gateAt < unavailableAt,
      `${method} checks the gate AFTER throwing PlateUnavailableError — the check is unreachable`,
    )
  }
})

// ─── SnapPlateModal ──────────────────────────────────────────────────────────

test('SnapPlateModal handles the sentinel on both the estimate and correction paths', () => {
  const src = readSource('components/nutrition/SnapPlateModal.tsx')
  const handled = src.match(/err instanceof EntitlementRequiredError/g) ?? []
  assert.equal(
    handled.length,
    2,
    'runEstimate and handleCorrect must both branch on the sentinel',
  )
  assert.match(src, /import UpgradeSheet from '@\/components\/UpgradeSheet'/)
  assert.match(src, /<UpgradeSheet/, 'the sheet must actually be mounted')
})

test('a refused CORRECTION keeps the estimate it was refining', () => {
  // Losing a whole estimate because the refinement was refused would cost the
  // member work they already paid an allowance for.
  const src = readSource('components/nutrition/SnapPlateModal.tsx')
  const at = src.indexOf('err instanceof EntitlementRequiredError', src.indexOf('handleCorrect'))
  assert.ok(at > 0)
  const branch = src.slice(at, at + 400)
  assert.match(branch, /phase:\s*'review'/, 'must return to review, not discard the items')
  assert.match(branch, /items:\s*priorItems/)
})
