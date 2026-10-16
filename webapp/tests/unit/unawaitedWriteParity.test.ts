// Run with: npm run test:file tests/unit/unawaitedWriteParity.test.ts
//
// ─── Every member-facing route must await its Mongo writes ──────────────────
//
// A route that starts a Mongo write and returns without awaiting it claims
// success to the caller while the write may fail or never land. Six routes
// were found unawaited (mood, program-nudge, suggestions/dismiss, checkin,
// weight, streak). This tripwire scans `webapp/app/api` and FAILS when a
// Mongoose write call appears in statement position (not awaited, not returned,
// not assigned, not inside Promise.all) — unless the file is allowlisted below
// with a reason. Judgement lives in the allowlist, not the scanner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'

/** Mongoose write methods that mutate the database. */
const WRITE_METHODS = new Set([
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
 * Pre-existing call sites with unawaited writes, each with the one-line reason
 * it is allowed to stay. Triage a new failure by awaiting the write or returning
 * its promise — add an entry here only with a reason, never by touching the scanner.
 *
 * Paths are relative to `webapp/`.
 */
const ALLOWLIST: Record<string, string> = {
  'app/api/cron/notify/route.ts':
    'Cron push notification throttle/timestamp updates fired inside callback without awaiting.',
  'app/api/mind/state/route.ts':
    'MindProgress.findOneAndUpdate XP grant is fire-and-forget in POST.',
  'app/api/nutrition/log/route.ts':
    'DayNutrition.updateOne self-heal date key migration is fire-and-forget in GET.',
  'app/api/schedule/route.ts':
    'Schedule.updateOne self-healing of overdue scheduled workout status in GET is fire-and-forget.',
  'app/api/workouts/route.ts':
    'UserProgress.updateOne cleanup of expired logs in GET is fire-and-forget.',
}

const WEBAPP_ROOT = path.resolve(__dirname, '../..')
const SCAN_ROOTS = [path.join(WEBAPP_ROOT, 'app/api')]

interface SourceFile {
  /** Path relative to `webapp/`, e.g. `app/api/mood/route.ts`. */
  relPath: string
  source: string
}

export interface WriteViolation {
  relPath: string
  line: number
  method: string
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
  for (const root of roots) walk(root)
  return out
}

/** Every unawaited write call site in `source`, with line numbers. */
export function violationsInSource(source: string, fileName = 'source.ts'): Array<{ line: number; method: string }> {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const out: Array<{ line: number; method: string }> = []

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      let methodName: string | null = null
      if (ts.isPropertyAccessExpression(node.expression)) {
        methodName = node.expression.name.text
      }
      if (methodName && WRITE_METHODS.has(methodName)) {
        // Follow call chain upward (e.g. .catch(...), .then(...), .exec())
        let curr: ts.Node = node
        while (
          curr.parent
          && ts.isPropertyAccessExpression(curr.parent)
          && curr.parent.expression === curr
          && curr.parent.parent
          && ts.isCallExpression(curr.parent.parent)
          && curr.parent.parent.expression === curr.parent
        ) {
          curr = curr.parent.parent
        }

        // Unwrap parentheses and void
        let p: ts.Node | undefined = curr.parent
        while (p && (ts.isParenthesizedExpression(p) || ts.isVoidExpression(p))) {
          p = p.parent
        }

        if (p && ts.isExpressionStatement(p)) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
          out.push({ line: line + 1, method: methodName })
        }
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
    for (const v of violationsInSource(source, relPath)) out.push({ relPath, ...v })
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

test('every member-facing route under app/api awaits or returns Mongoose write calls', () => {
  const files = collectSources(SCAN_ROOTS)
  // A scanner that found nothing would pass silently forever.
  assert.ok(files.length > 200, `expected to scan app/api, found ${files.length} files`)

  const missing = unallowlistedViolations(files)
  const report = missing
    .map((v) => `  webapp/${v.relPath}:${v.line} (${v.method} in statement position)`)
    .join('\n')
  assert.equal(
    missing.length,
    0,
    'These call sites start a Mongoose write in statement position without await, return,\n'
      + 'assignment, or Promise.all. Await the call or return its promise — or, when\n'
      + 'fire-and-forget is genuinely intended, allowlist the file in unawaitedWriteParity.test.ts\n'
      + 'with a one-line reason naming the owning card:\n'
      + report,
  )
})

test('the scan flags an unawaited write in statement position', () => {
  // Proves the tripwire actually trips — the failure mode of a scanner test is
  // passing on an empty or wrongly-shaped input.
  const invented: SourceFile[] = [
    {
      relPath: 'app/api/foo/route.ts',
      source: 'UserProgress.updateOne({ userId }, { $set: { x: 1 } }).catch(() => {})',
    },
  ]
  const missing = unallowlistedViolations(invented, {})
  assert.equal(missing.length, 1)
  assert.equal(missing[0].method, 'updateOne')
})

test('the scan flags all Mongoose write methods in statement position', () => {
  for (const method of WRITE_METHODS) {
    const violations = violationsInSource(`Model.${method}({ id: 1 });\n`)
    assert.equal(violations.length, 1, `expected ${method} to be flagged in statement position`)
    assert.equal(violations[0].method, method)
  }
})

test('awaited, returned, assigned, and Promise.all writes stay quiet', () => {
  assert.deepEqual(violationsInSource('await User.updateOne({ _id }, { $set: { a: 1 } })'), [])
  assert.deepEqual(violationsInSource('return User.updateOne({ _id }, { $set: { a: 1 } })'), [])
  assert.deepEqual(violationsInSource('const p = User.updateOne({ _id }, { $set: { a: 1 } })'), [])
  assert.deepEqual(violationsInSource('let p; p = User.updateOne({ _id }, { $set: { a: 1 } })'), [])
  assert.deepEqual(violationsInSource('Promise.all([User.updateOne({ _id }, { $set: { a: 1 } })])'), [])
  assert.deepEqual(violationsInSource('await Promise.all([User.updateOne({ _id }, { $set: { a: 1 } })])'), [])
})

test('the scan flags void unawaited writes', () => {
  const violations = violationsInSource(
    'void MindProgress.findOneAndUpdate({ userId }, { $inc: { xp: 20 } }).catch(() => {})',
  )
  assert.equal(violations.length, 1)
  assert.equal(violations[0].method, 'findOneAndUpdate')
})

test('the scan trips through the real filesystem walk, not just a literal', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'unawaited-write-scan-'))
  mkdirSync(path.join(root, 'app/api/fake'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/fake/route.ts'),
    'export async function POST() { Model.updateOne({ id: 1 }, { $set: { a: 2 } }).catch(() => {}) }\n',
  )
  // A call site that awaits stays quiet.
  mkdirSync(path.join(root, 'app/api/good'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/good/route.ts'),
    'export async function POST() { await Model.updateOne({ id: 1 }, { $set: { a: 2 } }) }\n',
  )

  const scanned = collectSources([path.join(root, 'app/api')], root)
  assert.equal(scanned.length, 2)
  const missing = unallowlistedViolations(scanned, {})
  assert.deepEqual(
    missing.map((v) => `${v.relPath}:${v.line} ${v.method}`),
    ['app/api/fake/route.ts:1 updateOne'],
  )
})

test('every allowlist entry carries a reason and names a real file', () => {
  for (const [relPath, reason] of Object.entries(ALLOWLIST)) {
    assert.ok(reason.trim().length > 0, `allowlist entry "${relPath}" carries no reason`)
    assert.ok(existsSync(path.join(WEBAPP_ROOT, relPath)), `allowlist entry "${relPath}" names no file under webapp/`)
  }
})

test('every allowlist entry produces at least one real violation', () => {
  // An obsolete entry outlives the violation it was written for and silently
  // excuses every future unawaited Mongo write in that whole file. Every entry
  // must match at least one live violation from the real scan.
  const violations = writeViolations(collectSources(SCAN_ROOTS))
  const violatingPaths = new Set(violations.map((v) => v.relPath))
  for (const relPath of Object.keys(ALLOWLIST)) {
    assert.ok(
      violatingPaths.has(relPath),
      `ALLOWLIST entry "${relPath}" is obsolete: it produces no unawaited-write violations from the real scan. Delete the entry from ALLOWLIST.`,
    )
  }
})
