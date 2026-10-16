// Run with: npm run test:file tests/unit/documentSaveParity.test.ts
//
// ─── Every member-facing route must avoid whole-document .save() ─────────────
//
// Five routes were found writing a member action by loading a Mongo document and
// calling `.save()` on it, which validates the WHOLE document and 500s on one
// malformed legacy subdocument. Shipped fixes (/api/mood, /api/program-nudge,
// /api/suggestions/dismiss, /api/checkin, /api/weight) replaced whole-document
// `.save()` with targeted Mongo updates ($set, $push, findOneAndUpdate).
//
// This test is the tripwire: it walks `webapp/app/api/**/route.ts` and FAILS
// when a route calls `.save()` on a document loaded from a Mongoose model,
// reporting file:line — unless the file is allowlisted below with a reason.
// The rule is mechanical on purpose; judgement lives in the allowlist, not the
// scanner.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

/**
 * Pre-existing call sites that call `.save()` on a Mongoose document, each with
 * the one-line reason it is allowed to stay. Triage a new failure by switching to
 * targeted updates (`updateOne` / `findOneAndUpdate` with `$set`/`$push`) —
 * add an entry here only with a reason, never by touching the scanner.
 *
 * Paths are relative to `webapp/`.
 */
const ALLOWLIST: Record<string, string> = {
  'app/api/admin/e2e-admin-setup/route.ts':
    'Test setup seeding an admin user fixture; not a member-facing route.',
  'app/api/admin/e2e-setup/route.ts':
    'Test setup seeding an e2e member fixture; not a member-facing route.',
  'app/api/admin/exercises/review/[slug]/route.ts':
    'Admin-only exercise review console saving reviewed exercise state.',
  'app/api/admin/foods/[id]/merge/route.ts':
    'Admin food catalog tool merging aliases into target food document.',
  'app/api/admin/foods/[id]/route.ts':
    'Admin food catalog route updating food details and review flags.',
  'app/api/admin/foods/[id]/split/route.ts':
    'Admin food catalog tool saving source food document after alias split.',
  'app/api/auth/verify-link/route.ts':
    'Auth verification flow updating emailVerified and clearing magic-link token on user.',
  'app/api/chat/conversations/[conversationId]/messages/route.ts':
    'Chat conversation saving appended message and unread count.',
  'app/api/events/[eventId]/route.ts':
    'Event management route saving updated event details.',
  'app/api/events/[eventId]/rsvp/route.ts':
    'Event RSVP handler updating attendee response on event document.',
  'app/api/exercises/[slug]/framing/route.ts':
    'Exercise video framing route updating framing coordinates on exercise document.',
  'app/api/exercises/[slug]/route.ts':
    'Exercise update route saving exercise details and metadata.',
  'app/api/exercises/[slug]/trim/route.ts':
    'Exercise trim route updating start/end trim points on exercise document.',
  'app/api/exercises/[slug]/video/dimensions/route.ts':
    'Exercise video metadata handler saving video aspect ratio on exercise document.',
  'app/api/exercises/[slug]/video/route.ts':
    'Exercise video upload handler saving video asset URL on exercise document.',
  'app/api/exercises/custom/[slug]/route.ts':
    'Custom exercise update route saving exercise modifications.',
  'app/api/exercises/custom/[slug]/submit/route.ts':
    'Custom exercise submission route saving submitted exercise document.',
  'app/api/exercises/custom/[slug]/trim/route.ts':
    'Custom exercise trim handler updating video boundaries on exercise document.',
  'app/api/exercises/custom/[slug]/video/route.ts':
    'Custom exercise video upload handler saving video URL on exercise document.',
  'app/api/exercises/custom/route.ts':
    'Custom exercise creation route saving newly instantiated exercise document.',
  'app/api/groups/[groupId]/join/route.ts':
    'Group membership handler saving updated member roster on group document.',
  'app/api/groups/[groupId]/route.ts':
    'Group management route saving updated group settings.',
  'app/api/meal-logs/[id]/items/[itemId]/route.ts':
    'Meal log item edit route saving parent meal log after subdocument update.',
  'app/api/meal-logs/[id]/items/route.ts':
    'Meal log route saving meal log after appending item.',
  'app/api/meal-logs/[id]/route.ts':
    'Meal log route saving updated meal log document.',
  'app/api/meal-logs/combine/route.ts':
    'Meal log combine route saving consolidated meal log document.',
  'app/api/meal-plans/[id]/route.ts':
    'Meal plan management route saving updated meal plan document.',
  'app/api/meals/[id]/image/route.ts':
    'Meal image route saving image metadata on meal document.',
  'app/api/meals/[id]/route.ts':
    'Meal management route saving updated meal document.',
  'app/api/mind/identity/route.ts':
    'Mind identity module saving core values and identity document.',
  'app/api/mind/mission/route.ts':
    'Mind mission module saving user purpose and mission document.',
  'app/api/mind/non-negotiables/route.ts':
    'Mind module saving daily non-negotiable commitments document.',
  'app/api/mind/vision/route.ts':
    'Mind vision module saving long-term vision document.',
  'app/api/nutrition/flags/[id]/evidence/route.ts':
    'Nutrition flag review route saving flag evidence document.',
  'app/api/nutrition/log/route.ts':
    'Nutrition logging route saving nutrition log and daily targets.',
  'app/api/nutrition/quick-add/route.ts':
    'Nutrition quick-add route saving quick-add meal log entry.',
  'app/api/nutrition/recipes/[id]/image/route.ts':
    'Recipe image upload route saving recipe image metadata.',
  'app/api/nutrition/recipes/[id]/route.ts':
    'Recipe edit route saving updated recipe document.',
  'app/api/nutrition/recipes/[id]/save-as-food/route.ts':
    'Recipe export route saving linked food item reference.',
  'app/api/programs/[programId]/share/route.ts':
    'Program sharing route saving public share settings on program document.',
  'app/api/programs/custom/[programId]/route.ts':
    'Custom program builder saving modified program document.',
  'app/api/programs/start-date/route.ts':
    'Program schedule route saving updated program start date on schedule document.',
  'app/api/schedule/route.ts':
    'Schedule route saving updated weekly workout schedule document.',
  'app/api/workouts/logs/route.ts':
    'Workout completion route saving workout log on UserProgress document.',
}

