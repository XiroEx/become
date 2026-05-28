// Pure classifier helpers for the exercise-muscle audit script.
//
// The audit walks the canonical Exercise library and flags three classes of
// data quality issue. The classifiers below are extracted so they can be unit
// tested in isolation from MongoDB connectivity.
//
// Issue classes:
//   1. MISSING_PRIMARY — strength/power/calisthenics/olympic/strongman with no
//      primaryMuscles. The whole "volume by muscle" feature is downstream of
//      this field, so an empty primary on a resistance exercise is a silent
//      data leak.
//   2. ANTAGONIST_CONTRADICTION — a muscle appears in primary or secondary
//      that is on the wrong side of the body for the exercise's movement
//      pattern (e.g. a squat with biceps as secondary, a bench press with
//      lats as secondary). Caught by pattern allow-lists; if NO pattern is
//      set, this check is skipped (handled by category-mismatch instead).
//   3. CATEGORY_MISMATCH — the exercise's category implies a muscle profile
//      that the data doesn't satisfy. Today: strength/power exercises with
//      empty primaryMuscles, or with primary=[full_body] only (too vague for
//      a strength exercise).

import type {
  ExerciseCategory,
  MovementPattern,
  MuscleGroup,
} from '../models/Exercise'

export type AuditIssueType =
  | 'MISSING_PRIMARY'
  | 'ANTAGONIST_CONTRADICTION'
  | 'CATEGORY_MISMATCH'

export interface AuditableExercise {
  slug: string
  name: string
  category: ExerciseCategory
  movementPatterns: MovementPattern[]
  primaryMuscles: MuscleGroup[]
  secondaryMuscles: MuscleGroup[]
}

export interface AuditIssue {
  slug: string
  name: string
  issueType: AuditIssueType
  detail: string
  currentPrimary: MuscleGroup[]
  currentSecondary: MuscleGroup[]
  currentCategory: ExerciseCategory
}

// ── Category families ────────────────────────────────────────────────────────

// Categories where missing/empty primaryMuscles is a clear bug. These are the
// categories that contribute to "volume by muscle" math.
const RESISTANCE_CATEGORIES: ReadonlySet<ExerciseCategory> = new Set([
  'strength',
  'power',
  'calisthenics',
  'olympic',
  'strongman',
])

export function isResistanceCategory(category: ExerciseCategory): boolean {
  return RESISTANCE_CATEGORIES.has(category)
}

// ── Pattern → allowed muscle set ─────────────────────────────────────────────
//
// For each movement pattern, this is the set of muscles that can legitimately
// appear in primaryMuscles or secondaryMuscles. Anything outside this set
// shows up as an antagonist contradiction.
//
// Patterns are grouped by family because most belong to a small number of
// allowed-muscle silhouettes.

// Lower-body work — squat, lunge, hinge, knee/hip-specific accessories. Allows
// the leg muscles + core (anti-rotation/anti-extension) + grip (you hold the
// load). Forbids: chest, back-pulling muscles, deltoids, biceps/triceps.
const LOWER_BODY_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'quads', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors',
  'lower_back', 'erector_spinae', 'hip_flexors',
  'abs', 'obliques', 'transverse_abdominis',
  'grip', 'forearms',
  'full_body',
])

// Horizontal push (bench, pushup) + vertical push (OHP). Pec, triceps, anterior
// deltoid drive; serratus and upper-back stabilize. Pulling muscles (lats,
// biceps, rhomboids) shouldn't appear — that's the classic "I copy-pasted
// from a pull exercise" tell.
const PUSH_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'chest', 'upper_chest', 'lower_chest',
  'triceps',
  'front_delts', 'side_delts', 'rotator_cuff',
  'upper_back', 'mid_back', 'traps',
  'abs', 'obliques', 'transverse_abdominis', 'erector_spinae',
  'grip', 'forearms',
  'full_body',
])

// Horizontal + vertical pull. Lat/back-driven, biceps and brachialis assist,
// rear delts engage. Push muscles (chest, triceps, front delts as primary)
// shouldn't appear.
const PULL_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'lats', 'upper_back', 'mid_back', 'lower_back',
  'rhomboids', 'traps', 'teres_major',
  'rear_delts', 'side_delts', 'rotator_cuff',
  'biceps', 'brachialis', 'forearms',
  'abs', 'obliques', 'transverse_abdominis', 'erector_spinae',
  'grip',
  'full_body',
])

