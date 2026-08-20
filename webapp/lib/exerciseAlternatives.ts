/**
 * Advanced exercise alternative scoring engine.
 *
 * Given a source exercise and a pool of candidates, scores each candidate
 * on how well it can substitute. The algorithm considers:
 *
 *  1. Movement pattern overlap (highest weight — must train the same pattern)
 *  2. Primary muscle overlap (must hit the same muscles)
 *  3. Secondary muscle overlap (bonus for matching secondary work)
 *  4. Body region match (upper/lower/core/full)
 *  5. Equipment compatibility (filtered, then bonus for similar equipment class)
 *  6. Exercise role match (compound/secondary/accessory)
 *  7. Mechanics match (compound vs isolation)
 *  8. Difficulty proximity (prefer same difficulty level)
 *  9. Laterality match (bilateral/unilateral preference)
 * 10. Explicit alternatives list (bonus if the exercise DB already links them)
 * 11. Category match (strength/power/cardio/etc.)
 * 12. Tracking type compatibility (must be able to log the same way)
 * 13. Workout context penalty (avoid duplicating exercises already in the workout)
 * 14. Stabilizer overlap (bonus for similar stabilizer demands)
 */

import type { IExerciseDefinition, Equipment, MovementPattern, MuscleGroup } from '@/models/Exercise';

export interface AlternativeCandidate {
  slug: string;
  name: string;
  score: number;
  reasons: string[];
  equipment: Equipment[];
  primaryMuscles: MuscleGroup[];
  movementPatterns: MovementPattern[];
  difficulty: string;
  category: string;
  bodyRegion: string;
  role: string;
  trackingType: string;
  isExplicitAlternative: boolean;
}

export interface ScoringContext {
  /** Equipment the user has available (empty = no filter) */
  availableEquipment: Equipment[];
  /** Exercise slugs already in the current workout (to avoid duplicates) */
  workoutExerciseSlugs: string[];
  /** The role this exercise plays in the program (overrides exercise default) */
  programRole?: string;
  /** Body region focus of the current workout day */
  workoutFocus?: string;
}

// ─── Scoring Weights ────────────────────────────────────────────────────────

const W = {
  MOVEMENT_PATTERN:       30,  // Most important: must train the same movement
  PRIMARY_MUSCLE:         25,  // Must target the same primary muscles
  SECONDARY_MUSCLE:        8,  // Nice to have
  STABILIZER:              4,  // Minor bonus
  BODY_REGION:            10,  // Must be in the same region
  ROLE:                    8,  // Compound should swap with compound
  MECHANICS:               6,  // Compound vs isolation
  EQUIPMENT_SIMILARITY:    5,  // Bonus for similar equipment class
  DIFFICULTY:              4,  // Prefer same difficulty
  LATERALITY:              3,  // Prefer same laterality
  EXPLICIT_ALTERNATIVE:   15,  // Big bonus if DB already lists it
  CATEGORY:                5,  // Same category (strength, power, etc.)
  TRACKING_TYPE:           5,  // Must be able to log the same way
  WORKOUT_DUPLICATE:     -40,  // Heavy penalty for exercises already in workout
} as const;

// ─── Movement pattern similarity groups ─────────────────────────────────────

