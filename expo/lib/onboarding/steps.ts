/**
 * Onboarding option sets, mirroring webapp/app/onboarding/page.tsx so the native
 * questionnaire produces the same `profile` payload the backend already
 * understands (PATCH /api/profile { profile, onboardingCompleted: true }).
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

export const GOAL_OPTIONS: { value: FitnessGoal; label: string }[] = [
  { value: "lose_weight", label: "Lose Weight" },
  { value: "gain_muscle", label: "Build Muscle" },
  { value: "maintain", label: "Maintain & Tone" },
  { value: "improve_performance", label: "Improve Performance" },
  { value: "general_health", label: "General Health" },
];

export const EXPERIENCE_OPTIONS: { value: ExperienceLevel; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

export const SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

export const EQUIPMENT_OPTIONS: { value: EquipmentType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "barbell", label: "Barbell" },
  { value: "cables", label: "Cables" },
  { value: "full_gym", label: "Full Gym" },
];

export interface OnboardingProfile {
  fitnessGoal?: FitnessGoal;
  experienceLevel?: ExperienceLevel;
  biologicalSex?: BiologicalSex;
  birthYear?: number;
  equipmentAccess?: EquipmentType[];
}

export const TOTAL_STEPS = 4;
