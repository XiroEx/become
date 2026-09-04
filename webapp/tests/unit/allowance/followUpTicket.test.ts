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

// ─── The server half: what a ticket is actually bound to ─────────────────────
//
// The client chain above proves a ticket travels. It says nothing about what
// the ticket MEANS, and that was the hole: a ticket claimed only
// (userId, feature, bucketKey), so the server could not tell a correction from
// a brand-new scan. Proven on production — after the daily allowance was spent,
// replaying a genuine ticket with a COMPLETELY unrelated description and no
// prior estimate returned 200, and every success minted the next ticket, so one
// charge chained into ~6 extra estimates on a limit of 1.
//
// A ticket now names the RUN it paid for, that run is verified to be one we
// dispatched for this member, it is spent exactly once, and the ROUTE has to
// say the request is shaped like a refinement at all.

import { mintAllowanceTicket, readAllowanceTicket } from '../../../lib/allowanceTicket'
import { resolveFollowUp, sealOutcome, withAllowance, type AiAllowanceOk } from '../../../lib/ai/allowance'
import { FOLLOW_UP_LIMITS, __clearTzCache, __primeTzCache, windowBucket } from '../../../lib/allowances'
import type { AllowanceLedger, WindowAnchor } from '../../../lib/allowanceLedger'
import type { RunChargeStore, FollowUpClaim } from '../../../lib/ai/runCharge'
import jwt from 'jsonwebtoken'

const USER = '65f0000000000000000000aa'
const OTHER = '65f0000000000000000000bb'
const SECRET = process.env.JWT_SECRET as string

/** No anchor, no database: the bucket is whatever the primed offset says. */
const noLedger: AllowanceLedger = {
  async charge() {
    throw new Error('not used')
  },
  async read() {
    return null
  },
  async giveBack() {},
  async latest(): Promise<WindowAnchor | null> {
    return null
  },
}

function fakeStore(opts: { accept?: boolean } = {}) {
  const claims: FollowUpClaim[] = []
  const bindings: Array<{ runId: string; userId: string; ticketId: string }> = []
  const released: Array<{ runId: string; jti: string }> = []
  const spent = new Map<string, string>()
  const store: RunChargeStore = {
    async claimFollowUp(input) {
      claims.push(input)
      if (opts.accept === false) return false
      // Models the real one: a run is refined once.
      if (spent.has(input.runId)) return false
      spent.set(input.runId, input.jti)
      return true
    },
    async releaseFollowUp(input) {
      released.push(input)
      if (spent.get(input.runId) === input.jti) spent.delete(input.runId)
    },
    async bindCharge(input) {
      bindings.push(input)
    },
  }
  return { store, claims, bindings, released }
}

function currentBucket(tz = 0): string {
  return windowBucket('day', tz).key as string
}

async function ticketFor(over: Partial<Parameters<typeof mintAllowanceTicket>[0]> = {}) {
  return (await mintAllowanceTicket({
    userId: USER,
    feature: 'ai-food-estimate',
    bucketKey: currentBucket(),
    runId: 'RUN-1',
    rootRunId: 'RUN-1',
    seq: 1,
    ...over,
  })) as string
}

function primeUser() {
  __clearTzCache()
  __primeTzCache(USER, 0)
  __primeTzCache(OTHER, 0)
}

const opts = (over: object) => ({ ledger: noLedger, ...over })

test('a genuine correction redeems, and carries the chain forward', async () => {
  primeUser()
  const s = fakeStore()
  const chain = await resolveFollowUp(
    USER,
    'ai-food-estimate',
    opts({ followUpTicket: await ticketFor(), refines: true, store: s.store }),
  )
  assert.equal(chain?.rootRunId, 'RUN-1')
  assert.equal(chain?.nextSeq, 2)
  assert.equal(chain?.claimedRunId, 'RUN-1')
  assert.equal(s.claims[0].runId, 'RUN-1', 'the ticket is spent against the run it names')
})