const PATTERN_GROUPS: Record<string, string[]> = {
  squat: ['squat', 'lunge'],
  hinge: ['hinge', 'hip_extension'],
  horizontal_push: ['horizontal_push', 'horizontal_adduction'],
  horizontal_pull: ['horizontal_pull', 'scapular_retraction'],
  vertical_push: ['vertical_push', 'shoulder_abduction', 'shoulder_flexion'],
  vertical_pull: ['vertical_pull'],
  lunge: ['lunge', 'squat'],
  carry: ['carry'],
  rotation: ['rotation', 'anti_rotation'],
  anti_rotation: ['anti_rotation', 'rotation', 'anti_extension', 'anti_lateral_flexion'],
  anti_extension: ['anti_extension', 'anti_rotation', 'anti_lateral_flexion'],
  anti_lateral_flexion: ['anti_lateral_flexion', 'anti_rotation', 'anti_extension'],
  knee_extension: ['knee_extension', 'squat'],
  knee_flexion: ['knee_flexion', 'hinge'],
  hip_extension: ['hip_extension', 'hinge'],
  horizontal_adduction: ['horizontal_adduction', 'horizontal_push'],
  shoulder_abduction: ['shoulder_abduction', 'vertical_push'],
  shoulder_flexion: ['shoulder_flexion', 'vertical_push'],
  elbow_flexion: ['elbow_flexion'],
  elbow_extension: ['elbow_extension'],
  ankle_flexion: ['ankle_flexion'],
  scapular_retraction: ['scapular_retraction', 'horizontal_pull'],
  triple_extension: ['triple_extension', 'squat', 'hinge'],
  gait: ['gait'],
};

// ─── Equipment similarity groups ────────────────────────────────────────────

const EQUIPMENT_CLASSES: Record<string, string[]> = {
  free_weight: ['barbell', 'dumbbell', 'kettlebell', 'ez_bar', 'trap_bar', 'safety_squat_bar'],
  cable: ['cable'],
  machine: [
    'leg_press', 'leg_extension', 'leg_curl', 'hack_squat',
    'chest_press_machine', 'shoulder_press_machine', 'lat_pulldown',
    'seated_row_machine', 'low_row_machine', 'pec_deck',
    'hip_abduction_machine', 'hip_adduction_machine', 'calf_raise_machine',
    'preacher_curl_machine', 'belt_squat_machine', 'lateral_raise_machine',
    'rear_delt_machine', 'smith_machine', 'glute_ham_raise', 'back_extension', 'sled',
  ],
  bodyweight: ['bodyweight', 'pull_up_bar', 'dip_station', 'exercise_mat', 'none'],
  bench: ['flat_bench', 'incline_bench', 'decline_bench'],
  rack: ['squat_rack'],
  band: ['resistance_band'],
  cardio_machine: ['treadmill', 'stationary_bike', 'rowing_machine', 'assault_bike', 'elliptical', 'stair_climber'],
};

function getEquipmentClass(eq: string): string {
  for (const [cls, items] of Object.entries(EQUIPMENT_CLASSES)) {
    if (items.includes(eq)) return cls;
  }
  return 'other';
}

// ─── Difficulty distance ────────────────────────────────────────────────────

const DIFFICULTY_ORDER = ['beginner', 'intermediate', 'advanced', 'expert'];

function difficultyDistance(a: string, b: string): number {
  const ai = DIFFICULTY_ORDER.indexOf(a);
  const bi = DIFFICULTY_ORDER.indexOf(b);
  if (ai === -1 || bi === -1) return 2;
  return Math.abs(ai - bi);
}

// ─── Set overlap ratio ─────────────────────────────────────────────────────

