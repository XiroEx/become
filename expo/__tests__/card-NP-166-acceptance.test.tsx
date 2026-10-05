/* eslint-disable import/first */
// NP-166 — CORRECT A LOGGED WORKOUT'S NUMBERS.
//
// A member can fix a mistyped set in a finished workout on the web
// (`webapp/components/workout/TrainingLogCorrectionModal.tsx` from the
// progress page, `PATCH /api/workouts/logs` — a quick log located by
// `sessionId`, a program log by its locator — with PRs and history
// recomputed from the corrected log). This suite pins the native port:
// the sheet (`components/workout/TrainingLogCorrectionSheet.tsx`) on
// history rows and progress workout rows, through the same endpoint.
//
// Fetch is mocked at the `apiFetch` seam (no network). The two acceptance
// ids, each asserted on its own below:
//
//   e015ca62 — a set corrected natively shows corrected on the web and in
//     PRs: the native PATCH sends the web's path, method and body (quick
//     locator by `sessionId`, program locator by its tuple), and the
//     corrected value parses through the web's own contracts
//     (`WorkoutLogCorrectionRequestSchema`, the progress answer carrying
//     the corrected set);
//   e015ca63 — a correction that would make a set invalid (negative weight,
//     fractional reps) is refused with the server's message: the client
//     sends what the member typed and renders the server's `error`
//     verbatim, keeping the sheet open.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {},
    async deleteItemAsync(key: string): Promise<void> {},
  };
});

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "fake-token", user: { id: "u1" } }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import {
  ProgressApiResponseSchema,
  WorkoutLogCorrectionRequestSchema,
  apiFetch,
} from "@become/api-client";
import { TrainingLogCorrectionSheet } from "@/components/workout/TrainingLogCorrectionSheet";
import {
  correctableFromProgressWorkout,
  correctableFromQuickSession,
  correctableFromStoredLog,
  correctionChanges,
  correctionPath,
  correctionRequest,
  draftFromWorkout,
  submitWorkoutCorrection,
  visibleCorrectionFields,
  type CorrectableWorkout,
} from "@/lib/workout/correction";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const WORKOUT: CorrectableWorkout = {
  kind: "quick",
  date: "Fri, Sep 26",
  rawDate: "2026-09-26T14:00:00.000Z",
  sessionId: "qs-1",
  day: "Tuesday Pump",
  title: "Tuesday Pump",
  duration: 30,
  notes: "",
  notesKnown: true,
  exercises: [
    {
      name: "Barbell Bench Press",
      slug: "bench-press",
      sets: [
        { reps: 5, weight: 185, duration: null, distance: null, speed: null, completed: true },
        { reps: 5, weight: 135, duration: null, distance: null, speed: null, completed: true },
      ],
    },
  ],
};

const PROGRAM_WORKOUT: CorrectableWorkout = {
  kind: "program",
  date: "Fri, Sep 26",
  rawDate: "2026-09-26T14:00:00.000Z",
  programId: "prog-1",
  day: "Day 1",
  title: "Hypertrophy · Day 1",
  duration: 45,
  notes: "",
  notesKnown: true,
  exercises: [
    {
      name: "Back Squat",
      slug: "back-squat",
      sets: [
        { reps: 5, weight: 225, duration: null, distance: null, speed: null, completed: true },
      ],
    },
  ],
};

function renderSheet(workout: CorrectableWorkout = WORKOUT, onSaved: () => void = () => {}) {
  return render(
    <TrainingLogCorrectionSheet
      workout={workout}
      onClose={() => {}}
      onSaved={onSaved}
      authToken="fake-token"
    />,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ success: true, recalculatedPRs: 1 });
});

// ─── e015ca62: a set corrected natively shows corrected on the web and in PRs ─

