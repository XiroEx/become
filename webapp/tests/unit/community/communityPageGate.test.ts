// Run with: npm run test:file tests/unit/community/communityPageGate.test.ts
//
// Regression guard for gating the Community tab to admins only. Community,
// Groups, and Events are all reachable from the "Community" bottom-nav tab
// (see BottomNav.tsx's communityActive check), so every page under that tab
// must be wrapped in the same admin-only FeatureGuard already used for Chat
// (see chat/page.tsx).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const GATED_PAGES = [
  'app/dashboard/community/page.tsx',
  'app/dashboard/groups/page.tsx',
  'app/dashboard/groups/[groupId]/page.tsx',
  'app/dashboard/events/page.tsx',
  'app/dashboard/events/[eventId]/page.tsx',
]

for (const relPath of GATED_PAGES) {
  test(`${relPath}: wrapped in the admin-only FeatureGuard`, async () => {
    const src = await fs.readFile(path.resolve(process.cwd(), relPath), 'utf8')
    assert.match(src, /import FeatureGuard from ['"]@\/components\/FeatureGuard['"]/)
    assert.match(src, /<FeatureGuard\b/)
    assert.match(src, /<\/FeatureGuard>/)
  })
}
