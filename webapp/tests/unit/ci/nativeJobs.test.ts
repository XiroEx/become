// Run with: npm run test:file tests/unit/ci/nativeJobs.test.ts
//
// CI used to run in webapp/ and nowhere else. The native app had exactly one
// check — tests/unit/account/storeReadiness.test.tsx, which reads a handful of
// expo/ sources as TEXT — so a type error, a failing Expo test or a dependency
// pinned outside the installed SDK's range all merged silently, and the first
// thing to notice was a store build that would not bundle.
//
// ci.yml now has an `expo` job and a `shared-api-client` job. A job is
// configuration, so the only thing that can check it is a scan of the text —
// and this scan lives in the WEBAPP suite on purpose: `verify` runs on every PR
// to main and beta, so deleting the native jobs fails a check that still runs.
// A test inside expo/ could not say that; it would disappear with the job.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.join(__dirname, '../../../..')
const WORKFLOW_PATH = path.join(REPO, '.github/workflows/ci.yml')
const WORKFLOW = fs.readFileSync(WORKFLOW_PATH, 'utf8')

const readJson = (rel: string) =>
  JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

/** The body of every top-level job in `jobs:`, keyed by job name. */
function jobBlocks(src: string): Record<string, string> {
  const lines = src.split('\n')
  const start = lines.findIndex((line) => /^jobs:\s*$/.test(line))
  assert.ok(start > -1, 'ci.yml has no top-level `jobs:` block')

  const jobs: Record<string, string> = {}
  let current: string | null = null
  for (const line of lines.slice(start + 1)) {
    // A non-indented, non-comment key means we have left `jobs:`.
    if (/^[A-Za-z]/.test(line)) break
    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (header) {
      current = header[1]
      jobs[current] = ''
      continue
    }
    if (current) jobs[current] += `${line}\n`
  }
  return jobs
}

const JOBS = jobBlocks(WORKFLOW)

/** A job body with its comments removed, so a comment cannot satisfy a scan. */
function executable(job: string): string {
  return job
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

// ── The jobs exist ───────────────────────────────────────────────────────────

test('ci.yml has a webapp job, an expo job and a shared-api-client job', () => {
  for (const name of ['verify', 'expo', 'shared-api-client', 'changes']) {
    assert.ok(JOBS[name] !== undefined, `ci.yml has no \`${name}\` job`)
  }
})

test('the workflow runs on pushes and PRs to main and beta', () => {
  const on = WORKFLOW.slice(WORKFLOW.indexOf('\non:'), WORKFLOW.indexOf('\njobs:'))
  assert.match(on, /^ {2}push:/m)
  assert.match(on, /^ {2}pull_request:/m)
  assert.match(on, /branches: \[main, beta\]/)
})

test('no workflow-level paths: filter — a filtered-out run never reports at all', () => {
  // A REQUIRED check that never reports blocks the merge forever, which is why
  // the native jobs are gated by the `changes` job and an `if:` instead. A job
  // skipped by `if:` reports as skipped, and branch protection accepts that.
  const on = WORKFLOW.slice(WORKFLOW.indexOf('\non:'), WORKFLOW.indexOf('\njobs:'))
  assert.ok(!/^\s+paths(-ignore)?:/m.test(on), 'ci.yml must not filter runs by path')
})

// ── They run for the PRs that need them ──────────────────────────────────────

test('both native jobs are gated on the changes job, not on nothing', () => {
  for (const name of ['expo', 'shared-api-client']) {
    assert.match(JOBS[name], /needs: changes/, `\`${name}\` must depend on \`changes\``)
    assert.match(
      JOBS[name],
      /if: needs\.changes\.outputs\.native == 'true'/,
      `\`${name}\` must run only when the native half changed`,
    )
  }
})

test('the changes job reports on expo/, shared/ and ci.yml itself', () => {
  const changes = JOBS['changes']
  assert.match(changes, /native: \$\{\{ steps\.filter\.outputs\.native \}\}/)
  // The filter pattern must cover both trees. ci.yml is in there too, so a PR
  // that edits these jobs is checked by the jobs it edits.
  const pattern = /grep -Eq '([^']+)'/.exec(changes)
  assert.ok(pattern, 'the changes job must grep the changed-file list')
  const re = new RegExp(pattern[1])
  assert.ok(re.test('expo/app/(tabs)/dashboard/index.tsx'), 'expo/ must match')
  assert.ok(re.test('shared/api-client/src/tz.ts'), 'shared/ must match')
  assert.ok(re.test('.github/workflows/ci.yml'), 'ci.yml must match')
  assert.ok(!re.test('webapp/app/page.tsx'), 'a webapp-only PR must not match')

  // fetch-depth: 0, or there is no base commit to diff against.
  assert.match(changes, /fetch-depth: 0/)
})

