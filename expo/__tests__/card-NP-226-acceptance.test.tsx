/* eslint-disable import/first */
// NP-226 — QUICK SESSIONS 3/5: RUN A QUICK SESSION LIVE.
//
// The route `/(tabs)/programming/quick/live?session=` runs a stashed quick
// session live: it saves as kind 'quick' with `started: true` from the moment
// it opens, rebuilds from the server log when the stash is empty, asks for a
// name at the finish (Skip takes the web's fallback name for that day), and
// never lets a repeat overwrite its source log.
//
// Fetch is mocked at the `fetchImpl` prop (no network); the stash/progress
// store is an in-memory map. The four acceptance ids, each asserted on its
// own below.
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
import {
  readQuickSession,
  stashQuickSessionWithId,
} from "@/lib/quickSession/store";
import { readQuickProgress } from "@/lib/quickSession/progress";
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

function workoutPosts(calls: RecordedCall[]) {
  return calls.filter(
    (c) => c.url.includes("/api/workouts") && c.method === "POST" && c.body,
  );
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

async function stashUnnamed(store: ReturnType<typeof createMemoryKeyValueStore>) {
  return stashQuickSessionWithId(
    { title: "Quick Session", exercises: STASH_EXERCISES },
    "qs-1",
    {},
    store,
  );
}

describe("(id: e5cecfd9) Opening a quick session live saves it as started kind 'quick' immediately", () => {
  it("POSTs kind:'quick', started:true, completed:false with that sessionId before any set is logged", async () => {
    mockParams = { session: "qs-1" };
    const store = createMemoryKeyValueStore();
    await stashUnnamed(store);

    const { calls, fetchImpl } = makeFetchImpl((call) => {
      if (call.url.includes("/api/exercises/hydrate"))
        return jsonResponse({ exercises: [{}] });
      if (call.url.includes("/api/workouts"))
        return jsonResponse({ message: "ok", completed: false });
      return jsonResponse({}, false);
    });

    const { getByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} />,
    );

    // The session renders — and the opening save already reached the server
    // with no set touched (no input was ever changed in this test).
    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });
    await waitFor(() => {
      expect(workoutPosts(calls).length).toBeGreaterThan(0);
    });

    const first = workoutPosts(calls)[0]!.body!;
    expect(first.kind).toBe("quick");
    expect(first.sessionId).toBe("qs-1");
    expect(first.started).toBe(true);
    expect(first.completed).toBe(false);
    expect(first.title).toBe("Quick Session");
  });
});

describe("(id: e5cecfdb) A session reopened with no local draft is rebuilt from the server log", () => {
  it("rebuilds from GET /api/workouts/session and renders those exercises", async () => {
    mockParams = { session: "qs-rebuilt" };
    const store = createMemoryKeyValueStore();

    const { calls, fetchImpl } = makeFetchImpl((call) => {
      if (call.url.includes("/api/workouts/session"))
        return jsonResponse({
          session: {
            sessionId: "qs-rebuilt",
            title: "Evening Session",
            needsName: false,
            date: "2026-10-04",
            completed: false,
            duration: null,
            exercises: [
              {
                name: "Bench Press",
                exerciseSlug: "bench-press",
                trackingType: "reps_weight",
                sets: [
                  {
                    setNumber: 1,
                    reps: 8,
                    weight: 135,
                    duration: null,
                    distance: null,
                    speed: null,
                    completed: true,
                  },
                ],
                prescription: { sets: 1, reps: "8-12", rest: "90s" },
              },
            ],
          },
        });
      if (call.url.includes("/api/exercises/hydrate"))
        return jsonResponse({ exercises: [{}] });
      if (call.url.includes("/api/workouts") && call.method === "POST")
        return jsonResponse({ message: "ok", completed: false });
      return jsonResponse({}, false);
    });

    const { getByTestId } = render(
      <QuickLiveRoute store={store} fetchImpl={fetchImpl} />,
    );

    // The empty stash rebuilt from the server log and rendered it.
    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });
    expect(
      calls.some(
        (c) => c.url.includes("/api/workouts/session") && c.method === "GET",
      ),
    ).toBe(true);
    // …and the rebuilt session saved as started under its own id.
    await waitFor(() => {
      expect(workoutPosts(calls).length).toBeGreaterThan(0);
    });
    expect(workoutPosts(calls)[0]!.body!.sessionId).toBe("qs-rebuilt");
  });
});

