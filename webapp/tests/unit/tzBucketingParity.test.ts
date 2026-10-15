// Run with: npm run test:file tests/unit/tzBucketingParity.test.ts
//
// ─── Every Mongo date-bucketing call site must name its timezone ─────────────
//
// `$dateToString` (and its siblings below) buckets in UTC unless the options
// object carries a `timezone`. A route that buckets by day and passes none
// answers for the UTC day — exactly how GET /api/dashboard/tiles shipped a
// 14-day meal rollup with no `timezone` (card 6acfca83eabd988f96d41067).
//
// The sibling tripwire (`tzFamilyParity.test.ts`) only sees routes that READ
// `tz`: a day-shaped route that reads no `tz` at all is invisible to it. This
// test covers the opposite direction: it scans `webapp/app/api` AND
// `webapp/lib` for the Mongo date-bucketing operators and FAILS when a call
// site does not pass `timezone` in the same options object — unless the file is
// allowlisted below with a reason. The rule is mechanical on purpose; judgement
// lives in the allowlist, not the scanner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/** Mongo operators that bucket a date in UTC unless given `timezone`. */
const BUCKETING_OPERATORS = [
  'dateToString',
  'dateToParts',
  'dateTrunc',
  'dayOfYear',
  'dayOfMonth',
  'dayOfWeek',
  'week',
  'month',
  'year',
] as const

const OPERATOR_RE = /\$(dateToString|dateToParts|dateTrunc|dayOfYear|dayOfMonth|dayOfWeek|week|month|year)\b/g

/**
 * Pre-existing call sites without an explicit `timezone`, each with the
 * one-line reason it is allowed to stay. Triage a new failure by passing
 * `timezone` in the same options object — add an entry here only with a reason,
 * never by touching the scanner.
 *
 * Paths are relative to `webapp/`.
 */
const ALLOWLIST: Record<string, string> = {
  'lib/dashboardTiles/nutritionRollup.ts':
    'Buckets on a caller-offset-shifted instant ($subtract of the tz the dashboard route reads), so a `timezone` option would be redundant.',
  'app/api/admin/stats/route.ts':
    'Coach-only console aggregating every member in UTC for an overview chart; not scoped to any member local day.',
}

const WEBAPP_ROOT = path.resolve(__dirname, '../..')
const SCAN_ROOTS = [path.join(WEBAPP_ROOT, 'app/api'), path.join(WEBAPP_ROOT, 'lib')]

interface SourceFile {
  /** Path relative to `webapp/`, e.g. `app/api/mood/route.ts`. */
  relPath: string
  source: string
}

export interface BucketingViolation {
  relPath: string
  line: number
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
  for (const root of roots) walk(root)
  return out
}

/** Blank out `//…` and `/*…*\/` comments (newline-preserving) so a commented-out operator never trips the scan. */
export function maskComments(source: string): string {
  const blank = (m: string) => m.replace(/[^\n]/g, ' ')
  return source
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^\S\n])\/\/[^\n]*/g, (m) => (/^\s/.test(m) ? m[0] + blank(m.slice(1)) : blank(m)))
}

/** Index just past the matching `}` for the `{` at `openIndex`, quote-aware. -1 when unbalanced. */
function findObjectEnd(src: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/** Every date-bucketing call site in `source` that passes no `timezone`, with line numbers. */
export function violationsInSource(source: string): Array<{ line: number; operator: string }> {
  const masked = maskComments(source)
  const out: Array<{ line: number; operator: string }> = []
  OPERATOR_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = OPERATOR_RE.exec(masked)) !== null) {
    const operator = m[1]
    // The value after `$op:` — when it is an object literal, `timezone` must be
    // one of its keys; the shorthand form (`$month: '$date'`) carries no
    // options object at all, so it cannot name one.
    const rest = masked.slice(m.index + m[0].length)
    const colon = /^[\s]*:/.exec(rest)
    let hasTimezone = false
    if (colon) {
      const after = rest.slice(colon[0].length)
      const open = /^[\s]*\{/.exec(after)
      if (open) {
        const openIndex = m.index + m[0].length + colon[0].length + (open[0].length - 1)
        const end = findObjectEnd(masked, openIndex)
        if (end !== -1) {
          hasTimezone = /\btimezone\b/.test(masked.slice(openIndex, end))
        }
      }
    }
    if (!hasTimezone) {
      const line = masked.slice(0, m.index).split('\n').length
      out.push({ line, operator: `$${operator}` })
    }
  }
  return out
}

