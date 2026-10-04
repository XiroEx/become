// Live view 4b (NP-235) — coaching fields mapping: tip, tempo, RPE,
// duration and primary muscles from a program exercise onto the live shape.

import { coachingFieldsFrom } from "@/lib/live/coachingFields";

describe("coachingFieldsFrom", () => {
  it("a program exercise with tip, tempo 3-1-1, rpe 8, duration 30s and primaryMuscles maps all five", () => {
    expect(
      coachingFieldsFrom({
        tip: "Keep shoulder blades pinched",
        tempo: "3-1-1",
        rpe: 8,
        duration: "30s",
        primaryMuscles: ["chest", "triceps"],
      }),
    ).toEqual({
      tip: "Keep shoulder blades pinched",
      tempo: "3-1-1",
      rpe: 8,
      durationLabel: "30s",
      primaryMuscles: ["chest", "triceps"],
    });
  });

  it('rpe "8" (string) and a non-array primaryMuscles are dropped', () => {
    expect(
      coachingFieldsFrom({
        tip: "Brace",
        tempo: "2-0-2",
        rpe: "8",
        duration: "45s",
        primaryMuscles: "chest",
      }),
    ).toEqual({
      tip: "Brace",
      tempo: "2-0-2",
      durationLabel: "45s",
    });
  });

  it("an empty exercise maps to {}", () => {
    expect(coachingFieldsFrom({})).toEqual({});
  });
});
