// Become's redReward catalog — the full set of collectibles the app offers.
//
// This is the SERIALIZABLE source of truth for cosmetics. Every entry's `asset`
// is plain JSON (never a live React component / tailwind import) so the catalog
// can be seeded into the reward DB via syncCatalog() and resolved at render time
// (see lib/reward/icons.tsx for the lucide resolver).
//
// Types come from @redbtn/redreward/types (pure, mongoose/React-free).
//
// Referential integrity: every collectible id referenced by an achievement
// (lib/reward/achievements.ts) MUST exist here, or createRedReward()'s validator
// throws a ConfigError. The unit test (tests/unit/rewardCatalog.test.ts) and the
// assertion script guard this.

import type { Collectible } from '@redbtn/redreward/types'

// ---------------------------------------------------------------------------
// Icons (10 starter presets) — source:'default', auto-granted to every user.
// Migrated 1:1 from lib/reward/icons.tsx PRESET_ICONS. The `asset.icon` string
// is the lucide-react export name (resolved by iconByName in icons.tsx); the
// `gradient` is the tailwind class string for the icon background.
// ---------------------------------------------------------------------------
const icons: Collectible[] = [
  { id: 'icon.flame',    type: 'icon', name: 'Flame',    rarity: 'common', source: 'default', sort: 0, asset: { kind: 'lucide', icon: 'Flame',    gradient: 'from-orange-500 to-red-500' } },
  { id: 'icon.strength', type: 'icon', name: 'Strength', rarity: 'common', source: 'default', sort: 1, asset: { kind: 'lucide', icon: 'Dumbbell', gradient: 'from-violet-500 to-indigo-500' } },
  { id: 'icon.bolt',     type: 'icon', name: 'Bolt',     rarity: 'common', source: 'default', sort: 2, asset: { kind: 'lucide', icon: 'Zap',      gradient: 'from-amber-400 to-yellow-500' } },
  { id: 'icon.heart',    type: 'icon', name: 'Heart',    rarity: 'common', source: 'default', sort: 3, asset: { kind: 'lucide', icon: 'Heart',    gradient: 'from-rose-500 to-pink-500' } },
  { id: 'icon.summit',   type: 'icon', name: 'Summit',   rarity: 'common', source: 'default', sort: 4, asset: { kind: 'lucide', icon: 'Mountain', gradient: 'from-sky-500 to-blue-600' } },
  { id: 'icon.sunrise',  type: 'icon', name: 'Sunrise',  rarity: 'common', source: 'default', sort: 5, asset: { kind: 'lucide', icon: 'Sunrise',  gradient: 'from-amber-400 to-orange-500' } },
  { id: 'icon.focus',    type: 'icon', name: 'Focus',    rarity: 'common', source: 'default', sort: 6, asset: { kind: 'lucide', icon: 'Target',   gradient: 'from-emerald-500 to-green-600' } },
  { id: 'icon.spark',    type: 'icon', name: 'Spark',    rarity: 'common', source: 'default', sort: 7, asset: { kind: 'lucide', icon: 'Sparkles', gradient: 'from-fuchsia-500 to-violet-500' } },
  { id: 'icon.leaf',     type: 'icon', name: 'Calm',     rarity: 'common', source: 'default', sort: 8, asset: { kind: 'lucide', icon: 'Leaf',     gradient: 'from-green-500 to-teal-500' } },
  { id: 'icon.champion', type: 'icon', name: 'Champion', rarity: 'common', source: 'default', sort: 9, asset: { kind: 'lucide', icon: 'Trophy',   gradient: 'from-yellow-400 to-amber-500' } },
]

// ---------------------------------------------------------------------------
// Frames — source:'achievement', rarity-tinted ring treatments. The render side
// resolves `asset.ring` (a tailwind class string) onto the profile avatar.
// ---------------------------------------------------------------------------
const frames: Collectible[] = [
  { id: 'frame.bronze',   type: 'frame', name: 'Bronze Frame',   rarity: 'common',    source: 'achievement', sort: 0, asset: { ring: 'ring-amber-700' } },
  { id: 'frame.silver',   type: 'frame', name: 'Silver Frame',   rarity: 'rare',      source: 'achievement', sort: 1, asset: { ring: 'ring-slate-300' } },
  { id: 'frame.gold',     type: 'frame', name: 'Gold Frame',     rarity: 'epic',      source: 'achievement', sort: 2, asset: { ring: 'ring-yellow-400' } },
  { id: 'frame.obsidian', type: 'frame', name: 'Obsidian Frame', rarity: 'legendary', source: 'achievement', sort: 3, asset: { ring: 'ring-zinc-950' } },
]

// ---------------------------------------------------------------------------
// Titles — source:'achievement', `asset:{ text }` rendered next to the name.
// ---------------------------------------------------------------------------
const titles: Collectible[] = [
  { id: 'title.consistent',  type: 'title', name: 'Consistent',  rarity: 'common',    source: 'achievement', sort: 0, asset: { text: 'Consistent' } },
  { id: 'title.disciplined', type: 'title', name: 'Disciplined', rarity: 'rare',      source: 'achievement', sort: 1, asset: { text: 'Disciplined' } },
  { id: 'title.relentless',  type: 'title', name: 'Relentless',  rarity: 'epic',      source: 'achievement', sort: 2, asset: { text: 'Relentless' } },
  { id: 'title.architect',   type: 'title', name: 'Architect',   rarity: 'legendary', source: 'achievement', sort: 3, asset: { text: 'Architect' } },
]

// ---------------------------------------------------------------------------
// Badges — source:'achievement', shelf items. `asset.icon` is a lucide export
// name resolved by iconByName at render (same map as icons).
// ---------------------------------------------------------------------------
const badges: Collectible[] = [
  { id: 'badge.first-workout',   type: 'badge', name: 'First Rep',          rarity: 'common',    source: 'achievement', sort: 0, asset: { kind: 'lucide', icon: 'Dumbbell' } },
  { id: 'badge.50-workouts',     type: 'badge', name: '50 Workouts',        rarity: 'rare',      source: 'achievement', sort: 1, asset: { kind: 'lucide', icon: 'Trophy' } },
  { id: 'badge.100-mind',        type: 'badge', name: '100 Mind Sessions',  rarity: 'epic',      source: 'achievement', sort: 2, asset: { kind: 'lucide', icon: 'Sparkles' } },
  { id: 'badge.vision-complete', type: 'badge', name: 'Vision Complete',    rarity: 'legendary', source: 'achievement', sort: 3, asset: { kind: 'lucide', icon: 'Mountain' } },
]

/** Become's full redReward catalog. Passed to createRedReward({ catalog }). */
export const catalog: Collectible[] = [...icons, ...frames, ...titles, ...badges]
