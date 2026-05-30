import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";
import type { LiveWorkoutExercise, LiveGrid } from "@/components/live/LiveWorkoutClient";

const exercises: LiveWorkoutExercise[] = [
  { slug: "bench", name: "Bench", sets: 2 },
  { slug: "row", name: "Row", sets: 1 },
];

const grid: LiveGrid = {
  bench: [
    { reps: 5, weight: 135, completed: true },
    { reps: 5, weight: 135, completed: false },
  ],
  row: [{ reps: 8, weight: 100, completed: true }],
};

describe("buildWorkoutSaveRequest", () => {
  it("maps the grid into the full POST /api/workouts contract", () => {
    const req = buildWorkoutSaveRequest({
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises,
      grid,
      completed: true,
      activeSeconds: 600,
    });

    expect(req.programId).toBe("prog-1");
    expect(req.phase).toBe(1);
    expect(req.day).toBe("Day 1");
    expect(req.completed).toBe(true);
    expect(req.activeSeconds).toBe(600);
    expect(req.duration).toBe(10); // round(600/60)

    expect(req.exercises).toHaveLength(2);
    expect(req.exercises[0]).toEqual({
      name: "Bench",
      exerciseSlug: "bench",
      sets: [
        { setNumber: 1, reps: 5, weight: 135, completed: true },
        { setNumber: 2, reps: 5, weight: 135, completed: false },
      ],
    });
    expect(req.exercises[1]!.sets).toEqual([
      { setNumber: 1, reps: 8, weight: 100, completed: true },
    ]);
  });

  it("defaults null reps/weight to 0 and omits duration when not completed", () => {
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 2,
      day: "Day 2",
      exercises: [{ slug: "bw", name: "Pushup", sets: 1 }],
      grid: { bw: [{ reps: null, weight: null, completed: true }] },
      completed: false,
    });
    expect(req.exercises[0]!.sets[0]).toEqual({
      setNumber: 1,
      reps: 0,
      weight: 0,
      completed: true,
    });
    expect(req.duration).toBeUndefined();
  });

  it("emits per-set duration/distance for time & distance tracking types", () => {
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 1,
      day: "Day 1",
      exercises: [
        { slug: "plank", name: "Plank", sets: 1, trackingType: "time" },
        { slug: "run", name: "Run", sets: 1, trackingType: "time_distance" },
      ],
      grid: {
        plank: [{ reps: null, weight: null, durationSec: 45, completed: true }],
        run: [
          {
            reps: null,
            weight: null,
            durationSec: 600,
            distance: 1500,
            completed: true,
          },
        ],
      },
      completed: true,
      activeSeconds: 700,
    });

    expect(req.exercises[0]!.sets[0]).toEqual({
      setNumber: 1,
      reps: 0,
      weight: 0,
      completed: true,
      duration: 45,
    });
    expect(req.exercises[1]!.sets[0]).toEqual({
      setNumber: 1,
      reps: 0,
      weight: 0,
      completed: true,
      duration: 600,
      distance: 1500,
    });
  });

  it("omits duration/distance for plain strength sets", () => {
    const req = buildWorkoutSaveRequest({
      programId: "p",
      phase: 1,
      day: "Day 1",
      exercises: [{ slug: "bench", name: "Bench", sets: 1 }],
      grid: { bench: [{ reps: 5, weight: 135, completed: true }] },
      completed: true,
    });
    expect(req.exercises[0]!.sets[0]).not.toHaveProperty("duration");
    expect(req.exercises[0]!.sets[0]).not.toHaveProperty("distance");
  });
});
