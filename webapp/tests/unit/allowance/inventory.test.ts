// Run with: npm run test:file tests/unit/allowance/inventory.test.ts
//
// THE REGRESSION GUARD. This is the test that stops the NEXT AI route from
// shipping unmetered.
//
// Every dispatch in the app goes through one seam — lib/ai/becomeGraph.ts — so
// "does this route spend money" is answerable mechanically. What is not
// answerable in review is whether someone remembered: a new /api/ai route with
// no allowance call compiles, works, looks right in a diff, and quietly bills
// the company forever.
//
// So: every POST handler under app/api/ai must either take an allowance, or be
// named here with a written reason. Adding a route is then a choice someone had
// to make explicitly, in this file, with the reason on the record.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

const rel = (full: string) => path.relative(ROOT, full).split(path.sep).join('/')

/** Routes under app/api/ai that deliberately take NO allowance, and why. */
const UNMETERED: Record<string, string> = {
  'app/api/ai/run/[runId]/route.ts':
    'Poll-only: fetchBecomeRun, hit every 2s for up to 180s per run. Charging ' +
    'here would bill ~90 units for one estimate.',
  'app/api/ai/context/route.ts':
    'GET, assembleUserContext only — reads the user\'s own data, dispatches nothing.',
}

const takesAllowance = (src: string) =>
  /from '@\/lib\/ai\/allowance'/.test(src) &&
  /(requireAiAllowance|requireSpendCap)\s*\(/.test(src)

// ─── Every dispatching AI route is metered ───────────────────────────────────

test('every POST route under app/api/ai either meters or is allowlisted', () => {
  const unmetered: string[] = []

  for (const file of walk(path.join(ROOT, 'app/api/ai'))) {
    const name = rel(file)
    const src = fs.readFileSync(file, 'utf8')
    if (!/export\s+async\s+function\s+POST/.test(src)) continue
    if (UNMETERED[name]) continue
    if (!takesAllowance(src)) unmetered.push(name)
  }

  assert.deepEqual(
    unmetered,
    [],
    `these AI routes dispatch without an allowance:\n  ${unmetered.join('\n  ')}\n` +
      'Add requireAiAllowance/requireSpendCap, or add the route to UNMETERED with a reason.'
  )
})

test('the allowlist stays honest — every entry still exists and still does not meter', () => {
  for (const [name, reason] of Object.entries(UNMETERED)) {
    const full = path.join(ROOT, name)
    assert.ok(fs.existsSync(full), `${name} is allowlisted but no longer exists`)
    assert.ok(reason.length > 30, `${name} needs a real reason, not a label`)
    assert.ok(
      !takesAllowance(fs.readFileSync(full, 'utf8')),
      `${name} now meters — remove it from UNMETERED so the guard covers it`
    )
  }
})

test('the run poll route never learns to charge', () => {
  // Called ~90 times per generation. This deserves its own assertion rather
  // than only living in the allowlist, because the failure is silent and
  // expensive: the member is billed for waiting.
  const src = read('app/api/ai/run/[runId]/route.ts')
  assert.ok(!/lib\/allowance/.test(src), 'the poll endpoint must not touch the allowance system')
  assert.ok(!/lib\/spendCaps/.test(src))
})

// ─── The deterministic fallback stays free ───────────────────────────────────

const DETERMINISTIC = [
  'app/api/generate/session/route.ts',
  'app/api/generate/program/route.ts',
  'app/api/generate/session/complete/route.ts',
]

test('the deterministic generators spend nothing, so they are never metered', () => {
  // These are the graceful-degrade path every AI route falls back to
  // ({ ok:false, fallback:true } → GenerateModal / QuickSessionModal). They are
  // pure lib/quickSession catalogue maths: no graph call, no cost.
  //
  // Metering them would take the free tier's fallback away at the exact moment
  // the paid path is refused, turning a soft paywall into a dead end for the
  // people who hit the cap. That is the one change in this area that looks like
  // finishing the job and is actually the bug.
  for (const name of DETERMINISTIC) {
    const src = read(name)
    assert.ok(
      !/lib\/ai\/becomeGraph/.test(src),
      `${name} imports the graph — it is no longer deterministic and this test's premise is wrong`
    )
    assert.ok(
      !takesAllowance(src),
      `${name} is the free fallback and must not be metered — see the comment in this test`
    )
  }
})

// ─── The dispatch seam stays singular ────────────────────────────────────────

test('nothing dispatches to the graph outside the known callers', () => {
  // The inventory above is only complete while becomeGraph has one set of
  // callers. A new one elsewhere in app/ or lib/ would be spend this system
  // cannot see.
  const KNOWN = new Set([
    'lib/ai/becomeGraph.ts',
    'lib/ai/routeHelpers.ts',
    'lib/nutrition/verifyFood.ts',
  ])
  const found: string[] = []

  const scan = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) { scan(full); continue }
      if (!/\.tsx?$/.test(entry.name)) continue
      const name = rel(full)
      if (KNOWN.has(name)) continue
      const src = fs.readFileSync(full, 'utf8')
      if (/\b(triggerBecomeTask|runStructuredTask|runFreeformTask|runBecomeTask)\s*\(/.test(src)) {
        found.push(name)
      }
    }
  }
  scan(path.join(ROOT, 'app'))
  scan(path.join(ROOT, 'lib'))

  assert.deepEqual(
    found,
    [],
    `new graph dispatchers found: ${found.join(', ')}. Add an allowance, then add the file to KNOWN.`
  )
})

// ─── verifyFood's fan-out is owned by its callers ────────────────────────────

test('verifyFood takes no allowance of its own, and both callers take one', () => {
  // One report can fan out to three dispatches. Charging inside verifyFood
  // would bill three times for one report; charging in the caller bills once
  // and lets the caller decide before a dispatch is even certain.
  const lib = read('lib/nutrition/verifyFood.ts')
  assert.ok(!/lib\/ai\/allowance/.test(lib), 'verifyFood must not charge — its callers do')
  assert.match(lib, /budget\?:\s*VerificationBudget/, 'it must accept the round budget instead')

  for (const name of [
    'app/api/nutrition/foods/[id]/flag/route.ts',
    'app/api/nutrition/flags/[id]/evidence/route.ts',
  ]) {
    const src = read(name)
    assert.match(src, /requireSpendCap\(/, `${name} must charge before it dispatches verifyFood`)
  }
})
