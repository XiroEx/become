/**
 * ONE DUMBBELL OR TWO, NATIVELY — the native half of the web's #1986.
 *
 * Jon, 2026-09-18: *"there are some exercises that I can do single if I wanted
 * to and just keep it as one 1 dumbbell"*. The web shipped the answer (the
 * control, the field, the memory and the hint rule); this is the same thing in
 * native Live and native Track, saving the SAME field under the SAME name:
 *
 *   • `ISetLog.bells` (1 | 2), OPTIONAL, no default, no migration. Absent
 *     means `getBellWeightInfo`'s automatic answer, exactly as before.
 *   • the control is defaulted to that automatic answer, and to whatever the
 *     member logged last time for that exercise (read from
 *     GET /api/workouts/last-performance — no preferences collection).
 *   • the "= X total" hint follows the CHOICE: shown for two, gone for one.
 *   • the rule itself is `@become/core`'s copy of the web module — native
 *     re-implements none of it.
 */

import * as fs from "fs";
import * as path from "path";
import { act, render, renderHook, waitFor, fireEvent } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import {
  LiveWorkoutClient,
  type LiveWorkoutExercise,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { buildWorkoutSaveRequest } from "@/lib/live/workoutSave";
import { buildQuickSaveRequest } from "@/lib/quickSession/quickSave";
import { useLiveWorkout } from "@/lib/live/useLiveWorkout";
import {
  bellCountFor,
  bellMemoryKeyFor,
  bellsForExercise,
  bellsFromPerformances,
} from "@/lib/live/bellCount";

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});
const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_ROOT = path.resolve(__dirname, "..");

/** A dumbbell press: the catalogue's automatic answer is a PAIR. */
const dbPress: LiveWorkoutExercise = {
  slug: "dumbbell-bench-press",
  name: "Dumbbell Bench Press",
  sets: 2,
  repsLabel: "8-10",
  trackingType: "reps_weight",
  equipment: ["dumbbell", "bench"],
  laterality: "bilateral",
};

/** A goblet squat: one kettlebell by default. */
const goblet: LiveWorkoutExercise = {
  slug: "goblet-squat",
  name: "Goblet Squat",
  sets: 1,
  repsLabel: "10",
  trackingType: "reps_weight",
  equipment: ["kettlebell"],
};

/** A barbell lift: never asked the question. */
const barbell: LiveWorkoutExercise = {
  slug: "back-squat",
  name: "Barbell Back Squat",
  sets: 1,
  repsLabel: "5",
  trackingType: "reps_weight",
  equipment: ["barbell"],
};

/** Bodyweight: no weight box, so no question either. */
const pushup: LiveWorkoutExercise = {
  slug: "push-up",
  name: "Push-up",
  sets: 1,
  repsLabel: "15",
  trackingType: "reps_bodyweight",
  equipment: ["bodyweight"],
};

const workoutOf = (exercises: LiveWorkoutExercise[]): LiveWorkoutViewModel => ({
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises,
});

const grid = (exercises: LiveWorkoutExercise[], weight: number | null) =>
  Object.fromEntries(
    exercises.map((ex) => [
      ex.slug,
      Array.from({ length: ex.sets ?? 1 }, () => ({
        reps: 10,
        weight,
        completed: true,
      })),
    ]),
  );

