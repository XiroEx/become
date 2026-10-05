/* eslint-disable import/first */
// NP-239 — SESSIONS HUB CHROME: the Workout Hub tab switcher (Exercises /
// Sessions / Programs), the "Your sessions" header with Import and Build,
// and the dashed empty-state card.
//
// Native port of the chrome around the web's Sessions tab in
// `webapp/app/dashboard/workout/hub/HubClient.tsx` (the `TABS` segmented
// control and the `EmptyState` the Sessions panel renders at zero logs), at
// `expo/app/(app)/(tabs)/programming/sessions.tsx`.
//
// Before this card the "Your sessions" header (with Import/Build) only
// rendered inside `ScreenState`'s content branch — which never mounted on
// zero logs, so the empty copy ("Tap Build...") pointed at a button that
// did not exist on screen. These tests pin: the header is ALWAYS visible
// (loading aside), the hub tabs route between the three native screens with
// Sessions marked active, and the empty state is the dashed card, not bare
// text.

import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: mockBack }),
  useFocusEffect: () => {},
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

import { apiFetch } from "@become/api-client";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function installHistory(
  logs: Record<string, unknown>[],
  favoriteSessionOrder: string[] = [],
  planned: Record<string, unknown>[] = [],
) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs, favoriteSessionOrder };
    }
    if (String(path).startsWith("/api/workouts/planned")) {
      return { planned };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
});

describe("NP-239: the Workout Hub tab switcher", () => {
  test("renders Exercises / Sessions / Programs with Sessions active", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-hub-tabs")).toBeTruthy());

    const exercisesTab = screen.getByTestId("sessions-hub-tab-exercises");
    const sessionsTab = screen.getByTestId("sessions-hub-tab-sessions");
    const programsTab = screen.getByTestId("sessions-hub-tab-programs");
    expect(exercisesTab).toBeTruthy();
    expect(sessionsTab).toBeTruthy();
    expect(programsTab).toBeTruthy();
    expect(sessionsTab.props.accessibilityState).toMatchObject({ selected: true });
    expect(exercisesTab.props.accessibilityState).toMatchObject({ selected: false });
    expect(programsTab.props.accessibilityState).toMatchObject({ selected: false });
  });

  test("Exercises tab routes to the My Exercises screen", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-hub-tab-exercises")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-hub-tab-exercises"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/exercises");
  });

  test("Programs tab routes to the My Programs screen", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-hub-tab-programs")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-hub-tab-programs"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/mine");
  });

  test("pressing the active Sessions tab does not navigate", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-hub-tab-sessions")).toBeTruthy());

    fireEvent.press(screen.getByTestId("sessions-hub-tab-sessions"));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("NP-239: 'Your sessions' header stays reachable at zero sessions", () => {
  test("Import and Build render alongside the dashed empty-state card", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);

    await waitFor(() => expect(screen.getByTestId("sessions-hub-empty")).toBeTruthy());
    // The header that used to disappear behind ScreenState's generic empty
    // branch is now always mounted — Import and Build stay reachable.
    expect(screen.getByTestId("sessions-import")).toBeTruthy();
    expect(screen.getByTestId("sessions-build")).toBeTruthy();
    expect(screen.getByText("Your sessions")).toBeTruthy();
    expect(screen.getByText("No sessions yet")).toBeTruthy();
    expect(screen.getByText("Tap Build to create your first session.")).toBeTruthy();
  });

  test("the dashed empty card does not render once a session exists", async () => {
    installHistory([
      {
        kind: "quick",
        title: "Morning Pump",
        date: "2026-10-01T12:00:00.000Z",
        duration: null,
        exerciseCount: 1,
        completedSets: 3,
        completed: true,
        skipped: false,
        favorite: false,
        sessionId: "qs-1",
        exercises: [
          {
            exerciseSlug: "bench-press",
            name: "Bench Press",
            trackingType: "reps_weight",
            sets: 3,
            reps: "8-12",
            rest: "90s",
          },
        ],
      },
    ]);
    const screen = render(<SessionsHubRoute />);

    await waitFor(() => expect(screen.getByTestId("sessions-row-qs-1")).toBeTruthy());
    expect(screen.queryByTestId("sessions-hub-empty")).toBeNull();
  });
});
