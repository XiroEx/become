import {
  matchRecommendedPrograms,
  GOAL_KEYWORDS,
  LEVEL_MAP,
} from "@/lib/programs/recommendations";
import type { ProgramSummary } from "@/components/programs/ProgramsList";

const samplePrograms: ProgramSummary[] = [
  {
    id: "p-strength",
    name: "Pure Strength",
    description: "Build max strength and muscle hypertrophy",
    goal: "gain_muscle",
    targetUser: "Intermediate",
    tags: ["strength", "barbell", "hypertrophy"],
  },
  {
    id: "p-fatloss",
    name: "Lean Shred",
    description: "High intensity fat loss circuit",
    goal: "lose_weight",
    targetUser: "Beginner",
    tags: ["cutting", "cardio", "fat loss"],
  },
  {
    id: "p-health",
    name: "Daily Health",
    description: "General wellness and mobility",
    goal: "general_health",
    targetUser: "Beginner",
    tags: ["wellness", "mobility", "fitness"],
  },
];

describe("Program recommendations (NP-072)", () => {
  it("matches programs by fitness goal keywords", () => {
    const results = matchRecommendedPrograms(
      samplePrograms,
      "gain_muscle",
      undefined,
    );
    expect(results.map((p) => p.id)).toContain("p-strength");
    expect(results.map((p) => p.id)).not.toContain("p-fatloss");
  });

  it("matches programs by experience level", () => {
    const results = matchRecommendedPrograms(
      samplePrograms,
      undefined,
      "beginner",
    );
    expect(results.map((p) => p.id)).toContain("p-fatloss");
    expect(results.map((p) => p.id)).toContain("p-health");
    expect(results.map((p) => p.id)).not.toContain("p-strength");
  });

  it("matches programs by both goal and level (OR condition)", () => {
    const results = matchRecommendedPrograms(
      samplePrograms,
      "lose_weight",
      "intermediate",
    );
    // p-fatloss matches goal, p-strength matches level
    expect(results.map((p) => p.id)).toContain("p-fatloss");
    expect(results.map((p) => p.id)).toContain("p-strength");
  });

  // Acceptance Criterion e015c83b
  it("degrades to no recommendations without throwing when given a legacy goal", () => {
    // Legacy profile values like 'build_muscle' predate current enum
    expect(() => {
      const results = matchRecommendedPrograms(
        samplePrograms,
        "build_muscle",
        undefined,
      );
      expect(results).toEqual([]);
    }).not.toThrow();
  });

  it("degrades to no recommendations without throwing when given a legacy level", () => {
    expect(() => {
      const results = matchRecommendedPrograms(
        samplePrograms,
        undefined,
        "super_pro",
      );
      expect(results).toEqual([]);
    }).not.toThrow();
  });

  it("returns empty when neither goal nor level are provided", () => {
    expect(matchRecommendedPrograms(samplePrograms, undefined, undefined)).toEqual([]);
    expect(matchRecommendedPrograms(samplePrograms, null, null)).toEqual([]);
  });

  it("matches web parity keywords and level mapping structure", () => {
    expect(GOAL_KEYWORDS.gain_muscle).toContain("strength");
    expect(GOAL_KEYWORDS.gain_muscle).toContain("hypertrophy");
    expect(GOAL_KEYWORDS.lose_weight).toContain("fat loss");
    expect(LEVEL_MAP.beginner).toContain("beginner");
    expect(LEVEL_MAP.intermediate).toContain("intermediate");
  });
});