// ── The expo job checks the four things ──────────────────────────────────────

test('the expo job typechecks, lints, tests and checks dependency versions', () => {
  const job = executable(JOBS['expo'])
  assert.match(job, /working-directory: expo/)
  assert.match(job, /node-version: 22/)
  assert.match(job, /cache-dependency-path: expo\/package-lock\.json/)
  assert.match(job, /run: npm ci/)
  assert.match(job, /run: npx tsc --noEmit/)
  assert.match(job, /run: npx eslint \./)
  assert.match(job, /run: npx jest --ci --maxWorkers=2/)
  assert.match(job, /run: npx expo install --check/)
})

test('the shared-api-client job runs its own tests and typecheck on its own lockfile', () => {
  const job = executable(JOBS['shared-api-client'])
  assert.match(job, /working-directory: shared\/api-client/)
  assert.match(job, /node-version: 22/)
  assert.match(job, /cache-dependency-path: shared\/api-client\/package-lock\.json/)
  assert.match(job, /run: npm ci/)
  assert.match(job, /run: npm test/)
  assert.match(job, /run: npx tsc --noEmit/)
})

test('the scripts the jobs call exist in the packages they call them in', () => {
  const shared = readJson('shared/api-client/package.json')
  assert.ok(shared.scripts?.test, 'shared/api-client has no `test` script')
  for (const rel of [
    'expo/package-lock.json',
    'shared/api-client/package-lock.json',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is missing`)
  }
})

// ── A failure has to fail the check ──────────────────────────────────────────

test('no native step swallows its own failure', () => {
  for (const name of ['expo', 'shared-api-client']) {
    // Comments may discuss it; the job itself may not do it.
    const job = executable(JOBS[name])
    assert.ok(
      !/continue-on-error/.test(job),
      `\`${name}\` must not continue on error — a green check would mean nothing`,
    )
    assert.ok(!/\|\| true/.test(job), `\`${name}\` must not swallow an exit code`)
  }
  assert.match(JOBS['expo'], /timeout-minutes: \d+/)
  assert.match(JOBS['shared-api-client'], /timeout-minutes: \d+/)
})

// ── Neither native job needs the private registry ────────────────────────────

test('expo/ and shared/api-client have no @redbtn/* dependency, so no npmrc step', () => {
  // `verify` has to write $HOME/.npmrc from BECOME_NPMRC because webapp depends
  // on packages that live on a private Verdaccio. These two do not, and the
  // jobs are written on that assumption — if a `@redbtn/*` dependency ever
  // lands here, the install 401s and this test says why before CI does.
  for (const rel of ['expo/package.json', 'shared/api-client/package.json']) {
    const pkg = readJson(rel)
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]
    const priv = names.filter((n) => n.startsWith('@redbtn/'))
    assert.deepEqual(priv, [], `${rel} depends on ${priv.join(', ')} — the job needs an npmrc step`)
  }

  for (const name of ['expo', 'shared-api-client']) {
    assert.ok(
      !/BECOME_NPMRC/.test(JOBS[name]),
      `\`${name}\` should not need the private registry`,
    )
  }
})