describe("(id: e5cecfda) Finishing asks for a name; Skip saves the web's fallback name for that day", () => {
  it("opens the prompt, and Skip sends title '<m>/<d>/<yy> workout', needsName:false, completed:true, then clears the stash", async () => {
    mockParams = { session: "qs-1" };
    const store = createMemoryKeyValueStore();
    await stashUnnamed(store);

    const { calls, fetchImpl } = makeFetchImpl((call) => {
      if (call.url.includes("/api/exercises/hydrate"))
        return jsonResponse({ exercises: [{}] });
      if (call.url.includes("/api/workouts"))
        return jsonResponse({ message: "ok", completed: true });
      return jsonResponse({}, false);
    });

    const { getByTestId, queryByTestId } = render(
      <QuickLiveRoute
        store={store}
        fetchImpl={fetchImpl}
        initialOriginKey="2026-10-04"
      />,
    );

    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });

    // Log the one set: weight + reps ticks it done, which reveals Finish.
    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-press-set-0-weight"),
        "135",
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

    // The unnamed session asks for a name instead of saving.
    await waitFor(() => {
      expect(getByTestId("quick-session-name-prompt")).toBeTruthy();
    });
    expect(
      workoutPosts(calls).filter((c) => c.body?.completed === true),
    ).toHaveLength(0);

    await act(async () => {
      fireEvent.press(getByTestId("quick-session-name-prompt-skip"));
    });

    // Skip completes under the web's fallback name for the workout's day.
    await waitFor(() => {
      expect(
        workoutPosts(calls).filter((c) => c.body?.completed === true).length,
      ).toBeGreaterThan(0);
    });
    const completing = workoutPosts(calls).filter(
      (c) => c.body?.completed === true,
    )[0]!.body!;
    expect(completing.kind).toBe("quick");
    expect(completing.sessionId).toBe("qs-1");
    expect(completing.title).toBe("10/4/26 workout");
    expect(completing.needsName).toBe(false);
    expect(completing.completed).toBe(true);

    // …then the stash and progress are gone and the summary shows.
    await waitFor(() => {
      expect(getByTestId("workout-summary")).toBeTruthy();
    });
    expect(await readQuickSession("qs-1", store)).toBeNull();
    expect(await readQuickProgress("qs-1", store)).toBeNull();
    expect(queryByTestId("quick-session-name-prompt")).toBeNull();
  });
});

describe("(id: e5cecfdc) A repeat never overwrites its source log", () => {
  it("posts its own sessionId, never its sourceSessionId", async () => {
    mockParams = { session: "qs-repeat" };
    const store = createMemoryKeyValueStore();
    await stashQuickSessionWithId(
      { title: "Thursday Push", exercises: STASH_EXERCISES },
      "qs-repeat",
      {},
      store,
    );
    // A repeat carries its source apart from its own id (the store writes it
    // via the repeat options; patched here to model a repeat draft).
    const raw = await store.get("quick_session_qs-repeat");
    await store.set(
      "quick_session_qs-repeat",
      JSON.stringify({ ...JSON.parse(raw!), sourceSessionId: "qs-original" }),
    );

    const { calls, fetchImpl } = makeFetchImpl((call) => {
      if (call.url.includes("/api/exercises/hydrate"))
        return jsonResponse({ exercises: [{}] });
      if (call.url.includes("/api/workouts"))
        return jsonResponse({ message: "ok", completed: true });
      return jsonResponse({}, false);
    });

    const { getByTestId } = render(
      <QuickLiveRoute
        store={store}
        fetchImpl={fetchImpl}
        initialOriginKey="2026-10-04"
      />,
    );

    await waitFor(() => {
      expect(getByTestId("live-workout-exercise-bench-press")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-press-set-0-weight"),
        "135",
      );
    });
    await act(async () => {
      fireEvent.changeText(
        getByTestId("live-workout-bench-press-set-0-reps"),
        "8",
      );
    });
    // A repeat already has an identity, so it finishes directly — no prompt.
    await act(async () => {
      fireEvent.press(getByTestId("live-workout-finish"));
    });
    // NP-138: a self-built session this thin asks once on the way out.
    await act(async () => {
      fireEvent.press(getByTestId("quick-live-thin-session-finish"));
    });

    await waitFor(() => {
      expect(
        workoutPosts(calls).filter((c) => c.body?.completed === true).length,
      ).toBeGreaterThan(0);
    });
    const posts = workoutPosts(calls);
    // Every save — opening and completing alike — carries the repeat's own
    // id; the source log's id never appears on the wire.
    expect(posts.length).toBeGreaterThan(0);
    for (const p of posts) {
      expect(p.body!.sessionId).toBe("qs-repeat");
    }
    expect(
      posts.some((p) => p.body!.sessionId === "qs-original"),
    ).toBe(false);
    await waitFor(() => {
      expect(getByTestId("workout-summary")).toBeTruthy();
    });
  });
});
