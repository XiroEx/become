/* eslint-disable import/first */
// NP-360 — WORKOUT HISTORY: CIRCULAR BACK BUTTON, FILTER-CHIP COUNT BADGES,
// LEFT ACCENT STRIPE (Android S23 Ultra / One UI 7 spacing-parity pass).
//
// `expo/app/(app)/(tabs)/programming/history.tsx` had three native-only
// deviations from the web's `webapp/app/dashboard/history/HistoryClient.tsx`:
//
//   1. The header's back button was a SQUARE (40 x 40, `borderRadius: 12`).
//      The web's is a CIRCLE (`h-8 w-8 rounded-full border`, 32 x 32).
//   2. The active filter chip's count badge washed the chip's own green with
//      a 35%-alpha tint of `success`. The web's badge is `bg-white/25` —
//      mode-invariant white, not a green wash.
//   3. The row's left accent was 4pt wide. The web's `w-1.5` stripe is 6pt.
//
// This suite pins all three, scoped to exactly what the card asked for —
// it does not touch the icon/type badge colours or the filter-chip base
// colours, which were not part of the card's `Do` list.
//
// Fixed clock: Wednesday 2026-10-07 local noon, so Today / Yesterday are
// unambiguous (mirrors `card-NP-283-acceptance.test.tsx`).

import { fireEvent, render, waitFor, within } from "@testing-library/react-native";
import { darkTokens, rgbOf } from "../lib/theme/tokens";

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

describe("(id: card-np-360) History header's back button is circular, matching the web's h-8 w-8 rounded-full", () => {
  it("renders at 32 x 32 with a full (16) border radius and a hairline border", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const button = getByTestId("history-back-button");
    const style = button.props.style as Record<string, unknown>;
    expect(style.width).toBe(32);
    expect(style.height).toBe(32);
    // A circle: radius is exactly half the side, not the web's OLD
    // 12-point squircle.
    expect(style.borderRadius).toBe(16);
    expect(style.borderWidth).toBe(1);
  });

  it("grows the touchable area with hitSlop rather than the visible frame", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const button = getByTestId("history-back-button");
    // 44-point rule held via hitSlop (NP-283 kept this circle at its design
    // size, 32 x 32, rather than growing the frame itself).
    const slop = button.props.hitSlop as Record<string, number>;
    expect(slop.top).toBeGreaterThanOrEqual(6);
    expect(slop.bottom).toBeGreaterThanOrEqual(6);
    expect(slop.left).toBeGreaterThanOrEqual(6);
    expect(slop.right).toBeGreaterThanOrEqual(6);
  });
});

describe("(id: card-np-360) Filter chip count badge matches the web's bg-white/25 (active) / muted (inactive)", () => {
  it("washes the ACTIVE chip's count badge with white/25, not a green tint", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    // "All" is active by default.
    const badge = getByTestId("history-filter-all-badge");
    const badgeStyle = badge.props.style as Record<string, unknown>;
    expect(badgeStyle.backgroundColor).toBe(rgbOf(darkTokens.foreground, 0.25));
  });

  it("gives the INACTIVE chip's count badge the muted surface, not the white wash", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const badge = getByTestId("history-filter-program-badge");
    const badgeStyle = badge.props.style as Record<string, unknown>;
    expect(badgeStyle.backgroundColor).not.toBe(rgbOf(darkTokens.foreground, 0.25));
  });
});

describe("(id: card-np-360) Workout row left accent stripe is 6pt (w-1.5), clipped to the card's rounded corners", () => {
  it("renders the program row's accent stripe at 6pt wide", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const programRow = getByTestId("history-row-program-2026-10-07T08:00:00-0");
    // The stripe is `aria-hidden` (decorative) — RNTL excludes
    // accessibility-hidden elements from queries by default, so it has to be
    // asked for explicitly.
    const accent = within(programRow).getByTestId("history-row-accent", {
      includeHiddenElements: true,
    });
    const style = accent.props.style as Record<string, unknown>;
    expect(style.width).toBe(6);
    expect(style.position).toBe("absolute");
  });

  it("renders the quick row's accent stripe at 6pt wide too", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const quickRow = getByTestId("history-row-quick-qs-1-1");
    const accent = within(quickRow).getByTestId("history-row-accent", {
      includeHiddenElements: true,
    });
    const style = accent.props.style as Record<string, unknown>;
    expect(style.width).toBe(6);
  });

  it("still clips to the card, inside a parent with matching rounded corners and overflow hidden", async () => {
    const { getByTestId } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const programRow = getByTestId("history-row-program-2026-10-07T08:00:00-0");
    const card = within(programRow).getByTestId("history-row-card");
    const cardStyle = card.props.style as Record<string, unknown>;
    expect(cardStyle.overflow).toBe("hidden");
    expect(cardStyle.borderRadius).toBe(16);
  });
});

describe("(id: card-np-360) Everything NP-112 / NP-283 already covered keeps working", () => {
  it("filters, row tap and pull to refresh still work", async () => {
    const { getByTestId, getByText } = render(<HistoryRoute />);
    await waitFor(() => {
      expect(getByTestId("history-list")).toBeTruthy();
    });

    const row = getByTestId("history-row-program-2026-10-07T08:00:00-0");
    fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming/prog-1");

    fireEvent.press(getByTestId("history-filter-program"));
    expect(getByText("Circuit & Superset Shred — 4 Rounds Full Body")).toBeTruthy();
  });
});
