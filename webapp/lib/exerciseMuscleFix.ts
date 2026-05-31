// Curated muscle-data fixes for the worst offenders surfaced by the audit.
//
// Each entry is the CANONICAL correct value, not a description of what's
// currently wrong. The fix script computes a diff between current state and
// the canonical value; if they already match (under set equality), no write
// is issued. That makes the script idempotent — running it twice is the same
// as running it once.
//
// Scope: top-of-mind anatomical canon for compound lifts and the most common
// accessories. Deliberately small — no silent mass-rewrite. Each fix carries
// a `reason` string so PR reviewers can audit why it's here.
//
// To extend: add a new entry; the run-script will pick it up on next invocation.

import type { MuscleGroup } from '../models/Exercise'

export interface MuscleFix {
  slug: string
  reason: string
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
}

export const MUSCLE_FIXES: MuscleFix[] = [
  // ── Push: horizontal ─────────────────────────────────────────────────────
  {
    slug: 'bench-press',
    reason: 'classic horizontal push — pec drives, triceps + anterior delts assist',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts'],
  },
  {
    slug: 'db-bench-press',
    reason: 'dumbbell bench — same prime mover map as barbell bench',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts'],
  },
  {
    slug: 'incline-dumbbell-press',
    reason: 'incline shifts emphasis to upper chest; anterior delts more involved',
    primaryMuscles: ['upper_chest'],
    secondaryMuscles: ['front_delts', 'triceps'],
  },
  {
    slug: 'push-ups',
    reason: 'bodyweight horizontal push; core anti-extension fires too',
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps', 'front_delts', 'abs'],
  },

  // ── Push: vertical ───────────────────────────────────────────────────────
  {
    slug: 'shoulder-press',
    reason: 'vertical push — anterior delts drive, triceps lock out, upper chest assists',
    primaryMuscles: ['front_delts'],
    secondaryMuscles: ['triceps', 'side_delts', 'upper_chest'],
  },
  {
    slug: 'db-shoulder-press',
    reason: 'DB OHP — same prime mover map as barbell OHP',
    primaryMuscles: ['front_delts'],
    secondaryMuscles: ['triceps', 'side_delts', 'upper_chest'],
  },

  // ── Pull: vertical ───────────────────────────────────────────────────────
  {
    slug: 'lat-pulldown',
    reason: 'vertical pull — lats prime, biceps + mid-back assist',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['biceps', 'mid_back', 'rhomboids'],
  },

  // ── Pull: horizontal ─────────────────────────────────────────────────────
  {
    slug: 'cable-row',
    reason: 'horizontal pull — mid-back + lats, biceps assist',
    primaryMuscles: ['mid_back', 'lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'rhomboids'],
  },
  {
    slug: 'seated-cable-row',
    reason: 'seated row — same prime mover map as cable row',
    primaryMuscles: ['mid_back', 'lats'],
    secondaryMuscles: ['biceps', 'rear_delts', 'rhomboids'],
  },
  {
    slug: 'db-single-arm-row',
    reason: 'unilateral horizontal pull — lat-dominant',
    primaryMuscles: ['lats'],
    secondaryMuscles: ['mid_back', 'biceps', 'rear_delts'],
  },

  // ── Pull: scapular retraction / rear delt ────────────────────────────────
  {
    slug: 'face-pulls',
    reason: 'rear delt + scapular retraction work; not a biceps movement',
    primaryMuscles: ['rear_delts'],
    secondaryMuscles: ['traps', 'rhomboids', 'mid_back'],
  },
  {
    slug: 'rear-delt-fly',
    reason: 'isolation rear delt; rhomboids/mid-back assist',
    primaryMuscles: ['rear_delts'],
    secondaryMuscles: ['rhomboids', 'mid_back'],
  },

  // ── Squat ────────────────────────────────────────────────────────────────
  {
    slug: 'back-squat',
    reason: 'quad + glute dominant; hamstrings + adductors + erectors assist',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'adductors', 'erector_spinae'],
  },
  {
    slug: 'goblet-squat',
    reason: 'front-loaded squat; same prime movers, biceps/forearms hold load',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'adductors', 'abs'],
  },
  {
    slug: 'bulgarian-split-squat',
    reason: 'unilateral squat — quad/glute dominant on the working leg',
    primaryMuscles: ['quads', 'glutes'],
    secondaryMuscles: ['hamstrings', 'adductors', 'abductors'],
  },

  // ── Hinge ────────────────────────────────────────────────────────────────
  {
    slug: 'romanian-deadlift',
    reason: 'hip hinge — hamstrings + glutes prime, erectors stabilize',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['erector_spinae', 'forearms', 'lower_back'],
  },
  {
    slug: 'dumbbell-rdl',
    reason: 'DB hinge — same prime mover map as barbell RDL',
    primaryMuscles: ['hamstrings', 'glutes'],
    secondaryMuscles: ['erector_spinae', 'forearms', 'lower_back'],
  },
  {
    slug: 'hip-thrust',
    reason: 'hip extension — glute prime, hamstrings + erectors assist',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings', 'erector_spinae'],
  },
  {
    slug: 'dumbbell-hip-thrust',
    reason: 'DB hip thrust — same prime mover map as barbell hip thrust',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings', 'erector_spinae'],
  },
  {
    slug: 'glute-bridge',
    reason: 'low-load hip extension — glute prime, hamstrings assist',
    primaryMuscles: ['glutes'],
    secondaryMuscles: ['hamstrings'],
  },

  // ── Curl family ──────────────────────────────────────────────────────────
  {
    slug: 'bicep-curls',
    reason: 'elbow flexion — biceps prime, brachialis + forearms assist',
    primaryMuscles: ['biceps'],
    secondaryMuscles: ['brachialis', 'forearms'],
  },
  {
    slug: 'hammer-curls',
    reason: 'neutral grip — brachialis is the prime mover, biceps assists',
    primaryMuscles: ['brachialis', 'biceps'],
    secondaryMuscles: ['forearms'],
  },
  {
    slug: 'db-hammer-curls',
    reason: 'DB hammer curl — same prime mover map as cable hammer curl',
    primaryMuscles: ['brachialis', 'biceps'],
    secondaryMuscles: ['forearms'],
  },

  // ── Triceps isolation ────────────────────────────────────────────────────
  {
    slug: 'tricep-cable-pushdowns',
    reason: 'isolation elbow extension — triceps only',
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
  },
  {
    slug: 'tricep-rope-pressdown',
    reason: 'rope pressdown — triceps isolation',
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
  },
  {
    slug: 'tricep-cable-kickbacks',
    reason: 'kickback — triceps isolation, no other significant contribution',
    primaryMuscles: ['triceps'],
    secondaryMuscles: [],
  },

  // ── Lateral raise family ─────────────────────────────────────────────────
  {
    slug: 'dumbbell-lateral-raise',
    reason: 'shoulder abduction — side delts prime, traps assist',
    primaryMuscles: ['side_delts'],
    secondaryMuscles: ['traps'],
  },
  {
    slug: 'side-lateral-raises',
    reason: 'side raise — side delts prime, traps assist',
    primaryMuscles: ['side_delts'],
    secondaryMuscles: ['traps'],
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set equality for muscle arrays — order-independent. Two arrays match if
 * they contain the same unique elements (duplicates ignored).
 */
export function muscleArrayEqual(a: MuscleGroup[], b: MuscleGroup[]): boolean {
  if (a.length === 0 && b.length === 0) return true
  const setA = new Set(a)
  const setB = new Set(b)
  if (setA.size !== setB.size) return false
  for (const m of setA) if (!setB.has(m)) return false
  return true
}

export interface FixDiff {
  slug: string
  changed: boolean
  primaryChanged: boolean
  secondaryChanged: boolean
  before: { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] }
  after:  { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] }
  reason: string
}

