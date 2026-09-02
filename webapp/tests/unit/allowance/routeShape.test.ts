// Run with: npx tsx --test tests/unit/allowance/routeShape.test.ts
//
// ORDER, inside each metered route. Route tests need a live Mongo and an auth
// context this suite does not stand up (same rationale as
// tests/unit/entitlements/gates.test.ts), so these are source scans — and the
// properties are structural anyway.
//
// Three orderings, each of which compiles and "works" when wrong:
//
//   validate → charge   A malformed body must 400 without costing a scan.
//                       Charging first bills people for typos.
//   charge   → trigger  The allowance must GATE the dispatch, not merely count
//                       it afterwards. Charging after the trigger is a meter,
//                       not a limit.
//   trigger failed → refund   Nothing was queued, so nothing was billed. The
//                       refund must sit on that branch and no other: a run that
//                       started and then failed is NOT refundable, because the
//                       graph ran and because "it didn't work" is a claim only
//                       the client can make.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** The priced routes: they charge a Feature and report the allowance back. */
const PRICED: Array<[string, string]> = [
  ['app/api/ai/nutrition/plate/route.ts', 'ai-food-estimate'],
  ['app/api/ai/nutrition/describe/route.ts', 'ai-food-estimate'],
  ['app/api/ai/nutrition/product/route.ts', 'ai-food-estimate'],
  ['app/api/ai/workout/session/route.ts', 'workout-generation'],
  ['app/api/ai/workout/program/route.ts', 'workout-generation'],
  ['app/api/ai/workout/import/route.ts', 'workout-generation'],
]

/** The ceiling routes: an abuse cap, never an upsell. */
const CAPPED: Array<[string, string]> = [
  ['app/api/ai/consultant/route.ts', 'coach-message'],
  ['app/api/ai/nutrition/consultant/route.ts', 'coach-message'],
  ['app/api/ai/mind/coach/route.ts', 'coach-message'],
  ['app/api/ai/mind/session/route.ts', 'mind-composition'],
  ['app/api/ai/mind/flow/route.ts', 'mind-composition'],
  ['app/api/ai/mind/generate/route.ts', 'mind-composition'],
  ['app/api/ai/mind/suggestions/route.ts', 'mind-composition'],
]

const ALL = [...PRICED, ...CAPPED]

/** `helper(… 'key' …)` across line breaks. [^)] rather than the `s` flag, which
 *  this project's tsconfig target does not allow. */
const chargeRe = (helper: string, key: string) =>
  new RegExp(`${helper}\\([^)]*'${key}'`)

// ─── The allowance each route takes ──────────────────────────────────────────

test('the three food-estimate doors share ONE daily allowance', () => {
  // Photo, label photo and "describe it" are one member-facing feature. Three
  // separate counters would quietly triple the free tier.
  const doors = PRICED.filter(([, f]) => f === 'ai-food-estimate')
  assert.equal(doors.length, 3)
  for (const [file] of doors) {
    assert.match(read(file), chargeRe('requireAiAllowance', 'ai-food-estimate'), file)
  }
})

test('every generation door shares ONE weekly allowance', () => {
  for (const [file, feature] of PRICED.filter(([, f]) => f === 'workout-generation')) {
    assert.match(read(file), chargeRe('requireAiAllowance', feature), file)
  }
})

test('each ceiling route charges the ceiling it is meant to', () => {
  for (const [file, key] of CAPPED) {
    assert.match(read(file), chargeRe('requireSpendCap', key), file)
  }
})

// ─── Ordering ────────────────────────────────────────────────────────────────

test('auth comes before the charge, in every metered route', () => {
  for (const [file] of ALL) {
    const src = read(file)
    const auth = src.indexOf('requireAiUser')
    const charge = Math.max(src.indexOf('requireAiAllowance('), src.indexOf('requireSpendCap('))
    assert.ok(auth >= 0 && charge > auth, `${file} charges before it knows who is asking`)
  }
})