// ───────────────────────────────────────────────────────────────────────────
// (id: 96d40d2b) The field, and what absent means
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40d2b) the saved field is the web's `bells`, absent means automatic", () => {
  it("lib/live/bellCount.ts reads the rule from @become/core and re-implements nothing", () => {
    const source = fs.readFileSync(
      path.join(EXPO_ROOT, "lib/live/bellCount.ts"),
      "utf8",
    );
    expect(source).toMatch(/from\s+["']@become\/core["']/);
    // Shape adapters only: no second copy of the rule under a native name.
    expect(source).not.toMatch(/export\s+function\s+readBellCount/);
    expect(source).not.toMatch(/export\s+function\s+resolveBellCount/);
    expect(source).not.toMatch(/export\s+function\s+showsBellTotal/);
    expect(source).not.toMatch(/export\s+function\s+defaultBellCount/);
  });

  it("the save carries `bells` on every set of bell work, and nothing elsewhere", () => {
    const exercises = [dbPress, goblet, barbell, pushup];
    const req = buildWorkoutSaveRequest({
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises,
      grid: grid(exercises, 50),
      completed: false,
      bellChoices: { "dumbbell-bench-press": 1 },
    });

    // The member said ONE dumbbell: every set of that exercise says so.
    expect(req.exercises[0]?.sets.map((s) => s.bells)).toEqual([1, 1]);
    // Untouched kettlebell work saves the automatic answer (one implement).
    expect(req.exercises[1]?.sets[0]?.bells).toBe(1);
    // A barbell lift and a bodyweight exercise carry NO field at all — the
    // member was never shown the question.
    expect("bells" in (req.exercises[2]?.sets[0] ?? {})).toBe(false);
    expect("bells" in (req.exercises[3]?.sets[0] ?? {})).toBe(false);
  });

  it("the quick-session save sends the same field the same way", () => {
    const exercises = [dbPress, barbell];
    const body = buildQuickSaveRequest({
      sessionId: "sess-1",
      title: "Quick",
      needsName: false,
      exercises,
      grid: grid(exercises, 40),
      completed: false,
      activeSeconds: 60,
      bellChoices: { "dumbbell-bench-press": 2 },
    });
    expect(body.exercises[0]?.sets.map((s) => s.bells)).toEqual([2, 2]);
    expect("bells" in (body.exercises[1]?.sets[0] ?? {})).toBe(false);
  });

  it("no answer anywhere still sends the automatic one, never a second name", () => {
    const req = buildWorkoutSaveRequest({
      programId: "prog-1",
      phase: 1,
      day: "Day 1",
      exercises: [dbPress],
      grid: grid([dbPress], 50),
      completed: false,
    });
    // `bells` and only `bells` — the web's field, not a native-only shape.
    expect(req.exercises[0]?.sets[0]?.bells).toBe(2);
    expect(Object.keys(req.exercises[0]?.sets[0] ?? {}).sort()).toEqual([
      "bells",
      "completed",
      "reps",
      "setNumber",
      "weight",
    ]);
  });

  it("bellsForExercise asks the same two questions the web asks", () => {
    expect(bellsForExercise(dbPress)).toBe(2);
    expect(bellsForExercise(goblet)).toBe(1);
    expect(bellsForExercise(barbell)).toBeUndefined();
    expect(bellsForExercise(pushup)).toBeUndefined();
    expect(bellsForExercise(null)).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: 9d6d2d71) The control upfront in AddExerciseSheet and ExerciseSwapModal
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 9d6d2d71) upfront bell count picker in AddExerciseSheet and ExerciseSwapModal", () => {
  it("AddExerciseSheet and ExerciseSwapModal source code contains BellCountToggle", () => {
    const addSheet = fs.readFileSync(
      path.join(EXPO_ROOT, "components/workout/AddExerciseSheet.tsx"),
      "utf8",
    );
    expect(addSheet).toMatch(/<BellCountToggle/);
    expect(addSheet).toMatch(/resolveBellCount/);

    const swapModal = fs.readFileSync(
      path.join(EXPO_ROOT, "components/live/ExerciseSwapModal.tsx"),
      "utf8",
    );
    expect(swapModal).toMatch(/<BellCountToggle/);
    expect(swapModal).toMatch(/resolveBellCount/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: 9d6d2d72) In-logging-row 1-vs-2 toggle removed from Live and Track rows
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 9d6d2d72) in-logging-row 1-vs-2 toggle removed from Live and Track rows", () => {
  it("neither Track nor Live renders the BellCountToggle in logging rows", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress, goblet, barbell, pushup])}
      />,
    );
    expect(queryByTestId("live-workout-dumbbell-bench-press-bells")).toBeNull();
    expect(queryByTestId("live-workout-goblet-squat-bells")).toBeNull();
  });

  it("Live does not render the toggle under the weight box", () => {
    const { queryByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress, barbell])}
        initialView="live"
      />,
    );
    expect(
      queryByTestId("live-workout-live-dumbbell-bench-press-set-0-bells"),
    ).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// (id: 9d6d2d73) The \"= X total\" hint, and the per-exercise memory
// ───────────────────────────────────────────────────────────────────────────

