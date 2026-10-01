import type { NutritionDirection } from "@become/core";
import { LEGAL_MINIMUM_AGE } from "@become/core";

export { LEGAL_MINIMUM_AGE };

/**
 * Onboarding option sets and types, mirroring webapp/app/onboarding/page.tsx
 * so the native flow produces the exact payload the backend expects:
 * PATCH /api/profile {
 *   name,
 *   profile: {
 *     ...answers,
 *     fitnessGoal: goals[0],
 *     fitnessGoals,
 *     nutritionDirection,
 *     weightUnit: unit ?? "lbs"
 *   },
 *   onboardingCompleted: true,
 *   profileIcon: defaultIconForGoal(goals[0])
 * }
 */
export type FitnessGoal =
  | "lose_weight"
  | "gain_muscle"
  | "maintain"
  | "improve_performance"
  | "general_health";

export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type BiologicalSex = "male" | "female" | "prefer_not_to_say";

export type EquipmentType =
  | "none"
  | "dumbbells"
  | "barbell"
  | "cables"
  | "full_gym";

export const MAX_GOALS = 3;

export const GOAL_OPTIONS: readonly { value: FitnessGoal; label: string }[] = [
  { value: "lose_weight", label: "Lose Weight" },
  { value: "gain_muscle", label: "Build Muscle" },
  { value: "maintain", label: "Maintain & Tone" },
  { value: "improve_performance", label: "Improve Performance" },
  { value: "general_health", label: "General Health" },
];

export const GOAL_LABEL: Record<FitnessGoal, string> = {
  lose_weight: "Lose Weight",
  gain_muscle: "Build Muscle",
  maintain: "Maintain & Tone",
  improve_performance: "Improve Performance",
  general_health: "General Health",
};

export const EXPERIENCE_OPTIONS: readonly {
  value: ExperienceLevel;
  label: string;
  desc: string;
}[] = [
  { value: "beginner", label: "Beginner", desc: "New to structured training" },
  {
    value: "intermediate",
    label: "Intermediate",
    desc: "1-3 years of consistent training",
  },
  {
    value: "advanced",
    label: "Advanced",
    desc: "3+ years, familiar with programming",
  },
];

export const SEX_OPTIONS: readonly { value: BiologicalSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const EQUIPMENT_OPTIONS: readonly {
  value: EquipmentType;
  label: string;
}[] = [
  { value: "none", label: "None" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "cables", label: "Cables" },
  { value: "full_gym", label: "Full Gym" },
];

export const TOTAL_STEPS = 5;

export const STEP_TITLES = [
  "Goals",
  "About you",
  "Body & nutrition",
  "Equipment",
  "Review",
] as const;

export const STEP_QUESTIONS: readonly string[] = [
  "What are you here to do?",
  "A bit about you",
  "Body & nutrition",
  "What equipment do you have?",
  "Here's what we heard",
];

export interface OnboardingProfile {
  fitnessGoals?: FitnessGoal[];
  fitnessGoal?: FitnessGoal;
  experienceLevel?: ExperienceLevel;
  age?: number;
  biologicalSex?: BiologicalSex;
  equipmentAccess?: EquipmentType[];
  nutritionDirection?: NutritionDirection;
  weightUnit?: "lbs" | "kg";
  [key: string]: unknown;
}

/** The default icon for a new user, derived from their primary fitness goal. */
const GOAL_TO_ICON: Record<FitnessGoal, string> = {
  lose_weight: "flame",
  gain_muscle: "strength",
  improve_performance: "bolt",
  general_health: "heart",
  maintain: "focus",
};

export function defaultIconForGoal(
  goal: FitnessGoal | undefined | null,
): string {
  return (goal && GOAL_TO_ICON[goal]) || "spark";
}
