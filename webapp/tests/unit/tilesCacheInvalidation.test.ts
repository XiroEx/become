// Run with: npx tsx --test tests/unit/tilesCacheInvalidation.test.ts
//
// GET /api/dashboard/tiles serves a per-user payload (nutrition suggestions
// among it) from a 60s Redis cache (see lib/redis.ts tilesCacheKey /
// TILES_CACHE_TTL_SECONDS). Any write that changes what that payload should
// say has to call bustTilesCache(userId), or the dashboard keeps showing the
// pre-write snapshot until the TTL happens to expire — which reads as "I have
// to leave the page and come back before it's reflected."
//
// weight/mood/workouts writes already did this. Every route that mutates a
// MealLog did not, so logging/editing/deleting/combining food, or promoting a
// planned meal into a log, never invalidated the cache the nutrition
// suggestion tiles are served from. This scans the known MealLog-mutating
// routes for the same convention those routes use, so a future write path
// added here without the bust call fails loudly instead of shipping stale
// tiles again.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

/**
 * Every route under app/api that creates, updates, or deletes a MealLog
 * document. Kept explicit (not auto-scanned) so a new file here is a
 * deliberate addition to this list, not a silent gap.
 */
const MEAL_LOG_WRITE_ROUTES = [
  'app/api/meal-logs/route.ts',
  'app/api/meal-logs/[id]/route.ts',
  'app/api/meal-logs/[id]/items/route.ts',
  'app/api/meal-logs/[id]/items/[itemId]/route.ts',
  'app/api/meal-logs/combine/route.ts',
  'app/api/meal-plans/[id]/promote/route.ts',
]

for (const relPath of MEAL_LOG_WRITE_ROUTES) {
  test(`${relPath}: busts the dashboard tiles cache after a MealLog write`, () => {
    const filePath = path.join(ROOT, relPath)
    const source = fs.readFileSync(filePath, 'utf8')

    assert.match(
      source,
      /import\s*\{[^}]*\bbustTilesCache\b[^}]*\}\s*from\s*['"]@\/lib\/redis['"]/,
      `${relPath} must import bustTilesCache from '@/lib/redis'`,
    )
    assert.match(
      source,
      /bustTilesCache\(/,
      `${relPath} must call bustTilesCache(...) after its MealLog write so the dashboard tiles cache doesn't serve a stale snapshot`,
    )
  })
}