test('THE EXPLOIT: a ticket presented on a request that refines nothing is ignored', async () => {
  primeUser()
  const s = fakeStore()
  const chain = await resolveFollowUp(
    USER,
    'ai-food-estimate',
    // Same valid ticket, but the route says this body is a new outcome (an
    // unrelated description, no prior estimate). It gets charged as one.
    opts({ followUpTicket: await ticketFor(), refines: false, store: s.store }),
  )
  assert.equal(chain, null)
  assert.equal(s.claims.length, 0, 'and the outcome is not marked as refined either')
})

test('a ticket cannot be replayed: one outcome, one follow-up', async () => {
  primeUser()
  const s = fakeStore()
  const t = await ticketFor()
  assert.ok(await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: t, refines: true, store: s.store })))
  assert.equal(
    await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: t, refines: true, store: s.store })),
    null,
    'replaying it is how one charge became six estimates',
  )
})

test('a dispatch that never happened gives the ticket back', async () => {
  // The trigger failing is "nothing was queued", so the unit is refunded — and
  // the ticket has to come back with it, or the member\'s retry of a correction
  // that never ran is charged as a second scan.
  primeUser()
  const s = fakeStore()
  const t = await ticketFor()
  const chain = await resolveFollowUp(
    USER,
    'ai-food-estimate',
    opts({ followUpTicket: t, refines: true, store: s.store }),
  )
  await s.store.releaseFollowUp({ runId: chain!.claimedRunId, jti: chain!.jti })
  assert.deepEqual(s.released, [{ runId: 'RUN-1', jti: chain!.jti }])

  assert.ok(
    await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: t, refines: true, store: s.store })),
    'the retry is still the same correction',
  )
})

test('a ticket the server cannot tie to one of this member\'s runs is ignored', async () => {
  primeUser()
  const s = fakeStore({ accept: false }) // unknown run, or someone else's
  const chain = await resolveFollowUp(
    USER,
    'ai-food-estimate',
    opts({ followUpTicket: await ticketFor({ runId: 'RUN-NOBODY' }), refines: true, store: s.store }),
  )
  assert.equal(chain, null)
})

test('another member, another feature, another window: all refused', async () => {
  primeUser()
  const s = fakeStore()
  const cases = [
    await ticketFor({ userId: OTHER }),
    await ticketFor({ feature: 'workout-generation' }),
    await ticketFor({ bucketKey: '2020-01-01' }),
  ]
  for (const t of cases) {
    assert.equal(
      await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: t, refines: true, store: s.store })),
      null,
    )
  }
  assert.equal(s.claims.length, 0)
})

test('an OLD-SHAPE ticket — bound to no outcome — is refused outright', async () => {
  // Exactly the token that used to be valid: user + feature + window, nothing
  // more. It must not be honoured, or the binding is optional in practice.
  primeUser()
  const legacy = jwt.sign(
    { userId: USER, feature: 'ai-food-estimate', bucketKey: currentBucket(), scope: 'allowance-followup' },
    SECRET,
    { expiresIn: '30m' },
  )
  assert.equal(await readAllowanceTicket(legacy), null)
  const s = fakeStore()
  assert.equal(
    await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: legacy, refines: true, store: s.store })),
    null,
  )
})

test('a session token still does not parse as a ticket', async () => {
  primeUser()
  const session = jwt.sign({ userId: USER, email: 'a@b.c' }, SECRET, { expiresIn: '7d' })
  assert.equal(await readAllowanceTicket(session), null)
})

test('the chain is bounded, so a correction cannot be corrected forever', async () => {
  primeUser()
  const cap = FOLLOW_UP_LIMITS['ai-food-estimate'] as number
  const s = fakeStore()
  const overCap = await ticketFor({ runId: 'RUN-LAST', seq: cap + 1 })
  assert.equal(
    await resolveFollowUp(USER, 'ai-food-estimate', opts({ followUpTicket: overCap, refines: true, store: s.store })),
    null,
  )
})

// ─── Minting: the ticket is issued FOR the dispatch, after it exists ─────────