// Carry — loaded locomotion. Whole-body but grip-dominant.
const CARRY_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'grip', 'forearms', 'traps', 'upper_back', 'mid_back',
  'erector_spinae', 'lower_back',
  'abs', 'obliques', 'transverse_abdominis',
  'quads', 'hamstrings', 'glutes', 'calves',
  'full_body',
])

// Anti-rotation / anti-extension / anti-lateral flexion core work.
const CORE_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'abs', 'obliques', 'transverse_abdominis',
  'erector_spinae', 'lower_back', 'hip_flexors',
  'glutes',
  'full_body',
])

// Rotation — wood chops, med-ball throws. Core-driven with shoulder/hip
// involvement.
const ROTATION_ALLOWED: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'obliques', 'abs', 'transverse_abdominis',
  'erector_spinae', 'lower_back',
  'glutes', 'hip_flexors',
  'front_delts', 'side_delts', 'rear_delts',
  'lats', 'upper_back', 'mid_back',
  'full_body',
])

// Single-joint accessory patterns — narrow targets.
const ACCESSORY_ALLOWED: Partial<Record<MovementPattern, ReadonlySet<MuscleGroup>>> = {
  knee_extension:       new Set<MuscleGroup>(['quads']),
  knee_flexion:         new Set<MuscleGroup>(['hamstrings', 'calves']),
  hip_extension:        new Set<MuscleGroup>(['glutes', 'hamstrings', 'erector_spinae', 'lower_back']),
  horizontal_adduction: new Set<MuscleGroup>(['chest', 'upper_chest', 'lower_chest', 'front_delts']),
  shoulder_abduction:   new Set<MuscleGroup>(['side_delts', 'traps', 'rotator_cuff']),
  shoulder_flexion:     new Set<MuscleGroup>(['front_delts', 'upper_chest']),
  elbow_flexion:        new Set<MuscleGroup>(['biceps', 'brachialis', 'forearms']),
  elbow_extension:      new Set<MuscleGroup>(['triceps']),
  ankle_flexion:        new Set<MuscleGroup>(['calves']),
  scapular_retraction:  new Set<MuscleGroup>(['rhomboids', 'mid_back', 'rear_delts', 'traps', 'upper_back']),
}

const PATTERN_ALLOWED: Partial<Record<MovementPattern, ReadonlySet<MuscleGroup>>> = {
  squat:            LOWER_BODY_ALLOWED,
  hinge:            LOWER_BODY_ALLOWED,
  lunge:            LOWER_BODY_ALLOWED,
  horizontal_push:  PUSH_ALLOWED,
  vertical_push:    PUSH_ALLOWED,
  horizontal_pull:  PULL_ALLOWED,
  vertical_pull:    PULL_ALLOWED,
  carry:            CARRY_ALLOWED,
  rotation:         ROTATION_ALLOWED,
  anti_rotation:        CORE_ALLOWED,
  anti_extension:       CORE_ALLOWED,
  anti_lateral_flexion: CORE_ALLOWED,
  triple_extension: new Set<MuscleGroup>([
    'quads', 'hamstrings', 'glutes', 'calves',
    'lower_back', 'erector_spinae',
    'traps', 'upper_back', 'mid_back',
    'front_delts', 'side_delts', 'rear_delts',
    'forearms', 'grip',
    'abs', 'obliques', 'transverse_abdominis',
    'full_body',
  ]),
  gait: new Set<MuscleGroup>([
    'quads', 'hamstrings', 'glutes', 'calves',
    'hip_flexors', 'lower_back', 'erector_spinae',
    'abs', 'obliques', 'transverse_abdominis',
    'full_body',
  ]),
  ...ACCESSORY_ALLOWED,
}

// ── Classifier helpers ──────────────────────────────────────────────────────

/**
 * Returns true if the exercise's category implies it MUST have at least one
 * primary muscle, and it doesn't. This is the canonical "primaryMuscles got
 * dropped" signal — exclusively flagged for resistance categories so that
 * cardio/mobility/warmup exercises (which often legitimately have no primary
 * muscle and target full-body activation) aren't noisy.
 */
export function isMissingPrimary(ex: AuditableExercise): boolean {
  if (!isResistanceCategory(ex.category)) return false
  return ex.primaryMuscles.length === 0
}