/** Every un-`timezone`d bucketing call site across `files`. */
export function bucketingViolations(files: SourceFile[]): BucketingViolation[] {
  const out: BucketingViolation[] = []
  for (const { relPath, source } of files) {
    for (const v of violationsInSource(source)) out.push({ relPath, ...v })
  }
  return out
}

/** The violations the tripwire actually fails on — everything not allowlisted. */
export function unallowlistedViolations(files: SourceFile[], allowlist: Record<string, string> = ALLOWLIST): BucketingViolation[] {
  return bucketingViolations(files).filter((v) => !(v.relPath in allowlist))
}

test('every Mongo date-bucketing call site passes an explicit timezone', () => {
  const files = collectSources(SCAN_ROOTS)
  // A scanner that found nothing would pass silently forever.
  assert.ok(files.length > 400, `expected to scan app/api + lib, found ${files.length} files`)

  const missing = unallowlistedViolations(files)
  const report = missing
    .map((v) => `  webapp/${v.relPath}:${v.line} (${v.operator} without \`timezone\`)`)
    .join('\n')
  assert.equal(
    missing.length,
    0,
    'These call sites bucket a date in Mongo without an explicit `timezone`, so they\n'
      + 'answer for the UTC day. Pass `timezone` in the same options object\n'
      + '(e.g. `$dateToString: { format, date, timezone }`) — or, when UTC is\n'
      + 'genuinely correct, allowlist the file in tzBucketingParity.test.ts with a\n'
      + 'one-line reason:\n'
      + report,
  )
})

test('the scan flags a bucketing operator without a timezone', () => {
  // Proves the tripwire actually trips — the failure mode of a scanner test is
  // passing on an empty or wrongly-shaped input.
  const invented: SourceFile[] = [
    { relPath: 'app/api/hydration/route.ts', source: "{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } } } }" },
  ]
  const missing = unallowlistedViolations(invented, {})
  assert.deepEqual(missing.map((v) => v.operator), ['$dateToString'])
})

test('a timezone in the same options object stays quiet', () => {
  assert.deepEqual(
    violationsInSource("{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: tz } } } }"),
    [],
  )
  assert.deepEqual(violationsInSource("{ $project: { d: { $month: { date: '$at', timezone: 'America/New_York' } } } }"), [])
  // The shorthand form carries no options object, so it cannot name a timezone.
  assert.equal(violationsInSource("{ $project: { m: { $month: '$at' } } }").length, 1)
})

test('the scan trips through the real filesystem walk, not just a literal', () => {
  // Same tripwire, but through the filesystem walk rather than a literal —
  // this is the path the assertion above cannot cover.
  const root = mkdtempSync(path.join(tmpdir(), 'tz-bucketing-scan-'))
  mkdirSync(path.join(root, 'app/api/hydration'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/hydration/route.ts'),
    'export const pipeline = [{ $group: { _id: { $dayOfWeek: { date: "$at" } } } }]\n',
  )
  // A call site that names its timezone stays quiet.
  mkdirSync(path.join(root, 'lib/charts'), { recursive: true })
  writeFileSync(
    path.join(root, 'lib/charts/buckets.ts'),
    'export const pipeline = [{ $group: { _id: { $dayOfWeek: { date: "$at", timezone: "UTC" } } } }]\n',
  )

  const scanned = collectSources([path.join(root, 'app/api'), path.join(root, 'lib')], root)
  assert.equal(scanned.length, 2)
  const missing = unallowlistedViolations(scanned, {})
  assert.deepEqual(missing.map((v) => `${v.relPath}:${v.line} ${v.operator}`), [
    'app/api/hydration/route.ts:1 $dayOfWeek',
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

test('every allowlist entry produces at least one real violation', () => {
  // An obsolete entry outlives the violation it was written for and silently
  // excuses every future bucketing mistake in that whole file. Every entry
  // must match at least one live violation from the real scan.
  const violations = bucketingViolations(collectSources(SCAN_ROOTS))
  const violatingPaths = new Set(violations.map((v) => v.relPath))
  for (const relPath of Object.keys(ALLOWLIST)) {
    assert.ok(
      violatingPaths.has(relPath),
      `ALLOWLIST entry "${relPath}" is obsolete: it produces no bucketing violations from the real scan. Delete the entry from ALLOWLIST.`,
    )
  }
})
