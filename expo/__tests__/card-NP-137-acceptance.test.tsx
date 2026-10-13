/* eslint-disable import/first */
// NP-137 — BUILD A SESSION BY HAND: search, add, complete it, edit it, then
// start, log or plan.
//
// Native port of `webapp/components/SessionBuilder.tsx` (plus the
// `webapp/components/workout/SessionEditor.tsx` edit-before-start on the
// quick-session overview), at `expo/components/workout/SessionBuilder.tsx` +
// `expo/components/workout/SessionEditor.tsx`, wired into
// `expo/app/(app)/(tabs)/programming/quick/build.tsx` (builder route),
// `expo/app/(app)/(tabs)/programming/sessions.tsx` (hub Build button) and
// `expo/app/(app)/(tabs)/programming/quick/index.tsx` (overview edit mode).
//
// Fetch is mocked at the `apiFetch` seam (no network); the stash is
// AsyncStorage-backed (mocked) and the router is mocked. Fixed clock:
// Wednesday 2026-10-07 local noon, so yesterday is 2026-10-06 and tomorrow is
// 2026-10-08. The three acceptance ids, each asserted on its own below.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
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

import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiFetch } from "@become/api-client";
import { SessionBuilder } from "../components/workout/SessionBuilder";
import { SessionEditor } from "../components/workout/SessionEditor";
import {
  quickSessionLiveHref,
  readQuickSession,
} from "@/lib/quickSession/store";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SEARCH_HITS = [
  { slug: "bench-press", name: "Bench Press", trackingType: "reps_weight" },
  { slug: "overhead-press", name: "Overhead Press", trackingType: "reps_weight" },
  { slug: "barbell-row", name: "Barbell Row", trackingType: "reps_weight" },
];

const SUGGESTED = [
  {
    exercise: { exerciseSlug: "lat-pulldown", name: "Lat Pulldown", trackingType: "reps_weight", sets: 3, reps: "8-12" },
    reason: "Same movement pattern",
  },
  {
    exercise: { exerciseSlug: "face-pull", name: "Face Pull", trackingType: "reps_weight", sets: 3, reps: "8-12" },
    reason: "Complementary pull",
  },
];

function routeMock() {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (typeof path === "string" && path.startsWith("/api/exercises/search")) {
      const q = decodeURIComponent(path.split("q=")[1]?.split("&")[0] ?? "").toLowerCase();
      const hits = SEARCH_HITS.filter((h) => h.name.toLowerCase().includes(q));
      return { exercises: hits };
    }
    if (path === "/api/exercises/custom") return { exercises: [] };
    if (path === "/api/generate/session/complete") return { suggestions: SUGGESTED, seed: 7 };
    if (path === "/api/workouts") return { ok: true };
    throw new Error(`unexpected path ${path}`);
  });
}

function postBodies() {
  return mockApiFetch.mock.calls
    .filter((c) => c[0] === "/api/workouts" && c[2]?.method === "POST")
    .map((c) => c[2].body as Record<string, unknown>);
}

function completeBodies() {
  return mockApiFetch.mock.calls
    .filter((c) => c[0] === "/api/generate/session/complete")
    .map((c) => c[2]?.body as Record<string, unknown>);
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 7, 12, 0, 0));
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  routeMock();
  await AsyncStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

async function searchAndAdd(
  getByTestId: ReturnType<typeof render>["getByTestId"],
  term: string,
  slug: string,
) {
  fireEvent.changeText(getByTestId("session-builder-search"), term);
  await waitFor(() => {
    expect(getByTestId(`session-builder-result-${slug}`)).toBeTruthy();
  });
  fireEvent.press(getByTestId(`session-builder-result-${slug}`));
}

