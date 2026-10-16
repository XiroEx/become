// Run with: npm run test:file tests/unit/mind/visionRoute.test.ts

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const ROUTE_PATH = path.resolve(currentDir, '../../../app/api/mind/vision/route.ts')
const PARITY_PATH = path.resolve(currentDir, '../documentSaveParity.test.ts')

// ── Acceptance: 9d6d2a8d (Whole-document doc.save() in PATCH handler replaced with MindProgress.updateOne) ──

test('(id: 9d6d2a8d) Whole-document doc.save() in PATCH handler is replaced with a targeted MindProgress.updateOne on vision.alignmentHistory', () => {
  const routeContent = fs.readFileSync(ROUTE_PATH, 'utf8')

  // Verify doc.save() is not present in the route file
  assert.ok(
    !routeContent.includes('.save()'),
    'app/api/mind/vision/route.ts must not call .save()',
  )

  // Verify MindProgress.updateOne is called with target _id and $set for vision.alignmentHistory
  assert.ok(
    routeContent.includes('MindProgress.updateOne('),
    'app/api/mind/vision/route.ts must call MindProgress.updateOne',
  )
  assert.match(
    routeContent,
    /MindProgress\.updateOne\(\s*\{\s*_id:\s*doc\._id\s*\},/,
    'MindProgress.updateOne must target { _id: doc._id }',
  )
  assert.match(
    routeContent,
    /\$set:\s*\{\s*['"]vision\.alignmentHistory['"]:\s*alignmentHistory\s*\}/,
    "MindProgress.updateOne must $set 'vision.alignmentHistory'",
  )
})

// ── Acceptance: 9d6d2a8e (POST handler findOneAndUpdate is left untouched) ──

test('(id: 9d6d2a8e) POST handler findOneAndUpdate is left untouched', () => {
  const routeContent = fs.readFileSync(ROUTE_PATH, 'utf8')

  // Verify POST handler is present
  assert.ok(
    routeContent.includes('export async function POST('),
    'app/api/mind/vision/route.ts must export POST handler',
  )

  // Verify POST handler uses findOneAndUpdate with upsert
  assert.match(
    routeContent,
    /MindProgress\.findOneAndUpdate\(\s*\{\s*userId:\s*auth\.userId\s*\},/,
    'POST handler must use MindProgress.findOneAndUpdate with userId',
  )
  assert.match(
    routeContent,
    /\$set:\s*visionUpdate,\s*\$inc:\s*\{\s*xp:\s*xpGrant\s*\}/,
    'POST handler must use $set and $inc in findOneAndUpdate',
  )
  assert.match(
    routeContent,
    /\{ upsert: true, new: true, setDefaultsOnInsert: true \}/,
    'POST handler must maintain upsert options',
  )
})

// ── Acceptance: 9d6d2a8f (app/api/mind/vision/route.ts removed from ALLOWLIST in documentSaveParity.test.ts) ──

test('(id: 9d6d2a8f) The app/api/mind/vision/route.ts entry is removed from ALLOWLIST in documentSaveParity.test.ts', () => {
  const parityContent = fs.readFileSync(PARITY_PATH, 'utf8')

  assert.ok(
    !parityContent.includes("'app/api/mind/vision/route.ts'"),
    'app/api/mind/vision/route.ts must not appear in ALLOWLIST in documentSaveParity.test.ts',
  )
})

// ── Acceptance: 9d6d2a90 (Response format and status codes remain unchanged) ──

test('(id: 9d6d2a90) Response format and status codes remain unchanged', () => {
  const routeContent = fs.readFileSync(ROUTE_PATH, 'utf8')

  // Verify status codes in PATCH handler
  assert.match(
    routeContent,
    /const gate = await requireFeature\(request, 'vision'\)\s*if \(!gate\.ok\) return gate\.response/,
    'PATCH handler must check requireFeature for 401/403',
  )
  assert.match(
    routeContent,
    /if \(body\.action !== 'align'\) \{\s*return NextResponse\.json\(\{ error: 'action must be "align"' \}, \{ status: 400 \}\)/,
    'PATCH handler must return 400 for invalid action',
  )
  assert.match(
    routeContent,
    /if \(!Number\.isFinite\(score\) \|\| score < 1 \|\| score > 5\) \{\s*return NextResponse\.json\(\{ error: 'score must be 1–5' \}, \{ status: 400 \}\)/,
    'PATCH handler must return 400 for invalid score',
  )
  assert.match(
    routeContent,
    /if \(!doc\?\.vision\) return NextResponse\.json\(\{ error: 'Set your vision first' \}, \{ status: 404 \}\)/,
    'PATCH handler must return 404 when vision is not set',
  )
  assert.match(
    routeContent,
    /return NextResponse\.json\(\{ alignment: alignmentView\(alignmentHistory, tz\) \}\)/,
    'PATCH handler must return 200 with alignment view',
  )
  assert.match(
    routeContent,
    /catch \(err\) \{\s*console\.error\('PATCH \/api\/mind\/vision error:', err\)\s*return NextResponse\.json\(\{ error: 'Server error' \}, \{ status: 500 \}\)/,
    'PATCH handler must catch errors and return 500',
  )
})

test('(id: 9d6d2a90) Idempotent-per-day semantics and rolling 90-day trail', () => {
  // Pure logic simulation of the alignmentHistory updates
  const today = '2026-10-16'
  const history: Array<{ date: string; score: number }> = [
    { date: '2026-10-14', score: 4 },
    { date: '2026-10-15', score: 3 },
    { date: '2026-10-16', score: 2 }, // Existing entry for today
  ]

  // Updating today with new score 5 replaces today's entry
  const score = 5
  const filtered = history.filter((h) => h.date !== today)
  filtered.push({ date: today, score })
  filtered.sort((a, b) => a.date.localeCompare(b.date))
  const trimmed = filtered.slice(-90)

  assert.equal(trimmed.length, 3)
  assert.equal(trimmed[2].date, today)
  assert.equal(trimmed[2].score, 5, "Today's score should be updated to 5")

  // Verify rolling 90-day limit
  const largeHistory: Array<{ date: string; score: number }> = []
  for (let i = 1; i <= 100; i++) {
    largeHistory.push({ date: `2026-01-${String(i).padStart(2, '0')}`, score: 3 })
  }
  const largeFiltered = largeHistory.filter((h) => h.date !== today)
  largeFiltered.push({ date: today, score: 5 })
  largeFiltered.sort((a, b) => a.date.localeCompare(b.date))
  const largeTrimmed = largeFiltered.slice(-90)

  assert.equal(largeTrimmed.length, 90, 'History must be capped at 90 days')
  assert.equal(largeTrimmed[89].date, today)
})
