/* eslint-disable import/first */
// NP-358 — Spacing/type: Sessions Hub & Session Builder - dashed empty state
// card, inline session builder presentation, input labels & search icon
// placement.
//
// `expo/app/(app)/(tabs)/programming/sessions.tsx` against the web's
// `webapp/app/dashboard/workout/hub/HubClient.tsx`:
//   1. the Sessions hub's empty-state card keeps its dashed border but drops
//      the opaque `bg-muted` fill — the web's version is a dashed OUTLINE
//      over the page background, not a filled tile.
//
// `expo/components/workout/SessionBuilder.tsx` against the web's
// `webapp/components/SessionBuilder.tsx`:
//   2. the 'Session name' and 'Add an exercise' fields drop their redundant
//      visible labels (the web has none above either field) while keeping
//      an accessible name via `accessibilityLabel`;
//   3. the search magnifier moves INSIDE the exercise-search field, on the
//      left (`leftIcon`), instead of floating beside it as a second
//      sibling element;
//   4. 'Start session' keeps its emerald/green `success` token background,
//      12pt corner radius and 12pt vertical padding (rounded-xl / py-3 /
//      bg-green-600 parity).

import { act, render, waitFor, within } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { Search } from "lucide-react-native";

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

import { apiFetch } from "@become/api-client";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
import { SessionBuilder } from "../components/workout/SessionBuilder";
import { lightTokens } from "@/lib/theme/tokens";
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
    if (String(path).startsWith("/api/exercises/search")) {
      return { exercises: [] };
    }
    if (path === "/api/exercises/custom") return { exercises: [] };
    throw new Error(`unexpected GET ${path}`);
  });
}

function setSystemScheme(mode: "light" | "dark"): void {
  act(() => {
    colorScheme.set(mode);
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockReset();
  setSystemScheme("light");
});

describe("NP-358-1: Sessions hub empty state is a dashed outline, not a filled card", () => {
  test("the empty-state card has a dashed border and NO opaque fill behind it", async () => {
    installHistory([]);
    const screen = render(<SessionsHubRoute />);
    await waitFor(() => expect(screen.getByTestId("sessions-hub-empty")).toBeTruthy());

    const card = screen.getByTestId("sessions-hub-empty");
    const style = [card.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.borderStyle).toBe("dashed");
    expect(style.borderWidth).toBe(1);
    // The old `backgroundColor: colors.muted` opaque tile is gone — the web
    // reference is `border-dashed border-zinc-300` with no fill class at
    // all, just the page background behind it.
    expect(style.backgroundColor).toBeUndefined();
  });
});

describe("NP-358-2/3: Session name and search fields drop their visible labels; the magnifier moves inside the search field", () => {
  test("'Session name' is not rendered as a visible label above the title field", () => {
    const { queryByText, getByTestId } = render(<SessionBuilder testID="session-builder" />);
    expect(queryByText("Session name")).toBeNull();
    // The accessible name still exists for assistive tech.
    const title = getByTestId("session-builder-title");
    expect(title.props.accessibilityLabel).toBe("Session name");
  });

  test("'Add an exercise' is not rendered as a visible label above the search field", () => {
    const { queryByText, getByTestId } = render(<SessionBuilder testID="session-builder" />);
    expect(queryByText("Add an exercise")).toBeNull();
    const search = getByTestId("session-builder-search");
    expect(search.props.accessibilityLabel).toBe("Add an exercise");
  });

  test("the magnifier renders INSIDE the search field's container, not as a separate sibling element", () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    const searchContainer = getByTestId("session-builder-search-container");
    // The icon is a descendant of the Input's own container (leftIcon slot),
    // matching the web's `absolute left-3` icon inset inside the field —
    // not a `View` floating beside the Input as a second flex child.
    expect(within(searchContainer).UNSAFE_getByType(Search)).toBeTruthy();
  });
});

describe("NP-358-4: 'Start session' keeps its emerald/green token, 12pt radius and 12pt vertical padding", () => {
  test("background is the success token (green-600/green-400), radius is 12, vertical padding is 12", async () => {
    const { getByTestId } = render(<SessionBuilder testID="session-builder" />);
    const startButton = getByTestId("session-builder-start");
    const style = [startButton.props.style].flat(Infinity).reduce((a, s) => ({ ...a, ...s }), {});
    expect(style.backgroundColor).toBe(`rgb(${lightTokens.success})`);
    expect(style.borderRadius).toBe(12);
    expect(style.paddingVertical).toBe(12);
  });
});
