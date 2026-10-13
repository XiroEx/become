/**
 * Training preferences — the pure rules behind the native Training settings
 * (NP-127), mirroring `webapp/app/dashboard/settings/page.tsx`.
 *
 * The web's Training tab edits what onboarding collected: ordered fitness
 * goals (up to three, index 0 is the primary and is also written as
 * `fitnessGoal`), experience level, weekly availability (1–7 days/week),
 * equipment access and injury notes. All of it is saved by the page's one
 * `PATCH /api/profile`.
 *
 * The Nutrition Planning choice (`planPromoteMode`, manual vs automatic
 * promotion) lives on the web's SETTINGS tab, not Training — NP-302 moved
 * it to native Settings > Settings to match. `PlanPromoteModeValue` and
 * `PLAN_PROMOTE_MODE_OPTIONS` stay exported here since that's still the one
 * place the option list and value type are defined.
 *
 * This module holds the option lists and the two pure rules so both the
 * screen and the tests read the same values:
 *
 *   - `MAX_FITNESS_GOALS = 3` — the cap the web enforces in
 *     `toggleFitnessGoal` (a fourth pick swaps out the least important one).
 *   - `toggleFitnessGoals` — the same ordered multi-select semantics as
 *     onboarding: first pick is primary, tapping at the cap swaps out the
 *     least important pick.
 *   - `clampWeeklyAvailability` — the stepper's 1–7 floor and ceiling.
 *   - `buildTrainingProfilePatch` — the ordered goals plus their
 *     `fitnessGoal` mirror, exactly the keys the web's `handleSave` sends.
 *
 * Injury notes are health data: they travel inside the profile PATCH like any
 * other field, and they reach the AI only with consent (the server gate reads
 * the AI-consent record per request — see `webapp/lib/aiConsent.ts`).
 */

export type FitnessGoalValue =
  | "lose_weight"
  | "gain_muscle"
  | "maintain"
  | "improve_performance"
  | "general_health";

export type ExperienceLevelValue = "beginner" | "intermediate" | "advanced";

export type EquipmentValue =
  | "none"
  | "dumbbells"
  | "barbell"
  | "cables"
  | "full_gym";

export type PlanPromoteModeValue = "manual" | "auto";

/** The web's cap: `MAX_FITNESS_GOALS = 3` in the settings page. */
export const MAX_FITNESS_GOALS = 3;

/**
 * The goal list at the top of the web's settings page, including its emoji
 * (NP-307 — native had none, which was the whole card): `icon` is the exact
 * character from `webapp/app/dashboard/settings/page.tsx`'s `FITNESS_GOALS`.
 */
export const FITNESS_GOAL_OPTIONS: readonly {
  value: FitnessGoalValue;
  label: string;
  description: string;
  icon: string;
}[] = [
  { value: "lose_weight", label: "Lose Weight", description: "Burn fat and get leaner", icon: "🔥" },
  { value: "gain_muscle", label: "Gain Muscle", description: "Build size and strength", icon: "💪" },
  { value: "maintain", label: "Maintain", description: "Stay at current fitness", icon: "⚖️" },
  { value: "improve_performance", label: "Performance", description: "Enhance athletic output", icon: "⚡" },
  { value: "general_health", label: "General Health", description: "Move and feel better", icon: "❤️" },
];

/** The experience list at the top of the web's settings page. */
export const EXPERIENCE_LEVEL_OPTIONS: readonly {
  value: ExperienceLevelValue;
  label: string;
}[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

/** The equipment list at the top of the web's settings page. */
export const EQUIPMENT_OPTIONS: readonly {
  value: EquipmentValue;
  label: string;
}[] = [
  { value: "none", label: "No Equipment" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "cables", label: "Cables" },
  { value: "full_gym", label: "Full Gym" },
];

/** The Nutrition Planning choice on the web's settings page. */
export const PLAN_PROMOTE_MODE_OPTIONS: readonly {
  value: PlanPromoteModeValue;
  label: string;
  description: string;
}[] = [
  {
    value: "manual",
    label: "Manual",
    description: 'Tap "Log it" to confirm each plan as you eat it.',
  },
  {
    value: "auto",
    label: "Auto",
    description: "Promote today's plans on day-view load. You can undo.",
  },
];

/** The stepper's floor and ceiling on the web (Math.max(1, …), Math.min(7, …)). */
export const MIN_WEEKLY_AVAILABILITY = 1;
export const MAX_WEEKLY_AVAILABILITY = 7;

/** The web's default when the profile has never stored one (`?? 3`). */
export const DEFAULT_WEEKLY_AVAILABILITY = 3;

/**
 * Same ordered multi-select semantics as the web's `toggleFitnessGoal` and
 * onboarding: tapping a selected goal removes it; tapping a new goal at the
 * cap swaps out the least important pick (the last one).
 */
export function toggleFitnessGoals(
  current: readonly FitnessGoalValue[],
  goal: FitnessGoalValue,
): FitnessGoalValue[] {
  if (current.includes(goal)) return current.filter((g) => g !== goal);
  if (current.length >= MAX_FITNESS_GOALS) {
    return [...current.slice(0, MAX_FITNESS_GOALS - 1), goal];
  }
  return [...current, goal];
}

/** The web's stepper bounds: 1 day/week at the floor, 7 at the ceiling. */
export function clampWeeklyAvailability(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WEEKLY_AVAILABILITY;
  return Math.min(
    MAX_WEEKLY_AVAILABILITY,
    Math.max(MIN_WEEKLY_AVAILABILITY, Math.round(value)),
  );
}

export interface TrainingProfilePatch {
  fitnessGoal?: FitnessGoalValue;
  fitnessGoals?: FitnessGoalValue[];
  experienceLevel?: ExperienceLevelValue;
  weeklyAvailability: number;
  equipmentAccess: EquipmentValue[];
  injuryNotes: string;
  /** Not sent by the Training tab (NP-302 moved this control to Settings >
   * Settings) — optional so a Settings-tab caller can still include it in
   * the SAME shape if it ever shares this builder. */
  planPromoteMode?: PlanPromoteModeValue;
}

/**
 * The profile keys the web's `handleSave` sends for these sections: the
 * ordered goals plus the `fitnessGoal` mirror of the primary (index 0), so
 * every existing consumer (dashboard, nudge modal, profile icon, AI context)
 * keeps working.
 */
export function buildTrainingProfilePatch(input: {
  fitnessGoals: readonly FitnessGoalValue[];
  experienceLevel?: ExperienceLevelValue | null;
  weeklyAvailability: number;
  equipmentAccess: readonly EquipmentValue[];
  injuryNotes: string;
  planPromoteMode?: PlanPromoteModeValue;
}): TrainingProfilePatch {
  const goals = [...input.fitnessGoals];
  const patch: TrainingProfilePatch = {
    weeklyAvailability: clampWeeklyAvailability(input.weeklyAvailability),
    equipmentAccess: [...input.equipmentAccess],
    injuryNotes: input.injuryNotes,
  };
  if (input.planPromoteMode) {
    patch.planPromoteMode = input.planPromoteMode;
  }
  if (goals.length > 0) {
    patch.fitnessGoal = goals[0];
    patch.fitnessGoals = goals;
  }
  if (input.experienceLevel) {
    patch.experienceLevel = input.experienceLevel;
  }
  return patch;
}
