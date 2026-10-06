/* eslint-disable import/first */
// NP-290 — WORKOUT SUMMARY: STREAK CARD + HERO ICON, SAVED NAME, CTA STYLING,
// NAME PROMPT ABOVE THE KEYBOARD.
//
// Full-pass gaps against the web (build d68b84e3):
//   1. The web's emerald hero ring (Award on a PR day, Dumbbell otherwise)
//      was missing entirely on `WorkoutSummary`.
//   2. After naming a quick session on the way out, the summary showed the
//      session's OLD title twice (`stored?.title` is cleared by
//      `finishWithTitle` right after a successful save) instead of the name
//      just typed.
//   3. Stat values were neutral `text-foreground`; the web colours them
//      emerald/blue/violet. The done CTA was the brand-red `primary` button
//      with no icon; the web's is foreground-on-background with a Dumbbell.
//      The secondary "View Training Log" link had no icon either.
//   4. `QuickSessionNamePrompt` had no `KeyboardAvoidingView`, so the
//      keyboard covered Confirm/Back/Skip the moment the name field focused;
//      the quick-session LIVE route also labelled Confirm "Save workout"
//      where the web says "Save name & finish", and never fetched the
//      streak/goal the summary needs (both hard-coded to `null`).
import { act, fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Award, Dumbbell, TrendingUp } from "lucide-react-native";
import { WorkoutSummary } from "@/components/live/WorkoutSummary";
import { Button } from "@/components/Button";

const noop = () => {};
const STRENGTH_EX = [{ name: "Bench", trackingType: "reps_weight" }];
const ONE_SET = [[{ reps: 5, weight: 135, completed: true }]];

describe("(id: np290-hero) WorkoutSummary's hero ring matches the web's emerald Dumbbell/Award", () => {
  it("shows a Dumbbell inside the ring for a plain WORKOUT DONE finish", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={ONE_SET}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    const ring = getByTestId("workout-summary-hero-icon");
    expect(within(ring).UNSAFE_getByType(Dumbbell)).toBeTruthy();
  });

  it("swaps to an Award on a PR day, inside the same ring", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={[[{ reps: 6, weight: 135, completed: true }]]}
        exerciseHistory={{ Bench: { weight: 135, reps: 5, date: "2026-01-01" } }}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    const ring = getByTestId("workout-summary-hero-icon");
    expect(within(ring).UNSAFE_getByType(Award)).toBeTruthy();
  });
});

describe("(id: np290-stats) Stat values are coloured like the web's, not neutral", () => {
  it("Duration is emerald, Sets is blue, Volume is violet", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={ONE_SET}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    expect(getByTestId("workout-summary-time").props.className).toContain(
      "text-emerald-600",
    );
    expect(getByTestId("workout-summary-sets").props.className).toContain(
      "text-blue-600",
    );
    expect(getByTestId("workout-summary-volume").props.className).toContain(
      "text-violet-600",
    );
  });
});

describe("(id: np290-cta) The done CTA is foreground-on-background with a Dumbbell, never the brand red", () => {
  it("'I'll Be Back' is not the primary/red button, and carries a Dumbbell", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={ONE_SET}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    const done = getByTestId("workout-summary-done");
    expect(done.props.className).toContain("bg-foreground");
    expect(done.props.className).not.toContain("bg-primary");
    expect(within(done).UNSAFE_getByType(Dumbbell)).toBeTruthy();
  });

  it("'View Training Log' carries a TrendingUp icon", () => {
    const { getByTestId } = render(
      <WorkoutSummary
        programCompleted={false}
        completedProgramName=""
        programId="p1"
        workoutDay="Day 1"
        workoutTitle="Push A"
        elapsedSeconds={60}
        exercises={STRENGTH_EX}
        setsByExercise={ONE_SET}
        exerciseHistory={{}}
        streak={null}
        goal={null}
        onDone={noop}
        onViewJourney={noop}
        onViewLog={noop}
      />,
    );
    const secondary = getByTestId("workout-summary-secondary");
    expect(within(secondary).UNSAFE_getByType(TrendingUp)).toBeTruthy();
  });
});

