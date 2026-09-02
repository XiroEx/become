// Run with: npx tsx --test tests/unit/allowance/followUpTicket.test.ts
//
// THE CLIENT HALF OF THE FOLLOW-UP, EXERCISED RATHER THAN GREPPED.
//
// The estimate routes mint a signed follow-up ticket and return it in the
// success body (`allowance.ticket`), and they read it back as
// `body.allowanceTicket`. For a while that was the whole story: the server end
// was complete, tested, and unreachable. runStore threw the body's `allowance`
// away, so no client ever sent a ticket, and lib/allowanceTicket.ts,
// consumeFollowUp() and FOLLOW_UP_LIMITS were dead code.
//
// The consequence only appears when ENTITLEMENTS_ENFORCED flips: a free member
// gets one plate estimate a day, and their FIRST correction — "it was 6 tacos,
// not 3" — is refused with an upgrade sheet. That is the outcome
// lib/allowances.ts calls "a broken product rather than a paywall".
//
// A source scan could not have caught it (every individual file looked right),
// so this drives the real chain with a stubbed fetch:
//
//   POST body `allowance.ticket`
//     → runStore.start (captures it on the record)
//       → runAiTask (carries it on AiTaskResult)
//         → plateEstimator (hands it out on the estimate)
//           → the correction POST (sends it back as `allowanceTicket`)

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { plateEstimator } from '../../../lib/nutrition/aiEngine'

const IMAGE = 'data:image/jpeg;base64,AAAA'
const CTX = { userId: '' }

const ESTIMATE = {
  items: [{ name: 'Tacos', estimatedServing: '3 tacos', nutrition: { calories: 600, protein: 30, carbs: 50, fats: 30 }, confidence: 0.7 }],
  total: { calories: 600, protein: 30, carbs: 50, fats: 30 },
}

interface Call { url: string; body: Record<string, unknown> }

/**
 * Stand in for the network. Every route answers INLINE (no runId), so the
 * store files a terminal record immediately and nothing polls — the ticket
 * rides the POST body either way, which is the point being tested.
 */
function stubFetch(responder: (call: Call, n: number) => unknown) {
  const calls: Call[] = []
  const original = globalThis.fetch
  globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
    const call: Call = {
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    }
    calls.push(call)
    const payload = responder(call, calls.length)
    return { status: 200, ok: true, json: async () => payload } as unknown as Response
  }) as unknown as typeof fetch
  return { calls, restore: () => { globalThis.fetch = original } }
}

const withTicket = (ticket: string) => ({ ok: true, result: ESTIMATE, allowance: { ticket } })

// ─── The round trip ──────────────────────────────────────────────────────────

test('the ticket minted for an estimate comes back out of the estimator', async () => {
  const net = stubFetch(() => withTicket('TICKET-A'))
  try {
    const est = await plateEstimator.estimate(IMAGE, CTX)
    assert.equal(est.allowanceTicket, 'TICKET-A')
    assert.deepEqual(est.items, ESTIMATE.items, 'the estimate itself must be untouched')
  } finally {
    net.restore()
  }
})

test('a FRESH estimate sends no ticket', async () => {
  // Attaching the last ticket to every call is the same leak pointed the other
  // way: a genuinely new scan would ride the previous one's charge.
  const net = stubFetch(() => withTicket('TICKET-A'))
  try {
    await plateEstimator.estimate(IMAGE, CTX)
    assert.equal(net.calls.length, 1)
    assert.equal(net.calls[0].body.allowanceTicket, undefined)
  } finally {
    net.restore()
  }
})

test('a photo correction presents the ticket of the estimate it refines', async () => {
  const net = stubFetch((_c, n) => withTicket(`TICKET-${n}`))
  try {
    const est = await plateEstimator.estimate(IMAGE, CTX)
    await plateEstimator.estimate(IMAGE, CTX, 'it was 6 tacos, not 3', est.allowanceTicket)

    assert.equal(net.calls.length, 2)
    assert.equal(net.calls[1].url, '/api/ai/nutrition/plate')
    assert.equal(
      net.calls[1].body.allowanceTicket,
      'TICKET-1',
      'without this the correction is charged as a second scan and refused',
    )
    assert.equal(net.calls[1].body.note, 'it was 6 tacos, not 3')
  } finally {
    net.restore()
  }
})

test('a text correction presents it too', async () => {
  const net = stubFetch((_c, n) => withTicket(`TICKET-${n}`))
  try {
    const est = await plateEstimator.estimateFromText({ description: 'three tacos' }, CTX)
    await plateEstimator.estimateFromText(
      { priorEstimate: ESTIMATE.items, correction: 'six, not three', allowanceTicket: est.allowanceTicket },
      CTX,
    )

    assert.equal(net.calls.length, 2)
    assert.equal(net.calls[1].url, '/api/ai/nutrition/describe')
    assert.equal(net.calls[1].body.allowanceTicket, 'TICKET-1')
    assert.equal(net.calls[1].body.correction, 'six, not three')
  } finally {
    net.restore()
  }
})

test('a correction is itself ticketed, so the second correction is a follow-up as well', async () => {
  const net = stubFetch((_c, n) => withTicket(`TICKET-${n}`))
  try {
    const first = await plateEstimator.estimate(IMAGE, CTX)
    const corrected = await plateEstimator.estimate(IMAGE, CTX, 'six', first.allowanceTicket)
    assert.equal(corrected.allowanceTicket, 'TICKET-2')

    await plateEstimator.estimate(IMAGE, CTX, 'seven', corrected.allowanceTicket)
    assert.equal(net.calls[2].body.allowanceTicket, 'TICKET-2')
  } finally {
    net.restore()
  }
})

test('an uncapped member gets no ticket and nothing breaks', async () => {
  // Plus and admin are never issued one — there is nothing for a follow-up to
  // ride. The correction must still go out, just without the field.
  const net = stubFetch(() => ({ ok: true, result: ESTIMATE }))
  try {
    const est = await plateEstimator.estimate(IMAGE, CTX)
    assert.equal(est.allowanceTicket, undefined)

    await plateEstimator.estimate(IMAGE, CTX, 'six', est.allowanceTicket)
    assert.equal(net.calls.length, 2)
    assert.ok(!('allowanceTicket' in net.calls[1].body), 'an absent ticket must not be sent as undefined')
  } finally {
    net.restore()
  }
})

// ─── The surface that actually does the correcting ───────────────────────────

test('SnapPlateModal keeps the estimate ticket and sends it on the correction', async () => {
  // The round trip above proves the seam works; this pins the one caller that
  // uses it, on both correction branches (photo re-run and text refine).
  const fs = await import('node:fs')
  const path = await import('node:path')
  const src = fs.readFileSync(
    path.join(__dirname, '../../..', 'components/nutrition/SnapPlateModal.tsx'),
    'utf8',
  )

  assert.match(src, /allowanceTicketRef/, 'the modal must retain the ticket between estimate and correction')
  assert.match(
    src,
    /allowanceTicketRef\.current = estimate\.allowanceTicket/,
    'a fresh estimate must record its own ticket',
  )

  const correct = src.slice(src.indexOf('const handleCorrect'))
  assert.match(correct, /plateEstimator\.estimate\(imageThumb, \{ userId: '' \}, c, ticket\)/)
  assert.match(correct, /allowanceTicket: ticket/)

  // And a NEW estimate must drop the old ticket rather than inherit it.
  const runEstimate = src.slice(src.indexOf('const runEstimate'), src.indexOf('const handleDescribe'))
  assert.match(runEstimate, /allowanceTicketRef\.current = undefined/)
})
