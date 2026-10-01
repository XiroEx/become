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
  for (const name of ['verify', 'expo', 'shared-api-client', 'shared-core', 'changes']) {
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
  for (const name of ['expo', 'shared-api-client', 'shared-core']) {
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
  // Offline: the check must not call Expo's servers (no Expo-hosted services).
  assert.match(job, /EXPO_OFFLINE: '1'\n\s+run: npx expo install --check/)
})

// ── …and it refuses to let OTA back in (NP-040) ──────────────────────────────

test('the expo job runs the no-OTA / no-EAS guard', () => {
  // George, 2026-09-30: no Expo-HOSTED service anywhere — no EAS Build, EAS
  // Submit, EAS Update, Expo Push, expo.dev. For v1 that means no OTA at all:
  // every change ships as a store build and the minimum-version gate (NP-041)
  // forces an urgent upgrade. OTA returns as configuration, not as code — an
  // `eas.json` and `expo-updates` in the lockfile — so the guard is a step, and
  // this assertion is in the ALWAYS-run webapp job so deleting the step fails a
  // check that still reports.
  const job = executable(JOBS['expo'])
  assert.match(
    job,
    /run: node scripts\/check-no-ota\.mjs/,
    'the expo job must run expo/scripts/check-no-ota.mjs',
  )
  assert.ok(
    fs.existsSync(path.join(REPO, 'expo/scripts/check-no-ota.mjs')),
    'expo/scripts/check-no-ota.mjs is missing — the guard step would fail the job',
  )
})

test('no eas.json, and no expo-updates in the native dependency tree', () => {
  // The same four footprints the guard checks, asserted here too: the guard
  // only runs when expo/ or shared/ changed, and an eas.json can arrive in a
  // PR that touches neither.
  assert.ok(!fs.existsSync(path.join(REPO, 'expo/eas.json')), 'expo/eas.json is back')
  assert.ok(!fs.existsSync(path.join(REPO, 'eas.json')), 'a root eas.json is back')

  const expo = readJson('expo/package.json')
  for (const field of ['dependencies', 'devDependencies'] as const) {
    assert.ok(
      !Object.keys(expo[field] ?? {}).includes('expo-updates'),
      `expo/package.json ${field} declares expo-updates — v1 has no OTA`,
    )
  }
  const lock = fs.readFileSync(path.join(REPO, 'expo/package-lock.json'), 'utf8')
  assert.ok(
    !/"node_modules\/expo-updates"/.test(lock),
    'expo/package-lock.json resolves expo-updates (directly or via a preset)',
  )
  for (const [name, body] of Object.entries(expo.scripts ?? {})) {
    assert.ok(
      !/(^|[^\w-])eas(\s|$)/.test(body),
      `expo/package.json script "${name}" runs the EAS CLI: ${body}`,
    )
  }

  const appJson = JSON.parse(
    fs.readFileSync(path.join(REPO, 'expo/app.json'), 'utf8'),
  ) as { expo: Record<string, unknown> & { extra?: { eas?: unknown } } }
  for (const key of ['updates', 'runtimeVersion', 'owner'] as const) {
    assert.equal(appJson.expo[key], undefined, `app.json sets expo.${key} — that is OTA config`)
  }
  assert.equal(appJson.expo.extra?.eas, undefined, 'app.json sets expo.extra.eas')
})

// ── …and it bundles, which is the only step that builds the app ──────────────

test('the expo job exports an iOS bundle, so an unresolvable import fails CI', () => {
  // tsc resolves `@become/api-client` through tsconfig `paths` and Jest through
  // `moduleNameMapper`; Metro uses neither. Both were green for weeks while the
  // bundler could not resolve the package at all and no store build could be
  // produced. Only an export walks the real module graph.
  const job = executable(JOBS['expo'])
  assert.match(
    job,
    /run: npx expo export --platform ios --output-dir/,
    'the expo job must export a bundle — nothing else in it builds the app',
  )
})

