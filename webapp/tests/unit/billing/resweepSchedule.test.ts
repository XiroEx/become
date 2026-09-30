// Run with: npm run test:file tests/unit/billing/resweepSchedule.test.ts
//
// The sweep itself is covered by tierResweep.test.ts. THIS file covers the part
// that made the sweep useless until now: nothing ran it.
//
// A schedule is configuration, so the only thing that can check it is a scan —
// but the three ways it can be wrong are all visible in the text:
//
//   - more than one thing schedules it (production and beta are two workspaces
//     over ONE database, so a second schedule is a second runner over the same
//     rows, and "who downgraded this member" stops having one answer),
//   - it runs too rarely to keep the promise that a cancelled member loses Plus
//     within a day of their period ending,
//   - the endpoint sweeps before it checks the secret, or writes a record on a
//     run that changed nothing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.join(__dirname, '../../../..')
const WORKFLOW_DIR = path.join(REPO, '.github/workflows')
const WORKFLOW_PATH = path.join(WORKFLOW_DIR, 'resweep-subscription-tiers.yml')

const WORKFLOW = fs.readFileSync(WORKFLOW_PATH, 'utf8')
const ROUTE = fs.readFileSync(
  path.join(__dirname, '../../../app/api/cron/resweep-tiers/route.ts'),
  'utf8',
)
const ADMIN_ROUTE = fs.readFileSync(
  path.join(__dirname, '../../../app/api/admin/billing/resweep/route.ts'),
  'utf8',
)
const SCRIPT = fs.readFileSync(
  path.join(__dirname, '../../../scripts/resweep-subscription-tiers.mjs'),
  'utf8',
)

const PROD_HOST = 'become.redbtn.io'
const BETA_HOST = 'become-beta.redbtn.io'

// ── One place only ───────────────────────────────────────────────────────────

test('exactly one workflow in the repo calls the resweep endpoint', () => {
  const callers = fs
    .readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .filter((f) => fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8').includes('resweep-tiers'))

  assert.deepEqual(callers, ['resweep-subscription-tiers.yml'])
})

test('it calls production, and never the beta host', () => {
  // Comments are allowed to explain why beta is excluded; the job itself may
  // not name it. Beta shares production's database, so a second runner there
  // would sweep the same rows for nothing.
  const executable = WORKFLOW.split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')

  assert.ok(
    executable.includes(`https://${PROD_HOST}`),
    'the production base URL must be explicit in the job',
  )
  assert.ok(!executable.includes(BETA_HOST), 'the job must not call beta')
})

test('the workflow is triggered by the schedule and by hand, never by a push', () => {
  assert.match(WORKFLOW, /^on:/m)
  assert.match(WORKFLOW, /^ {2}schedule:/m)
  assert.match(WORKFLOW, /^ {2}workflow_dispatch:/m)
  assert.ok(!/^ {2}push:/m.test(WORKFLOW), 'a deploy must not fire a billing sweep')
})

// ── Often enough to keep the promise ─────────────────────────────────────────

/** How many times a day a 5-field cron expression fires. */
function firesPerDay(expression: string): number {
  const [, hourField, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/)
  // Anything narrower than "every day" cannot promise "within a day".
  assert.equal(dayOfMonth, '*')
  assert.equal(month, '*')
  assert.equal(dayOfWeek, '*')

  let count = 0
  for (const part of hourField.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw ? Number(stepRaw) : 1
    let lo = 0
    let hi = 23
    if (range !== '*') {
      const [a, b] = range.split('-')
      lo = Number(a)
      hi = b === undefined ? Number(a) : Number(b)
    }
    for (let h = lo; h <= hi; h += step) count++
  }
  return count
}

test('the schedule fires often enough that a lapse is closed well inside a day', () => {
  const cron = /cron:\s*'([^']+)'/.exec(WORKFLOW)
  assert.ok(cron, 'the workflow must declare a cron expression')

  const perDay = firesPerDay(cron[1])
  // Twice a day is the floor: GitHub delays scheduled runs under load and drops
  // them outright at peak, so a once-daily job plus one skipped run is already
  // outside "within a day of the period ending".
  assert.ok(perDay >= 2, `expected at least 2 runs a day, cron '${cron[1]}' gives ${perDay}`)

  // Not on the hour — that is the busiest minute on GitHub's scheduler and the
  // one most likely to be delayed.
  const minute = cron[1].trim().split(/\s+/)[0]
  assert.notEqual(minute, '0')
})

// ── The endpoint ─────────────────────────────────────────────────────────────

test('the secret is checked before anything is swept', () => {
  const unauthorized = ROUTE.indexOf("{ error: 'Unauthorized' }")
  const sweep = ROUTE.indexOf('runTierResweep(')
  assert.ok(unauthorized > -1, 'the route must refuse an unauthenticated call')
  assert.ok(sweep > unauthorized, 'the sweep must not run before the secret is checked')
  // Same secret as the notify cron: one cron credential for the app.
  assert.match(ROUTE, /admin\.cronSecret/)
})

test('a run that changes nothing records nothing', () => {
  const guard = ROUTE.indexOf('if (result.modified > 0)')
  assert.ok(guard > -1, 'the record must be behind a "something actually moved" check')
  const create = ROUTE.indexOf('TierResweepRun.create(')
  assert.ok(create > guard, 'the only record write must sit inside that check')
  assert.equal((ROUTE.match(/TierResweepRun\.create\(/g) ?? []).length, 1)
  // And no other write of any kind lives in this route.
  assert.ok(!/updateOne\(|updateMany\(|bulkWrite\(|deleteOne\(/.test(ROUTE))
})

test('the route holds no copy of the sweep rules', () => {
  // A second spelling of the selector or of deriveTier is how the scheduled job
  // and the hand-run script start disagreeing about what a tier means.
  for (const [name, src] of [['route', ROUTE], ['script', SCRIPT]] as const) {
    assert.ok(
      !src.includes("'subscription.status': 'canceled'"),
      `${name} must not restate the candidate selector`,
    )
    assert.ok(
      !src.includes("$in: ['active', 'trialing']"),
      `${name} must not restate the candidate selector`,
    )
    assert.ok(!/\bderiveTier\(/.test(src), `${name} must not call deriveTier itself`)
    assert.ok(src.includes('runTierResweep('), `${name} must call the shared sweep`)
  }
})

test('the admin view is read-only and does not trigger a run', () => {
  assert.ok(!/\.create\(|updateOne\(|bulkWrite\(|deleteOne\(/.test(ADMIN_ROUTE))
  assert.ok(!ADMIN_ROUTE.includes('runTierResweep('))
  assert.match(ADMIN_ROUTE, /requireAdmin\(/)
  // It reports the waiting rows through the sweep's own selector, so the page
  // and the job cannot disagree about who is a candidate.
  assert.match(ADMIN_ROUTE, /resweepSelector\(/)
})

// ── The documentation that said otherwise ────────────────────────────────────

test('the script no longer claims nothing schedules the sweep', () => {
  assert.ok(!SCRIPT.includes('NOT WIRED TO ANYTHING'))
  assert.ok(
    SCRIPT.includes('.github/workflows/resweep-subscription-tiers.yml'),
    'the script header must point at the schedule that now exists',
  )
})

test('lib/subscription.ts points at the scheduled writer', () => {
  const SUBSCRIPTION = fs.readFileSync(
    path.join(__dirname, '../../../lib/subscription.ts'),
    'utf8',
  )
  assert.ok(!/deliberately not scheduled/.test(SUBSCRIPTION))
  assert.match(SUBSCRIPTION, /api\/cron\/resweep-tiers/)
})
