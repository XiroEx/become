// Run with: npm run test:file tests/unit/programNudge/route.test.ts
//
// THE OPT-OUT WAS ONLY AS PERMANENT AS localStorage.
//
// The "Ready to start a training program?" modal decided everything in the
// browser off one localStorage key. Two things followed, and the reported bug
// is both of them at once:
//
//   1. The opt-out was gated at 2 prior dismissals, so the earliest it could
//      render was the THIRD showing — not the second, which is when a member
//      who has already said "not now" wants it.
//   2. The dismissal count almost never GOT to the threshold. An installed iOS
//      PWA has its own storage container (the same fact that drove the daily
//      check-in server-side), and Safari's ITP evicts script-writable storage
//      after ~7 idle days, while the backoff deliberately spaces showings 1 → 2
//      → 4 → 8 → 16 days apart. And when the opt-out WAS tapped, the flag it
//      set lived in that same evictable key, so the modal came back anyway.
//
// So the record lives on UserProgress.programNudge. These tests drive the real
// route handlers against the real (loopback, disposable) test database, because
// "does the button actually work" is a question about what persists.

import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import mongoose from 'mongoose'
import { NextRequest } from 'next/server'
import { GET, POST } from '../../../app/api/program-nudge/route'
import UserProgress from '../../../models/UserProgress'
import { signToken } from '../../../lib/auth'
import { DONT_SHOW_AGAIN_THRESHOLD, offersDontShowAgain } from '../../../lib/programNudge'

const DAY = 24 * 60 * 60 * 1000
const USER_ID = '65f0000000000000000000ab'

let auth: string

before(async () => {
  process.env.JWT_SECRET ||= 'become-unit-test-secret'
  await mongoose.connect(
    process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/become-test',
  )
  auth = `Bearer ${await signToken({ userId: USER_ID, email: 'nudge@example.com' })}`
})

after(async () => {
  await UserProgress.deleteMany({ userId: USER_ID })
  await mongoose.disconnect()
})

beforeEach(async () => {
  await UserProgress.deleteMany({ userId: USER_ID })
})

function getReq(authHeader?: string) {
  const headers = new Headers()
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/program-nudge', { headers })
}

function postReq(body: unknown, authHeader?: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (authHeader) headers.set('Authorization', authHeader)
  return new NextRequest('http://localhost/api/program-nudge', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

const status = async () => (await GET(getReq(auth))).json()
const act = async (body: unknown) => (await POST(postReq(body, auth))).json()

// ── The reported journey ──────────────────────────────────────────────────────

test('second showing offers the opt-out, and taking it is permanent', async () => {
  // First showing: due, and no opt-out yet — nothing has been dismissed.
  const first = await status()
  assert.equal(first.due, true)
  assert.equal(first.dismissCount, 0)
  assert.equal(first.showings, 0)
  assert.equal(offersDontShowAgain(first.showings), false)

  // "Explore first".
  await act({ action: 'dismiss' })

  // Backoff holds it for a day.
  assert.equal((await status()).due, false)

  // A day passes. Second showing — this is the one the card is about.
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastDismissedAt': new Date(Date.now() - (DAY + 1000)) } },
  )
  const second = await status()
  assert.equal(second.due, true)
  assert.equal(second.dismissCount, 1)
  assert.equal(second.showings, 1)
  assert.equal(
    offersDontShowAgain(second.showings),
    true,
    'the second showing must offer "Don’t show this again"',
  )

  // Take it.
  const after = await act({ action: 'dismiss_forever' })
  assert.equal(after.dontShowAgain, true)
  assert.equal(after.due, false)

  // And it stays taken — not for 16 days, forever.
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastDismissedAt': new Date(Date.now() - 999 * DAY) } },
  )
  const muchLater = await status()
  assert.equal(muchLater.due, false, 'opting out must survive any amount of elapsed time')
  assert.equal(muchLater.dontShowAgain, true)
})

test('the opt-out survives a browser that has forgotten everything', async () => {
  // The actual failure mode: state lived per storage container, so the
  // installed PWA and Safari disagreed and eviction wiped both. Nothing in this
  // test writes localStorage — a second device is just another request.
  await act({ action: 'dismiss_forever' })

  const fromAnotherDevice = await status()
  assert.equal(fromAnotherDevice.due, false)
  assert.equal(fromAnotherDevice.dontShowAgain, true)
})

test('a plain dismissal never clears an opt-out already on the account', async () => {
  await act({ action: 'dismiss_forever' })
  // A stale tab, or the backdrop tap that fires on navigate, arriving late.
  const after = await act({ action: 'dismiss' })
  assert.equal(after.dontShowAgain, true)
  assert.equal(after.due, false)
})