describe('(id: 9d6d2d73) the \"= X total\" hint and the per-exercise memory', () => {
  it("Track: the hint and the copy follow the choice, not the catalogue", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        bellChoices={{ "dumbbell-bench-press": 2 }}
      />,
    );
    const weight = "live-workout-dumbbell-bench-press-set-0-weight";
    fireEvent.changeText(getByTestId(weight), "50");

    // Two dumbbells: a combined total worth showing.
    expect(
      getByTestId("live-workout-dumbbell-bench-press-set-0-helper").props.children,
    ).toBe("= 100 lbs total");
    expect(
      getByTestId("live-workout-dumbbell-bench-press-bell-hint").props.children,
    ).toBe("Enter the weight of one dumbbell — not the combined total.");

    // One dumbbell: the number typed IS the load, so the hint goes.
    const { queryByTestId: queryOne, getByTestId: getOne } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        bellChoices={{ "dumbbell-bench-press": 1 }}
      />,
    );
    fireEvent.changeText(getOne(weight), "50");
    expect(
      queryOne("live-workout-dumbbell-bench-press-set-0-helper"),
    ).toBeNull();
    expect(
      getOne("live-workout-dumbbell-bench-press-bell-hint").props.children,
    ).toBe("Enter the weight of one dumbbell.");
  });

  it("Live: the hint follows the choice too", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        initialView="live"
        bellChoices={{ "dumbbell-bench-press": 2 }}
      />,
    );
    const set = "live-workout-live-dumbbell-bench-press-set-0";
    fireEvent.changeText(getByTestId(`${set}-weight`), "40");
    expect(getByTestId(`${set}-helper`).props.children).toBe("= 80 lbs total");

    const { queryByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        initialView="live"
        bellChoices={{ "dumbbell-bench-press": 1 }}
      />,
    );
    fireEvent.changeText(getByTestId(`${set}-weight`), "40");
    expect(queryByTestId(`${set}-helper`)).toBeNull();
  });

  it("the member's unit travels with the hint, and nothing is converted", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        weightUnit="kg"
        bellChoices={{ "dumbbell-bench-press": 2 }}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-dumbbell-bench-press-set-0-weight"),
      "40",
    );
    expect(
      getByTestId("live-workout-dumbbell-bench-press-set-0-helper").props.children,
    ).toBe("= 80 kg total");
  });

  it("last time's answer is the default, and the session choice beats it", () => {
    const remembered = { "dumbbell-bench-press": 1 as const };
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        rememberedBells={remembered}
      />,
    );
    fireEvent.changeText(
      getByTestId("live-workout-dumbbell-bench-press-set-0-weight"),
      "50",
    );
    expect(
      queryByTestId("live-workout-dumbbell-bench-press-set-0-helper"),
    ).toBeNull();

    // …and saying \"two\" in bellChoices wins over the memory.
    const { getByTestId: getByTestId2 } = render(
      <LiveWorkoutClient
        workout={workoutOf([dbPress])}
        rememberedBells={remembered}
        bellChoices={{ "dumbbell-bench-press": 2 }}
      />,
    );
    fireEvent.changeText(
      getByTestId2("live-workout-dumbbell-bench-press-set-0-weight"),
      "50",
    );
    expect(
      getByTestId2("live-workout-dumbbell-bench-press-set-0-helper").props.children,
    ).toBe("= 100 lbs total");
  });

  it("the memory is per exercise, keyed by the slug last-performance answers with", () => {
    expect(bellMemoryKeyFor(dbPress)).toBe("dumbbell-bench-press");
    expect(bellMemoryKeyFor({ name: "Single-Arm DB Row" })).toBe(
      "single-arm-db-row",
    );
    expect(
      bellsFromPerformances({
        "dumbbell-bench-press": { bells: 1 },
        // No recorded answer: left out, so the automatic answer stands.
        "goblet-squat": {},
        "back-squat": null,
      }),
    ).toEqual({ "dumbbell-bench-press": 1 });

    const remembered = { "dumbbell-bench-press": 1 as const };
    expect(bellCountFor(dbPress, {}, remembered)).toBe(1);
    expect(bellCountFor(dbPress, { "dumbbell-bench-press": 2 }, remembered)).toBe(2);
    // A different exercise is untouched by its neighbour's answer.
    expect(bellCountFor(goblet, {}, remembered)).toBe(1);
  });

  it("the state machine remembers last time's answer and saves it with the set", async () => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((p: string, _schema: unknown, init?: unknown) => {
      const url = String(p);
      if (url.startsWith("/api/programs/current-workout")) {
        return Promise.resolve({
          workout: {
            title: "Push A",
            day: "Day 1",
            exercises: [
              {
                exerciseSlug: "dumbbell-bench-press",
                name: "Dumbbell Bench Press",
                sets: 1,
                reps: "10",
                trackingType: "reps_weight",
                equipment: ["dumbbell", "bench"],
              },
            ],
          },
          phase: 1,
          day: "Day 1",
        });
      }
      if (url.startsWith("/api/workouts/last-performance")) {
        // The member logged this exercise with ONE dumbbell last time.
        return Promise.resolve({
          performances: {
            "dumbbell-bench-press": {
              reps: 10,
              weight: 50,
              bells: 1,
              date: "2026-10-13T00:00:00.000Z",
            },
          },
          prs: {},
        });
      }
      if (url.startsWith("/api/workouts?")) {
        return Promise.resolve({ isResume: false, workout: null, exerciseHistory: {} });
      }
      if (url === "/api/workouts" && (init as { method?: string })?.method === "POST") {
        return Promise.resolve({ message: "Workout saved successfully", completed: false });
      }
      return Promise.resolve({});
    });

    const { result } = renderHook(() => useLiveWorkout("prog-1", "Day 1", null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await waitFor(() =>
      expect(result.current.rememberedBells).toEqual({
        "dumbbell-bench-press": 1,
      }),
    );

    // Saving without touching the control sends last time's answer…
    await act(async () => {
      await result.current.save(false, {
        "dumbbell-bench-press": [{ reps: 10, weight: 50, completed: true }],
      });
    });
    const bellsOnLastPost = () => {
      const posts = mockApiFetch.mock.calls.filter(
        (c: unknown[]) =>
          String(c[0]) === "/api/workouts" &&
          (c[2] as { method?: string })?.method === "POST",
      );
      const body = (posts[posts.length - 1]?.[2] as { body: { exercises: { sets: { bells?: number }[] }[] } }).body;
      return body.exercises[0]?.sets[0]?.bells;
    };
    expect(bellsOnLastPost()).toBe(1);

    // …and changing it changes what the next save carries.
    act(() => {
      result.current.setBellChoice("dumbbell-bench-press", 2);
    });
    await act(async () => {
      await result.current.save(false, {
        "dumbbell-bench-press": [{ reps: 10, weight: 50, completed: true }],
      });
    });
    expect(bellsOnLastPost()).toBe(2);
  });
});
