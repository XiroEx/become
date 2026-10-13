/* eslint-disable import/first */
// NP-243 — IMPORT FROM TEXT 3/4: THE SESSIONS HUB'S IMPORT OPENS A
// PRE-FILLED SESSION BUILDER.
//
// `expo/app/(app)/(tabs)/programming/sessions.tsx`'s Import button
// (`openImport`) with `importSessionFromText` (NP-242) mocked — no network,
// no AI run client. Pins:
//   • (id: e5ced3b4) pasting a five-line workout gives a session with each
//     line matched or flagged: the mocked outcome resolves four exercises
//     plus one unresolved name, and the builder it hands off to shows both;
//   • the web browser is never opened — `openWebSignedIn` is mocked and
//     asserted un-called, pinning that Import no longer leaves the app;
//   • (id: e5ced3b6) the session builder opens pre-filled (title + four
//     matched rows) and lists the name it could not match.
//
// Mock factories below create their jest.fn()s INLINE rather than closing
// over an external `const mockX = jest.fn()` declared above them: a plain
// value reference (`importSessionFromText: mockImportSessionFromText`) is
// read at FACTORY-EXECUTION time, which can run before that `const` line
// does once `jest.mock` is hoisted above the imports — silently binding the
// export to `undefined`. Grabbing the mock back out through the ordinary
// `import` after `jest.mock` (and casting to `jest.Mock`) is the safe way to
// get a handle to assert against.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

// `useRouter`/`useAuth` read their mock values LAZILY (inside the returned
// function, called only at component-render time, long after this module has
// finished loading) — safe to close over an external `const` declared above.
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
}));

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: "test-jwt",
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

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      loading: false,
      enforced: false,
      refresh: jest.fn(),
      feature: () => null,
      canCreate: () => true,
    }),
  };
});

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: () => null,
  subscribeToUpgradeSheet: () => () => {},
}));

jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: jest.fn(),
}));

jest.mock("@/lib/workout/importWorkoutRun", () => ({
  importSessionFromText: jest.fn(),
}));

import { apiFetch } from "@become/api-client";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { importSessionFromText } from "@/lib/workout/importWorkoutRun";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
import { SessionBuilder } from "../components/workout/SessionBuilder";
import { takeImportedSessionDraft } from "@/lib/quickSession/importHandoff";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
// `openWebSignedIn` / `importSessionFromText` are read back through the
// ordinary import AFTER `jest.mock` (see the note above) rather than closed
// over as an eagerly-read plain value inside the factory.
const mockOpenWebSignedIn = openWebSignedIn as jest.Mock;
const mockImportSessionFromText = importSessionFromText as jest.Mock;

function installHistory(logs: Record<string, unknown>[] = []) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs, favoriteSessionOrder: [] };
    }
    if (String(path).startsWith("/api/workouts/planned")) {
      return { planned: [] };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

// Four matched + one unresolved — a five-line paste.
const FIVE_LINE_TEXT =
  "Bench Press 4x8\nOverhead Press 3x10\nLat Pulldown 3x12\nTricep Pushdown 3x12\nFace Pull 3x15";

const SESSION_OUTCOME = {
  status: "ok" as const,
  session: {
    title: "Push Day",
    exercises: [
      { exerciseSlug: "bench-press", name: "Bench Press", trackingType: "reps_weight", sets: 4, reps: "8" },
      { exerciseSlug: "overhead-press", name: "Overhead Press", trackingType: "reps_weight", sets: 3, reps: "10" },
      { exerciseSlug: "lat-pulldown", name: "Lat Pulldown", trackingType: "reps_weight", sets: 3, reps: "12" },
      { exerciseSlug: "tricep-pushdown", name: "Tricep Pushdown", trackingType: "reps_weight", sets: 3, reps: "12" },
    ],
    unresolved: ["Face Pull"],
  },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  mockImportSessionFromText.mockReset();
});

describe("(id: e5ced3b4) pasting a five-line workout matches four lines and flags the fifth", () => {
  it("opening Import, pasting and submitting hands the resolved session to the builder route, and never opens the web browser", async () => {
    installHistory([]);
    mockImportSessionFromText.mockResolvedValue(SESSION_OUTCOME);

    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-import")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-import"));
    await waitFor(() => expect(screen.getByTestId("sessions-import-sheet-text")).toBeTruthy());

    fireEvent.changeText(screen.getByTestId("sessions-import-sheet-text"), FIVE_LINE_TEXT);
    fireEvent.press(screen.getByTestId("sessions-import-sheet-submit"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/quick/build"));
    expect(mockImportSessionFromText).toHaveBeenCalledTimes(1);
    expect(mockImportSessionFromText.mock.calls[0]![0]).toBe(FIVE_LINE_TEXT);

    // Import never falls back to the web browser.
    expect(mockOpenWebSignedIn).not.toHaveBeenCalled();
  });
});

describe("(id: e5ced3b6) the session builder opens pre-filled and lists the unmatched name", () => {
  it("the handed-off draft seeds the title, four matched rows, and a dismissable unresolved note", async () => {
    installHistory([]);
    mockImportSessionFromText.mockResolvedValue(SESSION_OUTCOME);

    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-import")).toBeTruthy());
    fireEvent.press(screen.getByTestId("sessions-import"));
    await waitFor(() => expect(screen.getByTestId("sessions-import-sheet-text")).toBeTruthy());
    fireEvent.changeText(screen.getByTestId("sessions-import-sheet-text"), FIVE_LINE_TEXT);
    fireEvent.press(screen.getByTestId("sessions-import-sheet-submit"));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/quick/build"));

    // `quick/build.tsx` takes the handoff exactly once and passes it as
    // `initialDraft` — reproduced directly here against `SessionBuilder`.
    const draft = takeImportedSessionDraft();
    expect(draft).not.toBeNull();

    const builder = render(<SessionBuilder testID="session-builder" initialDraft={draft!} />);
    expect(builder.getByTestId("session-builder-title").props.value).toBe("Push Day");
    expect(builder.getByTestId("session-builder-chosen-bench-press")).toBeTruthy();
    expect(builder.getByTestId("session-builder-chosen-overhead-press")).toBeTruthy();
    expect(builder.getByTestId("session-builder-chosen-lat-pulldown")).toBeTruthy();
    expect(builder.getByTestId("session-builder-chosen-tricep-pushdown")).toBeTruthy();

    expect(builder.getByTestId("session-builder-unresolved-note")).toBeTruthy();
    expect(builder.getByText(/Face Pull/)).toBeTruthy();

    // A second take comes back empty — the handoff is consumed exactly once.
    expect(takeImportedSessionDraft()).toBeNull();
  });
});
