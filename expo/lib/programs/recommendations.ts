import type { ProgramSummary } from "@/components/programs/ProgramsList";

/**
 * Goal-based keywords matching webapp/app/dashboard/workout/WorkoutClient.tsx.
 */
export const GOAL_KEYWORDS: Record<string, readonly string[]> = {
  lose_weight: ["weight loss", "fat loss", "cut", "cutting", "lean", "shred"],
  gain_muscle: [
    "muscle",
    "bulk",
    "bulking",
    "strength",
    "hypertrophy",
    "mass",
    "size",
  ],
  maintain: ["maintain", "maintenance", "general", "fitness"],
  improve_performance: [
    "performance",
    "athletic",
    "conditioning",
    "sport",
    "speed",
    "power",
  ],
  general_health: ["health", "wellness", "general", "fitness", "lifestyle"],
};

/**
 * Level mapping matching webapp/app/dashboard/workout/WorkoutClient.tsx.
 */
export const LEVEL_MAP: Record<string, readonly string[]> = {
  beginner: ["beginner", "beginner to intermediate"],
  intermediate: [
    "intermediate",
    "beginner to intermediate",
    "intermediate to advanced",
  ],
  advanced: ["advanced", "intermediate to advanced"],
};

/**
 * Ranks or filters programs matching the member's profile goals and experience.
 *
 * Rules that travel: an unknown or legacy profile goal or level (e.g.
 * 'build_muscle' or 'powerlifter') must degrade to no recommendation, never throw
 * or blank the screen.
 */
export function matchRecommendedPrograms(
  programs: ProgramSummary[],
  fitnessGoal?: string | null,
  experienceLevel?: string | null,
): ProgramSummary[] {
  if (!fitnessGoal && !experienceLevel) {
    return [];
  }

  const goalKey = fitnessGoal ? fitnessGoal.toLowerCase() : "";
  const levelKey = experienceLevel ? experienceLevel.toLowerCase() : "";

  // `?? []` is load-bearing: legacy values like "build_muscle" predate the
  // current enum, and an unguarded lookup threw inside the filter on the web.
  // An unknown goal must degrade to "no recommendation", never crash.
  const goalKeywords = GOAL_KEYWORDS[goalKey] ?? [];
  const levelKeywords = LEVEL_MAP[levelKey] ?? [];

  if (goalKeywords.length === 0 && levelKeywords.length === 0) {
    return [];
  }

  return programs.filter((program) => {
    const goalField = (program.goal ?? "").toLowerCase();
    const targetUser = (program.targetUser ?? "").toLowerCase();
    const tags = (program.tags ?? []).map((t) => t.toLowerCase());
    const allText = [goalField, targetUser, ...tags].join(" ");

    let goalMatch = false;
    if (goalKeywords.length > 0) {
      goalMatch = goalKeywords.some((kw) => allText.includes(kw));
    }

    let levelMatch = false;
    if (levelKeywords.length > 0) {
      levelMatch = levelKeywords.some((l) => targetUser.includes(l));
    }

    if (goalKeywords.length > 0 && levelKeywords.length > 0) {
      return goalMatch || levelMatch;
    }
    if (goalKeywords.length > 0) return goalMatch;
    return levelMatch;
  });
}