test('the native app links the shared client as a dependency, not only as a tsconfig path', () => {
  // The path mapping and the Jest mapper keep tsc and Jest green on their own.
  // The `file:` link is what puts the package in node_modules, which is the
  // only route Metro has to it.
  const expo = readJson('expo/package.json')
  assert.equal(
    expo.dependencies?.['@become/api-client'],
    'file:../shared/api-client',
    'expo/package.json must link the shared client for Metro to resolve it',
  )
  assert.equal(
    expo.dependencies?.['@become/core'],
    'file:../shared/core',
    'expo/package.json must link @become/core for Metro to resolve it',
  )

  // `npm ci` refuses to run when the lockfile does not describe package.json,
  // which would take the whole expo job down before it reached the bundle step.
  const lock = JSON.parse(
    fs.readFileSync(path.join(REPO, 'expo/package-lock.json'), 'utf8'),
  ) as { packages?: Record<string, { link?: boolean; resolved?: string }> }
  const linked = lock.packages?.['node_modules/@become/api-client']
  assert.ok(linked?.link, 'expo/package-lock.json must carry the @become/api-client link')
  assert.equal(linked?.resolved, '../shared/api-client')

  const coreLinked = lock.packages?.['node_modules/@become/core']
  assert.ok(coreLinked?.link, 'expo/package-lock.json must carry the @become/core link')
  assert.equal(coreLinked?.resolved, '../shared/core')
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

test('the shared-core job runs its build, tests and typecheck on its own lockfile', () => {
  const job = executable(JOBS['shared-core'])
  assert.match(job, /working-directory: shared\/core/)
  assert.match(job, /node-version: 22/)
  assert.match(job, /cache-dependency-path: shared\/core\/package-lock\.json/)
  assert.match(job, /run: npm ci/)
  assert.match(job, /run: npm run build/)
  assert.match(job, /run: npm test/)
  assert.match(job, /run: npm run typecheck/)
})

test('the scripts the jobs call exist in the packages they call them in', () => {
  const shared = readJson('shared/api-client/package.json')
  assert.ok(shared.scripts?.test, 'shared/api-client has no `test` script')
  const core = readJson('shared/core/package.json')
  assert.ok(core.scripts?.build, 'shared/core has no `build` script')
  assert.ok(core.scripts?.test, 'shared/core has no `test` script')
  assert.ok(core.scripts?.typecheck, 'shared/core has no `typecheck` script')
  for (const rel of [
    'expo/package-lock.json',
    'shared/api-client/package-lock.json',
    'shared/core/package-lock.json',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), `${rel} is missing`)
  }
})

// ── A failure has to fail the check ──────────────────────────────────────────

test('no native step swallows its own failure', () => {
  for (const name of ['expo', 'shared-api-client', 'shared-core']) {
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
  assert.match(JOBS['shared-core'], /timeout-minutes: \d+/)
})

// ── Neither native job needs the private registry ────────────────────────────

test('expo/ and shared/api-client have no @redbtn/* dependency, so no npmrc step', () => {
  // `verify` has to write $HOME/.npmrc from BECOME_NPMRC because webapp depends
  // on packages that live on a private Verdaccio. These two do not, and the
  // jobs are written on that assumption — if a `@redbtn/*` dependency ever
  // lands here, the install 401s and this test says why before CI does.
  for (const rel of ['expo/package.json', 'shared/api-client/package.json', 'shared/core/package.json']) {
    const pkg = readJson(rel)
    const names = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ]
    const priv = names.filter((n) => n.startsWith('@redbtn/'))
    assert.deepEqual(priv, [], `${rel} depends on ${priv.join(', ')} — the job needs an npmrc step`)
  }

  for (const name of ['expo', 'shared-api-client', 'shared-core']) {
    assert.ok(
      !/BECOME_NPMRC/.test(JOBS[name]),
      `\`${name}\` should not need the private registry`,
    )
  }
})
