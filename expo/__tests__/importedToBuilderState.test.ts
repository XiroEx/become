/**
 * IMPORT FROM TEXT 4/4 (NP-244): `importedToBuilderState`.
 *
 * Pure mapper from `ImportedProgram` (NP-242's `importProgramFromText`
 * output) to `ProgramBuilderState` (the shape `ProgramBuilder`'s
 * `initialState` prop accepts). No fetch, no React — tested as pure data.
 */

import { importedToBuilderState } from "@/lib/programs/importedToBuilderState";
import type { ImportedProgram } from "@/lib/workout/importWorkoutText";
import { createBuilderExercise } from "@/lib/programs/programBuilder";

function twoPhaseProgram(): ImportedProgram {
  return {
    name: "12-Week Strength Builder",
    description: "Found on a forum",
    goal: "Build strength",
    duration_weeks: 12,
    training_days_per_week: 4,
    target_user: "Intermediate",
    phases: [
      {
        phase: "Phase 1",
        weeks: "1-6",
        focus: "Base strength",
        workouts: [
          {
            day: "Day 1",
            title: "Upper",
            exercises: [
              {
                name: "Bench Press",
                sets: 4,
                reps: "6-8",
                rest: "120s",
                details: "Pause at chest",
              },
              { name: "Lat Pulldown", reps: "10-12" },
            ],
          },
          {
            day: "Day 2",
            title: "Lower",
            exercises: [{ name: "Back Squat", sets: 5, reps: "5" }],
          },
        ],
      },
      {
        phase: "Phase 2",
        weeks: "7-12",
        focus: "Hypertrophy",
        workouts: [
          {
            day: "Day 1",
            title: "Push",
            exercises: [{ name: "Overhead Press", sets: 3, reps: "8-10" }],
          },
        ],
      },
    ],
  };
}

describe("importedToBuilderState", () => {
  it("maps a two-phase program's name/description/goal/duration/days/target_user straight across", () => {
    const state = importedToBuilderState(twoPhaseProgram());
    expect(state.name).toBe("12-Week Strength Builder");
    expect(state.description).toBe("Found on a forum");
    expect(state.goal).toBe("Build strength");
    expect(state.duration_weeks).toBe(12);
    expect(state.training_days_per_week).toBe(4);
    expect(state.target_user).toBe("Intermediate");
    expect(state.equipment).toEqual([]);
    expect(state.tags).toEqual([]);
  });

  it("maps both phases, their workouts and exercises, keeping sets/reps/rest/details as text", () => {
    const state = importedToBuilderState(twoPhaseProgram());
    expect(state.phases).toHaveLength(2);

    const phase1 = state.phases[0]!;
    expect(phase1.phase).toBe("Phase 1");
    expect(phase1.weeks).toBe("1-6");
    expect(phase1.focus).toBe("Base strength");
    expect(phase1.workouts).toHaveLength(2);
    expect(phase1.workouts[0]!.day).toBe("Day 1");
    expect(phase1.workouts[0]!.title).toBe("Upper");

    const bench = phase1.workouts[0]!.exercises[0]!;
    expect(bench.exerciseSlug).toBe("");
    expect(bench.name).toBe("Bench Press");
    expect(bench.sets).toBe(4);
    expect(bench.reps).toBe("6-8");
    expect(bench.rest).toBe("120s");
    expect(bench.details).toBe("Pause at chest");

    const phase2 = state.phases[1]!;
    expect(phase2.phase).toBe("Phase 2");
    expect(phase2.weeks).toBe("7-12");
    expect(phase2.focus).toBe("Hypertrophy");
    expect(phase2.workouts).toHaveLength(1);
    expect(phase2.workouts[0]!.exercises[0]!.name).toBe("Overhead Press");
  });

  it("gives an exercise with no sets the builder's own defaults, per-field", () => {
    const program = twoPhaseProgram();
    const state = importedToBuilderState(program);
    // "Lat Pulldown" was parsed with a `reps` but no `sets`/`rest`/`details".
    const latPulldown = state.phases[0]!.workouts[0]!.exercises[1]!;
    const blank = createBuilderExercise("");
    expect(latPulldown.name).toBe("Lat Pulldown");
    expect(latPulldown.sets).toBe(blank.sets); // 3
    expect(latPulldown.reps).toBe("10-12"); // the imported value, not the default "10"
    expect(latPulldown.rest).toBe(blank.rest); // "60s"
    expect(latPulldown.details).toBeUndefined();
  });

  it("carries no importFlags — the builder has no field to show the new/broken/grouped hint from yet", () => {
    const flagged: ImportedProgram = {
      ...twoPhaseProgram(),
      phases: [
        {
          phase: "Phase 1",
          weeks: "1-4",
          focus: "Base",
          workouts: [
            {
              day: "Day 1",
              title: "Full Body",
              exercises: [
                {
                  name: "Zercher Squat",
                  sets: 3,
                  reps: "8",
                  importFlags: ["new"],
                },
                {
                  name: "A1. Bench Press",
                  importFlags: ["grouped", "broken"],
                },
              ],
            },
          ],
        },
      ],
    };
    const state = importedToBuilderState(flagged);
    const exercises = state.phases[0]!.workouts[0]!.exercises;
    expect(exercises).toHaveLength(2);
    for (const exercise of exercises) {
      expect(exercise).not.toHaveProperty("importFlags");
    }
    expect(exercises[0]!.name).toBe("Zercher Squat");
    expect(exercises[1]!.name).toBe("A1. Bench Press");
  });
});
