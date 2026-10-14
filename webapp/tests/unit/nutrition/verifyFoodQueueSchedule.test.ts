// Run with: npm run test:file tests/unit/nutrition/verifyFoodQueueSchedule.test.ts
//
// The drain itself is covered by verificationQueueDrain.test.ts. THIS file
// covers the part that made the verification pipeline useless until now:
// nothing ran it. 45 foods sat in `verification.state: 'queued'` from the
// 2026-08-13 coherence audit to the day this shipped, because the queue had
// three writers and no reader.
//
// A schedule is configuration, so the only thing that can check it is a scan —
// but every way it can be wrong is visible in the text:
//
//   - more than one thing schedules it (production and beta are two workspaces
//     over ONE database, so a second schedule is a second runner over the same
//     rows — and here a duplicate runner is a duplicate grounded web search per
//     food, which is the metered cost in this pipeline),
//   - it calls beta, or a host that is not production,
//   - the endpoint drains before it checks the secret, or `?dryRun=1` is
//     accepted and then written through anyway,
//   - the route grows its own copy of the queue rules, or its own verifier.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const WEBAPP = path.join(__dirname, '../../..')
const REPO = path.join(WEBAPP, '..')
const WORKFLOW_DIR = path.join(REPO, '.github/workflows')
const WORKFLOW_NAME = 'verify-food-queue.yml'

const WORKFLOW = fs.readFileSync(path.join(WORKFLOW_DIR, WORKFLOW_NAME), 'utf8')
const ROUTE = fs.readFileSync(
  path.join(WEBAPP, 'app/api/cron/verify-food-queue/route.ts'),
  'utf8',
)
const DRAIN = fs.readFileSync(path.join(WEBAPP, 'lib/nutrition/verificationQueue.ts'), 'utf8')

const ENDPOINT = '/api/cron/verify-food-queue'
const PROD_HOST = 'become.redbtn.io'
const BETA_HOST = 'become-beta.redbtn.io'

/** The workflow with its comments stripped: what actually runs. */
const EXECUTABLE = WORKFLOW.split('\n')
  .filter((line) => !/^\s*#/.test(line))
  .join('\n')

// ── One place only ───────────────────────────────────────────────────────────

test('exactly one workflow in the repo calls the drain endpoint', () => {
  const callers = fs
    .readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
    .filter((f) => fs.readFileSync(path.join(WORKFLOW_DIR, f), 'utf8').includes(ENDPOINT))

  assert.deepEqual(callers, [WORKFLOW_NAME])
})

test('it calls production, and never the beta host', () => {
  // Comments are allowed to explain why beta is excluded; the job itself may
  // not name it. Beta shares production's database, so a second runner there
  // would drain the same queue and pay for the same searches twice.
  assert.ok(
    EXECUTABLE.includes(`https://${PROD_HOST}`),
    'the production base URL must be explicit in the job',
  )
  assert.ok(!EXECUTABLE.includes(BETA_HOST), 'the job must not call beta')
})

test('the workflow is triggered by the schedule and by hand, never by a push', () => {
  assert.match(WORKFLOW, /^on:/m)
  assert.match(WORKFLOW, /^ {2}schedule:/m)
  assert.match(WORKFLOW, /^ {2}workflow_dispatch:/m)
  assert.ok(!/^ {2}push:/m.test(WORKFLOW), 'a deploy must not spend the AI budget')
  // One runner at a time, like the other two schedules.
  assert.match(WORKFLOW, /^concurrency:/m)
})

test('the schedule runs at least daily, and not on the hour', () => {
  const cron = /cron:\s*'([^']+)'/.exec(WORKFLOW)
  assert.ok(cron, 'the workflow must declare a cron expression')

  const [minute, , dayOfMonth, month, dayOfWeek] = cron[1].trim().split(/\s+/)
  // Anything narrower than "every day" is not a drain, it is a reminder.
  assert.equal(dayOfMonth, '*')
  assert.equal(month, '*')
  assert.equal(dayOfWeek, '*')
  // Not on the hour — that is the busiest minute on GitHub's scheduler and the
  // one most likely to be delayed.
  assert.notEqual(minute, '0')
})

