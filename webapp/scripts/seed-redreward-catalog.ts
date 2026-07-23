/**
 * Seed Become's redReward catalog + DSL achievements into the dedicated reward DB.
 *
 * Idempotent: syncCatalog() upserts collectibles + achievements (function criteria
 * are skipped + warned; Become uses DSL-only, so all are seeded).
 *
 * Run from webapp/ — POST env-provisioning only (this needs a live reward DB):
 *   npx tsx scripts/seed-redreward-catalog.ts
 *
 * Requires BECOME_REWARD_MONGODB_URI (the dedicated reward DB, NOT Become's app
 * DB). Reads it from .env.local. No-ops with a clear error if it's missing — this
 * script is intentionally NOT run during the B0–B2 code phases (no live DB yet).
 *
 * TODO(B0/deploy): set BECOME_REWARD_MONGODB_URI in the Become RedRun workspace
 *   appConfig.env (per-key, never a whole-env replace), then run this once.
 */

import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

async function main() {
  if (!process.env.BECOME_REWARD_MONGODB_URI) {
    console.error(
      '[seed-redreward] BECOME_REWARD_MONGODB_URI is not set. This script needs a ' +
        'live, dedicated reward DB and must be run only after env provisioning. Aborting.',
    )
    process.exit(1)
  }

  // Imported lazily so the missing-env guard above fires before the singleton's
  // own env check (clearer message), and so importing this file never connects.
  const { getRedReward } = await import('../lib/reward/redreward')

  const reward = await getRedReward()
  console.log('[seed-redreward] syncing catalog + achievements to the reward DB…')
  await reward.syncCatalog()
  console.log('[seed-redreward] done.')

  // syncCatalog() leaves the mongoose connection open; close it so the script exits.
  const conn = await reward.getConnection()
  await conn.close()
}

main().catch((err) => {
  console.error('[seed-redreward] failed:', err)
  process.exit(1)
})
