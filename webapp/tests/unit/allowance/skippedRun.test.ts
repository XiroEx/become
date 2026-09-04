// Run with: npx tsx --test tests/unit/allowance/skippedRun.test.ts
//
// AN ALLOWANCE UNIT IS SPENT ON A GENERATION THAT RAN.
//
// triggerOwnedRun reports success when the WEBHOOK accepts the run, which is
// not the same thing as the run happening. The become-ai automation is
// single-flight: an overlapping run is reaped by the worker 12-22ms later with
//
//   status         'error'
//   error          '[worker:concurrency-skip] Run skipped: automation already running'
//   nodesExecuted  0
//   executionPath  []
//
// The route's refund only fired on `ok: false`, so a free member could burn all
// three weekly generations and receive nothing — three 200s, three runIds,
// three runs that never executed a node.
//
// The rule this pins is narrow ON PURPOSE. A run that STARTED and then failed
// stays non-refundable: the graph ran, and "it didn't work" is a claim only the
// client can make. A concurrency-skip is distinguishable without asking the
// client, and that is the only thing refunded here.

process.env.BECOME_AI_READBACK_TOKEN ||= 'test-readback-token'
process.env.BECOME_AI_BASE_URL ||= 'https://example.invalid'

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isSkippedRun, fetchBecomeRun } from '../../../lib/ai/becomeGraph'
import { refundIfSkipped, type SkipRefundDeps } from '../../../lib/ai/runCharge'

const SKIP_ERROR = '[worker:concurrency-skip] Run skipped: automation already running'

// ─── Telling a skipped run from a failed one ─────────────────────────────────

test('the worker naming the skip is enough', () => {
  assert.equal(isSkippedRun({ status: 'error', error: SKIP_ERROR }), true)
})

test('zero nodes and an empty path is enough', () => {
  assert.equal(
    isSkippedRun({ status: 'error', error: 'something else', nodesExecuted: 0, executionPath: [] }),
    true,
  )
})

test('a run that EXECUTED and then failed is never refundable', () => {
  assert.equal(
    isSkippedRun({ status: 'error', error: 'model timeout', nodesExecuted: 3, executionPath: ['a', 'b', 'c'] }),
    false,
  )
  assert.equal(
    isSkippedRun({ status: 'failed', error: 'unparseable_model_output', nodesExecuted: 1, executionPath: ['run'] }),
    false,
  )
})

test('a MISSING signal never reads as skipped', () => {
  // Fail closed: if the platform stops reporting these fields we over-charge,
  // which is recoverable. Refunding on silence is not.
  assert.equal(isSkippedRun({ status: 'error' }), false)
  assert.equal(isSkippedRun({ status: 'error', nodesExecuted: 0 }), false)
  assert.equal(isSkippedRun({ status: 'error', executionPath: [] }), false)
  assert.equal(isSkippedRun({ status: 'cancelled' }), false)
})

test('a completed run is not a skipped run, whatever else it says', () => {
  assert.equal(isSkippedRun({ status: 'completed', nodesExecuted: 0, executionPath: [] }), false)
})

// ─── The snapshot the poll route acts on ─────────────────────────────────────