test('dismissals accumulate on the account across requests', async () => {
  for (const expected of [1, 2, 3]) {
    const body = await act({ action: 'dismiss' })
    assert.equal(body.dismissCount, expected)
  }
  // And the backoff grew with them: 3 dismissals → a 4-day wait.
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastDismissedAt': new Date(Date.now() - (3 * DAY)) } },
  )
  assert.equal((await status()).due, false)
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastDismissedAt': new Date(Date.now() - (4 * DAY + 1000)) } },
  )
  assert.equal((await status()).due, true)
})

// ── Enrolment ─────────────────────────────────────────────────────────────────

test('a member with a current program is never nudged, whatever the history says', async () => {
  await UserProgress.create({
    userId: USER_ID,
    currentProgram: {
      programId: 'p1',
      startDate: new Date(),
      currentPhase: 1,
      currentWeek: 1,
    },
  })
  const body = await status()
  assert.equal(body.due, false)
})

test('an EMPTY currentProgram is not enrolment', async () => {
  // `currentProgram` is a nested path, so Mongoose materialises it as `{}` on
  // every hydrated document. A `!!currentProgram` check therefore reads as
  // "enrolled" for a member with no program at all, which silently disables the
  // nudge for everyone. Enrolment means a programId.
  await UserProgress.create({ userId: USER_ID })
  const row = await UserProgress.findOne({ userId: USER_ID })
  assert.ok(row, 'row must exist')
  const body = await status()
  assert.equal(body.due, true, 'a member with no programId must still be nudged')
})

// ── Adopting the pre-existing localStorage record ─────────────────────────────

test('adopt carries a browser record onto the account, once', async () => {
  const stamp = new Date(Date.now() - 10 * DAY).toISOString()
  const adopted = await act({ action: 'adopt', dismissCount: 4, lastDismissedAt: stamp })
  assert.equal(adopted.adopted, true)
  assert.equal(adopted.dismissCount, 4)
  assert.equal(adopted.hasServerState, true)
  // Four dismissals already behind them: the opt-out shows on the next sighting.
  assert.equal(adopted.showings, 4)
  assert.equal(offersDontShowAgain(adopted.showings), true)

  // A second browser replaying ITS older snapshot must not reset the count.
  const replay = await act({ action: 'adopt', dismissCount: 0, lastDismissedAt: stamp })
  assert.equal(replay.adopted, false)
  assert.equal(replay.dismissCount, 4)
})

test('adopt never undoes a dismissal the member has since made elsewhere', async () => {
  await act({ action: 'dismiss' })
  await act({ action: 'dismiss' })
  const replay = await act({ action: 'adopt', dismissCount: 0, dontShowAgain: false })
  assert.equal(replay.adopted, false)
  assert.equal(replay.dismissCount, 2, 'server state wins over a replayed local snapshot')
})

test('adopt carries across a local opt-out rather than re-nagging', async () => {
  const body = await act({ action: 'adopt', dismissCount: 2, dontShowAgain: true })
  assert.equal(body.dontShowAgain, true)
  assert.equal(body.due, false)
})

test('adopt with nothing worth carrying writes no state, so the member is still counted from zero', async () => {
  const body = await act({ action: 'adopt', dismissCount: 0 })
  assert.equal(body.adopted, false)
  assert.equal(body.hasServerState, false)
  assert.equal(body.due, true)
  assert.equal(await UserProgress.countDocuments({ userId: USER_ID, 'programNudge.lastDismissedAt': { $ne: null } }), 0)
})

test('adopt clamps a hostile count and tolerates a junk timestamp', async () => {
  const body = await act({ action: 'adopt', dismissCount: 1e9, lastDismissedAt: 'nonsense' })
  assert.equal(body.dismissCount, 99)
  const row = await UserProgress.findOne({ userId: USER_ID }).lean()
  assert.ok(Number.isFinite(new Date(row!.programNudge!.lastDismissedAt!).getTime()))
})

// ── Auth and input ────────────────────────────────────────────────────────────

test('GET without auth is not due — a broken read must never spam the modal', async () => {
  const body = await (await GET(getReq())).json()
  assert.equal(body.due, false)
  assert.equal(body.reason, 'unauthenticated')
})

test('POST without auth is 401 and writes nothing', async () => {
  const res = await POST(postReq({ action: 'dismiss_forever' }))
  assert.equal(res.status, 401)
  assert.equal(await UserProgress.countDocuments({ userId: USER_ID }), 0)
})