function overlapRatio(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const intersection = b.filter(x => setA.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Pattern similarity ────────────────────────────────────────────────────

function patternSimilarity(sourcePatterns: string[], candidatePatterns: string[]): number {
  if (sourcePatterns.length === 0 || candidatePatterns.length === 0) return 0;

  // Direct overlap (Jaccard)
  const directOverlap = overlapRatio(sourcePatterns, candidatePatterns);
  if (directOverlap > 0) return 0.6 + 0.4 * directOverlap;

  // Check similarity groups: if any source pattern's group contains any candidate pattern
  let bestGroupMatch = 0;
  for (const sp of sourcePatterns) {
    const group = PATTERN_GROUPS[sp] || [sp];
    for (const cp of candidatePatterns) {
      if (group.includes(cp)) {
        bestGroupMatch = Math.max(bestGroupMatch, 0.5);
      }
      // Also check reverse
      const candidateGroup = PATTERN_GROUPS[cp] || [cp];
      if (candidateGroup.includes(sp)) {
        bestGroupMatch = Math.max(bestGroupMatch, 0.5);
      }
    }
  }

  return bestGroupMatch;
}

// ─── Main scoring function ──────────────────────────────────────────────────

export function scoreAlternative(
  source: IExerciseDefinition,
  candidate: IExerciseDefinition,
  context: ScoringContext
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // 1. Movement pattern overlap (most important)
  const patternScore = patternSimilarity(
    source.movementPatterns as string[],
    candidate.movementPatterns as string[]
  );
  const patternPoints = patternScore * W.MOVEMENT_PATTERN;
  score += patternPoints;
  if (patternScore >= 0.6) {
    reasons.push('Same movement pattern');
  } else if (patternScore >= 0.4) {
    reasons.push('Similar movement pattern');
  }

  // 2. Primary muscle overlap
  const primaryOverlap = overlapRatio(
    source.primaryMuscles as string[],
    candidate.primaryMuscles as string[]
  );
  const primaryPoints = primaryOverlap * W.PRIMARY_MUSCLE;
  score += primaryPoints;
  if (primaryOverlap >= 0.5) {
    reasons.push('Targets same primary muscles');
  }

  // 3. Secondary muscle overlap
  const secondaryOverlap = overlapRatio(
    source.secondaryMuscles as string[],
    candidate.secondaryMuscles as string[]
  );
  score += secondaryOverlap * W.SECONDARY_MUSCLE;

  // 4. Stabilizer overlap
  const stabilizerOverlap = overlapRatio(
    source.stabilizers as string[],
    candidate.stabilizers as string[]
  );
  score += stabilizerOverlap * W.STABILIZER;

  // 5. Body region match
  if (source.bodyRegion === candidate.bodyRegion) {
    score += W.BODY_REGION;
    reasons.push('Same body region');
  }

  // 6. Exercise role match
  const effectiveRole = context.programRole || source.role;
  if (effectiveRole === candidate.role) {
    score += W.ROLE;
    reasons.push(`Same role (${candidate.role})`);
  } else if (
    (effectiveRole === 'compound' && candidate.role === 'secondary') ||
    (effectiveRole === 'secondary' && candidate.role === 'compound')
  ) {
    score += W.ROLE * 0.5;
  }

  // 7. Mechanics match
  if (source.mechanics === candidate.mechanics) {
    score += W.MECHANICS;
  } else if (source.mechanics !== 'n/a' && candidate.mechanics !== 'n/a') {
    // Compound → isolation swap gets partial credit
    score += W.MECHANICS * 0.3;
  }

  // 8. Equipment similarity
  const sourceClasses = new Set((source.equipment as string[]).map(getEquipmentClass));
  const candidateClasses = new Set((candidate.equipment as string[]).map(getEquipmentClass));
  const classOverlap = [...sourceClasses].filter(c => candidateClasses.has(c)).length;
  if (classOverlap > 0) {
    score += W.EQUIPMENT_SIMILARITY * (classOverlap / Math.max(sourceClasses.size, candidateClasses.size));
    if (sourceClasses.size > 0 && candidateClasses.size > 0) {
      const srcClass = [...sourceClasses][0];
      const candClass = [...candidateClasses][0];
      if (srcClass !== candClass) {
        reasons.push(`${candClass.replace('_', ' ')} alternative`);
      }
    }
  }

  // 9. Difficulty proximity
  const diffDist = difficultyDistance(source.difficulty, candidate.difficulty);
  score += W.DIFFICULTY * Math.max(0, 1 - diffDist * 0.4);
  if (diffDist === 0) {
    reasons.push('Same difficulty level');
  }

  // 10. Laterality match
  if (source.laterality === candidate.laterality) {
    score += W.LATERALITY;
  } else if (
    (source.laterality === 'bilateral' && candidate.laterality === 'alternating') ||
    (source.laterality === 'alternating' && candidate.laterality === 'bilateral')
  ) {
    score += W.LATERALITY * 0.5;
  }

  // 11. Explicit alternative bonus
  const sourceAlts = (source.alternatives as string[]) || [];
  const sourceVars = (source.variations as string[]) || [];
  if (sourceAlts.includes(candidate.slug) || sourceVars.includes(candidate.slug)) {
    score += W.EXPLICIT_ALTERNATIVE;
    reasons.push('Recommended alternative');
  }
  // Check reverse too
  const candidateAlts = (candidate.alternatives as string[]) || [];
  const candidateVars = (candidate.variations as string[]) || [];
  if (candidateAlts.includes(source.slug) || candidateVars.includes(source.slug)) {
    score += W.EXPLICIT_ALTERNATIVE * 0.7;
    if (!reasons.includes('Recommended alternative')) {
      reasons.push('Linked alternative');
    }
  }

  // 12. Category match
  if (source.category === candidate.category) {
    score += W.CATEGORY;
  }

  // 13. Tracking type compatibility
  if (source.trackingType === candidate.trackingType) {
    score += W.TRACKING_TYPE;
  }

  // 14. Workout duplicate penalty
  if (context.workoutExerciseSlugs.includes(candidate.slug)) {
    score += W.WORKOUT_DUPLICATE;
    reasons.push('Already in workout');
  }

  // Normalize to 0-100
  const maxPossible =
    W.MOVEMENT_PATTERN + W.PRIMARY_MUSCLE + W.SECONDARY_MUSCLE + W.STABILIZER +
    W.BODY_REGION + W.ROLE + W.MECHANICS + W.EQUIPMENT_SIMILARITY +
    W.DIFFICULTY + W.LATERALITY + W.EXPLICIT_ALTERNATIVE + W.CATEGORY + W.TRACKING_TYPE;
  const normalizedScore = Math.max(0, Math.min(100, Math.round((score / maxPossible) * 100)));

  return { score: normalizedScore, reasons };
}

// ─── Filter & rank ──────────────────────────────────────────────────────────

export function findAlternatives(
  source: IExerciseDefinition,
  allExercises: IExerciseDefinition[],
  context: ScoringContext,
  limit = 20
): AlternativeCandidate[] {
  const candidates: AlternativeCandidate[] = [];

  for (const candidate of allExercises) {
    // Skip self
    if (candidate.slug === source.slug) continue;

    // Skip inactive
    if (!candidate.isActive) continue;

    // Equipment filter: if user specified available equipment, candidate must be usable
    if (context.availableEquipment.length > 0) {
      const candidateEquipment = candidate.equipment as Equipment[];
      // "bodyweight" and "none" are always available
      const alwaysAvailable = new Set(['bodyweight', 'none']);
      const needsEquipment = candidateEquipment.filter(e => !alwaysAvailable.has(e));
      if (needsEquipment.length > 0) {
        const hasAll = needsEquipment.every(e => context.availableEquipment.includes(e));
        if (!hasAll) continue;
      }
    }

    const { score, reasons } = scoreAlternative(source, candidate, context);

    // Minimum threshold: must score at least 15 to be relevant
    if (score < 15) continue;

    candidates.push({
      slug: candidate.slug,
      name: candidate.name,
      score,
      reasons,
      equipment: candidate.equipment as Equipment[],
      primaryMuscles: candidate.primaryMuscles as MuscleGroup[],
      movementPatterns: candidate.movementPatterns as MovementPattern[],
      difficulty: candidate.difficulty,
      category: candidate.category,
      bodyRegion: candidate.bodyRegion,
      role: candidate.role,
      trackingType: candidate.trackingType,
      isExplicitAlternative:
        ((source.alternatives as string[]) || []).includes(candidate.slug) ||
        ((source.variations as string[]) || []).includes(candidate.slug),
    });
  }

  // Sort by score descending, then by explicit alternative, then alphabetically
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.isExplicitAlternative !== b.isExplicitAlternative) {
      return a.isExplicitAlternative ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return candidates.slice(0, limit);
}