function stubFetch(payload: unknown) {
  const original = globalThis.fetch
  globalThis.fetch = (async () =>
    ({ ok: true, status: 200, json: async () => payload }) as unknown as Response) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

test('fetchBecomeRun flags a skipped run, and only a skipped run', async () => {
  let restore = stubFetch({ status: 'error', error: SKIP_ERROR, nodesExecuted: 0, executionPath: [] })
  try {
    const snap = await fetchBecomeRun('RUN-1')
    assert.equal(snap.status, 'failed')
    assert.equal(snap.skipped, true)
    assert.equal(snap.error, 'run_skipped')
  } finally {
    restore()
  }

  restore = stubFetch({ status: 'error', error: 'model exploded', nodesExecuted: 2, executionPath: ['a', 'b'] })
  try {
    const snap = await fetchBecomeRun('RUN-2')
    assert.equal(snap.status, 'failed')
    assert.equal(snap.skipped, undefined, 'a run that ran is not refunded')
  } finally {
    restore()
  }
})

test('a run still in flight is never mistaken for a skip', async () => {
  const restore = stubFetch({ status: 'running' })
  try {
    const snap = await fetchBecomeRun('RUN-3')
    assert.equal(snap.status, 'pending')
    assert.equal(snap.skipped, undefined)
  } finally {
    restore()
  }
})

// ─── Giving the unit back, exactly once ──────────────────────────────────────

function fakeCharges(initial: Record<string, string | null>) {
  const claimed = new Set<string>()
  const refunds: string[] = []
  const deps: SkipRefundDeps = {
    async claimTicket(runId) {
      // Models the conditional update: the ticket is readable once.
      if (claimed.has(runId)) return null
      const t = initial[runId]
      if (!t) return null
      claimed.add(runId)
      return t
    },
    async refund(ticketId) {
      refunds.push(ticketId)
    },
  }
  return { deps, refunds }
}

test('the unit comes back for a skipped run', async () => {
  const c = fakeCharges({ 'RUN-1': 'ledger-ticket-1' })
  assert.equal(await refundIfSkipped('RUN-1', 'u1', c.deps), true)
  assert.deepEqual(c.refunds, ['ledger-ticket-1'])
})

test('two polls landing together refund once', async () => {
  // The client polls every 2s and several tabs can poll the same run.
  const c = fakeCharges({ 'RUN-1': 'ledger-ticket-1' })
  const [a, b] = await Promise.all([
    refundIfSkipped('RUN-1', 'u1', c.deps),
    refundIfSkipped('RUN-1', 'u1', c.deps),
  ])
  assert.equal([a, b].filter(Boolean).length, 1)
  assert.deepEqual(c.refunds, ['ledger-ticket-1'])

  // And a poll an hour later finds nothing left to claim.
  assert.equal(await refundIfSkipped('RUN-1', 'u1', c.deps), false)
  assert.equal(c.refunds.length, 1)
})

test('a run with no charge bound to it refunds nothing', async () => {
  // An uncapped member, or a run triggered before the binding existed.
  const c = fakeCharges({ 'RUN-1': null })
  assert.equal(await refundIfSkipped('RUN-1', 'u1', c.deps), false)
  assert.deepEqual(c.refunds, [])
})

test('a store failure is swallowed — the poll must still answer', async () => {
  const deps: SkipRefundDeps = {
    async claimTicket() {
      throw new Error('mongo is down')
    },
    async refund() {},
  }
  assert.equal(await refundIfSkipped('RUN-1', 'u1', deps), false)
})

// ─── Where it is wired in ────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

test('the poll route refunds ONLY on the skipped branch, and still never charges', () => {
  const src = read('app/api/ai/run/[runId]/route.ts')
  assert.match(src, /if \(snap\.skipped\) await refundIfSkipped\(runId, gate\.user\.userId\)/)
  assert.ok(
    !/requireAiAllowance|requireSpendCap|consumeAllowance/.test(src),
    'the poll endpoint is hit ~90 times per run — it may give back, never take',
  )
  // Ownership is proved before the run is even read, so a refund can only ever
  // credit the member whose run it is.
  assert.ok(src.indexOf('userOwnsRun') < src.indexOf('refundIfSkipped'))
})

test('the charge is bound to the run at the moment both exist', () => {
  const src = read('lib/ai/allowance.ts')
  assert.match(src, /bindCharge\(\{ runId, userId: ctx\.userId, ticketId: ctx\.ticketId \}\)/)
  // A route hands the runId over by returning it in the body; if that stops
  // being awaited, nothing is bound and nothing can be refunded.
  for (const file of [
    'app/api/ai/workout/session/route.ts',
    'app/api/ai/workout/program/route.ts',
    'app/api/ai/workout/import/route.ts',
    'app/api/ai/nutrition/plate/route.ts',
    'app/api/ai/nutrition/describe/route.ts',
    'app/api/ai/nutrition/product/route.ts',
  ]) {
    assert.match(read(file), /await withAllowance\(/, `${file} must await the seal`)
  }
})
