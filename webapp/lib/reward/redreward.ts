// redReward singleton for Become (Phase B0).
//
// @redbtn/redreward is the framework-agnostic collectibles/rewards engine. Become
// supplies its own catalog (lib/reward/catalog.ts) and achievement rules
// (lib/reward/achievements.ts); the package owns the per-user inventory, the
// declarative achievement→reward engine, and the equipped loadout.
//
// Like getRedAuth() (lib/redauth.ts), this is a lazy module-level singleton: the
// instance is created on first call, not at import. That keeps a missing env from
// crashing the module graph at import time (e.g. in tests / client bundles) and
// surfaces a clear error only when the rewards system is actually used.
//
// DEDICATED REWARD DB: redReward points at its OWN database (BECOME_REWARD_MONGODB_URI),
// NOT Become's app DB. The package collections (collectibles, userrewards,
// achievements, rewardledger) are reward-specific, but a dedicated DB is the clean
// blast-radius choice and sidesteps the redAuth `users`-clobber scar entirely.
//
// SERVER-ONLY: this constructs a mongoose connection. Never import it from client
// components — client hooks call Become's API routes (Phase B3), which call this.

import { createRedReward, type RedRewardInstance } from '@redbtn/redreward'
import { catalog } from './catalog'
import { achievements } from './achievements'

let instance: RedRewardInstance | null = null

export function getRedReward(): RedRewardInstance {
  if (instance) return instance

  // Dedicated reward DB — must NOT be Become's app DB (clean blast radius).
  const mongoUri = process.env.BECOME_REWARD_MONGODB_URI
  if (!mongoUri) {
    throw new Error(
      '[redreward] BECOME_REWARD_MONGODB_URI is required (dedicated reward DB, separate from Become app data)',
    )
  }

  instance = createRedReward({
    app: 'become',
    mongoUri,
    catalog,
    achievements,
    // maxBadges / enforceOwnership / reconcileDefaults / ledgerTtlDays use the
    // package defaults (6 / true / true / 90). Override here if Become needs to.
  })

  return instance
}