test('body validation comes before the charge, so a typo is free', () => {
  for (const [file] of ALL) {
    const src = read(file)
    const charge = Math.max(src.indexOf('requireAiAllowance('), src.indexOf('requireSpendCap('))
    // Every 400 in these routes is a body-validation refusal.
    for (const m of src.matchAll(/status:\s*400/g)) {
      assert.ok(
        m.index! < charge,
        `${file} can return 400 AFTER charging — a malformed request would cost a scan`
      )
    }
  }
})

test('the charge comes before the trigger, so it gates rather than counts', () => {
  for (const [file] of ALL) {
    const src = read(file)
    const charge = Math.max(src.indexOf('requireAiAllowance('), src.indexOf('requireSpendCap('))
    const trigger = src.indexOf('triggerOwnedRun(')
    assert.ok(
      charge >= 0 && trigger > charge,
      `${file} dispatches before charging — that is a meter, not a limit`
    )
  }
})

test('a refused charge returns immediately and never reaches the graph', () => {
  for (const [file] of ALL) {
    const src = read(file)
    assert.match(
      src,
      /if \(!(allow|cap)\.ok\) (return|\{)/,
      `${file} does not bail on a refusal`
    )
  }
})

// ─── Refunds ─────────────────────────────────────────────────────────────────

test('every metered route refunds exactly once, on the trigger-failure branch', () => {
  for (const [file] of ALL) {
    const src = read(file)
    const refunds = src.match(/(allow|cap)\.refund\(\)/g) ?? []
    assert.equal(refunds.length, 1, `${file} should refund exactly once, found ${refunds.length}`)

    // It must sit AFTER the success return, i.e. on the branch where the
    // trigger did not produce a runId.
    const success = src.indexOf('trig.ok')
    assert.ok(
      src.indexOf('.refund()') > success,
      `${file} refunds before checking whether the trigger succeeded`
    )
  }
})

test('the refund is awaited, or the response can race it', () => {
  for (const [file] of ALL) {
    assert.match(read(file), /await (allow|cap)\.refund\(\)/, file)
  }
})

// ─── The success envelope is additive ────────────────────────────────────────

test('priced routes report the allowance without disturbing their existing body', () => {
  for (const [file] of PRICED) {
    const src = read(file)
    assert.match(
      src,
      /withAllowance\(\{ ok: true, runId: trig\.runId \}, allow\)/,
      `${file} must keep ok/runId and ADD allowance — clients read the old fields`
    )
  }
})

test('ceiling routes add nothing to the body', () => {
  // A ceiling is not a product surface. Reporting "you have 287 coach messages
  // left" would invent a limit the member was never sold.
  for (const [file] of CAPPED) {
    assert.ok(!/withAllowance\(/.test(read(file)), `${file} should not report a ceiling to the client`)
  }
})

// ─── The follow-up seam ──────────────────────────────────────────────────────

test('the estimate doors accept a follow-up ticket', () => {
  // Without this a free member gets one scan a day and no way to correct it,
  // which breaks the feature rather than pricing it.
  //
  // THIS ASSERTION ALONE IS NOT COVERAGE. The door being open proves nothing
  // about anyone walking through it: the server half shipped complete and
  // unreachable once already, because runStore discarded the `allowance` the
  // route returned and no client ever sent a ticket back. The client round
  // trip is exercised in tests/unit/allowance/followUpTicket.test.ts — if this
  // file is the only place `allowanceTicket` appears outside the routes, the
  // feature is dead code again.
  for (const [file, feature] of PRICED.filter(([, f]) => f === 'ai-food-estimate')) {
    assert.match(read(file), /followUpTicket:\s*body\.allowanceTicket/, `${file} (${feature})`)
  }
})

test('the ticket is verified server-side, never trusted as sent', () => {
  const src = read('lib/ai/allowance.ts')
  assert.match(src, /readAllowanceTicket\(/, 'the ticket must be verified')
  assert.match(src, /claims\.userId !== userId/, 'a ticket for another member must be refused')
  assert.match(src, /claims\.feature !== feature/, 'a cheap ticket must not unlock an expensive feature')
  assert.match(src, /claims\.bucketKey ===/, 'a stale ticket must not span a window reset')
})

test('the ticket is a signed, scoped, short-lived token', () => {
  const src = read('lib/allowanceTicket.ts')
  assert.match(src, /jwt\.sign/, 'an id the server merely recognises is forgeable')
  assert.match(src, /decoded\.scope !== TICKET_SCOPE/, 'a session token must not parse as a ticket')
  assert.match(src, /TICKET_TTL = '30m'/)
})

// ─── The flag pipeline ───────────────────────────────────────────────────────

test('a relaunch inherits every guard the first report had to pass', () => {
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')
  assert.match(src, /roundsExhausted\(/, 'the round ceiling — the loop was unbounded without it')
  assert.match(src, /decideFlag\(/, 'the daily/new-account admission control it used to skip')
  assert.match(src, /findOneAndUpdate\(/, 'the atomic Food claim it used to skip')
  assert.match(src, /requireSpendCap\(/, 'the spend ceiling')
  assert.match(src, /verificationBudgetFor\(rounds\)/, 'the reduced relaunch budget')
})

test('a round is spent by a DISPATCH, never by an attempt', () => {
  // `rounds` used to be incremented before the decideFlag throttle, the lost-
  // claim branch and the spend-cap refusal — all three of which dispatch
  // nothing. Two throttled resends therefore exhausted a bounded, permanently
  // exhaustible resource: roundsExhausted() then 409s forever, escalatedAt is
  // stamped, and /flags/mine flips canAddEvidence to false for good. This path
  // is behind NEITHER kill-switch, so it is live for every user.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')

  const increment = src.search(/roundsSoFar \+ 1/)
  assert.ok(increment !== -1, 'the increment must be a single named step')

  const cap = src.search(/requireSpendCap\(/)
  const claim = src.search(/findOneAndUpdate\(/)
  const throttle = src.search(/decision\.action !== 'dispatch'/)

  assert.ok(increment > cap, 'the round must be spent AFTER the spend ceiling passes')
  assert.ok(increment > claim, 'the round must be spent AFTER the Food claim is won')
  assert.ok(increment > throttle, 'the round must be spent AFTER the throttle branch returns')

  // And the old unconditional bump must be gone for good.
  assert.doesNotMatch(
    src,
    /flag\.rounds = \(flag\.rounds \?\? 1\) \+ 1/,
    'an unconditional increment is the bug this replaces',
  )
})

test('the relaunch no longer clears the concurrency lock', () => {
  // The old code unset BOTH verification.lastRunAt and verification.claimedAt.
  // claimedAt is not a cooldown, it is the lock the compare-and-swap depends
  // on — clearing it let a relaunch run alongside whatever was already running.
  const src = read('app/api/nutrition/flags/[id]/evidence/route.ts')
  const unsets = src.match(/\$unset:\s*\{[^}]*\}/g) ?? []
  const cooldownUnset = unsets.find(u => /lastRunAt/.test(u))
  assert.ok(cooldownUnset, 'the photo still earns a cooldown override')
  assert.ok(
    !/claimedAt/.test(cooldownUnset!),
    'the cooldown override must not also drop the claim — that defeats the CAS below it'
  )
})

test('a lost claim releases nothing it did not take, and a refused ceiling releases what it did', () => {
  // Taking the claim and then bailing without releasing it wedges the food as
  // unverifiable until the 15-minute TTL.
  for (const file of [
    'app/api/nutrition/flags/[id]/evidence/route.ts',
    'app/api/nutrition/foods/[id]/flag/route.ts',
  ]) {
    const src = read(file)
    const at = src.indexOf('if (!cap.ok)')
    assert.ok(at > 0, `${file} must handle a refused ceiling`)
    const branch = src.slice(at, at + 500)
    assert.match(branch, /verification\.claimedAt/, `${file} must release the claim before returning`)
  }
})

test('the UI stops offering a relaunch once the rounds are spent', () => {
  const src = read('app/api/nutrition/flags/mine/route.ts')
  assert.match(src, /canAddEvidence:\s*settled && !spent/)
  assert.match(src, /roundsRemaining/)
})