describe("(id: np290-button-icon) Button renders an optional icon beside its label, never inside the Text", () => {
  it("renders the icon and keeps the label reachable by text", () => {
    const { getByTestId, getByText } = render(
      <Button testID="btn" icon={<Dumbbell />}>
        Go
      </Button>,
    );
    expect(getByText("Go")).toBeTruthy();
    expect(within(getByTestId("btn")).UNSAFE_getByType(Dumbbell)).toBeTruthy();
  });
});

// ─── The quick-session LIVE route ───────────────────────────────────────────

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

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

import { createMemoryKeyValueStore } from "@/lib/live/liveWorkoutCache";
import { stashQuickSessionWithId } from "@/lib/quickSession/store";
import QuickLiveRoute from "../app/(app)/(tabs)/programming/quick/live";
/* eslint-enable import/first */

function jsonResponse(body: unknown, ok = true, status?: number) {
  const text = JSON.stringify(body);
  return {
    ok,
    status: status ?? (ok ? 200 : 404),
    headers: { get: () => null },
    json: async () => body,
    text: async () => text,
  };
}

const STASH_EXERCISES = [
  {
    exerciseSlug: "bench-press",
    name: "Bench Press",
    trackingType: "reps_weight",
    sets: 1,
    reps: "8-12",
    rest: "90s",
  },
];

function makeFetchImpl(handler: (url: string, method: string) => unknown) {
  const fetchImpl = (async (url: unknown, init?: RequestInit) =>
    handler(String(url), (init?.method ?? "GET").toUpperCase())) as unknown as typeof fetch;
  return fetchImpl;
}

describe("(id: np290-saved-name) The summary shows the name just typed, not the session's old title", () => {
  it("renaming 'Core Session' to 'FP test core' on Confirm shows 'FP test core' twice, never 'Core Session'", async () => {
    mockParams = { session: "qs-1" };
    const store = createMemoryKeyValueStore();
    // A generated session can already carry a category title ("Core
    // Session") while still needing the member's own name — `needsName`
    // is the authoritative flag (`shouldPromptForQuickSessionName`), not
    // whether the title happens to look like a placeholder.
    await stashQuickSessionWithId(
      { title: "Core Session", exercises: STASH_EXERCISES },
      "qs-1",
      { needsName: true },
      store,
    );

    const fetchImpl = makeFetchImpl((url, method) => {
      if (url.includes("/api/exercises/hydrate")) return jsonResponse({ exercises: [{}] });
      if (url.includes("/api/streak"))
        return jsonResponse({
          streakDays: 12,
          longestStreak: 12,
          streakFreezes: 0,
          nextMilestone: 14,
        });
      if (url.includes("/api/profile")) return jsonResponse({ profile: { fitnessGoal: "gain_muscle" } });
      if (url.includes("/api/workouts") && method === "POST")
        return jsonResponse({ message: "ok", completed: true });
      return jsonResponse({}, false);
    });

    const { getByTestId, getByText, queryByText } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} initialOriginKey="2026-10-06" />,
    );

    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(getByTestId("live-workout-bench-press-set-0-weight"), "135");
    });
    await act(async () => {
      fireEvent.changeText(getByTestId("live-workout-bench-press-set-0-reps"), "8");
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-finish"));
    });
    await act(async () => {
      fireEvent.press(getByTestId("quick-live-thin-session-finish"));
    });

    await waitFor(() => {
      expect(getByTestId("quick-session-name-prompt")).toBeTruthy();
    });
    // The web's label for this exact flow — "Save workout" was the native bug.
    expect(getByText("Save name & finish")).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(
        getByTestId("quick-session-name-prompt-input"),
        "FP test core",
      );
    });
    await act(async () => {
      fireEvent.press(getByTestId("quick-session-name-prompt-confirm"));
    });

    await waitFor(() => {
      expect(getByTestId("workout-summary")).toBeTruthy();
    });
    expect(getByText("FP test core — FP test core")).toBeTruthy();
    expect(queryByText("Core Session — Core Session")).toBeNull();

    // The streak card and closing line now render too — both were hard-coded
    // to `null` on this route.
    await waitFor(() => {
      expect(getByTestId("workout-summary-streak-days")).toBeTruthy();
    });
    expect(getByTestId("workout-summary-closing")).toHaveTextContent(/micro-tears/);
  });
});
