// Become's redReward achievements — the declarative unlock rules.
//
// DSL criteria ONLY (no function criteria) so they're seedable via syncCatalog()
// and cross-process-safe (the webapp and any worker that calls evaluate() share
// this module). See @redbtn/redreward-spec §3.2 for DSL semantics.
//
// Stats contract (lib/reward/stats.ts buildStats → StatsObject), canonical keys:
//   streakDays, totalWorkouts, workoutsLogged, chapter, xp, mindSessions
// A criterion referencing a stat not yet present in the snapshot is simply false
// (forward-locked), never an error — so `visionComplete` below stays locked until
// the signal is wired in B4.
//
// REFERENTIAL INTEGRITY: every id in `rewards[]` must exist in lib/reward/catalog.ts,
// or createRedReward()'s validator throws a ConfigError. Every source:'achievement'
// collectible is granted by exactly one achievement here (no orphans, no dups).
// Guarded by tests/unit/rewardCatalog.test.ts + scripts/assert-redreward-config.ts.

import type { Achievement } from '@redbtn/redreward/types'

export const achievements: Achievement[] = [
  // Streak milestones
  {
    id: 'streak.7',
    name: 'Consistent',
    description: 'Maintain a 7-day streak.',
    criteria: { stat: 'streakDays', gte: 7 },
    rewards: ['title.consistent', 'frame.bronze'],
  },
  {
    id: 'streak.30',
    name: 'Relentless',
    description: 'Maintain a 30-day streak.',
    criteria: { stat: 'streakDays', gte: 30 },
    rewards: ['title.relentless', 'frame.silver'],
  },

  // Mind chapter progression
  {
    id: 'chapter.3',
    name: 'Disciplined',
    description: 'Reach Mind chapter 3.',
    criteria: { stat: 'chapter', gte: 3 },
    rewards: ['title.disciplined'],
  },
  {
    id: 'chapter.5',
    name: 'Architect',
    description: 'Reach Mind chapter 5.',
    criteria: { stat: 'chapter', gte: 5 },
    rewards: ['title.architect', 'frame.obsidian'],
  },

  // Workout volume
  {
    id: 'workout.1',
    name: 'First Rep',
    description: 'Log your first workout.',
    criteria: { stat: 'totalWorkouts', gte: 1 },
    rewards: ['badge.first-workout'],
  },
  {
    id: 'workout.50',
    name: 'Committed',
    description: 'Log 50 workouts.',
    criteria: { stat: 'totalWorkouts', gte: 50 },
    rewards: ['badge.50-workouts', 'frame.gold'],
  },

  // Mind sessions
  {
    id: 'mind.100',
    name: 'Centered',
    description: 'Complete 100 Mind sessions.',
    criteria: { stat: 'mindSessions', gte: 100 },
    rewards: ['badge.100-mind'],
  },

  // Vision completion. `visionComplete` is not yet emitted by buildStats — the
  // criterion stays false (forward-locked) until the signal is wired in B4.
  {
    id: 'vision.complete',
    name: 'Visionary',
    description: 'Complete your Vision.',
    criteria: { stat: 'visionComplete', eq: true },
    rewards: ['badge.vision-complete'],
  },
]
