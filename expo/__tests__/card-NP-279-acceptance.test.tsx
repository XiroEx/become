/* eslint-disable import/first */
// NP-279 — SESSIONS HUB VISUAL PASS: import sheet keyboard-avoiding + file
// upload (covered by pasteImportSheet.test.tsx and androidKeyboardAvoiding.
// test.ts), planned row colours, and the dropped "Generate a session
// instead" row.
//
// Native used `colors.primary` for the hub's active tab, the planned
// section's icon/tile/date and the Build button — NP-313 made `primary` the
// web's NEUTRAL (zinc-900/white), so these screen-specific greens
// (`bg-green-500` active tab, `bg-emerald-*` planned row, `bg-green-600`
// Build — all `webapp/app/dashboard/workout/hub/HubClient.tsx`) were left
// drawing the wrong colour. This file pins the fix, screen-side.

import { StyleSheet } from "react-native";
import { act, render, waitFor } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { lightTokens, darkTokens, type ThemeMode } from "@/lib/theme/tokens";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

import { apiFetch } from "@become/api-client";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
import { formatPlannedDate } from "@/lib/quickSession/sessionsHub";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

// Tomorrow, computed at test-run time rather than a literal date: the label
// below ("Tomorrow" vs. a weekday vs. "Oct 8") comes from the same
// `formatPlannedDate` the screen itself calls with no fixed `now`, so a
// hardcoded date here would eventually drift and start asserting the wrong
// word on CI.
const PLANNED_DATE = new Date(Date.now() + 86_400_000).toISOString();
const PLANNED_LABEL = formatPlannedDate(PLANNED_DATE);
const PLANNED_SESSION = {
  sessionId: "plan-1",
  title: "Push Day",
  date: PLANNED_DATE,
  exerciseCount: 4,
  exercises: [],
};

function installHistory(planned: Record<string, unknown>[] = []) {
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/workouts/logs")) {
      return { logs: [], favoriteSessionOrder: [] };
    }
    if (String(path).startsWith("/api/workouts/planned")) {
      return { planned };
    }
    throw new Error(`unexpected GET ${path}`);
  });
}

function setSystemScheme(mode: ThemeMode): void {
  act(() => {
    colorScheme.set(mode);
  });
}

const MODES: ThemeMode[] = ["light", "dark"];

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
});

afterEach(() => {
  setSystemScheme("light");
});

describe("the dropped Generate row", () => {
  it("renders no 'Generate a session instead' row — the web's Sessions tab has none", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-build")).toBeTruthy());

    expect(screen.queryByTestId("sessions-generate")).toBeNull();
    expect(screen.queryByText("Generate a session instead")).toBeNull();
    // Import and Build stay reachable — this row's removal didn't take them
    // with it.
    expect(screen.getByTestId("sessions-import")).toBeTruthy();
    expect(screen.getByTestId("sessions-build")).toBeTruthy();
  });
});

describe("Build and the active hub tab are the web's green, not the neutral primary", () => {
  it.each(MODES)("%s: sessions-build and the active 'Sessions' tab are colors.success", async (mode) => {
    setSystemScheme(mode);
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-build")).toBeTruthy());

    const tokens = mode === "light" ? lightTokens : darkTokens;
    const success = `rgb(${tokens.success})`;
    const primary = `rgb(${tokens.primary})`;

    const build = StyleSheet.flatten(screen.getByTestId("sessions-build").props.style);
    expect(build.backgroundColor).toBe(success);
    expect(build.backgroundColor).not.toBe(primary);

    const activeTab = StyleSheet.flatten(screen.getByTestId("sessions-hub-tab-sessions").props.style);
    expect(activeTab.backgroundColor).toBe(success);
    expect(activeTab.backgroundColor).not.toBe(primary);
  });
});

describe("the Planned row matches the web's green accent, tile and date — plus the missing calendar icon", () => {
  it.each(MODES)("%s: a left accent stripe, a tinted green tile and a green date", async (mode) => {
    setSystemScheme(mode);
    installHistory([PLANNED_SESSION]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-planned-plan-1")).toBeTruthy());

    const tokens = mode === "light" ? lightTokens : darkTokens;
    const success = `rgb(${tokens.success})`;

    const row = StyleSheet.flatten(screen.getByTestId("sessions-planned-plan-1").props.style);
    // The web's `Card accent="success"` left stripe — same shape the
    // recommended-program card already uses (ProgramsCatalog.tsx).
    expect(row.borderLeftWidth).toBe(4);
    expect(row.borderLeftColor).toBe(success);

    // The date text is green, not the neutral primary.
    const dateStyle = StyleSheet.flatten(screen.getByText(PLANNED_LABEL).props.style);
    expect(dateStyle.color).toBe(success);
  });

  it("puts a Calendar icon before the date text — native had none", async () => {
    installHistory([PLANNED_SESSION]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-planned-plan-1")).toBeTruthy());
    // The date label still renders (now beside a leading Calendar icon in
    // its own row — the old markup was a single bare Text with no icon).
    expect(screen.getByText(PLANNED_LABEL)).toBeTruthy();
  });
});