test('the job authenticates with the cron secret the other schedules already use', () => {
  assert.match(EXECUTABLE, /secrets\.BECOME_CRON_SECRET/)
  assert.match(EXECUTABLE, /x-cron-secret: \$\{CRON_SECRET\}/)
  // Missing secret fails the job loudly rather than silently doing nothing.
  assert.match(EXECUTABLE, /::error::BECOME_CRON_SECRET is missing/)
  // The secret is never pasted into a URL that could land in an access log.
  assert.ok(!/secret=\$\{/.test(EXECUTABLE))
})

test('the hand-run dry run reaches the endpoint as ?dryRun=1', () => {
  assert.match(EXECUTABLE, /dryRun:/, 'workflow_dispatch must offer a dry run')
  assert.match(EXECUTABLE, /\?dryRun=1/)
  // Inputs travel through env, never interpolated into the shell line: an
  // input is attacker-controllable text.
  assert.match(EXECUTABLE, /DRY_RUN: \$\{\{ inputs\.dryRun \}\}/)
  assert.ok(
    !/\$\{\{\s*inputs\.\w+\s*\}\}/.test(EXECUTABLE.split('run: |')[1] ?? ''),
    'no input may be interpolated inside a run: block',
  )
})

// ── The endpoint ─────────────────────────────────────────────────────────────

test('the secret is checked before anything is drained', () => {
  const unauthorized = ROUTE.indexOf("{ error: 'Unauthorized' }")
  const drain = ROUTE.indexOf('runVerificationQueueDrain(')
  assert.ok(unauthorized > -1, 'the route must refuse an unauthenticated call')
  assert.ok(drain > unauthorized, 'the drain must not run before the secret is checked')
  // Same secret as every other cron route: one cron credential for the app.
  assert.match(ROUTE, /secret !== admin\.cronSecret/)
  // Header or query string, exactly like resweep-tiers.
  assert.match(ROUTE, /x-cron-secret/)
  assert.match(ROUTE, /searchParams\.get\('secret'\)/)
})

test('GET and POST both work, and the route is never cached', () => {
  assert.match(ROUTE, /export const dynamic = 'force-dynamic'/)
  assert.match(ROUTE, /export async function GET\(/)
  assert.match(ROUTE, /export async function POST\(/)
})

test('?dryRun=1 is what turns the writes off, in one place', () => {
  assert.match(ROUTE, /searchParams\.get\('dryRun'\)/)
  assert.match(ROUTE, /apply: !dryRun/)
  // The route is not allowed to write the catalogue itself, dry run or not:
  // every write lives behind `apply` inside the drain.
  assert.ok(
    !/updateOne\(|updateMany\(|bulkWrite\(|findOneAndUpdate\(|deleteOne\(|\.create\(/.test(ROUTE),
    'the route must not issue a write of its own',
  )
})

test('the route holds no copy of the queue rules and no second verifier', () => {
  // A second spelling of the selector, the TTL or the batch bound is how the
  // scheduled drain and the flag route start disagreeing about who owns a food.
  assert.ok(!ROUTE.includes("'verification.state'"), 'the route must not restate the selector')
  assert.ok(!ROUTE.includes('CLAIM_TTL_MS'), 'the TTL belongs to flagPolicy')
  assert.ok(!/runStructuredTask\(/.test(ROUTE), 'the route must not prompt a model itself')
  assert.match(ROUTE, /runVerificationQueueDrain\(/)
  assert.match(ROUTE, /verifyFood\(foodId\)/)
})

test('a run that changes nothing writes nothing', () => {
  // No heartbeat row, no "nothing to do" audit record: the only writes in the
  // whole path are the claim, the release and the re-queue, and all three are
  // per-food.
  assert.ok(!/Run\.create\(|new .*Run\(/.test(ROUTE))
  assert.match(DRAIN, /if \(!opts\.apply\)/)
  const dryRunGuard = DRAIN.indexOf('if (!opts.apply)')
  const firstWrite = DRAIN.indexOf('opts.foods.findOneAndUpdate(')
  assert.ok(dryRunGuard > -1 && firstWrite > dryRunGuard, 'every write sits after the dry-run exit')
})

// ── What the drain is not allowed to touch ───────────────────────────────────

test('neither the route nor the drain flips isVerified or a review decision', () => {
  // `verifyFood` owns the outcome and the evidence that justifies it. A MANUAL
  // reviewFlag decision must survive every automatic writer that passes over
  // the row, and `needsReview` is a separate queue with separate rules.
  for (const [name, src] of [['route', ROUTE], ['drain', DRAIN]] as const) {
    for (const field of ['isVerified', 'needsReview', 'reviewFlag']) {
      assert.ok(
        !new RegExp(`['"\`]?${field}['"\`]?\\s*:`).test(src.replace(/^\s*\*.*$/gm, '')),
        `${name} must not write ${field}`,
      )
    }
  }
})

test('the drain calls flagPolicy rather than restating the claim rule', () => {
  assert.match(DRAIN, /from '\.\/flagPolicy'/)
  assert.match(DRAIN, /CLAIM_TTL_MS/)
  assert.match(DRAIN, /canClaim\(/)
  // And it never re-runs the needsReview rules: that is a different queue.
  assert.ok(!/foodQuality|needsReview/.test(DRAIN.replace(/^\s*\*.*$/gm, '')))
})

// ── The documentation that said nothing drains it ────────────────────────────

test('the audit script no longer queues into a void', () => {
  const SCRIPT = fs.readFileSync(path.join(WEBAPP, 'scripts/audit-food-coherence.mjs'), 'utf8')
  assert.ok(
    SCRIPT.includes(ENDPOINT),
    'the script that fills the queue must point at the job that drains it',
  )
})
