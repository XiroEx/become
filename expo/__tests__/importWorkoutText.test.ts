import {
  flagImportedProgram,
  normalizeImportedProgram,
  normalizeImportedSession,
  resolveImportedSession,
  type ResolvableExercise,
} from "@/lib/workout/importWorkoutText";

function twoPhaseRaw() {
  return {
    name: "  Strength Block  ",
    description: "  Build strength  ",
    goal: "Get strong",
    duration_weeks: 8,
    training_days_per_week: 2,
    target_user: "Advanced",
    phases: [
      {
        phase: "Base",
        weeks: "1-4",
        focus: "Volume",
        workouts: [
          {
            day: "Day 1",
            title: "Push",
            exercises: [
              { name: "Bench Press", sets: 4, reps: "8-10", rest: "90s" },
              { name: "Overhead Press", sets: 3, reps: "10" },
            ],
          },
        ],
      },
      {
        phase: "Peak",
        weeks: "5-8",
        focus: "Intensity",
        workouts: [
          {
            day: "Day 1",
            title: "Pull",
            exercises: [{ name: "Deadlift", sets: 5, reps: "5" }],
          },
        ],
      },
    ],
  };
}

describe("normalizeImportedProgram", () => {
  it("normalizes a program with two phases (name, phases, workouts, exercises)", () => {
    const program = normalizeImportedProgram(twoPhaseRaw());
    expect(program).not.toBeNull();
    expect(program!.name).toBe("Strength Block");
    expect(program!.phases).toHaveLength(2);
    expect(program!.phases[0]!.phase).toBe("Base");
    expect(program!.phases[0]!.workouts).toHaveLength(1);
    expect(program!.phases[0]!.workouts[0]!.exercises.map((e) => e.name)).toEqual([
      "Bench Press",
      "Overhead Press",
    ]);
    expect(program!.phases[1]!.workouts[0]!.exercises.map((e) => e.name)).toEqual(["Deadlift"]);
    expect(program!.duration_weeks).toBe(8);
    expect(program!.training_days_per_week).toBe(2);
    expect(program!.target_user).toBe("Advanced");
  });

  it("drops malformed exercises, empty workouts and empty phases", () => {
    const program = normalizeImportedProgram({
      phases: [
        {
          phase: "Good",
          workouts: [
            {
              day: "Day 1",
              title: "Keep",
              exercises: [
                { name: "  Squat  ", sets: 3, reps: "5" },
                { name: "   " },
                { sets: 3 },
                null,
                42,
              ],
            },
            { day: "Day 2", title: "Empty workout", exercises: [{ name: "" }, null] },
            "not-a-workout",
          ],
        },
        { phase: "Empty phase", workouts: [{ title: "Nope", exercises: [] }] },
        null,
      ],
    });
    expect(program).not.toBeNull();
    expect(program!.phases).toHaveLength(1);
    expect(program!.phases[0]!.workouts).toHaveLength(1);
    expect(program!.phases[0]!.workouts[0]!.exercises.map((e) => e.name)).toEqual(["Squat"]);
  });

  it("falls back to Imported Program / Workout n / Phase n and returns null when nothing usable", () => {
    const fallback = normalizeImportedProgram({
      phases: [{ workouts: [{ exercises: [{ name: "Squat", sets: 3 }] }] }],
    });
    expect(fallback).not.toBeNull();
    expect(fallback!.name).toBe("Imported Program");
    expect(fallback!.phases[0]!.phase).toBe("Phase 1");
    expect(fallback!.phases[0]!.workouts[0]!.title).toBe("Workout 1");
    expect(fallback!.goal).toBe("Follow my own program");

    expect(normalizeImportedProgram(null)).toBeNull();
    expect(normalizeImportedProgram({})).toBeNull();
    expect(normalizeImportedProgram({ phases: [] })).toBeNull();
    expect(
      normalizeImportedProgram({ phases: [{ workouts: [{ exercises: [{ name: "" }] }] }] }),
    ).toBeNull();
  });
});