test('POST rejects an unknown action', async () => {
  const res = await POST(postReq({ action: 'delete_everything' }, auth))
  assert.equal(res.status, 400)
})

test('the threshold the route reports is the one the modal renders against', async () => {
  // One constant, imported by both — so "offered on the second showing" cannot
  // drift between the server's count and the client's gate.
  assert.equal(DONT_SHOW_AGAIN_THRESHOLD, 1)
  await act({ action: 'dismiss' })
  const body = await status()
  assert.equal(offersDontShowAgain(body.showings), true)
})

// ── Being SHOWN is the thing that counts ──────────────────────────────────────
//
// The other half of the reported bug, and the one the move to the server did
// not touch. Only 'dismiss' wrote anything, so a member who left the modal any
// other way — backgrounded the installed PWA, killed it, reloaded — had no
// record at all. It was therefore due again on the very next dashboard load,
// arriving with a count of 0 every single time, so the opt-out it gates on
// could never be reached however often it popped up.

test('the second SHOWING offers the opt-out even though nothing was ever dismissed', async () => {
  // First load: due, no way out offered yet.
  const first = await status()
  assert.equal(first.due, true)
  assert.equal(first.showings, 0)
  assert.equal(offersDontShowAgain(first.showings), false)

  // It goes on screen. The member walks away without pressing anything.
  await act({ action: 'shown' })

  // It does not come straight back on the next load.
  assert.equal((await status()).due, false, 'an un-dismissed showing must still start the backoff')

  // A day later it is due again — and THIS time it offers the way out.
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastShownAt': new Date(Date.now() - (DAY + 1000)) } },
  )
  const second = await status()
  assert.equal(second.due, true)
  assert.equal(second.showings, 1)
  assert.equal(second.dismissCount, 0, 'nothing was dismissed — the sighting is what counted')
  assert.equal(
    offersDontShowAgain(second.showings),
    true,
    'the second time it pops up must offer "Don’t show this again"',
  )

  // And taking it is permanent, dismissal history or not.
  const after = await act({ action: 'dismiss_forever' })
  assert.equal(after.dontShowAgain, true)
  assert.equal(after.due, false)
})

test('showings accumulate on the account and grow the backoff', async () => {
  for (const expected of [1, 2, 3]) {
    const body = await act({ action: 'shown' })
    assert.equal(body.showings, expected)
  }
  // Three sightings → a 4-day wait, measured from the last one.
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastShownAt': new Date(Date.now() - 3 * DAY) } },
  )
  assert.equal((await status()).due, false)
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $set: { 'programNudge.lastShownAt': new Date(Date.now() - (4 * DAY + 1000)) } },
  )
  assert.equal((await status()).due, true)
})

test('a dismissal after a showing does not double-count the same sighting', async () => {
  await act({ action: 'shown' })
  const dismissed = await act({ action: 'dismiss' })
  assert.equal(dismissed.dismissCount, 1)
  assert.equal(dismissed.showings, 1, 'one sighting, however it ended')
})

test('a dismissal with no recorded showing still counts as one', async () => {
  // The 'shown' write is fire-and-forget; if it is lost, the button press that
  // follows must still move the member off zero.
  const dismissed = await act({ action: 'dismiss' })
  assert.equal(dismissed.showings, 1)
})

test('a showing never clears an opt-out already on the account', async () => {
  await act({ action: 'dismiss_forever' })
  const body = await act({ action: 'shown' })
  assert.equal(body.dontShowAgain, true)
  assert.equal(body.due, false)
})

test('a member with a current program is not counted as shown', async () => {
  await UserProgress.create({
    userId: USER_ID,
    currentProgram: { programId: 'p1', startDate: new Date(), currentPhase: 1, currentWeek: 1 },
  })
  const body = await act({ action: 'shown' })
  assert.equal(body.due, false, 'enrolment beats the history either way')
})

test('a legacy row with dismissals but no showings keeps its credit', async () => {
  // Rows written before showings were counted have dismissCount and nothing
  // else. Reading `showings` off them must not demote them to zero and start
  // the nagging over.
  await act({ action: 'dismiss' })
  await act({ action: 'dismiss' })
  await UserProgress.updateOne(
    { userId: USER_ID },
    { $unset: { 'programNudge.shownCount': '', 'programNudge.lastShownAt': '' } },
  )
  const body = await status()
  assert.equal(body.showings, 2)
  assert.equal(offersDontShowAgain(body.showings), true)
})
