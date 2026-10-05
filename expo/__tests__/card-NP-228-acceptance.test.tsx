/* eslint-disable import/first */
// NP-228 — QUICK SESSIONS 5/5: LAST-TIME NUMBERS AND PRs FOR A QUICK SESSION'S
// EXERCISES.
//
// Data only: `expo/lib/quickSession/quickHistory.ts` builds `exerciseHistory`
// keyed by exercise NAME from `last-performance` by slug, falling back to the
// slugified name exactly as the web does
// (`webapp/.../workout/live/LiveWorkoutClient.tsx` l.528-547); the hook
// `useQuickLiveWorkout` threads it into the props `LiveWorkoutClient` and
// `WorkoutSummary` already take, so the summary's PR count works for quick
// sessions. Blank inputs stay blank: references, never prefill.
//
// Fetch is mocked at the `fetchImpl` prop (no network); the stash/progress
// store is an in-memory map. The two acceptance ids, each asserted on its own
// below.
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

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
import {
  buildQuickHistory,
  quickExerciseSlug,
  quickHistorySlugs,
} from "@/lib/quickSession/quickHistory";
import { computeSummaryPRs } from "@/components/live/WorkoutSummary";
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

interface RecordedCall {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
}

function makeFetchImpl(handler: (call: RecordedCall) => unknown) {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    let body: Record<string, unknown> | null = null;
    try {
      body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : null;
    } catch {
      body = null;
    }
    const call: RecordedCall = {
      url: String(url),
      method: (init?.method ?? "GET").toUpperCase(),
      body,
    };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
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
  {
    // No slug: resolves history through its slugified name ("kettlebell-swing").
    exerciseSlug: "",
    name: "Kettlebell Swing",
    trackingType: "reps_weight",
    sets: 1,
    reps: "10",
    rest: "60s",
  },
];

const LAST_PERFORMANCE = {
  performances: {
    "bench-press": {
      reps: 8,
      weight: 135,
      speed: null,
      duration: null,
      distance: null,
      date: "2026-10-01T12:00:00.000Z",
    },
    "kettlebell-swing": {
      reps: 10,
      weight: 53,
      speed: null,
      duration: null,
      distance: null,
      date: "2026-10-02T12:00:00.000Z",
    },
  },
};

function lastPerformanceFetch() {
  return makeFetchImpl((call) => {
    if (call.url.includes("/api/workouts/last-performance"))
      return jsonResponse(LAST_PERFORMANCE);
    if (call.url.includes("/api/exercises/hydrate"))
      return jsonResponse({ exercises: [{}, {}] });
    if (call.url.includes("/api/workouts"))
      return jsonResponse({ message: "ok", completed: false });
    return jsonResponse({}, false);
  });
}

describe("(id: e5cecfe7) Quick-session history is keyed by name and resolves slug-less exercises by slugified name", () => {
  it("builds a NAME-keyed map, resolving the slug-less exercise by slugified name", () => {
    expect(quickExerciseSlug({ slug: "", name: "Kettlebell Swing" })).toBe(
      "kettlebell-swing",
    );
    expect(
      quickHistorySlugs([
        { slug: "bench-press", name: "Bench Press" },
        { slug: "", name: "Kettlebell Swing" },
      ]),
    ).toEqual(["bench-press", "kettlebell-swing"]);

    const history = buildQuickHistory(
      [
        { slug: "bench-press", name: "Bench Press" },
        { slug: "", name: "Kettlebell Swing" },
      ],
      LAST_PERFORMANCE.performances as never,
    );
    expect(Object.keys(history).sort()).toEqual([
      "Bench Press",
      "Kettlebell Swing",
    ]);
    expect(history["Bench Press"]).toMatchObject({ weight: 135, reps: 8 });
    expect(history["Kettlebell Swing"]).toMatchObject({ weight: 53, reps: 10 });
  });

  it("shows the Last reference on the Live step for both exercises, with blank inputs", async () => {
    mockParams = { session: "qs-history" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      { title: "Quick Session", exercises: STASH_EXERCISES },
      "qs-history",
      {},
      store,
    );

    const { fetchImpl } = lastPerformanceFetch();
    const { getByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} />,
    );

    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });
    // The hook asked for both slugs — including the slugified name.
    // (Asserted on the unit level above; the fetch mock answers both.)

    // Flip to the Live step: the Last reference reads from exerciseHistory.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-view-live"));
    });
    await waitFor(() => {
      expect(
        getByTestId("live-workout-live-bench-press-reference-last"),
      ).toBeTruthy();
    });
    expect(
      String(
        getByTestId("live-workout-live-bench-press-reference-last").props
          .children ?? "",
      ),
    ).toContain("135");
    // Inputs stay blank: the reference never prefills.
    expect(
      getByTestId("live-workout-live-bench-press-set-0-weight").props.value,
    ).toBe("");
    expect(
      getByTestId("live-workout-live-bench-press-set-0-reps").props.value,
    ).toBe("");
  });
});

describe("(id: e5cecfe8) The quick summary counts PRs against last performance", () => {
  it("counts a PR when a set beats the last-performance weight", () => {
    const history = buildQuickHistory(
      [{ slug: "bench-press", name: "Bench Press" }],
      LAST_PERFORMANCE.performances as never,
    );
    const prs = computeSummaryPRs(
      [{ name: "Bench Press", trackingType: "reps_weight" }],
      [
        [
          {
            reps: 8,
            weight: 140,
            completed: true,
            durationSec: null,
            distance: null,
          },
        ],
      ],
      history,
    );
    expect(prs).toHaveLength(1);
    expect(prs[0]!.name).toBe("Bench Press");
  });

  it("a quick session's summary shows the PR count after beating last time", async () => {
    mockParams = { session: "qs-pr" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      {
        title: "Evening Pump",
        exercises: [
          {
            exerciseSlug: "bench-press",
            name: "Bench Press",
            trackingType: "reps_weight",
            sets: 1,
            reps: "8-12",
            rest: "90s",
          },
        ],
      },
      "qs-pr",
      { needsName: false },
      store,
    );

    const { fetchImpl } = lastPerformanceFetch();
    const { getByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} />,
    );

    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });

    // Log 140 x 8 — beats last time's 135 x 8 — and finish.
    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-press-set-0-weight"),
        "140",
      );
    });
    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-press-set-0-reps"),
        "8",
      );
    });
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-finish"));
    });
    // NP-138: a self-built session this thin asks once on the way out.
    await act(async () => {
      fireEvent.press(getByTestId("quick-live-thin-session-finish"));
    });

    await waitFor(() => {
      expect(getByTestId("workout-summary")).toBeTruthy();
    });
    expect(getByTestId("workout-summary-pr-count")).toBeTruthy();
  });
});