describe("flagImportedProgram", () => {
  it("flags an unknown name new, a bare name broken, and A1. Bench Press grouped", () => {
    const program = normalizeImportedProgram({
      phases: [
        {
          workouts: [
            {
              title: "Push",
              exercises: [
                { name: "Bench Press", sets: 4, reps: "8" },
                { name: "Mystery Move", sets: 3, reps: "10" },
                { name: "A1. Bench Press", sets: 3, reps: "10" },
              ],
            },
          ],
        },
      ],
    })!;
    const flagged = flagImportedProgram(program, new Set(["bench press", "a1. bench press"]));
    const [known, unknown, grouped] = flagged.phases[0]!.workouts[0]!.exercises;
    expect(known!.importFlags).toBeUndefined();
    expect(unknown!.importFlags).toEqual(["new"]);
    expect(grouped!.importFlags).toEqual(expect.arrayContaining(["grouped"]));
    expect(grouped!.importFlags).not.toContain("new");

    const broken = flagImportedProgram(
      normalizeImportedProgram({
        phases: [{ workouts: [{ exercises: [{ name: "Row" }] }] }],
      })!,
      new Set(["row"]),
    );
    expect(broken.phases[0]!.workouts[0]!.exercises[0]!.importFlags).toEqual(["broken"]);
  });
});

describe("normalizeImportedSession", () => {
  it("flattens phases and dedupes by name", () => {
    const session = normalizeImportedSession({
      name: "Big Block",
      phases: [
        { workouts: [{ title: "Push", exercises: [{ name: "Bench Press", sets: 4 }] }] },
        {
          workouts: [
            {
              title: "Pull",
              exercises: [{ name: "bench press", sets: 3 }, { name: "Row", sets: 3 }],
            },
          ],
        },
      ],
    });
    expect(session).not.toBeNull();
    expect(session!.exercises.map((e) => e.name)).toEqual(["Bench Press", "Row"]);
  });

  it("prefers a stated workout title over Imported Session", () => {
    const stated = normalizeImportedSession({
      phases: [{ workouts: [{ title: "Push Day", exercises: [{ name: "Squat" }] }] }],
    });
    expect(stated!.title).toBe("Push Day");

    const defaulted = normalizeImportedSession({
      phases: [{ workouts: [{ exercises: [{ name: "Squat" }] }] }],
    });
    expect(defaulted!.title).toBe("Imported Session");

    const named = normalizeImportedSession({
      name: "Leg Day",
      phases: [{ workouts: [{ exercises: [{ name: "Squat" }] }] }],
    });
    expect(named!.title).toBe("Leg Day");

    expect(normalizeImportedSession({ phases: [] })).toBeNull();
  });
});

describe("resolveImportedSession", () => {
  function known(): Map<string, ResolvableExercise> {
    return new Map([
      ["bench press", { slug: "bench-press", name: "Bench Press", trackingType: "reps_weight" }],
      ["plank", { slug: "plank", name: "Plank", trackingType: "time_weight" }],
      ["row a", { slug: "shared-slug", name: "Row A", trackingType: "reps_weight" }],
      ["row b", { slug: "shared-slug", name: "Row B", trackingType: "reps_weight" }],
    ]);
  }

  it("matches case-insensitively, lists the rest unresolved, never reuses a slug, defaults sets/reps", () => {
    const resolved = resolveImportedSession(
      {
        title: "Push",
        exercises: [
          { name: "  BENCH press ", rest: "90s" },
          { name: "Plank" },
          { name: "Row A" },
          { name: "Row B" },
          { name: "Mystery Move" },
        ],
      },
      known(),
    );
    expect(resolved.title).toBe("Push");
    expect(resolved.exercises.map((e) => e.name)).toEqual(["Bench Press", "Plank", "Row A"]);
    expect(resolved.exercises[0]).toMatchObject({
      exerciseSlug: "bench-press",
      sets: 3,
      reps: "8-12",
      rest: "90s",
    });
    // time* tracking defaults to empty reps.
    expect(resolved.exercises[1]).toMatchObject({ exerciseSlug: "plank", sets: 3, reps: "" });
    // Second exercise sharing the slug is not reused — it lands in unresolved.
    expect(resolved.unresolved).toEqual(["Row B", "Mystery Move"]);
  });
});