describe("(id: e015ca62) a set corrected natively shows corrected on the web and in PRs", () => {
  it("PATCHes the web's path with the quick locator and the corrected set", async () => {
    setSystemScheme("light");
    const onSaved = jest.fn();
    const { getByTestId } = renderSheet(WORKOUT, onSaved);
    // Fix the mistyped first set: 185 → 190.
    fireEvent.changeText(getByTestId("correction-sheet-exercise-0-set-0-weight"), "190");
    // Review first: no PATCH yet, the confirm banner names the change.
    fireEvent.press(getByTestId("correction-sheet-confirm"));
    expect(getByTestId("correction-sheet-review-banner")).toBeTruthy();
    expect(getByTestId("correction-sheet-review-change")).toHaveTextContent(
      "• Barbell Bench Press · Set 1 weight: 185 lb → 190 lb",
    );
    expect(mockApiFetch).not.toHaveBeenCalled();
    // Confirm: the PATCH goes out with the web's locator and body.
    await act(async () => {
      fireEvent.press(getByTestId("correction-sheet-confirm"));
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [path, , init] = mockApiFetch.mock.calls[0] as [string, unknown, Record<string, unknown>];
    expect(path).toBe("/api/workouts/logs");
    expect(init).toMatchObject({ method: "PATCH" });
    // The body parses through the web's own correction contract — what the
    // server applies is what the web renders next.
    const parsed = WorkoutLogCorrectionRequestSchema.parse(init.body);
    expect(parsed.locator).toMatchObject({ kind: "quick", sessionId: "qs-1" });
    expect(parsed.correction.exercises[0]?.sets[0]).toMatchObject({
      setNumber: 1,
      weight: 190,
      reps: 5,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("locates a program log by its program/day/date tuple, without a title", () => {
    const draft = draftFromWorkout(PROGRAM_WORKOUT);
    const req = correctionRequest(PROGRAM_WORKOUT, {
      ...draft,
      sets: [
        [{ reps: "5", weight: "225", duration: "", distance: "", speed: "", completed: true }],
      ],
    });
    expect(correctionPath()).toBe("/api/workouts/logs");
    const parsed = WorkoutLogCorrectionRequestSchema.parse(req);
    expect(parsed.locator).toMatchObject({
      kind: "program",
      programId: "prog-1",
      day: "Day 1",
      date: "2026-09-26T14:00:00.000Z",
    });
    expect(parsed.correction.title).toBeUndefined();
  });

  it("the corrected set is what the web's progress answer carries", () => {
    // The server replays the corrected log into the progress payload; the
    // corrected value parses through the web's own progress contract.
    const webAnswer = {
      weightData: [],
      bmiData: [],
      moodData: [],
      currentProgram: null,
      stats: { streakDays: 1, totalWorkouts: 1, thisWeekWorkouts: 1, goalProgress: 10 },
      detailedWorkouts: [
        {
          date: "Fri, Sep 26",
          rawDate: "2026-09-26T14:00:00.000Z",
          kind: "quick",
          sessionId: "qs-1",
          day: "Tuesday Pump",
          totalVolume: 1625,
          exercises: [
            {
              name: "Barbell Bench Press",
              slug: "bench-press",
              bestSet: { weight: 190, reps: 5 },
              volume: 1625,
              isPR: true,
              sets: [
                {
                  setNumber: 1,
                  reps: 5,
                  weight: 190,
                  duration: null,
                  distance: null,
                  speed: null,
                  completed: true,
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = ProgressApiResponseSchema.parse(webAnswer);
    expect(parsed.detailedWorkouts?.[0]?.exercises[0]?.bestSet).toMatchObject({
      weight: 190,
      reps: 5,
    });
    // …and the progress row adapts straight into the correction editor.
    const correctable = correctableFromProgressWorkout(parsed.detailedWorkouts![0]!);
    expect(correctable.sessionId).toBe("qs-1");
    expect(correctable.exercises[0]?.sets[0]?.weight).toBe(190);
  });

  it("history quick and program rows adapt their single-log reads", () => {
    const quick = correctableFromQuickSession({
      sessionId: "qs-1",
      title: "Tuesday Pump",
      date: "2026-09-26T14:00:00.000Z",
      completed: true,
      exercises: [
        {
          name: "Barbell Bench Press",
          exerciseSlug: "bench-press",
          trackingType: "reps_weight",
          sets: [
            { setNumber: 1, reps: 5, weight: 185, duration: null, distance: null, speed: null, completed: true },
          ],
        },
      ],
    });
    expect(quick.kind).toBe("quick");
    expect(quick.sessionId).toBe("qs-1");
    // The session read carries no notes: the correction leaves them alone
    // rather than wiping what the member wrote on the web.
    expect(quick.notesKnown).toBe(false);
    expect(correctionChanges(quick, draftFromWorkout(quick))).toEqual([]);

    const program = correctableFromStoredLog({
      date: "2026-09-26T14:00:00.000Z",
      kind: "program",
      programId: "prog-1",
      day: "Day 1",
      title: "Hypertrophy · Day 1",
      completed: true,
      duration: 45,
      notes: "Felt strong",
      exercises: [
        {
          name: "Back Squat",
          exerciseSlug: "back-squat",
          sets: [{ setNumber: 1, reps: 5, weight: 225, completed: true }],
        },
      ],
    });
    expect(program.kind).toBe("program");
    expect(program.programId).toBe("prog-1");
    expect(program.notes).toBe("Felt strong");
  });

  it("an unchanged log cannot reach review: the confirm stays disabled", () => {
    setSystemScheme("light");
    const { getByTestId } = renderSheet();
    expect(getByTestId("correction-sheet-confirm").props.accessibilityState?.disabled).toBe(true);
  });

  it("only entered columns are edited: a strength exercise shows reps and weight", () => {
    expect(
      visibleCorrectionFields([
        { reps: 5, weight: 185, duration: null, distance: null, speed: null },
      ]),
    ).toEqual(["reps", "weight"]);
  });
});

// ─── e015ca63: an invalid correction is refused with the server's message ────

describe("(id: e015ca63) a correction that would make a set invalid is refused with the server's message", () => {
  it("a negative weight leaves the phone and comes back as the server's words", async () => {
    setSystemScheme("light");
    const { ApiError: ApiErrorClass } = jest.requireActual("@become/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiErrorClass(400, { error: "Weight must be between 0 and 100000" }),
    );
    const onSaved = jest.fn();
    const { getByTestId } = renderSheet(WORKOUT, onSaved);

    fireEvent.changeText(getByTestId("correction-sheet-exercise-0-set-0-weight"), "-5");
    // The client does not pre-empt the server: the review names the change
    // and the PATCH still goes out with what the member typed.
    fireEvent.press(getByTestId("correction-sheet-confirm"));
    expect(getByTestId("correction-sheet-review-banner")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId("correction-sheet-confirm"));
    });
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledTimes(1));
    const [, , init] = mockApiFetch.mock.calls[0] as [string, unknown, Record<string, unknown>];
    const sent = init.body as {
      correction: { exercises: { sets: { weight?: number }[] }[] };
    };
    expect(sent.correction.exercises[0]?.sets[0]?.weight).toBe(-5);
    // The refusal keeps the sheet open with the server's message verbatim.
    await waitFor(() =>
      expect(getByTestId("correction-sheet-error")).toHaveTextContent(
        "Weight must be between 0 and 100000",
      ),
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("fractional reps are refused with the server's words, not the client's", async () => {
    setSystemScheme("light");
    const { ApiError: ApiErrorClass } = jest.requireActual("@become/api-client");
    mockApiFetch.mockRejectedValueOnce(
      new ApiErrorClass(400, { error: "Reps must be a whole number" }),
    );
    const { getByTestId } = renderSheet();

    fireEvent.changeText(getByTestId("correction-sheet-exercise-0-set-0-reps"), "2.5");
    fireEvent.press(getByTestId("correction-sheet-confirm"));
    await act(async () => {
      fireEvent.press(getByTestId("correction-sheet-confirm"));
    });
    await waitFor(() =>
      expect(getByTestId("correction-sheet-error")).toHaveTextContent(
        "Reps must be a whole number",
      ),
    );
  });

  it("a dead connection says the original log is unchanged", async () => {
    setSystemScheme("light");
    mockApiFetch.mockRejectedValueOnce(new Error("Network request failed"));
    const { getByTestId } = renderSheet();

    fireEvent.changeText(getByTestId("correction-sheet-exercise-0-set-0-weight"), "190");
    fireEvent.press(getByTestId("correction-sheet-confirm"));
    await act(async () => {
      fireEvent.press(getByTestId("correction-sheet-confirm"));
    });
    await waitFor(() =>
      expect(getByTestId("correction-sheet-error")).toHaveTextContent(
        "Network error — your original log is unchanged",
      ),
    );
  });

  it("submitWorkoutCorrection parses the body against the web's contract first", async () => {
    const draft = draftFromWorkout(WORKOUT);
    await submitWorkoutCorrection(
      WORKOUT,
      {
        ...draft,
        sets: [
          [
            { reps: "5", weight: "190", duration: "", distance: "", speed: "", completed: true },
            { reps: "5", weight: "135", duration: "", distance: "", speed: "", completed: true },
          ],
        ],
      },
      { authToken: "fake-token" },
    );
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/workouts/logs",
      expect.anything(),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