const WEBAPP_ROOT = path.resolve(__dirname, '../..')
const SCAN_ROOTS = [path.join(WEBAPP_ROOT, 'app/api')]

interface SourceFile {
  /** Path relative to `webapp/`, e.g. `app/api/mood/route.ts`. */
  relPath: string
  source: string
}

export interface DocumentSaveViolation {
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
      if (entry.name !== 'route.ts') continue
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

const SAVE_RE = /(?:([a-zA-Z0-9_$]+)\s*)?\.save\s*\(/g

/** Every Mongoose document `.save()` call site in `source`, with line numbers. */
export function violationsInSource(source: string): Array<{ line: number; call: string; operator: string }> {
  const masked = maskComments(source)
  const out: Array<{ line: number; call: string; operator: string }> = []
  SAVE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = SAVE_RE.exec(masked)) !== null) {
    const line = masked.slice(0, m.index).split('\n').length
    const call = m[1] ? `${m[1]}.save()` : '.save()'
    out.push({ line, call, operator: '.save()' })
  }
  return out
}

/** Every document `.save()` call site across `files`. */
export function documentSaveViolations(files: SourceFile[]): DocumentSaveViolation[] {
  const out: DocumentSaveViolation[] = []
  for (const { relPath, source } of files) {
    for (const v of violationsInSource(source)) out.push({ relPath, ...v })
  }
  return out
}

/** The violations the tripwire actually fails on — everything not allowlisted. */
export function unallowlistedViolations(
  files: SourceFile[],
  allowlist: Record<string, string> = ALLOWLIST,
): DocumentSaveViolation[] {
  return documentSaveViolations(files).filter((v) => !(v.relPath in allowlist))
}

test('every member-facing route avoids whole-document .save() on Mongoose models', () => {
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
    'These route handlers call .save() on a Mongoose document, which validates\n'
      + 'the whole document and risks 500ing on legacy subdocuments. Use targeted\n'
      + 'Mongo updates (e.g. updateOne / findOneAndUpdate with $set/$push) — or,\n'
      + 'when .save() is genuinely required, allowlist the file in\n'
      + 'documentSaveParity.test.ts with a one-line reason:\n'
      + report,
  )
})

test('the scan flags a .save() call on a Mongoose document', () => {
  // Proves the tripwire actually trips — the failure mode of a scanner test is
  // passing on an empty or wrongly-shaped input.
  const invented: SourceFile[] = [
    {
      relPath: 'app/api/sample/route.ts',
      source: 'const progress = await UserProgress.findOne({ userId });\nawait progress.save();\n',
    },
  ]
  const missing = unallowlistedViolations(invented, {})
  assert.deepEqual(missing.map((v) => `${v.relPath}:${v.line} ${v.call}`), [
    'app/api/sample/route.ts:2 progress.save()',
  ])
})

test('a route without .save() or with commented-out .save() stays quiet', () => {
  assert.deepEqual(
    violationsInSource('// Targeted update, not progress.save().\nawait UserProgress.updateOne({ userId }, { $set: { mood } })'),
    [],
  )
  assert.deepEqual(
    violationsInSource('/* multiline comment\nprogress.save()\n*/\nexport async function POST() {}'),
    [],
  )
})

test('the scan trips through the real filesystem walk, not just a literal', () => {
  // Same tripwire, but through the filesystem walk rather than a literal —
  // this is the path the assertion above cannot cover.
  const root = mkdtempSync(path.join(tmpdir(), 'doc-save-scan-'))
  mkdirSync(path.join(root, 'app/api/hydration'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/hydration/route.ts'),
    'const doc = await Model.findOne();\nawait doc.save();\n',
  )
  // A route using targeted updates or comments stays quiet.
  mkdirSync(path.join(root, 'app/api/quiet'), { recursive: true })
  writeFileSync(
    path.join(root, 'app/api/quiet/route.ts'),
    '// Targeted update, not progress.save().\nawait Model.updateOne({ _id }, { $set: { val: 1 } });\n',
  )

  const scanned = collectSources([path.join(root, 'app/api')], root)
  assert.equal(scanned.length, 2)
  const missing = unallowlistedViolations(scanned, {})
  assert.deepEqual(missing.map((v) => `${v.relPath}:${v.line} ${v.call}`), [
    'app/api/hydration/route.ts:2 doc.save()',
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
  // excuses every future .save() mistake in that whole file. Every entry
  // must match at least one live violation from the real scan.
  const violations = documentSaveViolations(collectSources(SCAN_ROOTS))
  const violatingPaths = new Set(violations.map((v) => v.relPath))
  for (const relPath of Object.keys(ALLOWLIST)) {
    assert.ok(
      violatingPaths.has(relPath),
      `ALLOWLIST entry "${relPath}" is obsolete: it produces no .save() violations from the real scan. Delete the entry from ALLOWLIST.`,
    )
  }
})
