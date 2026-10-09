import fs from "fs";
import path from "path";
import { StyleSheet } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Search } from "lucide-react-native";

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

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import SessionsHubRoute from "../app/(app)/(tabs)/programming/sessions";
import { SessionBuilder } from "../components/workout/SessionBuilder";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const SEARCH_RESULTS = [
  { slug: "bench-press", name: "Barbell Bench Press", trackingType: "reps_weight", equipment: ["barbell"] },
  { slug: "pull-up", name: "Pull Up", trackingType: "reps_only" },
];

describe("Card NP-358 Acceptance Tests: Sessions Hub & Session Builder spacing, typography, and styling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockReset();
  });

  describe("1. Sessions Hub Empty State", () => {
    it("styles empty state container with dashed border, 32px padding, and without opaque card fill", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        if (String(fetchPath).startsWith("/api/workouts/logs")) {
          return { logs: [], favoriteSessionOrder: [] };
        }
        if (String(fetchPath).startsWith("/api/workouts/planned")) {
          return { planned: [] };
        }
        return {};
      });

      const screen = render(<SessionsHubRoute />);
      await waitFor(() => expect(screen.getByTestId("sessions-hub-empty")).toBeTruthy());

      const emptyContainer = screen.getByTestId("sessions-hub-empty");
      const style = StyleSheet.flatten(emptyContainer.props.style);

      // Dashed border
      expect(style.borderStyle).toBe("dashed");
      expect(style.borderWidth).toBe(1);
      // Rounded-2xl (16px)
      expect(style.borderRadius).toBe(16);
      // Padding 32px (p-8)
      expect(style.padding).toBe(32);
      // No opaque card fill
      expect(style.backgroundColor).toBeUndefined();

      // Title and subtitle typography
      const title = screen.getByText("No sessions yet");
      expect(title.props.className).toContain("text-sm");
      expect(title.props.className).toContain("font-semibold");

      const subtitle = screen.getByText("Tap Build to create your first session.");
      expect(subtitle.props.className).toContain("text-xs");
    });
  });

  describe("2. Session Builder Inputs & Search Icon Placement", () => {
    it("removes redundant text labels above Session name and Add an exercise", () => {
      mockApiFetch.mockImplementation(async () => ({ exercises: [], results: [] }));
      const { queryByTestId, getByTestId } = render(<SessionBuilder testID="session-builder" />);

      // Neither input should render a separate label element above the field
      expect(queryByTestId("session-builder-title-label")).toBeNull();
      expect(queryByTestId("session-builder-search-label")).toBeNull();

      // Both inputs retain accessibility labels
      const titleInput = getByTestId("session-builder-title");
      expect(titleInput.props.accessibilityLabel).toBe("Session name");

      const searchInput = getByTestId("session-builder-search");
      expect(searchInput.props.accessibilityLabel).toBe("Add an exercise");
    });

    it("renders search magnifier icon inside the left of the exercise input field via leftIcon", () => {
      mockApiFetch.mockImplementation(async () => ({ exercises: [], results: [] }));
      const { getByTestId, UNSAFE_getByType } = render(<SessionBuilder testID="session-builder" />);

      // Search icon is present within component tree
      expect(UNSAFE_getByType(Search)).toBeTruthy();

      // Search input has leftIcon applied (which applies pl-10 for left inset icon)
      const searchInput = getByTestId("session-builder-search");
      expect(searchInput.props.className).toContain("pl-10");
    });
  });

  describe("3. Session Builder Start Session Button", () => {
    it("matches height (py-3), corner radius (rounded-xl / 12), and emerald background tokens", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        const url = String(fetchPath);
        if (url.startsWith("/api/exercises/search")) {
          return { results: SEARCH_RESULTS };
        }
        if (url.startsWith("/api/exercises/custom")) {
          return { exercises: [] };
        }
        if (url.startsWith("/api/generate/session/complete")) {
          return { suggestions: [] };
        }
        return {};
      });

      const { getByTestId, getByText } = render(<SessionBuilder testID="session-builder" />);
      const startBtn = getByTestId("session-builder-start");
      const btnStyle = StyleSheet.flatten(startBtn.props.style);

      // Corner radius: rounded-xl / 12
      expect(btnStyle.borderRadius).toBe(12);
      expect(startBtn.props.className).toContain("rounded-xl");

      // Padding / height: py-3 / paddingVertical 12
      expect(btnStyle.paddingVertical).toBe(12);
      expect(startBtn.props.className).toContain("py-3");

      // Emerald background tokens
      expect(startBtn.props.className).toContain("bg-emerald-600");
      expect(startBtn.props.className).toContain("active:bg-emerald-700");

      // Button label typography
      const startLabel = getByText("Start session");
      expect(startLabel.props.className).toContain("text-white");
      expect(startLabel.props.className).toContain("text-sm");
      expect(startLabel.props.className).toContain("font-semibold");
    });

    it("renders count badge with white text when exercises are chosen", async () => {
      mockApiFetch.mockImplementation(async (fetchPath: string) => {
        const url = String(fetchPath);
        if (url.startsWith("/api/exercises/search")) {
          return { results: SEARCH_RESULTS };
        }
        if (url.startsWith("/api/exercises/custom")) {
          return { exercises: [] };
        }
        if (url.startsWith("/api/generate/session/complete")) {
          return { suggestions: [] };
        }
        return {};
      });

      const { getByTestId, findByTestId } = render(<SessionBuilder testID="session-builder" />);
      const searchInput = getByTestId("session-builder-search");
      fireEvent.changeText(searchInput, "bench");

      const result = await findByTestId("session-builder-result-bench-press");
      fireEvent.press(result);

      const badge = await findByTestId("session-builder-start-badge");
      expect(badge).toBeTruthy();
      expect(badge.props.className).toContain("bg-white/20");
    });
  });

  describe("4. Source Code Parity Audit", () => {
    it("sessions.tsx empty state container uses dashed border with no opaque fill and 32px padding", () => {
      const src = readExpo("app/(app)/(tabs)/programming/sessions.tsx");
      expect(src).toContain('borderStyle: "dashed"');
      expect(src).toContain("padding: 32");
      expect(src).not.toContain("backgroundColor: colors.muted");
    });

    it("SessionBuilder.tsx places Search inside leftIcon and uses emerald button classes", () => {
      const src = readExpo("components/workout/SessionBuilder.tsx");
      expect(src).toContain('leftIcon={<Search size={18} color={colors["muted-foreground"]} />}');
      expect(src).toContain('className="flex-row items-center justify-center gap-2 rounded-xl bg-emerald-600 active:bg-emerald-700 py-3"');
      expect(src).not.toContain('label="Session name"');
      expect(src).not.toContain('label="Add an exercise"');
    });
  });
});