/**
 * Returns the list of muscles that fall outside the union of allowed-muscle
 * sets for the exercise's declared movement patterns. If the exercise has no
 * patterns, OR has the `n/a` pattern only, or has any pattern with no allow
 * list defined here, returns an empty array (we don't know enough to assert).
 *
 * The "contradiction" terminology is the prompt's; mechanically it's a
 * pattern↔muscle-set mismatch — e.g. squat pattern with `biceps` secondary.
 */
export function antagonistContradictions(ex: AuditableExercise): MuscleGroup[] {
  const patterns = ex.movementPatterns.filter(p => p !== 'n/a')
  if (patterns.length === 0) return []

  // Union of all allow-lists for the declared patterns. If any pattern doesn't
  // have an allow-list defined, fall through to "no opinion" rather than
  // emitting false positives.
  const allowedUnion = new Set<MuscleGroup>()
  for (const p of patterns) {
    const allowed = PATTERN_ALLOWED[p]
    if (!allowed) return []
    for (const m of allowed) allowedUnion.add(m)
  }

  const violations: MuscleGroup[] = []
  for (const m of [...ex.primaryMuscles, ...ex.secondaryMuscles]) {
    if (!allowedUnion.has(m)) violations.push(m)
  }
  return violations
}

/**
 * Category-vs-muscle-set mismatch. Today's rules:
 *   - resistance category + empty primary → MISSING_PRIMARY (handled there;
 *     we don't double-report)
 *   - resistance category + primary === ['full_body'] only → mismatch
 *     ("full_body" is fine as a tag but useless for per-muscle volume math)
 *
 * The first rule is intentionally skipped here so each exercise produces at
 * most one MISSING_PRIMARY / CATEGORY_MISMATCH issue.
 */
export function categoryMismatch(ex: AuditableExercise): string | null {
  if (!isResistanceCategory(ex.category)) return null
  if (ex.primaryMuscles.length === 0) return null // covered by MISSING_PRIMARY
  if (ex.primaryMuscles.length === 1 && ex.primaryMuscles[0] === 'full_body') {
    return 'resistance category with primaryMuscles=[full_body] only — too vague for per-muscle volume attribution'
  }
  return null
}

// ── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Runs all three classifiers against one exercise and returns the issues it
 * produced (zero, one, or more). Stable ordering: MISSING_PRIMARY first, then
 * ANTAGONIST_CONTRADICTION, then CATEGORY_MISMATCH.
 */
export function auditExercise(ex: AuditableExercise): AuditIssue[] {
  const issues: AuditIssue[] = []

  if (isMissingPrimary(ex)) {
    issues.push({
      slug: ex.slug,
      name: ex.name,
      issueType: 'MISSING_PRIMARY',
      detail: `resistance category "${ex.category}" with no primaryMuscles`,
      currentPrimary: ex.primaryMuscles,
      currentSecondary: ex.secondaryMuscles,
      currentCategory: ex.category,
    })
  }

  const violations = antagonistContradictions(ex)
  if (violations.length > 0) {
    issues.push({
      slug: ex.slug,
      name: ex.name,
      issueType: 'ANTAGONIST_CONTRADICTION',
      detail: `muscles outside pattern allow-list (${ex.movementPatterns.join('+')}): ${violations.join(', ')}`,
      currentPrimary: ex.primaryMuscles,
      currentSecondary: ex.secondaryMuscles,
      currentCategory: ex.category,
    })
  }

  const catMsg = categoryMismatch(ex)
  if (catMsg) {
    issues.push({
      slug: ex.slug,
      name: ex.name,
      issueType: 'CATEGORY_MISMATCH',
      detail: catMsg,
      currentPrimary: ex.primaryMuscles,
      currentSecondary: ex.secondaryMuscles,
      currentCategory: ex.category,
    })
  }

  return issues
}

// ── CSV emitter ─────────────────────────────────────────────────────────────

const CSV_HEADER = 'slug,name,issueType,detail,currentPrimary,currentSecondary,currentCategory'

function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function issuesToCSV(issues: AuditIssue[]): string {
  const lines = [CSV_HEADER]
  for (const i of issues) {
    lines.push([
      csvEscape(i.slug),
      csvEscape(i.name),
      i.issueType,
      csvEscape(i.detail),
      csvEscape(i.currentPrimary.join('|')),
      csvEscape(i.currentSecondary.join('|')),
      i.currentCategory,
    ].join(','))
  }
  return lines.join('\n') + '\n'
}
