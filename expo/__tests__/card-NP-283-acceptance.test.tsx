/* eslint-disable import/first */
// NP-283 — HISTORY ROWS MATCH THE WEB: ACCENT, TITLE WIDTH, NO PER-ROW PENCIL.
//
// Full visual pass (iOS build d68b84e3, Android build 24f4e34d) found three
// native-only deviations on `expo/app/(app)/(tabs)/programming/history.tsx`:
//
//   1. Each native row carried a pencil (correct) button OUTSIDE the card.
//      The web never puts a correction control on a History row — corrections
//      live in the Training Log (`app/(app)/progress.tsx`, NP-130) — so the
//      native pencil was a duplicate control that also stole width from the
//      title, forcing it to truncate earlier than the web's row.
//   2. Web rows carry a left accent stripe (the `Card accent="info"|"success"`
//      treatment: blue for quick, green for program); native rows had none.
//   3. Web rows show a calendar glyph before the date label
//      (`webapp/app/dashboard/history/HistoryClient.tsx`'s `<Calendar />`);
//      native had none.
//
// This suite pins all three fixed, and that filters / row tap / pull to
// refresh (NP-112) still work.
//
// Fixed clock: Wednesday 2026-10-07 local noon, so Today / Yesterday are
// unambiguous.

import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { Calendar } from "lucide-react-native";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => true,
  }),
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

import { apiFetch } from "@become/api-client";
import HistoryRoute from "../app/(app)/(tabs)/programming/history";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// Wednesday 2026-10-07 at local noon.
const WEDNESDAY_NOON = new Date(2026, 9, 7, 12, 0, 0);

const LOGS = [
  {
    kind: "program",
    title: "Circuit & Superset Shred — 4 Rounds Full Body",
    programId: "prog-1",
    programName: "Circuit & Superset Shred",
    day: "Day 2",
    phase: 1,
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-07T08:00:00",
    duration: 45,
    exerciseCount: 5,
    completedSets: 15,
  },
  {
    kind: "quick",
    title: "Tuesday Pump",
    focus: "push",
    sessionId: "qs-1",
    completed: true,
    skipped: false,
    favorite: false,
    date: "2026-10-06T18:00:00",
    duration: 30,
    exerciseCount: 3,
    completedSets: 9,
  },
] as const;

function mockHistory(logs: unknown = LOGS) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs, favoriteSessionOrder: [] };
    }
    return {};
  });
}

beforeEach(async () => {
  jest.useFakeTimers();
  jest.setSystemTime(WEDNESDAY_NOON);
  mockPush.mockReset();
  mockBack.mockReset();
  mockApiFetch.mockReset();
  mockHistory();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("(id: card-np-283) History rows match the web's row, no per-row pencil", () => {
  it("renders no per-row correction (pencil) button", async () => {
    const { getByTestId, queryByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    // The web never shows a correction control on a History row — only the
    // Training Log does — so native must not either, program or quick.
    expect(
      queryByTestId("history-correct-2026-10-07T08:00:00-0"),
    ).toBeNull();
    expect(queryByTestId("history-correct-qs-1-1")).toBeNull();
    // No correction error banner either — the state it belonged to is gone.
    expect(queryByTestId("history-correction-error")).toBeNull();
  });

  it("gives the row's whole width to the tap target (no sibling pencil stealing it)", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const row = getByTestId("history-row-program-2026-10-07T08:00:00-0");
    // Tapping still opens the program — the row itself is the only target.
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/prog-1");
  });

  it("shows a calendar glyph before each row's date label", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const programRow = getByTestId(
      "history-row-program-2026-10-07T08:00:00-0",
    );
    expect(within(programRow).UNSAFE_getByType(Calendar)).toBeTruthy();
    expect(within(programRow).getByText("Today")).toBeTruthy();

    const quickRow = getByTestId("history-row-quick-qs-1-1");
    expect(within(quickRow).UNSAFE_getByType(Calendar)).toBeTruthy();
    expect(within(quickRow).getByText("Yesterday")).toBeTruthy();
  });

  it("filters, row tap and pull to refresh still work (NP-112 unaffected)", async () => {
    const { getByTestId, getByText } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    fireEvent.press(getByTestId("history-filter-program"));
    expect(getByText("Circuit & Superset Shred — 4 Rounds Full Body")).toBeTruthy();

    fireEvent.press(getByTestId("history-filter-all"));
    const before = mockApiFetch.mock.calls.filter((c) =>
      String(c[0]).startsWith("/api/workouts/logs"),
    ).length;
    const list = getByTestId("history-list");
    list.props.refreshControl.props.onRefresh();
    await waitFor(() => {
      const after = mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/workouts/logs"),
      ).length;
      expect(after).toBeGreaterThan(before);
    });
  });
});