test('the ticket a member receives names the run they just paid for', async () => {
  primeUser()
  const s = fakeStore()
  const ticket = await sealOutcome('RUN-2', {
    userId: USER,
    feature: 'ai-food-estimate',
    ticketId: 'ledger-ticket',
    mintTicket: true,
    chain: null,
    store: s.store,
    ledger: noLedger,
  })
  const claims = await readAllowanceTicket(ticket)
  assert.equal(claims?.runId, 'RUN-2')
  assert.equal(claims?.rootRunId, 'RUN-2', 'a fresh outcome roots its own chain')
  assert.equal(claims?.seq, 1)
})

test('a correction\'s ticket keeps the ROOT and advances the sequence', async () => {
  primeUser()
  const s = fakeStore()
  const ticket = await sealOutcome('RUN-3', {
    userId: USER,
    feature: 'ai-food-estimate',
    ticketId: 'ledger-ticket',
    mintTicket: true,
    chain: { rootRunId: 'RUN-1', nextSeq: 2, claimedRunId: 'RUN-1', jti: 'j-1' },
    store: s.store,
    ledger: noLedger,
  })
  const claims = await readAllowanceTicket(ticket)
  assert.equal(claims?.runId, 'RUN-3')
  assert.equal(claims?.rootRunId, 'RUN-1', 'six corrections of one estimate stay one chain')
  assert.equal(claims?.seq, 2)
})

test('sealing binds the charge to the run even when no ticket is minted', async () => {
  // The binding is what a killed run is refunded from, and it has to happen for
  // features that have no follow-ups at all (workout generation).
  primeUser()
  const s = fakeStore()
  const ticket = await sealOutcome('RUN-4', {
    userId: USER,
    feature: 'workout-generation',
    ticketId: 'ledger-ticket',
    mintTicket: true,
    chain: null,
    store: s.store,
    ledger: noLedger,
  })
  assert.equal(ticket, undefined, 'workout generation has no correction loop')
  assert.deepEqual(s.bindings, [{ runId: 'RUN-4', userId: USER, ticketId: 'ledger-ticket' }])
})

test('an uncapped member is charged nothing, so there is nothing to bind or mint', async () => {
  primeUser()
  const s = fakeStore()
  const ticket = await sealOutcome('RUN-5', {
    userId: USER,
    feature: 'ai-food-estimate',
    ticketId: undefined,
    mintTicket: false,
    chain: null,
    store: s.store,
    ledger: noLedger,
  })
  assert.equal(ticket, undefined)
  assert.equal(s.bindings.length, 0)
})

test('the refund branch releases the claim as well as the unit', async () => {
  // The two have to move together: refunding the unit while keeping the ticket
  // spent leaves the member paying full price for the retry of a correction
  // that never dispatched.
  const fs = await import('node:fs')
  const path = await import('node:path')
  const src = fs.readFileSync(path.join(__dirname, '../../..', 'lib/ai/allowance.ts'), 'utf8')
  assert.match(src, /if \(ticketId\) await refundAllowance\(ticketId\)/)
  assert.match(src, /releaseFollowUp\(\{ runId: chain\.claimedRunId, jti: chain\.jti \}\)/)
})

// ─── withAllowance: the seam the routes actually call ────────────────────────

function gateWith(sealed: string | undefined, seen: string[]): AiAllowanceOk {
  return {
    ok: true,
    refund: async () => {},
    envelope: { feature: 'ai-food-estimate', limit: 1, remaining: 0, resetsAt: null },
    sealOutcome: async (runId: string) => {
      seen.push(runId)
      return sealed
    },
  }
}

test('withAllowance seals the run in the body and adds the ticket beside it', async () => {
  const seen: string[] = []
  const body = await withAllowance({ ok: true, runId: 'RUN-9' }, gateWith('T-9', seen))
  assert.deepEqual(seen, ['RUN-9'], 'the outcome sealed must be the one the client is handed')
  assert.equal(body.ok, true)
  assert.equal(body.runId, 'RUN-9', 'the existing body must survive untouched')
  assert.equal(body.allowance?.ticket, 'T-9')
  assert.equal(body.allowance?.remaining, 0)
})

test('withAllowance seals nothing when nothing was dispatched', async () => {
  const seen: string[] = []
  const body = await withAllowance({ ok: true }, gateWith('T-9', seen))
  assert.deepEqual(seen, [])
  assert.equal(body.allowance?.ticket, undefined)
})
