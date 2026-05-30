import type { ProgramCatalogItem } from "@become/api-client";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

const TARGET_USERS: ReadonlyArray<ProgramSummary["targetUser"]> = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

function narrowTargetUser(
  value: string | undefined,
): ProgramSummary["targetUser"] {
  return TARGET_USERS.includes(value as ProgramSummary["targetUser"])
    ? (value as ProgramSummary["targetUser"])
    : undefined;
}

/**
 * Map a raw webapp program (Mongo field names) to the presentational
 * ProgramSummary. Programs are referenced by their `program_id` slug, so that
 * is the canonical id; falls back to `_id` when a projection omits it.
 */
export function toProgramSummary(raw: ProgramCatalogItem): ProgramSummary {
  return {
    id: raw.program_id ?? raw._id ?? "",
    name: raw.name,
    description: raw.description ?? "",
    durationWeeks: raw.duration_weeks,
    trainingDaysPerWeek: raw.training_days_per_week,
    goal: raw.goal,
    targetUser: narrowTargetUser(raw.target_user),
  };
}
