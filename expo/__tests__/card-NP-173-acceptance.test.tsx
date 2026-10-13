// NP-173 — in-workout progression and plateau hints, dismissable.
//
// Port of the web pair in
// `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
// (fetch once per workout, render under the exercise header, dismiss through
// `POST /api/suggestions/dismiss { id }` on the account) and
// `WorkoutFormClient.tsx` (the same hint inside the Track card).
//
// The two acceptance ids, each asserted on its own below.

import { useState } from "react";
import { View } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Button } from "@/components/Button";
import { ExerciseHint, exerciseHintsBySlug } from "@/components/live/ExerciseHint";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { useExerciseHints } from "@/lib/live/useExerciseHints";
import { apiFetch } from "@become/api-client";

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

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  async getItemAsync(): Promise<string | null> {
    return "test-jwt";
  },
  async setItemAsync(): Promise<void> {},
  async deleteItemAsync(): Promise<void> {},
}));

function twoExerciseWorkout(): LiveWorkoutViewModel {
  return {
    programId: "prog-1",
    workoutTitle: "Push A",
    exercises: [
      { slug: "bench", name: "Bench Press", sets: 1, trackingType: "reps_weight" },
      { slug: "row", name: "Row", sets: 1, trackingType: "reps_weight" },
    ],
  };
}

function suggestion(id: string, slug: string, title = "Add weight") {
  return {
    id,
    severity: "nudge",
    title,
    body: "Try +5 lb next set.",
    placement: "exercise",
    dismissible: true,
    source: "progression",
    sourceData: { exerciseSlug: slug },
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation((path: string, _schema: unknown, init?: { body?: unknown }) => {
    const url = String(path);
    if (url.startsWith("/api/workouts/exercise-suggestions")) {
      return Promise.resolve({
        suggestions: [suggestion("hint-bench", "bench"), suggestion("hint-row", "row")],
      });
    }
    if (url === "/api/suggestions/dismiss") {
      return Promise.resolve({
        success: true,
        id: (init?.body as { id?: string } | undefined)?.id ?? "",
        wasUpdate: false,
        count: 1,
      });
    }
    return Promise.resolve({});
  });
});

function Harness({ slugs }: { slugs: string[] }) {
  const { hints, dismissHint } = useExerciseHints(slugs);
  const [view, setView] = useState<"track" | "live">("track");
  return (
    <View>
      <LiveWorkoutClient
        workout={twoExerciseWorkout()}
        initialView={view}
        exerciseHints={hints}
        onDismissHint={(slug) => void dismissHint(slug)}
      />
      <Button testID="go-live" variant="secondary" onPress={() => setView("live")}>
        go live
      </Button>
    </View>
  );
}

describe("(id: e015ca89) A hint appears only on its own exercise", () => {
  it("keys suggestions by sourceData.exerciseSlug, first per slug wins", () => {
    const map = exerciseHintsBySlug([
      suggestion("a1", "bench"),
      suggestion("a2", "bench", "Second"),
      suggestion("b1", "row"),
      { ...suggestion("c1", "row"), sourceData: {} },
    ]);
    expect(Object.keys(map).sort()).toEqual(["bench", "row"]);
    expect(map["bench"]?.id).toBe("a1");
    expect(map["row"]?.id).toBe("b1");
  });

  it("Track shows each hint inside its own exercise card and no other", async () => {
    const { getByTestId, queryByTestId } = render(<Harness slugs={["bench", "row"]} />);
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-hint")).toBeTruthy();
    });
    expect(getByTestId("live-workout-row-hint")).toBeTruthy();
    // The bench hint carries the bench title/body — scoped by slug, not shared.
    expect(getByTestId("live-workout-bench-hint-title")).toBeTruthy();
    expect(queryByTestId("live-workout-bench-hint-dismiss")).toBeTruthy();
    // One fetch for the whole workout, not one per exercise.
    const suggestionCalls = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/workouts/exercise-suggestions"),
    );
    expect(suggestionCalls).toHaveLength(1);
    expect(String(suggestionCalls[0]?.[0])).toContain("bench");
    expect(String(suggestionCalls[0]?.[0])).toContain("row");
  });

  it("Live shows only the current exercise's hint while stepping", async () => {
    const { getByTestId, queryByTestId } = render(
      <LiveWorkoutClient
        workout={twoExerciseWorkout()}
        initialView="live"
        exerciseHints={{
          bench: { id: "hint-bench", title: "Add weight", body: "Try +5 lb." },
          row: { id: "hint-row", title: "Plateau", body: "Deload." },
        }}
      />,
    );
    // First step is bench: only the bench hint is on screen.
    expect(getByTestId("live-workout-live-bench-hint")).toBeTruthy();
    expect(queryByTestId("live-workout-live-row-hint")).toBeNull();
    // Step to the row: the bench hint leaves with its exercise.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-live-next"));
    });
    expect(queryByTestId("live-workout-live-bench-hint")).toBeNull();
    expect(getByTestId("live-workout-live-row-hint")).toBeTruthy();
  });

  it("renders nothing when there is no hint for the exercise", () => {
    const { queryByTestId } = render(
      <ExerciseHint
        hint={{ id: "x", title: "T", body: "B" }}
        exerciseSlug="bench"
        testID="solo-hint"
      />,
    );
    expect(queryByTestId("solo-hint-title")).toBeTruthy();
    const { queryByTestId: q2 } = render(
      <LiveWorkoutClient workout={twoExerciseWorkout()} initialView="track" />,
    );
    expect(q2("live-workout-bench-hint")).toBeNull();
    expect(q2("live-workout-row-hint")).toBeNull();
  });
});

describe("(id: e015ca88) A hint dismissed natively does not reappear on the web", () => {
  it("dismiss posts the hint id to POST /api/suggestions/dismiss and removes it locally", async () => {
    const { getByTestId, queryByTestId } = render(<Harness slugs={["bench", "row"]} />);
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-hint")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-bench-hint-dismiss"));
    });
    // The bench hint is gone; the row hint stays.
    expect(queryByTestId("live-workout-bench-hint")).toBeNull();
    expect(getByTestId("live-workout-row-hint")).toBeTruthy();
    // The dismissal reached the account — the same POST the web sends, so the
    // server's dismissed list (which both apps read) hides it on the web too.
    const dismissCalls = mockApiFetch.mock.calls.filter(
      (c) => String(c[0]) === "/api/suggestions/dismiss",
    );
    expect(dismissCalls).toHaveLength(1);
    expect((dismissCalls[0]?.[2] as { body?: { id?: string } })?.body).toEqual({
      id: "hint-bench",
    });
  });

  it("dismiss is optimistic: the hint leaves even when the POST fails", async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (String(path).startsWith("/api/workouts/exercise-suggestions")) {
        return Promise.resolve({ suggestions: [suggestion("hint-bench", "bench")] });
      }
      if (String(path) === "/api/suggestions/dismiss") {
        return Promise.reject(new Error("offline"));
      }
      return Promise.resolve({});
    });
    const { getByTestId, queryByTestId } = render(<Harness slugs={["bench"]} />);
    await waitFor(() => {
      expect(getByTestId("live-workout-bench-hint")).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-bench-hint-dismiss"));
    });
    expect(queryByTestId("live-workout-bench-hint")).toBeNull();
  });
});