describe("(id: e015c9c3) A session built natively from three searched exercises plus two suggested ones starts, and appears on the web with the same exercises", () => {
  it("search → add ×3 → suggest ×2 → start stashes all five and pushes the live href", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    await searchAndAdd(getByTestId, "overhead", "overhead-press");
    await searchAndAdd(getByTestId, "barbell", "barbell-row");

    // Superset the first two, the web's toggle gesture.
    fireEvent.press(getByTestId("session-builder-group-bench-press"));
    expect(getByTestId("session-builder-chosen-barbell-row")).toBeTruthy();

    // The draft change fires the debounced suggest call; the two pills land.
    await waitFor(() => {
      expect(getByTestId("session-builder-suggestion-lat-pulldown")).toBeTruthy();
    });
    expect(completeBodies()[0]).toMatchObject({ mode: "suggest" });
    fireEvent.press(getByTestId("session-builder-suggestion-lat-pulldown"));
    fireEvent.press(getByTestId("session-builder-suggestion-face-pull"));

    fireEvent.changeText(getByTestId("session-builder-title"), "Hand Built");
    fireEvent.press(getByTestId("session-builder-start"));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
    const href = mockPush.mock.calls[0]![0] as string;
    expect(href).toContain("/(tabs)/programming/quick/live?session=");
    const sessionId = decodeURIComponent(href.split("session=")[1]!);
    const stashed = await readQuickSession(sessionId);
    expect(stashed).not.toBeNull();
    expect(stashed!.title).toBe("Hand Built");
    expect(stashed!.needsName).toBe(false);
    expect(stashed!.exercises.map((e) => e.exerciseSlug)).toEqual([
      "bench-press",
      "overhead-press",
      "barbell-row",
      "lat-pulldown",
      "face-pull",
    ]);
    // The superset survives the handoff — the live view interleaves on it.
    expect(stashed!.exercises[0]!.groupId).toBeTruthy();
    expect(stashed!.exercises[0]!.groupId).toBe(stashed!.exercises[1]!.groupId);
    expect(quickSessionLiveHref(sessionId)).toBe(href);
  });
});

describe("(id: e015c9c4) Logging a built session for yesterday puts it on yesterday in both calendars", () => {
  it("a past date POSTs kind quick + performedAt yesterday with completed sets", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    fireEvent.changeText(getByTestId("session-builder-title"), "Yesterday Pump");

    fireEvent.press(getByTestId("session-builder-log-toggle"));
    fireEvent.press(getByTestId("session-builder-log-or-plan"));
    // Past date → the naming prompt is skipped (title was chosen); the POST
    // below happens straight away. Use the date picker input directly.
    await waitFor(() => {
      expect(postBodies().length).toBeGreaterThan(0);
    });
    const body = postBodies()[0]!;
    expect(body).toMatchObject({
      kind: "quick",
      title: "Yesterday Pump",
      completed: true,
      started: true,
      performedAt: "2026-10-07",
    });
    const exercises = body.exercises as { name: string; sets: { completed: boolean }[] }[];
    expect(exercises[0]!.sets.length).toBe(3);
    expect(exercises[0]!.sets.every((s) => s.completed)).toBe(true);
  });

  it("yesterday via the date field logs performedAt yesterday", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    await searchAndAdd(getByTestId, "bench", "bench-press");
    fireEvent.changeText(getByTestId("session-builder-title"), "Backfill");
    fireEvent.press(getByTestId("session-builder-log-toggle"));
    fireEvent.changeText(getByTestId("session-builder-date-input"), "2026-10-06");
    fireEvent.press(getByTestId("session-builder-log-or-plan"));
    await waitFor(() => {
      expect(postBodies().length).toBeGreaterThan(0);
    });
    expect(postBodies()[0]).toMatchObject({
      kind: "quick",
      completed: true,
      performedAt: "2026-10-06",
    });
  });
});

describe("(id: e015c9c5) Editing a generated session's sets before starting is reflected in Live", () => {
  it("changing sets in the editor changes what the stash hands the live view", async () => {
    const onSave = jest.fn();
    const { getByTestId } = render(
      <SessionEditor
        title="Generated Legs"
        exercises={[
          { exerciseSlug: "squat", name: "Squat", trackingType: "reps_weight", sets: 3, reps: "8-12" },
          { exerciseSlug: "plank", name: "Plank", trackingType: "time", sets: 2, reps: "", duration: "45" },
        ]}
        onSave={onSave}
        onCancel={() => {}}
        testID="session-editor"
      />,
    );
    fireEvent.changeText(getByTestId("session-editor-sets-0"), "5");
    fireEvent.press(getByTestId("session-editor-save"));
    await waitFor(() => {
      expect(onSave).toHaveBeenCalled();
    });
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      title: "Generated Legs",
      exercises: [
        expect.objectContaining({ exerciseSlug: "squat", sets: 5 }),
        expect.objectContaining({ exerciseSlug: "plank", sets: 2 }),
      ],
    });
  });
});
