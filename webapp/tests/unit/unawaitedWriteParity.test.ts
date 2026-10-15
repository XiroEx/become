// Run with: npm run test:file tests/unit/unawaitedWriteParity.test.ts
//
// ─── Every member-facing route must await its Mongoose writes ─────────────────
//
// Six routes were found starting a Mongo write and returning without awaiting
// it, so the response claims success while the write may never land. Fixed
// routes (/api/mood, /api/program-nudge, /api/suggestions/dismiss,
// /api/checkin, /api/weight, /api/streak) await their writes.
//
// This test is the tripwire: it walks `webapp/app/api/**/*.ts` and FAILS
// when a Mongoose write call — `updateOne`, `updateMany`, `findOneAndUpdate`,
// `findOneAndDelete`, `deleteOne`, `deleteMany`, `create`, `insertMany`,
// `bulkWrite` — appears in statement position: not awaited, not returned,
// not assigned, and not inside a `Promise.all([...])`. Reporting file:line.
//
// Pre-existing violations are allowlisted below with a one-line reason.
// The rule is mechanical on purpose; judgement lives in the allowlist,
// not the scanner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'

/** Mongoose write methods that mutate the database. */
const WRITE_OPERATORS = new Set([
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndDelete',
  'deleteOne',
  'deleteMany',
  'create',
  'insertMany',
  'bulkWrite',
])

/**
 * Pre-existing call sites that start an unawaited Mongoose write in statement position,
 * each with the one-line reason it is allowed to stay. Triage a new failure by awaiting
 * the write call — add an entry here only with a reason, never by touching the scanner.
 *
 * Paths are relative to `webapp/`.
 */
const ALLOWLIST: Record<string, string> = {
  // Scheduled push notification delivery callbacks updating lastPushSentAt timestamps via fire-and-forget updateOne.
  'app/api/cron/notify/route.ts':
    'Scheduled push notification delivery callbacks updating lastPushSentAt timestamps via fire-and-forget updateOne.',

  // Owned by card 6ad01929eabd988f96d4122a; that card fixes the XP grant, not this one.
  'app/api/mind/discipline/route.ts':
    'Owned by card 6ad01929eabd988f96d4122a (/api/mind/discipline fire-and-forget XP grant); do not edit here.',

  // Fire-and-forget evolution score persistence on identity profile fetch.
  'app/api/mind/identity/route.ts':
    'Fire-and-forget evolution score persistence on identity profile fetch.',

  // Fire-and-forget XP grant when member sets their first mission statement.
  'app/api/mind/mission/route.ts':
    'Fire-and-forget XP grant when member sets their first mission statement.',

  // Fire-and-forget XP grant on mind state log creation.
  'app/api/mind/state/route.ts':
    'Fire-and-forget XP grant on mind state log creation.',

  // Self-heal date key migration on legacy DayNutrition documents in GET /api/nutrition/log.
  'app/api/nutrition/log/route.ts':
    'Self-heal date key migration on legacy DayNutrition documents in GET /api/nutrition/log.',

  // Fire-and-forget orphaned program cleanup and active program status self-heals in GET /api/programs/active.
  'app/api/programs/active/route.ts':
    'Fire-and-forget orphaned program cleanup and active program status self-heals in GET /api/programs/active.',

  // Owned by card 6acfea4eeabd988f96d4110f; that card fixes the self-heal updateOne, not this one.
  'app/api/progress/route.ts':
    'Owned by card 6acfea4eeabd988f96d4110f (/api/progress self-heal updateOne); do not edit here.',

  // Fire-and-forget status self-heal restoring scheduled workouts in GET /api/schedule.
  'app/api/schedule/route.ts':
    'Fire-and-forget status self-heal restoring scheduled workouts in GET /api/schedule.',

  // Fire-and-forget cleanup of expired or already-resolved workout logs in GET /api/workouts.
  'app/api/workouts/route.ts':
    'Fire-and-forget cleanup of expired or already-resolved workout logs in GET /api/workouts.',
}

const WEBAPP_ROOT = path.resolve(__dirname, '../..')
const SCAN_ROOTS = [path.join(WEBAPP_ROOT, 'app/api')]

export interface SourceFile {
  /** Path relative to `webapp/`, e.g. `app/api/mood/route.ts`. */
  relPath: string
  source: string
}

export interface WriteViolation {
  relPath: string
  line: number
  call: string
  operator: string
}

export function collectSources(roots: string[], webappRoot: string = WEBAPP_ROOT): SourceFile[] {
  const out: SourceFile[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(full)
        continue
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue
      out.push({ relPath: path.relative(webappRoot, full), source: readFileSync(full, 'utf8') })
    }
  }
  for (const root of roots) {
    if (existsSync(root)) walk(root)
  }
  return out
}