/**
 * Compute the diff for one fix vs. the exercise's current state. Returns
 * `changed: false` when both primary and secondary already match the fix
 * (under set equality), which is the idempotency property.
 */
export function computeFixDiff(
  current: { primaryMuscles: MuscleGroup[]; secondaryMuscles: MuscleGroup[] },
  fix: MuscleFix,
): FixDiff {
  const primaryChanged = !muscleArrayEqual(current.primaryMuscles, fix.primaryMuscles)
  const secondaryChanged = !muscleArrayEqual(current.secondaryMuscles, fix.secondaryMuscles)
  return {
    slug: fix.slug,
    changed: primaryChanged || secondaryChanged,
    primaryChanged,
    secondaryChanged,
    before: {
      primaryMuscles: current.primaryMuscles,
      secondaryMuscles: current.secondaryMuscles,
    },
    after: {
      primaryMuscles: fix.primaryMuscles,
      secondaryMuscles: fix.secondaryMuscles,
    },
    reason: fix.reason,
  }
}

/**
 * Format a diff for human-readable stdout. Returns a multi-line string when
 * `changed`, a one-line "already correct" notice otherwise.
 */
export function formatDiff(d: FixDiff): string {
  if (!d.changed) return `✓ ${d.slug}: already correct`
  const lines = [`✎ ${d.slug}: ${d.reason}`]
  if (d.primaryChanged) {
    lines.push(`    primary:   [${d.before.primaryMuscles.join(', ')}] → [${d.after.primaryMuscles.join(', ')}]`)
  }
  if (d.secondaryChanged) {
    lines.push(`    secondary: [${d.before.secondaryMuscles.join(', ')}] → [${d.after.secondaryMuscles.join(', ')}]`)
  }
  return lines.join('\n')
}
