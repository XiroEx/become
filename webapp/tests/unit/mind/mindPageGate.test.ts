// Run with: npm run test:file tests/unit/mind/mindPageGate.test.ts
//
// Regression guard for the Mindset FeatureGuard removal — a new user (role
// "user", not "admin") was seeing the "Coming Soon" lock screen on
// /dashboard/mind because FeatureGuard only let role === "admin" through.
// See the nutrition precedent for the same unlock (commit 8ab03ea).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

test('mind page: no longer wrapped in the admin-only FeatureGuard', async () => {
  const src = await fs.readFile(
    path.resolve(process.cwd(), 'app/dashboard/mind/page.tsx'),
    'utf8',
  )
  assert.doesNotMatch(src, /import FeatureGuard/)
  assert.doesNotMatch(src, /<FeatureGuard/)
  assert.match(src, /<MindJourney\s*\/>/)
})