/** Blank out `//…` and `/*…*\/` comments (newline-preserving) so a commented-out operator never trips the scan. */
export function maskComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^\S\n])\/\/[^\n]*/g, (m) => (/^\s/.test(m) ? m[0] + blank(m.slice(1)) : blank(m)))
}

/** Check if an AST node is an argument/element inside Promise.all / Promise.allSettled. */
function isInsidePromiseAll(node: ts.Node): boolean {
  let curr: ts.Node | undefined = node
  while (curr) {
    if (ts.isCallExpression(curr) && ts.isPropertyAccessExpression(curr.expression)) {
      const obj = curr.expression.expression
      const prop = curr.expression.name.text
      if (ts.isIdentifier(obj) && obj.text === 'Promise' && (prop === 'all' || prop === 'allSettled')) {
        return true
      }
    }
    curr = curr.parent
  }
  return false
}

/** Every Mongoose write call site in `source` in statement position, with line numbers. */
export function violationsInSource(source: string): Array<{ line: number; call: string; operator: string }> {
  const masked = maskComments(source)
  const sf = ts.createSourceFile('source.ts', masked, ts.ScriptTarget.Latest, true)
  const out: Array<{ line: number; call: string; operator: string }> = []

  function checkCall(callNode: ts.CallExpression, methodName: string) {
    if (isInsidePromiseAll(callNode)) return

    // Follow the call chain upwards (e.g. .catch(...), .then(...), .finally(...), .lean(), .exec())
    let curr: ts.Node = callNode
    let parent = curr.parent
    while (
      parent &&
      ((ts.isPropertyAccessExpression(parent) && parent.expression === curr) ||
        (ts.isCallExpression(parent) && parent.expression === curr))
    ) {
      curr = parent
      parent = curr.parent
    }

    // Unwrap parentheses and void
    let p = parent
    while (
      p &&
      (ts.isParenthesizedExpression(p) ||
        (ts.isPrefixUnaryExpression(p) && p.operator === ts.SyntaxKind.VoidKeyword))
    ) {
      p = p.parent
    }

    if (!p) return

    // Safe when awaited
    if (ts.isAwaitExpression(p)) return

    // Safe when returned
    if (ts.isReturnStatement(p) || (ts.isArrowFunction(p) && p.body === curr)) return

    // Safe when assigned (variable declaration or assignment expression)
    if (ts.isVariableDeclaration(p) && p.initializer === curr) return
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === curr) return

    // Otherwise, it is in statement position without being awaited, returned, or assigned
    const { line } = sf.getLineAndCharacterOfPosition(callNode.getStart(sf))
    const callText = callNode.expression.getText(sf)
    out.push({ line: line + 1, call: callText, operator: methodName })
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const methodName = node.expression.name.text
      if (WRITE_OPERATORS.has(methodName)) {
        checkCall(node, methodName)
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return out
}

/** Every unawaited write call site across `files`. */
export function writeViolations(files: SourceFile[]): WriteViolation[] {
  const out: WriteViolation[] = []
  for (const { relPath, source } of files) {
    for (const v of violationsInSource(source)) out.push({ relPath, ...v })
  }
  return out
}

/** The violations the tripwire actually fails on — everything not allowlisted. */
export function unallowlistedViolations(
  files: SourceFile[],
  allowlist: Record<string, string> = ALLOWLIST,
): WriteViolation[] {
  return writeViolations(files).filter((v) => !(v.relPath in allowlist))
}

test('every member-facing route awaits its Mongoose writes', () => {
  const files = collectSources(SCAN_ROOTS)
  // A scanner that found nothing would pass silently forever.
  assert.ok(files.length > 200, `expected to scan app/api, found ${files.length} files`)

  const missing = unallowlistedViolations(files)
  const report = missing
    .map((v) => `  webapp/${v.relPath}:${v.line} (${v.call})`)
    .join('\n')
  assert.equal(
    missing.length,
    0,
    'These call sites start a Mongoose write in statement position without await, return,\n'
      + 'or assignment, so the response claims success while the write may never land.\n'
      + 'Await the write — or, when fire-and-forget is genuinely intended or owned by another\n'
      + 'card, allowlist the file in unawaitedWriteParity.test.ts with a one-line reason:\n'
      + report,
  )
})

test('the scan flags an unawaited Mongoose write in statement position', () => {
  // Proves the tripwire actually trips — the failure mode of a scanner test is
  // passing on an empty or wrongly-shaped input.
  const invented: SourceFile[] = [
    {
      relPath: 'app/api/sample/route.ts',
      source: 'UserProgress.updateOne({ userId }, { $set: { mood } }).catch(() => {})\n',
    },
  ]
  const missing = unallowlistedViolations(invented, {})
  assert.deepEqual(missing.map((v) => `${v.relPath}:${v.line} ${v.call}`), [
    'app/api/sample/route.ts:1 UserProgress.updateOne',
  ])

  // Also trips without .catch()
  assert.equal(
    violationsInSource('UserProgress.updateOne({ userId }, { $set: { mood } })\n').length,
    1,
  )

  // Trips with void keyword
  assert.equal(
    violationsInSource('void MindProgress.findOneAndUpdate({ userId }, { $inc: { xp: 20 } })\n').length,
    1,
  )

  // Trips inside block in callback
  assert.equal(
    violationsInSource('const cb = () => { Model.create({ title }) }\n').length,
    1,
  )
})

test('awaited, returned, assigned, and Promise.all writes stay quiet', () => {
  // Awaited write
  assert.deepEqual(
    violationsInSource('await UserProgress.updateOne({ userId }, { $set: { mood } })\n'),
    [],
  )

  // Awaited with .catch()
  assert.deepEqual(
    violationsInSource('await UserProgress.updateOne({ userId }, { $set: { mood } }).catch(() => {})\n'),
    [],
  )

  // Returned write
  assert.deepEqual(
    violationsInSource('return MindProgress.findOneAndUpdate({ userId }, { $inc: { xp: 20 } })\n'),
    [],
  )

  // Returned with .catch()
  assert.deepEqual(
    violationsInSource('return MindProgress.findOneAndUpdate({ userId }, { $inc: { xp: 20 } }).catch(() => {})\n'),
    [],
  )

  // Concise arrow function returning promise
  assert.deepEqual(
    violationsInSource('const update = () => UserProgress.updateOne({ userId }, { $set: { mood } })\n'),
    [],
  )

  // Assigned to variable declaration
  assert.deepEqual(
    violationsInSource('const doc = await DisciplineChallenge.findOneAndUpdate({ userId }, { completed: true })\n'),
    [],
  )
  assert.deepEqual(
    violationsInSource('const promise = UserProgress.updateOne({ userId }, { $set: { mood } })\n'),
    [],
  )

  // Assigned in assignment expression
  assert.deepEqual(
    violationsInSource('let res; res = UserProgress.updateOne({ userId }, { $set: { mood } })\n'),
    [],
  )

  // Inside Promise.all
  assert.deepEqual(
    violationsInSource('await Promise.all([User.findByIdAndDelete(id), UserProgress.deleteOne({ userId })])\n'),
    [],
  )

  // Inside Promise.allSettled
  assert.deepEqual(
    violationsInSource('await Promise.allSettled([UserProgress.updateOne({ userId }, { $set: { mood } })])\n'),
    [],
  )

  // Commented-out write
  assert.deepEqual(
    violationsInSource('// UserProgress.updateOne({ userId }, { $set: { mood } })\n/* MindProgress.findOneAndUpdate() */\n'),
    [],
  )
})

test('the scan trips through the real filesystem walk, not just a literal', () => {
  // Same tripwire, but through the filesystem walk rather than a literal —
  // this is the path the assertion above cannot cover.
  const root = mkdtempSync(path.join(tmpdir(), 'unawaited-write-scan-'))
  mkdirSync(path.join(root, 'app/api/tripping'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/tripping/route.ts'),
    'UserProgress.updateOne({ userId }, { $set: { mood } }).catch(() => {})\n',
  )
  // A route using awaited writes stays quiet.
  mkdirSync(path.join(root, 'app/api/quiet'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/quiet/route.ts'),
    'await UserProgress.updateOne({ userId }, { $set: { mood } })\n',
  )

  const scanned = collectSources([path.join(root, 'app/api')], root)
  assert.equal(scanned.length, 2)
  const missing = unallowlistedViolations(scanned, {})
  assert.deepEqual(missing.map((v) => `${v.relPath}:${v.line} ${v.call}`), [
    'app/api/tripping/route.ts:1 UserProgress.updateOne',
  ])
})

test('every allowlist entry carries a reason and names a real file', () => {
  // A bare path with no reason (or a stale path after a rename) would silently
  // excuse a file nobody can justify — the allowlist is where judgement lives,
  // so each entry must show its work.
  for (const [relPath, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(reason.trim().length > 0, `allowlist entry "${relPath}" carries no reason`)
    assert.ok(existsSync(path.join(WEBAPP_ROOT, relPath)), `allowlist entry "${relPath}" names no file under webapp/`)
  }
})
